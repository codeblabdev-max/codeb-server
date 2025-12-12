/**
 * Deploy Command
 *
 * Handles project deployment with MCP codeb-deploy integration
 * Supports: staging, production, preview environments
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { mcpClient } from '../lib/mcp-client.js';
import { logger } from '../lib/logger.js';
import { validateEnvironment, validateDockerCompose } from '../lib/validators.js';

export async function deploy(project, options) {
  const { environment, file, cache, force, dryRun } = options;

  console.log(chalk.blue.bold(`\n🚀 CodeB Deployment\n`));
  console.log(chalk.gray(`Project: ${project || 'current directory'}`));
  console.log(chalk.gray(`Environment: ${environment}`));
  console.log(chalk.gray(`Compose File: ${file}`));
  console.log(chalk.gray(`Cache: ${cache ? 'enabled' : 'disabled'}`));

  if (dryRun) {
    console.log(chalk.yellow('\n⚠️  Dry run mode - no actual deployment\n'));
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

    const deploymentResult = await mcpClient.deployComposeProject({
      projectName: project || 'default',
      environment: environment,
      composePath: file,
      options: {
        noCache: !cache,
        force: force
      }
    });

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
