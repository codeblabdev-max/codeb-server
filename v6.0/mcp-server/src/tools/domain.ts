/**
 * CodeB v6.0 - Domain Management Tools
 *
 * Features:
 * - PowerDNS integration
 * - Automatic SSL via Caddy
 * - Subdomain management
 * - CNAME/A record management
 */

import type { AuthContext } from '../lib/types.js';
import { execCommand } from '../lib/ssh.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface DomainConfig {
  domain: string;
  type: 'custom' | 'subdomain';
  target: {
    projectName: string;
    environment: 'staging' | 'production' | 'preview';
  };
  ssl: boolean;
  records: DNSRecord[];
  status: 'pending' | 'active' | 'error';
  createdAt: string;
  verifiedAt?: string;
  error?: string;
}

export interface DNSRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT';
  name: string;
  content: string;
  ttl: number;
}

export interface DomainSetupInput {
  domain: string;
  projectName: string;
  environment?: 'staging' | 'production' | 'preview';
  ssl?: boolean;
}

export interface DomainVerifyInput {
  domain: string;
}

// ============================================================================
// Configuration
// ============================================================================

const PDNS_API_URL = process.env.PDNS_API_URL || 'http://localhost:8081/api/v1';
const PDNS_API_KEY = process.env.PDNS_API_KEY || '';
const APP_SERVER_IP = '158.247.203.55';
const BASE_DOMAIN = 'codeb.kr';

// ============================================================================
// PowerDNS Client
// ============================================================================

async function pdnsRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<any> {
  const url = `${PDNS_API_URL}${path}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'X-API-Key': PDNS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`PowerDNS API error: ${response.status} - ${text}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  } catch (error) {
    logger.error('PowerDNS request failed', { url, method, error: String(error) });
    throw error;
  }
}

// ============================================================================
// Domain Setup Tool
// ============================================================================

