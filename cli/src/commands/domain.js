/**
 * Domain Command
 *
 * Domain management: setup, remove, check, list
 * Integrates with Caddy for reverse proxy and SSL
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { mcpClient } from '../lib/mcp-client.js';
import { validateDomain } from '../lib/validators.js';

export async function domain(action, domainName, options) {
  const { project, ssl, www, force } = options;

  switch (action) {
    case 'setup':
      await setupDomain(domainName, { project, ssl, www, force });
      break;
    case 'remove':
      await removeDomain(domainName, { force });
      break;
    case 'check':
      await checkDomain(domainName);
      break;
    case 'list':
      await listDomains();
      break;
    default:
      console.log(chalk.red(`\n❌ Unknown action: ${action}`));
      console.log(chalk.gray('Available actions: setup, remove, check, list\n'));
      process.exit(1);
  }
}

async function setupDomain(domainName, options) {
  const { project, ssl, www, force } = options;

  if (!domainName) {
    console.log(chalk.red('\n❌ Domain name is required for setup\n'));
    process.exit(1);
  }

  console.log(chalk.blue.bold(`\n🌐 Domain Setup\n`));
  console.log(chalk.gray(`Domain: ${domainName}`));
  console.log(chalk.gray(`Project: ${project || 'default'}`));
  console.log(chalk.gray(`SSL: ${ssl ? 'enabled' : 'disabled'}`));
  console.log(chalk.gray(`WWW redirect: ${www ? 'enabled' : 'disabled'}`));

  const spinner = ora('Validating domain...').start();

  try {
    // Validate domain format
    const validation = validateDomain(domainName);
    if (!validation.valid) {
      spinner.fail('Domain validation failed');
      console.log(chalk.red(`\n❌ ${validation.error}\n`));
      process.exit(1);
    }
    spinner.succeed('Domain validated');

    // Check DNS records
    spinner.start('Checking DNS records...');
    const dnsCheck = await mcpClient.checkDNS(domainName);

    if (!dnsCheck.configured && !force) {
      spinner.warn('DNS not configured');
      console.log(chalk.yellow('\n⚠️  DNS records not found or incorrect\n'));
      console.log(chalk.gray('Required DNS records:'));
      console.log(chalk.gray(`  A     ${domainName}     → YOUR_SERVER_IP`));
      if (www) {
        console.log(chalk.gray(`  CNAME www.${domainName} → ${domainName}`));
      }

      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: 'Continue without DNS configuration?',
        default: false
      }]);

      if (!proceed) {
        console.log(chalk.gray('\nSetup cancelled\n'));
        process.exit(0);
      }
    } else {
      spinner.succeed('DNS configured');
    }

    // Setup domain via MCP
    spinner.start('Configuring domain...');

    const setupResult = await mcpClient.setupDomain({
      domain: domainName,
      project: project || 'default',
      ssl: ssl,
      wwwRedirect: www
    });

    spinner.succeed('Domain configured');

    console.log(chalk.green('\n✅ Domain Setup Complete:\n'));
    console.log(chalk.gray(`  Domain: ${setupResult.domain}`));
    console.log(chalk.gray(`  SSL: ${setupResult.ssl ? 'enabled' : 'disabled'}`));
    console.log(chalk.gray(`  Certificate: ${setupResult.certificate || 'N/A'}`));
    console.log(chalk.gray(`  Upstream: ${setupResult.upstream}`));

    if (ssl) {
      console.log(chalk.cyan(`\n🔒 SSL Certificate:`));
      console.log(chalk.gray(`  Provider: ${setupResult.sslProvider || 'Let\'s Encrypt'}`));
      console.log(chalk.gray(`  Auto-renewal: enabled`));
    }

    console.log(chalk.cyan(`\n🌍 Your site is now available at:`));
    console.log(chalk.green(`  ${ssl ? 'https' : 'http'}://${domainName}`));
    if (www) {
      console.log(chalk.green(`  ${ssl ? 'https' : 'http'}://www.${domainName}`));
    }
    console.log();

  } catch (error) {
    spinner.fail('Domain setup failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

async function removeDomain(domainName, options) {
  const { force } = options;

  if (!domainName) {
    console.log(chalk.red('\n❌ Domain name is required for removal\n'));
    process.exit(1);
  }

  console.log(chalk.blue.bold(`\n🗑️  Domain Removal\n`));

  if (!force) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: chalk.red(`Are you sure you want to remove domain ${domainName}?`),
      default: false
    }]);

    if (!confirm) {
      console.log(chalk.gray('\nRemoval cancelled\n'));
      process.exit(0);
    }
  }

  const spinner = ora('Removing domain configuration...').start();

  try {
    await mcpClient.removeDomain(domainName);
    spinner.succeed('Domain removed');

    console.log(chalk.green(`\n✅ Domain ${domainName} has been removed\n`));

  } catch (error) {
    spinner.fail('Domain removal failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

async function checkDomain(domainName) {
  if (!domainName) {
    console.log(chalk.red('\n❌ Domain name is required for check\n'));
    process.exit(1);
  }

  const spinner = ora('Checking domain status...').start();

  try {
    const status = await mcpClient.checkDomain(domainName);
    spinner.succeed('Check completed');

    console.log(chalk.cyan('\n🔍 Domain Status:\n'));
    console.log(chalk.gray(`  Domain: ${domainName}`));
    console.log(chalk.gray(`  Configured: ${status.configured ? '✅' : '❌'}`));
    console.log(chalk.gray(`  SSL: ${status.ssl ? '✅ active' : '❌ inactive'}`));
    console.log(chalk.gray(`  DNS: ${status.dns ? '✅ configured' : '❌ not found'}`));
    console.log(chalk.gray(`  Reachable: ${status.reachable ? '✅' : '❌'}`));

    if (status.ssl) {
      console.log(chalk.cyan('\n🔒 SSL Certificate:'));
      console.log(chalk.gray(`  Issuer: ${status.sslInfo?.issuer || 'Unknown'}`));
      console.log(chalk.gray(`  Expires: ${status.sslInfo?.expiresAt || 'Unknown'}`));
      console.log(chalk.gray(`  Valid: ${status.sslInfo?.valid ? '✅' : '❌'}`));
    }

    console.log();

  } catch (error) {
    spinner.fail('Domain check failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

async function listDomains() {
  const spinner = ora('Fetching domains...').start();

  try {
    const domains = await mcpClient.listDomains();
    spinner.succeed(`Found ${domains.length} domain(s)`);

    if (domains.length === 0) {
      console.log(chalk.gray('\nNo domains configured\n'));
      return;
    }

    console.log(chalk.cyan('\n📋 Configured Domains:\n'));

    domains.forEach((domain, idx) => {
      const sslIcon = domain.ssl ? '🔒' : '🔓';
      const statusIcon = domain.active ? '🟢' : '🔴';

      console.log(chalk.bold(`  ${idx + 1}. ${domain.name}`));
      console.log(chalk.gray(`     ${statusIcon} Status: ${domain.status}`));
      console.log(chalk.gray(`     ${sslIcon} SSL: ${domain.ssl ? 'enabled' : 'disabled'}`));
      console.log(chalk.gray(`     🔗 Upstream: ${domain.upstream}`));
      console.log();
    });

  } catch (error) {
    spinner.fail('Failed to list domains');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}
