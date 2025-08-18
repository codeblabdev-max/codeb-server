#!/usr/bin/env node

/**
 * CodeB CLI - Main Entry Point
 * 로컬 환경에서 서버 프로젝트를 관리하는 CLI 도구
 */

const { Command } = require('commander');
const chalk = require('chalk');
const figlet = require('figlet');
const packageJson = require('../package.json');

// Commands
const projectCommands = require('../src/commands/project');
const configCommands = require('../src/commands/config');
const deployCommands = require('../src/commands/deploy');
const dbCommands = require('../src/commands/database');
const envCommands = require('../src/commands/env');

// Initialize CLI
const program = new Command();

// Banner
console.log(
  chalk.cyan(
    figlet.textSync('CodeB CLI', { horizontalLayout: 'full' })
  )
);

// Version and description
program
  .name('codeb')
  .description('CodeB CLI - Project Management Tool for Podman-based deployments')
  .version(packageJson.version);

// Project Commands
program
  .command('list')
  .alias('ls')
  .description('List all projects')
  .option('-a, --all', 'Show all projects including stopped')
  .option('-j, --json', 'Output in JSON format')
  .action(projectCommands.list);

program
  .command('create <name>')
  .alias('new')
  .description('Create a new project')
  .option('-g, --git <url>', 'Git repository URL')
  .option('-d, --domain <domain>', 'Project domain')
  .option('-t, --template <template>', 'Project template (node|python|go|php)')
  .option('--db <type>', 'Database type (postgres|mysql|none)', 'postgres')
  .option('--cache', 'Enable Redis cache', true)
  .option('--ssl', 'Enable SSL (auto Let\'s Encrypt)', true)
  .action(projectCommands.create);

program
  .command('delete <name>')
  .alias('rm')
  .description('Delete a project')
  .option('-f, --force', 'Force delete without confirmation')
  .option('--keep-data', 'Keep project data and backups')
  .action(projectCommands.delete);

program
  .command('clone <source> <target>')
  .alias('cp')
  .description('Clone an existing project')
  .option('--skip-data', 'Skip database data cloning')
  .option('--new-domain <domain>', 'Set new domain for cloned project')
  .action(projectCommands.clone);

program
  .command('status [name]')
  .alias('ps')
  .description('Show project status')
  .option('-w, --watch', 'Watch status in real-time')
  .option('--detailed', 'Show detailed information')
  .action(projectCommands.status);

program
  .command('start <name>')
  .description('Start a project')
  .action(projectCommands.start);

program
  .command('stop <name>')
  .description('Stop a project')
  .option('--graceful', 'Graceful shutdown with timeout')
  .action(projectCommands.stop);

program
  .command('restart <name>')
  .description('Restart a project')
  .option('--hard', 'Hard restart (recreate containers)')
  .action(projectCommands.restart);

program
  .command('logs <name>')
  .description('Show project logs')
  .option('-f, --follow', 'Follow log output')
  .option('-t, --tail <lines>', 'Number of lines to show', '100')
  .option('-c, --container <name>', 'Specific container (app|postgres|redis)')
  .action(projectCommands.logs);

// Deploy Commands
program
  .command('deploy <name>')
  .description('Deploy project to server')
  .option('-e, --env <environment>', 'Target environment', 'production')
  .option('-b, --branch <branch>', 'Git branch to deploy', 'main')
  .option('--strategy <type>', 'Deployment strategy (instant|blue-green|canary)', 'instant')
  .action(deployCommands.deploy);

program
  .command('rollback <name>')
  .description('Rollback to previous version')
  .option('-v, --version <version>', 'Specific version to rollback')
  .action(deployCommands.rollback);

// Database Commands
program
  .command('db:backup <name>')
  .description('Backup project database')
  .option('-o, --output <path>', 'Backup file path')
  .action(dbCommands.backup);

program
  .command('db:restore <name>')
  .description('Restore project database')
  .option('-i, --input <path>', 'Backup file to restore')
  .option('--point-in-time <timestamp>', 'Restore to specific time')
  .action(dbCommands.restore);

program
  .command('db:shell <name>')
  .description('Open database shell')
  .action(dbCommands.shell);

// Environment Variables
program
  .command('env:list <name>')
  .description('List environment variables')
  .option('-e, --env <environment>', 'Environment', 'production')
  .action(envCommands.list);

program
  .command('env:set <name> <key=value...>')
  .description('Set environment variables')
  .option('-e, --env <environment>', 'Environment', 'production')
  .option('--encrypt', 'Encrypt sensitive values')
  .action(envCommands.set);

program
  .command('env:sync <name>')
  .description('Sync environment variables')
  .option('--from <env>', 'Source environment')
  .option('--to <env>', 'Target environment')
  .action(envCommands.sync);

// Config Commands
program
  .command('config')
  .description('Configure CodeB CLI')
  .option('--server <url>', 'Set server URL')
  .option('--token <token>', 'Set API token')
  .option('--show', 'Show current configuration')
  .action(configCommands.configure);

program
  .command('config:init')
  .description('Initialize CodeB CLI configuration')
  .action(configCommands.init);

// Info Command
program
  .command('info')
  .description('Show system information')
  .action(async () => {
    const info = await projectCommands.info();
    console.log(info);
  });

// Exec Command
program
  .command('exec <name> [command...]')
  .description('Execute command in project container')
  .option('-c, --container <name>', 'Target container', 'app')
  .action(projectCommands.exec);

// Error handling
program.on('command:*', () => {
  console.error(chalk.red('Invalid command: %s'), program.args.join(' '));
  console.log('Run "codeb --help" for a list of available commands.');
  process.exit(1);
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}