/**
 * Scan Validation Module - Infrastructure Validation Functions
 *
 * ENV 파일, GitHub Actions, Quadlet, 네트워크 설정 검증
 *
 * @module scan-validation
 * @version 3.0.3
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';
import { ALLOWED_SERVERS, BLOCKED_SERVERS } from '../lib/config.js';

// ================================================================
// Server Infrastructure Configuration
// ================================================================
export const SERVER_CONFIG = ALLOWED_SERVERS;

// 구버전 서버 (종료 예정)
export const DEPRECATED_SERVERS = BLOCKED_SERVERS.map(s => s.ip);

// 필수 ENV 변수 패턴
export const REQUIRED_ENV_PATTERNS = {
  DATABASE_URL: {
    pattern: /postgresql:\/\/.*@(db\.codeb\.kr|storage\.codeb\.kr|64\.176\.226\.119)/,
    description: 'PostgreSQL (Storage 서버)',
    correctExample: 'postgresql://postgres:password@db.codeb.kr:5432/myapp'
  },
  REDIS_URL: {
    pattern: /redis:\/\/(db\.codeb\.kr|storage\.codeb\.kr|64\.176\.226\.119)/,
    description: 'Redis (Storage 서버)',
    correctExample: 'redis://db.codeb.kr:6379/0'
  },
  CENTRIFUGO_URL: {
    pattern: /wss:\/\/(ws\.codeb\.kr|streaming\.codeb\.kr|141\.164\.42\.213)/,
    description: 'Centrifugo WebSocket (Streaming 서버)',
    correctExample: 'wss://ws.codeb.kr/connection/websocket'
  },
  CENTRIFUGO_API_URL: {
    pattern: /http:\/\/(ws\.codeb\.kr|streaming\.codeb\.kr|141\.164\.42\.213)/,
    description: 'Centrifugo API (Streaming 서버)',
    correctExample: 'http://ws.codeb.kr:8000/api'
  }
};

// Socket.IO 사용 금지 패턴
export const FORBIDDEN_PATTERNS = [
  { pattern: /socket\.io/i, message: 'Socket.IO 사용 금지 - Centrifugo 사용' },
  { pattern: /141\.164\.60\.51/, message: '구버전 서버 IP 감지 - 신규 서버로 교체 필요' },
];

// ================================================================
// Infrastructure Validation Functions
// ================================================================

/**
 * 전체 인프라 검증
 */
export async function validateInfrastructure(projectPath, environment) {
  const validation = {
    timestamp: new Date().toISOString(),
    serverConfig: SERVER_CONFIG,
    env: await validateEnvFiles(projectPath, environment),
    githubActions: await validateGitHubActions(projectPath),
    quadlet: await validateQuadletFiles(projectPath),
    network: await validateNetworkConfig(projectPath),
  };

  // 전체 상태 계산
  validation.status = calculateValidationStatus(validation);

  return validation;
}

/**
 * ENV 파일 검증
 */
export async function validateEnvFiles(projectPath, environment) {
  const result = {
    files: [],
    issues: [],
    valid: true,
  };

  // 검사할 ENV 파일들
  const envFiles = [
    `.env.${environment}`,
    '.env.production',
    '.env.staging',
    '.env.local',
    '.env',
  ];

  for (const fileName of envFiles) {
    const filePath = join(projectPath, fileName);
    if (!existsSync(filePath)) continue;

    const fileResult = {
      name: fileName,
      path: filePath,
      variables: {},
      issues: [],
    };

    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (!match) continue;

        const [, key, value] = match;
        const trimmedKey = key.trim();
        const trimmedValue = value.trim();

        fileResult.variables[trimmedKey] = trimmedValue;

        // 필수 ENV 패턴 검증
        if (REQUIRED_ENV_PATTERNS[trimmedKey]) {
          const pattern = REQUIRED_ENV_PATTERNS[trimmedKey];
          if (!pattern.pattern.test(trimmedValue)) {
            const issue = {
              severity: 'error',
              type: 'env_mismatch',
              file: fileName,
              key: trimmedKey,
              message: `${trimmedKey}: ${pattern.description} 설정 오류`,
              current: trimmedValue,
              expected: pattern.correctExample,
            };
            fileResult.issues.push(issue);
            result.issues.push(issue);
            result.valid = false;
          }
        }

        // 금지된 패턴 검사
        for (const forbidden of FORBIDDEN_PATTERNS) {
          if (forbidden.pattern.test(trimmedValue)) {
            const issue = {
              severity: 'warning',
              type: 'forbidden_pattern',
              file: fileName,
              key: trimmedKey,
              message: forbidden.message,
              current: trimmedValue,
            };
            fileResult.issues.push(issue);
            result.issues.push(issue);
          }
        }

        // 구버전 서버 IP 감지
        for (const deprecatedIp of DEPRECATED_SERVERS) {
          if (trimmedValue.includes(deprecatedIp.split('/')[0])) {
            const issue = {
              severity: 'error',
              type: 'deprecated_server',
              file: fileName,
              key: trimmedKey,
              message: `구버전 서버 IP 감지: ${deprecatedIp}`,
              current: trimmedValue,
              expected: '신규 서버 도메인으로 교체: app.codeb.kr / ws.codeb.kr / db.codeb.kr / backup.codeb.kr',
            };
            fileResult.issues.push(issue);
            result.issues.push(issue);
            result.valid = false;
          }
        }
      }

      // 필수 ENV 변수 누락 검사
      for (const [key, pattern] of Object.entries(REQUIRED_ENV_PATTERNS)) {
        if (!fileResult.variables[key]) {
          // production 환경에서만 경고
          if (fileName.includes('production') || fileName === '.env') {
            const issue = {
              severity: 'warning',
              type: 'missing_env',
              file: fileName,
              key: key,
              message: `필수 환경변수 누락: ${key}`,
              expected: pattern.correctExample,
            };
            fileResult.issues.push(issue);
            result.issues.push(issue);
          }
        }
      }

    } catch (err) {
      fileResult.error = err.message;
    }

    result.files.push(fileResult);
  }

  return result;
}

