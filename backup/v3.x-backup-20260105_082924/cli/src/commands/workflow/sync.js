/**
 * Sync Module
 *
 * Pushes workflow changes (Quadlet files, ENV files) to server
 *
 * @module workflow/sync
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { writeFile, readFile } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { getServerHost, getServerUser, getDbPassword } from '../../lib/config.js';
import {
  getPodmanVersion,
  validateQuadletContent,
  convertQuadletForCompatibility,
  getVersionInfo
} from '../../lib/quadlet-validator.js';
import { createServerEnvFiles } from './env-generator.js';

/**
 * Push workflow changes to server
 * @param {string} projectName - Project name
 * @param {Object} options - Options
 */
export async function syncWorkflow(projectName, options) {
  const spinner = ora('Preparing to sync...').start();
  const serverHost = options.host || getServerHost();
  const serverUser = options.user || getServerUser();

  try {
    if (!projectName) {
      spinner.fail('Project name is required');
      console.log(chalk.yellow('\nUsage: we workflow sync <project-name>'));
      process.exit(1);
    }

    // Check for local quadlet files
    const quadletDir = 'quadlet';
    if (!existsSync(quadletDir)) {
      spinner.fail('No quadlet directory found');
      console.log(chalk.yellow('\nRun "we workflow init" or "we workflow migrate" first'));
      process.exit(1);
    }

    const quadletFiles = readdirSync(quadletDir).filter(f => f.endsWith('.container'));

    if (quadletFiles.length === 0) {
      spinner.fail('No quadlet files found');
      process.exit(1);
    }

    // Filter files related to the project
    const projectFiles = quadletFiles.filter(f => f.includes(projectName));
    if (projectFiles.length === 0) {
      spinner.fail(`No quadlet files found for project: ${projectName}`);
      console.log(chalk.gray(`Available files: ${quadletFiles.join(', ')}`));
      process.exit(1);
    }

    // Check for local env files
    const localEnvFiles = [];
    const envExamplePath = '.env.example';
    const envLocalPath = '.env.local';
    if (existsSync(envExamplePath)) localEnvFiles.push(envExamplePath);
    if (existsSync(envLocalPath)) localEnvFiles.push(envLocalPath);

    spinner.stop();

    // Show sync plan
    console.log(chalk.blue.bold('\n Sync Plan\n'));
    console.log(chalk.gray(`Server: ${serverUser}@${serverHost}`));
    console.log(chalk.gray(`\nQuadlet files to sync:`));
    projectFiles.forEach(f => console.log(chalk.cyan(`  - ${f}`)));

    if (localEnvFiles.length > 0) {
      console.log(chalk.gray(`\nEnvironment files:`));
      console.log(chalk.cyan(`  - /opt/codeb/envs/${projectName}-production.env`));
      console.log(chalk.cyan(`  - /opt/codeb/envs/${projectName}-staging.env`));
    }

    // Confirm sync
    if (options.interactive !== false && !options.force) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Proceed with sync?',
        default: true
      }]);

      if (!confirm) {
        console.log(chalk.gray('\nSync cancelled'));
        return;
      }
    }

    spinner.start('Checking Podman version on server...');

    const { execSync } = await import('child_process');

    // 0. Check Podman version and validate Quadlet files
    const podmanVersion = await getPodmanVersion(serverHost, serverUser);
    const versionInfo = getVersionInfo(podmanVersion);
    spinner.text = `Server Podman version: ${podmanVersion.full}`;

    // Validate and potentially convert Quadlet files
    let hasConversions = false;
    const convertedFiles = [];

    for (const file of projectFiles) {
      const localPath = join(quadletDir, file);
      const content = await readFile(localPath, 'utf-8');

      // Validate Quadlet content against server's Podman version
      const validation = validateQuadletContent(content, podmanVersion.major);

      if (!validation.valid && validation.unsupportedKeys.length > 0) {
        spinner.stop();
        console.log(chalk.yellow(`\n Quadlet compatibility issues in ${file}:`));
        validation.unsupportedKeys.forEach(({ key, line, alternative }) => {
          console.log(chalk.gray(`   Line ${line}: '${key}' not supported in Podman ${podmanVersion.major}.x`));
          if (alternative) {
            console.log(chalk.gray(`   -> Use: ${alternative}`));
          }
        });

        // Auto-convert for Podman 4.x
        if (podmanVersion.major < 5) {
          const { converted, changes } = convertQuadletForCompatibility(content, podmanVersion.major);
          if (changes.length > 0) {
            console.log(chalk.cyan(`\n   Auto-converting for Podman ${podmanVersion.major}.x compatibility:`));
            changes.forEach(change => console.log(chalk.gray(`   - ${change}`)));

            // Save converted file
            await writeFile(localPath, converted);
            convertedFiles.push({ file, changes });
            hasConversions = true;
          }
        }
        spinner.start('Continuing sync...');
      }
    }

    if (hasConversions) {
      console.log(chalk.green(`\n Auto-converted ${convertedFiles.length} file(s) for Podman ${podmanVersion.major}.x compatibility\n`));
    }

    // Show version recommendation if using older Podman
    if (podmanVersion.major < 5) {
      console.log(chalk.yellow(`\n ${versionInfo.recommendation}`));
      console.log(chalk.gray(`   Current features: ${versionInfo.features.join(', ')}\n`));
    }

    spinner.start('Syncing files to server...');

    // 1. Copy quadlet files to server
    for (const file of projectFiles) {
      const localPath = join(quadletDir, file);
      const remotePath = `/etc/containers/systemd/${file}`;

      spinner.text = `Copying ${file}...`;
      execSync(`scp ${localPath} ${serverUser}@${serverHost}:${remotePath}`, { timeout: 30000 });
    }

    // 2. Sync env files to server
    spinner.text = 'Syncing environment files...';
    try {
      // Read .env.example to extract configuration
      if (existsSync(envExamplePath)) {
        const envContent = await readFile(envExamplePath, 'utf-8');
        const dbPassword = options.dbPassword || getDbPassword() || 'postgres';

        // Create server env files based on .env.example
        await createServerEnvFiles({
          projectName,
          serverHost,
          serverUser,
          useDatabase: envContent.includes('DATABASE_URL'),
          useRedis: envContent.includes('REDIS_URL'),
          dbPassword
        });
      }
    } catch (envError) {
      console.log(chalk.yellow(`\n Could not sync env files: ${envError.message}`));
    }

    // 3. Reload systemd
    spinner.text = 'Reloading systemd daemon...';
    execSync(`ssh ${serverUser}@${serverHost} "systemctl daemon-reload"`, { timeout: 30000 });

    // 4. Restart services (optional)
    if (options.restart) {
      spinner.text = 'Restarting services...';
      for (const file of projectFiles) {
        const serviceName = file.replace('.container', '.service');
        try {
          execSync(`ssh ${serverUser}@${serverHost} "systemctl restart ${serviceName}"`, { timeout: 60000 });
        } catch {
          // Service might not exist yet
        }
      }
    }

    spinner.succeed('Sync completed');

    console.log(chalk.green('\n Sync Complete\n'));
    console.log(chalk.gray('Synced quadlet files:'));
    projectFiles.forEach(f => console.log(chalk.cyan(`  - /etc/containers/systemd/${f}`)));

    console.log(chalk.gray('\nSynced env files:'));
    console.log(chalk.cyan(`  - /opt/codeb/envs/${projectName}-production.env`));
    console.log(chalk.cyan(`  - /opt/codeb/envs/${projectName}-staging.env`));

    console.log(chalk.yellow('\n Next steps:'));
    if (!options.restart) {
      console.log(chalk.gray('  To start/restart services:'));
      projectFiles.forEach(f => {
        const serviceName = f.replace('.container', '.service');
        console.log(chalk.cyan(`    systemctl restart ${serviceName}`));
      });
    }
    console.log(chalk.gray('\n  Or push to GitHub to trigger CI/CD deployment'));
    console.log();

  } catch (error) {
    spinner.fail('Sync failed');
    console.log(chalk.red(`\n Error: ${error.message}\n`));
    process.exit(1);
  }
}
