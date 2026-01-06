#!/usr/bin/env node
/**
 * CodeB CLI v6.0 - Deploy with confidence
 * Vercel-style developer experience with Ink React components
 */

import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import updateNotifier from 'update-notifier';
import chalk from 'chalk';

import { ConfigStore } from './lib/config.js';
import { ApiClient } from './lib/api-client.js';
import { DeployCommand } from './commands/deploy.js';
import { PromoteCommand } from './commands/promote.js';
import { RollbackCommand } from './commands/rollback.js';
import { LoginCommand } from './commands/login.js';
import { WhoamiCommand } from './commands/whoami.js';
import { InteractiveApp } from './components/InteractiveApp.js';
import {
  MigrateDetectCommand,
  MigratePlanCommand,
  MigrateExecuteCommand,
} from './commands/migrate.js';

// Package info
const pkg = {
  name: '@codeb/cli',
  version: '6.0.0',
};

// Check for updates
updateNotifier({ pkg }).notify();

// Initialize
const config = new ConfigStore();
const api = new ApiClient(config);

// Create program
const program = new Command()
  .name('we')
  .description(chalk.bold('CodeB CLI') + ' - Deploy with confidence')
  .version(pkg.version, '-v, --version')
  .option('--no-color', 'Disable colors')
  .option('--json', 'Output as JSON')
  .option('-d, --debug', 'Enable debug mode');

// ============================================================================
// Authentication Commands
// ============================================================================

program
  .command('login')
  .description('Log in to CodeB')
  .option('-k, --api-key <key>', 'API key (or set CODEB_API_KEY env)')
  .action(async (options) => {
    const { waitUntilExit } = render(
      <LoginCommand options={options} config={config} api={api} />
    );
    await waitUntilExit();
  });

program
  .command('logout')
  .description('Log out from CodeB')
  .action(() => {
    config.clear();
    console.log(chalk.green('Logged out successfully'));
  });

program
  .command('whoami')
  .description('Show current user info')
  .action(async () => {
    const { waitUntilExit } = render(
      <WhoamiCommand config={config} api={api} />
    );
    await waitUntilExit();
  });

// ============================================================================
// Deployment Commands
// ============================================================================

program
  .command('deploy [project]')
  .description('Deploy to Blue-Green slot')
  .option('-e, --environment <env>', 'Environment (staging/production)', 'staging')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--prod', 'Deploy to production')
  .option('--prebuilt', 'Use prebuilt image')
  .action(async (project, options) => {
    const { waitUntilExit } = render(
      <DeployCommand
        project={project}
        options={options}
        config={config}
        api={api}
      />
    );
    await waitUntilExit();
  });

program
  .command('promote [project]')
  .description('Promote deployment to production')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (project, options) => {
    const { waitUntilExit } = render(
      <PromoteCommand
        project={project}
        options={options}
        config={config}
        api={api}
      />
    );
    await waitUntilExit();
  });

program
  .command('rollback [project]')
  .description('Rollback to previous version')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .option('-r, --reason <reason>', 'Rollback reason')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (project, options) => {
    const { waitUntilExit } = render(
      <RollbackCommand
        project={project}
        options={options}
        config={config}
        api={api}
      />
    );
    await waitUntilExit();
  });

// ============================================================================
// Project Management Commands
// ============================================================================

program
  .command('link')
  .description('Link current directory to a project')
  .action(async () => {
    console.log(chalk.yellow('Interactive project linking...'));
    // TODO: Implement project linking
  });

program
  .command('unlink')
  .description('Unlink current directory from project')
  .action(() => {
    const cwd = process.cwd();
    const linked = config.getLinkedProject(cwd);
    if (linked) {
      config.unlinkProject(cwd);
      console.log(chalk.green(`Unlinked from ${linked}`));
    } else {
      console.log(chalk.yellow('No project linked in this directory'));
    }
  });

// ============================================================================
// Slot Commands
// ============================================================================