export const domainSetupTool = {
  name: 'domain_setup',
  description: 'Setup a custom domain for a project',

  async execute(
    input: DomainSetupInput,
    auth: AuthContext
  ): Promise<{ success: boolean; data?: DomainConfig; error?: string }> {
    const { domain, projectName, environment = 'production', ssl = true } = input;

    logger.info('Setting up domain', { domain, projectName, environment });

    try {
      // Validate domain format
      if (!isValidDomain(domain)) {
        return { success: false, error: 'Invalid domain format' };
      }

      // Check if it's a subdomain of codeb.kr or custom domain
      const isSubdomain = domain.endsWith(`.${BASE_DOMAIN}`);
      const domainType = isSubdomain ? 'subdomain' : 'custom';

      // Get target port from slot registry
      const slotInfo = await getSlotInfo(projectName, environment);
      if (!slotInfo) {
        return { success: false, error: `Project ${projectName} not found or not deployed` };
      }

      const records: DNSRecord[] = [];

      if (isSubdomain) {
        // Add A record for subdomain
        const subdomain = domain.replace(`.${BASE_DOMAIN}`, '');
        await addDNSRecord(BASE_DOMAIN, 'A', subdomain, APP_SERVER_IP);
        records.push({
          type: 'A',
          name: subdomain,
          content: APP_SERVER_IP,
          ttl: 300,
        });
      } else {
        // For custom domain, provide instructions
        records.push({
          type: 'CNAME',
          name: '@',
          content: `${projectName}.${BASE_DOMAIN}`,
          ttl: 300,
        });
      }

      // Setup Caddy reverse proxy
      await setupCaddyConfig(domain, projectName, environment, slotInfo.activePort, ssl);

      // Reload Caddy
      await execCommand('app', 'systemctl reload caddy');

      const config: DomainConfig = {
        domain,
        type: domainType,
        target: { projectName, environment },
        ssl,
        records,
        status: isSubdomain ? 'active' : 'pending',
        createdAt: new Date().toISOString(),
        verifiedAt: isSubdomain ? new Date().toISOString() : undefined,
      };

      logger.info('Domain setup completed', { domain, status: config.status });

      return {
        success: true,
        data: config,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Domain setup failed', { domain, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  },
};

// ============================================================================
// Domain Verify Tool
// ============================================================================

export const domainVerifyTool = {
  name: 'domain_verify',
  description: 'Verify DNS configuration for a custom domain',

  async execute(
    input: DomainVerifyInput,
    auth: AuthContext
  ): Promise<{
    success: boolean;
    verified: boolean;
    checks: { type: string; expected: string; actual: string; passed: boolean }[];
    error?: string;
  }> {
    const { domain } = input;

    try {
      const checks: { type: string; expected: string; actual: string; passed: boolean }[] = [];

      // Check A record
      const aRecords = await resolveDNS(domain, 'A');
      checks.push({
        type: 'A',
        expected: APP_SERVER_IP,
        actual: aRecords.join(', ') || 'none',
        passed: aRecords.includes(APP_SERVER_IP),
      });

      // Check CNAME if no A record
      if (!aRecords.includes(APP_SERVER_IP)) {
        const cnameRecords = await resolveDNS(domain, 'CNAME');
        const expectedCname = `${domain.split('.')[0]}.${BASE_DOMAIN}`;
        checks.push({
          type: 'CNAME',
          expected: `*.${BASE_DOMAIN}`,
          actual: cnameRecords.join(', ') || 'none',
          passed: cnameRecords.some(r => r.endsWith(BASE_DOMAIN)),
        });
      }

      const verified = checks.some(c => c.passed);

      return {
        success: true,
        verified,
        checks,
      };
    } catch (error) {
      return {
        success: false,
        verified: false,
        checks: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ============================================================================
// Domain List Tool
// ============================================================================

export const domainListTool = {
  name: 'domain_list',
  description: 'List all configured domains',

  async execute(
    input: { projectName?: string },
    auth: AuthContext
  ): Promise<{ success: boolean; domains: DomainConfig[]; error?: string }> {
    try {
      // Get domains from Caddy config
      const result = await execCommand(
        'app',
        'ls -1 /etc/caddy/sites/*.caddy 2>/dev/null || echo ""'
      );

      const domains: DomainConfig[] = [];
      const files = result.stdout.split('\n').filter(f => f.trim());

      for (const file of files) {
        const config = await parseCaddyConfig(file);
        if (config && (!input.projectName || config.target.projectName === input.projectName)) {
          domains.push(config);
        }
      }

      return { success: true, domains };
    } catch (error) {
      return {
        success: false,
        domains: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ============================================================================
// Domain Delete Tool
// ============================================================================

export const domainDeleteTool = {
  name: 'domain_delete',
  description: 'Delete a domain configuration',

  async execute(
    input: { domain: string },
    auth: AuthContext
  ): Promise<{ success: boolean; error?: string }> {
    const { domain } = input;

    try {
      // Remove Caddy config
      const safeDomain = domain.replace(/[^a-zA-Z0-9.-]/g, '');
      await execCommand('app', `rm -f /etc/caddy/sites/${safeDomain}.caddy`);

      // Remove DNS record if subdomain
      if (domain.endsWith(`.${BASE_DOMAIN}`)) {
        const subdomain = domain.replace(`.${BASE_DOMAIN}`, '');
        await removeDNSRecord(BASE_DOMAIN, 'A', subdomain);
      }

      // Reload Caddy
      await execCommand('app', 'systemctl reload caddy');

      logger.info('Domain deleted', { domain });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ============================================================================
// SSL Certificate Tool
// ============================================================================

export const sslStatusTool = {
  name: 'ssl_status',
  description: 'Check SSL certificate status for a domain',

  async execute(
    input: { domain: string },
    auth: AuthContext
  ): Promise<{
    success: boolean;
    data?: {
      domain: string;
      issuer: string;
      validFrom: string;
      validTo: string;
      daysRemaining: number;
      autoRenew: boolean;
    };
    error?: string;
  }> {
    const { domain } = input;

    try {
      // Caddy auto-manages SSL, check certificate via openssl
      const result = await execCommand(
        'app',
        `echo | openssl s_client -connect ${domain}:443 -servername ${domain} 2>/dev/null | openssl x509 -noout -dates -issuer 2>/dev/null || echo "no-cert"`
      );

      if (result.stdout.includes('no-cert')) {
        return {
          success: true,
          data: {
            domain,
            issuer: 'Pending',
            validFrom: '',
            validTo: '',
            daysRemaining: 0,
            autoRenew: true,
          },
        };
      }

      const lines = result.stdout.split('\n');
      let issuer = '';
      let validFrom = '';
      let validTo = '';

      for (const line of lines) {
        if (line.startsWith('issuer=')) {
          issuer = line.replace('issuer=', '').trim();
        } else if (line.startsWith('notBefore=')) {
          validFrom = line.replace('notBefore=', '').trim();
        } else if (line.startsWith('notAfter=')) {
          validTo = line.replace('notAfter=', '').trim();
        }
      }

      const expiryDate = new Date(validTo);
      const daysRemaining = Math.ceil(
        (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      return {
        success: true,
        data: {
          domain,
          issuer,
          validFrom,
          validTo,
          daysRemaining,
          autoRenew: true, // Caddy auto-renews
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

function isValidDomain(domain: string): boolean {
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
}

async function getSlotInfo(
  projectName: string,
  environment: string
): Promise<{ activeSlot: string; activePort: number } | null> {
  try {
    const result = await execCommand(
      'app',
      `cat /opt/codeb/registry/slots/${projectName}-${environment}.json 2>/dev/null || echo "{}"`
    );
    const data = JSON.parse(result.stdout);
    if (!data.activeSlot) return null;

    const activeSlot = data.activeSlot;
    const activePort = data[activeSlot]?.port;

    return activePort ? { activeSlot, activePort } : null;
  } catch {
    return null;
  }
}

async function setupCaddyConfig(
  domain: string,
  projectName: string,
  environment: string,
  port: number,
  ssl: boolean
): Promise<void> {
  const safeDomain = domain.replace(/[^a-zA-Z0-9.-]/g, '');

  const config = ssl
    ? `
${domain} {
    reverse_proxy localhost:${port}

    encode gzip

    header {
        X-Powered-By "CodeB"
        X-Project "${projectName}"
        X-Environment "${environment}"
    }

    log {
        output file /var/log/caddy/${safeDomain}.log
        format json
    }
}
`
    : `
http://${domain} {
    reverse_proxy localhost:${port}

    encode gzip

    header {
        X-Powered-By "CodeB"
        X-Project "${projectName}"
        X-Environment "${environment}"
    }
}
`;

  // Write config to server
  const escapedConfig = config.replace(/'/g, "'\\''");
  await execCommand(
    'app',
    `echo '${escapedConfig}' > /etc/caddy/sites/${safeDomain}.caddy`
  );
}

async function addDNSRecord(
  zone: string,
  type: string,
  name: string,
  content: string
): Promise<void> {
  const rrsets = [
    {
      name: `${name}.${zone}.`,
      type,
      ttl: 300,
      changetype: 'REPLACE',
      records: [{ content, disabled: false }],
    },
  ];

  await pdnsRequest('PATCH', `/servers/localhost/zones/${zone}.`, { rrsets });
}

async function removeDNSRecord(zone: string, type: string, name: string): Promise<void> {
  const rrsets = [
    {
      name: `${name}.${zone}.`,
      type,
      changetype: 'DELETE',
    },
  ];

  await pdnsRequest('PATCH', `/servers/localhost/zones/${zone}.`, { rrsets });
}

async function resolveDNS(domain: string, type: string): Promise<string[]> {
  try {
    const result = await execCommand(
      'app',
      `dig +short ${type} ${domain} @8.8.8.8 2>/dev/null || echo ""`
    );
    return result.stdout.split('\n').filter(r => r.trim());
  } catch {
    return [];
  }
}

async function parseCaddyConfig(filePath: string): Promise<DomainConfig | null> {
  try {
    const result = await execCommand('app', `cat ${filePath}`);
    const content = result.stdout;

    // Parse domain from first line
    const domainMatch = content.match(/^([a-zA-Z0-9.-]+)\s*{/m);
    if (!domainMatch) return null;

    const domain = domainMatch[1];

    // Parse reverse_proxy target
    const proxyMatch = content.match(/reverse_proxy\s+localhost:(\d+)/);
    const port = proxyMatch ? parseInt(proxyMatch[1]) : 0;

    // Parse project from header
    const projectMatch = content.match(/X-Project\s+"([^"]+)"/);
    const projectName = projectMatch ? projectMatch[1] : 'unknown';

    const envMatch = content.match(/X-Environment\s+"([^"]+)"/);
    const environment = (envMatch ? envMatch[1] : 'production') as 'staging' | 'production' | 'preview';

    return {
      domain,
      type: domain.endsWith(`.${BASE_DOMAIN}`) ? 'subdomain' : 'custom',
      target: { projectName, environment },
      ssl: !content.startsWith('http://'),
      records: [],
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
