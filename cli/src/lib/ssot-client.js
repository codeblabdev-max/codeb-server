/**
 * SSOT Client - Unified Registry Access Layer
 *
 * 레지스트리 통합 전략:
 * - project-registry.json → ssot.json으로 단일화
 * - 모든 레지스트리 접근은 MCP를 통해 수행
 * - CLI는 이 클라이언트를 통해서만 SSOT에 접근
 *
 * @module ssot-client
 */

import { mcpClient } from './mcp-client.js';
import chalk from 'chalk';

// ============================================================================
// SSOT 클라이언트 (MCP 기반)
// ============================================================================

class SSOTClient {
  constructor() {
    this.cachedSSOT = null;
    this.cacheTimestamp = null;
    this.cacheTimeout = 30000; // 30초 캐시
  }

  /**
   * SSOT 전체 조회
   * @param {boolean} forceRefresh - 캐시 무시하고 새로 조회
   */
  async get(forceRefresh = false) {
    // 캐시 확인
    if (!forceRefresh && this.cachedSSOT && this.cacheTimestamp) {
      const elapsed = Date.now() - this.cacheTimestamp;
      if (elapsed < this.cacheTimeout) {
        return this.cachedSSOT;
      }
    }

    try {
      const result = await mcpClient.callTool('ssot_get', {
        includeIndexes: false,
      });

      if (!result.error) {
        this.cachedSSOT = result;
        this.cacheTimestamp = Date.now();
      }

      return result;
    } catch (error) {
      console.log(chalk.yellow(`⚠️  SSOT fetch failed: ${error.message}`));
      return { error: error.message };
    }
  }

