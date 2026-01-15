/**
 * MCP HTTP API Module
 *
 * CodeB HTTP API 통신 전용 모듈
 * - API 키 기반 인증
 * - HTTP API 엔드포인트 호출
 * - 폴백 URL 지원
 *
 * @module mcp-http
 * @version 3.0.0
 */

import chalk from 'chalk';
import { getCliVersion } from './config.js';

// ============================================================================
// 상수 및 설정
// ============================================================================

export const CONNECTION_TIMEOUT = 30000; // 30초
export const HTTP_API_PORT = 9101; // MCP HTTP API 포트 (9100은 node-exporter 사용)

// CodeB HTTP API (v3.1.1+) - Primary API for all operations
export const CODEB_API_BASE_URL = process.env.CODEB_API_URL || 'https://api.codeb.kr/api';
export const CODEB_API_FALLBACK_URL = 'http://158.247.203.55:9101/api';

// Dashboard API (Next.js web-ui) - Legacy, for backward compatibility
export const DASHBOARD_API_URL = process.env.CODEB_DASHBOARD_URL || 'http://localhost:3000/api';

export const HTTP_API_MODE_INFO = `
${chalk.bgCyan.black(' 🌐 HTTP API MODE ')}
${chalk.cyan('Using HTTP API for deployment (no SSH required)')}
`;

// ============================================================================
// HTTP API 호출 함수
// ============================================================================

/**
 * HTTP API 호출 (레거시 - 직접 서버)
 * @deprecated Use callCodeBApi instead for new v3.1.1+ API
 */
export async function callHttpApi(serverHost, apiKey, endpoint, method = 'POST', body = {}) {
  if (!serverHost) {
    throw new Error('Server configuration not found. Run "we config init" first.');
  }

  const url = `http://${serverHost}:${HTTP_API_PORT}/api/${endpoint}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey || '',
        'X-Client': 'we-cli',
      },
      body: method !== 'GET' ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(CONNECTION_TIMEOUT),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new Error('HTTP API request timeout');
    }
    throw error;
  }
}

/**
 * CodeB HTTP API 호출 (v3.1.1+ Blue-Green Slot API)
 * Primary method for all operations
 */
export async function callCodeBApi(apiKey, toolName, params = {}) {
  const urls = [CODEB_API_BASE_URL, CODEB_API_FALLBACK_URL];
  let lastError = null;

  for (const baseUrl of urls) {
    try {
      const response = await fetch(`${baseUrl}/tool`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey || process.env.CODEB_API_KEY || '',
          'X-Client': `we-cli/${getCliVersion()}`,
        },
        body: JSON.stringify({
          tool: toolName,
          params: params,
        }),
        signal: AbortSignal.timeout(CONNECTION_TIMEOUT),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.message || `HTTP ${response.status}`);
      }

      // Extract result from response
      if (result.success && result.result !== undefined) {
        return result.result;
      }

      return result;
    } catch (error) {
      lastError = error;
      // Try next URL
      continue;
    }
  }

  throw lastError || new Error('All API endpoints failed');
}

/**
 * ENV 파일 업로드 (MCP API via HTTP)
 * SSH 없이 HTTP API를 통해 ENV 파일을 서버에 업로드
 */
export async function envUpload(serverHost, apiKey, params = {}) {
  const { project, environment = 'production', content, variables, restart = true } = params;

  if (!project) {
    throw new Error('project is required');
  }

  if (!content && !variables) {
    throw new Error('content or variables is required');
  }

  // Dashboard API 직접 호출 (HTTP API Mode)
  const apiUrl = serverHost
    ? `http://${serverHost}:3000/api/env`
    : DASHBOARD_API_URL + '/env';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey || '',
        'X-Client': 'we-cli',
      },
      body: JSON.stringify({
        project,
        environment,
        action: 'upload',
        content,
        variables,
        restart,
      }),
      signal: AbortSignal.timeout(CONNECTION_TIMEOUT),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }

    return response.json();
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new Error('ENV upload request timeout');
    }
    throw error;
  }
}

