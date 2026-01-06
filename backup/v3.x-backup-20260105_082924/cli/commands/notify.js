#!/usr/bin/env node

/**
 * WE CLI - Notify Command
 *
 * Usage:
 *   we notify test [channel]                    - Test notification
 *   we notify send <event> <project>            - Send notification
 *   we notify config                            - Show configuration
 *   we notify config set <key> <value>          - Update configuration
 *   we notify health                            - Health check
 *   we notify setup                             - Interactive setup wizard
 */

const { Command } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const Table = require('cli-table3');
const notifier = require('../src/notifier');

const program = new Command();

program
  .name('notify')
  .description('CodeB notification management')
  .version('1.0.0');

// Test notification
program
  .command('test [channel]')
  .description('Send test notification')
  .option('-m, --message <message>', 'Custom test message')
  .action(async (channel = 'all', options) => {
    try {
      await notifier.initialize();

      console.log(chalk.blue('Sending test notification...'));

      const result = await notifier.test(channel, options.message);

      if (result.success) {
        console.log(chalk.green('\nTest notification sent!'));

        if (result.results) {
          result.results.forEach(r => {
            r.sentTo.forEach(sent => {
              const icon = sent.status === 'sent' ? '✓' : sent.status === 'failed' ? '✗' : '○';
              const color = sent.status === 'sent' ? 'green' : sent.status === 'failed' ? 'red' : 'gray';
              console.log(chalk[color](`  ${icon} ${sent.channel}: ${sent.status}`));
              if (sent.error) {
                console.log(chalk.red(`    Error: ${sent.error}`));
              }
            });
          });
        } else {
          result.sentTo.forEach(sent => {
            const icon = sent.status === 'sent' ? '✓' : sent.status === 'failed' ? '✗' : '○';
            const color = sent.status === 'sent' ? 'green' : sent.status === 'failed' ? 'red' : 'gray';
            console.log(chalk[color](`  ${icon} ${sent.channel}: ${sent.status}`));
            if (sent.error) {
              console.log(chalk.red(`    Error: ${sent.error}`));
            }
          });
        }
      } else {
        console.log(chalk.yellow('\nNotifications are disabled'));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Send notification
program
  .command('send <event> <project>')
  .description('Send notification for event')
  .option('-e, --environment <env>', 'Environment', 'production')
  .option('-s, --severity <severity>', 'Severity level', 'info')
  .option('-c, --channels <channels>', 'Channels (comma-separated)')
  .option('-d, --data <json>', 'Additional data (JSON string)')
  .action(async (event, project, options) => {
    try {
      await notifier.initialize();

      const notification = {
        event,
        project,
        environment: options.environment,
        severity: options.severity
      };

      if (options.channels) {
        notification.channels = options.channels.split(',').map(c => c.trim());
      }

      if (options.data) {
        notification.data = JSON.parse(options.data);
      }

      console.log(chalk.blue('Sending notification...'));

      const result = await notifier.notify(notification);

      if (result.success) {
        console.log(chalk.green('\nNotification sent!'));
        console.log(chalk.gray(`Message ID: ${result.messageId}`));

        result.sentTo.forEach(sent => {
          const icon = sent.status === 'sent' ? '✓' : sent.status === 'failed' ? '✗' : '○';
          const color = sent.status === 'sent' ? 'green' : sent.status === 'failed' ? 'red' : 'gray';
          console.log(chalk[color](`  ${icon} ${sent.channel}: ${sent.status}`));
          if (sent.error) {
            console.log(chalk.red(`    Error: ${sent.error}`));
          }
        });
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Show configuration
program
  .command('config')
  .description('Show notification configuration')
  .option('--raw', 'Show raw JSON')
  .action(async (options) => {
    try {
      await notifier.initialize();
      const config = notifier.getConfig(true);

      if (options.raw) {
        console.log(JSON.stringify(config, null, 2));
        return;
      }

      console.log(chalk.blue.bold('\nNotification Configuration\n'));

      // Status
      console.log(chalk.white('Status:'), config.enabled ? chalk.green('Enabled') : chalk.red('Disabled'));
      console.log();

      // Channels
      console.log(chalk.white.bold('Channels:'));
      Object.entries(config.channels).forEach(([name, ch]) => {
        const status = ch.enabled ? chalk.green('✓ Enabled') : chalk.gray('○ Disabled');
        console.log(`  ${chalk.cyan(name.padEnd(10))} ${status}`);

        if (name === 'slack' && ch.enabled) {
          console.log(`    Channel: ${ch.defaultChannel}`);
          console.log(`    Mention on critical: ${ch.mentionOnCritical ? 'Yes' : 'No'}`);
        } else if (name === 'discord' && ch.enabled) {
          console.log(`    Username: ${ch.username}`);
        } else if (name === 'email' && ch.enabled) {
          console.log(`    From: ${ch.from}`);
          console.log(`    To: ${ch.to.join(', ')}`);
        }
      });
      console.log();

      // Rules
      console.log(chalk.white.bold('Event Rules:'));
      const rulesTable = new Table({
        head: ['Event', 'Channels'],
        colWidths: [30, 40]
      });

      Object.entries(config.rules).forEach(([event, channels]) => {
        rulesTable.push([event, channels.join(', ')]);
      });

      console.log(rulesTable.toString());
      console.log();

      // Thresholds
      console.log(chalk.white.bold('Resource Thresholds:'));
      console.log(`  Disk:   ${config.thresholds.disk}%`);
      console.log(`  Memory: ${config.thresholds.memory}%`);
      console.log(`  CPU:    ${config.thresholds.cpu}%`);
      console.log();
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Health check
program
  .command('health')
  .description('Check notification system health')
  .action(async () => {
    try {
      await notifier.initialize();
      const health = await notifier.health();

      console.log(chalk.blue.bold('\nNotification System Health\n'));

      const statusColor = health.status === 'healthy' ? 'green' :
                         health.status === 'degraded' ? 'yellow' : 'red';
      console.log(chalk.white('Overall:'), chalk[statusColor](health.status.toUpperCase()));
      console.log();

      console.log(chalk.white.bold('Channels:'));
      Object.entries(health.channels).forEach(([name, ch]) => {
        const icon = ch.enabled && ch.configured && ch.reachable ? '✓' :
                    ch.enabled && ch.configured ? '⚠' : '○';
        const color = ch.enabled && ch.configured && ch.reachable ? 'green' :
                     ch.enabled && ch.configured ? 'yellow' : 'gray';

        console.log(chalk[color](`  ${icon} ${name.padEnd(10)}`));
        console.log(`    Enabled:     ${ch.enabled ? 'Yes' : 'No'}`);
        console.log(`    Configured:  ${ch.configured ? 'Yes' : 'No'}`);
        console.log(`    Reachable:   ${ch.reachable ? 'Yes' : 'Unknown'}`);

        if (ch.lastSuccess) {
          console.log(`    Last success: ${ch.lastSuccess}`);
        }
        if (ch.lastError) {
          console.log(chalk.red(`    Last error:   ${ch.lastError}`));
        }
      });
      console.log();
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// Interactive setup
program
  .command('setup')
  .description('Interactive notification setup wizard')
  .action(async () => {
    try {
      await notifier.initialize();

      console.log(chalk.blue.bold('\nCodeB Notification Setup Wizard\n'));

      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'enabled',
          message: 'Enable notifications?',
          default: true
        },
        {
          type: 'checkbox',
          name: 'channels',
          message: 'Select channels to configure:',
          choices: ['Slack', 'Discord', 'Email'],
          when: (answers) => answers.enabled
        }
      ]);

      if (!answers.enabled) {
        await notifier.updateConfig({ enabled: false });
        console.log(chalk.yellow('\nNotifications disabled'));
        return;
      }

      const config = notifier.getConfig(false);

      // Configure Slack
      if (answers.channels.includes('Slack')) {
        const slack = await inquirer.prompt([
          {
            type: 'input',
            name: 'webhookUrl',
            message: 'Slack webhook URL:',
            validate: (input) => input.startsWith('https://hooks.slack.com/') || 'Invalid Slack webhook URL'
          },
          {
            type: 'input',
            name: 'channel',
            message: 'Default channel:',
            default: '#deployments'
          },
          {
            type: 'confirm',
            name: 'mentionOnCritical',
            message: 'Mention @channel on critical alerts?',
            default: true
          }
        ]);

        config.channels.slack = {
          enabled: true,
          webhookUrl: slack.webhookUrl,
          defaultChannel: slack.channel,
          mentionOnCritical: slack.mentionOnCritical,
          mentionUsers: ['@channel']
        };
      }

      // Configure Discord
      if (answers.channels.includes('Discord')) {
        const discord = await inquirer.prompt([
          {
            type: 'input',
            name: 'webhookUrl',
            message: 'Discord webhook URL:',
            validate: (input) => input.startsWith('https://discord.com/api/webhooks/') || 'Invalid Discord webhook URL'
          },
          {
            type: 'input',
            name: 'username',
            message: 'Bot username:',
            default: 'CodeB Notifier'
          }
        ]);

        config.channels.discord = {
          enabled: true,
          webhookUrl: discord.webhookUrl,
          username: discord.username,
          avatarUrl: 'https://codeb.dev/logo.png'
        };
      }

      // Configure Email
      if (answers.channels.includes('Email')) {
        const email = await inquirer.prompt([
          {
            type: 'input',
            name: 'host',
            message: 'SMTP host:',
            default: 'smtp.gmail.com'
          },
          {
            type: 'number',
            name: 'port',
            message: 'SMTP port:',
            default: 587
          },
          {
            type: 'input',
            name: 'user',
            message: 'SMTP username (email):'
          },
          {
            type: 'password',
            name: 'pass',
            message: 'SMTP password:'
          },
          {
            type: 'input',
            name: 'from',
            message: 'From address:',
            default: 'noreply@codeb.dev'
          },
          {
            type: 'input',
            name: 'to',
            message: 'To addresses (comma-separated):',
            filter: (input) => input.split(',').map(e => e.trim())
          }
        ]);

        config.channels.email = {
          enabled: true,
          smtp: {
            host: email.host,
            port: email.port,
            secure: false,
            auth: {
              user: email.user,
              pass: email.pass
            }
          },
          from: email.from,
          to: email.to
        };
      }

      await notifier.updateConfig(config);

      console.log(chalk.green('\n✓ Configuration saved!'));
      console.log(chalk.gray('\nTest your setup with: we notify test\n'));
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
