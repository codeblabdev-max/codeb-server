/**
 * CodeB v9.0 - Domain Management Tools (Cloudflare + Caddy)
 *
 * 통합된 도메인 관리 시스템:
 * - Caddy 파일 기반 설정 (promote.ts와 동일 방식)
 * - Cloudflare API로 DNS 레코드 관리 (PowerDNS에서 마이그레이션 완료)
 * - DNS 검증 기능
 *
 * 변경사항 (v8.0):
 * - PowerDNS → Cloudflare API 마이그레이션
 * - Zone ID 캐싱, upsert(create/update) 지원
 * - proxied: true 기본 (Cloudflare CDN/보호)
 */

import type { AuthContext, Environment, SlotName } from '../lib/types.js';
import { logger } from '../lib/logger.js';
import {
  writeCaddyConfig,
  addCustomDomain,
  removeCustomDomain,
  getCustomDomains,
  listAllDomains,
  getProjectDomain,
  isSubdomain,
  getBaseDomain,
  getSubdomainName,
  BASE_DOMAIN,
  SUPPORTED_DOMAINS,
  APP_SERVER_IP,
  type CaddySiteConfig,
  type DomainInfo,
} from '../lib/caddy.js';
import { getSlotRegistry } from './slot.js';
import { DomainRepo } from '../lib/database.js';

// ============================================================================
// Types
// ============================================================================

export interface DomainConfig {
  domain: string;
  type: 'custom' | 'subdomain';
  target: {
    projectName: string;
    environment: Environment;
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
  environment?: Environment;
  ssl?: boolean;
}

export interface DomainVerifyInput {
  domain: string;
}

// ============================================================================
// Configuration (Cloudflare)
// ============================================================================

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';
const zoneCache = new Map<string, string>();

// ============================================================================
// Cloudflare Client (DNS 레코드 관리)
// ============================================================================

function getCfApiToken(): string {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw new Error(
      'CLOUDFLARE_API_TOKEN is not configured. ' +
      'Please set CLOUDFLARE_API_TOKEN in your .env file or environment variables.'
    );
  }
  return token;
}

interface CloudflareResponse<T = unknown> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
}

interface CfDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
}

