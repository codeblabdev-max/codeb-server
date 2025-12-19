#!/usr/bin/env node
/**
 * CodeB Protection Client
 *
 * CLI에서 사용하는 Protection Daemon 클라이언트
 * 모든 위험 명령은 이 클라이언트를 통해 검증받아야 함
 *
 * Features:
 * - Protection Daemon 연결
 * - 명령 검증
 * - 안전 모드 (Daemon 미연결 시)
 */

const net = require('net');
const fs = require('fs');

// ============================================================================
// 설정
// ============================================================================

const CONFIG = {
  socketPath: process.env.CODEB_SOCKET_PATH || '/var/run/codeb/protection.sock',
  timeout: 5000,  // 5초
  retryCount: 3,
  retryDelay: 500,  // 500ms
};

// ============================================================================
// Protection Client
// ============================================================================

class ProtectionClient {
  constructor(options = {}) {
    this.socketPath = options.socketPath || CONFIG.socketPath;
    this.timeout = options.timeout || CONFIG.timeout;
    this.clientId = options.clientId || `cli-${process.pid}`;
    this.projectName = options.projectName || process.env.CODEB_PROJECT || null;
  }

  // --------------------------------------------------------------------------
  // 연결 체크
  // --------------------------------------------------------------------------

  async isConnected() {
    return new Promise((resolve) => {
      if (!fs.existsSync(this.socketPath)) {
        resolve(false);
        return;
      }

      const client = net.createConnection(this.socketPath, () => {
        client.write(JSON.stringify({ action: 'health' }) + '\n');
      });

      let received = false;

      client.on('data', () => {
        received = true;
        client.end();
        resolve(true);
      });

      client.on('error', () => {
        resolve(false);
      });

      client.setTimeout(2000, () => {
        client.destroy();
        resolve(false);
      });
    });
  }

  // --------------------------------------------------------------------------
  // 명령 검증
  // --------------------------------------------------------------------------

  async validate(command, context = {}) {
    return this._send({
      action: 'validate',
      command,
      context: {
        ...context,
        projectName: context.projectName || this.projectName,
      },
      clientId: this.clientId,
    });
  }

  // --------------------------------------------------------------------------
  // SSH 대상 검증
  // --------------------------------------------------------------------------

  async checkSSH(target) {
    return this._send({
      action: 'check-ssh',
      target,
      clientId: this.clientId,
    });
  }

  // --------------------------------------------------------------------------
  // 프로덕션 컨테이너 체크
  // --------------------------------------------------------------------------

  async isProductionContainer(containerName) {
    const result = await this._send({
      action: 'check-production',
      containerName,
      clientId: this.clientId,
    });

    return result.success && result.isProduction;
  }

  // --------------------------------------------------------------------------
  // 규칙 조회
  // --------------------------------------------------------------------------

  async getRules() {
    return this._send({
      action: 'get-rules',
      clientId: this.clientId,
    });
  }

  // --------------------------------------------------------------------------
  // 통계 조회
  // --------------------------------------------------------------------------

  async getStats() {
    return this._send({
      action: 'get-stats',
      clientId: this.clientId,
    });
  }

  // --------------------------------------------------------------------------
  // 헬스 체크
  // --------------------------------------------------------------------------

  async health() {
    return this._send({
      action: 'health',
      clientId: this.clientId,
    });
  }

  // --------------------------------------------------------------------------
  // 내부 통신
  // --------------------------------------------------------------------------

  async _send(request) {
    return new Promise((resolve, reject) => {
      // 소켓 파일 존재 체크
      if (!fs.existsSync(this.socketPath)) {
        resolve({
          success: false,
          allowed: false,
          reason: 'Protection Daemon not running',
          code: 'DAEMON_NOT_RUNNING',
          safeMode: true,
        });
        return;
      }

      const client = net.createConnection(this.socketPath, () => {
        client.write(JSON.stringify(request) + '\n');
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
            resolve({
              success: false,
              error: 'Invalid response from daemon',
              code: 'INVALID_RESPONSE',
            });
          }
        }
      });

      client.on('error', (err) => {
        resolve({
          success: false,
          allowed: false,
          reason: `Daemon connection error: ${err.message}`,
          code: 'CONNECTION_ERROR',
          safeMode: true,
        });
      });

      client.setTimeout(this.timeout, () => {
        client.destroy();
        resolve({
          success: false,
          allowed: false,
          reason: 'Daemon response timeout',
          code: 'TIMEOUT',
          safeMode: true,
        });
      });
    });
  }
}

// ============================================================================
// CLI Middleware
// ============================================================================

class CLIMiddleware {
  constructor(options = {}) {
    this.client = new ProtectionClient(options);
    this.safeMode = false;
    this.strictMode = options.strictMode !== false;  // 기본 true
  }

  // --------------------------------------------------------------------------
  // 초기화 (CLI 시작 시 호출)
  // --------------------------------------------------------------------------

