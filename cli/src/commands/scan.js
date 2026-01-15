/**
 * Scan Command - MCP-First Architecture v3.0.3
 *
 * 핵심 명령어: 서버 상태를 스캔하고 JSON으로 출력
 * Claude Code / MCP에서 이 결과를 분석하여 다음 액션 제안
 *
 * 주요 검증 항목:
 * 1. ENV 파일 - 신규 서버 IP 기준 검증
 * 2. GitHub Actions - 서버 IP, self-hosted runner 설정 확인
 * 3. Quadlet 파일 - 로컬 vs 서버 비교
 * 4. SSOT 등록 상태 - 프로젝트 레지스트리 확인
 * 5. 네트워크 설정 - codeb-network 구성 확인
 *
 * @module scan
 * @version 3.0.3
 */

import chalk from 'chalk';
import ora from 'ora';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// 분리된 모듈 import
import {
  validateInfrastructure,
  calculateValidationStatus,
  SERVER_CONFIG,
} from './scan-validation.js';

import {
  scanDangerousFiles,
  backupDangerousFiles,
  scanWithCleanup as dangerousCleanup,
} from './scan-dangerous.js';

// Dashboard API Base URL
const API_BASE_URL = process.env.CODEB_API_URL || 'http://localhost:3000/api';

// ================================================================
// API 호출 함수
// ================================================================

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

// ================================================================
// 메인 스캔 함수
// ================================================================

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
      collectValidationIssues(result);

      spinner.succeed('Validation completed');
      printScanResult(result);
      printIssues(result);

      result.recommendations = generateRecommendations(result);
      printRecommendations(result);
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

      spinner.text = `Validating project: ${target}...`;
      result.data.validation = await validateInfrastructure(process.cwd(), environment);

      collectValidationIssues(result);

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

    result.recommendations = generateRecommendations(result);

    spinner.succeed('Scan completed');

    printScanResult(result);
    printIssues(result);
    printRecommendations(result);

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
    result.validation = await validateInfrastructure(process.cwd(), result.environment);

    if (options.server || !target) {
      try {
        const servers = await callApi('/servers');
        result.data.servers = servers.data;
      } catch {
        result.data.servers = SERVER_CONFIG;
      }
    }

    if (options.ports || !target) {
      try {
        const ssot = await callApi('/ssot?action=ports');
        result.data.ports = ssot.data;
      } catch {}
    }

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

    result.actions = generateActions(result);

  } catch (error) {
    result.success = false;
    result.error = error.message;
    result.issues.push({
      severity: 'error',
      message: error.message,
    });
  }

  console.log(JSON.stringify(result, null, 2));
  return result;
}

// ================================================================
// 스캔 함수들
// ================================================================

async function scanServers() {
  try {
    const response = await callApi('/servers');
    return response.data;
  } catch {
    return SERVER_CONFIG;
  }
}

async function scanPorts() {
  const response = await callApi('/ssot?action=ports');
  return response.data;
}

async function scanProjects() {
  const response = await callApi('/projects');
  return response.data;
}

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

async function scanDiff(projectName, environment) {
  const diff = {
    env: { local: [], server: [], missing: [], extra: [] },
    files: { modified: [], missing: [] },
  };

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

  let serverEnv = {};
  try {
    const response = await callApi(`/env?project=${projectName}&env=${environment}&action=current`);
    if (response.data) {
      response.data.forEach(item => {
        serverEnv[item.key] = item.isSecret ? '******' : item.value;
      });
    }
  } catch {}

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

// ================================================================
// 헬퍼 함수들
// ================================================================

function collectValidationIssues(result) {
  if (result.data.validation?.env?.issues) {
    result.issues.push(...result.data.validation.env.issues);
  }
  if (result.data.validation?.githubActions?.issues) {
    result.issues.push(...result.data.validation.githubActions.issues);
  }
  if (result.data.validation?.quadlet?.issues) {
    result.issues.push(...result.data.validation.quadlet.issues);
  }
  if (result.data.validation?.network?.issues) {
    result.issues.push(...result.data.validation.network.issues);
  }
}

function generateActions(result) {
  const actions = [];

  if (result.validation) {
    const validation = result.validation;

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

    if (validation.quadlet?.issues?.length > 0) {
      actions.push({
        type: 'optional',
        priority: 3,
        message: `Quadlet 설정 동기화 필요`,
        command: `we deploy --sync-quadlet`,
      });
    }

    if (validation.network?.issues?.length > 0) {
      actions.push({
        type: 'required',
        priority: 1,
        message: 'codeb-network 생성 필요',
        command: `ssh root@${SERVER_CONFIG.app.ip} "podman network create codeb-network"`,
      });
    }
  }

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

  actions.sort((a, b) => (a.priority || 99) - (b.priority || 99));

  return actions;
}

function generateRecommendations(result) {
  const recommendations = [];

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

// ================================================================
// 출력 함수들
// ================================================================

function printIssues(result) {
  if (result.issues.length > 0) {
    console.log(chalk.red.bold('\n⚠️  Issues Found:\n'));
    result.issues.forEach((issue) => {
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
}

function printRecommendations(result) {
  if (result.recommendations.length > 0) {
    console.log(chalk.yellow.bold('\n💡 Recommendations:\n'));
    result.recommendations.forEach((rec, i) => {
      console.log(chalk.yellow(`  ${i + 1}. ${rec.message}`));
      if (rec.command) {
        console.log(chalk.gray(`     → ${rec.command}`));
      }
    });
  }
}

function printScanResult(result) {
  const { data } = result;

  if (data.validation?.status) {
    const status = data.validation.status;
    const statusIcon = status.status === 'ok' ? chalk.green('✓') :
                       status.status === 'warning' ? chalk.yellow('⚠') : chalk.red('✗');
    console.log(chalk.cyan.bold('\n📊 Validation Status:\n'));
    console.log(`  ${statusIcon} ${status.message}`);
  }

  if (data.servers) {
    console.log(chalk.cyan.bold('\n📡 Servers:\n'));
    for (const [name, server] of Object.entries(data.servers)) {
      const statusIcon = server.status === 'online' ? chalk.green('●') :
                         server.status === undefined ? chalk.blue('●') : chalk.red('●');
      console.log(`  ${statusIcon} ${chalk.bold(name)}`);
      console.log(chalk.gray(`     IP: ${server.ip || 'N/A'}`));
      console.log(chalk.gray(`     Domain: ${server.domain || 'N/A'}`));
    }
  }

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

  if (data.project) {
    console.log(chalk.cyan.bold('\n📋 Project Details:\n'));
    const p = data.project;
    console.log(`  ${chalk.bold('Name:')} ${p.name || p.id}`);
    console.log(`  ${chalk.bold('Type:')} ${p.type || 'unknown'}`);
    console.log(`  ${chalk.bold('Status:')} ${p.status || 'unknown'}`);
  }

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

// ================================================================
// 위험 파일 스캔 관련 Re-export
// ================================================================

export { scanDangerousFiles, backupDangerousFiles };

/**
 * scan 명령어에 --cleanup 옵션 지원
 */
export async function scanWithCleanup(target, options) {
  return dangerousCleanup(scan, target, options);
}

/**
 * 스캔 결과를 MCP 액션으로 변환
 */
export function getSuggestedActions(scanResult) {
  return scanResult.actions || generateActions(scanResult);
}
