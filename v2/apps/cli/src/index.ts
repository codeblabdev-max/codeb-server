/**
 * @codeb/cli - Commander Program Definition
 *
 * /we: Web Deploy CLI v8.0
 *
 * 5 core commands:
 * 1. deploy   - Blue-Green deployment (promote, rollback, slot, status)
 * 2. health   - System health check
 * 3. init     - Project initialization (config, mcp, update)
 * 4. workflow - Infrastructure setup (domain, ssh, quadlet, github-actions)
 * 5. env      - Environment variable management (scan, pull, push, fix)
 *
 * Refactored from cli/bin/we.js
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { getVersion } from '@codeb/shared';
import { createDeployCommand } from './commands/deploy.cmd.js';
import { createHealthCommand } from './commands/health.cmd.js';
import { createInitCommand } from './commands/init.cmd.js';
import { createWorkflowCommand } from './commands/workflow.cmd.js';
import { createEnvCommand } from './commands/env.cmd.js';
import { createDomainCommand } from './commands/domain.cmd.js';

// ============================================================================
// Version (SSOT from @codeb/shared → VERSION file)
// ============================================================================

const VERSION = getVersion();

// ============================================================================
// Program Factory
// ============================================================================

export function createCLI(): Command {
  const program = new Command();

  // CLI Header (skip in MCP serve mode)
  const isMcpServe = process.argv.includes('mcp') && process.argv.includes('serve');
  if (!isMcpServe) {
    console.log(chalk.cyan.bold('\n+===============================================+'));
    console.log(chalk.cyan.bold(`|   /we: Web Deploy CLI v${VERSION}                 |`));
    console.log(chalk.cyan.bold('|   deploy > health > env (5 commands)          |'));
    console.log(chalk.cyan.bold('+===============================================+\n'));
  }

  program
    .name('we')
    .description('/we: Web Deploy CLI - Blue-Green Deployment System')
    .version(VERSION);

  // ========================================================================
  // 1. DEPLOY - Blue-Green Deployment
  // ========================================================================
  program.addCommand(createDeployCommand());

  // ========================================================================
  // 2. HEALTH - System Health Check
  // ========================================================================
  program.addCommand(createHealthCommand());

  // ========================================================================
  // 3. INIT - Project Initialization
  // ========================================================================
  program.addCommand(createInitCommand());

  // ========================================================================
  // 4. WORKFLOW - Infrastructure Setup
  // ========================================================================
  program.addCommand(createWorkflowCommand());

  // ========================================================================
  // 5. ENV - Environment Variable Management
  // ========================================================================
  program.addCommand(createEnvCommand());

  // ========================================================================
  // 6. DOMAIN - Domain Management (top-level shortcut)
  // ========================================================================
  program.addCommand(createDomainCommand());

  // ========================================================================
  // Custom Help
  // ========================================================================
  program.on('--help', () => {
    console.log('');
    console.log(chalk.yellow('Core Commands (5):'));
    console.log('');
    console.log(chalk.cyan('  deploy') + chalk.gray('    - Blue-Green deployment'));
    console.log(chalk.gray('              we deploy <project>'));
    console.log(chalk.gray('              we deploy promote <project>'));
    console.log(chalk.gray('              we deploy rollback <project>'));
    console.log(chalk.gray('              we deploy slot <project>'));
    console.log('');
    console.log(chalk.cyan('  health') + chalk.gray('    - System health check'));
    console.log(chalk.gray('              we health'));
    console.log(chalk.gray('              we health --watch'));
    console.log('');
    console.log(chalk.cyan('  init') + chalk.gray('      - Project initialization'));
    console.log(chalk.gray('              we init [apiKey]'));
    console.log('');
    console.log(chalk.cyan('  workflow') + chalk.gray('  - Infrastructure setup'));
    console.log(chalk.gray('              we workflow init <project>'));
    console.log(chalk.gray('              we workflow scan <project>'));
    console.log(chalk.gray('              we workflow domain <action> [domain]'));
    console.log('');
    console.log(chalk.cyan('  env') + chalk.gray('       - Environment variable management'));
    console.log(chalk.gray('              we env scan [project]'));
    console.log(chalk.gray('              we env pull [project]'));
    console.log(chalk.gray('              we env push [project]'));
    console.log('');
    console.log(chalk.cyan('  domain') + chalk.gray('    - Domain management'));
    console.log(chalk.gray('              we domain setup <domain>'));
    console.log(chalk.gray('              we domain list'));
    console.log(chalk.gray('              we domain delete <domain>'));
    console.log('');
    console.log(chalk.cyan('Documentation: https://codeb.io/docs/cli'));
    console.log('');
  });

  // Error handling
  program.configureOutput({
    outputError: (str, write) => {
      write(chalk.red(`\nError: ${str}`));
    },
  });

  // Show help if no command provided
  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }

  return program;
}