// ============================================================================
// Blue-Green Slot API (v3.1.1+) - HTTP API 기반
// ============================================================================

/**
 * Workflow Scan - 기존 프로젝트 분석 및 Blue-Green Slot 워크플로우 생성
 */
export async function workflowScan(apiKey, projectName, options = {}) {
  return callCodeBApi(apiKey, 'workflow_scan', {
    projectName,
    gitRepo: options.gitRepo,
    autoFix: options.autoFix || false,
  });
}

/**
 * Workflow Update - Blue-Green Slot 워크플로우 적용
 */
export async function workflowUpdate(apiKey, projectName, options = {}) {
  return callCodeBApi(apiKey, 'workflow_update', {
    projectName,
    dryRun: options.dryRun || false,
    force: options.force || false,
  });
}

/**
 * Deploy (v3.1.1+) - Blue-Green Slot 배포
 */
export async function deployBlueGreen(apiKey, projectName, environment = 'production', options = {}) {
  return callCodeBApi(apiKey, 'deploy', {
    projectName,
    environment,
    image: options.image,
    skipHealthcheck: options.skipHealthcheck || false,
    autoPromote: options.autoPromote || false,
  });
}

/**
 * Promote - 트래픽 전환
 */
export async function promote(apiKey, projectName, environment = 'production', targetSlot = null) {
  return callCodeBApi(apiKey, 'promote', {
    projectName,
    environment,
    targetSlot,
  });
}

/**
 * Rollback (v3.1.1+) - 이전 슬롯으로 롤백
 */
export async function rollbackBlueGreen(apiKey, projectName, environment = 'production') {
  return callCodeBApi(apiKey, 'rollback', {
    projectName,
    environment,
  });
}

/**
 * Slot Status - 슬롯 상태 확인
 */
export async function slotStatus(apiKey, projectName, environment = 'production') {
  return callCodeBApi(apiKey, 'slot_status', {
    projectName,
    environment,
  });
}

/**
 * Slot List - 프로젝트 슬롯 목록
 */
export async function slotList(apiKey, projectName = null, environment = null) {
  return callCodeBApi(apiKey, 'slot_list', {
    projectName,
    environment,
  });
}

/**
 * Slot Cleanup - 만료된 grace-period 슬롯 정리
 */
export async function slotCleanup(apiKey, projectName = null, environment = null, force = false) {
  return callCodeBApi(apiKey, 'slot_cleanup', {
    projectName,
    environment,
    force,
  });
}

/**
 * Full Health Check (v3.1.1+) - HTTP API 기반
 */
export async function healthCheckBlueGreen(apiKey) {
  return callCodeBApi(apiKey, 'full_health_check', {});
}

/**
 * List Projects (v3.1.1+) - HTTP API 기반
 */
export async function listProjectsBlueGreen(apiKey) {
  return callCodeBApi(apiKey, 'list_projects', {});
}

/**
 * Get Project (v3.1.1+) - HTTP API 기반
 */
export async function getProjectBlueGreen(apiKey, projectName) {
  return callCodeBApi(apiKey, 'get_project', { projectName });
}

// ============================================================================
// Exports
// ============================================================================

export default {
  callHttpApi,
  callCodeBApi,
  envUpload,
  workflowScan,
  workflowUpdate,
  deployBlueGreen,
  promote,
  rollbackBlueGreen,
  slotStatus,
  slotList,
  slotCleanup,
  healthCheckBlueGreen,
  listProjectsBlueGreen,
  getProjectBlueGreen,
  CONNECTION_TIMEOUT,
  HTTP_API_PORT,
  CODEB_API_BASE_URL,
  CODEB_API_FALLBACK_URL,
  DASHBOARD_API_URL,
  HTTP_API_MODE_INFO,
};
