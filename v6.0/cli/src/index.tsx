#!/usr/bin/env node
/**
 * CodeB CLI v6.0 - Deploy with confidence
 * Vercel-style developer experience with Ink React components
 */

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
import { LogsCommand } from './commands/logs.js';
import { LinkCommand } from './commands/link.js';
import {
  EdgeListCommand,
  EdgeDeployCommand,
  EdgeLogsCommand,
  EdgeDeleteCommand,
  EdgeInvokeCommand,
} from './commands/edge.js';
import {
  TeamListCommand,
  TeamCreateCommand,
  TeamSwitchCommand,
  TeamMembersCommand,
  TeamInviteCommand,
} from './commands/team.js';
import {
  MigrateDetectCommand,
  MigratePlanCommand,
  MigrateExecuteCommand,
} from './commands/migrate.js';

// Package info
const pkg = {
  name: '@codeblabdev-max/we-cli',
  version: '6.0.5',
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
      <LoginCommand token={options.apiKey} />
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
      <WhoamiCommand />
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
        environment={options.prod ? 'production' : options.environment}
        ci={!!process.env.CI}
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
        environment={options.environment}
        yes={options.yes}
        ci={!!process.env.CI}
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
        environment={options.environment}
        reason={options.reason}
        yes={options.yes}
        ci={!!process.env.CI}
      />
    );
    await waitUntilExit();
  });

// ============================================================================
// Project Management Commands
// ============================================================================

