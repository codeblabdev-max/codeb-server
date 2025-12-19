#!/usr/bin/env node

/**
 * CodeB Deploy HTTP API Gateway
 *
 * Developer용 HTTP API 엔드포인트
 * SSH 없이 배포 가능하도록 MCP 도구를 HTTP로 노출
 *
 * 아키텍처:
 * Developer CLI → HTTP API (이 서버) → MCP 도구 실행 → 결과 반환
 *                     ↓
 *               다른 서버는 SSH로 제어
 *
 * 포트: 9100
 * 인증: X-API-Key 헤더
 */

import http from 'http';
import { URL } from 'url';

// Tool handlers import (index.ts와 동일한 import)
import { analyzeServer } from './tools/analyze-server.js';
import { initProject } from './tools/init-project.js';
import { executeDeploy } from './tools/deploy.js';
import { executeHealthcheck } from './tools/healthcheck.js';
import { executeRollback, getVersionHistory } from './tools/rollback.js';
import { executeNotify } from './tools/notify.js';
import { executeSecurityScan, generateSBOM } from './tools/security-scan.js';
import { executePreview } from './tools/preview.js';
import { executeMonitoring } from './tools/monitoring.js';
import { setupDomain, removeDomain, setupProjectDomains, setupPreviewDomain, checkDomainStatus } from './tools/domain.js';
import {
  configurePgHba,
  getContainerIP,
  initVolume,
  ensureNetwork,
} from './tools/podman-helpers.js';
import {
  deployComposeProject,
  stopComposeProject,
  removeComposeProject,
  generateGitHubActionsWorkflow,
} from './tools/compose-deploy.js';
import {
  getWorkflowErrors,
  analyzeBuildError,
  generateErrorReport,
} from './tools/github-actions.js';
import {
  getBuildErrors,
  validateFix,
  autoFixBuildLoop,
  generateFixPrompt,
} from './tools/self-healing.js';
import {
  monitorDisk,
  monitorSSL,
  checkBackupStatus,
  checkContainerHealth,
  fullHealthCheck,
  setupAutoBackup,
} from './tools/server-monitoring.js';
import { manageEnv, manageSecrets } from './tools/env-manager.js';
import { manageWorkflow, triggerBuildAndMonitor, checkBuildAndGetFeedback } from './tools/workflow-manager.js';
import {
  validateManifest,
  applyManifest,
  getManifest,
  listManifests,
  generateManifestTemplate,
} from './tools/manifest-manager.js';
import {
  ssotInitialize,
  ssotMigrate,
  ssotValidate,
  ssotGet,
  ssotRegisterProject,
  ssotGetProject,
  ssotListProjects,
  ssotSetDomain,
  ssotRemoveDomain,
  ssotAllocatePort,
  ssotReleasePort,
  ssotFindAvailablePort,
  ssotGetHistory,
  ssotSync,
} from './tools/ssot.js';
import {
  portRegistry,
  syncPortRegistryWithServer,
} from './lib/port-registry.js';
import {
  portGuard,
  portGitOps,
  loadManifest,
  findNextAvailablePort,
  releasePort,
} from './lib/port-manifest.js';
import {
  projectRegistry,
  loadProjectRegistryFromServer,
  scanExistingProjects,
  generateConfigForProject,
  getProjectRegistrySummary,
} from './lib/project-registry.js';
import { loadPortRegistryFromServer } from './lib/port-registry.js';

// ============================================================================
// Configuration
// ============================================================================

const HTTP_API_PORT = parseInt(process.env.CODEB_HTTP_API_PORT || '9100', 10);
const API_KEY = process.env.CODEB_API_KEY || '';

// API 키가 설정되지 않은 경우 경고
if (!API_KEY) {
  console.error('⚠️  WARNING: CODEB_API_KEY is not set. API will accept any request!');
  console.error('   Set CODEB_API_KEY environment variable for production use.');
}

// ============================================================================
// Tool Handler Map
// ============================================================================

type ToolHandler = (args: any) => Promise<any>;