/**
 * GitHub Actions 파일 검증
 */
export async function validateGitHubActions(projectPath) {
  const result = {
    files: [],
    issues: [],
    valid: true,
  };

  const workflowsPath = join(projectPath, '.github', 'workflows');
  if (!existsSync(workflowsPath)) {
    result.issues.push({
      severity: 'warning',
      type: 'missing_workflows',
      message: 'GitHub Actions 워크플로우가 없습니다',
      expected: '.github/workflows/ 디렉토리 생성 필요',
    });
    return result;
  }

  try {
    const files = readdirSync(workflowsPath).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

    for (const fileName of files) {
      const filePath = join(workflowsPath, fileName);
      const fileResult = {
        name: fileName,
        path: filePath,
        issues: [],
      };

      try {
        const content = readFileSync(filePath, 'utf-8');

        // self-hosted runner 사용 확인
        if (!content.includes('runs-on: self-hosted')) {
          fileResult.issues.push({
            severity: 'info',
            type: 'no_self_hosted',
            message: 'Self-hosted runner 미사용 (GitHub-hosted only)',
          });
        }

        // 구버전 서버 IP 감지
        for (const deprecatedIp of DEPRECATED_SERVERS) {
          const ip = deprecatedIp.split('/')[0];
          if (content.includes(ip)) {
            const issue = {
              severity: 'error',
              type: 'deprecated_server_in_workflow',
              file: fileName,
              message: `구버전 서버 IP 감지: ${ip}`,
              expected: '신규 서버 IP로 교체 필요 (158.247.203.55)',
            };
            fileResult.issues.push(issue);
            result.issues.push(issue);
            result.valid = false;
          }
        }

        // 신규 서버 IP 확인
        const hasCorrectAppServer = content.includes(SERVER_CONFIG.app.ip) ||
                                     content.includes(SERVER_CONFIG.app.domain);

        // deploy job이 있는데 올바른 서버가 없는 경우
        if (content.includes('deploy') && !hasCorrectAppServer && content.includes('self-hosted')) {
          const issue = {
            severity: 'warning',
            type: 'server_ip_not_found',
            file: fileName,
            message: 'App 서버 IP/도메인이 워크플로우에 없습니다',
            expected: `${SERVER_CONFIG.app.ip} 또는 ${SERVER_CONFIG.app.domain}`,
          };
          fileResult.issues.push(issue);
          result.issues.push(issue);
        }

        // Quadlet 사용 확인
        if (content.includes('quadlet') || content.includes('.container')) {
          fileResult.usesQuadlet = true;
        }

        // Podman 사용 확인
        if (content.includes('podman')) {
          fileResult.usesPodman = true;
        }

        // CLI 버전 확인
        const cliVersionMatch = content.match(/we-cli@([0-9.]+)/);
        if (cliVersionMatch) {
          fileResult.cliVersion = cliVersionMatch[1];
          if (cliVersionMatch[1] < '3.0.3') {
            const issue = {
              severity: 'info',
              type: 'cli_update_available',
              file: fileName,
              message: `CLI 업데이트 필요: ${cliVersionMatch[1]} → 3.0.3`,
            };
            fileResult.issues.push(issue);
          }
        }

      } catch (err) {
        fileResult.error = err.message;
      }

      result.files.push(fileResult);
    }

  } catch (err) {
    result.error = err.message;
  }

  return result;
}

/**
 * Quadlet 파일 검증
 */
