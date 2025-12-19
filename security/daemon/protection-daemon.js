#!/usr/bin/env node
/**
 * CodeB Protection Daemon
 *
 * 중앙 보안 검증 서비스 - 모든 명령이 이 데몬을 거쳐야 함
 * Unix Socket 통신으로 우회 불가능
 *
 * Features:
 * - 프로덕션 컨테이너 절대 보호
 * - 위험 명령 패턴 차단
 * - 감사 로그 (SQLite)
 * - SSOT 서버 동기화
 * - Rate Limiting
 */

const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AuditDB } = require('./audit-db');
const { RulesEngine } = require('./rules-engine');

// ============================================================================
// 설정
// ============================================================================

const CONFIG = {
  // Socket 경로
  socketPath: process.env.CODEB_SOCKET_PATH || '/var/run/codeb/protection.sock',

  // PID 파일
  pidFile: '/var/run/codeb/protection.pid',

  // 감사 로그 DB
  auditDbPath: '/var/lib/codeb/audit.db',

  // SSOT 서버
  ssotServer: process.env.SSOT_SERVER || 'http://141.164.60.51:3102',

  // 동기화 간격 (ms)
  syncInterval: 60000, // 1분

  // Rate Limiting
  rateLimit: {
    windowMs: 60000,    // 1분
    maxRequests: 100,   // 최대 100 요청
  },

  // 로그 레벨
  logLevel: process.env.LOG_LEVEL || 'info',

  // 허용된 서버 IP (기본값)
  allowedServers: [
    '141.164.60.51',    // CodeB Infra
    '158.247.203.55',   // Videopick App
    '141.164.42.213',   // Streaming
    '64.176.226.119',   // Storage
    '141.164.37.63',    // Backup
  ],

  // 프로덕션 환경 식별
  productionPatterns: [
    /-production$/,
    /-prod$/,
    /-prd$/,
    /^prod-/,
    /^production-/,
  ],

  // 프로덕션 포트 범위
  productionPortRange: { min: 4000, max: 4499 },
};

// ============================================================================
// 절대 금지 명령 패턴
// ============================================================================

