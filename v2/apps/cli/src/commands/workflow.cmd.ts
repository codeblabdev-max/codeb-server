/**
 * @codeb/cli - Workflow Command
 *
 * Infrastructure setup: project init, scan, GitHub Actions workflow generation.
 * Subcommand: domain management.
 *
 * Refactored from cli/src/commands/workflow.js
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { callApi } from '../lib/api-client.js';

// ============================================================================
// Command Factory
// ============================================================================

export function createWorkflowCommand(): Command {
  const workflowCmd = new Command('workflow')
    .description('Infrastructure setup (init, scan, github-actions, domain)')
    .argument('<action>', 'Action (init|scan|generate)')
    .argument('[target]', 'Project name or target')
    .option('-n, --name <name>', 'Project name')
    .option('-t, --type <type>', 'Project type (nextjs|remix|nodejs|python|go)', 'nextjs')
    .option('-e, --environment <env>', 'Target environment', 'production')
    .option('--database', 'Include PostgreSQL database (default: true)')
    .option('--no-database', 'Exclude PostgreSQL database')
    .option('--redis', 'Include Redis cache (default: true)')
    .option('--no-redis', 'Exclude Redis cache')
    .option('--force', 'Overwrite existing files')
    .action(async (action, target, options) => {
      await workflowAction(action, target, options);
    });

  // workflow domain
  workflowCmd
    .command('domain')
    .description('Domain management (setup|list|delete)')
    .argument('<action>', 'Action (setup|list|delete)')
    .argument('[domain]', 'Domain name')
    .option('-p, --project <name>', 'Project name')
    .option('--force', 'Force operation')
    .action(async (action, domain, options) => {
      await domainAction(action, domain, options);
    });

  return workflowCmd;
}

// ============================================================================
// Workflow Action
// ============================================================================

async function workflowAction(
  action: string,
  target?: string,
  options: {
    name?: string;
    type?: string;
    environment?: string;
    database?: boolean;
    redis?: boolean;
    force?: boolean;
  } = {},
): Promise<void> {
  const projectName = target || options.name;

  switch (action) {
    case 'init': {
      if (!projectName) {
        console.log(chalk.yellow('Usage: we workflow init <project-name>'));
        return;
      }
      const spinner = ora(`Initializing workflow for ${projectName}...`).start();
      try {
        const result = await callApi('workflow_init', {
          projectName,
          type: options.type || 'nextjs',
          database: options.database !== false,
          redis: options.redis !== false,
        });
        if (result.success) {
          spinner.succeed(`Workflow initialized for ${projectName}`);
          const data = result.data as Record<string, unknown> | undefined;
          if (data?.files) {
            console.log(chalk.green('\nGenerated files:'));
            for (const file of data.files as string[]) {
              console.log(chalk.gray(`  - ${file}`));
            }
          }
        } else {
          spinner.fail('Workflow init failed');
          console.log(chalk.red(`Error: ${result.error}`));
        }
      } catch (error) {
        spinner.fail('Workflow init failed');
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
      break;
    }

    case 'scan': {
      if (!projectName) {
        console.log(chalk.yellow('Usage: we workflow scan <project-name>'));
        return;
      }
      const spinner = ora(`Scanning ${projectName}...`).start();
      try {
        const result = await callApi('workflow_scan', { projectName });
        if (result.success) {
          spinner.succeed(`Scan completed for ${projectName}`);
          console.log(chalk.gray(JSON.stringify(result.data, null, 2)));
        } else {
          spinner.fail('Scan failed');
          console.log(chalk.red(`Error: ${result.error}`));
        }
      } catch (error) {
        spinner.fail('Scan failed');
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
      break;
    }

    case 'generate': {
      if (!projectName) {
        console.log(chalk.yellow('Usage: we workflow generate <project-name>'));
        return;
      }
      const spinner = ora(`Generating workflow for ${projectName}...`).start();
      try {
        const result = await callApi('workflow_generate', {
          projectName,
          type: options.type || 'nextjs',
        });
        if (result.success) {
          spinner.succeed(`Workflow generated for ${projectName}`);
          console.log(chalk.gray(JSON.stringify(result.data, null, 2)));
        } else {
          spinner.fail('Workflow generation failed');
          console.log(chalk.red(`Error: ${result.error}`));
        }
      } catch (error) {
        spinner.fail('Workflow generation failed');
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
      break;
    }

    default:
      console.log(chalk.red(`Unknown action: ${action}`));
      console.log(chalk.gray('Available: init, scan, generate'));
  }
}

// ============================================================================
// Domain Action (via workflow)
// ============================================================================

async function domainAction(
  action: string,
  domain?: string,
  options: { project?: string; force?: boolean } = {},
): Promise<void> {
  switch (action) {
    case 'setup': {
      if (!domain) {
        console.log(chalk.yellow('Usage: we workflow domain setup <domain>'));
        return;
      }
      const spinner = ora(`Setting up domain ${domain}...`).start();
      try {
        const result = await callApi('domain_setup', {
          domain,
          projectName: options.project,
        });
        if (result.success) {
          spinner.succeed(`Domain ${domain} configured`);
          console.log(chalk.green(`\n  DNS + SSL + Caddy configured`));
        } else {
          spinner.fail('Domain setup failed');
          console.log(chalk.red(`Error: ${result.error}`));
        }
      } catch (error) {
        spinner.fail('Domain setup failed');
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
      break;
    }

    case 'list': {
      const spinner = ora('Listing domains...').start();
      try {
        const result = await callApi('domain_list', {
          projectName: options.project,
        });
        if (result.success) {
          spinner.succeed('Domains retrieved');
          console.log(chalk.gray(JSON.stringify(result.data, null, 2)));
        } else {
          spinner.fail('Failed to list domains');
          console.log(chalk.red(`Error: ${result.error}`));
        }
      } catch (error) {
        spinner.fail('Failed to list domains');
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
      break;
    }

    case 'delete': {
      if (!domain) {
        console.log(chalk.yellow('Usage: we workflow domain delete <domain>'));
        return;
      }
      const spinner = ora(`Deleting domain ${domain}...`).start();
      try {
        const result = await callApi('domain_delete', {
          domain,
          projectName: options.project,
        });
        if (result.success) {
          spinner.succeed(`Domain ${domain} deleted`);
        } else {
          spinner.fail('Domain deletion failed');
          console.log(chalk.red(`Error: ${result.error}`));
        }
      } catch (error) {
        spinner.fail('Domain deletion failed');
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
      break;
    }

    default:
      console.log(chalk.red(`Unknown domain action: ${action}`));
      console.log(chalk.gray('Available: setup, list, delete'));
  }
}