  /**
   * SSOT 검증
   */
  async validate(autoFix = false) {
    try {
      return await mcpClient.callTool('ssot_validate', { autoFix });
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * SSOT 초기화
   */
  async initialize(options = {}) {
    try {
      return await mcpClient.callTool('ssot_initialize', {
        force: options.force || false,
        migrateExisting: options.migrateExisting !== false,
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * SSOT 동기화 (서버 상태와 일치시키기)
   */
  async sync(options = {}) {
    try {
      return await mcpClient.callTool('ssot_sync', {
        dryRun: options.dryRun || false,
        components: options.components || ['caddy', 'dns', 'containers'],
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // 프로젝트 관련 API
  // ============================================================================

  /**
   * 프로젝트 목록 조회
   */
  async listProjects(status = 'all') {
    try {
      return await mcpClient.callTool('ssot_list_projects', { status });
    } catch (error) {
      return [];
    }
  }

  /**
   * 프로젝트 상세 조회
   */
  async getProject(projectId) {
    try {
      const result = await mcpClient.callTool('ssot_get_project', { projectId });
      return result === 'null' ? null : result;
    } catch (error) {
      return null;
    }
  }

  /**
   * 프로젝트 등록
   */
  async registerProject(projectId, projectType, options = {}) {
    try {
      return await mcpClient.callTool('ssot_register_project', {
        projectId,
        projectType,
        description: options.description,
        gitRepo: options.gitRepo,
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 프로젝트 존재 여부 확인
   */
  async projectExists(projectId) {
    const project = await this.getProject(projectId);
    return project !== null && project !== undefined;
  }

  // ============================================================================
  // 포트 관련 API
  // ============================================================================

  /**
   * 포트 할당
   */
  async allocatePort(projectId, environment, service) {
    try {
      return await mcpClient.callTool('ssot_allocate_port', {
        projectId,
        environment,
        service,
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 포트 해제
   */
  async releasePort(projectId, environment, service) {
    try {
      return await mcpClient.callTool('ssot_release_port', {
        projectId,
        environment,
        service,
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 사용 가능한 포트 찾기
   */
  async findAvailablePort(environment, service) {
    try {
      return await mcpClient.callTool('ssot_find_available_port', {
        environment,
        service,
      });
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * 포트 범위 정보
   */
  getPortRanges() {
    return {
      staging: {
        app: { start: 3000, end: 3499 },
        db: { start: 15432, end: 15499 },
        redis: { start: 16379, end: 16399 },
      },
      production: {
        app: { start: 4000, end: 4499 },
        db: { start: 25432, end: 25499 },
        redis: { start: 26379, end: 26399 },
      },
      preview: {
        app: { start: 5000, end: 5999 },
        db: { start: 15432, end: 15499 },
        redis: { start: 16379, end: 16399 },
      },
    };
  }

  // ============================================================================
  // 도메인 관련 API
  // ============================================================================

  /**
   * 도메인 설정
   */
  async setDomain(projectId, environment, domain, targetPort, prNumber = null) {
    try {
      return await mcpClient.callTool('ssot_set_domain', {
        projectId,
        environment,
        domain,
        targetPort,
        prNumber,
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 도메인 제거
   */
  async removeDomain(projectId, environment, prNumber = null) {
    try {
      return await mcpClient.callTool('ssot_remove_domain', {
        projectId,
        environment,
        prNumber,
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 도메인 상태 확인
   */
  async checkDomainStatus(domain) {
    try {
      return await mcpClient.callTool('check_domain_status', { domain });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // SSOT 히스토리 및 상태
  // ============================================================================

  /**
   * 변경 이력 조회
   */
  async getHistory(limit = 10) {
    try {
      return await mcpClient.callTool('ssot_get_history', { limit });
    } catch (error) {
      return [];
    }
  }

  /**
   * SSOT 상태 요약
   */
  async getStatus() {
    try {
      const ssot = await this.get();
      const validation = await this.validate();

      if (ssot.error) {
        return {
          initialized: false,
          valid: false,
          error: ssot.error,
        };
      }

      return {
        initialized: true,
        valid: validation.valid !== false,
        projectCount: ssot.projects ? Object.keys(ssot.projects).length : 0,
        lastModified: ssot.lastModified,
        lastModifiedBy: ssot.lastModifiedBy,
        serverIp: ssot.server?.ip,
        issues: validation.issues || [],
      };
    } catch (error) {
      return {
        initialized: false,
        valid: false,
        error: error.message,
      };
    }
  }

  // ============================================================================
  // 유틸리티 메서드
  // ============================================================================

  /**
   * 캐시 클리어
   */
  clearCache() {
    this.cachedSSOT = null;
    this.cacheTimestamp = null;
  }

  /**
   * SSOT 보호 경고 표시
   */
  showProtectionWarning(action) {
    console.log(chalk.bgYellow.black('\n ⚠️  SSOT PROTECTION ACTIVE '));
    console.log(chalk.yellow(`\nAction '${action}' modifies SSOT-managed resources.`));
    console.log(chalk.gray('The SSOT (Single Source of Truth) system manages all port and domain assignments.'));
    console.log(chalk.gray('Changes are tracked and validated automatically.\n'));
  }

  /**
   * MCP 연결 상태 확인
   */
  async isConnected() {
    try {
      const connected = await mcpClient.ensureConnected();
      return connected;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const ssotClient = new SSOTClient();

// ============================================================================
// 편의 함수 Export (레거시 호환)
// ============================================================================

export async function getSSOT() {
  return ssotClient.get();
}

export async function validateSSOT(autoFix = false) {
  return ssotClient.validate(autoFix);
}

export async function listProjects(status = 'all') {
  return ssotClient.listProjects(status);
}

export async function getProject(projectId) {
  return ssotClient.getProject(projectId);
}

export async function registerProject(projectId, projectType, options = {}) {
  return ssotClient.registerProject(projectId, projectType, options);
}

export async function allocatePort(projectId, environment, service) {
  return ssotClient.allocatePort(projectId, environment, service);
}

export async function findAvailablePort(environment, service) {
  return ssotClient.findAvailablePort(environment, service);
}

export async function setDomain(projectId, environment, domain, targetPort, prNumber = null) {
  return ssotClient.setDomain(projectId, environment, domain, targetPort, prNumber);
}

export async function getSSOTStatus() {
  return ssotClient.getStatus();
}

// CLI 직접 실행 시 상태 확인
if (process.argv[1]?.endsWith('ssot-client.js')) {
  (async () => {
    try {
      console.log(chalk.cyan('SSOT Client Status Check\n'));
      const status = await ssotClient.getStatus();
      console.log(JSON.stringify(status, null, 2));
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  })();
}

export default ssotClient;
