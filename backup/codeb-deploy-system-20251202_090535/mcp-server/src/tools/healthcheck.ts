/**
 * CodeB Deploy MCP - Healthcheck Tool
 * 배포 후 서비스 상태 확인 및 자동 롤백 트리거
 */

import { z } from 'zod';
import { getSSHClient } from '../lib/ssh-client.js';
import type { HealthCheckResult, Environment } from '../lib/types.js';

// Healthcheck 입력 스키마
export const healthcheckInputSchema = z.object({
  projectName: z.string().describe('프로젝트 이름'),
  environment: z.enum(['staging', 'production', 'preview']).describe('환경'),
  checks: z.array(z.enum(['http', 'container', 'database', 'redis', 'custom'])).optional()
    .describe('수행할 체크 종류 (기본: http, container)'),
  httpEndpoint: z.string().optional().describe('HTTP 헬스체크 엔드포인트 (기본: /health)'),
  timeout: z.number().optional().describe('타임아웃 (초, 기본: 30)'),
  retries: z.number().optional().describe('재시도 횟수 (기본: 3)'),
  autoRollback: z.boolean().optional().describe('실패 시 자동 롤백 (기본: true)'),
});

export type HealthcheckInput = z.infer<typeof healthcheckInputSchema>;

interface CheckResult {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime?: number;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * HTTP 헬스체크 수행
 */
async function checkHttp(
  projectName: string,
  environment: Environment,
  endpoint: string,
  timeout: number
): Promise<CheckResult> {
  const ssh = getSSHClient();
  const containerName = `${projectName}-${environment}`;

  try {
    // 컨테이너 내부에서 헬스체크
    const startTime = Date.now();
    const result = await ssh.exec(
      `podman exec ${containerName} curl -sf -o /dev/null -w '%{http_code}' --max-time ${timeout} http://localhost:3000${endpoint} 2>/dev/null || echo "failed"`,
      { timeout: (timeout + 5) * 1000 }
    );
    const responseTime = Date.now() - startTime;

    const statusCode = result.stdout.trim();

    if (statusCode === 'failed') {
      // 외부에서 시도 (포트 매핑된 경우)
      const portResult = await ssh.exec(
        `podman port ${containerName} 3000 2>/dev/null | head -1 | cut -d: -f2`
      );
      const port = portResult.stdout.trim();

      if (port) {
        const externalResult = await ssh.exec(
          `curl -sf -o /dev/null -w '%{http_code}' --max-time ${timeout} http://localhost:${port}${endpoint} 2>/dev/null || echo "failed"`
        );
        const externalCode = externalResult.stdout.trim();

        if (externalCode !== 'failed' && externalCode.startsWith('2')) {
          return {
            name: 'http',
            status: 'healthy',
            responseTime,
            message: `HTTP ${externalCode} OK (external port ${port})`,
          };
        }
      }

      return {
        name: 'http',
        status: 'unhealthy',
        responseTime,
        message: 'Health endpoint not responding',
      };
    }

    if (statusCode.startsWith('2')) {
      return {
        name: 'http',
        status: 'healthy',
        responseTime,
        message: `HTTP ${statusCode} OK`,
      };
    } else if (statusCode.startsWith('5')) {
      return {
        name: 'http',
        status: 'unhealthy',
        responseTime,
        message: `HTTP ${statusCode} Server Error`,
      };
    } else {
      return {
        name: 'http',
        status: 'degraded',
        responseTime,
        message: `HTTP ${statusCode}`,
      };
    }
  } catch (error) {
    return {
      name: 'http',
      status: 'unhealthy',
      message: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 컨테이너 상태 체크
 */
async function checkContainer(
  projectName: string,
  environment: Environment
): Promise<CheckResult> {
  const ssh = getSSHClient();
  const containerName = `${projectName}-${environment}`;

  try {
    const result = await ssh.exec(
      `podman inspect ${containerName} --format '{{.State.Status}}:{{.State.Health.Status}}:{{.State.Running}}' 2>/dev/null || echo "not_found"`
    );

    const output = result.stdout.trim();

    if (output === 'not_found') {
      return {
        name: 'container',
        status: 'unhealthy',
        message: 'Container not found',
      };
    }

    const [status, healthStatus, running] = output.split(':');

    // 상세 정보 수집
    const statsResult = await ssh.exec(
      `podman stats ${containerName} --no-stream --format '{{.CPUPerc}}:{{.MemPerc}}:{{.NetIO}}' 2>/dev/null || echo ""`
    );
    const stats = statsResult.stdout.trim().split(':');

    const details: Record<string, unknown> = {
      status,
      running: running === 'true',
      healthStatus: healthStatus || 'none',
    };

    if (stats.length >= 3) {
      details.cpu = stats[0];
      details.memory = stats[1];
      details.network = stats[2];
    }

    if (running !== 'true') {
      return {
        name: 'container',
        status: 'unhealthy',
        message: `Container not running (status: ${status})`,
        details,
      };
    }

    if (healthStatus === 'unhealthy') {
      return {
        name: 'container',
        status: 'unhealthy',
        message: 'Container health check failed',
        details,
      };
    }

    if (healthStatus === 'starting') {
      return {
        name: 'container',
        status: 'degraded',
        message: 'Container still starting',
        details,
      };
    }

    return {
      name: 'container',
      status: 'healthy',
      message: 'Container running normally',
      details,
    };
  } catch (error) {
    return {
      name: 'container',
      status: 'unhealthy',
      message: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 데이터베이스 연결 체크
 */
async function checkDatabase(
  projectName: string,
  environment: Environment
): Promise<CheckResult> {
  const ssh = getSSHClient();
  const dbContainer = `${projectName}-db-${environment}`;

  try {
    // PostgreSQL 연결 테스트
    const result = await ssh.exec(
      `podman exec ${dbContainer} pg_isready -U postgres 2>/dev/null || echo "failed"`,
      { timeout: 10000 }
    );

    if (result.stdout.includes('accepting connections')) {
      // 추가 상태 확인
      const statsResult = await ssh.exec(
        `podman exec ${dbContainer} psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;" -t 2>/dev/null || echo "0"`
      );
      const connections = parseInt(statsResult.stdout.trim()) || 0;

      return {
        name: 'database',
        status: 'healthy',
        message: 'PostgreSQL accepting connections',
        details: { connections },
      };
    }

    return {
      name: 'database',
      status: 'unhealthy',
      message: 'PostgreSQL not responding',
    };
  } catch (error) {
    return {
      name: 'database',
      status: 'unhealthy',
      message: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Redis 연결 체크
 */
async function checkRedis(
  projectName: string,
  environment: Environment
): Promise<CheckResult> {
  const ssh = getSSHClient();
  const redisContainer = `${projectName}-redis-${environment}`;

  try {
    const result = await ssh.exec(
      `podman exec ${redisContainer} redis-cli ping 2>/dev/null || echo "failed"`,
      { timeout: 10000 }
    );

    if (result.stdout.trim() === 'PONG') {
      // 메모리 사용량 확인
      const infoResult = await ssh.exec(
        `podman exec ${redisContainer} redis-cli info memory 2>/dev/null | grep used_memory_human || echo ""`
      );
      const memoryMatch = infoResult.stdout.match(/used_memory_human:(.+)/);

      return {
        name: 'redis',
        status: 'healthy',
        message: 'Redis responding',
        details: {
          memory: memoryMatch ? memoryMatch[1].trim() : 'unknown',
        },
      };
    }

    return {
      name: 'redis',
      status: 'unhealthy',
      message: 'Redis not responding',
    };
  } catch (error) {
    return {
      name: 'redis',
      status: 'unhealthy',
      message: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 재시도 로직이 포함된 체크 실행
 */
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  delay: number = 2000
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Healthcheck 도구 실행
 */
export async function executeHealthcheck(input: HealthcheckInput): Promise<HealthCheckResult> {
  const {
    projectName,
    environment,
    checks = ['http', 'container'],
    httpEndpoint = '/health',
    timeout = 30,
    retries = 3,
    autoRollback = true,
  } = input;

  const ssh = getSSHClient();
  await ssh.connect();

  const results: CheckResult[] = [];
  const startTime = Date.now();

  try {
    // 요청된 체크 수행
    for (const check of checks) {
      let result: CheckResult;

      switch (check) {
        case 'http':
          result = await executeWithRetry(
            () => checkHttp(projectName, environment, httpEndpoint, timeout),
            retries
          );
          break;
        case 'container':
          result = await executeWithRetry(
            () => checkContainer(projectName, environment),
            retries
          );
          break;
        case 'database':
          result = await executeWithRetry(
            () => checkDatabase(projectName, environment),
            retries
          );
          break;
        case 'redis':
          result = await executeWithRetry(
            () => checkRedis(projectName, environment),
            retries
          );
          break;
        case 'custom':
          // 커스텀 체크는 프로젝트 설정에서 정의
          result = {
            name: 'custom',
            status: 'healthy',
            message: 'Custom checks not configured',
          };
          break;
        default:
          result = {
            name: check,
            status: 'degraded',
            message: `Unknown check type: ${check}`,
          };
      }

      results.push(result);
    }

    // 전체 상태 판정
    const unhealthyChecks = results.filter(r => r.status === 'unhealthy');
    const degradedChecks = results.filter(r => r.status === 'degraded');

    let overallStatus: 'healthy' | 'unhealthy' | 'degraded';
    if (unhealthyChecks.length > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedChecks.length > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    const healthResult: HealthCheckResult = {
      status: overallStatus,
      checks: results.reduce((acc, r) => {
        acc[r.name] = {
          status: r.status,
          responseTime: r.responseTime,
          message: r.message,
        };
        return acc;
      }, {} as Record<string, { status: string; responseTime?: number; message?: string }>),
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,
    };

    // 자동 롤백 트리거
    if (overallStatus === 'unhealthy' && autoRollback) {
      console.log(`[Healthcheck] Unhealthy status detected for ${projectName}-${environment}`);
      console.log('[Healthcheck] Auto-rollback would be triggered');

      // 롤백 스크립트 실행
      try {
        const rollbackResult = await ssh.exec(
          `cd /home/codeb/projects/${projectName}/deploy && ./scripts/rollback.sh ${environment} 2>&1`,
          { timeout: 120000 }
        );

        healthResult.rollbackTriggered = true;
        healthResult.rollbackResult = {
          success: rollbackResult.code === 0,
          output: rollbackResult.stdout,
        };
      } catch (rollbackError) {
        healthResult.rollbackTriggered = true;
        healthResult.rollbackResult = {
          success: false,
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        };
      }
    }

    return healthResult;

  } finally {
    ssh.disconnect();
  }
}

/**
 * Healthcheck 도구 정의
 */
export const healthcheckTool = {
  name: 'healthcheck',
  description: '배포된 서비스의 상태를 확인하고 필요시 자동 롤백을 트리거합니다',
  inputSchema: healthcheckInputSchema,
  execute: executeHealthcheck,
};
