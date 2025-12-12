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
import { deploy } from '../src/commands/deploy.js';
import { analyze } from '../src/commands/analyze.js';
import { optimize } from '../src/commands/optimize.js';
import { health } from '../src/commands/health.js';
import { domain } from '../src/commands/domain.js';
import { agent } from '../src/commands/agent.js';
import { monitor } from '../src/commands/monitor.js';
import { rollback } from '../src/commands/rollback.js';
import { workflow } from '../src/commands/workflow.js';
import { ssh } from '../src/commands/ssh.js';
import { help } from '../src/commands/help.js';
import { config } from '../src/commands/config.js';
import { mcp } from '../src/commands/mcp.js';
import { getServerHost, getServerUser, getDbPassword } from '../src/lib/config.js';

const program = new Command();

// CLI Header
console.log(chalk.cyan.bold('\n╔═══════════════════════════════════════════════╗'));
console.log(chalk.cyan.bold('║   /we: Web Deploy CLI v2.5.0                  ║'));
console.log(chalk.cyan.bold('║   배포 • 분석 • 워크플로우 • 최적화           ║'));
console.log(chalk.cyan.bold('╚═══════════════════════════════════════════════╝\n'));

program
  .name('/we:')
  .description('/we: Web Deploy CLI - 7-Agent 시스템으로 배포, 분석, 워크플로우, 최적화')
  .version('2.5.0');

// Deploy Command
program
  .command('deploy')
  .description('Deploy project to staging/production/preview')
  .argument('[project]', 'Project name to deploy')
  .option('-e, --environment <env>', 'Target environment (staging|production|preview)', 'staging')
  .option('-f, --file <path>', 'Docker compose file path', 'docker-compose.yml')
  .option('--no-cache', 'Build without cache')
  .option('--force', 'Force deployment even with warnings')
  .option('--dry-run', 'Show deployment plan without executing')
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
  .argument('<action>', 'Action (init|quadlet|github-actions|dockerfile|update|scan|migrate|sync|add-service|add-resource|fix-network)')
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
