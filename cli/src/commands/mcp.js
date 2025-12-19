/**
 * MCP Setup Command
 *
 * Claude Code의 글로벌 설정에 codeb-deploy MCP 서버를 설정합니다.
 *
 * Actions:
 * - setup: MCP 서버 설정 추가
 * - status: 현재 MCP 설정 상태 확인
 * - remove: MCP 서버 설정 제거
 */

import chalk from 'chalk';
import ora from 'ora';
import { setupMcp, removeMcp, statusMcp } from '../lib/setup-mcp.js';
import { getServerHost, getServerUser } from '../lib/config.js';
import { homedir } from 'os';
import { join } from 'path';

export async function mcp(action = 'status', options = {}) {
  switch (action) {
    case 'setup':
      await handleSetup(options);
      break;

    case 'status':
      await handleStatus();
      break;

    case 'remove':
      await handleRemove(options);
      break;

    case 'serve':
      await handleServe(options);
      break;

    default:
      console.log(chalk.red(`\n❌ 알 수 없는 액션: ${action}`));
      showUsage();
  }
}

async function handleSetup(options) {
  console.log(chalk.cyan('\n🔧 MCP 서버 설정\n'));

  // 설정값 가져오기
  const serverHost = options.host || getServerHost();
  const serverUser = options.user || getServerUser();
  const sshKeyPath = options.sshKey || join(homedir(), '.ssh', 'id_rsa');

  if (!serverHost) {
    console.log(chalk.yellow('⚠️  서버 호스트가 설정되지 않았습니다.'));
    console.log(chalk.gray('   we config init 으로 설정하거나 --host 옵션을 사용하세요.\n'));
  }

  const spinner = ora('MCP 서버 설정 중...').start();

  try {
    const result = await setupMcp({
      serverHost,
      serverUser,
      sshKeyPath,
      force: options.force
    });

    spinner.stop();

    if (result.success) {
      console.log(chalk.green('\n✅ MCP 서버 설정 완료!'));
      console.log(chalk.yellow('\n⚠️  Claude Code를 재시작해야 MCP가 로드됩니다.'));
      console.log(chalk.gray('   VSCode: Cmd+Shift+P → "Claude: Restart"'));
    }
  } catch (error) {
    spinner.fail('MCP 설정 실패');
    console.error(chalk.red(`\n❌ 오류: ${error.message}`));
  }
}

async function handleStatus() {
  console.log(chalk.cyan('\n📊 MCP 서버 상태\n'));

  const result = await statusMcp();

  console.log('\n' + '─'.repeat(50));

  if (result.configured && result.serverExists) {
    console.log(chalk.green('\n✅ MCP 서버가 올바르게 설정되어 있습니다.'));
    console.log(chalk.gray('\n사용 가능한 MCP 도구:'));
    console.log(chalk.white('  • mcp__codeb-deploy__deploy_compose_project'));
    console.log(chalk.white('  • mcp__codeb-deploy__full_health_check'));
    console.log(chalk.white('  • mcp__codeb-deploy__setup_domain'));
    console.log(chalk.white('  • mcp__codeb-deploy__rollback'));
    console.log(chalk.white('  • ... 외 50+ 도구'));
  } else if (!result.serverExists) {
    console.log(chalk.red('\n❌ MCP 서버 파일이 없습니다.'));
    console.log(chalk.yellow('\n해결 방법:'));
    console.log(chalk.gray('  cd codeb-deploy-system/mcp-server && npm run build'));
  } else {
    console.log(chalk.yellow('\n⚠️  MCP 서버가 Claude Code에 설정되지 않았습니다.'));
    console.log(chalk.gray('\n설정하려면:'));
    console.log(chalk.white('  we mcp setup'));
  }
}

async function handleRemove(options) {
  console.log(chalk.cyan('\n🗑️  MCP 서버 제거\n'));

  if (!options.force) {
    console.log(chalk.yellow('정말 MCP 서버 설정을 제거하시겠습니까?'));
    console.log(chalk.gray('  --force 옵션으로 확인 없이 제거할 수 있습니다.\n'));

    // inquirer를 사용한 확인은 나중에 추가
    // 지금은 --force 필요
    console.log(chalk.red('❌ --force 옵션이 필요합니다.'));
    return;
  }

  const spinner = ora('MCP 서버 제거 중...').start();

  try {
    const result = await removeMcp();
    spinner.stop();

    if (result.success) {
      console.log(chalk.green('\n✅ MCP 서버 설정이 제거되었습니다.'));
    }
  } catch (error) {
    spinner.fail('MCP 제거 실패');
    console.error(chalk.red(`\n❌ 오류: ${error.message}`));
  }
}

/**
 * MCP Server - Claude Code에서 호출되는 MCP 서버
 * stdio transport를 통해 통신
 * McpServer 클래스 사용 (high-level API)
 */
