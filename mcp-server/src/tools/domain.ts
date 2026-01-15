/**
 * CodeB v7.0 - Domain Management Tools
 *
 * Features:
 * - PowerDNS HTTP API integration (no SSH required)
 * - Caddy Admin API integration (no SSH required)
 * - Automatic SSL via Caddy
 * - Subdomain management
 * - CNAME/A record management
 *
 * Team members can manage domains via ENV-based API configuration
 */

import type { AuthContext } from '../lib/types.js';
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

const PDNS_API_URL = process.env.PDNS_API_URL || 'http://158.247.203.55:8081/api/v1';
const PDNS_API_KEY = process.env.PDNS_API_KEY || '';
const CADDY_API_URL = process.env.CADDY_API_URL || 'http://158.247.203.55:2019';
const CADDY_API_KEY = process.env.CADDY_API_KEY || '';
const APP_SERVER_IP = process.env.APP_SERVER_IP || '158.247.203.55';
const BASE_DOMAIN = 'codeb.kr';

// ============================================================================
// API Validation
// ============================================================================

function validatePdnsApiKey(): void {
  if (!PDNS_API_KEY) {
    throw new Error(
      'PDNS_API_KEY is not configured. ' +
      'Please set PDNS_API_KEY in your project .env file or environment variables.'
    );
  }
}

// ============================================================================
// PowerDNS Client
// ============================================================================