const toolHandlers: Record<string, ToolHandler> = {
  // 서버 분석
  analyze_server: async (args) => analyzeServer(),

  // 프로젝트 초기화
  init_project: async (args) => initProject(args),

  // 배포
  deploy: async (args) => executeDeploy(args),

  // 헬스체크
  healthcheck: async (args) => executeHealthcheck(args),

  // 롤백
  rollback: async (args) => executeRollback(args),
  get_version_history: async (args) => getVersionHistory(args),

  // 알림
  notify: async (args) => executeNotify(args),

  // 보안
  security_scan: async (args) => executeSecurityScan(args),
  generate_sbom: async (args) => generateSBOM(args),

  // Preview 환경
  preview: async (args) => executePreview(args),

  // 모니터링
  monitoring: async (args) => executeMonitoring(args),

  // 포트 관리
  port_summary: async () => portRegistry.getSummary(),
  sync_port_registry: async () => syncPortRegistryWithServer(),

  // Port Manifest (GitOps)
  port_validate: async (args) => {
    const validation = await portGuard.validateBeforeDeploy(
      args.projectName,
      args.port,
      args.environment,
      {
        service: args.service || 'app',
        skipServerCheck: args.skipServerCheck,
      }
    );
    return {
      valid: validation.valid,
      port: args.port,
      project: args.projectName,
      environment: args.environment,
      errors: validation.errors,
      warnings: validation.warnings,
      reservation: validation.reservation ? {
        token: validation.reservation.token,
        expiresAt: validation.reservation.expiresAt,
      } : null,
      message: validation.valid
        ? `✅ Port ${args.port} validated for ${args.projectName}/${args.environment}`
        : `❌ Port ${args.port} validation FAILED: ${validation.errors.map((e: any) => e.message).join('; ')}`,
    };
  },

  port_drift: async (args) => {
    const driftReport = await portGitOps.detectDrift();
    if (args.autoFix && args.autoFix !== 'none') {
      const reconcileResult = await portGitOps.reconcile({
        dryRun: args.dryRun,
        autoFix: args.autoFix,
      });
      return {
        ...driftReport,
        reconciliation: reconcileResult,
        message: driftReport.hasDrift
          ? `🔍 Found ${driftReport.drifts.length} drift(s). ${reconcileResult.actions.length} actions ${args.dryRun ? 'would be' : 'were'} taken.`
          : '✅ No drift detected. Manifest and server are in sync.',
      };
    }
    return {
      ...driftReport,
      message: driftReport.hasDrift
        ? `🔍 Found ${driftReport.drifts.length} drift(s). Use autoFix='manifest' or autoFix='server' to reconcile.`
        : '✅ No drift detected. Manifest and server are in sync.',
    };
  },

  port_manifest: async (args) => {
    switch (args.action) {
      case 'get':
        const manifest = await loadManifest(true);
        return {
          manifest,
          summary: {
            staging: Object.keys(manifest.ports.staging).length,
            production: Object.keys(manifest.ports.production).length,
            preview: Object.keys(manifest.ports.preview).length,
          },
          message: '📋 Current port manifest loaded',
        };
      case 'find-available':
        if (!args.environment) throw new Error('environment is required');
        const availablePort = await findNextAvailablePort(args.environment, args.service || 'app');
        return {
          port: availablePort,
          environment: args.environment,
          service: args.service || 'app',
          message: `✅ Next available ${args.service || 'app'} port for ${args.environment}: ${availablePort}`,
        };
      case 'release':
        if (!args.environment || !args.port) throw new Error('environment and port are required');
        const released = await releasePort(args.port, args.environment);
        return {
          released,
          port: args.port,
          environment: args.environment,
          message: released
            ? `✅ Port ${args.port} released in ${args.environment}`
            : `⚠️ Port ${args.port} not found in ${args.environment} manifest`,
        };
      default:
        throw new Error(`Unknown action: ${args.action}`);
    }
  },

  // 도메인 관리
  setup_domain: async (args) => setupDomain(args),
  remove_domain: async (args) => removeDomain(args),
  setup_project_domains: async (args) => setupProjectDomains(args),
  setup_preview_domain: async (args) => setupPreviewDomain(args),
  check_domain_status: async (args) => checkDomainStatus(args.domain),

  // Podman 헬퍼
  configure_pg_hba: async (args) => configurePgHba(args),
  get_container_ip: async (args) => getContainerIP(args.containerName),
  init_volume: async (args) => initVolume(args),
  ensure_network: async (args) => ensureNetwork(args),

  // Compose 배포
  deploy_compose_project: async (args) => {
    return deployComposeProject({
      projectName: args.projectName,
      projectPath: args.projectPath,
      services: {
        app: args.app,
        postgres: args.postgres ? {
          enabled: args.postgres.enabled ?? true,
          port: args.postgres.port,
          database: args.postgres.database,
          user: args.postgres.user || args.postgres.username,
          password: args.postgres.password,
          version: args.postgres.version,
        } : undefined,
        redis: args.redis,
      },
      domain: args.domain,
      networkName: args.network?.name || args.networkName,
      ghcrAuth: args.ghcrAuth,
    });
  },
  stop_compose_project: async (args) => {
    const projectName = args.environment ? `${args.projectName}-${args.environment}` : args.projectName;
    return stopComposeProject(projectName);
  },
  remove_compose_project: async (args) => {
    const projectName = args.environment ? `${args.projectName}-${args.environment}` : args.projectName;
    return removeComposeProject(projectName, args.removeVolumes || false);
  },
  generate_github_actions_workflow: async (args) => generateGitHubActionsWorkflow(args),

  // 프로젝트 레지스트리
  scan_existing_projects: async (args) => {
    const scanResult = await scanExistingProjects();
    if (args?.generateConfigs) {
      for (const project of scanResult.projects) {
        await generateConfigForProject(project.name);
      }
    }
    return scanResult;
  },
  list_projects: async (args) => {
    const statusFilter = args?.status || 'all';
    let projects = projectRegistry.getAllProjects();
    if (statusFilter === 'active') {
      projects = projects.filter((p) => p.status === 'active');
    } else if (statusFilter === 'inactive') {
      projects = projects.filter((p) => p.status === 'inactive');
    }
    return { projects, total: projects.length };
  },
  get_project: async (args) => {
    const project = projectRegistry.getProject(args.projectName);
    if (!project) throw new Error(`Project not found: ${args.projectName}`);
    return project;
  },
  generate_project_config: async (args) => generateConfigForProject(args.projectName),
  project_registry_summary: async () => getProjectRegistrySummary(),

  // GitHub Actions 에러 분석
  get_workflow_errors: async (args) => getWorkflowErrors(args),
  analyze_build_error: async (args) => analyzeBuildError(args),
  generate_error_report: async (args) => ({
    report: generateErrorReport(args.errors, args.analyses || []),
    errorCount: args.errors.length,
    analysisCount: (args.analyses || []).length,
  }),

  // Self-Healing CI/CD
  get_build_errors: async (args) => getBuildErrors(args),
  validate_fix: async (args) => validateFix(args),
  auto_fix_build_loop: async (args) => autoFixBuildLoop(args),
  generate_fix_prompt: async (args) => ({ prompt: generateFixPrompt(args.errors) }),

  // 서버 모니터링
  monitor_disk: async () => monitorDisk(),
  monitor_ssl: async (args) => monitorSSL(args?.domains),
  check_backup_status: async () => checkBackupStatus(),
  check_container_health: async () => checkContainerHealth(),
  full_health_check: async () => fullHealthCheck(),
  setup_auto_backup: async (args) => setupAutoBackup(args),

  // 환경 변수 & 시크릿
  manage_env: async (args) => manageEnv(args),
  manage_secrets: async (args) => manageSecrets(args),

  // 워크플로우 관리
  manage_workflow: async (args) => manageWorkflow(args),
  trigger_build_and_monitor: async (args) => triggerBuildAndMonitor(args),
  check_build_and_get_feedback: async (args) => checkBuildAndGetFeedback(args),

  // 매니페스트 관리
  validate_manifest: async (args) => validateManifest(args.content),
  apply_manifest: async (args) => applyManifest(args.content),
  get_manifest: async (args) => getManifest(args.projectId),
  list_manifests: async () => listManifests(),
  generate_manifest_template: async (args) => ({
    template: generateManifestTemplate(args.projectId, args.projectType || 'nextjs'),
  }),

  // SSOT
  ssot_initialize: async (args) => ssotInitialize(args),
  ssot_migrate: async (args) => ssotMigrate(args),
  ssot_validate: async (args) => ssotValidate(args),
  ssot_get: async (args) => ssotGet(args),
  ssot_register_project: async (args) => ssotRegisterProject(args),
  ssot_get_project: async (args) => ssotGetProject(args),
  ssot_list_projects: async (args) => ssotListProjects(args),
  ssot_set_domain: async (args) => ssotSetDomain(args),
  ssot_remove_domain: async (args) => ssotRemoveDomain(args),
  ssot_allocate_port: async (args) => ssotAllocatePort(args),
  ssot_release_port: async (args) => ssotReleasePort(args),
  ssot_find_available_port: async (args) => ssotFindAvailablePort(args),
  ssot_get_history: async (args) => ssotGetHistory(args),
  ssot_sync: async (args) => ssotSync(args),
};

