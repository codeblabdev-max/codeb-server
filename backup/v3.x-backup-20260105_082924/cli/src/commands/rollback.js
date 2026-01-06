/**
 * Rollback Command
 *
 * Safe deployment rollback to previous versions
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { mcpClient } from '../lib/mcp-client.js';

export async function rollback(project, options) {
  const { environment, version, list, force, dryRun } = options;

  if (list) {
    return listVersions(project, environment);
  }

  console.log(chalk.blue.bold(`\n⏪ Deployment Rollback\n`));
  console.log(chalk.gray(`Project: ${project || 'current'}`));
  console.log(chalk.gray(`Environment: ${environment}`));
  console.log(chalk.gray(`Target version: ${version || 'previous'}`));

  if (!force) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: chalk.yellow('Are you sure you want to rollback?'),
      default: false
    }]);

    if (!confirm) {
      console.log(chalk.gray('\nRollback cancelled\n'));
      process.exit(0);
    }
  }

  if (dryRun) {
    console.log(chalk.yellow('\n⚠️  Dry run mode\n'));
    console.log(chalk.gray('Rollback plan:'));
    console.log(chalk.gray('  1. Stop current version'));
    console.log(chalk.gray('  2. Restore previous version'));
    console.log(chalk.gray('  3. Verify health'));
    console.log(chalk.green('\n✅ Dry run completed\n'));
    return;
  }

  const spinner = ora('Rolling back deployment...').start();

  try {
    const result = await mcpClient.rollbackDeployment({
      project,
      environment,
      version
    });

    spinner.succeed('Rollback completed');

    console.log(chalk.green('\n✅ Rollback successful:\n'));
    console.log(chalk.gray(`  Current version: ${result.version}`));
    console.log(chalk.gray(`  Status: ${result.status}`));
    console.log();

  } catch (error) {
    spinner.fail('Rollback failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

async function listVersions(project, environment) {
  const spinner = ora('Fetching versions...').start();

  try {
    const versions = await mcpClient.listVersions(project, environment);
    spinner.succeed(`Found ${versions.length} version(s)`);

    console.log(chalk.cyan('\n📋 Available Versions:\n'));

    versions.forEach((v, idx) => {
      const current = v.current ? chalk.green('← current') : '';
      console.log(chalk.bold(`  ${idx + 1}. ${v.version} ${current}`));
      console.log(chalk.gray(`     Deployed: ${v.deployedAt}`));
      console.log(chalk.gray(`     Status: ${v.status}`));
      console.log();
    });

  } catch (error) {
    spinner.fail('Failed to fetch versions');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}
