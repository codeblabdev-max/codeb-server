/**
 * Scan Command - MCP-First Architecture v3.0.3
 *
 * 핵심 명령어: 서버 상태를 스캔하고 JSON으로 출력
 * Claude Code / MCP에서 이 결과를 분석하여 다음 액션 제안
 *
 * 주요 검증 항목:
 * 1. ENV 파일 - 신규 서버 IP 기준 검증 (DATABASE_URL, REDIS_URL, CENTRIFUGO 등)
 * 2. GitHub Actions - 서버 IP, self-hosted runner 설정 확인
 * 3. Quadlet 파일 - 로컬 vs 서버 비교
 * 4. SSOT 등록 상태 - 프로젝트 레지스트리 확인
 * 5. 네트워크 설정 - codeb-network 구성 확인
 *
 * 사용법:
 *   we scan                    # 전체 스캔 (프로젝트 + 서버 + 포트)
 *   we scan [project]          # 특정 프로젝트 스캔
 *   we scan --server           # 서버 상태만
 *   we scan --ports            # 포트 할당 현황
 *   we scan --json             # JSON 출력 (MCP/Claude용)
 *   we scan --diff             # 로컬 vs 서버 차이 분석
 *   we scan --validate         # 신규 서버 기준 전체 검증
 *
 * @version 3.0.3 - Enhanced Infrastructure Validation
 */

import chalk from 'chalk';
import ora from 'ora';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { getConfig, ALLOWED_SERVERS, BLOCKED_SERVERS } from '../lib/config.js';
import { execSync } from 'child_process';

// Dashboard API Base URL
const API_BASE_URL = process.env.CODEB_API_URL || 'http://localhost:3000/api';

// ================================================================
// Server Infrastructure Configuration (config.js에서 import)
// ================================================================
const SERVER_CONFIG = ALLOWED_SERVERS;

// 구버전 서버 (종료 예정) - config.js에서 import
const DEPRECATED_SERVERS = BLOCKED_SERVERS.map(s => s.ip);

// 필수 ENV 변수 패턴
const REQUIRED_ENV_PATTERNS = {
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

// Socket.IO 사용 금지 패턴 (Centrifugo 대신)
const FORBIDDEN_PATTERNS = [
  { pattern: /socket\.io/i, message: 'Socket.IO 사용 금지 - Centrifugo 사용' },
  { pattern: /141\.164\.60\.51/, message: '구버전 서버 IP 감지 - 신규 서버로 교체 필요' },
];

/**
 * Dashboard API 호출
 */
async function callApi(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.CODEB_API_KEY || '',
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new Error('API request timeout');
    }
    throw error;
  }
}

/**
 * 메인 스캔 함수
 */
