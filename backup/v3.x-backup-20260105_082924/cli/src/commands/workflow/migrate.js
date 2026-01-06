/**
 * Workflow Migrate Module
 *
 * Migrates existing projects to new CLI structure
 * - Updates Quadlet files to Blue-Green format
 * - Updates GitHub Actions to use MCP API
 * - Generates missing configuration files
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { scanInternal } from './scan.js';
import { generateGitHubActionsWorkflow } from './github-actions.js';
import { generateProjectSet } from './quadlet.js';
import { generateEnvTemplate } from './env-generator.js';

// ============================================================================
// Migrate Workflow
// ============================================================================

/**
 * Migrate existing project to new CLI structure
 * @param {string} projectName - Project name
 * @param {Object} options - Migration options
 */
export async function migrate(projectName, options = {}) {
  const spinner = ora('Preparing migration...').start();

  try {
    if (!projectName) {
      spinner.fail('Project name is required');
      console.log(chalk.yellow('\nUsage: we workflow migrate <project-name>'));
      process.exit(1);
    }

    // First, scan current status
    spinner.text = 'Analyzing current deployment...';
    const scanResult = await scanInternal(projectName, options);

    if (!scanResult.comparison.needsMigration) {
      spinner.succeed('Project is already up to date');
      console.log(chalk.green('\n✅ No migration needed'));
      return;
    }

    spinner.stop();

    // Show migration plan
    console.log(chalk.blue.bold('\n📋 Migration Plan\n'));
    console.log(chalk.gray(`Project: ${projectName}`));
    console.log(chalk.gray(`Issues to fix: ${scanResult.comparison.issues.length}`));

    scanResult.comparison.issues.forEach((issue, i) => {
      console.log(chalk.yellow(`  ${i + 1}. ${issue}`));
    });

    // Confirm migration (skip if --force or --no-interactive)
    if (options.interactive !== false && !options.force) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Proceed with migration?',
        default: true
      }]);

      if (!confirm) {
        console.log(chalk.gray('\nMigration cancelled'));
        return;
      }
    }

    spinner.start('Migrating workflow files...');

    const migratedFiles = [];

    // 1. Get port configuration from server registry
    let serverPorts = null;
    if (scanResult.server.registry?.projects?.[projectName]) {
      serverPorts = scanResult.server.registry.projects[projectName].ports;
    }

    // 2. Build configuration
    const config = buildMigrationConfig(projectName, options, serverPorts);

    // 3. Generate new Quadlet files
    spinner.text = 'Generating new Quadlet files...';

    const productionSet = generateProjectSet({
      projectName: config.projectName,
      environment: 'production',
      ports: {
        app: parseInt(config.productionPort),
        postgres: parseInt(config.productionDbPort),
        redis: parseInt(config.productionRedisPort)
      },
      image: `ghcr.io/\${GITHUB_REPOSITORY_OWNER}/${config.projectName}:latest`,
      useDatabase: config.useDatabase,
      useRedis: config.useRedis,
      dbPassword: config.dbPassword
    });

    const stagingSet = generateProjectSet({
      projectName: config.projectName,
      environment: 'staging',
      ports: {
        app: parseInt(config.stagingPort),
        postgres: parseInt(config.stagingDbPort),
        redis: parseInt(config.stagingRedisPort)
      },
      image: `ghcr.io/\${GITHUB_REPOSITORY_OWNER}/${config.projectName}:staging`,
      useDatabase: config.useDatabase,
      useRedis: config.useRedis,
      dbPassword: config.dbPassword
    });

    // Write Quadlet files
    const quadletDir = 'quadlet';
    await mkdir(quadletDir, { recursive: true });

    for (const [filename, content] of Object.entries(productionSet.quadletFiles)) {
      const filePath = join(quadletDir, filename);
      await writeFile(filePath, content);
      migratedFiles.push(filePath);
    }

    for (const [filename, content] of Object.entries(stagingSet.quadletFiles)) {
      const filePath = join(quadletDir, filename);
      await writeFile(filePath, content);
      migratedFiles.push(filePath);
    }

    // 4. Generate new GitHub Actions workflow
    spinner.text = 'Generating new GitHub Actions workflow...';

    const ghConfig = {
      projectName: config.projectName,
      projectType: config.projectType,
      ports: {
        staging: parseInt(config.stagingPort),
        production: parseInt(config.productionPort)
      },
      domains: {
        staging: options.stagingDomain || `${config.projectName}-staging.codeb.kr`,
        production: options.productionDomain || `${config.projectName}.codeb.kr`
      },
      includeTests: config.includeTests,
      includeLint: config.includeLint,
      useQuadlet: true,
      useMcpApi: true  // Always use MCP API for new migrations
    };

    const ghWorkflow = generateGitHubActionsWorkflow(ghConfig);
    const ghPath = join('.github', 'workflows', 'deploy.yml');
    await mkdir(dirname(ghPath), { recursive: true });
    await writeFile(ghPath, ghWorkflow);
    migratedFiles.push(ghPath);

    // 5. Generate .env.example
    spinner.text = 'Generating environment template...';

    const envTemplate = generateEnvTemplate({
      projectName: config.projectName,
      useDatabase: config.useDatabase,
      useRedis: config.useRedis,
      dbPassword: config.dbPassword,
      environment: 'production'
    });
    const envPath = '.env.example';
    await writeFile(envPath, envTemplate);
    migratedFiles.push(envPath);

    spinner.succeed('Migration completed');

    console.log(chalk.green('\n✅ Migration Complete\n'));
    console.log(chalk.gray('Migrated files:'));
    migratedFiles.forEach(f => console.log(chalk.cyan(`  • ${f}`)));

    console.log(chalk.yellow('\n📋 Next steps:'));
    console.log(chalk.gray('  1. Review generated files'));
    console.log(chalk.gray('  2. Run: we workflow sync ' + projectName));
    console.log(chalk.gray('  3. Commit and push to trigger deployment'));
    console.log();

  } catch (error) {
    spinner.fail('Migration failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build migration configuration from options and server data
 * @param {string} projectName - Project name
 * @param {Object} options - CLI options
 * @param {Object} serverPorts - Port configuration from server
 * @returns {Object} Configuration object
 */
function buildMigrationConfig(projectName, options, serverPorts) {
  return {
    projectName,
    projectType: options.type || 'nextjs',
    // Port configuration - use server values if available
    stagingPort: serverPorts?.staging?.app || options.stagingPort || '3001',
    productionPort: serverPorts?.production?.app || options.productionPort || '4000',
    stagingDbPort: serverPorts?.staging?.postgres || options.stagingDbPort || '5433',
    productionDbPort: serverPorts?.production?.postgres || options.productionDbPort || '5432',
    stagingRedisPort: serverPorts?.staging?.redis || options.stagingRedisPort || '6380',
    productionRedisPort: serverPorts?.production?.redis || options.productionRedisPort || '6379',
    // Feature flags
    useDatabase: options.database !== false,
    useRedis: options.redis !== false,
    dbPassword: options.dbPassword || 'postgres',
    includeTests: options.tests !== false,
    includeLint: options.lint !== false
  };
}

// ============================================================================
// Exports
// ============================================================================

export default {
  migrate
};
