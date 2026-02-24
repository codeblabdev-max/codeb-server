/**
 * DNS API Client - Cloudflare REST API
 *
 * Cloudflare API로 DNS 레코드 관리
 * Migrated from PowerDNS (2026-02-24)
 * @author CodeB Team
 */

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const APP_SERVER_IP = process.env.APP_SERVER_IP || '158.247.203.55';

/**
 * Cloudflare DNS API 클라이언트
 */
class DNSApi {
  constructor() {
    this.zoneCache = new Map();
  }

  /**
   * API Token 설정 여부 확인
   */
  isConfigured() {
    return !!CF_API_TOKEN;
  }

  /**
   * API Token 검증
   */
  validateApiKey() {
    if (!CF_API_TOKEN) {
      throw new Error(
        'CLOUDFLARE_API_TOKEN is not configured. ' +
        'Please set CLOUDFLARE_API_TOKEN in your .env file or environment variables.'
      );
    }
  }

  /**
   * Cloudflare API 호출
   */
  async cfRequest(method, path, body) {
    this.validateApiKey();
    const url = `${CF_API_BASE}${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!data.success) {
      const errMsg = data.errors?.map(e => e.message).join(', ') || 'Unknown error';
      throw new Error(`Cloudflare API error: ${errMsg}`);
    }

    return data;
  }

  /**
   * Zone ID 조회 (캐싱)
   */
  async getZoneId(zoneName) {
    if (this.zoneCache.has(zoneName)) {
      return this.zoneCache.get(zoneName);
    }

    const data = await this.cfRequest('GET', `/zones?name=${zoneName}&status=active`);

    if (!data.result || data.result.length === 0) {
      throw new Error(`Zone not found: ${zoneName}`);
    }

    const zoneId = data.result[0].id;
    this.zoneCache.set(zoneName, zoneId);
    return zoneId;
  }

  /**
   * 기존 레코드 찾기
   */
  async findRecord(zoneId, type, name) {
    const data = await this.cfRequest('GET', `/zones/${zoneId}/dns_records?type=${type}&name=${name}`);
    return (data.result && data.result.length > 0) ? data.result[0] : null;
  }

  /**
   * 존 목록 조회
   */
  async listZones() {
    const data = await this.cfRequest('GET', '/zones?per_page=50&status=active');
    return data.result || [];
  }

  /**
   * 특정 존의 레코드 조회
   */
  async getZone(zoneName) {
    try {
      const zoneId = await this.getZoneId(zoneName);
      const data = await this.cfRequest('GET', `/zones/${zoneId}/dns_records?per_page=100`);
      return { id: zoneId, name: zoneName, records: data.result || [] };
    } catch (error) {
      return null;
    }
  }

  /**
   * A 레코드 추가/업데이트 (upsert)
   */
  async addARecord(domain, ip = APP_SERVER_IP) {
    const parts = domain.split('.');
    if (parts.length < 2) throw new Error('Invalid domain format');

    const zoneName = parts.slice(-2).join('.');
    const zoneId = await this.getZoneId(zoneName);
    const existing = await this.findRecord(zoneId, 'A', domain);

    if (existing) {
      await this.cfRequest('PUT', `/zones/${zoneId}/dns_records/${existing.id}`, {
        type: 'A', name: domain, content: ip, ttl: 1, proxied: true,
      });
    } else {
      await this.cfRequest('POST', `/zones/${zoneId}/dns_records`, {
        type: 'A', name: domain, content: ip, ttl: 1, proxied: true,
      });
    }

    return { success: true, domain, ip, zone: zoneName };
  }

  /**
   * CNAME 레코드 추가/업데이트 (upsert)
   */
  async addCNAME(domain, target) {
    const parts = domain.split('.');
    const zoneName = parts.slice(-2).join('.');
    const zoneId = await this.getZoneId(zoneName);
    const existing = await this.findRecord(zoneId, 'CNAME', domain);

    if (existing) {
      await this.cfRequest('PUT', `/zones/${zoneId}/dns_records/${existing.id}`, {
        type: 'CNAME', name: domain, content: target, ttl: 1, proxied: true,
      });
    } else {
      await this.cfRequest('POST', `/zones/${zoneId}/dns_records`, {
        type: 'CNAME', name: domain, content: target, ttl: 1, proxied: true,
      });
    }

    return { success: true, domain, target };
  }

  /**
   * 레코드 삭제
   */
  async deleteRecord(domain, type = 'A') {
    const parts = domain.split('.');
    const zoneName = parts.slice(-2).join('.');
    const zoneId = await this.getZoneId(zoneName);
    const existing = await this.findRecord(zoneId, type, domain);

    if (existing) {
      await this.cfRequest('DELETE', `/zones/${zoneId}/dns_records/${existing.id}`);
      return { success: true, domain, type };
    }

    return { success: true, domain, type, note: 'Record not found' };
  }

  /**
   * 도메인 존재 여부 확인
   */
  async checkDomain(domain) {
    try {
      const parts = domain.split('.');
      const zoneName = parts.slice(-2).join('.');
      const zoneId = await this.getZoneId(zoneName);

      const aRecord = await this.findRecord(zoneId, 'A', domain);
      if (aRecord) {
        return { exists: true, type: 'A', content: aRecord.content, ttl: aRecord.ttl, proxied: aRecord.proxied };
      }

      const cnameRecord = await this.findRecord(zoneId, 'CNAME', domain);
      if (cnameRecord) {
        return { exists: true, type: 'CNAME', content: cnameRecord.content, ttl: cnameRecord.ttl, proxied: cnameRecord.proxied };
      }

      return { exists: false, reason: 'Record not found in zone' };
    } catch (error) {
      return { exists: false, reason: error.message };
    }
  }

  /**
   * 도메인 설정 (A레코드 + 선택적 www CNAME)
   */
  async setupDomain(domain, options = {}) {
    this.validateApiKey();
    const { ip = APP_SERVER_IP, www = false } = options;
    const results = [];

    const aResult = await this.addARecord(domain, ip);
    results.push({ type: 'A', ...aResult });

    if (www) {
      const wwwDomain = `www.${domain}`;
      const cnameResult = await this.addCNAME(wwwDomain, domain);
      results.push({ type: 'CNAME', ...cnameResult });
    }

    return results;
  }
}

export const dnsApi = new DNSApi();
export default dnsApi;
