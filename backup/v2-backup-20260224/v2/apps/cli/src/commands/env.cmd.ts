/**
 * @codeb/cli - Env Command
 *
 * Environment variable management via API.
 * Actions: scan, pull, push, list, restore, backups
 *
 * Refactored from cli/src/commands/env.js
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { callApi } from '../lib/api-client.js';

// ============================================================================
// Command Factory
// ============================================================================

export function createEnvCommand(): Command {
  const envCmd = new Command('env')
    .description('Environment variable management (scan, pull, push, restore)')
    .argument('<action>', 'Action (scan|pull|push|list|restore|backups)')
    .argument('[project]', 'Project name')
    .option('--env <environment>', 'Target environment (staging|production)', 'production')
    .option('--force', 'Force overwrite without prompts')
    .option('--dry-run', 'Show what would be changed')
    .option('--file <path>', 'Source .env file path')
    .option('--no-restart', 'Skip service restart')
    .action(async (action, project, options) => {
      await envAction(action, project, options);
    });

  return envCmd;
}

// ============================================================================
// Env Action Dispatcher
// ============================================================================

async function envAction(
  action: string,
  project?: string,
  options: {
    env?: string;
    force?: boolean;
    dryRun?: boolean;
    file?: string;
    restart?: boolean;
  } = {},
): Promise<void> {
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
      console.log(chalk.gray('Available: scan, pull, push, list, restore, backups'));
  }
}

// ============================================================================
// Actions
// ============================================================================

async function envScan(
  project?: string,
  options: { env?: string } = {},
): Promise<void> {
  const spinner = ora('Scanning environment variables...').start();

  try {
    const result = await callApi('env_scan', {
      projectName: project,
      environment: options.env || 'production',
    });

    if (result.success) {
      spinner.succeed('Environment scan completed');

      const data = result.data as {
        missingOnServer?: string[];
        missingLocally?: string[];
        matched?: string[];
      } | undefined;

      if (data) {
        if (data.missingOnServer?.length) {
          console.log(chalk.yellow('\n  Missing on server:'));
          for (const key of data.missingOnServer) {
            console.log(chalk.yellow(`    - ${key}`));
          }
        }

        if (data.missingLocally?.length) {
          console.log(chalk.blue('\n  Missing locally:'));
          for (const key of data.missingLocally) {
            console.log(chalk.blue(`    - ${key}`));
          }
        }

        if (data.matched?.length) {
          console.log(chalk.green(`\n  Matched: ${data.matched.length} variables`));
        }
      }
    } else {
      spinner.fail('Environment scan failed');
      console.log(chalk.red(`Error: ${result.error}`));
    }
  } catch (error) {
    spinner.fail('Environment scan failed');
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

async function envPull(
  project?: string,
  options: { env?: string } = {},
): Promise<void> {
  if (!project) {
    console.log(chalk.yellow('Usage: we env pull <project>'));
    return;
  }

  const spinner = ora(`Pulling env vars for ${project}...`).start();

  try {
    const result = await callApi('env_get', {
      projectName: project,
      environment: options.env || 'production',
    });

    if (result.success) {
      spinner.succeed(`Environment variables retrieved for ${project}`);
      console.log(chalk.gray(JSON.stringify(result.data, null, 2)));
    } else {
      spinner.fail('Pull failed');
      console.log(chalk.red(`Error: ${result.error}`));
    }
  } catch (error) {
    spinner.fail('Pull failed');
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

async function envPush(
  project?: string,
  options: { env?: string; file?: string; restart?: boolean } = {},
): Promise<void> {
  if (!project) {
    console.log(chalk.yellow('Usage: we env push <project> [--file .env.production]'));
    return;
  }

  const spinner = ora(`Pushing env vars for ${project}...`).start();

  try {
    const result = await callApi('env_sync', {
      projectName: project,
      environment: options.env || 'production',
      filePath: options.file,
      restart: options.restart !== false,
    });

    if (result.success) {
      spinner.succeed(`Environment variables synced for ${project}`);
    } else {
      spinner.fail('Push failed');
      console.log(chalk.red(`Error: ${result.error}`));
    }
  } catch (error) {
    spinner.fail('Push failed');
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

async function envList(
  project?: string,
  _options: Record<string, unknown> = {},
): Promise<void> {
  const spinner = ora('Listing environment configurations...').start();

  try {
    const result = await callApi('env_get', {
      projectName: project,
    });

    if (result.success) {
      spinner.succeed('Environment configurations retrieved');
      console.log(chalk.gray(JSON.stringify(result.data, null, 2)));
    } else {
      spinner.fail('List failed');
      console.log(chalk.red(`Error: ${result.error}`));
    }
  } catch (error) {
    spinner.fail('List failed');
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

async function envRestore(
  project?: string,
  options: { env?: string } = {},
): Promise<void> {
  if (!project) {
    console.log(chalk.yellow('Usage: we env restore <project>'));
    return;
  }

  const spinner = ora(`Restoring env vars for ${project}...`).start();

  try {
    const result = await callApi('env_restore', {
      projectName: project,
      environment: options.env || 'production',
      version: 'master',
    });

    if (result.success) {
      spinner.succeed(`Environment variables restored for ${project}`);
    } else {
      spinner.fail('Restore failed');
      console.log(chalk.red(`Error: ${result.error}`));
    }
  } catch (error) {
    spinner.fail('Restore failed');
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

async function envBackups(
  project?: string,
  _options: Record<string, unknown> = {},
): Promise<void> {
  if (!project) {
    console.log(chalk.yellow('Usage: we env backups <project>'));
    return;
  }

  console.log(chalk.blue.bold(`\n-- Env Backups for ${project} --\n`));
  console.log(chalk.gray('Backup listing via API is not yet implemented.'));
  console.log(chalk.gray('Backups are stored on the backup server (141.164.37.63).'));
}
