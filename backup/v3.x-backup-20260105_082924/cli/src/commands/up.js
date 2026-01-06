/**
 * Up Command - MCP-First Architecture
 *
 * scan 결과를 기반으로 필요한 작업을 자동 실행
 * Claude Code / MCP에서 scan → up 순서로 호출
 *
 * 사용법:
 *   we up [project]           # 프로젝트 시작 (없으면 생성)
 *   we up --all               # 모든 권장 작업 실행
 *   we up --fix               # 문제 자동 수정
 *   we up --sync              # 서버와 동기화
 *   we up --dry-run           # 실행 계획만 출력
 *
 * 자동 감지 및 실행:
 *   1. 프로젝트 미등록 → workflow init
 *   2. ENV 불일치 → env push/pull
 *   3. 컨테이너 중지 → deploy
 *   4. 도메인 미설정 → domain setup
 *
 * @version 3.0.0 - MCP-First Architecture
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { scan, getSuggestedActions } from './scan.js';

// Dashboard API Base URL
const API_BASE_URL = process.env.CODEB_API_URL || 'http://localhost:3000/api';

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
      signal: AbortSignal.timeout(options.timeout || 30000),
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
 * 메인 up 함수
 */
export async function up(target, options) {
  const { all, fix, sync, dryRun, environment = 'production', yes } = options;

  console.log(chalk.cyan.bold('\n🚀 CodeB Up\n'));

  // 프로젝트 이름 결정
  let projectName = target;
  if (!projectName) {
    projectName = await detectProjectName();
  }

  if (!projectName) {
    console.log(chalk.yellow('⚠️  프로젝트를 감지할 수 없습니다.'));
    console.log(chalk.gray('   프로젝트 이름을 지정하세요: we up <project-name>\n'));
    process.exit(1);
  }

  console.log(chalk.gray(`Project: ${projectName}`));
  console.log(chalk.gray(`Environment: ${environment}`));
  console.log(chalk.gray(`Mode: ${dryRun ? 'Dry Run' : 'Execute'}\n`));

  const spinner = ora('Scanning project state...').start();

  try {
    // 1단계: 스캔
    spinner.text = 'Running scan...';
    const scanResult = await runScan(projectName, environment);

    if (!scanResult.success) {
      spinner.fail('Scan failed');
      console.log(chalk.red(`\n❌ ${scanResult.error}\n`));
      process.exit(1);
    }

    // 2단계: 액션 생성
    spinner.text = 'Analyzing actions...';
    const actions = analyzeAndGenerateActions(scanResult, { all, fix, sync });

    spinner.succeed(`Found ${actions.length} action(s)`);

    if (actions.length === 0) {
      console.log(chalk.green('\n✅ Everything is up to date!\n'));
      return;
    }

    // 3단계: 액션 출력
    console.log(chalk.cyan.bold('\n📋 Actions to execute:\n'));

    const requiredActions = actions.filter(a => a.priority === 'required');
    const optionalActions = actions.filter(a => a.priority === 'optional');
    const infoActions = actions.filter(a => a.priority === 'info');

    if (requiredActions.length > 0) {
      console.log(chalk.red.bold('  Required:'));
      requiredActions.forEach((action, i) => {
        console.log(chalk.red(`  ${i + 1}. ${action.message}`));
        if (action.command) console.log(chalk.gray(`     → ${action.command}`));
      });
    }

    if (optionalActions.length > 0) {
      console.log(chalk.yellow.bold('\n  Optional:'));
      optionalActions.forEach((action, i) => {
        console.log(chalk.yellow(`  ${i + 1}. ${action.message}`));
        if (action.command) console.log(chalk.gray(`     → ${action.command}`));
      });
    }

    if (infoActions.length > 0) {
      console.log(chalk.blue.bold('\n  Info:'));
      infoActions.forEach((action, i) => {
        console.log(chalk.blue(`  ${i + 1}. ${action.message}`));
      });
    }

    // Dry run이면 여기서 종료
    if (dryRun) {
      console.log(chalk.yellow('\n⚠️  Dry run mode - no changes made\n'));
      return { actions, executed: false };
    }

    // 4단계: 실행 확인
    const actionsToExecute = [...requiredActions, ...(all ? optionalActions : [])];

    if (actionsToExecute.length === 0) {
      console.log(chalk.gray('\n  No required actions. Use --all to include optional actions.\n'));
      return { actions, executed: false };
    }

    if (!yes) {
      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: `Execute ${actionsToExecute.length} action(s)?`,
        default: true,
      }]);

      if (!proceed) {
        console.log(chalk.gray('\nCancelled.\n'));
        return { actions, executed: false };
      }
    }

    // 5단계: 액션 실행
    console.log(chalk.cyan.bold('\n⚡ Executing actions...\n'));

    const results = [];
    for (const action of actionsToExecute) {
      const actionSpinner = ora(`${action.message}...`).start();

      try {
        const result = await executeAction(action, projectName, environment);
        actionSpinner.succeed(action.message);
        results.push({ action, success: true, result });
      } catch (error) {
        actionSpinner.fail(`${action.message}: ${error.message}`);
        results.push({ action, success: false, error: error.message });

        // 필수 액션 실패 시 중단
        if (action.priority === 'required') {
          console.log(chalk.red('\n❌ Required action failed. Stopping.\n'));
          break;
        }
      }
    }

    // 6단계: 결과 요약
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(chalk.cyan.bold('\n📊 Summary:\n'));
    console.log(chalk.green(`  ✓ Successful: ${successful}`));
    if (failed > 0) {
      console.log(chalk.red(`  ✗ Failed: ${failed}`));
    }
    console.log();

    return { actions, results, executed: true };

  } catch (error) {
    spinner.fail('Up failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

/**
 * 프로젝트 이름 자동 감지
 */
async function detectProjectName() {
  // package.json에서 이름 추출
  const pkgPath = join(process.cwd(), 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.name) {
        // @scope/name 형식이면 name만 추출
        const name = pkg.name.includes('/') ? pkg.name.split('/')[1] : pkg.name;
        return name;
      }
    } catch {}
  }

  // 현재 디렉토리 이름
  const cwd = process.cwd();
  return cwd.split('/').pop();
}

