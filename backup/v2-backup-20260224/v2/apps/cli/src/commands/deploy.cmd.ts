/**
 * @codeb/cli - Deploy Command
 *
 * Blue-Green deployment via HTTP API.
 * Subcommands: promote, rollback, slot, status
 *
 * Refactored from cli/src/commands/deploy.js
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { callApi } from '../lib/api-client.js';
import { formatDeployResult, formatSlotStatus } from '../lib/formatter.js';

// ============================================================================
// Command Factory
// ============================================================================

export function createDeployCommand(): Command {
  const deployCmd = new Command('deploy')
    .description('Blue-Green deployment (deploy, promote, rollback, slot)')
    .argument('[project]', 'Project name to deploy')
    .option('-e, --environment <env>', 'Target environment (staging|production)', 'production')
    .option('-i, --image <image>', 'Container image to deploy')
    .option('--skip-healthcheck', 'Skip health check after deploy')
    .option('--auto-promote', 'Auto-promote to active after deploy')
    .option('--force', 'Force deployment even with warnings')
    .option('--dry-run', 'Show deployment plan without executing')
    .action(async (project, options) => {
      if (!project) {
        console.log(chalk.yellow('Usage: we deploy <project> [options]'));
        console.log(chalk.gray('\nSubcommands:'));
        console.log(chalk.gray('  we deploy promote <project>  - Switch traffic to deployed slot'));
        console.log(chalk.gray('  we deploy rollback <project> - Rollback to previous slot'));
        console.log(chalk.gray('  we deploy slot <project>     - Check slot status'));
        console.log(chalk.gray('  we deploy status             - Show all deployments'));
        return;
      }
      await deployProject(project, options);
    });

  // deploy promote
  deployCmd
    .command('promote')
    .description('Switch traffic to deployed slot (zero-downtime)')
    .argument('<project>', 'Project name')
    .option('-e, --environment <env>', 'Target environment', 'production')
    .action(promoteProject);

  // deploy rollback
  deployCmd
    .command('rollback')
    .description('Instant rollback to previous slot')
    .argument('<project>', 'Project name')
    .option('-e, --environment <env>', 'Target environment', 'production')
    .action(rollbackProject);

  // deploy slot
  deployCmd
    .command('slot')
    .description('Check slot status (blue/green)')
    .argument('<project>', 'Project name')
    .option('-e, --environment <env>', 'Target environment', 'production')
    .action(slotStatus);

  // deploy status
  deployCmd
    .command('status')
    .description('Show all deployment status')
    .action(async () => {
      const spinner = ora('Fetching deployment status...').start();
      try {
        const result = await callApi('slot_list', {});
        spinner.succeed('Deployment status retrieved');
        console.log(chalk.gray(JSON.stringify(result, null, 2)));
      } catch (error) {
        spinner.fail('Failed to fetch status');
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

  return deployCmd;
}

// ============================================================================
// Deploy Action
// ============================================================================

async function deployProject(
  project: string,
  options: {
    environment?: string;
    image?: string;
    skipHealthcheck?: boolean;
    autoPromote?: boolean;
    force?: boolean;
    dryRun?: boolean;
  },
): Promise<void> {
  const { environment = 'production', image, skipHealthcheck, autoPromote, dryRun } = options;

  console.log(chalk.blue.bold('\n-- Blue-Green Slot Deployment --\n'));
  console.log(chalk.gray(`Project:      ${project}`));
  console.log(chalk.gray(`Environment:  ${environment}`));
  console.log(chalk.gray(`Auto-Promote: ${autoPromote ? 'yes' : 'no'}`));

  if (dryRun) {
    console.log(chalk.yellow('\n[DRY RUN] No actual deployment\n'));
    return;
  }

  const spinner = ora('Deploying via Blue-Green Slot API...').start();

  try {
    const result = await callApi('deploy_project', {
      projectName: project,
      environment,
      image,
      skipHealthcheck: skipHealthcheck || false,
    });

    if (result.success) {
      spinner.succeed('Deployment completed');
      console.log(formatDeployResult(result));

      if (result.previewUrl) {
        console.log(chalk.cyan(`\n  Preview URL: ${result.previewUrl}`));
      }

      console.log(chalk.yellow(`\n  Next step: Test preview, then run:`));
      console.log(chalk.cyan(`     we deploy promote ${project}\n`));
    } else {
      spinner.fail('Deployment failed');
      console.log(chalk.red(`\nError: ${result.error || 'Unknown error'}`));
    }
  } catch (error) {
    spinner.fail('Deployment failed');
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

// ============================================================================
// Promote Action
// ============================================================================

async function promoteProject(
  project: string,
  options: { environment?: string },
): Promise<void> {
  const { environment = 'production' } = options;
  const spinner = ora(`Promoting ${project} to active...`).start();

  try {
    const result = await callApi('slot_promote', {
      projectName: project,
      environment,
    });

    if (result.success) {
      spinner.succeed(`Traffic switched for ${project}`);
      console.log(chalk.green(`\n  From: ${result.fromSlot} -> To: ${result.toSlot}`));
      if (result.productionUrl) {
        console.log(chalk.cyan(`  Production URL: ${result.productionUrl}`));
      }
    } else {
      spinner.fail('Promote failed');
      console.log(chalk.red(`Error: ${result.error}`));
    }
  } catch (error) {
    spinner.fail('Promote failed');
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

// ============================================================================
// Rollback Action
// ============================================================================

async function rollbackProject(
  project: string,
  options: { environment?: string },
): Promise<void> {
  const { environment = 'production' } = options;
  const spinner = ora(`Rolling back ${project}...`).start();

  try {
    const result = await callApi('rollback', {
      projectName: project,
      environment,
    });

    if (result.success) {
      spinner.succeed(`Rollback completed for ${project}`);
      console.log(chalk.green(`\n  Restored: ${result.restoredVersion}`));
      console.log(chalk.green(`  Slot: ${result.toSlot}`));
    } else {
      spinner.fail('Rollback failed');
      console.log(chalk.red(`Error: ${result.error}`));
    }
  } catch (error) {
    spinner.fail('Rollback failed');
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

// ============================================================================
// Slot Status Action
// ============================================================================

async function slotStatus(
  project: string,
  options: { environment?: string },
): Promise<void> {
  const { environment = 'production' } = options;
  const spinner = ora(`Checking slot status for ${project}...`).start();

  try {
    const result = await callApi('slot_status', {
      projectName: project,
      environment,
    });

    if (result.success) {
      spinner.succeed('Slot status retrieved');
      console.log(formatSlotStatus(result.data as Record<string, unknown>));
    } else {
      spinner.fail('Failed to get slot status');
      console.log(chalk.red(`Error: ${result.error}`));
    }
  } catch (error) {
    spinner.fail('Failed to get slot status');
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}
