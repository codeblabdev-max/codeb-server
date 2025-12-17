/**
 * SSOT Command
 *
 * Single Source of Truth management via MCP
 *
 * Commands:
 * - status: Show SSOT status and health
 * - projects: List registered projects
 * - history: Show change history
 * - validate: Validate SSOT integrity
 * - sync: Synchronize SSOT with server state
 */

import chalk from 'chalk';
import ora from 'ora';
import { ssotClient } from '../lib/ssot-client.js';

export async function ssot(action, options) {
  switch (action) {
    case 'status':
      await showStatus();
      break;
    case 'projects':
      await listProjects(options);
      break;
    case 'project':
      await showProject(options.id);
      break;
    case 'history':
      await showHistory(options.limit || 10);
      break;
    case 'validate':
      await validateSSOT(options.fix);
      break;
    case 'sync':
      await syncSSOT(options);
      break;
    case 'init':
      await initializeSSOT(options);
      break;
    default:
      showHelp();
      process.exit(1);
  }
}

async function showStatus() {
  const spinner = ora('Checking SSOT status...').start();

  try {
    const status = await ssotClient.getStatus();

    if (!status.initialized) {
      spinner.fail('SSOT not initialized');
      console.log(chalk.yellow('\n⚠️  SSOT is not initialized on the server.'));
      console.log(chalk.gray('\nTo initialize SSOT, run:'));
      console.log(chalk.cyan('  we ssot init\n'));
      return;
    }

    spinner.succeed('SSOT is active');

    console.log(chalk.cyan('\n📊 SSOT Status:\n'));

    // Core status
    const statusIcon = status.valid ? chalk.green('✅') : chalk.red('❌');
    console.log(`  ${chalk.bold('Status:')}     ${statusIcon} ${status.valid ? 'Valid' : 'Invalid'}`);
    console.log(`  ${chalk.bold('Projects:')}   ${status.projectCount}`);
    console.log(`  ${chalk.bold('Server IP:')}  ${status.serverIp || 'Unknown'}`);

    // Timestamps
    if (status.lastModified) {
      const lastMod = new Date(status.lastModified);
      console.log(`  ${chalk.bold('Modified:')}   ${lastMod.toLocaleString()}`);
    }
    if (status.lastModifiedBy) {
      console.log(`  ${chalk.bold('By:')}         ${status.lastModifiedBy}`);
    }

    // Issues
    if (status.issues && status.issues.length > 0) {
      console.log(chalk.yellow('\n⚠️  Issues detected:'));
      status.issues.forEach((issue, idx) => {
        console.log(chalk.yellow(`  ${idx + 1}. ${issue}`));
      });
      console.log(chalk.gray('\n  Run "we ssot validate --fix" to auto-fix issues'));
    }

    // Protection info
    console.log(chalk.cyan('\n🛡️  Protection System:\n'));
    console.log(chalk.gray('  All port/domain changes are managed through SSOT.'));
    console.log(chalk.gray('  Manual changes to Caddy/DNS are auto-reverted.'));
    console.log();

  } catch (error) {
    spinner.fail('Failed to check status');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

async function listProjects(options) {
  const spinner = ora('Fetching projects from SSOT...').start();

  try {
    const status = options.status || 'all';
    const projects = await ssotClient.listProjects(status);

    if (!projects || (Array.isArray(projects) && projects.length === 0)) {
      spinner.succeed('SSOT checked');
      console.log(chalk.gray('\nNo projects registered in SSOT\n'));
      console.log(chalk.gray('Register a project with: we workflow init <project-name>\n'));
      return;
    }

    spinner.succeed(`Found ${Array.isArray(projects) ? projects.length : 'N/A'} project(s)`);

    console.log(chalk.cyan('\n📦 Registered Projects:\n'));

    if (Array.isArray(projects)) {
      for (const projectId of projects) {
        // Fetch project details
        const project = await ssotClient.getProject(projectId);
        const type = project?.type || 'unknown';
        const statusIcon = project?.status === 'active' ? '🟢' : '⚪';

        console.log(`  ${statusIcon} ${chalk.bold(projectId)}`);
        console.log(chalk.gray(`     Type: ${type}`));

        if (project?.environments) {
          const envs = Object.keys(project.environments);
          console.log(chalk.gray(`     Environments: ${envs.join(', ')}`));
        }
        console.log();
      }
    } else if (typeof projects === 'object') {
      console.log(chalk.gray(JSON.stringify(projects, null, 2)));
    }

  } catch (error) {
    spinner.fail('Failed to list projects');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

async function showProject(projectId) {
  if (!projectId) {
    console.log(chalk.red('\n❌ Project ID required\n'));
    console.log(chalk.gray('Usage: we ssot project --id <project-id>\n'));
    process.exit(1);
  }

  const spinner = ora(`Fetching project: ${projectId}...`).start();

  try {
    const project = await ssotClient.getProject(projectId);

    if (!project) {
      spinner.fail('Project not found');
      console.log(chalk.yellow(`\n⚠️  Project "${projectId}" not found in SSOT\n`));
      return;
    }

    spinner.succeed('Project found');

    console.log(chalk.cyan(`\n📦 Project: ${projectId}\n`));
    console.log(chalk.gray(JSON.stringify(project, null, 2)));
    console.log();

  } catch (error) {
    spinner.fail('Failed to fetch project');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

async function showHistory(limit) {
  const spinner = ora('Fetching SSOT history...').start();

  try {
    const history = await ssotClient.getHistory(limit);

    if (!history || (Array.isArray(history) && history.length === 0)) {
      spinner.succeed('History checked');
      console.log(chalk.gray('\nNo history available\n'));
      return;
    }

    spinner.succeed('History fetched');

    console.log(chalk.cyan(`\n📜 SSOT History (last ${limit}):\n`));

    if (Array.isArray(history)) {
      history.forEach((entry, idx) => {
        const timestamp = entry.timestamp || entry.lastModified || 'Unknown';
        const action = entry.action || entry.type || 'change';
        const by = entry.modifiedBy || entry.actor || 'system';

        const date = new Date(timestamp);
        const timeStr = date.toLocaleString();

        console.log(`  ${chalk.bold(`${idx + 1}.`)} [${chalk.gray(timeStr)}]`);
        console.log(`     ${chalk.cyan(action)} by ${by}`);

        if (entry.projectId) {
          console.log(chalk.gray(`     Project: ${entry.projectId}`));
        }
        if (entry.changes) {
          console.log(chalk.gray(`     Changes: ${JSON.stringify(entry.changes)}`));
        }
        console.log();
      });
    } else {
      console.log(chalk.gray(JSON.stringify(history, null, 2)));
    }

  } catch (error) {
    spinner.fail('Failed to fetch history');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

async function validateSSOT(autoFix = false) {
  const spinner = ora('Validating SSOT...').start();

  try {
    const validation = await ssotClient.validate(autoFix);

    if (validation.valid) {
      spinner.succeed('SSOT is valid');
      console.log(chalk.green('\n✅ SSOT validation passed\n'));
      console.log(chalk.gray('  All configurations are consistent with SSOT.'));

      if (autoFix && validation.fixed) {
        console.log(chalk.cyan(`\n🔧 Auto-fixed ${validation.fixed} issue(s)`));
      }

      console.log();
    } else {
      spinner.fail('SSOT validation failed');
      console.log(chalk.red('\n❌ SSOT validation issues:\n'));

      if (validation.error) {
        console.log(chalk.red(`  Error: ${validation.error}`));
      }

      if (validation.issues && validation.issues.length > 0) {
        validation.issues.forEach((issue, idx) => {
          console.log(chalk.yellow(`  ${idx + 1}. ${issue}`));
        });

        if (!autoFix) {
          console.log(chalk.gray('\nRun with --fix to auto-fix issues:'));
          console.log(chalk.cyan('  we ssot validate --fix\n'));
        }
      }
    }

  } catch (error) {
    spinner.fail('Validation failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

async function syncSSOT(options) {
  const dryRun = options.dryRun || false;

  const spinner = ora(dryRun ? 'Checking sync status...' : 'Synchronizing SSOT...').start();

  try {
    const result = await ssotClient.sync({ dryRun });

    if (dryRun) {
      spinner.succeed('Sync check complete');
      console.log(chalk.cyan('\n🔍 Sync Preview (dry run):\n'));

      if (result.changes && result.changes.length > 0) {
        console.log(chalk.yellow('  Changes that would be applied:'));
        result.changes.forEach((change, idx) => {
          console.log(chalk.yellow(`  ${idx + 1}. ${change}`));
        });
        console.log(chalk.gray('\n  Run without --dry-run to apply changes'));
      } else {
        console.log(chalk.green('  No changes needed - everything is in sync'));
      }
    } else {
      if (result.success) {
        spinner.succeed('SSOT synchronized');
        console.log(chalk.green('\n✅ SSOT synchronized successfully\n'));

        if (result.changes && result.changes.length > 0) {
          console.log(chalk.cyan('  Applied changes:'));
          result.changes.forEach((change, idx) => {
            console.log(chalk.gray(`  ${idx + 1}. ${change}`));
          });
        }
      } else {
        spinner.fail('Sync failed');
        console.log(chalk.red(`\n❌ Sync error: ${result.error}\n`));
      }
    }

    console.log();

  } catch (error) {
    spinner.fail('Sync failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

async function initializeSSOT(options) {
  const force = options.force || false;
  const migrate = options.migrate !== false;

  const spinner = ora('Initializing SSOT...').start();

  try {
    const result = await ssotClient.initialize({ force, migrateExisting: migrate });

    if (result.success || result.initialized) {
      spinner.succeed('SSOT initialized');
      console.log(chalk.green('\n✅ SSOT initialized successfully\n'));

      if (result.migrated) {
        console.log(chalk.cyan(`  Migrated ${result.migrated} projects from legacy registry`));
      }

      console.log(chalk.gray('  SSOT is now the single source of truth for:'));
      console.log(chalk.gray('  - Port assignments'));
      console.log(chalk.gray('  - Domain configurations'));
      console.log(chalk.gray('  - Project registry'));
      console.log();
    } else {
      spinner.fail('Initialization failed');
      console.log(chalk.red(`\n❌ Error: ${result.error}\n`));

      if (result.error?.includes('exists')) {
        console.log(chalk.gray('  Use --force to reinitialize'));
      }
    }

  } catch (error) {
    spinner.fail('Initialization failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

function showHelp() {
  console.log(chalk.cyan('\n📋 SSOT Commands:\n'));
  console.log(chalk.bold('  we ssot status') + chalk.gray('              - Show SSOT status'));
  console.log(chalk.bold('  we ssot projects') + chalk.gray('            - List registered projects'));
  console.log(chalk.bold('  we ssot project --id <id>') + chalk.gray('   - Show project details'));
  console.log(chalk.bold('  we ssot history') + chalk.gray('             - Show change history'));
  console.log(chalk.bold('  we ssot validate') + chalk.gray('            - Validate SSOT integrity'));
  console.log(chalk.bold('  we ssot validate --fix') + chalk.gray('      - Auto-fix validation issues'));
  console.log(chalk.bold('  we ssot sync') + chalk.gray('                - Sync SSOT with server'));
  console.log(chalk.bold('  we ssot sync --dry-run') + chalk.gray('      - Preview sync changes'));
  console.log(chalk.bold('  we ssot init') + chalk.gray('                - Initialize SSOT'));
  console.log(chalk.bold('  we ssot init --force') + chalk.gray('        - Force reinitialize'));
  console.log();
}