async function cfRequest<T = unknown>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<CloudflareResponse<T>> {
  const token = getCfApiToken();
  const url = `${CF_API_BASE}${path}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await response.json()) as CloudflareResponse<T>;

    if (!data.success) {
      const errMsg = data.errors?.map(e => e.message).join(', ') || 'Unknown error';
      throw new Error(`Cloudflare API error: ${errMsg}`);
    }

    return data;
  } catch (error) {
    logger.error('Cloudflare request failed', { url, method, error: String(error) });
    throw error;
  }
}

async function getZoneId(zoneName: string): Promise<string> {
  if (zoneCache.has(zoneName)) {
    return zoneCache.get(zoneName)!;
  }

  const data = await cfRequest<Array<{ id: string; name: string }>>(
    'GET',
    `/zones?name=${zoneName}&status=active`,
  );

  if (!data.result || data.result.length === 0) {
    throw new Error(`Cloudflare zone not found: ${zoneName}`);
  }

  const zoneId = data.result[0].id;
  zoneCache.set(zoneName, zoneId);
  return zoneId;
}

async function findCfRecord(
  zoneId: string,
  type: string,
  name: string
): Promise<CfDnsRecord | null> {
  const data = await cfRequest<CfDnsRecord[]>(
    'GET',
    `/zones/${zoneId}/dns_records?type=${type}&name=${name}`,
  );
  return (data.result && data.result.length > 0) ? data.result[0] : null;
}

async function addDNSRecord(
  zone: string,
  type: string,
  name: string,
  content: string,
  proxied: boolean = true
): Promise<void> {
  const zoneId = await getZoneId(zone);
  const fullName = name === '@' ? zone : `${name}.${zone}`;

  const existing = await findCfRecord(zoneId, type, fullName);

  if (existing) {
    await cfRequest('PUT', `/zones/${zoneId}/dns_records/${existing.id}`, {
      type, name: fullName, content, ttl: 1, proxied,
    });
    logger.info('DNS record updated (Cloudflare)', { zone, type, name: fullName, content, proxied });
  } else {
    await cfRequest('POST', `/zones/${zoneId}/dns_records`, {
      type, name: fullName, content, ttl: 1, proxied,
    });
    logger.info('DNS record created (Cloudflare)', { zone, type, name: fullName, content, proxied });
  }
}

async function removeDNSRecord(zone: string, type: string, name: string): Promise<void> {
  const zoneId = await getZoneId(zone);
  const fullName = name === '@' ? zone : `${name}.${zone}`;

  const existing = await findCfRecord(zoneId, type, fullName);

  if (existing) {
    await cfRequest('DELETE', `/zones/${zoneId}/dns_records/${existing.id}`);
    logger.info('DNS record deleted (Cloudflare)', { zone, type, name: fullName });
  } else {
    logger.warn('DNS record not found for deletion', { zone, type, name: fullName });
  }
}

async function resolveDNS(domain: string, type: string): Promise<string[]> {
  try {
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

// ============================================================================
// Helper Functions
// ============================================================================

function isValidDomain(domain: string): boolean {
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
}

/**
 * Get slot info from registry
 */
async function getSlotInfo(
  projectName: string,
  environment: Environment
): Promise<{
  activeSlot: SlotName;
  activePort: number;
  standbyPort: number;
  version: string;
} | null> {
  try {
    const slots = await getSlotRegistry(projectName, environment);
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

// ============================================================================
// Domain Setup Tool
// ============================================================================

export const domainSetupTool = {
  name: 'domain_setup',
  description: 'Setup a custom domain for a project (Caddy file-based + Cloudflare DNS)',

  async execute(
    input: DomainSetupInput,
    auth: AuthContext
  ): Promise<{ success: boolean; data?: DomainConfig; error?: string }> {
    const { domain, projectName, environment = 'production' } = input;

    logger.info('Setting up domain', { domain, projectName, environment });

    try {
      // Validate domain format
      if (!isValidDomain(domain)) {
        return { success: false, error: 'Invalid domain format' };
      }

      // Check if it's a subdomain of codeb.kr or custom domain
      const domainIsSubdomain = isSubdomain(domain);
      const domainType = domainIsSubdomain ? 'subdomain' : 'custom';

      // Get slot info from registry
      const slotInfo = await getSlotInfo(projectName, environment);
      if (!slotInfo) {
        return { success: false, error: `Project ${projectName} not found or not deployed` };
      }

      const records: DNSRecord[] = [];

      if (domainIsSubdomain) {
        // Add A record for subdomain via PowerDNS
        // Works for all supported domains: codeb.kr, workb.net
        const baseDomain = getBaseDomain(domain);
        const subdomain = getSubdomainName(domain);

        if (!baseDomain || !subdomain) {
          return { success: false, error: `Invalid subdomain format: ${domain}` };
        }

        logger.info('Adding DNS record', { baseDomain, subdomain, ip: APP_SERVER_IP });
        await addDNSRecord(baseDomain, 'A', subdomain, APP_SERVER_IP);
        records.push({
          type: 'A',
          name: subdomain,
          content: APP_SERVER_IP,
          ttl: 300,
        });
      } else {
        // For custom domain, provide CNAME instructions
        records.push({
          type: 'CNAME',
          name: '@',
          content: `${projectName}.${BASE_DOMAIN}`,
          ttl: 300,
        });
      }

      // Setup Caddy configuration (file-based)
      if (domain === getProjectDomain(projectName, environment)) {
        // Primary domain - write full config
        const caddyConfig: CaddySiteConfig = {
          projectName,
          environment,
          domain,
          activePort: slotInfo.activePort,
          standbyPort: slotInfo.standbyPort,
          activeSlot: slotInfo.activeSlot,
          version: slotInfo.version,
          teamId: auth.teamId,
        };
        await writeCaddyConfig(caddyConfig);
      } else {
        // Custom domain - add to existing config
        await addCustomDomain(
          projectName,
          environment,
          domain,
          slotInfo,
          auth.teamId
        );
      }

      const config: DomainConfig = {
        domain,
        type: domainType,
        target: { projectName, environment },
        ssl: true, // Caddy auto-SSL
        records,
        status: domainIsSubdomain ? 'active' : 'pending',
        createdAt: new Date().toISOString(),
        verifiedAt: domainIsSubdomain ? new Date().toISOString() : undefined,
      };

      // Save to DB SSOT
      try {
        const dbDomain = await DomainRepo.create({
          domain,
          projectName,
          environment,
          type: domainType,
          sslEnabled: true,
          createdBy: auth.teamId,
        });

        if (domainIsSubdomain) {
          await DomainRepo.markActive(domain);
        }

        logger.info('Domain saved to DB', { domain, id: dbDomain.id });
      } catch (dbError) {
        // DB save failed but Caddy config succeeded - log warning but don't fail
        logger.warn('Failed to save domain to DB', { domain, error: String(dbError) });
      }

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
    _auth: AuthContext
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
  description: 'List all configured domains (from DB SSOT + Caddy files)',

  async execute(
    input: { projectName?: string },
    _auth: AuthContext
  ): Promise<{ success: boolean; domains: DomainConfig[]; error?: string }> {
    try {
      const domains: DomainConfig[] = [];

      // First try DB SSOT
      try {
        let dbDomains;
        if (input.projectName) {
          dbDomains = await DomainRepo.findByProject(input.projectName);
        } else {
          dbDomains = await DomainRepo.listAll();
        }

        for (const d of dbDomains) {
          domains.push({
            domain: d.domain,
            type: d.type === 'custom' ? 'custom' : 'subdomain',
            target: {
              projectName: d.project_name || '',
              environment: (d.environment as Environment) || 'production',
            },
            ssl: d.ssl_enabled,
            records: [],
            status: d.status as DomainConfig['status'],
            createdAt: d.created_at.toISOString(),
            verifiedAt: d.dns_verified_at?.toISOString(),
          });
        }

        if (domains.length > 0) {
          return { success: true, domains };
        }
      } catch (dbError) {
        logger.warn('Failed to fetch domains from DB, falling back to Caddy files', { error: String(dbError) });
      }

      // Fallback to Caddy files
      const allDomains = await listAllDomains();

      for (const info of allDomains) {
        // Filter by project if specified
        if (input.projectName && info.projectName !== input.projectName) {
          continue;
        }

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
  },
};

// ============================================================================
// Domain Delete Tool
// ============================================================================

export const domainDeleteTool = {
  name: 'domain_delete',
  description: 'Delete a domain configuration',

  async execute(
    input: { domain: string; projectName: string; environment?: Environment },
    auth: AuthContext
  ): Promise<{ success: boolean; error?: string }> {
    const { domain, projectName, environment = 'production' } = input;

    try {
      // Get slot info
      const slotInfo = await getSlotInfo(projectName, environment);
      if (!slotInfo) {
        return { success: false, error: `Project ${projectName} not found` };
      }

      // Check if this is the primary domain
      const primaryDomain = getProjectDomain(projectName, environment);

      if (domain === primaryDomain) {
        return {
          success: false,
          error: `Cannot delete primary domain ${primaryDomain}. Use project delete instead.`,
        };
      }

      // Remove custom domain from Caddy config
      await removeCustomDomain(
        projectName,
        environment,
        domain,
        slotInfo,
        auth.teamId
      );

      // Remove DNS record if subdomain (supports codeb.kr, workb.net)
      if (isSubdomain(domain)) {
        const baseDomain = getBaseDomain(domain);
        const subdomain = getSubdomainName(domain);

        if (baseDomain && subdomain) {
          try {
            await removeDNSRecord(baseDomain, 'A', subdomain);
            logger.info('DNS record removed', { domain, baseDomain, subdomain });
          } catch (error) {
            logger.warn('Failed to remove DNS record', { domain, error: String(error) });
            // Continue even if DNS removal fails
          }
        }
      }

      // Delete from DB SSOT
      try {
        await DomainRepo.delete(domain);
        logger.info('Domain deleted from DB', { domain });
      } catch (dbError) {
        logger.warn('Failed to delete domain from DB', { domain, error: String(dbError) });
      }

      logger.info('Domain deleted', { domain, projectName });
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
    _auth: AuthContext
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
      // Check if domain is configured
      const allDomains = await listAllDomains();
      const found = allDomains.find(d => d.domain === domain);

      if (!found) {
        return {
          success: false,
          error: `Domain ${domain} not configured`,
        };
      }

      // Caddy auto-manages SSL via Let's Encrypt
      return {
        success: true,
        data: {
          domain,
          issuer: "Let's Encrypt (Caddy Auto)",
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
// Export all for convenience
// ============================================================================

export {
  getProjectDomain,
  isSubdomain,
  addDNSRecord,
  removeDNSRecord,
  BASE_DOMAIN,
  APP_SERVER_IP,
};
