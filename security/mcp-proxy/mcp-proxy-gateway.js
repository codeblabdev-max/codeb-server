#!/usr/bin/env node
/**
 * CodeB MCP Proxy Gateway
 *
 * 모든 MCP Tool 호출을 가로채서 Protection Daemon에 검증 요청
 * AI IDE가 MCP를 직접 호출하지 못하고 이 프록시를 거쳐야 함
 *
 * Features:
 * - MCP 요청 프록시
 * - Protection Daemon 연동
 * - 위험 도구 차단
 * - 요청/응답 로깅
 */

const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ============================================================================
// 설정
// ============================================================================

const CONFIG = {
  // 프록시 서버 포트
  proxyPort: parseInt(process.env.MCP_PROXY_PORT) || 3199,

  // 실제 MCP 서버
  mcpServerHost: process.env.MCP_SERVER_HOST || '127.0.0.1',
  mcpServerPort: parseInt(process.env.MCP_SERVER_PORT) || 3100,

  // Protection Daemon 소켓
  protectionSocket: process.env.CODEB_SOCKET_PATH || '/var/run/codeb/protection.sock',

  // 로그 파일
  logFile: '/var/log/codeb/mcp-proxy.log',

  // PID 파일
  pidFile: '/var/run/codeb/mcp-proxy.pid',
};

// ============================================================================
// 위험 도구 목록
// ============================================================================

const DANGEROUS_TOOLS = {
  // 완전 차단 (프록시에서 바로 거부)
  blocked: [
    'execute_dangerous_command',
    'delete_all_containers',
    'system_prune',
    'force_remove',
  ],

  // Protection Daemon 검증 필요
  requiresValidation: [
    'deploy',
    'rollback',
    'stop_service',
    'restart_service',
    'delete_project',
    'cleanup',
    'remove_volume',
    'execute_command',
    'ssh_execute',
    'manage_env',
  ],

  // 항상 허용 (조회성)
  alwaysAllowed: [
    'health_check',
    'get_status',
    'list_projects',
    'get_logs',
    'get_config',
    'list_containers',
    'get_metrics',
  ],
};

// ============================================================================
// Protection Client
// ============================================================================

class ProtectionClient {
  constructor(socketPath) {
    this.socketPath = socketPath;
  }

  async validate(command, context = {}) {
    return new Promise((resolve, reject) => {
      const client = net.createConnection(this.socketPath, () => {
        const request = JSON.stringify({
          action: 'validate',
          command,
          context,
          clientId: 'mcp-proxy',
        }) + '\n';

        client.write(request);
      });

      let data = '';

      client.on('data', (chunk) => {
        data += chunk.toString();
        if (data.includes('\n')) {
          try {
            const response = JSON.parse(data.trim());
            client.end();
            resolve(response);
          } catch (error) {
            client.end();
            reject(new Error('Invalid response from protection daemon'));
          }
        }
      });

      client.on('error', (err) => {
        // Daemon 연결 실패 시 안전 모드 (차단)
        resolve({
          success: false,
          allowed: false,
          reason: 'Protection Daemon not available - safe mode active',
          code: 'DAEMON_UNAVAILABLE',
        });
      });

      client.setTimeout(5000, () => {
        client.destroy();
        resolve({
          success: false,
          allowed: false,
          reason: 'Protection Daemon timeout',
          code: 'DAEMON_TIMEOUT',
        });
      });
    });
  }

  async checkHealth() {
    return new Promise((resolve) => {
      const client = net.createConnection(this.socketPath, () => {
        client.write(JSON.stringify({ action: 'health' }) + '\n');
      });

      let data = '';
      client.on('data', (chunk) => {
        data += chunk.toString();
        if (data.includes('\n')) {
          client.end();
          resolve(true);
        }
      });

      client.on('error', () => resolve(false));
      client.setTimeout(2000, () => {
        client.destroy();
        resolve(false);
      });
    });
  }
}

// ============================================================================
// MCP Proxy Gateway
// ============================================================================

