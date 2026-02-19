/**
 * DomainService - Unified domain management
 *
 * Cloudflare DNS + Caddy config + SSL automation.
 * Migrated from PowerDNS to Cloudflare (2026-02-20).
 */

import type { DomainRepo, SlotRepo } from '@codeb/db';
import type { SSHClientWrapper } from '@codeb/ssh';
import type { Environment, SlotName, AuthContext } from '@codeb/shared';

interface LoggerLike {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  log(level: string, message: string, meta?: Record<string, unknown>): void;
}
import { DnsService } from './dns.service.js';
import { SslService } from './ssl.service.js';

const SUPPORTED_DOMAINS = ['codeb.kr', 'workb.net', 'wdot.kr', 'w-w-w.kr', 'vsvs.kr', 'workb.xyz', 'da-rak.kr', 'vsvs.co.kr', 'di-tto.com', 'staronpick.com'];
const BASE_DOMAIN = 'codeb.kr';
const APP_SERVER_IP = '158.247.203.55';

export interface DomainConfig {
  domain: string;
  type: 'custom' | 'subdomain';
  target: {
    projectName: string;
    environment: Environment;
  };
  ssl: boolean;
  records: Array<{ type: string; name: string; content: string; ttl: number }>;
  status: 'pending' | 'active' | 'error';
  createdAt: string;
  verifiedAt?: string;
  error?: string;
}

export interface DomainSetupInput {
  domain: string;
  projectName: string;
  environment?: Environment;
  ssl?: boolean;
}

export class DomainService {
  private readonly dns: DnsService;
  private readonly ssl: SslService;

  constructor(
    private readonly domainRepo: typeof DomainRepo,
    private readonly slotRepo: typeof SlotRepo,
    private readonly ssh: SSHClientWrapper,
    private readonly logger: LoggerLike,
    dnsConfig?: { apiToken?: string },
  ) {
    this.dns = new DnsService(logger, dnsConfig);
    this.ssl = new SslService(ssh, logger);
  }

  // ===========================================================================
  // Setup
  // ===========================================================================