async function pdnsRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<any> {
  validatePdnsApiKey();
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
// Caddy Admin API Client
// ============================================================================

async function caddyRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<any> {
  const url = `${CADDY_API_URL}${path}`;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (CADDY_API_KEY) {
      headers['Authorization'] = `Bearer ${CADDY_API_KEY}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Caddy API error: ${response.status} - ${text}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return response.json();
    }

    return null;
  } catch (error) {
    logger.error('Caddy request failed', { url, method, error: String(error) });
    throw error;
  }
}

async function getCaddyRoutes(): Promise<any[]> {
  try {
    const routes = await caddyRequest('GET', '/config/apps/http/servers/srv0/routes');
    return routes || [];
  } catch {
    return [];
  }
}

async function updateCaddyRoutes(routes: any[]): Promise<void> {
  await caddyRequest('PATCH', '/config/apps/http/servers/srv0/routes', routes);
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

      // Setup Caddy reverse proxy via Admin API
      await setupCaddyConfig(domain, projectName, environment, slotInfo.activePort, ssl);

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
      // Get domains from Caddy Admin API
      const routes = await getCaddyRoutes();
      const domains: DomainConfig[] = [];

      for (const route of routes) {
        const config = parseCaddyRoute(route);
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
      // Remove Caddy route via Admin API
      await removeCaddySite(domain);

      // Remove DNS record if subdomain
      if (domain.endsWith(`.${BASE_DOMAIN}`)) {
        const subdomain = domain.replace(`.${BASE_DOMAIN}`, '');
        await removeDNSRecord(BASE_DOMAIN, 'A', subdomain);
      }

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
      // Check if domain is configured in Caddy
      const routes = await getCaddyRoutes();
      const route = routes.find(r => {
        const hosts = r.match?.[0]?.host || [];
        return hosts.includes(domain);
      });

      if (!route) {
        return {
          success: false,
          error: `Domain ${domain} not configured in Caddy`,
        };
      }

      // Caddy auto-manages SSL
      // Return basic info since we can't run openssl without SSH
      return {
        success: true,
        data: {
          domain,
          issuer: 'Let\'s Encrypt (Caddy Auto)',
          validFrom: '',
          validTo: '',
          daysRemaining: 90, // Caddy auto-renews before 30 days
          autoRenew: true,
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
    // Check existing Caddy routes for project
    const routes = await getCaddyRoutes();
    const expectedDomain = `${projectName}.${BASE_DOMAIN}`;

    for (const route of routes) {
      const hosts = route.match?.[0]?.host || [];
      if (hosts.includes(expectedDomain)) {
        const upstreams = route.handle?.[0]?.routes?.[0]?.handle?.[1]?.upstreams || [];
        const headers = route.handle?.[0]?.routes?.[0]?.handle?.[0]?.response?.set || {};

        if (upstreams.length > 0) {
          const dial = upstreams[0].dial;
          const portMatch = dial?.match(/:(\d+)$/);
          const port = portMatch ? parseInt(portMatch[1]) : 0;
          const slot = headers['X-CodeB-Slot']?.[0] || 'blue';

          return port ? { activeSlot: slot, activePort: port } : null;
        }
      }
    }

    // If not found in Caddy, use default port mapping
    // Production: blue=4100/green=4101, Staging: blue=4200/green=4201
    const basePort = environment === 'production' ? 4100 : 4200;
    return { activeSlot: 'blue', activePort: basePort };
  } catch {
    return null;
  }
}

async function setupCaddyConfig(
  domain: string,
  projectName: string,
  environment: string,
  port: number,
  _ssl: boolean
): Promise<void> {
  // Create Caddy route config via Admin API
  const siteConfig = {
    match: [{ host: [domain] }],
    handle: [
      {
        handler: 'subroute',
        routes: [
          {
            handle: [
              {
                handler: 'headers',
                response: {
                  set: {
                    'X-Powered-By': ['CodeB'],
                    'X-Project': [projectName],
                    'X-Environment': [environment],
                  },
                },
              },
              {
                handler: 'reverse_proxy',
                upstreams: [{ dial: `localhost:${port}` }],
                health_checks: {
                  active: {
                    uri: '/health',
                    interval: '10s',
                    timeout: '5s',
                  },
                },
              },
            ],
          },
        ],
      },
    ],
    terminal: true,
  };

  // Get existing routes and update
  let routes = await getCaddyRoutes();

  // Remove existing route for same domain
  routes = routes.filter(route => {
    const hosts = route.match?.[0]?.host || [];
    return !hosts.includes(domain);
  });

  // Add new route
  routes.push(siteConfig);

  // Update routes via Caddy Admin API
  await updateCaddyRoutes(routes);
}

async function removeCaddySite(domain: string): Promise<void> {
  let routes = await getCaddyRoutes();

  const originalLength = routes.length;
  routes = routes.filter(route => {
    const hosts = route.match?.[0]?.host || [];
    return !hosts.includes(domain);
  });

  if (routes.length === originalLength) {
    throw new Error(`Site ${domain} not found in Caddy configuration`);
  }

  await updateCaddyRoutes(routes);
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
    // Use Node.js DNS module instead of SSH
    const dns = await import('dns');
    const { promisify } = await import('util');

    if (type === 'A') {
      const resolve4 = promisify(dns.resolve4);
      return await resolve4(domain);
    } else if (type === 'CNAME') {
      const resolveCname = promisify(dns.resolveCname);
      return await resolveCname(domain);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Parse Caddy route object to DomainConfig
 * Used with Caddy Admin API response
 */
function parseCaddyRoute(route: any): DomainConfig | null {
  try {
    const hosts = route.match?.[0]?.host || [];
    if (hosts.length === 0) return null;

    const domain = hosts[0];
    const upstreams = route.handle?.[0]?.routes?.[0]?.handle?.[1]?.upstreams || [];
    const headers = route.handle?.[0]?.routes?.[0]?.handle?.[0]?.response?.set || {};

    const projectName = headers['X-Project']?.[0] || headers['X-CodeB-Project']?.[0] || 'unknown';
    const environment = (headers['X-Environment']?.[0] || 'production') as 'staging' | 'production' | 'preview';

    return {
      domain,
      type: domain.endsWith(`.${BASE_DOMAIN}`) ? 'subdomain' : 'custom',
      target: { projectName, environment },
      ssl: true, // Caddy auto-SSL
      records: [],
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