class MCPProxyGateway {
  constructor() {
    this.server = null;
    this.protectionClient = new ProtectionClient(CONFIG.protectionSocket);
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      proxiedRequests: 0,
    };
    this.startTime = Date.now();
  }

  // --------------------------------------------------------------------------
  // 시작/종료
  // --------------------------------------------------------------------------

  async start() {
    // 디렉토리 생성
    this.ensureDirectories();

    // Protection Daemon 연결 확인
    const daemonHealthy = await this.protectionClient.checkHealth();
    if (!daemonHealthy) {
      this.log('warn', 'Protection Daemon not available - running in safe mode');
    } else {
      this.log('info', 'Connected to Protection Daemon');
    }

    // HTTP 서버 생성
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.server.listen(CONFIG.proxyPort, '127.0.0.1', () => {
      // PID 파일 생성
      fs.writeFileSync(CONFIG.pidFile, process.pid.toString());

      this.log('info', `MCP Proxy Gateway listening on port ${CONFIG.proxyPort}`);
      this.log('info', `Proxying to ${CONFIG.mcpServerHost}:${CONFIG.mcpServerPort}`);
    });

    // 시그널 핸들러
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  shutdown() {
    this.log('info', 'Shutting down...');

    if (this.server) {
      this.server.close();
    }

    // PID 파일 삭제
    if (fs.existsSync(CONFIG.pidFile)) {
      fs.unlinkSync(CONFIG.pidFile);
    }

    process.exit(0);
  }

  ensureDirectories() {
    const dirs = [
      path.dirname(CONFIG.logFile),
      path.dirname(CONFIG.pidFile),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 요청 처리
  // --------------------------------------------------------------------------

  async handleRequest(req, res) {
    this.stats.totalRequests++;

    // 헬스 체크
    if (req.url === '/health') {
      return this.sendJSON(res, 200, {
        status: 'healthy',
        uptime: Date.now() - this.startTime,
        stats: this.stats,
      });
    }

    // 통계
    if (req.url === '/stats') {
      return this.sendJSON(res, 200, this.stats);
    }

    // POST만 허용
    if (req.method !== 'POST') {
      return this.sendJSON(res, 405, { error: 'Method not allowed' });
    }

    // 요청 본문 읽기
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const request = JSON.parse(body);
        await this.processToolCall(req, res, request);
      } catch (error) {
        this.sendJSON(res, 400, { error: `Invalid JSON: ${error.message}` });
      }
    });
  }

  async processToolCall(req, res, request) {
    const { method, params } = request;
    const toolName = params?.name || method;

    this.log('debug', `Tool call: ${toolName}`);

    // 1. 완전 차단 도구 체크
    if (DANGEROUS_TOOLS.blocked.includes(toolName)) {
      this.stats.blockedRequests++;
      this.logRequest('blocked', toolName, 'Tool is blocked');
      return this.sendJSON(res, 403, {
        error: {
          code: 'TOOL_BLOCKED',
          message: `Tool '${toolName}' is blocked for security reasons`,
        },
      });
    }

    // 2. 항상 허용 도구는 바로 프록시
    if (DANGEROUS_TOOLS.alwaysAllowed.includes(toolName)) {
      return this.proxyToMCP(req, res, request);
    }

    // 3. 검증 필요 도구는 Protection Daemon에 확인
    if (DANGEROUS_TOOLS.requiresValidation.includes(toolName)) {
      const validation = await this.validateToolCall(toolName, params?.arguments);

      if (!validation.allowed) {
        this.stats.blockedRequests++;
        this.logRequest('blocked', toolName, validation.reason);
        return this.sendJSON(res, 403, {
          error: {
            code: validation.code || 'VALIDATION_FAILED',
            message: validation.reason,
            suggestion: validation.suggestion,
          },
        });
      }
    }

    // 4. 프록시
    this.proxyToMCP(req, res, request);
  }

  async validateToolCall(toolName, args) {
    // 도구별 검증 로직
    let command = toolName;

    switch (toolName) {
      case 'deploy':
        command = `deploy ${args?.projectName || ''} --environment ${args?.environment || 'staging'}`;
        break;

      case 'rollback':
        command = `rollback ${args?.projectName || ''} --version ${args?.version || 'previous'}`;
        break;

      case 'stop_service':
      case 'restart_service':
        command = `${toolName} ${args?.containerName || args?.projectName || ''}`;
        break;

      case 'delete_project':
      case 'cleanup':
        command = `${toolName} ${args?.projectName || ''}`;

        // 프로덕션 체크
        if (args?.environment === 'production' || args?.projectName?.includes('prod')) {
          return {
            allowed: false,
            reason: 'Production environment cannot be deleted via MCP',
            code: 'PRODUCTION_PROTECTED',
          };
        }
        break;

      case 'execute_command':
      case 'ssh_execute':
        command = args?.command || '';
        break;

      case 'manage_env':
        command = `env ${args?.action || ''} ${args?.projectName || ''} ${args?.key || ''}`;
        break;
    }

    // Protection Daemon에 검증 요청
    const context = {
      toolName,
      projectName: args?.projectName,
      environment: args?.environment,
      source: 'mcp-proxy',
    };

    return this.protectionClient.validate(command, context);
  }

  // --------------------------------------------------------------------------
  // 프록시
  // --------------------------------------------------------------------------

  proxyToMCP(clientReq, clientRes, requestBody) {
    this.stats.proxiedRequests++;

    const options = {
      hostname: CONFIG.mcpServerHost,
      port: CONFIG.mcpServerPort,
      path: clientReq.url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': clientReq.socket.remoteAddress,
        'X-Proxy-By': 'codeb-mcp-proxy',
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes);
    });

    proxyReq.on('error', (err) => {
      this.log('error', `Proxy error: ${err.message}`);
      this.sendJSON(clientRes, 502, {
        error: {
          code: 'PROXY_ERROR',
          message: 'Failed to connect to MCP server',
        },
      });
    });

    proxyReq.write(JSON.stringify(requestBody));
    proxyReq.end();

    this.logRequest('proxied', requestBody.params?.name || requestBody.method, 'Proxied to MCP');
  }

  // --------------------------------------------------------------------------
  // 유틸리티
  // --------------------------------------------------------------------------

  sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    const prefix = {
      debug: '🔍',
      info: 'ℹ️',
      warn: '⚠️',
      error: '🚨',
    }[level] || '';

    const logLine = `[${timestamp}] ${prefix} ${message}`;
    console.error(logLine);

    // 파일 로깅
    try {
      fs.appendFileSync(CONFIG.logFile, logLine + '\n');
    } catch (err) {
      // 로그 파일 쓰기 실패 무시
    }
  }

  logRequest(action, tool, reason) {
    const timestamp = new Date().toISOString();
    const emoji = action === 'blocked' ? '🛑' : action === 'proxied' ? '➡️' : '📝';

    this.log('info', `${emoji} ${action.toUpperCase()}: ${tool} - ${reason}`);
  }
}

// ============================================================================
// 메인
// ============================================================================

const gateway = new MCPProxyGateway();
gateway.start().catch((err) => {
  console.error(`Failed to start MCP Proxy: ${err.message}`);
  process.exit(1);
});