  async initialize() {
    const connected = await this.client.isConnected();

    if (!connected) {
      this.safeMode = true;
      console.error('⚠️  Protection Daemon not available - running in safe mode');
      console.error('   위험 명령은 차단됩니다. 데몬 시작: sudo systemctl start codeb-protection');
      return false;
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // 명령 실행 전 검증
  // --------------------------------------------------------------------------

  async beforeExecute(command, context = {}) {
    // Safe mode에서는 위험 명령 차단
    if (this.safeMode) {
      if (this.isDangerousCommand(command)) {
        return {
          allowed: false,
          reason: 'Protection Daemon 미실행 - 위험 명령 차단됨',
          code: 'SAFE_MODE_BLOCKED',
        };
      }
      return { allowed: true };
    }

    // Daemon에 검증 요청
    const result = await this.client.validate(command, context);

    if (!result.success) {
      // 연결 실패 시 safe mode 전환
      if (result.safeMode) {
        this.safeMode = true;
        if (this.isDangerousCommand(command)) {
          return {
            allowed: false,
            reason: 'Protection Daemon 연결 실패 - 위험 명령 차단됨',
            code: 'SAFE_MODE_BLOCKED',
          };
        }
      }
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // 위험 명령 판단 (로컬)
  // --------------------------------------------------------------------------

  isDangerousCommand(command) {
    const dangerousPatterns = [
      /podman\s+rm\s+(-f|--force)/i,
      /podman\s+volume\s+rm/i,
      /podman\s+system\s+prune/i,
      /podman\s+kill/i,
      /docker\s+rm\s+(-f|--force)/i,
      /docker\s+volume\s+rm/i,
      /docker-compose\s+down\s+.*-v/i,
      /rm\s+(-rf|-fr)\s+.*\/(opt\/codeb|var\/lib\/containers)/i,
      /systemctl\s+(stop|disable)\s+.*codeb/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return true;
      }
    }

    return false;
  }

  // --------------------------------------------------------------------------
  // SSH 검증
  // --------------------------------------------------------------------------

  async validateSSH(target) {
    if (this.safeMode) {
      // Safe mode에서는 기본 화이트리스트만 허용
      const defaultAllowed = [
        '141.164.60.51',
        '158.247.203.55',
        '141.164.42.213',
        '64.176.226.119',
        '141.164.37.63',
        'localhost',
        '127.0.0.1',
      ];

      return {
        allowed: defaultAllowed.includes(target),
        reason: defaultAllowed.includes(target)
          ? 'Allowed in safe mode'
          : `Safe mode: ${target} not in default whitelist`,
      };
    }

    return this.client.checkSSH(target);
  }

  // --------------------------------------------------------------------------
  // 프로덕션 보호 체크
  // --------------------------------------------------------------------------

  async checkProductionProtection(containerName) {
    if (this.safeMode) {
      // Safe mode에서는 프로덕션 패턴 체크
      const productionPatterns = [
        /-production$/,
        /-prod$/,
        /^prod-/,
        /^production-/,
      ];

      for (const pattern of productionPatterns) {
        if (pattern.test(containerName)) {
          return {
            isProduction: true,
            reason: 'Matches production pattern',
          };
        }
      }

      return { isProduction: false };
    }

    const isProduction = await this.client.isProductionContainer(containerName);
    return { isProduction };
  }

  // --------------------------------------------------------------------------
  // 상태 조회
  // --------------------------------------------------------------------------

  async getStatus() {
    const connected = await this.client.isConnected();

    if (!connected) {
      return {
        connected: false,
        safeMode: this.safeMode,
        message: 'Protection Daemon not running',
      };
    }

    const health = await this.client.health();
    const stats = await this.client.getStats();

    return {
      connected: true,
      safeMode: this.safeMode,
      health,
      stats,
    };
  }
}

// ============================================================================
// Express-style Middleware (for we CLI)
// ============================================================================

function createMiddleware(options = {}) {
  const middleware = new CLIMiddleware(options);

  return async function protectionMiddleware(command, context, next) {
    // 초기화 (첫 호출 시)
    if (!middleware._initialized) {
      await middleware.initialize();
      middleware._initialized = true;
    }

    // 검증
    const result = await middleware.beforeExecute(command, context);

    if (!result.allowed) {
      const error = new Error(result.reason);
      error.code = result.code;
      error.blocked = true;
      throw error;
    }

    // 경고 출력
    if (result.warnings && result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.error(`⚠️  ${warning}`);
      }
    }

    // 다음 실행
    if (typeof next === 'function') {
      return next();
    }

    return result;
  };
}

// ============================================================================
// 모듈 내보내기
// ============================================================================

module.exports = {
  ProtectionClient,
  CLIMiddleware,
  createMiddleware,
  CONFIG,
};

// ============================================================================
// CLI 직접 실행 (테스트용)
// ============================================================================

if (require.main === module) {
  const command = process.argv[2];

  if (!command) {
    console.log('Usage: protection-client.js <command>');
    console.log('       protection-client.js --status');
    console.log('       protection-client.js --rules');
    process.exit(1);
  }

  const client = new ProtectionClient();

  (async () => {
    if (command === '--status') {
      const middleware = new CLIMiddleware();
      const status = await middleware.getStatus();
      console.log(JSON.stringify(status, null, 2));
    } else if (command === '--rules') {
      const rules = await client.getRules();
      console.log(JSON.stringify(rules, null, 2));
    } else {
      const result = await client.validate(command);
      console.log(JSON.stringify(result, null, 2));

      if (!result.allowed) {
        process.exit(1);
      }
    }
  })();
}
