/**
 * Scan Command - MCP-First Architecture
 *
 * 핵심 명령어: 서버 상태를 스캔하고 JSON으로 출력
 * Claude Code / MCP에서 이 결과를 분석하여 다음 액션 제안
 *
 * 사용법:
 *   we scan                    # 전체 스캔 (프로젝트 + 서버 + 포트)
 *   we scan [project]          # 특정 프로젝트 스캔
 *   we scan --server           # 서버 상태만
 *   we scan --ports            # 포트 할당 현황
 *   we scan --json             # JSON 출력 (MCP/Claude용)
 *   we scan --diff             # 로컬 vs 서버 차이 분석
 *
 * 출력:
 *   - 터미널: 사람이 읽기 쉬운 형식
 *   - JSON: MCP/Claude가 파싱하여 다음 액션 결정
 *
 * @version 3.0.0 - MCP-First Architecture
 */

import chalk from 'chalk';
import ora from 'ora';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getConfig } from '../lib/config.js';

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
  const { server, ports, json, diff, environment = 'production' } = options;

  // JSON 모드 (MCP/Claude용)
  if (json) {
    return await scanJson(target, options);
  }

  // 터미널 출력 모드
  console.log(chalk.cyan.bold('\n🔍 CodeB Scan\n'));

  const spinner = ora('Scanning...').start();

  try {
    const result = {
      timestamp: new Date().toISOString(),
      target: target || 'all',
      data: {},
      recommendations: [],
    };

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

    spinner.succeed('Scan completed');

    // 결과 출력
    printScanResult(result);

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
    target: target || 'all',
    environment: options.environment || 'production',
    data: {},
    actions: [], // MCP가 실행할 수 있는 액션들
    issues: [],  // 발견된 문제점
  };

  try {
    // 서버 상태
    if (options.server || !target) {
      const servers = await callApi('/servers');
      result.data.servers = servers.data;
    }

    // 포트 현황
    if (options.ports || !target) {
      const ssot = await callApi('/ssot?action=ports');
      result.data.ports = ssot.data;
    }

    // 프로젝트 스캔
    if (target) {
      const projects = await callApi('/projects');
      const project = projects.data?.find(p => p.id === target || p.name === target);

      if (project) {
        result.data.project = project;

        // ENV 상태
        const env = await callApi(`/env?project=${target}&env=${options.environment}&action=current`);
        result.data.env = env.data;

        // 도메인 상태
        const domains = await callApi('/domains');
        result.data.domains = domains.data?.filter(d => d.domain.includes(target));

        // Diff 분석
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
    } else {
      // 전체 프로젝트 목록
      const projects = await callApi('/projects');
      result.data.projects = projects.data;
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

/**
 * 서버 상태 스캔
 */
async function scanServers() {
  const response = await callApi('/servers');
  return response.data;
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

  // 서버 상태 기반 액션
  if (result.data.servers) {
    for (const [name, server] of Object.entries(result.data.servers)) {
      if (server.status !== 'online') {
        actions.push({
          type: 'warning',
          message: `Server ${name} is ${server.status}`,
          command: null, // 수동 개입 필요
        });
      }

      if (server.metrics?.memory) {
        const memUsage = parseInt(server.metrics.memory.split('/')[0]) /
                        parseInt(server.metrics.memory.split('/')[1]) * 100;
        if (memUsage > 80) {
          actions.push({
            type: 'alert',
            message: `Server ${name} memory usage high: ${memUsage.toFixed(1)}%`,
            command: `we monitor --server ${name}`,
          });
        }
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

  return actions;
}

/**
 * 스캔 결과 출력 (터미널용)
 */
function printScanResult(result) {
  const { data } = result;

  // 서버 상태
  if (data.servers) {
    console.log(chalk.cyan.bold('\n📡 Servers:\n'));
    for (const [name, server] of Object.entries(data.servers)) {
      const statusIcon = server.status === 'online' ? chalk.green('●') : chalk.red('●');
      console.log(`  ${statusIcon} ${chalk.bold(name)}`);
      console.log(chalk.gray(`     IP: ${server.ip || 'N/A'}`));
      if (server.metrics) {
        console.log(chalk.gray(`     Memory: ${server.metrics.memory || 'N/A'}`));
        console.log(chalk.gray(`     Disk: ${server.metrics.disk || 'N/A'}`));
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
        if (project.environments) {
          const envs = project.environments.map(e => e.name).join(', ');
          console.log(chalk.gray(`     Environments: ${envs}`));
        }
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

    if (p.environments) {
      console.log(`  ${chalk.bold('Environments:')}`);
      for (const env of p.environments) {
        console.log(chalk.gray(`     - ${env.name}: ${env.status} (${env.container || 'N/A'})`));
      }
    }

    if (data.env && data.env.length > 0) {
      console.log(`  ${chalk.bold('ENV Variables:')} ${data.env.length}`);
    }

    if (data.domains && data.domains.length > 0) {
      console.log(`  ${chalk.bold('Domains:')}`);
      for (const d of data.domains) {
        console.log(chalk.gray(`     - ${d.domain}`));
      }
    }
  }

  // Diff 결과
  if (data.diff) {
    console.log(chalk.cyan.bold('\n🔀 Local vs Server Diff:\n'));
    const diff = data.diff;

    if (diff.env.missing.length > 0) {
      console.log(chalk.yellow(`  Missing on server (${diff.env.missing.length}):`));
      diff.env.missing.slice(0, 5).forEach(item => {
        console.log(chalk.gray(`     - ${item.key}`));
      });
      if (diff.env.missing.length > 5) {
        console.log(chalk.gray(`     ... and ${diff.env.missing.length - 5} more`));
      }
    }

    if (diff.env.extra.length > 0) {
      console.log(chalk.blue(`  Extra on server (${diff.env.extra.length}):`));
      diff.env.extra.slice(0, 5).forEach(item => {
        console.log(chalk.gray(`     - ${item.key}`));
      });
    }

    if (diff.env.local.length > 0) {
      console.log(chalk.magenta(`  Different values (${diff.env.local.length}):`));
      diff.env.local.slice(0, 5).forEach(item => {
        console.log(chalk.gray(`     - ${item.key}`));
      });
    }

    if (diff.env.missing.length === 0 && diff.env.extra.length === 0 && diff.env.local.length === 0) {
      console.log(chalk.green('  ✓ Local and server are in sync'));
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
 * Claude Code에서 이 함수를 호출하여 다음 단계 결정
 */
export function getSuggestedActions(scanResult) {
  return scanResult.actions || generateActions(scanResult);
}