program
  .command('slot [project]')
  .description('Show slot status')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .action(async (project, options) => {
    const projectName = project || config.getLinkedProject();
    if (!projectName) {
      console.log(chalk.red('No project specified. Use --project or run `we link` first.'));
      process.exit(1);
    }

    try {
      const result = await api.call('slot_status', {
        projectName,
        environment: options.environment,
      });

      if (result.success && result.data) {
        console.log(chalk.bold(`\nSlot Status: ${projectName} (${options.environment})\n`));
        console.log(`Active: ${chalk.green(result.data.activeSlot)}`);
        console.log(`\nBlue Slot:`);
        console.log(`  State: ${result.data.blue.state}`);
        console.log(`  Port: ${result.data.blue.port}`);
        console.log(`  Version: ${result.data.blue.version || 'none'}`);
        console.log(`\nGreen Slot:`);
        console.log(`  State: ${result.data.green.state}`);
        console.log(`  Port: ${result.data.green.port}`);
        console.log(`  Version: ${result.data.green.version || 'none'}`);
      } else {
        console.log(chalk.red(`Error: ${result.error}`));
      }
    } catch (error) {
      console.log(chalk.red(`Error: ${error}`));
    }
  });

// ============================================================================
// ENV Commands
// ============================================================================

const env = program
  .command('env')
  .description('Manage environment variables');

env
  .command('get [project]')
  .description('Get environment variables')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .action(async (project, options) => {
    const projectName = project || config.getLinkedProject();
    if (!projectName) {
      console.log(chalk.red('No project specified'));
      process.exit(1);
    }

    try {
      const result = await api.call('env_backup_list', {
        projectName,
        environment: options.environment,
      });

      if (result.success) {
        console.log(chalk.bold(`\nENV Backups: ${projectName} (${options.environment})\n`));
        console.log(`Master: ${result.masterExists ? chalk.green('exists') : chalk.red('missing')}`);
        console.log(`Current: ${result.currentExists ? chalk.green('exists') : chalk.red('missing')}`);

        if (result.backups && result.backups.length > 0) {
          console.log(chalk.bold('\nRecent backups:'));
          for (const backup of result.backups) {
            console.log(`  ${chalk.gray(backup.timestamp)} - ${backup.version}`);
          }
        }
      } else {
        console.log(chalk.red(`Error: ${result.error}`));
      }
    } catch (error) {
      console.log(chalk.red(`Error: ${error}`));
    }
  });

env
  .command('scan')
  .description('Scan all projects for legacy ENV configurations')
  .action(async () => {
    try {
      const result = await api.call('env_scan', {});

      if (result.success) {
        console.log(chalk.bold('\nENV Configuration Scan\n'));
        console.log(`Total Projects: ${result.summary.totalProjects}`);
        console.log(`Legacy ENVs: ${chalk.yellow(result.summary.legacyEnvs)}`);
        console.log(`v6.0 ENVs: ${chalk.green(result.summary.v6Envs)}`);
        console.log(`Needs Migration: ${chalk.red(result.summary.needsMigration)}`);

        if (result.projects) {
          console.log(chalk.bold('\nProjects:'));
          for (const project of result.projects) {
            console.log(`\n  ${chalk.cyan(project.projectName)}`);
            for (const env of project.environments) {
              const status = env.isV6Format ? chalk.green('v6.0') : chalk.yellow('legacy');
              console.log(`    ${env.name}: ${status}`);
              if (env.issues.length > 0) {
                for (const issue of env.issues) {
                  console.log(`      ${chalk.gray('!')} ${issue}`);
                }
              }
            }
          }
        }
      } else {
        console.log(chalk.red(`Error: ${result.error}`));
      }
    } catch (error) {
      console.log(chalk.red(`Error: ${error}`));
    }
  });

