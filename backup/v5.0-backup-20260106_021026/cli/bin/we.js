#!/usr/bin/env node

/**
 * CodeB v5.0 CLI
 * Blue-Green Deployment System
 */

import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('we')
  .description('CodeB v5.0 - Blue-Green Deployment CLI')
  .version('5.0.0');

// ============================================================================
// Deploy Command
// ============================================================================

program
  .command('deploy <project>')
  .description('Deploy to inactive Blue-Green slot (returns preview URL)')
  .option('-e, --environment <env>', 'Environment (staging/production)', 'staging')
  .option('-v, --version <version>', 'Version tag', 'latest')
  .option('-i, --image <image>', 'Full image URL (overrides version)')
  .option('--skip-health', 'Skip health check')
  .action(async (project, options) => {
    const { deploy } = await import('../dist/commands/deploy.js');
    await deploy(project, options);
  });

// ============================================================================
// Promote Command
// ============================================================================

program
  .command('promote <project>')
  .description('Switch production traffic to deployed slot (zero-downtime)')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .action(async (project, options) => {
    const { promote } = await import('../dist/commands/promote.js');
    await promote(project, options);
  });

// ============================================================================
// Rollback Command
// ============================================================================

program
  .command('rollback <project>')
  .description('Instant rollback to previous version')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .option('-r, --reason <reason>', 'Rollback reason for audit log')
  .action(async (project, options) => {
    const { rollback } = await import('../dist/commands/rollback.js');
    await rollback(project, options);
  });

// ============================================================================
// Slot Command
// ============================================================================

const slotCmd = program
  .command('slot')
  .description('Manage Blue-Green slots');

slotCmd
  .command('status <project>')
  .description('Show slot status for a project')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .action(async (project, options) => {
    const { slotStatus } = await import('../dist/commands/slot.js');
    await slotStatus(project, options);
  });

slotCmd
  .command('cleanup <project>')
  .description('Clean up expired grace slots')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .option('-f, --force', 'Force cleanup even if grace period not expired')
  .action(async (project, options) => {
    const { slotCleanup } = await import('../dist/commands/slot.js');
    await slotCleanup(project, options);
  });

slotCmd
  .command('list')
  .description('List all slot registries')
  .action(async () => {
    const { slotList } = await import('../dist/commands/slot.js');
    await slotList();
  });

// ============================================================================
// ENV Command
// ============================================================================

const envCmd = program
  .command('env')
  .description('Manage environment variables');

envCmd
  .command('get <project>')
  .description('Get environment variables')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .option('-k, --key <key>', 'Specific key to get')
  .action(async (project, options) => {
    const { envGet } = await import('../dist/commands/env.js');
    await envGet(project, options);
  });

envCmd
  .command('set <project> <keyValue>')
  .description('Set environment variable (KEY=value)')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .action(async (project, keyValue, options) => {
    const { envSet } = await import('../dist/commands/env.js');
    await envSet(project, keyValue, options);
  });

envCmd
  .command('restore <project>')
  .description('Restore ENV from backup')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .option('-v, --version <version>', 'Version to restore (master/current/timestamp)', 'master')
  .action(async (project, options) => {
    const { envRestore } = await import('../dist/commands/env.js');
    await envRestore(project, options);
  });

envCmd
  .command('history <project>')
  .description('Show ENV backup history')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .option('-l, --limit <limit>', 'Number of entries', '20')
  .action(async (project, options) => {
    const { envHistory } = await import('../dist/commands/env.js');
    await envHistory(project, options);
  });

// ============================================================================
// Init Command
// ============================================================================

program
  .command('init <project>')
  .description('Initialize a new project')
  .option('-t, --type <type>', 'Project type (nextjs/remix/nodejs)', 'nextjs')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .option('--database', 'Include PostgreSQL configuration')
  .option('--redis', 'Include Redis configuration')
  .option('--centrifugo', 'Include Centrifugo configuration')
  .action(async (project, options) => {
    const { init } = await import('../dist/commands/init.js');
    await init(project, options);
  });

// ============================================================================
// Health Command
// ============================================================================

program
  .command('health')
  .description('Check system health')
  .option('-p, --project <project>', 'Check specific project')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .action(async (options) => {
    const { health } = await import('../dist/commands/health.js');
    await health(options);
  });

// ============================================================================
// Registry Command
// ============================================================================

const registryCmd = program
  .command('registry')
  .description('Manage SSOT registry');

registryCmd
  .command('status')
  .description('Show registry status')
  .action(async () => {
    const { registryStatus } = await import('../dist/commands/registry.js');
    await registryStatus();
  });

registryCmd
  .command('projects')
  .description('List registered projects')
  .action(async () => {
    const { registryProjects } = await import('../dist/commands/registry.js');
    await registryProjects();
  });

// ============================================================================
// Domain Command
// ============================================================================

const domainCmd = program
  .command('domain')
  .description('Manage domains');

domainCmd
  .command('setup <domain>')
  .description('Setup domain for project')
  .option('-p, --project <project>', 'Project name')
  .option('--ssl', 'Enable SSL')
  .action(async (domain, options) => {
    const { domainSetup } = await import('../dist/commands/domain.js');
    await domainSetup(domain, options);
  });

domainCmd
  .command('ssl <domain>')
  .description('Setup SSL certificate')
  .action(async (domain) => {
    const { domainSSL } = await import('../dist/commands/domain.js');
    await domainSSL(domain);
  });

domainCmd
  .command('list')
  .description('List all domains')
  .action(async () => {
    const { domainList } = await import('../dist/commands/domain.js');
    await domainList();
  });

// ============================================================================
// Parse
// ============================================================================

program.parse();
