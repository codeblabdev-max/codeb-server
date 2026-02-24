/**
 * @codeb/cli - Domain Command
 *
 * Top-level domain management shortcut.
 * Actions: setup, list, delete
 *
 * Refactored from cli/src/commands/domain.js
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { callApi } from '../lib/api-client.js';

// ============================================================================
// Command Factory
// ============================================================================

export function createDomainCommand(): Command {
  const domainCmd = new Command('domain')
    .description('Domain management (setup, list, delete)')
    .argument('<action>', 'Action (setup|list|delete)')
    .argument('[domain]', 'Domain name')
    .option('-p, --project <name>', 'Project name')
    .option('-e, --environment <env>', 'Target environment', 'production')
    .option('--force', 'Force operation')
    .action(async (action, domain, options) => {
      await domainAction(action, domain, options);
    });

  return domainCmd;
}

// ============================================================================
// Domain Action
// ============================================================================

async function domainAction(
  action: string,
  domain?: string,
  options: { project?: string; environment?: string; force?: boolean } = {},
): Promise<void> {
  switch (action) {
    case 'setup': {
      if (!domain) {
        console.log(chalk.yellow('Usage: we domain setup <domain> [-p project]'));
        console.log(chalk.gray('\nExamples:'));
        console.log(chalk.gray('  we domain setup myapp.codeb.kr'));
        console.log(chalk.gray('  we domain setup myapp.workb.net -p myapp'));
        console.log(chalk.gray('  we domain setup example.com -p myapp'));
        return;
      }

      const spinner = ora(`Setting up domain ${domain}...`).start();
      try {
        const result = await callApi('domain_setup', {
          domain,
          projectName: options.project,
          environment: options.environment || 'production',
        });

        if (result.success) {
          spinner.succeed(`Domain ${domain} configured`);
          console.log(chalk.green('\n  DNS + SSL + Caddy configured'));

          const data = result.data as Record<string, unknown> | undefined;
          if (data?.dnsRecord) {
            console.log(chalk.gray(`  DNS Record: ${JSON.stringify(data.dnsRecord)}`));
          }
          if (data?.sslStatus) {
            console.log(chalk.gray(`  SSL Status: ${data.sslStatus}`));
          }
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

          const domains = result.data as Array<{
            domain: string;
            projectName?: string;
            status: string;
            sslEnabled: boolean;
          }> | undefined;

          if (domains && domains.length > 0) {
            console.log('');
            for (const d of domains) {
              const ssl = d.sslEnabled ? chalk.green('[SSL]') : chalk.gray('[---]');
              const status = d.status === 'active' ? chalk.green(d.status) : chalk.yellow(d.status);
              console.log(`  ${ssl} ${chalk.cyan(d.domain)} -> ${d.projectName || '-'} (${status})`);
            }
            console.log(`\n  Total: ${domains.length} domain(s)`);
          } else {
            console.log(chalk.gray('\n  No domains configured'));
          }
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
        console.log(chalk.yellow('Usage: we domain delete <domain>'));
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
      console.log(chalk.red(`Unknown action: ${action}`));
      console.log(chalk.gray('Available: setup, list, delete'));
  }
}
