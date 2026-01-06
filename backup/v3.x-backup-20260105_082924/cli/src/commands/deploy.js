/**
 * Deploy Command
 *
 * Handles project deployment with Blue-Green Slot API (v3.2.0+)
 * Supports: staging, production, preview environments
 *
 * v3.2.0: Blue-Green Slot deployment via HTTP API
 * v2.5.2: Added auto full scan before deployment
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { mcpClient } from '../lib/mcp-client.js';
import { logger } from '../lib/logger.js';
import { validateEnvironment, validateDockerCompose } from '../lib/validators.js';
import { fullPreDeployScan } from './workflow.js';

// Blue-Green Slot Deployment (v3.2.0+) via HTTP API
export async function deployBlueGreen(project, options) {
  const { environment = 'production', image, skipHealthcheck, autoPromote, dryRun, force } = options;

  console.log(chalk.blue.bold(`\n🚀 Blue-Green Slot Deployment\n`));
  console.log(chalk.gray(`Project: ${project}`));
  console.log(chalk.gray(`Environment: ${environment}`));
  console.log(chalk.gray(`Auto-Promote: ${autoPromote ? 'yes' : 'no'}`));

  if (dryRun) {
    console.log(chalk.yellow('\n⚠️  Dry run mode - no actual deployment\n'));
    return;
  }

  const spinner = ora('Deploying via Blue-Green Slot API...').start();

  try {
    // Call HTTP API deploy
    const result = await mcpClient.deployBlueGreen(project, environment, {
      image,
      skipHealthcheck: skipHealthcheck || false,
      autoPromote: autoPromote || false,
    });

    if (result.success || result.slot) {
      spinner.succeed('Deployment completed');

      console.log(chalk.green('\n✅ Blue-Green Slot Deployment Summary:'));
      console.log(chalk.gray(`  Project: ${result.project || project}`));
      console.log(chalk.gray(`  Environment: ${result.environment || environment}`));
      console.log(chalk.gray(`  Deployed Slot: ${result.slot}`));
      console.log(chalk.gray(`  Port: ${result.port}`));
      console.log(chalk.gray(`  Container: ${result.container}`));

      if (result.previewUrl) {
        console.log(chalk.cyan(`\n  Preview URL: ${result.previewUrl}`));
      }

      if (result.isFirstDeploy) {
        console.log(chalk.green(`\n  ✨ First deploy - auto-promoted to active!`));
        if (result.url) {
          console.log(chalk.cyan(`  Production URL: ${result.url}`));
        }
      } else {
        console.log(chalk.yellow(`\n  📋 Next step: Test preview, then run:`));
        console.log(chalk.cyan(`     we promote ${project}`));
      }

      // Log to deployment history
      await logger.logDeployment({
        project,
        environment,
        result: 'SUCCESS',
        slot: result.slot,
        port: result.port,
        timestamp: new Date().toISOString()
      });

      console.log(chalk.cyan(`\n🎉 Deployment successful!\n`));
      return result;
    } else {
      throw new Error(result.error || 'Deployment failed');
    }

  } catch (error) {
    spinner.fail('Deployment failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));

    // Check if it's an API error
    if (error.message.includes('API') || error.message.includes('fetch')) {
      console.log(chalk.yellow('💡 HTTP API unavailable. Try legacy deployment:'));
      console.log(chalk.gray('     we deploy-legacy <project>'));
    }

    // Log failure
    await logger.logDeployment({
      project,
      environment,
      result: 'FAILED',
      error: error.message,
      timestamp: new Date().toISOString()
    });

    throw error;
  }
}

// Promote slot to active
export async function promote(project, options) {
  const { environment = 'production', slot } = options;

  console.log(chalk.blue.bold(`\n🔄 Promoting Slot\n`));
  console.log(chalk.gray(`Project: ${project}`));
  console.log(chalk.gray(`Environment: ${environment}`));

  const spinner = ora('Switching traffic to new slot...').start();

  try {
    const result = await mcpClient.promote(project, environment, slot);

    if (result.success || result.activeSlot) {
      spinner.succeed('Traffic switched successfully');

      console.log(chalk.green('\n✅ Promotion Summary:'));
      console.log(chalk.gray(`  Active Slot: ${result.activeSlot}`));
      console.log(chalk.gray(`  Previous Slot: ${result.previousSlot}`));
      console.log(chalk.gray(`  Domain: ${result.domain}`));
      console.log(chalk.cyan(`  URL: ${result.url}`));

      if (result.gracePeriod) {
        console.log(chalk.yellow(`\n  ⏰ Grace Period: ${result.gracePeriod.hoursRemaining}h remaining`));
        console.log(chalk.gray(`     Previous slot available for rollback until ${result.gracePeriod.endsAt}`));
      }

      console.log(chalk.cyan(`\n🎉 Promotion complete! Traffic now serving from ${result.activeSlot}.\n`));
      return result;
    } else {
      throw new Error(result.error || 'Promotion failed');
    }

  } catch (error) {
    spinner.fail('Promotion failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    throw error;
  }
}

// Rollback to previous slot
export async function rollback(project, options) {
  const { environment = 'production' } = options;

  console.log(chalk.blue.bold(`\n⏪ Rolling Back\n`));
  console.log(chalk.gray(`Project: ${project}`));
  console.log(chalk.gray(`Environment: ${environment}`));

  const spinner = ora('Rolling back to previous slot...').start();

  try {
    const result = await mcpClient.rollbackBlueGreen(project, environment);

    if (result.success || result.rolledBackTo) {
      spinner.succeed('Rollback completed');

      console.log(chalk.green('\n✅ Rollback Summary:'));
      console.log(chalk.gray(`  Rolled back to: ${result.rolledBackTo}`));
      console.log(chalk.gray(`  Previous active: ${result.previousActive}`));
      console.log(chalk.cyan(`  URL: ${result.url}`));

      console.log(chalk.cyan(`\n🎉 Rollback complete! Traffic now serving from ${result.rolledBackTo}.\n`));
      return result;
    } else {
      throw new Error(result.error || 'Rollback failed');
    }

  } catch (error) {
    spinner.fail('Rollback failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    throw error;
  }
}

// Slot status
export async function slotStatus(project, options) {
  const { environment = 'production' } = options;

  console.log(chalk.blue.bold(`\n📊 Slot Status\n`));

  const spinner = ora('Fetching slot status...').start();

  try {
    const result = await mcpClient.slotStatus(project, environment);

    spinner.succeed('Status retrieved');

    console.log(chalk.gray(`Project: ${result.project || project}`));
    console.log(chalk.gray(`Environment: ${result.environment || environment}`));
    console.log(chalk.gray(`Active Slot: ${result.activeSlot || 'none'}\n`));

    if (result.slots) {
      // Blue slot
      const blue = result.slots.blue;
      console.log(chalk.blue('  🔵 Blue Slot:'));
      if (blue.status === 'empty') {
        console.log(chalk.gray('     Status: empty'));
      } else {
        console.log(chalk.gray(`     Status: ${blue.status}${blue.isActive ? ' (ACTIVE)' : ''}`));
        console.log(chalk.gray(`     Container: ${blue.container || 'N/A'}`));
        console.log(chalk.gray(`     Port: ${blue.port || 'N/A'}`));
        if (blue.gracePeriodRemaining) {
          console.log(chalk.yellow(`     Grace Period: ${blue.gracePeriodRemaining.hours}h ${blue.gracePeriodRemaining.minutes}m remaining`));
        }
      }

      // Green slot
      const green = result.slots.green;
      console.log(chalk.green('\n  🟢 Green Slot:'));
      if (green.status === 'empty') {
        console.log(chalk.gray('     Status: empty'));
      } else {
        console.log(chalk.gray(`     Status: ${green.status}${green.isActive ? ' (ACTIVE)' : ''}`));
        console.log(chalk.gray(`     Container: ${green.container || 'N/A'}`));
        console.log(chalk.gray(`     Port: ${green.port || 'N/A'}`));
        if (green.gracePeriodRemaining) {
          console.log(chalk.yellow(`     Grace Period: ${green.gracePeriodRemaining.hours}h ${green.gracePeriodRemaining.minutes}m remaining`));
        }
      }
    }

    console.log();
    return result;

  } catch (error) {
    spinner.fail('Failed to get status');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    throw error;
  }
}

export async function deploy(project, options) {
  const { environment, file, cache, force, dryRun, skipScan } = options;

  console.log(chalk.blue.bold(`\n🚀 CodeB Deployment\n`));
  console.log(chalk.gray(`Project: ${project || 'current directory'}`));
  console.log(chalk.gray(`Environment: ${environment}`));
  console.log(chalk.gray(`Compose File: ${file}`));
  console.log(chalk.gray(`Cache: ${cache ? 'enabled' : 'disabled'}`));

  if (dryRun) {
    console.log(chalk.yellow('\n⚠️  Dry run mode - no actual deployment\n'));
  }

  // ================================================================
  // STEP 0: Full Pre-Deploy Scan (auto-runs before deploy)
  // ================================================================
  if (!skipScan && !dryRun) {
    // Try to get project name
    let scanProjectName = project;
    if (!scanProjectName) {
      const pkgPath = join(process.cwd(), 'package.json');
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
          scanProjectName = pkg.name;
        } catch (e) { /* ignore */ }
      }
    }

    if (scanProjectName) {
      const scanResult = await fullPreDeployScan(scanProjectName, {
        silent: false
      });

      // Check for critical issues
      const criticalIssues = scanResult.comparison.issues.filter(i => i.severity === 'critical' || i.severity === 'error');

      if (criticalIssues.length > 0 && !force) {
        console.log(chalk.red.bold('\n⛔ Deployment blocked due to critical issues:'));
        for (const issue of criticalIssues) {
          console.log(chalk.red(`   • ${issue.message}`));
          if (issue.fix) console.log(chalk.yellow(`     Fix: ${issue.fix}`));
        }

        const { proceedDeploy } = await inquirer.prompt([{
          type: 'confirm',
          name: 'proceedDeploy',
          message: 'Deploy anyway? (Not recommended)',
          default: false
        }]);

        if (!proceedDeploy) {
          console.log(chalk.gray('\nDeployment cancelled. Fix issues first.'));
          process.exit(0);
        }
      }

      // Warn about mismatched env files
      if (scanResult.comparison.warnings.length > 0 && !force) {
        console.log(chalk.yellow('\n⚠️  Warnings detected. Review before deploying.'));
      }
    }
  }

  const spinner = ora('Validating deployment configuration...').start();

  try {
    // Step 1: Validate environment
    await validateEnvironment(environment);
    spinner.succeed('Environment validated');

    // Step 2: Validate docker-compose file
    spinner.start('Validating docker-compose configuration...');
    const composeValidation = await validateDockerCompose(file);

    if (!composeValidation.valid) {
      spinner.fail('Docker compose validation failed');
      console.log(chalk.red('\nValidation Errors:'));
      composeValidation.errors.forEach(err => {
        console.log(chalk.red(`  • ${err}`));
      });
      process.exit(1);
    }
    spinner.succeed('Docker compose validated');

    // Step 3: Check for warnings
    if (composeValidation.warnings.length > 0 && !force) {
      spinner.warn('Warnings detected');
      console.log(chalk.yellow('\nWarnings:'));
      composeValidation.warnings.forEach(warn => {
        console.log(chalk.yellow(`  ⚠️  ${warn}`));
      });

      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: 'Do you want to proceed with deployment?',
        default: false
      }]);

      if (!proceed) {
        console.log(chalk.gray('\nDeployment cancelled by user'));
        process.exit(0);
      }
    }

    if (dryRun) {
      console.log(chalk.cyan('\n📋 Deployment Plan:'));
      console.log(chalk.gray('  1. Build container images'));
      console.log(chalk.gray(`  2. Push to registry (${environment})`));
      console.log(chalk.gray('  3. Deploy to target servers'));
      console.log(chalk.gray('  4. Run health checks'));
      console.log(chalk.gray('  5. Update routing'));
      console.log(chalk.green('\n✅ Dry run completed\n'));
      return;
    }

    // Step 4: Deploy via MCP
    spinner.start('Deploying via MCP codeb-deploy...');

    const deploymentResult = await mcpClient.deploy(
      project || 'default',
      environment,
      {
        strategy: 'rolling',
        skipHealthcheck: false,
        skipTests: false,
        noCache: !cache,
        force: force
      }
    );

    if (deploymentResult.success) {
      spinner.succeed('Deployment completed successfully');

      console.log(chalk.green('\n✅ Deployment Summary:'));
      console.log(chalk.gray(`  Project: ${deploymentResult.project}`));
      console.log(chalk.gray(`  Version: ${deploymentResult.version}`));
      console.log(chalk.gray(`  Containers: ${deploymentResult.containers}`));
      console.log(chalk.gray(`  URL: ${deploymentResult.url}`));
      console.log(chalk.gray(`  Duration: ${deploymentResult.duration}s`));

      // Log to deployment history
      await logger.logDeployment({
        project,
        environment,
        result: 'SUCCESS',
        version: deploymentResult.version,
        timestamp: new Date().toISOString()
      });

      console.log(chalk.cyan(`\n🎉 Deployment successful!\n`));
    } else {
      throw new Error(deploymentResult.error || 'Deployment failed');
    }

  } catch (error) {
    spinner.fail('Deployment failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));

    // Log failure
    await logger.logDeployment({
      project,
      environment,
      result: 'FAILED',
      error: error.message,
      timestamp: new Date().toISOString()
    });

    console.log(chalk.yellow('💡 Troubleshooting tips:'));
    console.log(chalk.gray('  • Check docker-compose.yml syntax'));
    console.log(chalk.gray('  • Verify network connectivity'));
    console.log(chalk.gray('  • Check server logs: codeb health -v'));
    console.log(chalk.gray('  • Review deployment rules: DEPLOYMENT_RULES.md'));
    console.log();

    process.exit(1);
  }
}
