#!/usr/bin/env node

/**
 * /we: - Web Deploy CLI
 *
 * Single entry point for all deployment operations:
 * - Deploy: Project deployment with MCP codeb-deploy integration
 * - Analyze: 7-Agent system analysis with depth/focus options
 * - Optimize: Performance and resource optimization
 * - Health: Health check via MCP full_health_check
 * - Domain: Domain management (setup/remove/check/list)
 * - Agent: Direct 7-Agent invocation with Task tool
 * - Monitor: Real-time monitoring and metrics
 * - Rollback: Safe deployment rollback
 * - Workflow: Quadlet + GitHub Actions CI/CD generation
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get version from cli/package.json (single source of truth)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const VERSION = pkg.version;

// Core Commands (MCP-First Architecture)
import { scan } from '../src/commands/scan.js';
import { up } from '../src/commands/up.js';
import { deploy } from '../src/commands/deploy.js';
// Analysis & Optimization
import { analyze } from '../src/commands/analyze.js';
import { optimize } from '../src/commands/optimize.js';
import { health } from '../src/commands/health.js';
// Infrastructure
import { domain } from '../src/commands/domain.js';
import { agent } from '../src/commands/agent.js';
import { monitor } from '../src/commands/monitor.js';
import { rollback } from '../src/commands/rollback.js';
import { workflow } from '../src/commands/workflow.js';
import { ssh } from '../src/commands/ssh.js';
import { help } from '../src/commands/help.js';
import { config } from '../src/commands/config.js';
import { mcp } from '../src/commands/mcp.js';
import { ssot } from '../src/commands/ssot.js';
import { setup } from '../src/commands/setup.js';
import { envScan, envPull, envPush, envFix, envList, envRestore, envBackups } from '../src/commands/env.js';
import { project } from '../src/commands/project.js';
import { team } from '../src/commands/team.js';
import { preview } from '../src/commands/preview.js';
import { tui } from '../src/commands/tui.js';
import { init } from '../src/commands/init.js';
import { getServerHost, getServerUser, getDbPassword } from '../src/lib/config.js';

const program = new Command();

// CLI Header - MCP serve 모드에서는 출력하지 않음 (stdio 통신)
const isMcpServe = process.argv.includes('mcp') && process.argv.includes('serve');
if (!isMcpServe) {
  console.log(chalk.cyan.bold('\n╔═══════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold(`║   /we: Web Deploy CLI v${VERSION}                 ║`));
  console.log(chalk.cyan.bold('║   scan → up → deploy (MCP-First)              ║'));
  console.log(chalk.cyan.bold('╚═══════════════════════════════════════════════╝\n'));
}

program
  .name('/we:')
  .description('/we: Web Deploy CLI - MCP-First Architecture for Claude Code')
  .version(VERSION);

// ============================================================================
// Core Commands (MCP-First Architecture)
// ============================================================================

// Scan Command - 핵심 명령어 #1
program
  .command('scan')
  .description('Scan server state and validate infrastructure (ENV, GitHub Actions, Quadlet)')
  .argument('[project]', 'Project name to scan (optional, scans all if not specified)')
  .option('-s, --server', 'Scan servers only')
  .option('-p, --ports', 'Scan port allocation only')
  .option('-j, --json', 'Output in JSON format (for MCP/Claude)')
  .option('-d, --diff', 'Compare local vs server state')
  .option('-v, --validate', 'Validate infrastructure (ENV, GitHub Actions, Quadlet, Network)')
  .option('-e, --environment <env>', 'Target environment', 'production')
  .option('-c, --cleanup', 'Scan and backup dangerous files (blocked server IPs, etc.)')
  .option('--dry-run', 'Show what would be cleaned up without actually doing it')
  .option('--force', 'Skip confirmation prompts for cleanup')
  .action(async (project, options) => {
    if (options.cleanup) {
      const { scanWithCleanup } = await import('../src/commands/scan.js');
      return scanWithCleanup(project, options);
    }
    return scan(project, options);
  });

// Up Command - 핵심 명령어 #2
program
  .command('up')
  .description('Execute recommended actions from scan (register, sync, deploy)')
  .argument('[project]', 'Project name (auto-detected from package.json)')
  .option('-a, --all', 'Execute all actions (including optional)')
  .option('-f, --fix', 'Auto-fix detected issues')
  .option('-s, --sync', 'Sync local and server state')
  .option('-e, --environment <env>', 'Target environment', 'production')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--dry-run', 'Show execution plan without running')
  .action(up);

// Deploy Command - 핵심 명령어 #3
program
  .command('deploy')
  .description('Deploy project to staging/production/preview')
  .argument('[project]', 'Project name to deploy')
  .option('-e, --environment <env>', 'Target environment (staging|production|preview)', 'staging')
  .option('-f, --file <path>', 'Docker compose file path', 'docker-compose.yml')
  .option('--no-cache', 'Build without cache')
  .option('--force', 'Force deployment even with warnings')
  .option('--dry-run', 'Show deployment plan without executing')
  .option('--skip-scan', 'Skip pre-deploy scan')
  .action(deploy);

// Analyze Command
program
  .command('analyze')
  .description('Analyze project with 7-Agent system')
  .argument('[target]', 'Target to analyze (project|file|component)')
  .option('-d, --depth <level>', 'Analysis depth (shallow|normal|deep)', 'normal')
  .option('-f, --focus <area>', 'Focus area (security|performance|quality|all)', 'all')
  .option('-a, --agent <type>', 'Specific agent to use (master|api|frontend|db|e2e|admin)', 'master')
  .option('-o, --output <format>', 'Output format (text|json|markdown)', 'text')
  .option('--save <path>', 'Save analysis report to file')
  .action(analyze);

// Optimize Command
program
  .command('optimize')
  .description('Optimize project performance and resources')
  .option('-t, --target <type>', 'Optimization target (bundle|memory|database|all)', 'all')
  .option('--aggressive', 'Use aggressive optimization strategies')
  .option('--safe-mode', 'Conservative optimization with validation')
  .option('--dry-run', 'Show optimization plan without executing')
  .action(optimize);

// Health Command
program
  .command('health')
  .description('Check system health status')
  .option('-v, --verbose', 'Show detailed health information')
  .option('-j, --json', 'Output in JSON format')
  .option('-w, --watch', 'Continuous health monitoring')
  .option('-i, --interval <seconds>', 'Watch interval in seconds', '30')
  .action(health);

// Domain Command
program
  .command('domain')
  .description('Manage domains (setup|remove|check|list)')
  .argument('<action>', 'Action to perform (setup|remove|check|list)')
  .argument('[domain]', 'Domain name (required for setup/remove/check)')
  .option('-p, --project <name>', 'Project name')
  .option('--ssl', 'Enable SSL/TLS')
  .option('--www', 'Include www subdomain')
  .option('--force', 'Force operation without confirmation')
  .action(domain);

// Agent Command
program
  .command('agent')
  .description('Invoke specific 7-Agent directly')
  .argument('<type>', 'Agent type (master|api|frontend|db|e2e|admin|all)')
  .argument('<task>', 'Task description for the agent')
  .option('-c, --context <json>', 'Additional context as JSON')
  .option('-o, --output <format>', 'Output format (text|json)', 'text')
  .option('--save <path>', 'Save agent output to file')
  .option('--async', 'Run agent asynchronously')
  .action(agent);

// Monitor Command
program
  .command('monitor')
  .description('Real-time system monitoring')
  .option('-m, --metrics <types>', 'Metrics to monitor (cpu,memory,network,disk)', 'cpu,memory')
  .option('-i, --interval <seconds>', 'Update interval in seconds', '5')
  .option('-d, --duration <minutes>', 'Monitoring duration in minutes (0 = infinite)', '0')
  .option('-t, --threshold <value>', 'Alert threshold percentage', '80')
  .action(monitor);

// Rollback Command
program
  .command('rollback')
  .description('Rollback deployment to previous version')
  .argument('[project]', 'Project name to rollback')
  .option('-e, --environment <env>', 'Target environment', 'staging')
  .option('-v, --version <tag>', 'Specific version to rollback to')
  .option('--list', 'List available versions')
  .option('--force', 'Force rollback without confirmation')
  .option('--dry-run', 'Show rollback plan without executing')
  .action(rollback);

// Workflow Command
program
  .command('workflow')
  .description('Generate Quadlet and GitHub Actions CI/CD workflows with server infrastructure provisioning')
  .argument('<action>', 'Action (init|quadlet|github-actions|dockerfile|update|scan|migrate|sync|add-service|add-resource|fix-network|port-validate|port-drift|validate)')
  .argument('[target]', 'Project name or target')
  .option('-n, --name <name>', 'Project name')
  .option('-t, --type <type>', 'Project type (nextjs|remix|nodejs|static)', 'nextjs')
  .option('-o, --output <path>', 'Output directory/file path')
  .option('-e, --environment <env>', 'Target environment', 'production')
  .option('--port <port>', 'Host port for container')
  .option('--container-port <port>', 'Container internal port', '3000')
  .option('--staging-port <port>', 'Staging app port', '3001')
  .option('--production-port <port>', 'Production app port', '3000')
  .option('--staging-db-port <port>', 'Staging PostgreSQL port', '5433')
  .option('--production-db-port <port>', 'Production PostgreSQL port', '5432')
  .option('--staging-redis-port <port>', 'Staging Redis port', '6380')
  .option('--production-redis-port <port>', 'Production Redis port', '6379')
  .option('--staging-domain <domain>', 'Staging domain')
  .option('--production-domain <domain>', 'Production domain')
  .option('--db-password <password>', 'Database password (default: from config)')
  .option('--image <image>', 'Docker image name')
  .option('--env <json>', 'Environment variables as JSON')
  .option('--volumes <list>', 'Comma-separated volume mounts')
  .option('--depends <list>', 'Comma-separated service dependencies')
  .option('--host <host>', 'Deployment server host (default: from config)')
  .option('--user <user>', 'Deployment server user (default: from config)')
  .option('--database', 'Include PostgreSQL database (default: true)')
  .option('--no-database', 'Exclude PostgreSQL database')
  .option('--redis', 'Include Redis cache (default: true)')
  .option('--no-redis', 'Exclude Redis cache')
  .option('--storage', 'Include storage directories (default: true)')
  .option('--no-storage', 'Exclude storage directories')
  .option('--no-tests', 'Skip tests in CI/CD')
  .option('--no-lint', 'Skip linting in CI/CD')
  .option('--no-quadlet', 'Use direct podman commands instead of Quadlet')
  .option('--no-interactive', 'Non-interactive mode')
  .option('--force', 'Overwrite existing files')
  .option('--service <type>', 'Service type for add-service (postgres|redis)')
  .option('--restart', 'Restart services after sync')
  .option('--fix', 'Auto-fix Quadlet compatibility issues (for validate action)')
  .option('--skip-scan', 'Skip pre-deploy scan for init action')
  .action(workflow);

// SSH Key Management Command
program
  .command('ssh')
  .description('Manage SSH keys via Vultr API (register|list|remove|sync)')
  .argument('<action>', 'Action (register|list|remove|show|sync)')
  .argument('[target]', 'Key path or Key ID (depends on action)')
  .option('--api-key <key>', 'Vultr API key')
  .option('-n, --name <name>', 'SSH key name (for register)')
  .option('--force', 'Skip confirmation prompts')
  .option('--json', 'Output in JSON format')
  .option('--no-interactive', 'Non-interactive mode')
  .action(ssh);

// Config Command
program
  .command('config')
  .description('Manage CLI configuration (init|show|check|set|path)')
  .argument('[action]', 'Action (init|show|check|set|path)', 'show')
  .option('--key <key>', 'Configuration key for set action')
  .option('--value <value>', 'Configuration value for set action')
  .option('--no-interactive', 'Non-interactive mode')
  .action(config);

// MCP Setup Command
program
  .command('mcp')
  .description('Manage MCP server for Claude Code (setup|status|remove)')
  .argument('[action]', 'Action (setup|status|remove)', 'status')
  .option('--host <ip>', 'Server host IP')
  .option('--user <user>', 'SSH user')
  .option('--ssh-key <path>', 'SSH key path')
  .option('--force', 'Force overwrite existing config')
  .action(mcp);

// SSOT Command (Single Source of Truth)
program
  .command('ssot')
  .description('SSOT (Single Source of Truth) management - central port/domain registry')
  .argument('<action>', 'Action (status|projects|project|history|validate|sync|init)')
  .option('--id <projectId>', 'Project ID for project action')
  .option('-l, --limit <n>', 'Limit history entries', '10')
  .option('--fix', 'Auto-fix validation issues')
  .option('--dry-run', 'Preview sync changes without applying')
  .option('--force', 'Force reinitialize SSOT')
  .option('--migrate', 'Migrate existing registry (default: true)')
  .option('--status <status>', 'Filter projects by status (all|active|inactive)', 'all')
  .action(ssot);

// Setup Command (통합 설치)
program
  .command('setup')
  .description('통합 설치 - 규칙/MCP/CLI/Hooks를 한 번에 설치')
  .option('-p, --path <path>', 'Target project path (default: current directory)')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--admin', 'Force admin mode installation')
  .option('--developer', 'Force developer mode installation')
  .action(setup);

// ENV Command (환경 변수 관리 - Vercel/Supabase 스타일)
program
  .command('env')
  .description('Environment variable management - scan, pull, push, fix')
  .argument('<action>', 'Action (scan|pull|push|fix|list|restore|backups)')
  .argument('[project]', 'Project name (auto-detected from package.json)')
  .option('--env <environment>', 'Target environment (staging|production)', 'production')
  .option('--force', 'Force overwrite without prompts')
  .option('--dry-run', 'Show what would be changed without applying (for fix)')
  .action(async (action, project, options) => {
    switch (action) {
      case 'scan':
        await envScan(project, options);
        break;
      case 'pull':
        await envPull(project, options);
        break;
      case 'push':
        await envPush(project, options);
        break;
      case 'fix':
        await envFix(project, {
          environment: options.env,
          dryRun: options.dryRun
        });
        break;
      case 'list':
        await envList(project, options);
        break;
      case 'restore':
        await envRestore(project, options);
        break;
      case 'backups':
        await envBackups(project, options);
        break;
      default:
        console.log(chalk.red(`Unknown action: ${action}`));
        console.log(chalk.gray('Available actions: scan, pull, push, fix, list, restore, backups'));
    }
  });

// Team Command (팀원 관리)
program
  .command('team')
  .description('Team management - list, add, remove, role, status')
  .argument('[action]', 'Action (list|add|remove|role|toggle|status)', 'list')
  .argument('[arg1]', 'Member ID or argument')
  .argument('[arg2]', 'Role name or argument')
  .option('-f, --force', 'Force action without confirmation')
  .action(team);

// Preview Command (브랜치 기반 Preview 환경)
program
  .command('preview')
  .description('Branch-based preview environment management')
  .argument('[action]', 'Action (list|status|logs|delete|cleanup)', 'list')
  .argument('[branch]', 'Branch name for logs/delete')
  .option('-l, --lines <n>', 'Number of log lines', '100')
  .option('-d, --days <n>', 'Days for cleanup threshold', '7')
  .action(preview);

// TUI Command (터미널 대시보드)
program
  .command('tui')
  .description('Terminal-based dashboard for server management')
  .option('-c, --compact', 'Compact mode (smaller widgets)')
  .option('-r, --refresh <seconds>', 'Auto-refresh interval in seconds', '30')
  .action(tui);

// Init Command (프로젝트에 CodeB 설정 설치)
program
  .command('init')
  .description('Initialize CodeB configuration in current project (CLAUDE.md, slash commands, hooks)')
  .option('-p, --path <path>', 'Target project path (default: current directory)')
  .option('-f, --force', 'Overwrite existing files')
  .action(init);

// Project Command (프로젝트 자동 생성 - API 기반)
program
  .command('project')
  .description('Project management via CodeB API (create|list|info|delete|types)')
  .argument('<action>', 'Action (create|list|info|delete|types)')
  .argument('[name]', 'Project name')
  .option('-t, --type <type>', 'Project type (nextjs|nodejs|python|static)', 'nextjs')
  .option('-g, --git-repo <url>', 'Git repository URL')
  .option('--database', 'Include PostgreSQL database (default: true)')
  .option('--no-database', 'Exclude PostgreSQL database')
  .option('--redis', 'Include Redis cache (default: true)')
  .option('--no-redis', 'Exclude Redis cache')
  .option('-d, --description <text>', 'Project description')
  .option('-o, --output <path>', 'Output directory for generated files (default: cwd)')
  .option('--no-save', 'Do not save files to disk')
  .option('-f, --force', 'Force deletion without confirmation')
  .action(project);

// Help/Doc Command
program
  .command('help')
  .aliases(['doc', 'docs'])
  .description('Show detailed documentation for commands')
  .argument('[topic]', 'Help topic (overview|deploy|workflow|analyze|health|domain|monitor|rollback|agent|optimize|config|quickref)')
  .option('-a, --all', 'Show all documentation topics')
  .option('--list', 'List all available topics')
  .action(help);

// Help Command Enhancement
program.on('--help', () => {
  console.log('');
  console.log(chalk.yellow('Examples:'));
  console.log('');
  console.log(chalk.gray('  # Deploy to staging'));
  console.log('  $ we deploy myapp --environment staging');
  console.log('');
  console.log(chalk.gray('  # Deep security analysis'));
  console.log('  $ we analyze --depth deep --focus security');
  console.log('');
  console.log(chalk.gray('  # Optimize bundle size'));
  console.log('  $ we optimize --target bundle --aggressive');
  console.log('');
  console.log(chalk.gray('  # Health check with monitoring'));
  console.log('  $ we health --watch --interval 30');
  console.log('');
  console.log(chalk.gray('  # Setup domain with SSL'));
  console.log('  $ we domain setup example.com --ssl --www');
  console.log('');
  console.log(chalk.gray('  # Invoke frontend agent'));
  console.log('  $ we agent frontend "Create responsive navbar component"');
  console.log('');
  console.log(chalk.gray('  # Real-time monitoring'));
  console.log('  $ we monitor --metrics cpu,memory,disk --threshold 90');
  console.log('');
  console.log(chalk.gray('  # Rollback deployment'));
  console.log('  $ we rollback myapp --environment production --version v1.2.3');
  console.log('');
  console.log(chalk.gray('  # Initialize complete workflow (App + PostgreSQL + Redis)'));
  console.log('  $ we workflow init myapp --type nextjs --database --redis');
  console.log('');
  console.log(chalk.gray('  # Non-interactive mode with custom ports'));
  console.log('  $ we workflow init myapp --no-interactive --staging-port 3001 --production-db-port 5432');
  console.log('');
  console.log(chalk.gray('  # Generate GitHub Actions hybrid workflow'));
  console.log('  $ we workflow github-actions myapp --staging-port 3001 --production-port 3000');
  console.log('');
  console.log(chalk.gray('  # Hybrid mode: GitHub builds → ghcr.io → Self-hosted deploys'));
  console.log('  $ we workflow init myapp --type nextjs  # Auto-generates complete project set');
  console.log('');
  console.log(chalk.gray('  # Scan project resources (DB, Redis, Storage, ENV)'));
  console.log('  $ we workflow scan myapp');
  console.log('');
  console.log(chalk.gray('  # Add missing resources to existing project'));
  console.log('  $ we workflow add-resource myapp --database --redis --storage');
  console.log('');
  console.log(chalk.gray('  # Show documentation'));
  console.log('  $ we help workflow');
  console.log('  $ we doc deploy');
  console.log('  $ we docs --list');
  console.log('');
  console.log(chalk.gray('  # SSH key management (Vultr API)'));
  console.log('  $ we ssh register --name "홍길동"');
  console.log('  $ we ssh list');
  console.log('  $ we ssh sync');
  console.log('');
  console.log(chalk.gray('  # SSOT (Single Source of Truth) management'));
  console.log('  $ we ssot status                    # Check SSOT status');
  console.log('  $ we ssot projects                  # List registered projects');
  console.log('  $ we ssot validate                  # Validate SSOT integrity');
  console.log('  $ we ssot history --limit 20        # View change history');
  console.log('');
  console.log(chalk.gray('  # 통합 설치 (규칙/MCP/Hooks 한 번에)'));
  console.log('  $ we setup                          # 현재 프로젝트에 설치');
  console.log('  $ we setup --path /path/to/project  # 특정 경로에 설치');
  console.log('  $ we setup -y                       # 확인 없이 바로 설치');
  console.log('');
  console.log(chalk.gray('  # 프로젝트 자동 생성 (API 기반)'));
  console.log('  $ we project create my-app --type nextjs --database --redis');
  console.log('  $ we project list                   # 모든 프로젝트 목록');
  console.log('  $ we project info my-app            # 프로젝트 상세 정보');
  console.log('  $ we project types                  # 사용 가능한 프로젝트 타입');
  console.log('');
  console.log(chalk.gray('  # Preview 환경 관리 (Branch 기반)'));
  console.log('  $ we preview list                   # 현재 Preview 목록');
  console.log('  $ we preview status                 # Preview 서버 상태');
  console.log('  $ we preview logs feature-login     # Preview 로그 확인');
  console.log('  $ we preview delete feature-login   # Preview 환경 삭제');
  console.log('  $ we preview cleanup --days 7       # 오래된 Preview 정리');
  console.log('');
  console.log(chalk.gray('  # 터미널 대시보드 (TUI)'));
  console.log('  $ we tui                            # 대시보드 시작');
  console.log('  $ we tui --compact                  # 컴팩트 모드');
  console.log('  $ we tui --refresh 10               # 10초 새로고침');
  console.log('');
  console.log(chalk.cyan('Documentation: https://codeb.io/docs/cli'));
  console.log('');
});

// Error handling
program.configureOutput({
  outputError: (str, write) => {
    write(chalk.red(`\n❌ Error: ${str}`));
  }
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
