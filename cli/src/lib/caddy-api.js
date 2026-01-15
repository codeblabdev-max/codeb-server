/**
 * Caddy Admin API Client
 *
 * SSH 없이 HTTP API로 Caddy 설정 관리
 * Caddy Admin API: https://caddyserver.com/docs/api
 *
 * @author CodeB Team
 */

import axios from 'axios';

// Caddy 설정
const CADDY_API_URL = process.env.CADDY_API_URL || 'http://158.247.203.55:2019';
const CADDY_API_KEY = process.env.CADDY_API_KEY || ''; // 선택적 인증

/**
 * Caddy Admin API 클라이언트
 */
class CaddyApi {
  constructor() {
    const headers = {
      'Content-Type': 'application/json'
    };

    // API Key가 있으면 추가
    if (CADDY_API_KEY) {
      headers['Authorization'] = `Bearer ${CADDY_API_KEY}`;
    }

    this.client = axios.create({
      baseURL: CADDY_API_URL,
      headers,
      timeout: 10000
    });
  }

  /**
   * API URL 설정 여부 확인
   * (Caddy API는 인증이 선택적이므로 URL만 확인)
   */
  isConfigured() {
    return !!CADDY_API_URL;
  }

  /**
   * 현재 Caddy 설정 조회
   */
  async getConfig() {
    try {
      const response = await this.client.get('/config/');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get Caddy config: ${error.message}`);
    }
  }

  /**
   * 특정 경로의 설정 조회
   */
  async getConfigPath(path) {
    try {
      const response = await this.client.get(`/config/${path}`);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw new Error(`Failed to get config at ${path}: ${error.message}`);
    }
  }

  /**
   * 사이트 추가 (reverse_proxy)
   *
   * @param {string} domain - 도메인 (예: myapp.codeb.kr)
   * @param {number} port - 타겟 포트 (예: 4100)
   * @param {Object} options - 추가 옵션
   */
  async addSite(domain, port, options = {}) {
    const {
      projectName = domain.split('.')[0],
      environment = 'production',
      ssl = true,
      headers = {}
    } = options;

    try {
      // 사이트 설정 생성
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
                        ...headers
                      }
                    }
                  },
                  {
                    handler: 'reverse_proxy',
                    upstreams: [{ dial: `localhost:${port}` }],
                    health_checks: {
                      active: {
                        uri: '/health',
                        interval: '10s',
                        timeout: '5s'
                      }
                    }
                  }
                ]
              }
            ]
          }
        ],
        terminal: true
      };

      // 기존 routes 가져오기
      let routes = await this.getConfigPath('apps/http/servers/srv0/routes') || [];

      // 동일 도메인 route가 있으면 제거
      routes = routes.filter(route => {
        const hosts = route.match?.[0]?.host || [];
        return !hosts.includes(domain);
      });

      // 새 route 추가
      routes.push(siteConfig);

      // routes 업데이트
      await this.client.patch('/config/apps/http/servers/srv0/routes', routes);

      return {
        success: true,
        domain,
        port,
        ssl,
        message: `Site ${domain} added successfully`
      };
    } catch (error) {
      throw new Error(`Failed to add site ${domain}: ${error.message}`);
    }
  }

  /**
   * Blue-Green 배포용 사이트 설정
   *
   * @param {string} domain - 도메인
   * @param {number} activePort - 활성 슬롯 포트
   * @param {number} standbyPort - 대기 슬롯 포트
   * @param {Object} options - 추가 옵션
   */
  async addBlueGreenSite(domain, activePort, standbyPort, options = {}) {
    const {
      projectName = domain.split('.')[0],
      environment = 'production',
      activeSlot = 'blue',
      version = 'unknown',
      teamId = ''
    } = options;

    try {
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
                        'X-CodeB-Project': [projectName],
                        'X-CodeB-Version': [version],
                        'X-CodeB-Slot': [activeSlot],
                        'X-CodeB-Team': [teamId]
                      },
                      delete: ['Server']
                    }
                  },
                  {
                    handler: 'reverse_proxy',
                    upstreams: [
                      { dial: `localhost:${activePort}` },
                      { dial: `localhost:${standbyPort}` }
                    ],
                    load_balancing: {
                      selection_policy: { policy: 'first' }
                    },
                    health_checks: {
                      active: {
                        uri: '/health',
                        interval: '10s',
                        timeout: '5s'
                      }
                    }
                  }
                ]
              }
            ]
          }
        ],
        terminal: true
      };

      // 기존 routes 가져오기
      let routes = await this.getConfigPath('apps/http/servers/srv0/routes') || [];

      // 동일 도메인 제거
      routes = routes.filter(route => {
        const hosts = route.match?.[0]?.host || [];
        return !hosts.includes(domain);
      });

      // 새 route 추가
      routes.push(siteConfig);

      // routes 업데이트
      await this.client.patch('/config/apps/http/servers/srv0/routes', routes);

      return {
        success: true,
        domain,
        activePort,
        standbyPort,
        activeSlot,
        message: `Blue-Green site ${domain} configured`
      };
    } catch (error) {
      throw new Error(`Failed to configure Blue-Green site ${domain}: ${error.message}`);
    }
  }

  /**
   * 사이트 삭제
   */
  async removeSite(domain) {
    try {
      let routes = await this.getConfigPath('apps/http/servers/srv0/routes') || [];

      const originalLength = routes.length;
      routes = routes.filter(route => {
        const hosts = route.match?.[0]?.host || [];
        return !hosts.includes(domain);
      });

      if (routes.length === originalLength) {
        return { success: false, error: `Site ${domain} not found` };
      }

      await this.client.patch('/config/apps/http/servers/srv0/routes', routes);

      return {
        success: true,
        domain,
        message: `Site ${domain} removed successfully`
      };
    } catch (error) {
      throw new Error(`Failed to remove site ${domain}: ${error.message}`);
    }
  }

  /**
   * 사이트 목록 조회
   */
  async listSites() {
    try {
      const routes = await this.getConfigPath('apps/http/servers/srv0/routes') || [];

      return routes.map(route => {
        const hosts = route.match?.[0]?.host || [];
        const upstreams = route.handle?.[0]?.routes?.[0]?.handle?.[1]?.upstreams || [];
        const headers = route.handle?.[0]?.routes?.[0]?.handle?.[0]?.response?.set || {};

        return {
          domains: hosts,
          upstreams: upstreams.map(u => u.dial),
          project: headers['X-Project']?.[0] || headers['X-CodeB-Project']?.[0] || 'unknown',
          environment: headers['X-Environment']?.[0] || 'production',
          slot: headers['X-CodeB-Slot']?.[0] || null,
          version: headers['X-CodeB-Version']?.[0] || null
        };
      });
    } catch (error) {
      throw new Error(`Failed to list sites: ${error.message}`);
    }
  }

  /**
   * 설정 리로드 (graceful)
   */
  async reload() {
    try {
      // Caddy Admin API는 설정 변경 시 자동 리로드
      // 명시적으로 리로드가 필요한 경우 사용
      await this.client.post('/load', await this.getConfig());
      return { success: true, message: 'Caddy configuration reloaded' };
    } catch (error) {
      throw new Error(`Failed to reload Caddy: ${error.message}`);
    }
  }

  /**
   * 특정 도메인의 설정 조회
   */
  async getSite(domain) {
    try {
      const routes = await this.getConfigPath('apps/http/servers/srv0/routes') || [];

      const route = routes.find(r => {
        const hosts = r.match?.[0]?.host || [];
        return hosts.includes(domain);
      });

      if (!route) {
        return null;
      }

      const upstreams = route.handle?.[0]?.routes?.[0]?.handle?.[1]?.upstreams || [];
      const headers = route.handle?.[0]?.routes?.[0]?.handle?.[0]?.response?.set || {};

      return {
        domain,
        upstreams: upstreams.map(u => u.dial),
        project: headers['X-Project']?.[0] || headers['X-CodeB-Project']?.[0] || 'unknown',
        environment: headers['X-Environment']?.[0] || 'production',
        slot: headers['X-CodeB-Slot']?.[0] || null,
        version: headers['X-CodeB-Version']?.[0] || null
      };
    } catch (error) {
      throw new Error(`Failed to get site ${domain}: ${error.message}`);
    }
  }

  /**
   * 헬스 체크
   */
  async healthCheck() {
    try {
      const config = await this.getConfig();
      return {
        healthy: true,
        version: config?.admin?.listen || 'unknown'
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }
}

export const caddyApi = new CaddyApi();
export default caddyApi;