/**
 * 스캔 실행
 */
async function runScan(projectName, environment) {
  try {
    const [projects, ssot, servers] = await Promise.all([
      callApi('/projects'),
      callApi('/ssot?action=status'),
      callApi('/servers'),
    ]);

    const project = projects.data?.find(p => p.id === projectName || p.name === projectName);

    // ENV 상태
    let env = { data: [] };
    if (project) {
      try {
        env = await callApi(`/env?project=${projectName}&env=${environment}&action=current`);
      } catch {}
    }

    // 도메인 상태
    let domains = { data: [] };
    try {
      domains = await callApi('/domains');
    } catch {}

    // 로컬 ENV 파일
    const localEnv = loadLocalEnv(environment);

    return {
      success: true,
      timestamp: new Date().toISOString(),
      project: {
        name: projectName,
        registered: !!project,
        data: project,
      },
      env: {
        server: env.data || [],
        local: localEnv,
      },
      domains: domains.data?.filter(d => d.domain.includes(projectName)) || [],
      servers: servers.data || {},
      ssot: ssot.data || {},
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 로컬 ENV 파일 로드
 */
function loadLocalEnv(environment) {
  const envPaths = [
    join(process.cwd(), `.env.${environment}`),
    join(process.cwd(), '.env.local'),
    join(process.cwd(), '.env'),
  ];

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, 'utf-8');
        const vars = {};
        content.split('\n').forEach(line => {
          const match = line.match(/^([^#=]+)=(.*)$/);
          if (match) {
            vars[match[1].trim()] = match[2].trim();
          }
        });
        return { path: envPath, vars };
      } catch {}
    }
  }

  return { path: null, vars: {} };
}

/**
 * 액션 분석 및 생성
 */
function analyzeAndGenerateActions(scanResult, options) {
  const actions = [];
  const { all, fix, sync } = options;

  // 1. 프로젝트 미등록
  if (!scanResult.project.registered) {
    actions.push({
      type: 'register',
      priority: 'required',
      message: `Register project '${scanResult.project.name}'`,
      command: `we workflow init ${scanResult.project.name}`,
      api: {
        endpoint: '/ssot',
        method: 'POST',
        body: {
          action: 'register-project',
          name: scanResult.project.name,
          type: detectProjectType(),
        },
      },
    });
  }

  // 2. 컨테이너 상태
  if (scanResult.project.registered) {
    const project = scanResult.project.data;

    // 모든 환경이 중지됨
    const allStopped = project.environments?.every(e => e.status !== 'running');
    if (allStopped) {
      actions.push({
        type: 'deploy',
        priority: 'optional',
        message: `Deploy project (currently stopped)`,
        command: `we deploy ${scanResult.project.name}`,
        api: {
          endpoint: '/deploy',
          method: 'POST',
          body: {
            project: scanResult.project.name,
            environment: 'production',
          },
        },
      });
    }
  }

  // 3. ENV 동기화
  const localEnvKeys = Object.keys(scanResult.env.local.vars || {});
  const serverEnvKeys = new Set(scanResult.env.server.map(e => e.key));

  const missingOnServer = localEnvKeys.filter(k => !serverEnvKeys.has(k));
  const missingOnLocal = scanResult.env.server.filter(e => !localEnvKeys.includes(e.key));

  if (missingOnServer.length > 0 && (sync || fix)) {
    actions.push({
      type: 'env-push',
      priority: 'required',
      message: `Push ${missingOnServer.length} missing env vars to server`,
      command: `we env push ${scanResult.project.name}`,
      details: missingOnServer.slice(0, 5),
      api: {
        endpoint: '/env',
        method: 'POST',
        body: {
          project: scanResult.project.name,
          action: 'update',
          variables: Object.fromEntries(
            missingOnServer.map(k => [k, scanResult.env.local.vars[k]])
          ),
        },
      },
    });
  } else if (missingOnServer.length > 0) {
    actions.push({
      type: 'env-info',
      priority: 'info',
      message: `${missingOnServer.length} local env vars not on server`,
      details: missingOnServer.slice(0, 5),
    });
  }

  if (missingOnLocal.length > 0) {
    actions.push({
      type: 'env-info',
      priority: 'info',
      message: `${missingOnLocal.length} server env vars not in local`,
      details: missingOnLocal.slice(0, 5).map(e => e.key),
    });
  }

  // 4. 도메인 설정
  if (scanResult.project.registered && scanResult.domains.length === 0) {
    const suggestedDomain = `${scanResult.project.name}.codeb.kr`;
    actions.push({
      type: 'domain',
      priority: 'optional',
      message: `Setup domain (suggested: ${suggestedDomain})`,
      command: `we domain setup ${suggestedDomain}`,
      api: {
        endpoint: '/domains',
        method: 'POST',
        body: {
          subdomain: scanResult.project.name,
          baseDomain: 'codeb.kr',
          server: 'app',
        },
      },
    });
  }

  // 5. 서버 상태 경고
  for (const [name, server] of Object.entries(scanResult.servers)) {
    if (server.status !== 'online') {
      actions.push({
        type: 'server-alert',
        priority: 'info',
        message: `Server '${name}' is ${server.status}`,
      });
    }
  }

  return actions;
}

/**
 * 프로젝트 타입 감지
 */
function detectProjectType() {
  const pkgPath = join(process.cwd(), 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.dependencies?.next || pkg.devDependencies?.next) return 'nextjs';
      if (pkg.dependencies?.remix || pkg.devDependencies?.remix) return 'remix';
      if (pkg.dependencies?.express) return 'nodejs';
    } catch {}
  }

  // Dockerfile 확인
  if (existsSync(join(process.cwd(), 'Dockerfile'))) {
    return 'docker';
  }

  // Python 확인
  if (existsSync(join(process.cwd(), 'requirements.txt')) ||
      existsSync(join(process.cwd(), 'pyproject.toml'))) {
    return 'python';
  }

  return 'nodejs';
}

/**
 * 액션 실행
 */
async function executeAction(action, projectName, environment) {
  // API 호출이 정의된 경우
  if (action.api) {
    const { endpoint, method, body } = action.api;

    // 환경 정보 추가
    const requestBody = {
      ...body,
      environment: body.environment || environment,
    };

    const response = await callApi(endpoint, {
      method,
      body: requestBody,
      timeout: 120000, // 배포는 시간이 오래 걸릴 수 있음
    });

    if (!response.success) {
      throw new Error(response.error || 'API call failed');
    }

    return response;
  }

  // API가 없는 액션 (정보성)
  return { success: true, info: action.message };
}

/**
 * JSON 출력 (MCP/Claude용)
 */
export async function upJson(target, options) {
  const result = await up(target, { ...options, json: true });
  console.log(JSON.stringify(result, null, 2));
  return result;
}