env
  .command('migrate [project]')
  .description('Migrate ENV to v6.0 format')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .option('--dry-run', 'Preview changes without applying')
  .action(async (project, options) => {
    const projectName = project || config.getLinkedProject();
    if (!projectName) {
      console.log(chalk.red('No project specified'));
      process.exit(1);
    }

    console.log(chalk.bold(`\nMigrating ENV: ${projectName} (${options.environment})\n`));

    try {
      const result = await api.call('env_migrate', {
        projectName,
        environment: options.environment,
        dryRun: options.dryRun ?? true,
      });

      if (result.success) {
        if (result.changes && result.changes.length > 0) {
          console.log(chalk.bold('Changes:'));
          for (const change of result.changes) {
            const icon = change.type === 'added' ? chalk.green('+') :
                        change.type === 'removed' ? chalk.red('-') :
                        change.type === 'modified' ? chalk.yellow('~') :
                        chalk.blue('→');
            console.log(`  ${icon} ${change.key}: ${change.reason}`);
          }
        } else {
          console.log(chalk.green('No changes needed. ENV is already in v6.0 format.'));
        }

        if (result.warnings && result.warnings.length > 0) {
          console.log(chalk.bold('\nWarnings:'));
          for (const warning of result.warnings) {
            console.log(`  ${chalk.yellow('!')} ${warning}`);
          }
        }

        if (options.dryRun) {
          console.log(chalk.gray('\n(dry-run mode - no changes applied)'));
          console.log(chalk.gray('Remove --dry-run to apply changes'));
        }
      } else {
        console.log(chalk.red(`Error: ${result.error}`));
      }
    } catch (error) {
      console.log(chalk.red(`Error: ${error}`));
    }
  });

env
  .command('restore [project]')
  .description('Restore ENV from backup')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .option('-v, --version <version>', 'Backup version (master, current, or timestamp)', 'master')
  .action(async (project, options) => {
    const projectName = project || config.getLinkedProject();
    if (!projectName) {
      console.log(chalk.red('No project specified'));
      process.exit(1);
    }

    console.log(chalk.bold(`\nRestoring ENV: ${projectName} (${options.environment}) from ${options.version}\n`));

    try {
      const result = await api.call('env_restore', {
        projectName,
        environment: options.environment,
        version: options.version,
      });

      if (result.success) {
        console.log(chalk.green(`ENV restored successfully from ${result.restoredFrom}`));
      } else {
        console.log(chalk.red(`Error: ${result.error}`));
      }
    } catch (error) {
      console.log(chalk.red(`Error: ${error}`));
    }
  });

// ============================================================================
// Edge Function Commands
// ============================================================================

program
  .command('edge')
  .description('Manage edge functions')
  .argument('[action]', 'Action: deploy, list, logs, delete')
  .option('-p, --project <project>', 'Project name')
  .option('-f, --function <name>', 'Function name')
  .action(async (action, options) => {
    console.log(chalk.yellow('Edge functions coming soon...'));
  });

// ============================================================================
// Analytics Commands
// ============================================================================

program
  .command('analytics [project]')
  .description('View analytics and Web Vitals')
  .option('-e, --environment <env>', 'Environment', 'production')
  .option('-p, --period <period>', 'Period: hour, day, week, month', 'day')
  .action(async (project, options) => {
    const projectName = project || config.getLinkedProject();
    if (!projectName) {
      console.log(chalk.red('No project specified'));
      process.exit(1);
    }

    try {
      const result = await api.call('analytics_overview', {
        projectName,
        environment: options.environment,
        period: options.period,
      });

      if (result.success && result.data) {
        const d = result.data;
        console.log(chalk.bold(`\nAnalytics: ${projectName} (${options.period})\n`));
        console.log(`Page Views: ${chalk.cyan(d.pageViews.toLocaleString())}`);
        console.log(`Unique Visitors: ${chalk.cyan(d.uniqueVisitors.toLocaleString())}`);
        console.log(`Bounce Rate: ${d.bounceRate}%`);
        console.log(`\nWeb Vitals (p75):`);
        console.log(`  LCP: ${d.lcp}ms`);
        console.log(`  CLS: ${d.cls}`);
        console.log(`  INP: ${d.inp}ms`);
        console.log(`  TTFB: ${d.ttfb}ms`);
        console.log(`\nDeployments: ${d.deployments} (${d.successRate}% success)`);
      } else {
        console.log(chalk.red(`Error: ${result.error}`));
      }
    } catch (error) {
      console.log(chalk.red(`Error: ${error}`));
    }
  });

