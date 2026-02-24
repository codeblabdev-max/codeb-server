/**
 * @codeb/cli - Health Command
 *
 * System health check via API /health endpoint.
 * Supports: verbose output, JSON format, watch mode.
 *
 * Refactored from cli/src/commands/health.js
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { callApi, fetchHealth } from '../lib/api-client.js';
import { formatHealthReport } from '../lib/formatter.js';

// ============================================================================
// Command Factory
// ============================================================================

export function createHealthCommand(): Command {
  const healthCmd = new Command('health')
    .description('System health check (full infrastructure status)')
    .option('-v, --verbose', 'Show detailed health information')
    .option('-j, --json', 'Output in JSON format')
    .option('-w, --watch', 'Continuous health monitoring')
    .option('-i, --interval <seconds>', 'Watch interval in seconds', '30')
    .action(async (options) => {
      const { verbose, json, watch, interval } = options;

      if (watch) {
        await watchHealth(parseInt(interval) || 30, verbose, json);
        return;
      }

      await performHealthCheck(verbose, json);
    });

  return healthCmd;
}

// ============================================================================
// Health Check
// ============================================================================

async function performHealthCheck(verbose = false, json = false): Promise<void> {
  const spinner = ora('Checking system health...').start();

  try {
    // First try the /health endpoint (no auth needed)
    const healthData = await fetchHealth();

    spinner.succeed('Health check completed');

    if (json) {
      console.log(JSON.stringify(healthData, null, 2));
      return;
    }

    console.log(formatHealthReport(healthData, verbose));

    // If verbose, also fetch infrastructure status (requires auth)
    if (verbose) {
      try {
        const infraResult = await callApi('health_check', { server: 'all' });
        if (infraResult.success && infraResult.data) {
          console.log(chalk.cyan('\n-- Infrastructure Status --'));
          console.log(chalk.gray(JSON.stringify(infraResult.data, null, 2)));
        }
      } catch {
        console.log(chalk.yellow('\n[INFO] Infrastructure details unavailable (auth may be required)'));
      }
    }
  } catch (error) {
    spinner.fail('Health check failed');
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    console.log(chalk.gray('\nTips:'));
    console.log(chalk.gray('  - Is the API server running?'));
    console.log(chalk.gray('  - Check API URL: we init config'));
    console.log(chalk.gray('  - Default: https://api.codeb.kr'));
  }
}

// ============================================================================
// Watch Mode
// ============================================================================

async function watchHealth(
  intervalSec: number,
  verbose: boolean,
  json: boolean,
): Promise<void> {
  console.log(chalk.cyan(`\nWatching health every ${intervalSec}s (Ctrl+C to stop)\n`));

  const check = async () => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.gray(`\n--- ${timestamp} ---`));
    await performHealthCheck(verbose, json);
  };

  await check();

  const timer = setInterval(check, intervalSec * 1000);

  process.on('SIGINT', () => {
    clearInterval(timer);
    console.log(chalk.yellow('\nWatch mode stopped'));
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}
