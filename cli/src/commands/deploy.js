/**
 * Deploy Command
 *
 * Handles project deployment with MCP codeb-deploy integration
 * Supports: staging, production, preview environments
 *
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
