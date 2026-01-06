/**
 * Help/Doc Command
 *
 * Displays comprehensive documentation for /we: CLI
 */

import chalk from 'chalk';

const DOCS = {
  overview: `
${chalk.cyan.bold('╔═══════════════════════════════════════════════════════════════════╗')}
${chalk.cyan.bold('║                    /we: Web Deploy CLI                            ║')}
${chalk.cyan.bold('║                    Documentation v2.4.0                           ║')}
${chalk.cyan.bold('╚═══════════════════════════════════════════════════════════════════╝')}

${chalk.yellow.bold('OVERVIEW')}

  /we: (Web Deploy) is a unified CLI for deploying and managing web applications
  on CodeB infrastructure with Podman/Quadlet containerization.

${chalk.yellow.bold('QUICK START')}

  ${chalk.gray('# 1. SSH 키 등록 (신규 개발자)')}
  $ /we: ssh register --name "홍길동"

  ${chalk.gray('# 2. 새 프로젝트 워크플로우 초기화')}
  $ /we: workflow init myapp --type nextjs --database

  ${chalk.gray('# 3. Staging 배포')}
  $ /we: deploy myapp --environment staging

  ${chalk.gray('# 4. 서버 상태 확인')}
  $ /we: health --verbose

${chalk.yellow.bold('AVAILABLE COMMANDS')}

  ${chalk.green('deploy')}      Deploy project to staging/production/preview
  ${chalk.green('analyze')}     Analyze project with 7-Agent system
  ${chalk.green('optimize')}    Optimize project performance and resources
  ${chalk.green('health')}      Check system health status
  ${chalk.green('domain')}      Manage domains (setup/remove/check/list)
  ${chalk.green('agent')}       Invoke specific 7-Agent directly
  ${chalk.green('monitor')}     Real-time system monitoring
  ${chalk.green('rollback')}    Rollback deployment to previous version
  ${chalk.green('workflow')}    Generate Quadlet and GitHub Actions CI/CD workflows
  ${chalk.green('ssh')}         Manage SSH keys (register/list/remove/sync)
  ${chalk.green('help/doc')}    Show this documentation

${chalk.yellow.bold('MORE HELP')}

  $ /we: help <command>     Show detailed help for a command
  $ /we: help workflow      Show workflow command documentation
  $ /we: help deploy        Show deploy command documentation
`,

  deploy: `
${chalk.cyan.bold('COMMAND: /we: deploy')}

${chalk.yellow('DESCRIPTION')}
  Deploy project to staging, production, or preview environments.
  Integrates with MCP codeb-deploy for container orchestration.

${chalk.yellow('USAGE')}
  $ /we: deploy [project] [options]

${chalk.yellow('ARGUMENTS')}
  ${chalk.green('project')}     Project name to deploy (optional, defaults to current directory)

${chalk.yellow('OPTIONS')}
  ${chalk.green('-e, --environment <env>')}   Target environment: staging|production|preview
                              ${chalk.gray('(default: staging)')}
  ${chalk.green('-f, --file <path>')}         Docker compose file path
                              ${chalk.gray('(default: docker-compose.yml)')}
  ${chalk.green('--no-cache')}                Build without cache
  ${chalk.green('--force')}                   Force deployment even with warnings
  ${chalk.green('--dry-run')}                 Show deployment plan without executing

${chalk.yellow('EXAMPLES')}
  ${chalk.gray('# Deploy to staging')}
  $ /we: deploy myapp --environment staging

  ${chalk.gray('# Deploy to production with force')}
  $ /we: deploy myapp -e production --force

  ${chalk.gray('# Dry run to see deployment plan')}
  $ /we: deploy myapp --dry-run

${chalk.yellow('DEPLOYMENT FLOW')}
  1. Validate environment configuration
  2. Validate docker-compose file
  3. Build container images
  4. Push to registry (ghcr.io)
  5. Deploy to target server via SSH
  6. Run health checks
  7. Update routing (Caddy)
`,

  workflow: `
${chalk.cyan.bold('COMMAND: /we: workflow')}

${chalk.yellow('DESCRIPTION')}
  Generate Quadlet container files and GitHub Actions CI/CD workflows.
  Supports new project initialization and configuration updates.

${chalk.yellow('USAGE')}
  $ /we: workflow <action> [target] [options]

${chalk.yellow('ACTIONS')}
  ${chalk.green('init')}           Initialize complete workflow (Quadlet + GitHub Actions + Dockerfile)
  ${chalk.green('quadlet')}        Generate Quadlet .container file only
  ${chalk.green('github-actions')} Generate GitHub Actions workflow only
  ${chalk.green('dockerfile')}     Generate optimized Dockerfile only
  ${chalk.green('update')}         Update existing workflow configurations
  ${chalk.green('scan')}           Scan server/local deployment status and detect issues
  ${chalk.green('migrate')}        Migrate existing project to new CLI structure
  ${chalk.green('sync')}           Push local changes to server
  ${chalk.green('add-service')}    Add missing PostgreSQL/Redis to existing project
  ${chalk.green('fix-network')}    Fix network issues (migrate to codeb-network)

${chalk.yellow('OPTIONS')}
  ${chalk.green('-n, --name <name>')}              Project name
  ${chalk.green('-t, --type <type>')}              Project type: nextjs|remix|nodejs|static
  ${chalk.green('-o, --output <path>')}            Output directory/file path
  ${chalk.green('--port <port>')}                  Host port for container
  ${chalk.green('--staging-port <port>')}          Staging environment port ${chalk.gray('(default: 3001)')}
  ${chalk.green('--production-port <port>')}       Production environment port ${chalk.gray('(default: 3000)')}
  ${chalk.green('--staging-domain <domain>')}      Staging domain
  ${chalk.green('--production-domain <domain>')}   Production domain
  ${chalk.green('--image <image>')}                Docker image name
  ${chalk.green('--database')}                     Include PostgreSQL database
  ${chalk.green('--redis')}                        Include Redis cache
  ${chalk.green('--no-tests')}                     Skip tests in CI/CD
  ${chalk.green('--no-quadlet')}                   Use direct podman commands
  ${chalk.green('--no-interactive')}               Non-interactive mode
  ${chalk.green('--service <type>')}               Service type for add-service: postgres|redis
  ${chalk.green('--restart')}                      Restart services after sync

${chalk.yellow('EXAMPLES')}
  ${chalk.gray('# Initialize complete workflow with database')}
  $ /we: workflow init myapp --type nextjs --database

  ${chalk.gray('# Generate Quadlet file only')}
  $ /we: workflow quadlet myapp --port 3000 --image ghcr.io/org/myapp:latest

  ${chalk.gray('# Generate GitHub Actions workflow')}
  $ /we: workflow github-actions myapp --staging-port 3001 --production-port 3000

  ${chalk.gray('# Non-interactive initialization')}
  $ /we: workflow init myapp --no-interactive --database --staging-domain myapp-staging.one-q.xyz

${chalk.yellow('GENERATED FILES')}
  ${chalk.gray('workflow init generates:')}
  ├── quadlet/
  │   ├── <project>.container          ${chalk.gray('# Production Quadlet')}
  │   ├── <project>-staging.container  ${chalk.gray('# Staging Quadlet')}
  │   └── <project>-postgres.container ${chalk.gray('# Database Quadlet (if --database)')}
  ├── .github/workflows/
  │   └── deploy.yml                   ${chalk.gray('# GitHub Actions CI/CD')}
  └── Dockerfile                       ${chalk.gray('# Optimized multi-stage Dockerfile')}

${chalk.yellow('ACTIONS (v2.4.0)')}
  ${chalk.gray('# Scan server status and detect issues')}
  $ /we: workflow scan myapp

  ${chalk.gray('# Migrate existing project to Quadlet structure')}
  $ /we: workflow migrate myapp --database --redis

  ${chalk.gray('# Sync local Quadlet files to server')}
  $ /we: workflow sync myapp --restart

  ${chalk.gray('# Add missing Redis to existing project')}
  $ /we: workflow add-service myapp --service redis

  ${chalk.gray('# Fix network issues (migrate to codeb-network)')}
  $ /we: workflow fix-network myapp

${chalk.yellow('QUADLET INSTALLATION')}
  ${chalk.gray('# Copy to server')}
  $ scp quadlet/*.container root@server:/etc/containers/systemd/

  ${chalk.gray('# Reload and start')}
  $ ssh root@server "systemctl daemon-reload && systemctl start myapp.service"
`,

  analyze: `
${chalk.cyan.bold('COMMAND: /we: analyze')}

${chalk.yellow('DESCRIPTION')}
  Analyze project with the 7-Agent system for comprehensive code review,
  security analysis, performance profiling, and quality assessment.

${chalk.yellow('USAGE')}
  $ /we: analyze [target] [options]

${chalk.yellow('ARGUMENTS')}
  ${chalk.green('target')}      Target to analyze (project|file|component)

${chalk.yellow('OPTIONS')}
  ${chalk.green('-d, --depth <level>')}    Analysis depth: shallow|normal|deep
                          ${chalk.gray('(default: normal)')}
  ${chalk.green('-f, --focus <area>')}     Focus area: security|performance|quality|all
                          ${chalk.gray('(default: all)')}
  ${chalk.green('-a, --agent <type>')}     Specific agent: master|api|frontend|db|e2e|admin
                          ${chalk.gray('(default: master)')}
  ${chalk.green('-o, --output <format>')}  Output format: text|json|markdown
                          ${chalk.gray('(default: text)')}
  ${chalk.green('--save <path>')}          Save analysis report to file

${chalk.yellow('EXAMPLES')}
  ${chalk.gray('# Deep security analysis')}
  $ /we: analyze --depth deep --focus security

  ${chalk.gray('# Analyze specific component')}
  $ /we: analyze src/components/Auth --focus quality

  ${chalk.gray('# Save report as markdown')}
  $ /we: analyze --output markdown --save ./reports/analysis.md

${chalk.yellow('7-AGENT SYSTEM')}
  ${chalk.green('master')}     Master Orchestrator - coordinates all agents
  ${chalk.green('api')}        API Contract Guardian - API design validation
  ${chalk.green('frontend')}   Frontend Specialist - UI/UX analysis
  ${chalk.green('db')}         Database Schema Architect - schema optimization
  ${chalk.green('e2e')}        E2E Test Strategist - test coverage analysis
  ${chalk.green('admin')}      Admin Panel Builder - admin interface analysis
`,

  health: `
${chalk.cyan.bold('COMMAND: /we: health')}

${chalk.yellow('DESCRIPTION')}
  Check system health status including containers, services,
  resources, and network connectivity.

${chalk.yellow('USAGE')}
  $ /we: health [options]

${chalk.yellow('OPTIONS')}
  ${chalk.green('-v, --verbose')}             Show detailed health information
  ${chalk.green('-j, --json')}                Output in JSON format
  ${chalk.green('-w, --watch')}               Continuous health monitoring
  ${chalk.green('-i, --interval <seconds>')}  Watch interval ${chalk.gray('(default: 30)')}

${chalk.yellow('EXAMPLES')}
  ${chalk.gray('# Basic health check')}
  $ /we: health

  ${chalk.gray('# Detailed health check')}
  $ /we: health --verbose

  ${chalk.gray('# Continuous monitoring')}
  $ /we: health --watch --interval 10

  ${chalk.gray('# JSON output for scripting')}
  $ /we: health --json

${chalk.yellow('CHECKS PERFORMED')}
  • Container status (Podman/Quadlet)
  • Service status (systemd)
  • Resource usage (CPU, Memory, Disk)
  • Network connectivity
  • Database connections
  • SSL certificate validity
`,

  domain: `
${chalk.cyan.bold('COMMAND: /we: domain')}

${chalk.yellow('DESCRIPTION')}
  Manage domains including DNS setup, SSL certificates,
  and reverse proxy configuration with Caddy.

${chalk.yellow('USAGE')}
  $ /we: domain <action> [domain] [options]

${chalk.yellow('ACTIONS')}
  ${chalk.green('setup')}    Configure new domain with DNS and SSL
  ${chalk.green('remove')}   Remove domain configuration
  ${chalk.green('check')}    Check domain status and SSL
  ${chalk.green('list')}     List all configured domains

${chalk.yellow('OPTIONS')}
  ${chalk.green('-p, --project <name>')}   Project name
  ${chalk.green('--ssl')}                  Enable SSL/TLS (auto via Let's Encrypt)
  ${chalk.green('--www')}                  Include www subdomain
  ${chalk.green('--force')}                Force operation without confirmation

${chalk.yellow('EXAMPLES')}
  ${chalk.gray('# Setup domain with SSL')}
  $ /we: domain setup myapp.one-q.xyz --ssl --project myapp

  ${chalk.gray('# Setup with www redirect')}
  $ /we: domain setup example.com --ssl --www

  ${chalk.gray('# Check domain status')}
  $ /we: domain check myapp.one-q.xyz

  ${chalk.gray('# List all domains')}
  $ /we: domain list

  ${chalk.gray('# Remove domain')}
  $ /we: domain remove myapp.one-q.xyz --force
`,

  monitor: `
${chalk.cyan.bold('COMMAND: /we: monitor')}

${chalk.yellow('DESCRIPTION')}
  Real-time system monitoring with alerts and thresholds.

${chalk.yellow('USAGE')}
  $ /we: monitor [options]

${chalk.yellow('OPTIONS')}
  ${chalk.green('-m, --metrics <types>')}      Metrics to monitor: cpu,memory,network,disk
                              ${chalk.gray('(default: cpu,memory)')}
  ${chalk.green('-i, --interval <seconds>')}   Update interval ${chalk.gray('(default: 5)')}
  ${chalk.green('-d, --duration <minutes>')}   Monitoring duration, 0 = infinite ${chalk.gray('(default: 0)')}
  ${chalk.green('-t, --threshold <value>')}    Alert threshold percentage ${chalk.gray('(default: 80)')}

${chalk.yellow('EXAMPLES')}
  ${chalk.gray('# Monitor CPU and memory')}
  $ /we: monitor --metrics cpu,memory

  ${chalk.gray('# Monitor all with alerts at 90%')}
  $ /we: monitor --metrics cpu,memory,disk,network --threshold 90

  ${chalk.gray('# 10 minute monitoring session')}
  $ /we: monitor --duration 10 --interval 2
`,

  rollback: `
${chalk.cyan.bold('COMMAND: /we: rollback')}

${chalk.yellow('DESCRIPTION')}
  Rollback deployment to a previous version safely.

${chalk.yellow('USAGE')}
  $ /we: rollback [project] [options]

${chalk.yellow('OPTIONS')}
  ${chalk.green('-e, --environment <env>')}   Target environment ${chalk.gray('(default: staging)')}
  ${chalk.green('-v, --version <tag>')}       Specific version to rollback to
  ${chalk.green('--list')}                    List available versions
  ${chalk.green('--force')}                   Force rollback without confirmation
  ${chalk.green('--dry-run')}                 Show rollback plan without executing

${chalk.yellow('EXAMPLES')}
  ${chalk.gray('# List available versions')}
  $ /we: rollback myapp --list

  ${chalk.gray('# Rollback to specific version')}
  $ /we: rollback myapp -e production -v v1.2.3

  ${chalk.gray('# Dry run rollback')}
  $ /we: rollback myapp --dry-run
`,

  agent: `
${chalk.cyan.bold('COMMAND: /we: agent')}

${chalk.yellow('DESCRIPTION')}
  Invoke specific 7-Agent directly for specialized tasks.

${chalk.yellow('USAGE')}
  $ /we: agent <type> <task> [options]

${chalk.yellow('AGENT TYPES')}
  ${chalk.green('master')}     Master Orchestrator - full project coordination
  ${chalk.green('api')}        API Contract Guardian - API design and validation
  ${chalk.green('frontend')}   Frontend Specialist - UI/UX development
  ${chalk.green('db')}         Database Schema Architect - database design
  ${chalk.green('e2e')}        E2E Test Strategist - test automation
  ${chalk.green('admin')}      Admin Panel Builder - admin interfaces
  ${chalk.green('all')}        Run all agents in sequence

${chalk.yellow('OPTIONS')}
  ${chalk.green('-c, --context <json>')}     Additional context as JSON
  ${chalk.green('-o, --output <format>')}    Output format: text|json
  ${chalk.green('--save <path>')}            Save agent output to file
  ${chalk.green('--async')}                  Run agent asynchronously

${chalk.yellow('EXAMPLES')}
  ${chalk.gray('# Invoke frontend agent')}
  $ /we: agent frontend "Create responsive navbar component"

  ${chalk.gray('# API design with context')}
  $ /we: agent api "Design user authentication API" -c '{"auth":"jwt"}'

  ${chalk.gray('# Run all agents')}
  $ /we: agent all "Full project analysis"
`,

  optimize: `
${chalk.cyan.bold('COMMAND: /we: optimize')}

${chalk.yellow('DESCRIPTION')}
  Optimize project performance including bundle size,
  memory usage, and database queries.

${chalk.yellow('USAGE')}
  $ /we: optimize [options]

${chalk.yellow('OPTIONS')}
  ${chalk.green('-t, --target <type>')}   Optimization target: bundle|memory|database|all
                          ${chalk.gray('(default: all)')}
  ${chalk.green('--aggressive')}          Use aggressive optimization strategies
  ${chalk.green('--safe-mode')}           Conservative optimization with validation
  ${chalk.green('--dry-run')}             Show optimization plan without executing

${chalk.yellow('EXAMPLES')}
  ${chalk.gray('# Optimize bundle size')}
  $ /we: optimize --target bundle

  ${chalk.gray('# Aggressive full optimization')}
  $ /we: optimize --aggressive

  ${chalk.gray('# Safe mode with dry run')}
  $ /we: optimize --safe-mode --dry-run

${chalk.yellow('OPTIMIZATION TARGETS')}
  ${chalk.green('bundle')}     JavaScript bundle size reduction
  ${chalk.green('memory')}     Memory usage optimization
  ${chalk.green('database')}   Database query optimization
  ${chalk.green('all')}        All optimizations
`,

  ssh: `
${chalk.cyan.bold('COMMAND: /we: ssh')}

${chalk.yellow('DESCRIPTION')}
  Manage SSH keys via Vultr API for team collaboration.
  Register developer keys, sync across servers, and manage access.

${chalk.yellow('USAGE')}
  $ /we: ssh <action> [target] [options]

${chalk.yellow('ACTIONS')}
  ${chalk.green('register')}   Register new SSH key to Vultr
  ${chalk.green('list')}       List all registered SSH keys
  ${chalk.green('remove')}     Remove SSH key by ID
  ${chalk.green('show')}       Show SSH key details
  ${chalk.green('sync')}       Sync SSH keys across servers

${chalk.yellow('OPTIONS')}
  ${chalk.green('--api-key <key>')}       Vultr API key (or set VULTR_API_KEY env)
  ${chalk.green('-n, --name <name>')}     SSH key name (for register)
  ${chalk.green('--force')}               Skip confirmation prompts
  ${chalk.green('--json')}                Output in JSON format
  ${chalk.green('--no-interactive')}      Non-interactive mode

${chalk.yellow('EXAMPLES')}
  ${chalk.gray('# Register new developer key')}
  $ /we: ssh register --name "홍길동"

  ${chalk.gray('# Register with specific key file')}
  $ /we: ssh register ~/.ssh/id_rsa.pub --name "홍길동"

  ${chalk.gray('# List all keys')}
  $ /we: ssh list

  ${chalk.gray('# Sync keys to all servers')}
  $ /we: ssh sync

  ${chalk.gray('# Remove key by ID')}
  $ /we: ssh remove abc123 --force

${chalk.yellow('WORKFLOW FOR NEW DEVELOPERS')}
  ${chalk.gray('1. Generate SSH key (if not exists)')}
  $ ssh-keygen -t ed25519 -C "developer@company.com"

  ${chalk.gray('2. Register key to Vultr')}
  $ /we: ssh register --name "홍길동"

  ${chalk.gray('3. Sync to all servers')}
  $ /we: ssh sync

  ${chalk.gray('4. Verify access')}
  $ ssh root@<SERVER_HOST> "echo Connected!"
`,

  quickref: `
${chalk.cyan.bold('/we: Quick Reference Card')}

${chalk.yellow('DEPLOYMENT')}
  /we: deploy myapp -e staging         ${chalk.gray('# Deploy to staging')}
  /we: deploy myapp -e production      ${chalk.gray('# Deploy to production')}
  /we: rollback myapp -v v1.2.3        ${chalk.gray('# Rollback to version')}

${chalk.yellow('WORKFLOW GENERATION')}
  /we: workflow init myapp --database  ${chalk.gray('# Full workflow setup')}
  /we: workflow quadlet myapp          ${chalk.gray('# Quadlet only')}
  /we: workflow github-actions myapp   ${chalk.gray('# GitHub Actions only')}
  /we: workflow scan myapp             ${chalk.gray('# Scan deployment status')}
  /we: workflow migrate myapp          ${chalk.gray('# Migrate existing project')}
  /we: workflow sync myapp --restart   ${chalk.gray('# Sync to server')}
  /we: workflow add-service myapp --service redis  ${chalk.gray('# Add service')}
  /we: workflow fix-network myapp      ${chalk.gray('# Fix network issues')}

${chalk.yellow('MONITORING')}
  /we: health                          ${chalk.gray('# Health check')}
  /we: health -v                       ${chalk.gray('# Detailed health')}
  /we: monitor --threshold 90          ${chalk.gray('# Real-time monitoring')}

${chalk.yellow('DOMAIN MANAGEMENT')}
  /we: domain setup app.one-q.xyz --ssl  ${chalk.gray('# Setup domain')}
  /we: domain check app.one-q.xyz        ${chalk.gray('# Check status')}
  /we: domain list                       ${chalk.gray('# List all domains')}

${chalk.yellow('ANALYSIS')}
  /we: analyze --focus security        ${chalk.gray('# Security analysis')}
  /we: analyze --depth deep            ${chalk.gray('# Deep analysis')}
  /we: agent frontend "task"           ${chalk.gray('# Direct agent call')}

${chalk.yellow('OPTIMIZATION')}
  /we: optimize --target bundle        ${chalk.gray('# Optimize bundles')}
  /we: optimize --aggressive           ${chalk.gray('# Full optimization')}

${chalk.yellow('SSH KEY MANAGEMENT')}
  /we: ssh register --name "홍길동"    ${chalk.gray('# Register SSH key')}
  /we: ssh list                        ${chalk.gray('# List all keys')}
  /we: ssh sync                        ${chalk.gray('# Sync to servers')}
`
};