// ============================================================================
// HTTP Server
// ============================================================================

/**
 * API 키 검증
 */
function validateApiKey(req: http.IncomingMessage): boolean {
  // API 키가 설정되지 않으면 모든 요청 허용 (개발 환경용)
  if (!API_KEY) return true;

  const providedKey = req.headers['x-api-key'];
  return providedKey === API_KEY;
}

/**
 * JSON 응답 전송
 */
function sendJson(res: http.ServerResponse, statusCode: number, data: any) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

/**
 * 에러 응답 전송
 */
function sendError(res: http.ServerResponse, statusCode: number, message: string, details?: any) {
  sendJson(res, statusCode, {
    success: false,
    error: message,
    details,
    timestamp: new Date().toISOString(),
  });
}

/**
 * 요청 바디 파싱
 */
async function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * 요청 핸들러
 */
async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method || 'GET';

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end();
    return;
  }

  // Health check endpoint (인증 없음)
  if (pathname === '/health' && method === 'GET') {
    sendJson(res, 200, {
      status: 'healthy',
      service: 'codeb-deploy-http-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // API 키 검증
  if (!validateApiKey(req)) {
    sendError(res, 401, 'Unauthorized: Invalid or missing API key');
    return;
  }

  // 도구 목록 조회
  if (pathname === '/api/tools' && method === 'GET') {
    const availableTools = Object.keys(toolHandlers);
    sendJson(res, 200, {
      success: true,
      tools: availableTools,
      count: availableTools.length,
    });
    return;
  }

  // 도구 실행
  if (pathname === '/api/tool' && method === 'POST') {
    try {
      const body = await parseBody(req);
      const { tool, params } = body;

      if (!tool) {
        sendError(res, 400, 'Missing required field: tool');
        return;
      }

      const handler = toolHandlers[tool];
      if (!handler) {
        sendError(res, 404, `Unknown tool: ${tool}`, {
          availableTools: Object.keys(toolHandlers),
        });
        return;
      }

      console.log(`[HTTP API] Executing tool: ${tool}`);
      console.log(`[HTTP API] Params:`, JSON.stringify(params, null, 2));

      const startTime = Date.now();
      const result = await handler(params || {});
      const duration = Date.now() - startTime;

      console.log(`[HTTP API] Tool ${tool} completed in ${duration}ms`);

      sendJson(res, 200, {
        success: true,
        tool,
        result,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error(`[HTTP API] Error:`, error);
      sendError(res, 500, error instanceof Error ? error.message : String(error));
    }
    return;
  }

  // 서버 정보
  if (pathname === '/api/info' && method === 'GET') {
    sendJson(res, 200, {
      success: true,
      server: 'CodeB Deploy HTTP API Gateway',
      version: '1.0.0',
      description: 'HTTP API for Developer access without SSH',
      endpoints: {
        health: { method: 'GET', path: '/health', auth: false },
        tools: { method: 'GET', path: '/api/tools', auth: true },
        tool: { method: 'POST', path: '/api/tool', auth: true, body: '{ tool: string, params: object }' },
        info: { method: 'GET', path: '/api/info', auth: true },
      },
      authentication: {
        header: 'X-API-Key',
        required: !!API_KEY,
      },
    });
    return;
  }

  // 404
  sendError(res, 404, `Not found: ${method} ${pathname}`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  // 레지스트리 초기 로드
  console.log('[HTTP API] Loading registries...');

  try {
    await loadPortRegistryFromServer();
    console.log('[HTTP API] Port registry loaded');
  } catch (error) {
    console.error('[HTTP API] Failed to load port registry:', error);
  }

  try {
    await loadProjectRegistryFromServer();
    console.log('[HTTP API] Project registry loaded');
  } catch (error) {
    console.error('[HTTP API] Failed to load project registry:', error);
  }

  // HTTP 서버 시작
  const server = http.createServer(handleRequest);

  server.listen(HTTP_API_PORT, '0.0.0.0', () => {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║       CodeB Deploy HTTP API Gateway                        ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  🌐 Listening on: http://0.0.0.0:${HTTP_API_PORT}                    ║`);
    console.log(`║  🔑 API Key: ${API_KEY ? 'CONFIGURED' : 'NOT SET (accepting all)'}                        ║`);
    console.log(`║  📡 Endpoints:                                             ║`);
    console.log(`║     GET  /health     - Health check (no auth)             ║`);
    console.log(`║     GET  /api/tools  - List available tools               ║`);
    console.log(`║     POST /api/tool   - Execute a tool                     ║`);
    console.log(`║     GET  /api/info   - Server information                 ║`);
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[HTTP API] Received SIGTERM, shutting down...');
    server.close(() => {
      console.log('[HTTP API] Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('[HTTP API] Received SIGINT, shutting down...');
    server.close(() => {
      console.log('[HTTP API] Server closed');
      process.exit(0);
    });
  });
}

main().catch((error) => {
  console.error('[HTTP API] Fatal error:', error);
  process.exit(1);
});