async function handleServe(options) {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { execSync } = await import('child_process');
  const { z } = await import('zod');

  // 서버 설정
  const servers = {
    app: process.env.CODEB_APP_SERVER || '158.247.203.55',
    streaming: process.env.CODEB_STREAMING_SERVER || '141.164.42.213',
    storage: process.env.CODEB_STORAGE_SERVER || '64.176.226.119',
    backup: process.env.CODEB_BACKUP_SERVER || '141.164.37.63'
  };

  const server = new McpServer(
    { name: 'codeb-deploy', version: '3.0.0' }
  );

  // 헬퍼 함수: CLI 명령 실행
  const runCmd = (cmd, timeout = 60000) => {
    try {
      return execSync(cmd, { encoding: 'utf-8', timeout });
    } catch (error) {
      throw new Error(error.stderr || error.message);
    }
  };

  // ========== Core Commands (MCP-First Architecture) ==========
  server.tool(
    'scan',
    '서버 상태를 스캔합니다 (프로젝트, 서버, 포트). MCP-First 아키텍처의 핵심 명령어입니다.',
    {
      projectName: z.string().optional().describe('프로젝트 이름 (선택)'),
      diff: z.boolean().optional().describe('로컬 vs 서버 상태 비교'),
      serverOnly: z.boolean().optional().describe('서버 상태만 스캔'),
      ports: z.boolean().optional().describe('포트 현황만 스캔')
    },
    async ({ projectName, diff, serverOnly, ports }) => {
      let cmd = 'we scan';
      if (projectName) cmd += ` ${projectName}`;
      cmd += ' --json';
      if (diff) cmd += ' --diff';
      if (serverOnly) cmd += ' --server';
      if (ports) cmd += ' --ports';
      const result = runCmd(cmd);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  server.tool(
    'up',
    'scan 결과를 바탕으로 권장 작업을 실행합니다 (등록, 동기화, 배포 등)',
    {
      projectName: z.string().optional().describe('프로젝트 이름'),
      all: z.boolean().optional().describe('선택적 작업도 포함'),
      fix: z.boolean().optional().describe('문제 자동 수정'),
      sync: z.boolean().optional().describe('서버 동기화'),
      dryRun: z.boolean().optional().describe('실행 계획만 출력')
    },
    async ({ projectName, all, fix, sync, dryRun }) => {
      let cmd = 'we up';
      if (projectName) cmd += ` ${projectName}`;
      if (all) cmd += ' --all';
      if (fix) cmd += ' --fix';
      if (sync) cmd += ' --sync';
      if (dryRun) cmd += ' --dry-run';
      const result = runCmd(cmd, 300000);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  server.tool(
    'deploy_project',
    '프로젝트를 서버에 배포합니다',
    {
      projectName: z.string().describe('프로젝트 이름'),
      environment: z.enum(['staging', 'production', 'preview']).default('staging').describe('배포 환경')
    },
    async ({ projectName, environment }) => {
      const result = runCmd(`we deploy ${projectName} --environment ${environment}`, 300000);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  // ========== Workflow Commands ==========
  server.tool(
    'workflow_init',
    '새 프로젝트를 초기화합니다 (DB, Redis, GitHub Actions 포함)',
    {
      projectName: z.string().describe('프로젝트 이름'),
      type: z.enum(['nextjs', 'remix', 'nodejs', 'static']).default('nextjs').describe('프로젝트 타입'),
      database: z.boolean().default(true).describe('PostgreSQL 포함'),
      redis: z.boolean().default(true).describe('Redis 포함')
    },
    async ({ projectName, type, database, redis }) => {
      let cmd = `we workflow init ${projectName} --type ${type}`;
      if (database) cmd += ' --database';
      if (redis) cmd += ' --redis';
      cmd += ' --no-interactive';
      const result = runCmd(cmd, 120000);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  server.tool(
    'workflow_scan',
    '프로젝트 리소스 상태를 스캔합니다 (DB, Redis, Storage, ENV)',
    {
      projectName: z.string().describe('프로젝트 이름')
    },
    async ({ projectName }) => {
      const result = runCmd(`we workflow scan ${projectName}`);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  // ========== Health & Monitoring ==========
  server.tool(
    'health_check',
    '서버 상태를 확인합니다',
    {
      server: z.enum(['app', 'streaming', 'storage', 'backup', 'all']).default('all').describe('확인할 서버')
    },
    async ({ server: targetServer }) => {
      const results = [];

      const checkServer = (name, ip) => {
        try {
          execSync(`ssh -o ConnectTimeout=5 root@${ip} "uptime"`, { encoding: 'utf-8', timeout: 10000 });
          return { name, ip, status: 'healthy' };
        } catch {
          return { name, ip, status: 'unreachable' };
        }
      };

      if (targetServer === 'all') {
        for (const [name, ip] of Object.entries(servers)) {
          results.push(checkServer(name, ip));
        }
      } else {
        const ip = servers[targetServer];
        if (ip) results.push(checkServer(targetServer, ip));
      }

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }
  );

  server.tool(
    'get_server_info',
    '서버 정보를 조회합니다 (IP, 포트, 역할)',
    {},
    async () => {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            servers,
            ports: {
              postgresql: 5432,
              redis: 6379,
              centrifugo: 8000,
              production: '4000-4499',
              staging: '4500-4999',
              preview: '5000-5999'
            },
            roles: {
              app: 'Next.js 앱, PowerDNS, Caddy',
              streaming: 'Centrifugo (WebSocket)',
              storage: 'PostgreSQL, Redis',
              backup: '백업, Preview 환경, ENV 저장소'
            }
          }, null, 2)
        }]
      };
    }
  );

  // ========== SSOT Commands ==========
  server.tool('ssot_status', 'SSOT 레지스트리 상태를 조회합니다', {},
    async () => ({ content: [{ type: 'text', text: runCmd('we ssot status', 30000) }] }));

  server.tool('ssot_sync', 'SSOT 레지스트리를 동기화합니다', {},
    async () => ({ content: [{ type: 'text', text: runCmd('we ssot sync', 30000) }] }));

  server.tool('ssot_projects', '등록된 프로젝트 목록을 조회합니다', {},
    async () => ({ content: [{ type: 'text', text: runCmd('we ssot projects', 30000) }] }));

  // ========== Domain Commands ==========
  server.tool(
    'domain_setup',
    '도메인을 설정합니다',
    {
      domain: z.string().describe('도메인 이름'),
      projectName: z.string().describe('프로젝트 이름'),
      ssl: z.boolean().default(true).describe('SSL 설정')
    },
    async ({ domain, projectName, ssl }) => {
      const sslFlag = ssl ? '--ssl' : '';
      const result = runCmd(`we domain setup ${domain} --project ${projectName} ${sslFlag}`);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  server.tool('domain_list', '등록된 도메인 목록을 조회합니다', {},
    async () => ({ content: [{ type: 'text', text: runCmd('we domain list', 30000) }] }));

  // ========== Team Commands ==========
  server.tool('team_list', '팀원 목록을 조회합니다', {},
    async () => ({ content: [{ type: 'text', text: runCmd('we team list', 30000) }] }));

  server.tool('team_status', '팀 현황 요약을 조회합니다', {},
    async () => ({ content: [{ type: 'text', text: runCmd('we team status', 30000) }] }));

  // ========== ENV Commands ==========
  server.tool(
    'env_scan',
    '로컬 vs 서버 ENV를 비교합니다',
    { projectName: z.string().describe('프로젝트 이름') },
    async ({ projectName }) => ({ content: [{ type: 'text', text: runCmd(`we env scan ${projectName}`, 30000) }] })
  );

  server.tool(
    'env_backups',
    '프로젝트의 ENV 백업 목록을 조회합니다',
    { projectName: z.string().describe('프로젝트 이름') },
    async ({ projectName }) => ({ content: [{ type: 'text', text: runCmd(`we env backups ${projectName}`, 30000) }] })
  );

  server.tool(
    'env_restore',
    'ENV를 백업에서 복구합니다 (master, current, timestamp)',
    {
      projectName: z.string().describe('프로젝트 이름'),
      version: z.string().default('master').describe('버전 (master|current|timestamp)'),
      environment: z.string().default('production').describe('환경 (production|staging)')
    },
    async ({ projectName, version, environment }) => {
      const result = runCmd(`we env restore ${projectName} --version ${version} --environment ${environment}`);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  // ========== Preview Commands ==========
  server.tool('preview_list', '현재 Preview 환경 목록을 조회합니다', {},
    async () => ({ content: [{ type: 'text', text: runCmd('we preview list', 30000) }] }));

  server.tool('preview_status', 'Preview 서버 상태를 조회합니다', {},
    async () => ({ content: [{ type: 'text', text: runCmd('we preview status', 30000) }] }));

  server.tool(
    'preview_delete',
    'Preview 환경을 삭제합니다',
    { branch: z.string().describe('브랜치 이름') },
    async ({ branch }) => ({ content: [{ type: 'text', text: runCmd(`we preview delete ${branch}`) }] })
  );

  // stdio transport로 서버 시작
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function showUsage() {
  console.log(chalk.cyan('\n📖 MCP 명령어 사용법\n'));
  console.log('Actions:');
  console.log(chalk.white('  setup   ') + chalk.gray('Claude Code에 MCP 서버 설정'));
  console.log(chalk.white('  status  ') + chalk.gray('현재 MCP 설정 상태 확인'));
  console.log(chalk.white('  remove  ') + chalk.gray('MCP 서버 설정 제거'));
  console.log(chalk.white('  serve   ') + chalk.gray('MCP 서버 실행 (Claude Code용)'));
  console.log('\nOptions:');
  console.log(chalk.white('  --host <ip>    ') + chalk.gray('서버 호스트 지정'));
  console.log(chalk.white('  --user <user>  ') + chalk.gray('SSH 사용자 지정'));
  console.log(chalk.white('  --ssh-key <path> ') + chalk.gray('SSH 키 경로 지정'));
  console.log(chalk.white('  --force        ') + chalk.gray('확인 없이 실행'));
  console.log('\nExamples:');
  console.log(chalk.gray('  we mcp status'));
  console.log(chalk.gray('  we mcp setup'));
  console.log(chalk.gray('  we mcp serve'));
  console.log(chalk.gray('  we mcp remove --force'));
}