// ============================================================================
// Team Commands
// ============================================================================

program
  .command('team')
  .description('Manage teams')
  .argument('[action]', 'Action: list, create, switch, members, invite')
  .action(async (action) => {
    console.log(chalk.yellow('Team management coming soon...'));
  });

// ============================================================================
// Logs Command
// ============================================================================

program
  .command('logs [project]')
  .description('View deployment logs')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .option('-f, --follow', 'Follow logs in real-time')
  .option('-n, --tail <lines>', 'Number of lines', '100')
  .action(async (project, options) => {
    console.log(chalk.yellow('Logs coming soon...'));
  });

// ============================================================================
// Migration Commands (v3.x/v5.x -> v6.0)
// ============================================================================

const migrate = program
  .command('migrate')
  .description('Migrate from legacy system (v3.x/v5.x) to v6.0 slot system');

migrate
  .command('detect')
  .description('Detect legacy projects and containers')
  .option('-v, --verbose', 'Show detailed container info')
  .action(async (options) => {
    const { waitUntilExit } = render(
      <MigrateDetectCommand verbose={options.verbose} />
    );
    await waitUntilExit();
  });

migrate
  .command('plan')
  .description('Create migration plan')
  .option('-p, --projects <projects...>', 'Specific projects to migrate')
  .option('--dry-run', 'Preview only, no changes')
  .action(async (options) => {
    const { waitUntilExit } = render(
      <MigratePlanCommand
        projects={options.projects}
        dryRun={options.dryRun ?? true}
      />
    );
    await waitUntilExit();
  });

migrate
  .command('execute')
  .description('Execute migration')
  .option('--id <migrationId>', 'Migration plan ID')
  .option('-f, --force', 'Force migration even with warnings')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (options) => {
    const { waitUntilExit } = render(
      <MigrateExecuteCommand
        migrationId={options.id}
        force={options.force}
        yes={options.yes}
      />
    );
    await waitUntilExit();
  });

migrate
  .command('rollback')
  .description('Rollback a migration')
  .option('--id <migrationId>', 'Migration ID to rollback')
  .action(async (options) => {
    if (!options.id) {
      console.log(chalk.red('Migration ID required. Use --id <migrationId>'));
      process.exit(1);
    }

    try {
      const result = await api.call('migrate_safe_rollback', {
        migrationId: options.id,
      });

      if (result.success) {
        console.log(chalk.green(`\n${result.message}\n`));
      } else {
        console.log(chalk.red(`Error: ${result.error || result.message}`));
      }
    } catch (error) {
      console.log(chalk.red(`Error: ${error}`));
    }
  });

