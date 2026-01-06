/**
 * DNS API Client - PowerDNS HTTP API
 *
 * SSH 없이 HTTP API로 PowerDNS 관리
 * @author CodeB Team
 */

import axios from 'axios';

// PowerDNS 설정
const PDNS_API_URL = process.env.PDNS_API_URL || 'http://158.247.203.55:8081/api/v1';
const PDNS_API_KEY = process.env.PDNS_API_KEY || '20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5';
const DEFAULT_TTL = 300;
const APP_SERVER_IP = '158.247.203.55';

/**
 * PowerDNS API 클라이언트
 */
class DNSApi {
  constructor() {
    this.client = axios.create({
      baseURL: PDNS_API_URL,
      headers: {
        'X-API-Key': PDNS_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  }

  /**
   * 존 목록 조회
   */
  async listZones() {
    try {
      const response = await this.client.get('/servers/localhost/zones');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to list zones: ${error.message}`);
    }
  }

  /**
   * 특정 존의 레코드 조회
   */
  async getZone(zoneName) {
    try {
      // 존 이름 정규화 (마지막에 . 추가)
      const normalizedZone = zoneName.endsWith('.') ? zoneName : `${zoneName}.`;
      const response = await this.client.get(`/servers/localhost/zones/${normalizedZone}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw new Error(`Failed to get zone ${zoneName}: ${error.message}`);
    }
  }

  /**
   * A 레코드 추가
   * @param {string} domain - 도메인 (예: worb.codeb.kr)
   * @param {string} ip - IP 주소 (기본값: APP_SERVER_IP)
   */
  async addARecord(domain, ip = APP_SERVER_IP) {
    try {
      // 도메인에서 존과 호스트 추출
      const parts = domain.split('.');
      if (parts.length < 2) {
        throw new Error('Invalid domain format');
      }

      // 존 이름 (예: codeb.kr.)
      const zoneName = parts.slice(-2).join('.') + '.';
      // 레코드 이름 (예: worb.codeb.kr.)
      const recordName = domain.endsWith('.') ? domain : `${domain}.`;

      const payload = {
        rrsets: [
          {
            name: recordName,
            type: 'A',
            ttl: DEFAULT_TTL,
            changetype: 'REPLACE',
            records: [
              {
                content: ip,
                disabled: false
              }
            ]
          }
        ]
      };

      await this.client.patch(`/servers/localhost/zones/${zoneName}`, payload);
      return { success: true, domain, ip, zone: zoneName };
    } catch (error) {
      throw new Error(`Failed to add A record for ${domain}: ${error.message}`);
    }
  }

  /**
   * CNAME 레코드 추가
   */
  async addCNAME(domain, target) {
    try {
      const parts = domain.split('.');
      const zoneName = parts.slice(-2).join('.') + '.';
      const recordName = domain.endsWith('.') ? domain : `${domain}.`;
      const targetName = target.endsWith('.') ? target : `${target}.`;

      const payload = {
        rrsets: [
          {
            name: recordName,
            type: 'CNAME',
            ttl: DEFAULT_TTL,
            changetype: 'REPLACE',
            records: [
              {
                content: targetName,
                disabled: false
              }
            ]
          }
        ]
      };

      await this.client.patch(`/servers/localhost/zones/${zoneName}`, payload);
      return { success: true, domain, target };
    } catch (error) {
      throw new Error(`Failed to add CNAME record for ${domain}: ${error.message}`);
    }
  }

  /**
   * 레코드 삭제
   */
  async deleteRecord(domain, type = 'A') {
    try {
      const parts = domain.split('.');
      const zoneName = parts.slice(-2).join('.') + '.';
      const recordName = domain.endsWith('.') ? domain : `${domain}.`;

      const payload = {
        rrsets: [
          {
            name: recordName,
            type: type,
            changetype: 'DELETE'
          }
        ]
      };

      await this.client.patch(`/servers/localhost/zones/${zoneName}`, payload);
      return { success: true, domain, type };
    } catch (error) {
      throw new Error(`Failed to delete ${type} record for ${domain}: ${error.message}`);
    }
  }

  /**
   * 도메인 존재 여부 확인
   */
  async checkDomain(domain) {
    try {
      const parts = domain.split('.');
      const zoneName = parts.slice(-2).join('.') + '.';
      const recordName = domain.endsWith('.') ? domain : `${domain}.`;

      const zone = await this.getZone(zoneName);
      if (!zone) {
        return { exists: false, reason: 'Zone not found' };
      }

      const record = zone.rrsets?.find(
        r => r.name === recordName && (r.type === 'A' || r.type === 'CNAME')
      );

      if (record) {
        return {
          exists: true,
          type: record.type,
          records: record.records,
          ttl: record.ttl
        };
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
    const { ip = APP_SERVER_IP, www = false } = options;
    const results = [];

    // A 레코드 추가
    const aResult = await this.addARecord(domain, ip);
    results.push({ type: 'A', ...aResult });

    // www CNAME 추가 (옵션)
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