program
  .command('link [project]')
  .description('Link current directory to a project')
  .action(async (project) => {
    const { waitUntilExit } = render(
      <LinkCommand project={project} ci={!!process.env.CI} />
    );
    await waitUntilExit();
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
        const d = result.data as {
          activeSlot: string;
          blue: { state: string; port: number; version?: string };
          green: { state: string; port: number; version?: string };
        };
        console.log(chalk.bold(`\nSlot Status: ${projectName} (${options.environment})\n`));
        console.log(`Active: ${chalk.green(d.activeSlot)}`);
        console.log(`\nBlue Slot:`);
        console.log(`  State: ${d.blue.state}`);
        console.log(`  Port: ${d.blue.port}`);
        console.log(`  Version: ${d.blue.version || 'none'}`);
        console.log(`\nGreen Slot:`);
        console.log(`  State: ${d.green.state}`);
        console.log(`  Port: ${d.green.port}`);
        console.log(`  Version: ${d.green.version || 'none'}`);
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

      if (result.success && result.data) {
        const d = result.data as {
          masterExists: boolean;
          currentExists: boolean;
          backups?: Array<{ timestamp: string; version: string }>;
        };
        console.log(chalk.bold(`\nENV Backups: ${projectName} (${options.environment})\n`));
        console.log(`Master: ${d.masterExists ? chalk.green('exists') : chalk.red('missing')}`);
        console.log(`Current: ${d.currentExists ? chalk.green('exists') : chalk.red('missing')}`);

        if (d.backups && d.backups.length > 0) {
          console.log(chalk.bold('\nRecent backups:'));
          for (const backup of d.backups) {
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

      if (result.success && result.data) {
        const d = result.data as {
          summary: { totalProjects: number; legacyEnvs: number; v6Envs: number; needsMigration: number };
          projects?: Array<{
            projectName: string;
            environments: Array<{ name: string; isV6Format: boolean; issues: string[] }>;
          }>;
        };
        console.log(chalk.bold('\nENV Configuration Scan\n'));
        console.log(`Total Projects: ${d.summary.totalProjects}`);
        console.log(`Legacy ENVs: ${chalk.yellow(d.summary.legacyEnvs)}`);
        console.log(`v6.0 ENVs: ${chalk.green(d.summary.v6Envs)}`);
        console.log(`Needs Migration: ${chalk.red(d.summary.needsMigration)}`);

        if (d.projects) {
          console.log(chalk.bold('\nProjects:'));
          for (const project of d.projects) {
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

      if (result.success && result.data) {
        const d = result.data as {
          changes?: Array<{ type: string; key: string; reason: string }>;
          warnings?: string[];
        };
        if (d.changes && d.changes.length > 0) {
          console.log(chalk.bold('Changes:'));
          for (const change of d.changes) {
            const icon = change.type === 'added' ? chalk.green('+') :
                        change.type === 'removed' ? chalk.red('-') :
                        change.type === 'modified' ? chalk.yellow('~') :
                        chalk.blue('→');
            console.log(`  ${icon} ${change.key}: ${change.reason}`);
          }
        } else {
          console.log(chalk.green('No changes needed. ENV is already in v6.0 format.'));
        }

        if (d.warnings && d.warnings.length > 0) {
          console.log(chalk.bold('\nWarnings:'));
          for (const warning of d.warnings) {
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

      if (result.success && result.data) {
        const d = result.data as { restoredFrom: string };
        console.log(chalk.green(`ENV restored successfully from ${d.restoredFrom}`));
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

// Edge parent command
const edge = program
  .command('edge')
  .description('Manage edge functions');

// edge list
edge
  .command('list')
  .alias('ls')
  .description('List edge functions')
  .option('-p, --project <project>', 'Project name')
  .action(async (options) => {
    const { waitUntilExit } = render(
      <EdgeListCommand project={options.project} ci={!!process.env.CI} />
    );
    await waitUntilExit();
  });

// edge deploy
edge
  .command('deploy')
  .description('Deploy an edge function')
  .option('-p, --project <project>', 'Project name')
  .option('-f, --file <file>', 'Path to edge function file')
  .option('-n, --name <name>', 'Function name')
  .option('-t, --type <type>', 'Function type (middleware, api, rewrite, redirect)', 'middleware')
  .option('-r, --routes <routes...>', 'Routes to match', ['/*'])
  .action(async (options) => {
    const { waitUntilExit } = render(
      <EdgeDeployCommand
        project={options.project}
        file={options.file}
        name={options.name}
        type={options.type}
        routes={options.routes}
        ci={!!process.env.CI}
      />
    );
    await waitUntilExit();
  });

// edge logs
edge
  .command('logs [functionName]')
  .description('View edge function logs')
  .option('-p, --project <project>', 'Project name')
  .option('-f, --follow', 'Follow logs in real-time')
  .option('-n, --tail <lines>', 'Number of lines', '50')
  .action(async (functionName, options) => {
    const { waitUntilExit } = render(
      <EdgeLogsCommand
        project={options.project}
        functionName={functionName}
        follow={options.follow}
        lines={parseInt(options.tail, 10)}
        ci={!!process.env.CI}
      />
    );
    await waitUntilExit();
  });

// edge delete
edge
  .command('delete <functionName>')
  .alias('rm')
  .description('Delete an edge function')
  .option('-p, --project <project>', 'Project name')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (functionName, options) => {
    const { waitUntilExit } = render(
      <EdgeDeleteCommand
        project={options.project}
        functionName={functionName}
        yes={options.yes}
        ci={!!process.env.CI}
      />
    );
    await waitUntilExit();
  });

// edge invoke
edge
  .command('invoke <functionName>')
  .description('Test invoke an edge function')
  .option('-p, --project <project>', 'Project name')
  .option('-m, --method <method>', 'HTTP method', 'GET')
  .option('--path <path>', 'Request path', '/')
  .option('-d, --data <data>', 'Request body (JSON)')
  .action(async (functionName, options) => {
    const { waitUntilExit } = render(
      <EdgeInvokeCommand
        project={options.project}
        functionName={functionName}
        method={options.method}
        path={options.path}
        data={options.data}
        ci={!!process.env.CI}
      />
    );
    await waitUntilExit();
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
        const d = result.data as {
          pageViews: number;
          uniqueVisitors: number;
          bounceRate: number;
          lcp: number;
          cls: number;
          inp: number;
          ttfb: number;
          deployments: number;
          successRate: number;
        };
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

// Team parent command
const team = program
  .command('team')
  .description('Manage teams');

// team list (default)
team
  .command('list')
  .alias('ls')
  .description('List teams')
  .action(async () => {
    const { waitUntilExit } = render(
      <TeamListCommand ci={!!process.env.CI} />
    );
    await waitUntilExit();
  });

// team create
team
  .command('create [name]')
  .description('Create a new team')
  .action(async (name) => {
    const { waitUntilExit } = render(
      <TeamCreateCommand name={name} ci={!!process.env.CI} />
    );
    await waitUntilExit();
  });

// team switch
team
  .command('switch [teamId]')
  .description('Switch to another team')
  .action(async (teamId) => {
    const { waitUntilExit } = render(
      <TeamSwitchCommand teamId={teamId} ci={!!process.env.CI} />
    );
    await waitUntilExit();
  });

// team members
team
  .command('members')
  .description('List team members')
  .action(async () => {
    const { waitUntilExit } = render(
      <TeamMembersCommand ci={!!process.env.CI} />
    );
    await waitUntilExit();
  });

// team invite
team
  .command('invite [email]')
  .description('Invite a member to the team')
  .option('-r, --role <role>', 'Member role (admin, member, viewer)', 'member')
  .action(async (email, options) => {
    const { waitUntilExit } = render(
      <TeamInviteCommand
        email={email}
        role={options.role}
        ci={!!process.env.CI}
      />
    );
    await waitUntilExit();
  });

// ============================================================================
// Logs Command
// ============================================================================

program
  .command('logs [project]')
  .description('View deployment logs')
  .option('-e, --environment <env>', 'Environment', 'staging')
  .option('-f, --follow', 'Follow logs in real-time', true)
  .option('-n, --tail <lines>', 'Number of lines', '50')
  .option('-l, --level <level>', 'Minimum log level (debug, info, warn, error)')
  .action(async (project, options) => {
    const { waitUntilExit } = render(
      <LogsCommand
        project={project}
        environment={options.environment}
        follow={options.follow}
        lines={parseInt(options.tail, 10)}
        level={options.level}
        ci={!!process.env.CI}
      />
    );
    await waitUntilExit();
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

      if (result.success && result.data) {
        const d = result.data as { message: string };
        console.log(chalk.green(`\n${d.message}\n`));
      } else {
        console.log(chalk.red(`Error: ${result.error}`));
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

      interface DetectionData {
        projects: Array<{ name: string }>;
        systemType: string;
        warnings?: string[];
      }

      const dd = detection.data as DetectionData | undefined;
      if (!detection.success || !dd?.projects?.length) {
        console.log(chalk.yellow('No legacy projects found to migrate.'));
        return;
      }

      console.log(chalk.green(`  Found ${dd.projects.length} project(s)`));
      console.log(chalk.green(`  System type: ${dd.systemType}`));

      if (dd.warnings) {
        for (const warning of dd.warnings) {
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

      interface MigrationResult {
        migrationId: string;
        registeredProjects?: Array<{
          status: string;
          name: string;
          environment: string;
          currentPort: number;
          bluePort: number;
          greenPort: number;
          volumes: string[];
        }>;
        warnings?: string[];
        nextSteps?: string[];
        errors?: string[];
      }

      const rd = result.data as MigrationResult | undefined;
      if (result.success && rd) {
        console.log(chalk.green(`\n Migration ${rd.migrationId} completed!\n`));

        if (rd.registeredProjects && rd.registeredProjects.length > 0) {
          console.log(chalk.bold('Registered Projects:'));
          for (const project of rd.registeredProjects) {
            const statusIcon = project.status === 'ready' ? chalk.green('v') : chalk.yellow('o');
            console.log(`  ${statusIcon} ${chalk.cyan(project.name)} (${project.environment})`);
            console.log(chalk.gray(`      Current: port ${project.currentPort}`));
            console.log(chalk.gray(`      Blue: port ${project.bluePort} | Green: port ${project.greenPort}`));
            if (project.volumes.length > 0) {
              console.log(chalk.gray(`      Volumes: ${project.volumes.length} preserved`));
            }
          }
        }

        if (rd.warnings && rd.warnings.length > 0) {
          console.log(chalk.bold('\nWarnings:'));
          for (const warning of rd.warnings) {
            console.log(chalk.yellow(`  ! ${warning}`));
          }
        }

        console.log(chalk.bold('\nNext Steps:'));
        for (const step of rd.nextSteps || []) {
          console.log(chalk.gray(`  ${step}`));
        }
      } else {
        console.log(chalk.red(`\n Migration failed`));
        if (rd?.errors) {
          for (const error of rd.errors) {
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

      if (result.success && result.data) {
        const d = result.data as { workflow: string };
        console.log(chalk.bold.cyan(`\nGitHub Actions Workflow for ${projectName}\n`));
        console.log(chalk.gray('Save this as .github/workflows/deploy.yml\n'));
        console.log(chalk.gray('-'.repeat(60)));
        console.log(d.workflow);
        console.log(chalk.gray('-'.repeat(60)));
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

      interface StatusData {
        systemType: string;
        hasSSOT: boolean;
        projects?: Array<{
          name: string;
          canMigrate: boolean;
          migrationBlocker?: string;
          environments: Array<{ name: string; status: string; port?: number }>;
        }>;
        containers?: Array<{ name: string; status: string; isQuadlet?: boolean }>;
        warnings?: string[];
      }

      const d = detection.data as StatusData | undefined;
      console.log(chalk.bold.cyan('\n Migration Status\n'));

      console.log(chalk.bold('System Type:'), d?.systemType || 'unknown');
      console.log(chalk.bold('SSOT:'), d?.hasSSOT ? chalk.green('Present') : chalk.gray('Not found'));

      if (d?.projects && d.projects.length > 0) {
        console.log(chalk.bold(`\nProjects (${d.projects.length}):`));
        for (const project of d.projects) {
          const status = project.canMigrate ? chalk.green('ready') : chalk.yellow('blocked');
          console.log(`  ${chalk.cyan(project.name)} [${status}]`);
          for (const env of project.environments) {
            const envStatus = env.status === 'running' ? chalk.green('*') : chalk.gray('o');
            console.log(chalk.gray(`    ${envStatus} ${env.name}: port ${env.port || 'N/A'}`));
          }
          if (!project.canMigrate && project.migrationBlocker) {
            console.log(chalk.yellow(`    -> ${project.migrationBlocker}`));
          }
        }
      }

      if (d?.containers && d.containers.length > 0) {
        console.log(chalk.bold(`\nContainers (${d.containers.length}):`));
        for (const container of d.containers) {
          const status = container.status === 'running' ? chalk.green('*') : chalk.gray('o');
          const quadlet = container.isQuadlet ? chalk.cyan('[Quadlet]') : '';
          console.log(`  ${status} ${container.name} ${quadlet}`);
        }
      }

      if (d?.warnings && d.warnings.length > 0) {
        console.log(chalk.bold('\nWarnings:'));
        for (const warning of d.warnings) {
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
      <InteractiveApp />
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