// Safe Zero-Downtime Migration (Recommended)
migrate
  .command('safe')
  .description('Zero-downtime migration (no service interruption) [RECOMMENDED]')
  .option('-p, --projects <projects...>', 'Specific projects to migrate')
  .option('-e, --environments <envs...>', 'Specific environments (staging, production)')
  .option('--dry-run', 'Preview changes without executing')
  .option('-f, --force', 'Force migration even with warnings')
  .action(async (options) => {
    console.log(chalk.bold.cyan('\n🔄 CodeB Safe Migration (Zero-Downtime)\n'));
    console.log(chalk.gray('This migration will NOT interrupt your existing services.\n'));

    try {
      // Step 1: Detect
      console.log(chalk.bold('Step 1: Detecting legacy systems...'));
      const detection = await api.call('migrate_detect', {});

      if (!detection.success || detection.projects?.length === 0) {
        console.log(chalk.yellow('No legacy projects found to migrate.'));
        return;
      }

      console.log(chalk.green(`  Found ${detection.projects.length} project(s)`));
      console.log(chalk.green(`  System type: ${detection.systemType}`));

      if (detection.warnings) {
        for (const warning of detection.warnings) {
          console.log(chalk.yellow(`  ! ${warning}`));
        }
      }

      // Step 2: Execute Safe Migration
      console.log(chalk.bold('\nStep 2: Registering projects for v6.0...'));

      const result = await api.call('migrate_safe', {
        projects: options.projects,
        environments: options.environments,
        dryRun: options.dryRun ?? false,
        force: options.force ?? false,
      });

      if (result.success) {
        console.log(chalk.green(`\n✅ Migration ${result.migrationId} completed!\n`));

        if (result.registeredProjects && result.registeredProjects.length > 0) {
          console.log(chalk.bold('Registered Projects:'));
          for (const project of result.registeredProjects) {
            const statusIcon = project.status === 'ready' ? chalk.green('✓') : chalk.yellow('○');
            console.log(`  ${statusIcon} ${chalk.cyan(project.name)} (${project.environment})`);
            console.log(chalk.gray(`      Current: port ${project.currentPort}`));
            console.log(chalk.gray(`      Blue: port ${project.bluePort} | Green: port ${project.greenPort}`));
            if (project.volumes.length > 0) {
              console.log(chalk.gray(`      Volumes: ${project.volumes.length} preserved`));
            }
          }
        }

        if (result.warnings && result.warnings.length > 0) {
          console.log(chalk.bold('\nWarnings:'));
          for (const warning of result.warnings) {
            console.log(chalk.yellow(`  ! ${warning}`));
          }
        }

        console.log(chalk.bold('\nNext Steps:'));
        for (const step of result.nextSteps || []) {
          console.log(chalk.gray(`  ${step}`));
        }
      } else {
        console.log(chalk.red(`\n❌ Migration failed`));
        if (result.errors) {
          for (const error of result.errors) {
            console.log(chalk.red(`  ${error}`));
          }
        }
      }
    } catch (error) {
      console.log(chalk.red(`Error: ${error}`));
    }
  });

migrate
  .command('workflow [project]')
  .description('Generate GitHub Actions workflow for v6.0 deployment')
  .action(async (project) => {
    const projectName = project || config.getLinkedProject();
    if (!projectName) {
      console.log(chalk.red('No project specified'));
      process.exit(1);
    }

    try {
      const result = await api.call('migrate_generate_workflow', {
        projectName,
      });

      if (result.success) {
        console.log(chalk.bold.cyan(`\nGitHub Actions Workflow for ${projectName}\n`));
        console.log(chalk.gray('Save this as .github/workflows/deploy.yml\n'));
        console.log(chalk.gray('─'.repeat(60)));
        console.log(result.workflow);
        console.log(chalk.gray('─'.repeat(60)));
        console.log(chalk.bold('\nRequired GitHub Secrets:'));
        console.log(chalk.gray('  CODEB_API_KEY - Your CodeB API key'));
        console.log(chalk.gray('  GHCR_PAT - GitHub Container Registry token'));
      } else {
        console.log(chalk.red(`Error: ${result.error}`));
      }
    } catch (error) {
      console.log(chalk.red(`Error: ${error}`));
    }
  });

