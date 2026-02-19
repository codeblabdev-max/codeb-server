/**
 * DnsService - Cloudflare DNS API management
 *
 * Manages DNS A/CNAME records via Cloudflare REST API.
 * Migrated from PowerDNS to Cloudflare (2026-02-20).
 */

interface LoggerLike {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  log(level: string, message: string, meta?: Record<string, unknown>): void;
}

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

export interface DnsRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT';
  name: string;
  content: string;
  ttl: number;
}

interface CloudflareResponse<T = unknown> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: Array<{ code: number; message: string }>;
  result: T;
}

interface CloudflareDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  zone_id: string;
  zone_name: string;
}

export class DnsService {
  private readonly apiToken: string;
  private zoneCache: Map<string, string> = new Map();

  constructor(
    private readonly logger: LoggerLike,
    config?: { apiToken?: string },
  ) {
    this.apiToken = config?.apiToken || process.env.CLOUDFLARE_API_TOKEN || '';
  }

  private getApiToken(): string {
    if (!this.apiToken) {
      throw new Error(
        'CLOUDFLARE_API_TOKEN is not configured. ' +
        'Please set CLOUDFLARE_API_TOKEN in your .env file or environment variables.',
      );
    }
    return this.apiToken;
  }

  private async cfRequest<T = unknown>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<CloudflareResponse<T>> {
    const token = this.getApiToken();
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
        const errMsg = data.errors?.map((e) => e.message).join(', ') || 'Unknown error';
        throw new Error(`Cloudflare API error: ${errMsg}`);
      }

      return data;
    } catch (error) {
      this.logger.error('Cloudflare request failed', { url, method, error: String(error) });
      throw error;
    }
  }

  /**
   * Get zone ID for a domain name. Caches results.
   */
  async getZoneId(zoneName: string): Promise<string> {
    if (this.zoneCache.has(zoneName)) {
      return this.zoneCache.get(zoneName)!;
    }

    const data = await this.cfRequest<Array<{ id: string; name: string }>>(
      'GET',
      `/zones?name=${zoneName}&status=active`,
    );

    if (!data.result || data.result.length === 0) {
      throw new Error(`Zone not found: ${zoneName}`);
    }

    const zoneId = data.result[0].id;
    this.zoneCache.set(zoneName, zoneId);
    return zoneId;
  }

  /**
   * Find existing DNS record by type and name.
   */
  private async findRecord(
    zoneId: string,
    type: string,
    name: string,
  ): Promise<CloudflareDnsRecord | null> {
    const data = await this.cfRequest<CloudflareDnsRecord[]>(
      'GET',
      `/zones/${zoneId}/dns_records?type=${type}&name=${name}`,
    );

    if (data.result && data.result.length > 0) {
      return data.result[0];
    }
    return null;
  }

  /**
   * Create or update a DNS record (upsert).
   * Cloudflare uses proxied=false for DNS-only (grey cloud).
   */
  async createRecord(
    zone: string,
    type: string,
    name: string,
    content: string,
    ttl: number = 1, // 1 = auto
    proxied: boolean = true,
  ): Promise<void> {
    const zoneId = await this.getZoneId(zone);
    const fullName = name === '@' ? zone : `${name}.${zone}`;

    // Check if record already exists
    const existing = await this.findRecord(zoneId, type, fullName);

    if (existing) {
      // Update existing record
      await this.cfRequest(
        'PUT',
        `/zones/${zoneId}/dns_records/${existing.id}`,
        { type, name: fullName, content, ttl, proxied },
      );
      this.logger.info('DNS record updated', { zone, type, name: fullName, content, proxied });
    } else {
      // Create new record
      await this.cfRequest(
        'POST',
        `/zones/${zoneId}/dns_records`,
        { type, name: fullName, content, ttl, proxied },
      );
      this.logger.info('DNS record created', { zone, type, name: fullName, content, proxied });
    }
  }

  async deleteRecord(zone: string, type: string, name: string): Promise<void> {
    const zoneId = await this.getZoneId(zone);
    const fullName = name === '@' ? zone : `${name}.${zone}`;

    const existing = await this.findRecord(zoneId, type, fullName);

    if (existing) {
      await this.cfRequest('DELETE', `/zones/${zoneId}/dns_records/${existing.id}`);
      this.logger.info('DNS record deleted', { zone, type, name: fullName });
    } else {
      this.logger.warn('DNS record not found for deletion', { zone, type, name: fullName });
    }
  }

  async listRecords(zone: string): Promise<CloudflareDnsRecord[]> {
    const zoneId = await this.getZoneId(zone);
    const data = await this.cfRequest<CloudflareDnsRecord[]>(
      'GET',
      `/zones/${zoneId}/dns_records?per_page=100`,
    );
    return data.result || [];
  }

  async listZones(): Promise<Array<{ id: string; name: string; status: string }>> {
    const data = await this.cfRequest<Array<{ id: string; name: string; status: string }>>(
      'GET',
      '/zones?per_page=50&status=active',
    );
    return data.result || [];
  }

  async resolve(domain: string, type: string): Promise<string[]> {
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
}
