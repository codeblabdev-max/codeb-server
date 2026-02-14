/**
 * DnsService - PowerDNS API management
 *
 * Manages DNS A/CNAME records via PowerDNS REST API.
 * Refactored from mcp-server/src/tools/domain.ts
 */

interface LoggerLike {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  log(level: string, message: string, meta?: Record<string, unknown>): void;
}

const DEFAULT_PDNS_API_URL = 'http://127.0.0.1:8081/api/v1';

export interface DnsRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT';
  name: string;
  content: string;
  ttl: number;
}

export class DnsService {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly logger: LoggerLike,
    config?: { apiUrl?: string; apiKey?: string },
  ) {
    this.apiUrl = config?.apiUrl || process.env.PDNS_API_URL || DEFAULT_PDNS_API_URL;
    this.apiKey = config?.apiKey || process.env.PDNS_API_KEY || '';
  }

  private getApiKey(): string {
    if (!this.apiKey) {
      throw new Error(
        'PDNS_API_KEY is not configured. ' +
        'Please set PDNS_API_KEY in your project .env file or environment variables.',
      );
    }
    return this.apiKey;
  }

  private async pdnsRequest(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const apiKey = this.getApiKey();
    const url = `${this.apiUrl}${path}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`PowerDNS API error: ${response.status} - ${text}`);
      }

      if (response.status === 204) return null;
      return response.json();
    } catch (error) {
      this.logger.error('PowerDNS request failed', { url, method, error: String(error) });
      throw error;
    }
  }

  async createRecord(
    zone: string,
    type: string,
    name: string,
    content: string,
    ttl: number = 300,
  ): Promise<void> {
    const rrsets = [
      {
        name: `${name}.${zone}.`,
        type,
        ttl,
        changetype: 'REPLACE',
        records: [{ content, disabled: false }],
      },
    ];

    await this.pdnsRequest('PATCH', `/servers/localhost/zones/${zone}.`, { rrsets });
    this.logger.info('DNS record created', { zone, type, name, content });
  }

  async deleteRecord(zone: string, type: string, name: string): Promise<void> {
    const rrsets = [
      {
        name: `${name}.${zone}.`,
        type,
        changetype: 'DELETE',
      },
    ];

    await this.pdnsRequest('PATCH', `/servers/localhost/zones/${zone}.`, { rrsets });
    this.logger.info('DNS record deleted', { zone, type, name });
  }

  async listRecords(zone: string): Promise<unknown> {
    return this.pdnsRequest('GET', `/servers/localhost/zones/${zone}.`);
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