migrate
  .command('status')
  .description('Show migration status')
  .action(async () => {
    try {
      const detection = await api.call('migrate_detect', {});

      console.log(chalk.bold.cyan('\n📊 Migration Status\n'));

      console.log(chalk.bold('System Type:'), detection.systemType);
      console.log(chalk.bold('SSOT:'), detection.hasSSOT ? chalk.green('Present') : chalk.gray('Not found'));

      if (detection.projects && detection.projects.length > 0) {
        console.log(chalk.bold(`\nProjects (${detection.projects.length}):`));
        for (const project of detection.projects) {
          const status = project.canMigrate ? chalk.green('ready') : chalk.yellow('blocked');
          console.log(`  ${chalk.cyan(project.name)} [${status}]`);
          for (const env of project.environments) {
            const envStatus = env.status === 'running' ? chalk.green('●') : chalk.gray('○');
            console.log(chalk.gray(`    ${envStatus} ${env.name}: port ${env.port || 'N/A'}`));
          }
          if (!project.canMigrate && project.migrationBlocker) {
            console.log(chalk.yellow(`    → ${project.migrationBlocker}`));
          }
        }
      }

      if (detection.containers && detection.containers.length > 0) {
        console.log(chalk.bold(`\nContainers (${detection.containers.length}):`));
        for (const container of detection.containers) {
          const status = container.status === 'running' ? chalk.green('●') : chalk.gray('○');
          const quadlet = container.isQuadlet ? chalk.cyan('[Quadlet]') : '';
          console.log(`  ${status} ${container.name} ${quadlet}`);
        }
      }

      if (detection.warnings && detection.warnings.length > 0) {
        console.log(chalk.bold('\nWarnings:'));
        for (const warning of detection.warnings) {
          console.log(chalk.yellow(`  ! ${warning}`));
        }
      }

      console.log(chalk.gray('\nRun `we migrate safe` to start zero-downtime migration.\n'));
    } catch (error) {
      console.log(chalk.red(`Error: ${error}`));
    }
  });

// ============================================================================
// Legacy Compatibility Commands (deprecated)
// ============================================================================

// Redirect old commands to new ones
program
  .command('workflow <action>', { hidden: true })
  .description('[DEPRECATED] Use new commands instead')
  .action((action) => {
    console.log(chalk.yellow(`\n⚠️  'we workflow' is deprecated.\n`));
    const mapping: Record<string, string> = {
      init: 'we init',
      scan: 'we slot status',
      stop: 'we slot cleanup',
    };
    if (mapping[action]) {
      console.log(chalk.gray(`Use ${chalk.cyan(mapping[action])} instead.\n`));
    }
    console.log(chalk.gray(`Run ${chalk.cyan('we migrate detect')} to migrate to v6.0.\n`));
  });

program
  .command('ssot <action>', { hidden: true })
  .description('[DEPRECATED] Use registry commands instead')
  .action((action) => {
    console.log(chalk.yellow(`\n⚠️  'we ssot' is deprecated.\n`));
    const mapping: Record<string, string> = {
      status: 'we slot list',
      sync: 'we registry sync',
      projects: 'we slot list',
    };
    if (mapping[action]) {
      console.log(chalk.gray(`Use ${chalk.cyan(mapping[action])} instead.\n`));
    }
    console.log(chalk.gray(`Run ${chalk.cyan('we migrate detect')} to migrate to v6.0.\n`));
  });

// ============================================================================
// Interactive Mode
// ============================================================================

program
  .command('interactive', { hidden: true })
  .description('Interactive mode')
  .action(async () => {
    const { waitUntilExit } = render(
      <InteractiveApp config={config} api={api} />
    );
    await waitUntilExit();
  });

// ============================================================================
// Default Handler
// ============================================================================

// If no command provided, show help or interactive mode
if (process.argv.length === 2) {
  // Show beautiful welcome
  console.log(`
${chalk.bold.cyan('CodeB CLI')} ${chalk.gray(`v${pkg.version}`)}

${chalk.bold('Commands:')}
  ${chalk.cyan('we deploy')}     Deploy to Blue-Green slot
  ${chalk.cyan('we promote')}    Promote to production
  ${chalk.cyan('we rollback')}   Rollback to previous version
  ${chalk.cyan('we slot')}       Show slot status
  ${chalk.cyan('we analytics')}  View Web Vitals
  ${chalk.cyan('we login')}      Authenticate

${chalk.gray('Run `we --help` for more commands')}
`);
  process.exit(0);
}

program.parse();