export async function scan(target, options) {
  const { server, ports, json, diff, validate, environment = 'production' } = options;

  // JSON 모드 (MCP/Claude용)
  if (json) {
    return await scanJson(target, options);
  }

  // 터미널 출력 모드
  console.log(chalk.cyan.bold('\n🔍 CodeB Scan v3.0.3\n'));

  const spinner = ora('Scanning...').start();

  try {
    const result = {
      timestamp: new Date().toISOString(),
      target: target || 'all',
      version: '3.0.3',
      data: {},
      issues: [],
      recommendations: [],
    };

    // 전체 검증 모드 (API 불필요)
    if (validate) {
      spinner.text = 'Validating infrastructure...';
      result.data.validation = await validateInfrastructure(process.cwd(), environment);

      // issues 수집
      if (result.data.validation.env?.issues) {
        result.issues.push(...result.data.validation.env.issues);
      }
      if (result.data.validation.githubActions?.issues) {
        result.issues.push(...result.data.validation.githubActions.issues);
      }
      if (result.data.validation.quadlet?.issues) {
        result.issues.push(...result.data.validation.quadlet.issues);
      }
      if (result.data.validation.network?.issues) {
        result.issues.push(...result.data.validation.network.issues);
      }

      // validate 모드에서는 API 호출 없이 바로 리턴
      spinner.succeed('Validation completed');
      printScanResult(result);

      if (result.issues.length > 0) {
        console.log(chalk.red.bold('\n⚠️  Issues Found:\n'));
        result.issues.forEach((issue, i) => {
          const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
          console.log(chalk[issue.severity === 'error' ? 'red' : 'yellow'](`  ${icon} ${issue.message}`));
          if (issue.current) {
            console.log(chalk.gray(`     Current: ${issue.current}`));
          }
          if (issue.expected) {
            console.log(chalk.green(`     Expected: ${issue.expected}`));
          }
        });
      } else {
        console.log(chalk.green.bold('\n✅ All validations passed!\n'));
      }

      result.recommendations = generateRecommendations(result);
      if (result.recommendations.length > 0) {
        console.log(chalk.yellow.bold('\n💡 Recommendations:\n'));
        result.recommendations.forEach((rec, i) => {
          console.log(chalk.yellow(`  ${i + 1}. ${rec.message}`));
          if (rec.command) {
            console.log(chalk.gray(`     → ${rec.command}`));
          }
        });
      }
      console.log();
      return result;
    }

    // 서버 상태 스캔
    if (server || !target) {
      spinner.text = 'Scanning servers...';
      result.data.servers = await scanServers();
    }

    // 포트 현황 스캔
    if (ports || !target) {
      spinner.text = 'Scanning ports...';
      result.data.ports = await scanPorts();
    }

    // 특정 프로젝트 스캔
    if (target && !server && !ports) {
      spinner.text = `Scanning project: ${target}...`;
      result.data.project = await scanProject(target, environment);

      // 프로젝트별 검증
      spinner.text = `Validating project: ${target}...`;
      result.data.validation = await validateInfrastructure(process.cwd(), environment);

      // issues 수집
      if (result.data.validation.env?.issues) {
        result.issues.push(...result.data.validation.env.issues);
      }
      if (result.data.validation.githubActions?.issues) {
        result.issues.push(...result.data.validation.githubActions.issues);
      }
      if (result.data.validation.quadlet?.issues) {
        result.issues.push(...result.data.validation.quadlet.issues);
      }

      // Diff 분석 (로컬 vs 서버)
      if (diff) {
        spinner.text = 'Comparing local vs server...';
        result.data.diff = await scanDiff(target, environment);
      }
    }

    // 전체 프로젝트 목록
    if (!target && !server && !ports) {
      spinner.text = 'Scanning projects...';
      result.data.projects = await scanProjects();
    }

    // 권장 사항 생성
    result.recommendations = generateRecommendations(result);

    spinner.succeed('Scan completed');

    // 결과 출력
    printScanResult(result);

    // 이슈 출력
    if (result.issues.length > 0) {
      console.log(chalk.red.bold('\n⚠️  Issues Found:\n'));
      result.issues.forEach((issue, i) => {
        const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
        console.log(chalk[issue.severity === 'error' ? 'red' : 'yellow'](`  ${icon} ${issue.message}`));
        if (issue.current) {
          console.log(chalk.gray(`     Current: ${issue.current}`));
        }
        if (issue.expected) {
          console.log(chalk.green(`     Expected: ${issue.expected}`));
        }
      });
    }

    // 권장 사항 출력
    if (result.recommendations.length > 0) {
      console.log(chalk.yellow.bold('\n💡 Recommendations:\n'));
      result.recommendations.forEach((rec, i) => {
        console.log(chalk.yellow(`  ${i + 1}. ${rec.message}`));
        if (rec.command) {
          console.log(chalk.gray(`     → ${rec.command}`));
        }
      });
    }

    console.log();
    return result;

  } catch (error) {
    spinner.fail('Scan failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));

    if (error.message.includes('ECONNREFUSED') || error.message.includes('timeout')) {
      console.log(chalk.yellow('💡 Dashboard API가 실행 중인지 확인하세요:'));
      console.log(chalk.gray('   cd web-ui && npm run dev\n'));
    }

    process.exit(1);
  }
}

/**
 * JSON 출력 모드 (MCP/Claude용)
 */
async function scanJson(target, options) {
  const result = {
    success: true,
    timestamp: new Date().toISOString(),
    version: '3.0.3',
    target: target || 'all',
    environment: options.environment || 'production',
    data: {},
    validation: {},
    actions: [],
    issues: [],
  };

  try {
    // 인프라 검증
    result.validation = await validateInfrastructure(process.cwd(), result.environment);

    // 서버 상태
    if (options.server || !target) {
      try {
        const servers = await callApi('/servers');
        result.data.servers = servers.data;
      } catch {
        result.data.servers = SERVER_CONFIG;
      }
    }

    // 포트 현황
    if (options.ports || !target) {
      try {
        const ssot = await callApi('/ssot?action=ports');
        result.data.ports = ssot.data;
      } catch {}
    }

    // 프로젝트 스캔
    if (target) {
      try {
        const projects = await callApi('/projects');
        const project = projects.data?.find(p => p.id === target || p.name === target);

        if (project) {
          result.data.project = project;

          const env = await callApi(`/env?project=${target}&env=${options.environment}&action=current`);
          result.data.env = env.data;

          const domains = await callApi('/domains');
          result.data.domains = domains.data?.filter(d => d.domain.includes(target));

          if (options.diff) {
            result.data.diff = await scanDiff(target, options.environment);
          }
        } else {
          result.issues.push({
            severity: 'warning',
            message: `Project '${target}' not found in registry`,
            action: { command: 'we workflow init', args: [target] }
          });
        }
      } catch {}
    } else {
      try {
        const projects = await callApi('/projects');
        result.data.projects = projects.data;
      } catch {}
    }

    // validation에서 issues 수집
    if (result.validation.env?.issues) {
      result.issues.push(...result.validation.env.issues);
    }
    if (result.validation.githubActions?.issues) {
      result.issues.push(...result.validation.githubActions.issues);
    }
    if (result.validation.quadlet?.issues) {
      result.issues.push(...result.validation.quadlet.issues);
    }

    // 액션 권장사항 생성
    result.actions = generateActions(result);

  } catch (error) {
    result.success = false;
    result.error = error.message;
    result.issues.push({
      severity: 'error',
      message: error.message,
    });
  }

  // JSON 출력
  console.log(JSON.stringify(result, null, 2));
  return result;
}

// ================================================================
// Infrastructure Validation Functions
// ================================================================

/**
 * 전체 인프라 검증
 */
async function validateInfrastructure(projectPath, environment) {
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
async function validateEnvFiles(projectPath, environment) {
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
async function validateGitHubActions(projectPath) {
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
async function validateQuadletFiles(projectPath) {
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
async function validateNetworkConfig(projectPath) {
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
function calculateValidationStatus(validation) {
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

// ================================================================
// Existing Scan Functions (기존 유지)
// ================================================================

/**
 * 서버 상태 스캔
 */
async function scanServers() {
  try {
    const response = await callApi('/servers');
    return response.data;
  } catch {
    return SERVER_CONFIG;
  }
}

/**
 * 포트 현황 스캔
 */
async function scanPorts() {
  const response = await callApi('/ssot?action=ports');
  return response.data;
}

/**
 * 프로젝트 목록 스캔
 */
async function scanProjects() {
  const response = await callApi('/projects');
  return response.data;
}

/**
 * 특정 프로젝트 스캔
 */
async function scanProject(projectName, environment) {
  const [projects, env, domains] = await Promise.all([
    callApi('/projects'),
    callApi(`/env?project=${projectName}&env=${environment}&action=current`).catch(() => ({ data: [] })),
    callApi('/domains').catch(() => ({ data: [] })),
  ]);

  const project = projects.data?.find(p => p.id === projectName || p.name === projectName);

  return {
    ...project,
    env: env.data,
    domains: domains.data?.filter(d => d.domain.includes(projectName)),
  };
}

/**
 * 로컬 vs 서버 Diff 분석
 */
async function scanDiff(projectName, environment) {
  const diff = {
    env: { local: [], server: [], missing: [], extra: [] },
    files: { modified: [], missing: [] },
  };

  // 로컬 .env 파일 읽기
  const localEnvPath = join(process.cwd(), `.env.${environment}`);
  const localEnvFallback = join(process.cwd(), '.env');

  let localEnv = {};
  const envPath = existsSync(localEnvPath) ? localEnvPath :
                  existsSync(localEnvFallback) ? localEnvFallback : null;

  if (envPath) {
    try {
      const content = readFileSync(envPath, 'utf-8');
      content.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
          localEnv[match[1].trim()] = match[2].trim();
        }
      });
    } catch {}
  }

  // 서버 ENV 가져오기
  let serverEnv = {};
  try {
    const response = await callApi(`/env?project=${projectName}&env=${environment}&action=current`);
    if (response.data) {
      response.data.forEach(item => {
        serverEnv[item.key] = item.isSecret ? '******' : item.value;
      });
    }
  } catch {}

  // 비교
  const localKeys = new Set(Object.keys(localEnv));
  const serverKeys = new Set(Object.keys(serverEnv));

  for (const key of localKeys) {
    if (!serverKeys.has(key)) {
      diff.env.missing.push({ key, value: localEnv[key], location: 'server' });
    } else if (localEnv[key] !== serverEnv[key] && serverEnv[key] !== '******') {
      diff.env.local.push({ key, local: localEnv[key], server: serverEnv[key] });
    }
  }

  for (const key of serverKeys) {
    if (!localKeys.has(key)) {
      diff.env.extra.push({ key, value: serverEnv[key], location: 'local' });
    }
  }

  return diff;
}

/**
 * MCP 액션 생성
 */
function generateActions(result) {
  const actions = [];

  // 검증 기반 액션
  if (result.validation) {
    const validation = result.validation;

    // ENV 이슈
    if (validation.env?.issues?.length > 0) {
      const envErrors = validation.env.issues.filter(i => i.severity === 'error');
      if (envErrors.length > 0) {
        actions.push({
          type: 'required',
          priority: 1,
          message: `${envErrors.length}개의 ENV 설정 오류 수정 필요`,
          command: `we env generate --fix`,
        });
      }
    }

    // GitHub Actions 이슈
    if (validation.githubActions?.issues?.length > 0) {
      const workflowErrors = validation.githubActions.issues.filter(i => i.severity === 'error');
      if (workflowErrors.length > 0) {
        actions.push({
          type: 'required',
          priority: 2,
          message: `GitHub Actions 워크플로우 수정 필요`,
          command: `we workflow generate`,
        });
      }
    }

    // Quadlet 이슈
    if (validation.quadlet?.issues?.length > 0) {
      actions.push({
        type: 'optional',
        priority: 3,
        message: `Quadlet 설정 동기화 필요`,
        command: `we deploy --sync-quadlet`,
      });
    }

    // 네트워크 이슈
    if (validation.network?.issues?.length > 0) {
      actions.push({
        type: 'required',
        priority: 1,
        message: 'codeb-network 생성 필요',
        command: `ssh root@${SERVER_CONFIG.app.ip} "podman network create codeb-network"`,
      });
    }
  }

  // 서버 상태 기반 액션
  if (result.data.servers) {
    for (const [name, server] of Object.entries(result.data.servers)) {
      if (server.status !== 'online' && server.status !== undefined) {
        actions.push({
          type: 'warning',
          message: `Server ${name} is ${server.status}`,
          command: null,
        });
      }
    }
  }

  // 프로젝트 상태 기반 액션
  if (result.data.project) {
    const project = result.data.project;

    if (!project) {
      actions.push({
        type: 'required',
        message: 'Project not registered',
        command: `we workflow init ${result.target}`,
      });
    } else if (project.status === 'stopped') {
      actions.push({
        type: 'optional',
        message: 'Project is stopped',
        command: `we deploy ${project.name}`,
      });
    }
  }

  // Diff 기반 액션
  if (result.data.diff) {
    const diff = result.data.diff;

    if (diff.env.missing.length > 0) {
      actions.push({
        type: 'required',
        message: `${diff.env.missing.length} env variables missing on server`,
        command: `we env push ${result.target}`,
      });
    }

    if (diff.env.extra.length > 0) {
      actions.push({
        type: 'info',
        message: `${diff.env.extra.length} env variables on server not in local`,
        command: `we env pull ${result.target}`,
      });
    }
  }

  // 우선순위로 정렬
  actions.sort((a, b) => (a.priority || 99) - (b.priority || 99));

  return actions;
}

/**
 * 권장 사항 생성
 */
function generateRecommendations(result) {
  const recommendations = [];

  // 검증 결과 기반 권장사항
  if (result.data.validation) {
    const v = result.data.validation;

    if (v.env?.issues?.length > 0) {
      const errorCount = v.env.issues.filter(i => i.severity === 'error').length;
      if (errorCount > 0) {
        recommendations.push({
          message: `ENV 파일 수정 필요 (${errorCount}개 오류)`,
          command: 'we env generate --environment production',
        });
      }
    }

    if (v.githubActions?.issues?.length > 0) {
      recommendations.push({
        message: 'GitHub Actions 워크플로우 업데이트 필요',
        command: 'we workflow generate',
      });
    }

    if (!v.quadlet?.local?.length) {
      recommendations.push({
        message: 'Quadlet 파일이 없습니다. 생성을 권장합니다.',
        command: 'we workflow generate --quadlet',
      });
    }
  }

  return recommendations;
}

/**
 * 스캔 결과 출력 (터미널용)
 */
function printScanResult(result) {
  const { data } = result;

  // 검증 상태
  if (data.validation?.status) {
    const status = data.validation.status;
    const statusIcon = status.status === 'ok' ? chalk.green('✓') :
                       status.status === 'warning' ? chalk.yellow('⚠') : chalk.red('✗');
    console.log(chalk.cyan.bold('\n📊 Validation Status:\n'));
    console.log(`  ${statusIcon} ${status.message}`);
  }

  // 서버 상태
  if (data.servers) {
    console.log(chalk.cyan.bold('\n📡 Servers:\n'));
    for (const [name, server] of Object.entries(data.servers)) {
      const statusIcon = server.status === 'online' ? chalk.green('●') :
                         server.status === undefined ? chalk.blue('●') : chalk.red('●');
      console.log(`  ${statusIcon} ${chalk.bold(name)}`);
      console.log(chalk.gray(`     IP: ${server.ip || 'N/A'}`));
      console.log(chalk.gray(`     Domain: ${server.domain || 'N/A'}`));
      if (server.metrics) {
        console.log(chalk.gray(`     Memory: ${server.metrics.memory || 'N/A'}`));
        console.log(chalk.gray(`     Containers: ${server.metrics.containers || '0'}`));
      }
    }
  }

  // 프로젝트 목록
  if (data.projects) {
    console.log(chalk.cyan.bold('\n📦 Projects:\n'));
    if (data.projects.length === 0) {
      console.log(chalk.gray('  No projects registered'));
    } else {
      for (const project of data.projects) {
        const statusIcon = project.status === 'running' ? chalk.green('●') :
                          project.status === 'stopped' ? chalk.yellow('●') : chalk.red('●');
        console.log(`  ${statusIcon} ${chalk.bold(project.name || project.id)}`);
        console.log(chalk.gray(`     Type: ${project.type || 'unknown'}`));
      }
    }
  }

  // 특정 프로젝트
  if (data.project) {
    console.log(chalk.cyan.bold('\n📋 Project Details:\n'));
    const p = data.project;
    console.log(`  ${chalk.bold('Name:')} ${p.name || p.id}`);
    console.log(`  ${chalk.bold('Type:')} ${p.type || 'unknown'}`);
    console.log(`  ${chalk.bold('Status:')} ${p.status || 'unknown'}`);
  }

  // Diff 결과
  if (data.diff) {
    console.log(chalk.cyan.bold('\n🔀 Local vs Server Diff:\n'));
    const diff = data.diff;

    if (diff.env.missing.length === 0 && diff.env.extra.length === 0 && diff.env.local.length === 0) {
      console.log(chalk.green('  ✓ Local and server are in sync'));
    } else {
      if (diff.env.missing.length > 0) {
        console.log(chalk.yellow(`  Missing on server: ${diff.env.missing.length}`));
      }
      if (diff.env.extra.length > 0) {
        console.log(chalk.blue(`  Extra on server: ${diff.env.extra.length}`));
      }
      if (diff.env.local.length > 0) {
        console.log(chalk.magenta(`  Different values: ${diff.env.local.length}`));
      }
    }
  }

  // 포트 현황
  if (data.ports) {
    console.log(chalk.cyan.bold('\n🔌 Port Allocation:\n'));
    for (const [env, ranges] of Object.entries(data.ports)) {
      console.log(`  ${chalk.bold(env)}:`);
      for (const [type, range] of Object.entries(ranges)) {
        const allocated = range.allocated?.length || 0;
        console.log(chalk.gray(`     ${type}: ${range.start}-${range.end} (${allocated} allocated)`));
      }
    }
  }
}

/**
 * 스캔 결과를 MCP 액션으로 변환
 */
export function getSuggestedActions(scanResult) {
  return scanResult.actions || generateActions(scanResult);
}

// ================================================================
// 위험 파일 감지 및 백업 기능 (v3.0.8)
// ================================================================

import { promises as fsPromises } from 'fs';
import { dirname } from 'path';

/**
 * 위험 파일 패턴 정의
 * - 차단된 서버 IP가 하드코딩된 파일
 * - 구버전 배포 스크립트
 * - 잘못된 설정 파일
 */
const DANGEROUS_FILE_PATTERNS = [
  {
    pattern: /141\.164\.60\.51/,
    reason: '차단된 서버 IP (141.164.60.51) 하드코딩',
    severity: 'critical',
  },
  {
    pattern: /158\.247\.211\.45/,
    reason: '잘못된 서버 IP (158.247.211.45) - 158.247.203.55 사용 필요',
    severity: 'warning',
  },
  {
    pattern: /socket\.io/i,
    reason: 'Socket.IO 사용 - Centrifugo로 교체 필요',
    severity: 'warning',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx'],
  },
];

/**
 * 위험 파일 목록 (파일명 패턴)
 */
const DANGEROUS_FILE_NAMES = [
  { pattern: /^deploy\.sh$/, reason: '직접 배포 스크립트 - MCP 배포 권장' },
  { pattern: /^deploy-.*\.sh$/, reason: '커스텀 배포 스크립트 - 검토 필요' },
  { pattern: /docker-compose\.yml$/i, reason: 'docker-compose - Quadlet 사용 권장', severity: 'info' },
];

/**
 * 스캔에서 제외할 파일 (차단 로직 정의용 또는 문서)
 * 이 파일들은 차단 IP를 감지 목적으로 포함하거나, 문서화를 위해 언급하므로 백업하지 않음
 */
const SCAN_EXCLUDE_FILES = [
  'src/commands/scan.js',       // 차단 패턴 정의
  'src/lib/config.js',          // BLOCKED_SERVERS 정의
  '.env.example',               // 예시 파일 (주석)
  'CLAUDE.md',                  // 문서 (차단 서버 목록 안내)
  'NOTIFICATION_README.md',     // 레거시 문서
  'commands/we/deploy.md',      // 슬래시 커맨드 문서
];

/**
 * 프로젝트 디렉토리에서 위험 파일 스캔
 */
export async function scanDangerousFiles(projectPath = process.cwd()) {
  const result = {
    scanned: 0,
    dangerous: [],
    warnings: [],
    backupNeeded: [],
  };

  // 스캔할 파일 확장자
  const scanExtensions = ['.sh', '.js', '.ts', '.jsx', '.tsx', '.yml', '.yaml', '.env', '.md'];

  // 제외할 디렉토리
  const excludeDirs = ['node_modules', '.git', 'backup', '.next', 'dist', 'build', '.claude'];

  async function scanDirectory(dir) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relativePath = fullPath.replace(projectPath + '/', '');

        if (entry.isDirectory()) {
          // 제외 디렉토리 건너뛰기
          if (excludeDirs.includes(entry.name)) continue;
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          // 확장자 체크
          const ext = entry.name.substring(entry.name.lastIndexOf('.'));
          if (!scanExtensions.includes(ext) && !entry.name.startsWith('.env')) continue;

          result.scanned++;

          // 제외 파일 체크 (차단 패턴 정의용 또는 문서 파일)
          const isExcluded = SCAN_EXCLUDE_FILES.some(excludeFile => {
            // 정확한 경로 매칭 또는 파일명 매칭
            return relativePath === excludeFile ||
                   relativePath.endsWith('/' + excludeFile) ||
                   entry.name === excludeFile;
          });
          if (isExcluded) continue;

          // 파일명 패턴 검사
          for (const namePattern of DANGEROUS_FILE_NAMES) {
            if (namePattern.pattern.test(entry.name)) {
              result.warnings.push({
                file: relativePath,
                reason: namePattern.reason,
                severity: namePattern.severity || 'warning',
              });
            }
          }

          // 파일 내용 검사
          try {
            const content = readFileSync(fullPath, 'utf-8');

            for (const pattern of DANGEROUS_FILE_PATTERNS) {
              // 파일 타입 필터
              if (pattern.fileTypes && !pattern.fileTypes.includes(ext)) continue;

              if (pattern.pattern.test(content)) {
                const item = {
                  file: relativePath,
                  fullPath,
                  reason: pattern.reason,
                  severity: pattern.severity,
                };

                if (pattern.severity === 'critical') {
                  result.dangerous.push(item);
                  result.backupNeeded.push(item);
                } else {
                  result.warnings.push(item);
                }
              }
            }
          } catch (readErr) {
            // 바이너리 파일 등 읽기 실패 무시
          }
        }
      }
    } catch (err) {
      // 디렉토리 접근 실패 무시
    }
  }

  await scanDirectory(projectPath);

  return result;
}

/**
 * 위험 파일을 백업 폴더로 이동
 */
export async function backupDangerousFiles(projectPath = process.cwd(), options = {}) {
  const { dryRun = false, force = false } = options;
  const scanResult = await scanDangerousFiles(projectPath);

  if (scanResult.backupNeeded.length === 0) {
    return {
      success: true,
      message: '백업이 필요한 위험 파일이 없습니다.',
      moved: [],
    };
  }

  const backupDir = join(projectPath, 'backup', `dangerous_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
  const moved = [];
  const errors = [];

  console.log(chalk.yellow(`\n⚠️  ${scanResult.backupNeeded.length}개의 위험 파일 감지됨\n`));

  for (const item of scanResult.backupNeeded) {
    console.log(chalk.red(`  • ${item.file}`));
    console.log(chalk.gray(`    사유: ${item.reason}`));
  }

  if (dryRun) {
    console.log(chalk.cyan('\n[Dry Run] 실제 이동은 수행되지 않았습니다.\n'));
    return {
      success: true,
      dryRun: true,
      backupNeeded: scanResult.backupNeeded,
      moved: [],
    };
  }

  // 사용자 확인 (force 옵션이 없으면)
  if (!force) {
    const inquirer = await import('inquirer');
    const { proceed } = await inquirer.default.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: `${scanResult.backupNeeded.length}개 파일을 백업 폴더로 이동하시겠습니까?`,
      default: false,
    }]);

    if (!proceed) {
      console.log(chalk.gray('\n취소되었습니다.\n'));
      return { success: false, cancelled: true, moved: [] };
    }
  }

  // 백업 디렉토리 생성
  await fsPromises.mkdir(backupDir, { recursive: true });

  for (const item of scanResult.backupNeeded) {
    try {
      const destPath = join(backupDir, item.file);
      const destDir = dirname(destPath);

      // 대상 디렉토리 생성
      await fsPromises.mkdir(destDir, { recursive: true });

      // 파일 이동
      await fsPromises.rename(item.fullPath, destPath);

      moved.push({
        from: item.file,
        to: destPath.replace(projectPath + '/', ''),
        reason: item.reason,
      });

      console.log(chalk.green(`  ✓ ${item.file} → backup/`));
    } catch (err) {
      errors.push({
        file: item.file,
        error: err.message,
      });
      console.log(chalk.red(`  ✗ ${item.file}: ${err.message}`));
    }
  }

  // 결과 요약
  console.log(chalk.cyan(`\n📁 백업 위치: ${backupDir.replace(projectPath + '/', '')}`));
  console.log(chalk.green(`\n✅ ${moved.length}개 파일 백업 완료`));

  if (errors.length > 0) {
    console.log(chalk.red(`❌ ${errors.length}개 파일 실패`));
  }

  // 백업 로그 저장
  const logPath = join(backupDir, 'backup-log.json');
  await fsPromises.writeFile(logPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    projectPath,
    moved,
    errors,
    reason: 'Dangerous files detected by we scan --cleanup',
  }, null, 2));

  return {
    success: errors.length === 0,
    backupDir: backupDir.replace(projectPath + '/', ''),
    moved,
    errors,
  };
}

/**
 * scan 명령어에 --cleanup 옵션 지원
 * MCP 연결 없이도 위험 파일 스캔/백업 가능
 */
export async function scanWithCleanup(target, options) {
  const { cleanup, dryRun, force } = options;

  // cleanup 옵션이 있으면 먼저 위험 파일 처리 (MCP 연결 불필요)
  if (cleanup) {
    console.log(chalk.cyan.bold('\n🧹 Dangerous Files Cleanup\n'));
    console.log(chalk.gray(`📁 Scanning: ${process.cwd()}\n`));

    const dangerousScan = await scanDangerousFiles(process.cwd());

    if (dangerousScan.dangerous.length === 0 && dangerousScan.warnings.length === 0) {
      console.log(chalk.green('✅ 위험 파일이 발견되지 않았습니다.\n'));
    } else {
      // 통계 출력
      console.log(chalk.white(`📊 스캔 결과:`));
      console.log(chalk.white(`   • 스캔된 파일: ${dangerousScan.scanned}개`));
      console.log(chalk.red(`   • 위험 파일: ${dangerousScan.dangerous.length}개`));
      console.log(chalk.yellow(`   • 경고: ${dangerousScan.warnings.length}개\n`));

      // 경고 출력
      if (dangerousScan.warnings.length > 0) {
        console.log(chalk.yellow.bold(`⚠️  경고 파일 (${dangerousScan.warnings.length}개):\n`));
        for (const warn of dangerousScan.warnings) {
          console.log(chalk.yellow(`  • ${warn.file}`));
          console.log(chalk.gray(`    ${warn.reason}`));
          if (warn.matches && warn.matches.length > 0) {
            for (const match of warn.matches.slice(0, 3)) {
              console.log(chalk.gray(`    Line ${match.line}: ${match.content.substring(0, 60)}...`));
            }
          }
          console.log();
        }
      }

      // 위험 파일 백업
      if (dangerousScan.dangerous.length > 0) {
        await backupDangerousFiles(process.cwd(), { dryRun, force });
      }
    }
  }

  // 기본 MCP 스캔은 선택적으로 수행
  let scanResult = null;
  try {
    scanResult = await scan(target, { ...options, cleanup: false });
  } catch (error) {
    if (!cleanup) {
      throw error;
    }
    console.log(chalk.gray('\n📡 MCP 스캔 스킵됨 (연결 불가)\n'));
  }

  return scanResult;
}