export async function validateQuadletFiles(projectPath) {
  const result = {
    local: [],
    server: [],
    issues: [],
    valid: true,
  };

  // 로컬 Quadlet 파일 검색
  const quadletPaths = [
    join(projectPath, 'quadlet'),
    join(projectPath, 'infrastructure', 'quadlet'),
  ];

  for (const quadletPath of quadletPaths) {
    if (!existsSync(quadletPath)) continue;

    try {
      const files = readdirSync(quadletPath).filter(f =>
        f.endsWith('.container') || f.endsWith('.network') || f.endsWith('.volume')
      );

      for (const fileName of files) {
        const filePath = join(quadletPath, fileName);
        const content = readFileSync(filePath, 'utf-8');

        const fileResult = {
          name: fileName,
          path: filePath,
          type: fileName.split('.').pop(),
        };

        // 네트워크 설정 확인
        if (content.includes('Network=') && !content.includes('codeb-network')) {
          const issue = {
            severity: 'warning',
            type: 'network_mismatch',
            file: fileName,
            message: 'codeb-network 사용 권장',
          };
          result.issues.push(issue);
        }

        // 구버전 서버 참조 확인
        for (const deprecatedIp of DEPRECATED_SERVERS) {
          const ip = deprecatedIp.split('/')[0];
          if (content.includes(ip)) {
            const issue = {
              severity: 'error',
              type: 'deprecated_server_in_quadlet',
              file: fileName,
              message: `구버전 서버 IP 감지: ${ip}`,
            };
            result.issues.push(issue);
            result.valid = false;
          }
        }

        // Image 정보 추출
        const imageMatch = content.match(/Image=(.+)/);
        if (imageMatch) {
          fileResult.image = imageMatch[1];
        }

        // Port 정보 추출
        const portMatch = content.match(/PublishPort=(\d+):(\d+)/);
        if (portMatch) {
          fileResult.hostPort = portMatch[1];
          fileResult.containerPort = portMatch[2];
        }

        result.local.push(fileResult);
      }

    } catch (err) {
      result.error = err.message;
    }
  }

  // 서버 Quadlet 파일 비교 (SSH 사용 가능한 경우)
  try {
    const sshResult = execSync(
      `ssh -o ConnectTimeout=5 root@${SERVER_CONFIG.app.ip} "ls /etc/containers/systemd/*.container 2>/dev/null || echo ''"`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();

    if (sshResult) {
      result.server = sshResult.split('\n').map(f => ({
        name: basename(f),
        path: f,
      }));

      // 로컬에는 있지만 서버에 없는 파일
      for (const local of result.local) {
        const serverFile = result.server.find(s => s.name === local.name);
        if (!serverFile) {
          result.issues.push({
            severity: 'info',
            type: 'quadlet_not_deployed',
            file: local.name,
            message: `로컬 Quadlet 파일이 서버에 없습니다: ${local.name}`,
            action: `we deploy --sync-quadlet`,
          });
        }
      }
    }
  } catch {
    // SSH 접속 불가 - 건너뛰기
    result.sshAvailable = false;
  }

  return result;
}

/**
 * 네트워크 설정 검증
 */
export async function validateNetworkConfig(projectPath) {
  const result = {
    issues: [],
    valid: true,
  };

  // codeb-network 존재 확인 (서버)
  try {
    const networkCheck = execSync(
      `ssh -o ConnectTimeout=5 root@${SERVER_CONFIG.app.ip} "podman network exists codeb-network && echo 'exists' || echo 'missing'"`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();

    if (networkCheck === 'missing') {
      result.issues.push({
        severity: 'warning',
        type: 'network_missing',
        message: 'codeb-network가 서버에 없습니다',
        action: 'we setup-network',
      });
      result.valid = false;
    } else {
      result.networkExists = true;
    }
  } catch {
    result.sshAvailable = false;
  }

  return result;
}

/**
 * 검증 상태 계산
 */
export function calculateValidationStatus(validation) {
  const issues = [
    ...(validation.env?.issues || []),
    ...(validation.githubActions?.issues || []),
    ...(validation.quadlet?.issues || []),
    ...(validation.network?.issues || []),
  ];

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  if (errorCount > 0) {
    return { status: 'error', message: `${errorCount} errors, ${warningCount} warnings` };
  } else if (warningCount > 0) {
    return { status: 'warning', message: `${warningCount} warnings` };
  } else {
    return { status: 'ok', message: 'All validations passed' };
  }
}

export default {
  validateInfrastructure,
  validateEnvFiles,
  validateGitHubActions,
  validateQuadletFiles,
  validateNetworkConfig,
  calculateValidationStatus,
  SERVER_CONFIG,
  DEPRECATED_SERVERS,
  REQUIRED_ENV_PATTERNS,
  FORBIDDEN_PATTERNS,
};