export async function help(topic, options) {
  const topicLower = (topic || 'overview').toLowerCase();

  // Aliases
  const aliases = {
    'doc': 'overview',
    'docs': 'overview',
    'commands': 'overview',
    'quick': 'quickref',
    'ref': 'quickref',
    'reference': 'quickref',
    'gh': 'workflow',
    'github': 'workflow',
    'cicd': 'workflow',
    'ci': 'workflow',
    'cd': 'workflow',
    'quadlet': 'workflow',
    'container': 'workflow',
    'key': 'ssh',
    'keys': 'ssh',
    'sshkey': 'ssh'
  };

  const resolvedTopic = aliases[topicLower] || topicLower;

  if (DOCS[resolvedTopic]) {
    console.log(DOCS[resolvedTopic]);
  } else {
    console.log(chalk.red(`\nUnknown topic: ${topic}\n`));
    console.log(chalk.yellow('Available topics:'));
    console.log(chalk.gray('  overview    - General overview and quick start'));
    console.log(chalk.gray('  deploy      - Deploy command documentation'));
    console.log(chalk.gray('  workflow    - Workflow generation (Quadlet, GitHub Actions)'));
    console.log(chalk.gray('  analyze     - Analysis and 7-Agent system'));
    console.log(chalk.gray('  health      - Health check command'));
    console.log(chalk.gray('  domain      - Domain management'));
    console.log(chalk.gray('  monitor     - Real-time monitoring'));
    console.log(chalk.gray('  rollback    - Deployment rollback'));
    console.log(chalk.gray('  agent       - Direct agent invocation'));
    console.log(chalk.gray('  optimize    - Performance optimization'));
    console.log(chalk.gray('  ssh         - SSH key management'));
    console.log(chalk.gray('  quickref    - Quick reference card'));
    console.log();
  }
}
