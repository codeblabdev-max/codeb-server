/**
 * MCP Client - Hybrid Architecture
 *
 * 하이브리드 전략:
 * 1. 정상 경로: MCP Server (codeb-deploy)를 통한 도구 호출
 * 2. 폴백 경로: SSH 직접 통신 (긴급 상황)
 *
 * Claude Code와 Human 모두 동일한 MCP 경로 사용
 * SSOT (Single Source of Truth)는 MCP Server가 관리
 *
 * @author CodeB Team
 * @version 3.0.0 (Refactored - split into mcp-http.js + mcp-ssh.js)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

import {
  getServerHost,
  getServerUser,
  getBaseDomain,
  getApiKey,
  isBlockedServer,
} from './config.js';

// Import from split modules
import {
  callHttpApi as callHttpApiImpl,
  callCodeBApi as callCodeBApiImpl,
  envUpload as envUploadImpl,
  CONNECTION_TIMEOUT,
  HTTP_API_MODE_INFO,
} from './mcp-http.js';

import {
  checkSSHAccess as checkSSHAccessImpl,
  callToolFallback as callToolFallbackImpl,
  FALLBACK_MODE_WARNING,
} from './mcp-ssh.js';

// ============================================================================
// 상수 및 설정
// ============================================================================

const MCP_SERVER_NAME = 'codeb-deploy';

// ============================================================================
// MCP Client 클래스 (Thin Client)
// ============================================================================

class MCPClient {
  constructor() {
    this.client = null;
    this.transport = null;
    this.connected = false;
    this.fallbackMode = false;
    this.httpApiMode = false; // HTTP API 모드 (Developer용)
    this.config = null;
    this.serverHost = null;
    this.serverUser = null;
    this.baseDomain = null;
    this.apiKey = null;
    this._fallbackWarningShown = false;
  }

  /**
   * MCP 설정 로드
   */
  loadConfig() {
    if (this.config) return this.config;

    // 설정 파일 우선순위
    const configPaths = [
      join(process.cwd(), '.mcp.json'),
      join(homedir(), '.config', 'claude', 'claude_desktop_config.json'),
      join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    ];

    for (const configPath of configPaths) {
      try {
        if (existsSync(configPath)) {
          const content = readFileSync(configPath, 'utf8');
          const config = JSON.parse(content);

          if (config.mcpServers?.[MCP_SERVER_NAME]) {
            this.config = config.mcpServers[MCP_SERVER_NAME];

            // 환경변수에서 서버 정보 추출
            if (this.config.env) {
              this.serverHost = this.config.env.CODEB_SERVER_HOST;
              this.serverUser = this.config.env.CODEB_SERVER_USER || 'root';
            }

            return this.config;
          }
        }
      } catch (e) {
        // 다음 설정 파일 시도
      }
    }

    // Fallback: config.js에서 로드
    this.serverHost = getServerHost();
    this.serverUser = getServerUser();
    this.baseDomain = getBaseDomain();

    // API Key 로드 (Developer 모드용)
    try {
      this.apiKey = getApiKey();
    } catch (e) {
      // API Key 없으면 SSH 모드로 동작
    }

    return null;
  }

  /**
   * SSH 접근 가능 여부 확인
   * 차단된 서버는 접근 거부
   */
  async checkSSHAccess() {
    if (!this.serverHost) {
      this.loadConfig();
    }
    return checkSSHAccessImpl(this.serverHost, this.serverUser);
  }

  /**
   * HTTP API 모드 활성화 (Developer용)
   */
  enableHttpApiMode() {
    this.httpApiMode = true;
    console.log(HTTP_API_MODE_INFO);
  }

  /**
   * HTTP API 호출 (Developer용 - SSH 없이 배포)
   * @deprecated Use callCodeBApi instead for new v3.1.1+ API
   */
  async callHttpApi(endpoint, method = 'POST', body = {}) {
    if (!this.serverHost) {
      this.loadConfig();
    }
    return callHttpApiImpl(this.serverHost, this.apiKey, endpoint, method, body);
  }

  /**
   * CodeB HTTP API 호출 (v3.1.1+ Blue-Green Slot API)
   * Primary method for all operations
   */
  async callCodeBApi(toolName, params = {}) {
    this.loadConfig();
    return callCodeBApiImpl(this.apiKey, toolName, params);
  }

  /**
   * MCP Server 연결
   * v7.0: API 키가 있으면 HTTP API 모드 사용 (MCP Stdio 불필요)
   */
  async connect() {
    if (this.connected) return true;

    this.loadConfig();

    // v7.0: API 키가 있으면 HTTP API 모드로 전환 (MCP Stdio 불필요)
    if (this.apiKey && !this.config) {
      this.httpApiMode = true;
      return false; // MCP Stdio 연결 안함, HTTP API 사용
    }

    if (!this.config) {
      console.log(chalk.yellow('MCP config not found and no API key. Run "we init <api-key>" first.'));
      this.fallbackMode = true;
      return false;
    }

    try {
      // MCP Server 프로세스 시작
      this.transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args || [],
        env: { ...process.env, ...this.config.env },
      });

      this.client = new Client({
        name: 'we-cli',
        version: '3.0.0',
      }, {
        capabilities: {},
      });

      await this.client.connect(this.transport);
      this.connected = true;
      this.fallbackMode = false;

      return true;
    } catch (error) {
      console.log(chalk.yellow(`MCP connection failed: ${error.message}`));
      console.log(chalk.yellow('Switching to fallback mode...'));
      this.fallbackMode = true;
      return false;
    }
  }

  /**
   * 연결 해제
   */
  async disconnect() {
    if (this.client && this.connected) {
      try {
        await this.client.close();
      } catch (e) {
        // 무시
      }
    }
    this.connected = false;
    this.client = null;
    this.transport = null;
  }

  /**
   * MCP 도구 호출 (메인 메서드)
   *
   * 우선순위:
   * 1. MCP Server (Stdio 연결)
   * 2. HTTP API (Developer용 - SSH 없이)
   * 3. SSH Fallback (Admin용)
   *
   * @param {string} toolName - MCP 도구 이름 (예: 'ssot_get', 'deploy')
   * @param {object} params - 도구 파라미터
   * @param {object} options - 옵션 (forceFallback, forceHttpApi)
   * @returns {Promise<object>} 도구 실행 결과
   */
  async callTool(toolName, params = {}, options = {}) {
    const { forceFallback = false, forceHttpApi = false } = options;

    // HTTP API 모드 강제 (Developer용)
    if (forceHttpApi || this.httpApiMode) {
      return this.callToolViaHttpApi(toolName, params);
    }

    // SSH 폴백 모드 강제
    if (forceFallback || this.fallbackMode) {
      return this.callToolFallback(toolName, params);
    }

    // MCP 연결 시도
    const connected = await this.connect();
    if (!connected) {
      // MCP 연결 실패 시 HTTP API 시도, 그 후 SSH Fallback
      return this.callToolWithFallbackChain(toolName, params);
    }

    try {
      // MCP 도구 호출
      const result = await this.client.callTool({
        name: toolName,
        arguments: params,
      });

      // 결과 파싱
      if (result.content && result.content.length > 0) {
        const content = result.content[0];
        if (content.type === 'text') {
          try {
            return JSON.parse(content.text);
          } catch {
            return { raw: content.text };
          }
        }
      }

      return result;
    } catch (error) {
      console.log(chalk.yellow(`MCP tool call failed: ${error.message}`));
      return this.callToolWithFallbackChain(toolName, params);
    }
  }

  /**
   * HTTP API를 통한 도구 호출 (Developer용)
   * v7.0: callCodeBApi 사용 (api.codeb.kr)
   */
  async callToolViaHttpApi(toolName, params = {}) {
    try {
      // v7.0: callCodeBApi 사용 (이미 결과 추출 포함)
      return await this.callCodeBApi(toolName, params);
    } catch (error) {
      // HTTP API 실패 시 SSH Fallback은 시도하지 않음 (Developer는 SSH 없음)
      throw new Error(`HTTP API failed: ${error.message}`);
    }
  }

  /**
   * 폴백 체인: HTTP API → SSH
   */
  async callToolWithFallbackChain(toolName, params) {
    // 먼저 HTTP API 시도
    if (this.apiKey) {
      try {
        return await this.callToolViaHttpApi(toolName, params);
      } catch (httpError) {
        console.log(chalk.yellow(`HTTP API failed: ${httpError.message}`));
      }
    }

    // HTTP API 실패 또는 API Key 없으면 SSH Fallback
    console.log(chalk.yellow('Falling back to SSH...'));
    return this.callToolFallback(toolName, params);
  }

  /**
   * SSH 폴백 도구 호출
   */
  async callToolFallback(toolName, params = {}) {
    if (!this.serverHost) {
      this.loadConfig();
    }

    const showWarning = !this._fallbackWarningShown;
    if (showWarning) {
      this._fallbackWarningShown = true;
    }

    return callToolFallbackImpl(this.serverHost, this.serverUser, toolName, params, showWarning);
  }

  // ============================================================================
  // 고수준 API (편의 메서드)
  // ============================================================================

  /**
   * SSOT 상태 조회
   */
  async getSSOT() {
    return this.callTool('ssot_get');
  }

  /**
   * 프로젝트 목록 조회
   */
  async listProjects(status = 'all') {
    return this.callTool('ssot_list_projects', { status });
  }

  /**
   * 프로젝트 상세 조회
   */
  async getProject(projectId) {
    return this.callTool('ssot_get_project', { projectId });
  }

  /**
   * 전체 헬스체크
   */
  async fullHealthCheck() {
    return this.callTool('full_health_check');
  }

  /**
   * 서버 분석
   */
  async analyzeServer(options = {}) {
    return this.callTool('analyze_server', {
      includeContainers: options.containers !== false,
      includePm2: options.pm2 !== false,
      includePorts: options.ports !== false,
      includeDatabases: options.databases !== false,
      includeRegistry: options.registry !== false,
    });
  }

  /**
   * 프로젝트 배포
   */
  async deploy(projectName, environment, options = {}) {
    return this.callTool('deploy', {
      projectName,
      environment,
      strategy: options.strategy || 'rolling',
      skipHealthcheck: options.skipHealthcheck || false,
      skipTests: options.skipTests || false,
    });
  }

  /**
   * 도메인 설정
   */
  async setupDomain(params) {
    return this.callTool('setup_domain', params);
  }

  /**
   * 도메인 상태 확인
   */
  async checkDomainStatus(domain) {
    return this.callTool('check_domain_status', { domain });
  }

  /**
   * 포트 검증
   */
  async validatePort(projectName, port, environment, service = 'app') {
    return this.callTool('port_validate', {
      projectName,
      port,
      environment,
      service,
    });
  }

  /**
   * 사용 가능한 포트 찾기
   */
  async findAvailablePort(environment, service) {
    return this.callTool('ssot_find_available_port', {
      environment,
      service,
    });
  }

  /**
   * 포트 할당
   */
  async allocatePort(projectId, environment, service) {
    return this.callTool('ssot_allocate_port', {
      projectId,
      environment,
      service,
    });
  }

  /**
   * 롤백
   */
  async rollback(projectName, environment, options = {}) {
    return this.callTool('rollback', {
      projectName,
      environment,
      targetVersion: options.version,
      reason: options.reason,
      dryRun: options.dryRun || false,
    });
  }

  /**
   * 프로젝트 초기화
   */
  async initProject(params) {
    return this.callTool('init_project', params);
  }

  /**
   * SSOT 프로젝트 등록
   */
  async registerProject(projectId, projectType, options = {}) {
    return this.callTool('ssot_register_project', {
      projectId,
      projectType,
      description: options.description,
      gitRepo: options.gitRepo,
    });
  }

  /**
   * SSOT 도메인 설정
   */
  async setDomain(projectId, environment, domain, targetPort, prNumber = null) {
    return this.callTool('ssot_set_domain', {
      projectId,
      environment,
      domain,
      targetPort,
      prNumber,
    });
  }

  /**
   * SSOT 검증
   */
  async validateSSOT(autoFix = false) {
    return this.callTool('ssot_validate', { autoFix });
  }

  /**
   * SSOT 동기화
   */
  async syncSSOT(options = {}) {
    return this.callTool('ssot_sync', {
      dryRun: options.dryRun || false,
      components: options.components || ['caddy', 'dns', 'containers'],
    });
  }

  /**
   * GitHub Actions 에러 조회
   */
  async getWorkflowErrors(owner, repo, options = {}) {
    return this.callTool('get_workflow_errors', {
      owner,
      repo,
      branch: options.branch,
      limit: options.limit || 10,
    });
  }

  /**
   * 빌드 에러 분석
   */
  async analyzeBuildError(error, projectPath = null) {
    return this.callTool('analyze_build_error', {
      error,
      projectPath,
    });
  }

  /**
   * 모니터링 상태
   */
  async getMonitoringStatus(action = 'status') {
    return this.callTool('monitoring', { action });
  }

  /**
   * Preview 환경 관리
   */
  async managePreview(action, projectName, options = {}) {
    return this.callTool('preview', {
      action,
      projectName,
      prNumber: options.prNumber,
      gitRef: options.gitRef,
      ttlHours: options.ttlHours,
    });
  }

  /**
   * ENV 파일 업로드 (MCP API via HTTP)
   * SSH 없이 HTTP API를 통해 ENV 파일을 서버에 업로드
   */
  async envUpload(params = {}) {
    if (!this.serverHost) {
      this.loadConfig();
    }
    return envUploadImpl(this.serverHost, this.apiKey, params);
  }

  // ============================================================================
  // Blue-Green Slot API (v3.1.1+) - HTTP API 기반
  // ============================================================================

  /**
   * Workflow Scan - 기존 프로젝트 분석 및 Blue-Green Slot 워크플로우 생성
   */
  async workflowScan(projectName, options = {}) {
    return this.callCodeBApi('workflow_scan', {
      projectName,
      gitRepo: options.gitRepo,
      autoFix: options.autoFix || false,
    });
  }

  /**
   * Workflow Update - Blue-Green Slot 워크플로우 적용
   */
  async workflowUpdate(projectName, options = {}) {
    return this.callCodeBApi('workflow_update', {
      projectName,
      dryRun: options.dryRun || false,
      force: options.force || false,
    });
  }

  /**
   * Deploy (v3.1.1+) - Blue-Green Slot 배포
   */
  async deployBlueGreen(projectName, environment = 'production', options = {}) {
    return this.callCodeBApi('deploy', {
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
  async promote(projectName, environment = 'production', targetSlot = null) {
    return this.callCodeBApi('promote', {
      projectName,
      environment,
      targetSlot,
    });
  }

  /**
   * Rollback (v3.1.1+) - 이전 슬롯으로 롤백
   */
  async rollbackBlueGreen(projectName, environment = 'production') {
    return this.callCodeBApi('rollback', {
      projectName,
      environment,
    });
  }

  /**
   * Slot Status - 슬롯 상태 확인
   */
  async slotStatus(projectName, environment = 'production') {
    return this.callCodeBApi('slot_status', {
      projectName,
      environment,
    });
  }

  /**
   * Slot List - 프로젝트 슬롯 목록
   */
  async slotList(projectName = null, environment = null) {
    return this.callCodeBApi('slot_list', {
      projectName,
      environment,
    });
  }

  /**
   * Slot Cleanup - 만료된 grace-period 슬롯 정리
   */
  async slotCleanup(projectName = null, environment = null, force = false) {
    return this.callCodeBApi('slot_cleanup', {
      projectName,
      environment,
      force,
    });
  }

  /**
   * Full Health Check (v3.1.1+) - HTTP API 기반
   */
  async healthCheckBlueGreen() {
    return this.callCodeBApi('full_health_check', {});
  }

  /**
   * List Projects (v3.1.1+) - HTTP API 기반
   */
  async listProjectsBlueGreen() {
    return this.callCodeBApi('list_projects', {});
  }

  /**
   * Get Project (v3.1.1+) - HTTP API 기반
   */
  async getProjectBlueGreen(projectName) {
    return this.callCodeBApi('get_project', { projectName });
  }

  // ============================================================================
  // 유틸리티 메서드
  // ============================================================================

  /**
   * 연결 보장 (연결되지 않았으면 연결 시도)
   * @returns {Promise<boolean>} 연결 성공 여부
   */
  async ensureConnected() {
    if (this.connected && !this.fallbackMode) {
      return true;
    }
    return this.connect();
  }

  /**
   * 연결 상태 확인
   */
  isConnected() {
    return this.connected && !this.fallbackMode;
  }

  /**
   * 폴백 모드 확인
   */
  isFallbackMode() {
    return this.fallbackMode;
  }

  /**
   * HTTP API 모드 확인
   */
  isHttpApiMode() {
    return this.httpApiMode;
  }

  /**
   * MCP 서버 정보 출력
   */
  getServerInfo() {
    return {
      connected: this.connected,
      fallbackMode: this.fallbackMode,
      httpApiMode: this.httpApiMode,
      serverHost: this.serverHost,
      serverUser: this.serverUser,
      baseDomain: this.baseDomain || getBaseDomain(),
      hasApiKey: !!this.apiKey,
    };
  }

  /**
   * 연결 모드 자동 감지 및 설정
   * Admin (SSH 가능) vs Developer (HTTP API만)
   */
  async autoDetectMode() {
    this.loadConfig();

    // SSH 접근 체크
    const hasSSH = await this.checkSSHAccess();

    if (hasSSH) {
      // Admin 모드: MCP → SSH Fallback
      this.httpApiMode = false;
      console.log(chalk.green('✓ Admin mode (SSH access available)'));
      return 'admin';
    } else if (this.apiKey) {
      // Developer 모드: HTTP API만
      this.httpApiMode = true;
      console.log(chalk.cyan('✓ Developer mode (HTTP API)'));
      return 'developer';
    } else {
      // 설정 필요
      console.log(chalk.yellow('⚠ No access configured'));
      console.log(chalk.gray('  Admin: Set up SSH key to server'));
      console.log(chalk.gray('  Developer: Set CODEB_API_KEY in ~/.codeb/config.json'));
      return 'none';
    }
  }

  /**
   * 사용 가능한 도구 목록 조회
   */
  async listTools() {
    if (!this.connected) {
      const connected = await this.connect();
      if (!connected) {
        return { error: 'Not connected to MCP server' };
      }
    }

    try {
      const tools = await this.client.listTools();
      return tools;
    } catch (error) {
      return { error: error.message };
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const mcpClient = new MCPClient();

// 기존 호환성을 위한 개별 함수 export
export async function callTool(toolName, params = {}, options = {}) {
  return mcpClient.callTool(toolName, params, options);
}

export async function getSSOT() {
  return mcpClient.getSSOT();
}

export async function listProjects(status = 'all') {
  return mcpClient.listProjects(status);
}

export async function getProject(projectId) {
  return mcpClient.getProject(projectId);
}

export async function fullHealthCheck() {
  return mcpClient.fullHealthCheck();
}

export async function analyzeServer(options = {}) {
  return mcpClient.analyzeServer(options);
}

export async function deploy(projectName, environment, options = {}) {
  return mcpClient.deploy(projectName, environment, options);
}

export default mcpClient;