const FORBIDDEN_PATTERNS = {
  // CRITICAL: 시스템 전체 영향
  critical: [
    { pattern: /podman\s+system\s+prune/i, reason: '시스템 전체 정리 금지' },
    { pattern: /podman\s+volume\s+prune/i, reason: '모든 볼륨 삭제 금지' },
    { pattern: /podman\s+network\s+prune/i, reason: '모든 네트워크 삭제 금지' },
    { pattern: /podman\s+container\s+prune/i, reason: '모든 컨테이너 삭제 금지' },
    { pattern: /podman\s+image\s+prune\s+-a/i, reason: '모든 이미지 삭제 금지' },
    { pattern: /podman\s+rm\s+.*\$\(podman\s+ps/i, reason: '동적 컨테이너 삭제 금지' },
    { pattern: /rm\s+-rf\s+\/(opt\/codeb|var\/lib\/containers|home\/codeb)/i, reason: 'CodeB 폴더 삭제 금지' },
    { pattern: /systemctl\s+(stop|disable)\s+podman/i, reason: 'Podman 서비스 중지 금지' },
    { pattern: /pkill\s+-9?\s*(podman|node|codeb)/i, reason: '프로세스 강제 종료 금지' },
  ],

  // DANGER: 데이터 손실 위험
  danger: [
    { pattern: /podman\s+rm\s+(-f|--force)/i, reason: '컨테이너 강제 삭제 금지' },
    { pattern: /podman\s+volume\s+rm/i, reason: '볼륨 삭제 금지 - we workflow cleanup 사용' },
    { pattern: /podman\s+network\s+rm/i, reason: '네트워크 삭제 금지' },
    { pattern: /podman\s+kill/i, reason: '컨테이너 강제 종료 금지 - we workflow stop 사용' },
    { pattern: /docker\s+rm\s+(-f|--force)/i, reason: '컨테이너 강제 삭제 금지' },
    { pattern: /docker\s+volume\s+rm/i, reason: '볼륨 삭제 금지' },
    { pattern: /docker-compose\s+down\s+.*-v/i, reason: '볼륨 포함 삭제 금지' },
    { pattern: /drop\s+(database|table)/i, reason: 'DB/테이블 삭제 금지' },
    { pattern: /truncate\s+.*table/i, reason: '테이블 데이터 삭제 금지' },
  ],

  // WARNING: 주의 필요
  warning: [
    { pattern: /podman\s+rm\b/i, reason: '컨테이너 삭제 - 확인 필요' },
    { pattern: /podman\s+stop\b/i, reason: '컨테이너 중지 - 확인 필요' },
    { pattern: /systemctl\s+(restart|reload)/i, reason: '서비스 재시작 - 확인 필요' },
  ],
};

// ============================================================================
// 항상 허용되는 명령 패턴
// ============================================================================

const ALLOWED_PATTERNS = [
  /^we\s+/i,                    // we CLI
  /^podman\s+ps/i,              // 컨테이너 목록
  /^podman\s+logs/i,            // 로그 조회
  /^podman\s+inspect/i,         // 상세 정보
  /^podman\s+images/i,          // 이미지 목록
  /^podman\s+volume\s+ls/i,     // 볼륨 목록
  /^podman\s+network\s+ls/i,    // 네트워크 목록
  /^podman\s+stats/i,           // 상태 조회
  /^docker\s+ps/i,
  /^docker\s+logs/i,
  /^docker\s+inspect/i,
  /^ls\b/i,
  /^cat\b/i,
  /^grep\b/i,
  /^find\b/i,
  /^curl\b/i,
  /^wget\b/i,
];

// ============================================================================
// Rate Limiter
// ============================================================================

class RateLimiter {
  constructor(windowMs, maxRequests) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.clients = new Map();
  }

  isAllowed(clientId) {
    const now = Date.now();
    const client = this.clients.get(clientId);

    if (!client) {
      this.clients.set(clientId, { count: 1, resetTime: now + this.windowMs });
      return true;
    }

    if (now > client.resetTime) {
      client.count = 1;
      client.resetTime = now + this.windowMs;
      return true;
    }

    if (client.count >= this.maxRequests) {
      return false;
    }

    client.count++;
    return true;
  }

  cleanup() {
    const now = Date.now();
    for (const [clientId, client] of this.clients.entries()) {
      if (now > client.resetTime + this.windowMs) {
        this.clients.delete(clientId);
      }
    }
  }
}

// ============================================================================
// Protection Daemon 클래스
// ============================================================================