  async setup(
    input: DomainSetupInput,
    auth: AuthContext,
  ): Promise<{ success: boolean; data?: DomainConfig; error?: string }> {
    const { domain, projectName, environment = 'production' } = input;

    this.logger.info('Setting up domain', { domain, projectName, environment });

    try {
      if (!this.isValidDomain(domain)) {
        return { success: false, error: 'Invalid domain format' };
      }

      const domainIsSubdomain = this.isSubdomain(domain);
      const domainType = domainIsSubdomain ? 'subdomain' : 'custom';

      // Get slot info
      const slotInfo = await this.getSlotInfo(projectName, environment);
      if (!slotInfo) {
        return { success: false, error: `Project ${projectName} not found or not deployed` };
      }

      const records: DomainConfig['records'] = [];

      if (domainIsSubdomain) {
        const baseDomain = this.getBaseDomain(domain);
        const subdomain = this.getSubdomainName(domain);

        if (!baseDomain || !subdomain) {
          return { success: false, error: `Invalid subdomain format: ${domain}` };
        }

        this.logger.info('Adding DNS record', { baseDomain, subdomain, ip: APP_SERVER_IP });
        await this.dns.createRecord(baseDomain, 'A', subdomain, APP_SERVER_IP);
        records.push({ type: 'A', name: subdomain, content: APP_SERVER_IP, ttl: 300 });
      } else {
        records.push({
          type: 'CNAME',
          name: '@',
          content: `${projectName}.${BASE_DOMAIN}`,
          ttl: 300,
        });
      }

      // Setup Caddy configuration
      const primaryDomain = this.getProjectDomain(projectName, environment);
      if (domain === primaryDomain) {
        await this.writePrimaryCaddyConfig(projectName, environment, domain, slotInfo, auth.teamId);
      } else {
        await this.addCustomDomainToCaddy(projectName, environment, domain, slotInfo, auth.teamId);
      }

      const config: DomainConfig = {
        domain,
        type: domainType,
        target: { projectName, environment },
        ssl: true,
        records,
        status: domainIsSubdomain ? 'active' : 'pending',
        createdAt: new Date().toISOString(),
        verifiedAt: domainIsSubdomain ? new Date().toISOString() : undefined,
      };

      // Save to DB
      try {
        await this.domainRepo.create({
          domain,
          projectName,
          environment,
          type: domainType,
          sslEnabled: true,
          createdBy: auth.teamId,
        });
        if (domainIsSubdomain) {
          await this.domainRepo.update(domain, { status: 'active' });
        }
      } catch (dbError) {
        this.logger.warn('Failed to save domain to DB', { domain, error: String(dbError) });
      }

      this.logger.info('Domain setup completed', { domain, status: config.status });
      return { success: true, data: config };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Domain setup failed', { domain, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  // ===========================================================================
  // List
  // ===========================================================================

  async list(
    input: { projectName?: string },
    _auth: AuthContext,
  ): Promise<{ success: boolean; domains: DomainConfig[]; error?: string }> {
    try {
      const domains: DomainConfig[] = [];

      // Try DB first
      try {
        let dbDomains;
        if (input.projectName) {
          dbDomains = await this.domainRepo.findByProject(input.projectName);
        } else {
          dbDomains = await this.domainRepo.listAll();
        }

        for (const d of dbDomains) {
          domains.push({
            domain: d.domain,
            type: d.type === 'custom' ? 'custom' : 'subdomain',
            target: {
              projectName: d.projectName || '',
              environment: (d.environment as Environment) || 'production',
            },
            ssl: d.sslEnabled,
            records: [],
            status: d.status as DomainConfig['status'],
            createdAt: d.createdAt,
            verifiedAt: d.dnsVerifiedAt ?? undefined,
          });
        }

        if (domains.length > 0) {
          return { success: true, domains };
        }
      } catch (dbError) {
        this.logger.warn('Failed to fetch domains from DB, falling back to Caddy files', {
          error: String(dbError),
        });
      }

      // Fallback to Caddy files
      const allDomains = await this.listCaddyDomains();

      for (const info of allDomains) {
        if (input.projectName && info.projectName !== input.projectName) continue;

        domains.push({
          domain: info.domain,
          type: info.isCustom ? 'custom' : 'subdomain',
          target: {
            projectName: info.projectName,
            environment: info.environment,
          },
          ssl: true,
          records: [],
          status: 'active',
          createdAt: info.createdAt,
        });
      }

      return { success: true, domains };
    } catch (error) {
      return {
        success: false,
        domains: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ===========================================================================
  // Delete
  // ===========================================================================

  async delete(
    input: { domain: string; projectName: string; environment?: Environment },
    auth: AuthContext,
  ): Promise<{ success: boolean; error?: string }> {
    const { domain, projectName, environment = 'production' } = input;

    try {
      const slotInfo = await this.getSlotInfo(projectName, environment);
      if (!slotInfo) {
        return { success: false, error: `Project ${projectName} not found` };
      }

      const primaryDomain = this.getProjectDomain(projectName, environment);
      if (domain === primaryDomain) {
        return {
          success: false,
          error: `Cannot delete primary domain ${primaryDomain}. Use project delete instead.`,
        };
      }

      // Remove from Caddy
      await this.removeCustomDomainFromCaddy(projectName, environment, domain, slotInfo, auth.teamId);

      // Remove DNS record if subdomain
      if (this.isSubdomain(domain)) {
        const baseDomain = this.getBaseDomain(domain);
        const subdomain = this.getSubdomainName(domain);

        if (baseDomain && subdomain) {
          try {
            await this.dns.deleteRecord(baseDomain, 'A', subdomain);
            this.logger.info('DNS record removed', { domain });
          } catch (error) {
            this.logger.warn('Failed to remove DNS record', { domain, error: String(error) });
          }
        }
      }

      // Delete from DB
      try {
        await this.domainRepo.delete(domain);
      } catch (dbError) {
        this.logger.warn('Failed to delete domain from DB', { domain, error: String(dbError) });
      }

      this.logger.info('Domain deleted', { domain, projectName });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ===========================================================================
  // Verify
  // ===========================================================================

  async verify(domain: string): Promise<{
    success: boolean;
    verified: boolean;
    checks: Array<{ type: string; expected: string; actual: string; passed: boolean }>;
    error?: string;
  }> {
    try {
      const checks: Array<{ type: string; expected: string; actual: string; passed: boolean }> = [];

      const aRecords = await this.dns.resolve(domain, 'A');
      checks.push({
        type: 'A',
        expected: APP_SERVER_IP,
        actual: aRecords.join(', ') || 'none',
        passed: aRecords.includes(APP_SERVER_IP),
      });

      if (!aRecords.includes(APP_SERVER_IP)) {
        const cnameRecords = await this.dns.resolve(domain, 'CNAME');
        checks.push({
          type: 'CNAME',
          expected: `*.${BASE_DOMAIN}`,
          actual: cnameRecords.join(', ') || 'none',
          passed: cnameRecords.some((r) => r.endsWith(BASE_DOMAIN)),
        });
      }

      const verified = checks.some((c) => c.passed);
      return { success: true, verified, checks };
    } catch (error) {
      return {
        success: false,
        verified: false,
        checks: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private isValidDomain(domain: string): boolean {
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(domain);
  }

  private isSubdomain(domain: string): boolean {
    return SUPPORTED_DOMAINS.some((baseDomain) => domain.endsWith(`.${baseDomain}`));
  }

  private getBaseDomain(domain: string): string | null {
    for (const baseDomain of SUPPORTED_DOMAINS) {
      if (domain.endsWith(`.${baseDomain}`)) return baseDomain;
    }
    return null;
  }

  private getSubdomainName(domain: string): string | null {
    const baseDomain = this.getBaseDomain(domain);
    if (!baseDomain) return null;
    return domain.replace(`.${baseDomain}`, '');
  }

  private getProjectDomain(projectName: string, environment: Environment): string {
    if (environment === 'production') return `${projectName}.${BASE_DOMAIN}`;
    return `${projectName}-${environment}.${BASE_DOMAIN}`;
  }

  private async getSlotInfo(
    projectName: string,
    environment: Environment,
  ): Promise<{
    activeSlot: SlotName;
    activePort: number;
    standbyPort: number;
    version: string;
  } | null> {
    try {
      const slots = await this.slotRepo.findByProject(projectName, environment);
      if (!slots) return null;

      const activeSlot = slots.activeSlot;
      const standbySlot: SlotName = activeSlot === 'blue' ? 'green' : 'blue';

      return {
        activeSlot,
        activePort: slots[activeSlot].port,
        standbyPort: slots[standbySlot].port,
        version: slots[activeSlot].version || 'unknown',
      };
    } catch {
      return null;
    }
  }

  private async writePrimaryCaddyConfig(
    projectName: string,
    environment: Environment,
    domain: string,
    slotInfo: { activePort: number; standbyPort: number; activeSlot: SlotName; version: string },
    teamId: string,
  ): Promise<void> {
    const caddyContent = this.generateCaddyConfig({
      projectName,
      environment,
      domain,
      activePort: slotInfo.activePort,
      standbyPort: slotInfo.standbyPort,
      activeSlot: slotInfo.activeSlot,
      version: slotInfo.version,
      teamId,
    });

    const caddyPath = `/etc/caddy/sites/${projectName}-${environment}.caddy`;
    await this.ssh.exec(`mkdir -p /etc/caddy/sites`);
    const base64 = Buffer.from(caddyContent).toString('base64');
    await this.ssh.exec(`echo "${base64}" | base64 -d > ${caddyPath}`);
    await this.ssh.exec('systemctl reload caddy');
  }

  private async addCustomDomainToCaddy(
    projectName: string,
    environment: Environment,
    customDomain: string,
    slotInfo: { activePort: number; standbyPort: number; activeSlot: SlotName; version: string },
    teamId: string,
  ): Promise<void> {
    // Read existing config to get custom domains
    const caddyPath = `/etc/caddy/sites/${projectName}-${environment}.caddy`;
    const existingDomains = await this.parseCustomDomainsFromCaddy(caddyPath, projectName, environment);

    const domain = this.getProjectDomain(projectName, environment);
    const caddyContent = this.generateCaddyConfig({
      projectName,
      environment,
      domain,
      activePort: slotInfo.activePort,
      standbyPort: slotInfo.standbyPort,
      activeSlot: slotInfo.activeSlot,
      version: slotInfo.version,
      teamId,
      customDomains: [...existingDomains, customDomain],
    });

    const base64 = Buffer.from(caddyContent).toString('base64');
    await this.ssh.exec(`echo "${base64}" | base64 -d > ${caddyPath}`);
    await this.ssh.exec('systemctl reload caddy');
  }

  private async removeCustomDomainFromCaddy(
    projectName: string,
    environment: Environment,
    customDomain: string,
    slotInfo: { activePort: number; standbyPort: number; activeSlot: SlotName; version: string },
    teamId: string,
  ): Promise<void> {
    const caddyPath = `/etc/caddy/sites/${projectName}-${environment}.caddy`;
    const existingDomains = await this.parseCustomDomainsFromCaddy(caddyPath, projectName, environment);
    const updatedDomains = existingDomains.filter((d) => d !== customDomain);

    const domain = this.getProjectDomain(projectName, environment);
    const caddyContent = this.generateCaddyConfig({
      projectName,
      environment,
      domain,
      activePort: slotInfo.activePort,
      standbyPort: slotInfo.standbyPort,
      activeSlot: slotInfo.activeSlot,
      version: slotInfo.version,
      teamId,
      customDomains: updatedDomains,
    });

    const base64 = Buffer.from(caddyContent).toString('base64');
    await this.ssh.exec(`echo "${base64}" | base64 -d > ${caddyPath}`);
    await this.ssh.exec('systemctl reload caddy');
  }

  private async parseCustomDomainsFromCaddy(
    caddyPath: string,
    projectName: string,
    environment: Environment,
  ): Promise<string[]> {
    try {
      const result = await this.ssh.exec(`cat ${caddyPath} 2>/dev/null || echo ""`);
      if (!result.stdout.trim()) return [];

      const lines = result.stdout.split('\n');
      for (const line of lines) {
        if (line.includes('{') && !line.startsWith('#')) {
          const domainPart = line.replace('{', '').trim();
          const domains = domainPart.split(',').map((d: string) => d.trim()).filter(Boolean);
          const primaryDomain = this.getProjectDomain(projectName, environment);
          return domains.filter((d: string) => d !== primaryDomain);
        }
      }
      return [];
    } catch {
      return [];
    }
  }

  private async listCaddyDomains(): Promise<Array<{
    domain: string;
    projectName: string;
    environment: Environment;
    isCustom: boolean;
    createdAt: string;
  }>> {
    const result = await this.ssh.exec(
      'ls -1 /etc/caddy/sites/*.caddy 2>/dev/null || echo ""',
    );
    const files = result.stdout.trim().split('\n').filter(Boolean);
    const domains: Array<{
      domain: string;
      projectName: string;
      environment: Environment;
      isCustom: boolean;
      createdAt: string;
    }> = [];

    for (const file of files) {
      try {
        const content = await this.ssh.exec(`cat ${file}`);
        const lines = content.stdout.split('\n');
        let projectName = '';
        let environment: Environment = 'production';
        let domain = '';

        for (const line of lines) {
          if (line.includes('# Project:')) projectName = line.split(':')[1]?.trim() || '';
          else if (line.includes('# Environment:'))
            environment = (line.split(':')[1]?.trim() || 'production') as Environment;
          else if (line.includes('{') && !line.startsWith('#') && !domain) {
            domain = line.replace('{', '').trim().split(',')[0].trim();
          }
        }

        if (projectName && domain) {
          domains.push({
            domain,
            projectName,
            environment,
            isCustom: !domain.endsWith(`.${BASE_DOMAIN}`),
            createdAt: new Date().toISOString(),
          });
        }
      } catch {
        // Skip invalid files
      }
    }

    return domains;
  }

  private generateCaddyConfig(config: {
    projectName: string;
    environment: Environment;
    domain: string;
    activePort: number;
    standbyPort?: number;
    activeSlot: SlotName;
    version: string;
    teamId: string;
    customDomains?: string[];
  }): string {
    const timestamp = new Date().toISOString();
    const allDomains = [config.domain, ...(config.customDomains || [])];
    const domainList = allDomains.join(', ');

    const reverseProxy = config.standbyPort
      ? `reverse_proxy localhost:${config.activePort} localhost:${config.standbyPort} {
    lb_policy first
    fail_duration 10s
    health_uri /health
    health_interval 10s
    health_timeout 5s
  }`
      : `reverse_proxy localhost:${config.activePort} {
    health_uri /health
    health_interval 10s
    health_timeout 5s
  }`;

    return `# CodeB v8.0 - Caddy Site Configuration
# Project: ${config.projectName}
# Environment: ${config.environment}
# Version: ${config.version}
# Active Slot: ${config.activeSlot} (port ${config.activePort})
# Team: ${config.teamId}
# Generated: ${timestamp}

${domainList} {
  ${reverseProxy}
  encode gzip
  header {
    X-CodeB-Project ${config.projectName}
    X-CodeB-Version ${config.version}
    X-CodeB-Slot ${config.activeSlot}
    -Server
  }
  log {
    output file /var/log/caddy/${config.projectName}.log {
      roll_size 10mb
      roll_keep 5
    }
  }
}
`;
  }
}