class ProtectionDaemon {
  constructor() {
    this.server = null;
    this.auditDb = null;
    this.rulesEngine = null;
    this.rateLimiter = new RateLimiter(
      CONFIG.rateLimit.windowMs,
      CONFIG.rateLimit.maxRequests
    );
    this.productionContainers = new Set();
    this.ssotCache = null;
    this.startTime = Date.now();
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      allowedRequests: 0,
    };
  }

  // --------------------------------------------------------------------------
  // 초기화
  // --------------------------------------------------------------------------

  async initialize() {
    // 디렉토리 생성
    this.ensureDirectories();

    // 감사 로그 DB 초기화
    this.auditDb = new AuditDB(CONFIG.auditDbPath);
    await this.auditDb.initialize();

    // 규칙 엔진 초기화
    this.rulesEngine = new RulesEngine();

    // SSOT 동기화
    await this.syncWithSSOT();

    // 주기적 동기화 설정
    setInterval(() => this.syncWithSSOT(), CONFIG.syncInterval);

    // Rate Limiter 정리
    setInterval(() => this.rateLimiter.cleanup(), CONFIG.rateLimit.windowMs);

    this.log('info', 'Protection Daemon initialized');
  }

  ensureDirectories() {
    const dirs = [
      path.dirname(CONFIG.socketPath),
      path.dirname(CONFIG.auditDbPath),
      path.dirname(CONFIG.pidFile),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
      }
    }
  }

  // --------------------------------------------------------------------------
  // SSOT 동기화
  // --------------------------------------------------------------------------

  async syncWithSSOT() {
    try {
      const https = require('http');
      const response = await this.httpGet(`${CONFIG.ssotServer}/api/protection-rules`);

      if (response) {
        this.ssotCache = response;

        // 프로덕션 컨테이너 목록 업데이트
        if (response.productionContainers) {
          this.productionContainers = new Set(response.productionContainers);
        }

        // 허용 서버 목록 업데이트
        if (response.allowedServers) {
          CONFIG.allowedServers = response.allowedServers;
        }

        this.log('info', `Synced with SSOT: ${this.productionContainers.size} production containers`);
      }
    } catch (error) {
      this.log('warn', `SSOT sync failed: ${error.message}`);
    }
  }

  async httpGet(url) {
    return new Promise((resolve, reject) => {
      const http = require('http');
      const req = http.get(url, { timeout: 3000 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  // --------------------------------------------------------------------------
  // 서버 시작/중지
  // --------------------------------------------------------------------------

  async start() {
    await this.initialize();

    // 기존 소켓 파일 삭제
    if (fs.existsSync(CONFIG.socketPath)) {
      fs.unlinkSync(CONFIG.socketPath);
    }

    // Unix Socket 서버 생성
    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    this.server.on('error', (err) => {
      this.log('error', `Server error: ${err.message}`);
      process.exit(1);
    });

    // 소켓 리스닝
    this.server.listen(CONFIG.socketPath, () => {
      // 소켓 권한 설정 (root와 codeb 그룹만 접근)
      fs.chmodSync(CONFIG.socketPath, 0o660);

      // PID 파일 생성
      fs.writeFileSync(CONFIG.pidFile, process.pid.toString());

      this.log('info', `Protection Daemon listening on ${CONFIG.socketPath}`);
      this.log('info', `PID: ${process.pid}`);
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

    // 소켓 파일 삭제
    if (fs.existsSync(CONFIG.socketPath)) {
      fs.unlinkSync(CONFIG.socketPath);
    }

    process.exit(0);
  }

  // --------------------------------------------------------------------------
  // 연결 처리
  // --------------------------------------------------------------------------

  handleConnection(socket) {
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      // 줄바꿈으로 메시지 구분
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          this.handleMessage(socket, line.trim());
        }
      }
    });

    socket.on('error', (err) => {
      this.log('debug', `Socket error: ${err.message}`);
    });
  }

  async handleMessage(socket, message) {
    try {
      const request = JSON.parse(message);
      const response = await this.processRequest(request);
      socket.write(JSON.stringify(response) + '\n');
    } catch (error) {
      socket.write(JSON.stringify({
        success: false,
        error: `Invalid request: ${error.message}`,
      }) + '\n');
    }
  }

  // --------------------------------------------------------------------------
  // 요청 처리
  // --------------------------------------------------------------------------

  async processRequest(request) {
    const { action, command, context, clientId } = request;

    this.stats.totalRequests++;

    // Rate Limiting
    if (!this.rateLimiter.isAllowed(clientId || 'default')) {
      this.stats.blockedRequests++;
      return {
        success: false,
        allowed: false,
        reason: 'Rate limit exceeded. Please wait.',
        code: 'RATE_LIMITED',
      };
    }

    switch (action) {
      case 'validate':
        return this.validateCommand(command, context);

      case 'check-ssh':
        return this.checkSSHTarget(request.target);

      case 'check-production':
        return this.checkProductionContainer(request.containerName);

      case 'check-port':
        return this.checkPortConflict(request.port, request.projectName, request.environment);

      case 'allocate-port':
        return this.allocatePort(request.port, request.projectName, request.environment);

      case 'release-port':
        return this.releasePort(request.port);

      case 'check-network':
        return this.checkNetworkProtection(command, context);

      case 'get-rules':
        return this.getRules();

      case 'get-stats':
        return this.getStats();

      case 'health':
        return { success: true, status: 'healthy', uptime: Date.now() - this.startTime };

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }

  // --------------------------------------------------------------------------
  // 명령 검증
  // --------------------------------------------------------------------------

  validateCommand(command, context = {}) {
    const result = {
      success: true,
      allowed: true,
      command,
      level: 'safe',
      warnings: [],
    };

    // 1. 항상 허용 패턴 체크
    for (const pattern of ALLOWED_PATTERNS) {
      if (pattern.test(command)) {
        // we CLI는 추가 검증
        if (/^we\s+/.test(command)) {
          return this.validateWeCLI(command, context);
        }

        this.stats.allowedRequests++;
        this.logAudit('allowed', command, context, 'Matched allowed pattern');
        return result;
      }
    }

    // 2. CRITICAL 패턴 체크 (무조건 차단)
    for (const rule of FORBIDDEN_PATTERNS.critical) {
      if (rule.pattern.test(command)) {
        this.stats.blockedRequests++;
        this.logAudit('blocked', command, context, rule.reason);
        return {
          success: true,
          allowed: false,
          reason: `🚨 CRITICAL: ${rule.reason}`,
          code: 'CRITICAL_BLOCKED',
          level: 'critical',
        };
      }
    }

    // 3. 프로덕션 컨테이너 보호 체크
    const productionCheck = this.checkProductionInCommand(command);
    if (productionCheck.blocked) {
      this.stats.blockedRequests++;
      this.logAudit('blocked', command, context, productionCheck.reason);
      return {
        success: true,
        allowed: false,
        reason: `🔒 PRODUCTION PROTECTED: ${productionCheck.reason}`,
        code: 'PRODUCTION_PROTECTED',
        level: 'critical',
      };
    }

    // 4. DANGER 패턴 체크
    for (const rule of FORBIDDEN_PATTERNS.danger) {
      if (rule.pattern.test(command)) {
        this.stats.blockedRequests++;
        this.logAudit('blocked', command, context, rule.reason);
        return {
          success: true,
          allowed: false,
          reason: `⚠️ DANGER: ${rule.reason}`,
          code: 'DANGER_BLOCKED',
          level: 'danger',
          suggestion: this.getSuggestion(command),
        };
      }
    }

    // 5. WARNING 패턴 체크
    for (const rule of FORBIDDEN_PATTERNS.warning) {
      if (rule.pattern.test(command)) {
        result.level = 'warning';
        result.warnings.push(rule.reason);
        result.requiresConfirmation = true;
      }
    }

    // 6. SSH 대상 검증
    if (/^ssh\s+|^scp\s+|^rsync\s+/.test(command)) {
      const sshCheck = this.validateSSHCommand(command);
      if (!sshCheck.allowed) {
        this.stats.blockedRequests++;
        this.logAudit('blocked', command, context, sshCheck.reason);
        return {
          success: true,
          allowed: false,
          reason: sshCheck.reason,
          code: 'SSH_BLOCKED',
          level: 'danger',
        };
      }
    }

    // 7. 포트 충돌 검증 (포트 노출 명령에서)
    const portMatch = command.match(/-p\s+(\d+):|--publish\s+(\d+):/);
    if (portMatch) {
      const port = portMatch[1] || portMatch[2];
      const portCheck = this.checkPortConflict(port, context.projectName, context.environment);
      if (!portCheck.allowed) {
        this.stats.blockedRequests++;
        this.logAudit('blocked', command, context, portCheck.reason);
        return {
          success: true,
          allowed: false,
          reason: `🔌 PORT CONFLICT: ${portCheck.reason}`,
          code: 'PORT_CONFLICT',
          level: portCheck.level || 'danger',
          suggestion: portCheck.suggestion,
        };
      }
    }

    // 8. 네트워크 보호 검증
    if (/network|iptables/i.test(command)) {
      const networkCheck = this.checkNetworkProtection(command, context);
      if (!networkCheck.allowed) {
        this.stats.blockedRequests++;
        this.logAudit('blocked', command, context, networkCheck.reason);
        return {
          success: true,
          allowed: false,
          reason: `🌐 NETWORK PROTECTED: ${networkCheck.reason}`,
          code: 'NETWORK_BLOCKED',
          level: networkCheck.level || 'danger',
        };
      }
    }

    // 9. 프로젝트 격리 검증
    if (context.projectName) {
      const isolationCheck = this.checkProjectIsolation(command, context.projectName);
      if (!isolationCheck.allowed) {
        this.stats.blockedRequests++;
        this.logAudit('blocked', command, context, isolationCheck.reason);
        return {
          success: true,
          allowed: false,
          reason: isolationCheck.reason,
          code: 'ISOLATION_BLOCKED',
          level: 'warning',
        };
      }
    }

    this.stats.allowedRequests++;
    this.logAudit('allowed', command, context, 'Passed all checks');
    return result;
  }

  // --------------------------------------------------------------------------
  // we CLI 검증
  // --------------------------------------------------------------------------

  validateWeCLI(command, context) {
    // we CLI 내부 명령 분석
    const parts = command.split(/\s+/);
    const subCommand = parts[1];

    // 위험한 서브 명령 체크
    const dangerousSubCommands = ['cleanup', 'delete', 'remove', 'destroy'];

    if (dangerousSubCommands.includes(subCommand)) {
      // 프로덕션 환경 체크
      if (command.includes('production') || command.includes('prod')) {
        return {
          success: true,
          allowed: false,
          reason: '🔒 Production 환경은 CLI로 삭제할 수 없습니다.',
          code: 'PRODUCTION_CLI_BLOCKED',
          level: 'critical',
        };
      }

      return {
        success: true,
        allowed: true,
        level: 'warning',
        warnings: [`${subCommand} 명령은 데이터 손실이 발생할 수 있습니다.`],
        requiresConfirmation: true,
      };
    }

    return {
      success: true,
      allowed: true,
      level: 'safe',
    };
  }

  // --------------------------------------------------------------------------
  // 프로덕션 컨테이너 보호
  // --------------------------------------------------------------------------

  checkProductionInCommand(command) {
    // 컨테이너 이름 추출
    const containerMatch = command.match(/(?:podman|docker)\s+(?:rm|stop|kill|restart)\s+(?:-[^\s]+\s+)*(\S+)/i);

    if (containerMatch) {
      const containerName = containerMatch[1];

      // 등록된 프로덕션 컨테이너
      if (this.productionContainers.has(containerName)) {
        return {
          blocked: true,
          reason: `'${containerName}'은 등록된 프로덕션 컨테이너입니다.`,
        };
      }

      // 프로덕션 패턴 매칭
      for (const pattern of CONFIG.productionPatterns) {
        if (pattern.test(containerName)) {
          return {
            blocked: true,
            reason: `'${containerName}'은 프로덕션 컨테이너 패턴에 매칭됩니다.`,
          };
        }
      }
    }

    // 볼륨 이름 체크
    const volumeMatch = command.match(/(?:podman|docker)\s+volume\s+rm\s+(\S+)/i);
    if (volumeMatch) {
      const volumeName = volumeMatch[1];
      if (volumeName.includes('production') || volumeName.includes('prod')) {
        return {
          blocked: true,
          reason: `'${volumeName}'은 프로덕션 볼륨입니다.`,
        };
      }
    }

    return { blocked: false };
  }

  checkProductionContainer(containerName) {
    const isProduction =
      this.productionContainers.has(containerName) ||
      CONFIG.productionPatterns.some(p => p.test(containerName));

    return {
      success: true,
      isProduction,
      containerName,
    };
  }

  // --------------------------------------------------------------------------
  // SSH 검증
  // --------------------------------------------------------------------------

  validateSSHCommand(command) {
    const ipMatch = command.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);

    if (ipMatch) {
      const ip = ipMatch[1];
      if (!CONFIG.allowedServers.includes(ip)) {
        return {
          allowed: false,
          reason: `허용되지 않은 서버: ${ip}\n허용된 서버: ${CONFIG.allowedServers.join(', ')}`,
        };
      }
    }

    return { allowed: true };
  }

  checkSSHTarget(target) {
    const allowed = CONFIG.allowedServers.includes(target);
    return {
      success: true,
      allowed,
      target,
      allowedServers: CONFIG.allowedServers,
    };
  }

  // --------------------------------------------------------------------------
  // 프로젝트 격리
  // --------------------------------------------------------------------------

  checkProjectIsolation(command, currentProject) {
    const containerMatch = command.match(/(?:podman|docker)\s+(?:rm|stop|kill)\s+(\S+)/i);

    if (containerMatch) {
      const containerName = containerMatch[1];

      // 다른 프로젝트 컨테이너 조작 방지
      if (!containerName.startsWith(currentProject) &&
          !containerName.startsWith(`${currentProject}-`) &&
          containerName.includes('-')) {
        return {
          allowed: false,
          reason: `다른 프로젝트의 컨테이너(${containerName})는 조작할 수 없습니다.`,
        };
      }
    }

    return { allowed: true };
  }

  // --------------------------------------------------------------------------
  // 포트 충돌 검증
  // --------------------------------------------------------------------------

  checkPortConflict(port, projectName, environment = 'development') {
    return this.rulesEngine.checkPortConflict(port, projectName, environment);
  }

  allocatePort(port, projectName, environment) {
    this.rulesEngine.allocatePort(port, projectName, environment);
    this.logAudit('port-allocated', `Port ${port}`, { projectName, environment }, 'Port allocated');
    return { success: true, port, projectName, environment };
  }

  releasePort(port) {
    this.rulesEngine.releasePort(port);
    this.logAudit('port-released', `Port ${port}`, {}, 'Port released');
    return { success: true, port };
  }

  // --------------------------------------------------------------------------
  // 네트워크 보호
  // --------------------------------------------------------------------------

  checkNetworkProtection(command, context = {}) {
    return this.rulesEngine.checkNetworkProtection(command, context);
  }

  // --------------------------------------------------------------------------
  // 유틸리티
  // --------------------------------------------------------------------------

  getSuggestion(command) {
    if (/podman\s+rm\s+-f/.test(command)) {
      return 'we workflow stop <project> 명령을 사용하세요.';
    }
    if (/podman\s+volume\s+rm/.test(command)) {
      return 'we workflow cleanup <project> 명령을 사용하세요.';
    }
    if (/podman\s+kill/.test(command)) {
      return 'we workflow stop <project> 명령을 사용하세요.';
    }
    return null;
  }

  getRules() {
    return {
      success: true,
      rules: {
        forbidden: FORBIDDEN_PATTERNS,
        allowed: ALLOWED_PATTERNS.map(p => p.toString()),
        productionPatterns: CONFIG.productionPatterns.map(p => p.toString()),
        allowedServers: CONFIG.allowedServers,
      },
    };
  }

  getStats() {
    return {
      success: true,
      stats: {
        ...this.stats,
        uptime: Date.now() - this.startTime,
        productionContainers: this.productionContainers.size,
        lastSync: this.ssotCache?.syncedAt,
      },
    };
  }

  // --------------------------------------------------------------------------
  // 로깅
  // --------------------------------------------------------------------------

  log(level, message) {
    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevel = levels.indexOf(CONFIG.logLevel);
    const msgLevel = levels.indexOf(level);

    if (msgLevel >= configLevel) {
      const timestamp = new Date().toISOString();
      const prefix = {
        debug: '🔍',
        info: 'ℹ️',
        warn: '⚠️',
        error: '🚨',
      }[level] || '';

      console.error(`[${timestamp}] ${prefix} ${message}`);
    }
  }

  logAudit(action, command, context, reason) {
    if (this.auditDb) {
      this.auditDb.log({
        action,
        command,
        context: JSON.stringify(context || {}),
        reason,
        timestamp: new Date().toISOString(),
        pid: process.pid,
      });
    }
  }
}

// ============================================================================
// 메인
// ============================================================================

const daemon = new ProtectionDaemon();
daemon.start().catch((err) => {
  console.error(`Failed to start daemon: ${err.message}`);
  process.exit(1);
});
