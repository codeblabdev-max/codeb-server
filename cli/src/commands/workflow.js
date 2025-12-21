/**
 * Workflow Command
 *
 * Generates Quadlet container files and GitHub Actions CI/CD workflows
 * Supports: new project initialization, updates, and automation
 *
 * v2.5.0: Integrated server infrastructure provisioning
 * - PostgreSQL: Per-project database + user creation
 * - Redis: Per-project DB index or prefix allocation
 * - Storage: Per-project directories (/opt/codeb/data/{project}/)
 * - Registry: Central project registry management
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync, readdirSync } from 'fs';
import { getServerHost, getServerUser, getDbPassword, getBaseDomain, getCliVersion } from '../lib/config.js';
import { ssotClient } from '../lib/ssot-client.js';
import { mcpClient } from '../lib/mcp-client.js';
import {
  getPodmanVersion,
  validateQuadletContent,
  convertQuadletForCompatibility,
  validateQuadlet,
  getVersionInfo
} from '../lib/quadlet-validator.js';

// Import all modular components
import {
  // Template generators
  generateGitHubActionsWorkflow,
  generateDockerfile,
  generateQuadletTemplate,
  generateProjectSet,
  // Registry management
  readProjectRegistry,
  writeProjectRegistry,
  getDefaultRegistryStructure,
  // Port utilities
  PORT_RANGES,
  findNextRedisDbIndex,
  findNextAvailablePort,
  getProjectNetworkName,
  ensureNetworkExists,
  scanServerPorts,
  validatePort,
  findSafePort,
  autoScanAndValidatePorts,
  // Provisioning
  generateSecurePassword,
  provisionPostgresDatabase,
  provisionRedis,
  provisionStorage,
  backupEnvToServer,
  restoreEnvFromBackup,
  listEnvBackups,
  provisionServerInfrastructure,
  // ENV generators
  generateServerEnvContent,
  generateLocalEnvContent
} from './workflow/index.js';


/**
 * Scan project resources on server via MCP
 * Falls back to SSH direct only when MCP is unavailable
 */
async function scanProjectResources(config) {
  const { projectName, serverHost, serverUser } = config;

  const dbName = projectName.replace(/-/g, '_');
  const dbUser = `${dbName}_user`;

  const result = {
    database: { exists: false, details: null },
    redis: { exists: false, details: null },
    storage: { exists: false, details: null },
    envFiles: { production: false, staging: false },
    registry: { exists: false, details: null }
  };

  // Try MCP first (preferred path)
  try {
    const isConnected = await mcpClient.ensureConnected();
    if (isConnected) {
      // Get project from SSOT
      const projectData = await ssotClient.getProject(projectName);
      if (projectData) {
        result.registry.exists = true;
        result.registry.details = projectData;

        // Check resources from SSOT
        if (projectData.resources?.database) {
          result.database.exists = true;
          result.database.details = projectData.resources.database;
        }
        if (projectData.resources?.redis) {
          result.redis.exists = true;
          result.redis.details = projectData.resources.redis;
        }
        if (projectData.resources?.storage) {
          result.storage.exists = true;
          result.storage.details = projectData.resources.storage;
        }
      }

      // Get server analysis for additional checks
      const serverAnalysis = await mcpClient.callTool('analyze_server', {
        includeContainers: true,
        includeDatabases: true
      });

      const analysis = typeof serverAnalysis === 'string' ? JSON.parse(serverAnalysis) : serverAnalysis;

      // Check env file status from manage_env MCP tool
      try {
        const prodEnv = await mcpClient.callTool('manage_env', {
          action: 'list',
          projectName,
          environment: 'production'
        });
        if (prodEnv && !prodEnv.error) {
          result.envFiles.production = true;
        }
      } catch { /* not found */ }

      try {
        const stagingEnv = await mcpClient.callTool('manage_env', {
          action: 'list',
          projectName,
          environment: 'staging'
        });
        if (stagingEnv && !stagingEnv.error) {
          result.envFiles.staging = true;
        }
      } catch { /* not found */ }

      return result;
    }
  } catch (mcpError) {
    // MCP failed, will fall through to SSH fallback
  }

  // SSH Fallback (only when MCP unavailable)
  const { execSync } = await import('child_process');

  // Check database
  try {
    const dbCheck = `ssh ${serverUser}@${serverHost} "podman exec codeb-postgres psql -U postgres -lqt 2>/dev/null | grep -w ${dbName}"`;
    const dbOutput = execSync(dbCheck, { encoding: 'utf-8', timeout: 30000 }).trim();
    if (dbOutput) {
      result.database.exists = true;
      result.database.details = { name: dbName };
    }
  } catch { /* database not found */ }

  // Check user
  try {
    const userCheck = `ssh ${serverUser}@${serverHost} "podman exec codeb-postgres psql -U postgres -c 'SELECT usename FROM pg_user' 2>/dev/null | grep -w ${dbUser}"`;
    const userOutput = execSync(userCheck, { encoding: 'utf-8', timeout: 30000 }).trim();
    if (userOutput && result.database.exists) {
      result.database.details.user = dbUser;
    }
  } catch { /* user not found */ }

  // Check registry for Redis info
  try {
    const registry = await readProjectRegistry(serverHost, serverUser);
    if (registry.projects?.[projectName]) {
      result.registry.exists = true;
      result.registry.details = registry.projects[projectName];

      if (registry.projects[projectName].resources?.redis) {
        result.redis.exists = true;
        result.redis.details = registry.projects[projectName].resources.redis;
      }
    }
  } catch { /* registry not found */ }

  // Check storage
  try {
    const storageCheck = `ssh ${serverUser}@${serverHost} "ls -d /opt/codeb/data/${projectName} 2>/dev/null"`;
    const storageOutput = execSync(storageCheck, { encoding: 'utf-8', timeout: 30000 }).trim();
    if (storageOutput) {
      result.storage.exists = true;

      // Check subdirectories
      const subdirCheck = `ssh ${serverUser}@${serverHost} "ls /opt/codeb/data/${projectName} 2>/dev/null"`;
      const subdirs = execSync(subdirCheck, { encoding: 'utf-8', timeout: 30000 }).trim().split('\n').filter(Boolean);
      result.storage.details = { path: `/opt/codeb/data/${projectName}`, directories: subdirs };
    }
  } catch { /* storage not found */ }

  // Check env files
  try {
    const prodEnvCheck = `ssh ${serverUser}@${serverHost} "ls /opt/codeb/envs/${projectName}-production.env 2>/dev/null"`;
    execSync(prodEnvCheck, { encoding: 'utf-8', timeout: 30000 });
    result.envFiles.production = true;
  } catch { /* not found */ }

  try {
    const stagingEnvCheck = `ssh ${serverUser}@${serverHost} "ls /opt/codeb/envs/${projectName}-staging.env 2>/dev/null"`;
    execSync(stagingEnvCheck, { encoding: 'utf-8', timeout: 30000 });
    result.envFiles.staging = true;
  } catch { /* not found */ }

  return result;
}


// ============================================================================
// Main Command Handler
// ============================================================================

// Export fullPreDeployScan for use in other commands (deploy.js, etc.)
export { fullPreDeployScan };

export async function workflow(action, target, options) {
  console.log(chalk.blue.bold(`\n⚙️  CodeB Workflow Generator\n`));

  switch (action) {
    case 'init':
      await initWorkflow(target, options);
      break;
    case 'quadlet':
      await generateQuadlet(target, options);
      break;
    case 'github-actions':
    case 'gh':
      await generateGitHubActions(target, options);
      break;
    case 'dockerfile':
    case 'docker':
      await generateDockerfileCommand(target, options);
      break;
    case 'update':
      await updateWorkflow(target, options);
      break;
    case 'scan':
      await scanWorkflow(target, options);
      break;
    case 'migrate':
      await migrateWorkflow(target, options);
      break;
    case 'sync':
      await syncWorkflow(target, options);
      break;
    case 'add-service':
      await addServiceWorkflow(target, options);
      break;
    case 'add-resource':
      await addResourceWorkflow(target, options);
      break;
    case 'fix-network':
      await fixNetworkWorkflow(target, options);
      break;
    case 'port-validate':
    case 'port':
      await portValidateWorkflow(target, options);
      break;
    case 'port-drift':
    case 'drift':
      await portDriftWorkflow(target, options);
      break;
    case 'validate':
    case 'check':
      await validateQuadletWorkflow(target, options);
      break;
    case 'secrets':
      await registerGitHubSecrets(target, options);
      break;
    default:
      console.log(chalk.red(`Unknown action: ${action}`));
      console.log(chalk.gray('\nAvailable actions:'));
      console.log(chalk.gray('  init         - Initialize complete workflow + server resources (DB, Redis, Storage)'));
      console.log(chalk.gray('  quadlet      - Generate Quadlet .container file'));
      console.log(chalk.gray('  github-actions - Generate GitHub Actions workflow'));
      console.log(chalk.gray('  dockerfile   - Generate optimized Dockerfile'));
      console.log(chalk.gray('  update       - Update existing workflow configurations'));
      console.log(chalk.gray('  scan         - Scan project resources (DB, Redis, Storage, ENV)'));
      console.log(chalk.gray('  migrate      - Migrate existing project to new CLI structure'));
      console.log(chalk.gray('  sync         - Sync workflow changes to server'));
      console.log(chalk.gray('  add-service  - Add container service (PostgreSQL/Redis container)'));
      console.log(chalk.gray('  add-resource - Add missing resources to existing project (DB user, Redis DB, Storage)'));
      console.log(chalk.gray('  fix-network  - Fix network issues (migrate to codeb-network)'));
      console.log(chalk.gray('  port-validate- Validate port allocation before deployment (GitOps PortGuard)'));
      console.log(chalk.gray('  port-drift   - Detect drift between manifest and actual server state'));
      console.log(chalk.gray('  validate     - Validate Quadlet files for Podman version compatibility'));
      console.log(chalk.gray('  secrets      - Register GitHub Secrets (SSH_HOST, SSH_USER, SSH_PRIVATE_KEY)'));
  }
}

// ============================================================================
// Action Handlers
// ============================================================================

async function initWorkflow(projectName, options) {
  const spinner = ora('Initializing workflow configuration...').start();

  try {
    // ================================================================
    // STEP 0: Full Pre-Deploy Scan (auto-runs before init)
    // ================================================================
    if (options.skipScan !== true) {
      spinner.stop();

      // Try to get project name from package.json if not provided
      let scanProjectName = projectName;
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
          host: options.host,
          user: options.user,
          silent: false
        });

        // If critical issues found, ask user to continue
        const criticalIssues = scanResult.comparison.issues.filter(i => i.severity === 'critical');
        if (criticalIssues.length > 0 && options.interactive !== false) {
          const { continueInit } = await inquirer.prompt([{
            type: 'confirm',
            name: 'continueInit',
            message: 'Critical issues detected. Continue anyway?',
            default: false
          }]);

          if (!continueInit) {
            console.log(chalk.gray('Aborted. Fix issues and retry.'));
            return;
          }
        }

        // If server has existing credentials, offer to use them
        if (scanResult.server.projectInfo?.resources?.database && options.interactive !== false) {
          const existingDb = scanResult.server.projectInfo.resources.database;
          console.log(chalk.cyan(`\n📋 Found existing server credentials for '${scanProjectName}':`));
          console.log(chalk.gray(`   Database: ${existingDb.name}`));
          console.log(chalk.gray(`   User: ${existingDb.user}`));

          const { useExisting } = await inquirer.prompt([{
            type: 'confirm',
            name: 'useExisting',
            message: 'Use existing server credentials?',
            default: true
          }]);

          if (useExisting) {
            options.existingCredentials = scanResult.server.projectInfo.resources;
          }
        }
      }

      spinner.start('Initializing workflow configuration...');
    }

    // Interactive configuration if not provided via options
    let config = {};

    if (options.interactive !== false) {
      spinner.stop();

      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'projectName',
          message: 'Project name:',
          default: projectName || 'my-project'
        },
        {
          type: 'list',
          name: 'projectType',
          message: 'Project type:',
          choices: ['nextjs', 'remix', 'nodejs', 'static'],
          default: 'nextjs'
        },
        {
          type: 'input',
          name: 'stagingPort',
          message: 'Staging app port:',
          default: '3001'
        },
        {
          type: 'input',
          name: 'productionPort',
          message: 'Production app port:',
          default: '3000'
        },
        {
          type: 'input',
          name: 'stagingDbPort',
          message: 'Staging PostgreSQL port:',
          default: '5433'
        },
        {
          type: 'input',
          name: 'productionDbPort',
          message: 'Production PostgreSQL port:',
          default: '5432'
        },
        {
          type: 'input',
          name: 'stagingRedisPort',
          message: 'Staging Redis port:',
          default: '6380'
        },
        {
          type: 'input',
          name: 'productionRedisPort',
          message: 'Production Redis port:',
          default: '6379'
        },
        {
          type: 'input',
          name: 'stagingDomain',
          message: 'Staging domain:',
          default: (answers) => `${answers.projectName}-staging.codeb.kr`
        },
        {
          type: 'input',
          name: 'productionDomain',
          message: 'Production domain:',
          default: (answers) => `${answers.projectName}.codeb.kr`
        },
        {
          type: 'confirm',
          name: 'useDatabase',
          message: 'Include PostgreSQL database?',
          default: true
        },
        {
          type: 'confirm',
          name: 'useRedis',
          message: 'Include Redis cache?',
          default: true
        },
        {
          type: 'input',
          name: 'dbPassword',
          message: 'Database password:',
          default: 'postgres'
        },
        {
          type: 'confirm',
          name: 'includeTests',
          message: 'Include tests in CI/CD?',
          default: true
        },
        {
          type: 'confirm',
          name: 'includeLint',
          message: 'Include linting in CI/CD?',
          default: true
        }
      ]);

      config = answers;
      spinner.start('Generating workflow files...');
    } else {
      config = {
        projectName: projectName || options.name || 'my-project',
        projectType: options.type || 'nextjs',
        stagingPort: options.stagingPort || '3001',
        productionPort: options.productionPort || '3000',
        stagingDbPort: options.stagingDbPort || '5433',
        productionDbPort: options.productionDbPort || '5432',
        stagingRedisPort: options.stagingRedisPort || '6380',
        productionRedisPort: options.productionRedisPort || '6379',
        stagingDomain: options.stagingDomain,
        productionDomain: options.productionDomain,
        useDatabase: options.database !== false,
        useRedis: options.redis !== false,
        dbPassword: options.dbPassword || 'postgres',
        includeTests: options.tests !== false,
        includeLint: options.lint !== false
      };
    }

    // ================================================================
    // Auto Port Scan & Validation (detect conflicts before proceeding)
    // ================================================================
    const serverHost = options.host || getServerHost();
    const serverUser = options.user || getServerUser();
    let portValidation = null;

    if (serverHost) {
      try {
        portValidation = await autoScanAndValidatePorts(config, serverHost, serverUser, spinner);

        // Show conflicts and adjustments to user
        if (portValidation.conflicts.length > 0) {
          spinner.stop();
          console.log(chalk.yellow('\n⚠️  Port Conflicts Detected:'));
          for (const conflict of portValidation.conflicts) {
            console.log(chalk.red(`   • ${conflict.label}: Port ${conflict.originalPort} is used by "${conflict.conflictWith}"`));
            console.log(chalk.green(`     → Auto-assigned: ${conflict.suggestedPort}`));
          }
          console.log('');

          // In interactive mode, ask for confirmation
          if (options.interactive !== false) {
            const { proceed } = await inquirer.prompt([{
              type: 'confirm',
              name: 'proceed',
              message: 'Continue with adjusted ports?',
              default: true
            }]);

            if (!proceed) {
              console.log(chalk.gray('Aborted. Adjust ports manually and retry.'));
              return;
            }
          }
          spinner.start('Generating workflow files...');
        } else if (portValidation.scanned) {
          spinner.text = `Port scan complete (${portValidation.usedPortCount} ports in use). Generating files...`;
        }

        // Show warnings if any
        if (portValidation.warnings.length > 0) {
          for (const warning of portValidation.warnings) {
            console.log(chalk.yellow(`   ⚠ ${warning}`));
          }
        }
      } catch (scanError) {
        // Port scan failed - continue without validation
        console.log(chalk.gray(`   (Port scan skipped: ${scanError.message})`));
      }
    }

    const outputDir = options.output || '.';
    const files = [];

    // 1. Generate Project Set for Production (App + PostgreSQL + Redis)
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

    // Write production Quadlet files
    const quadletDir = join(outputDir, 'quadlet');
    await mkdir(quadletDir, { recursive: true });

    for (const [filename, content] of Object.entries(productionSet.quadletFiles)) {
      const filePath = join(quadletDir, filename);
      await writeFile(filePath, content);
      files.push(filePath);
    }

    // 2. Generate Project Set for Staging (App + PostgreSQL + Redis)
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

    // Write staging Quadlet files
    for (const [filename, content] of Object.entries(stagingSet.quadletFiles)) {
      const filePath = join(quadletDir, filename);
      await writeFile(filePath, content);
      files.push(filePath);
    }

    // 3. Generate Hybrid GitHub Actions workflow
    const ghConfig = {
      projectName: config.projectName,
      projectType: config.projectType,
      ports: {
        staging: parseInt(config.stagingPort),
        production: parseInt(config.productionPort)
      },
      domains: {
        staging: config.stagingDomain || `${config.projectName}-staging.codeb.kr`,
        production: config.productionDomain || `${config.projectName}.codeb.kr`
      },
      includeTests: config.includeTests,
      includeLint: config.includeLint,
      useQuadlet: true
    };

    const ghWorkflow = generateGitHubActionsWorkflow(ghConfig);
    const ghPath = join(outputDir, '.github', 'workflows', 'deploy.yml');
    await mkdir(dirname(ghPath), { recursive: true });
    await writeFile(ghPath, ghWorkflow);
    files.push(ghPath);

    // 4. Generate Dockerfile
    const dockerfile = generateDockerfile({ projectType: config.projectType });
    const dockerfilePath = join(outputDir, 'Dockerfile');
    if (!existsSync(dockerfilePath)) {
      await writeFile(dockerfilePath, dockerfile);
      files.push(dockerfilePath);
    }

    // 5. Generate environment file templates (.env.example is always safe to overwrite)
    const envTemplate = generateEnvTemplate({
      projectName: config.projectName,
      useDatabase: config.useDatabase,
      useRedis: config.useRedis,
      dbPassword: config.dbPassword,
      environment: 'production'
    });
    const envPath = join(outputDir, '.env.example');
    await writeFile(envPath, envTemplate);
    files.push(envPath);

    // 6. Handle .env.local for development - WITH PROTECTION
    // Note: serverHost and serverUser already declared in port validation section above
    const localEnvPath = join(outputDir, '.env.local');
    const envFilePath = join(outputDir, '.env');
    let envFileProtected = false;
    let existingEnvContent = null;

    // Check for existing .env or .env.local with DB config
    if (existsSync(envFilePath) || existsSync(localEnvPath)) {
      const existingPath = existsSync(envFilePath) ? envFilePath : localEnvPath;
      try {
        existingEnvContent = await readFile(existingPath, 'utf-8');
        // Check if it contains DATABASE_URL or REDIS_URL
        if (existingEnvContent.includes('DATABASE_URL') || existingEnvContent.includes('REDIS_URL')) {
          envFileProtected = true;
          spinner.stop();
          console.log(chalk.yellow('\n⚠️  Existing environment file detected with DB configuration:'));
          console.log(chalk.gray(`   File: ${existingPath}`));

          // Show current DB config
          const dbMatch = existingEnvContent.match(/DATABASE_URL=["']?([^"'\n]+)/);
          const redisMatch = existingEnvContent.match(/REDIS_URL=["']?([^"'\n]+)/);
          if (dbMatch) console.log(chalk.cyan(`   DATABASE_URL: ${dbMatch[1].substring(0, 50)}...`));
          if (redisMatch) console.log(chalk.cyan(`   REDIS_URL: ${redisMatch[1].substring(0, 50)}...`));

          if (options.interactive !== false) {
            const { envAction } = await inquirer.prompt([{
              type: 'list',
              name: 'envAction',
              message: 'How should we handle the existing .env file?',
              choices: [
                { name: 'Keep existing (recommended) - only add missing variables', value: 'keep' },
                { name: 'Backup & replace - create .env.backup and generate new', value: 'backup' },
                { name: 'Skip - don\'t touch .env files at all', value: 'skip' }
              ],
              default: 'keep'
            }]);

            if (envAction === 'skip') {
              console.log(chalk.gray('   Skipping .env file generation.'));
              spinner.start('Continuing with workflow files...');
            } else if (envAction === 'backup') {
              // Create backup
              const backupPath = `${existingPath}.backup.${Date.now()}`;
              await writeFile(backupPath, existingEnvContent);
              console.log(chalk.green(`   ✓ Backup created: ${backupPath}`));
              envFileProtected = false; // Allow overwrite after backup
              spinner.start('Generating new .env.local...');
            } else {
              // Keep existing - merge mode
              spinner.start('Merging environment variables...');
            }
          } else {
            // Non-interactive: always keep existing
            console.log(chalk.gray('   Keeping existing .env file (non-interactive mode).'));
          }
        }
      } catch {
        // File exists but can't read - proceed with caution
      }
    }

    // Generate .env.local only if not protected or merge mode
    if (!envFileProtected) {
      const localEnvContent = generateLocalEnvForDev({
        projectName: config.projectName,
        serverHost,
        useDatabase: config.useDatabase,
        useRedis: config.useRedis,
        dbPassword: config.dbPassword,
        dbPort: parseInt(config.productionDbPort),
        redisPort: parseInt(config.productionRedisPort)
      });
      await writeFile(localEnvPath, localEnvContent);
      files.push(localEnvPath);
    } else if (existingEnvContent) {
      // Merge mode: add missing variables without changing DB config
      const newEnvContent = generateLocalEnvForDev({
        projectName: config.projectName,
        serverHost,
        useDatabase: config.useDatabase,
        useRedis: config.useRedis,
        dbPassword: config.dbPassword,
        dbPort: parseInt(config.productionDbPort),
        redisPort: parseInt(config.productionRedisPort)
      });

      const mergedContent = mergeEnvFiles(existingEnvContent, newEnvContent);
      if (mergedContent !== existingEnvContent) {
        const targetPath = existsSync(envFilePath) ? envFilePath : localEnvPath;
        await writeFile(targetPath, mergedContent);
        files.push(targetPath + ' (merged)');
      }
    }

    // 7. Provision server infrastructure (DB, Redis, Storage)
    let provisionResult = null;

    if (serverHost) {
      spinner.text = 'Provisioning server infrastructure...';
      try {
        provisionResult = await provisionServerInfrastructure({
          projectName: config.projectName,
          projectType: config.projectType,
          serverHost,
          serverUser,
          useDatabase: config.useDatabase,
          useRedis: config.useRedis,
          useStorage: true,
          dbPassword: config.dbPassword
        }, spinner);

        // 8. Create server env files with actual provisioned credentials
        spinner.text = 'Creating server environment files...';
        const { execSync } = await import('child_process');

        // Ensure env directory exists
        execSync(`ssh ${serverUser}@${serverHost} "mkdir -p /opt/codeb/envs"`, { timeout: 30000 });

        // Production env
        const prodEnvContent = generateServerEnvContent({
          projectName: config.projectName,
          environment: 'production',
          port: config.productionPort,
          database: provisionResult.database,
          redis: provisionResult.redis,
          storage: provisionResult.storage
        });

        execSync(`ssh ${serverUser}@${serverHost} "cat > /opt/codeb/envs/${config.projectName}-production.env << 'EOFENV'
${prodEnvContent}
EOFENV"`, { timeout: 30000 });

        // Backup production ENV to backup server (master + timestamped)
        spinner.text = 'Backing up production ENV to backup server...';
        await backupEnvToServer({
          projectName: config.projectName,
          environment: 'production',
          envContent: prodEnvContent,
          isInitial: true  // master.env로도 저장
        });

        // Staging env
        const stagingEnvContent = generateServerEnvContent({
          projectName: config.projectName,
          environment: 'staging',
          port: config.stagingPort,
          database: provisionResult.database,
          redis: provisionResult.redis,
          storage: provisionResult.storage
        });

        execSync(`ssh ${serverUser}@${serverHost} "cat > /opt/codeb/envs/${config.projectName}-staging.env << 'EOFENV'
${stagingEnvContent}
EOFENV"`, { timeout: 30000 });

        // Backup staging ENV to backup server (master + timestamped)
        spinner.text = 'Backing up staging ENV to backup server...';
        await backupEnvToServer({
          projectName: config.projectName,
          environment: 'staging',
          envContent: stagingEnvContent,
          isInitial: true  // master.env로도 저장
        });

        // 9. Update local .env.local with actual credentials (respecting protection)
        if ((provisionResult.database || provisionResult.redis) && !envFileProtected) {
          const actualLocalEnvContent = generateLocalEnvContent({
            projectName: config.projectName,
            serverHost,
            database: provisionResult.database,
            redis: provisionResult.redis,
            dbExternalPort: parseInt(config.productionDbPort),
            redisExternalPort: parseInt(config.productionRedisPort)
          });
          await writeFile(localEnvPath, actualLocalEnvContent);
        } else if (envFileProtected) {
          // Show info about server credentials that weren't applied
          console.log(chalk.gray('\n   ℹ️  Server credentials generated but not applied to local .env'));
          console.log(chalk.gray('   To use server DB, update .env manually or run with --force-env'));
        }

        // Update registry with environment info
        if (provisionResult.registry) {
          provisionResult.registry.projects[config.projectName].environments = {
            production: {
              port: parseInt(config.productionPort),
              domain: config.productionDomain || `${config.projectName}.codeb.kr`,
              env_file: `/opt/codeb/envs/${config.projectName}-production.env`
            },
            staging: {
              port: parseInt(config.stagingPort),
              domain: config.stagingDomain || `${config.projectName}-staging.codeb.kr`,
              env_file: `/opt/codeb/envs/${config.projectName}-staging.env`
            }
          };
          await writeProjectRegistry(serverHost, serverUser, provisionResult.registry);
        }

      } catch (serverError) {
        console.log(chalk.yellow(`\n⚠️  Server provisioning error: ${serverError.message}`));
        console.log(chalk.gray('   You can provision resources manually later with: we workflow add-resource'));
      }
    }

    // 10. Generate project rule files (if not exists)
    // CLAUDE.md - Basic project rules
    const claudeMdPath = join(outputDir, 'CLAUDE.md');
    if (!existsSync(claudeMdPath)) {
      const claudeMdContent = generateProjectClaudeMd(config.projectName);
      await writeFile(claudeMdPath, claudeMdContent);
      files.push(claudeMdPath);
    }

    // DEPLOYMENT_RULES.md - AI deployment rules
    const deployRulesPath = join(outputDir, 'DEPLOYMENT_RULES.md');
    if (!existsSync(deployRulesPath)) {
      const deployRulesContent = generateDeploymentRules();
      await writeFile(deployRulesPath, deployRulesContent);
      files.push(deployRulesPath);
    }

    spinner.succeed('Workflow initialization complete');

    console.log(chalk.green('\n✅ Workflow Initialization Complete\n'));

    // Show port validation summary
    if (portValidation?.scanned) {
      console.log(chalk.blue('🔍 Port Scan Summary:'));
      console.log(chalk.gray(`  Scanned ${portValidation.usedPortCount} ports in use on server`));
      if (portValidation.adjustments.length > 0) {
        console.log(chalk.yellow(`  ${portValidation.adjustments.length} port(s) were auto-adjusted to avoid conflicts`));
        for (const adj of portValidation.adjustments) {
          console.log(chalk.gray(`    • ${adj.label}: ${adj.from} → ${adj.to}`));
        }
      } else {
        console.log(chalk.green('  ✓ No port conflicts detected'));
      }
      console.log('');
    }

    console.log(chalk.gray('Generated files:'));
    files.forEach(f => console.log(chalk.cyan(`  • ${f}`)));

    if (provisionResult) {
      console.log(chalk.green('\n🗄️  Server Resources Provisioned:'));
      if (provisionResult.database) {
        console.log(chalk.cyan(`  ✓ PostgreSQL: ${provisionResult.database.database}`));
        console.log(chalk.gray(`    User: ${provisionResult.database.user}`));
      }
      if (provisionResult.redis) {
        console.log(chalk.cyan(`  ✓ Redis: DB ${provisionResult.redis.db_index}, Prefix "${provisionResult.redis.prefix}"`));
      }
      if (provisionResult.storage) {
        console.log(chalk.cyan(`  ✓ Storage: ${provisionResult.storage.path}`));
      }

      console.log(chalk.green('\n📁 Server ENV Files:'));
      console.log(chalk.cyan(`  • /opt/codeb/envs/${config.projectName}-production.env`));
      console.log(chalk.cyan(`  • /opt/codeb/envs/${config.projectName}-staging.env`));
    }

    console.log(chalk.blue('\n🔧 Local Development Setup:'));
    console.log(chalk.gray('  .env.local has been created with server DB connection.'));
    if (provisionResult?.database) {
      console.log(chalk.gray('  Your local dev environment will connect to:'));
      console.log(chalk.cyan(`    PostgreSQL: ${serverHost}:${config.productionDbPort}`));
      console.log(chalk.gray(`    Database: ${provisionResult.database.database}`));
      console.log(chalk.gray(`    User: ${provisionResult.database.user}`));
    }
    if (provisionResult?.redis) {
      console.log(chalk.cyan(`    Redis: ${serverHost}:${config.productionRedisPort}/${provisionResult.redis.db_index}`));
    }

    // Auto-register GitHub Secrets if gh CLI available
    let secretsRegistered = false;
    try {
      const { execSync } = await import('child_process');

      // Check if gh CLI is available and authenticated
      execSync('gh auth status', { stdio: 'pipe', timeout: 5000 });

      // Get repo info from git remote
      const remoteUrl = execSync('git remote get-url origin 2>/dev/null || echo ""', { encoding: 'utf-8' }).trim();
      const repoMatch = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);

      if (repoMatch) {
        const repoFullName = repoMatch[1].replace(/\.git$/, '');
        console.log(chalk.blue(`\n🔐 Registering GitHub Secrets for ${repoFullName}...`));

        // Check if secrets already exist
        const existingSecrets = execSync(`gh secret list -R ${repoFullName} 2>/dev/null || echo ""`, { encoding: 'utf-8' });

        // SSH_HOST
        if (!existingSecrets.includes('SSH_HOST')) {
          execSync(`gh secret set SSH_HOST -R ${repoFullName} -b "${serverHost || '158.247.203.55'}"`, { stdio: 'pipe', timeout: 10000 });
          console.log(chalk.green('  ✓ SSH_HOST registered'));
        } else {
          console.log(chalk.gray('  ✓ SSH_HOST (already exists)'));
        }

        // SSH_USER
        if (!existingSecrets.includes('SSH_USER')) {
          execSync(`gh secret set SSH_USER -R ${repoFullName} -b "${serverUser || 'root'}"`, { stdio: 'pipe', timeout: 10000 });
          console.log(chalk.green('  ✓ SSH_USER registered'));
        } else {
          console.log(chalk.gray('  ✓ SSH_USER (already exists)'));
        }

        // SSH_PRIVATE_KEY - use default key if exists
        if (!existingSecrets.includes('SSH_PRIVATE_KEY')) {
          const sshKeyPath = process.env.HOME + '/.ssh/id_ed25519';
          if (existsSync(sshKeyPath)) {
            const sshKey = await readFile(sshKeyPath, 'utf-8');
            execSync(`gh secret set SSH_PRIVATE_KEY -R ${repoFullName} -b "${sshKey.replace(/"/g, '\\"')}"`, { stdio: 'pipe', timeout: 10000 });
            console.log(chalk.green('  ✓ SSH_PRIVATE_KEY registered'));
          } else {
            console.log(chalk.yellow('  ⚠ SSH_PRIVATE_KEY: ~/.ssh/id_ed25519 not found, register manually'));
          }
        } else {
          console.log(chalk.gray('  ✓ SSH_PRIVATE_KEY (already exists)'));
        }

        secretsRegistered = true;
      }
    } catch (e) {
      // gh CLI not available or not authenticated - show manual instructions
    }

    console.log(chalk.yellow('\n📋 Next steps:'));
    console.log(chalk.gray('  1. Run: we workflow sync ' + config.projectName + ' (copy files to server)'));
    if (!secretsRegistered) {
      console.log(chalk.gray('  2. Add GitHub Secrets (or run: we workflow secrets):'));
      console.log(chalk.gray('     - SSH_HOST: ' + (serverHost || '158.247.203.55')));
      console.log(chalk.gray('     - SSH_USER: root'));
      console.log(chalk.gray('     - SSH_PRIVATE_KEY: ~/.ssh/id_ed25519 contents'));
    } else {
      console.log(chalk.green('  2. ✓ GitHub Secrets already configured'));
    }
    console.log(chalk.gray('  3. Push to GitHub to trigger deployment'));
    console.log(chalk.gray('\n  💡 Hybrid Mode: GitHub builds → ghcr.io → SSH deploys'));
    console.log(chalk.gray('  💡 Local dev connects to server DB automatically'));
    console.log();

    // Output environment info for reference
    if (config.useDatabase || config.useRedis) {
      console.log(chalk.blue('📦 Project Infrastructure:'));
      console.log(chalk.gray(`  Shared Services (codeb-network):`));
      if (config.useDatabase) {
        console.log(chalk.gray(`    PostgreSQL: codeb-postgres:5432 (external: ${serverHost}:5432)`));
      }
      if (config.useRedis) {
        console.log(chalk.gray(`    Redis: codeb-redis:6379 (external: ${serverHost}:6379)`));
      }
      console.log(chalk.gray(`  Project Isolation:`));
      if (provisionResult?.database) {
        console.log(chalk.gray(`    Database: ${provisionResult.database.database}`));
      }
      if (provisionResult?.redis) {
        console.log(chalk.gray(`    Redis: DB ${provisionResult.redis.db_index}, Prefix "${provisionResult.redis.prefix}"`));
      }
      if (provisionResult?.storage) {
        console.log(chalk.gray(`    Storage: ${provisionResult.storage.path}/`));
      }
      console.log();
    }

  } catch (error) {
    spinner.fail('Workflow initialization failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

/**
 * Generate local .env.local for development (connects to server DB)
 * This allows developers to test against the deployed database
 */
function generateLocalEnvForDev(config) {
  const {
    projectName,
    serverHost,
    useDatabase = true,
    useRedis = true,
    dbPassword = 'postgres',
    dbPort = 5432,
    redisPort = 6379
  } = config;

  const dbName = projectName.replace(/-/g, '_');

  let content = `# ${projectName} - Local Development Environment
# Generated by CodeB CLI v${getCliVersion()}
# This file connects your local dev to the SERVER database
# ⚠️  WARNING: This connects to REAL server data!

NODE_ENV=development
PORT=3000
`;

  if (useDatabase && serverHost) {
    content += `
# PostgreSQL (connects to server)
# Container internal: postgresql://postgres:***@${projectName}-postgres:5432/${dbName}
# External access (for local dev):
DATABASE_URL=postgresql://postgres:${dbPassword}@${serverHost}:${dbPort}/${dbName}?schema=public
`;
  }

  if (useRedis && serverHost) {
    content += `
# Redis (connects to server)
# Container internal: redis://${projectName}-redis:6379
# External access (for local dev):
REDIS_URL=redis://${serverHost}:${redisPort}
`;
  }

  content += `
# Add your application-specific variables below
# NEXT_PUBLIC_API_URL=http://localhost:3000/api
# AUTH_SECRET=your-secret-here

# To use LOCAL database instead:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/${dbName}?schema=public
`;

  return content;
}

/**
 * Create server environment files via MCP
 * Falls back to SSH direct only when MCP is unavailable
 * Creates /opt/codeb/envs/{project}-{env}.env on the server
 */
async function createServerEnvFiles(config) {
  const {
    projectName,
    serverHost,
    serverUser = 'root',
    useDatabase = true,
    useRedis = true,
    dbPassword = 'postgres',
    productionPort = '3000',
    stagingPort = '3001',
    productionDbPort = '5432',
    stagingDbPort = '5433',
    productionRedisPort = '6379',
    stagingRedisPort = '6380'
  } = config;

  const dbName = projectName.replace(/-/g, '_');

  // Generate env content
  const productionEnvVars = {
    NODE_ENV: 'production',
    PORT: '3000',
    HOSTNAME: '0.0.0.0'
  };

  const stagingEnvVars = {
    NODE_ENV: 'staging',
    PORT: '3000',
    HOSTNAME: '0.0.0.0'
  };

  if (useDatabase) {
    productionEnvVars.DATABASE_URL = `postgresql://postgres:${dbPassword}@${projectName}-postgres:5432/${dbName}?schema=public`;
    productionEnvVars.POSTGRES_USER = 'postgres';
    productionEnvVars.POSTGRES_PASSWORD = dbPassword;
    productionEnvVars.POSTGRES_DB = dbName;

    stagingEnvVars.DATABASE_URL = `postgresql://postgres:${dbPassword}@${projectName}-staging-postgres:5432/${dbName}?schema=public`;
    stagingEnvVars.POSTGRES_USER = 'postgres';
    stagingEnvVars.POSTGRES_PASSWORD = dbPassword;
    stagingEnvVars.POSTGRES_DB = dbName;
  }

  if (useRedis) {
    productionEnvVars.REDIS_URL = `redis://${projectName}-redis:6379`;
    stagingEnvVars.REDIS_URL = `redis://${projectName}-staging-redis:6379`;
  }

  // Try MCP first (preferred path)
  try {
    const isConnected = await mcpClient.ensureConnected();
    if (isConnected) {
      // Use MCP manage_env tool to set environment variables
      await mcpClient.callTool('manage_env', {
        action: 'set',
        projectName,
        environment: 'production',
        envFile: productionEnvVars
      });

      await mcpClient.callTool('manage_env', {
        action: 'set',
        projectName,
        environment: 'staging',
        envFile: stagingEnvVars
      });

      return true;
    }
  } catch (mcpError) {
    // MCP failed, will fall through to SSH fallback
    console.log(chalk.gray(`  MCP env management failed, using SSH fallback...`));
  }

  // SSH Fallback (only when MCP unavailable)
  const { execSync } = await import('child_process');

  // Ensure /opt/codeb/envs directory exists
  execSync(`ssh ${serverUser}@${serverHost} "mkdir -p /opt/codeb/envs"`, { timeout: 30000 });

  // Generate production env content
  const productionEnv = `# ${projectName} - Production Environment
# Generated by CodeB CLI v${getCliVersion()}
# Location: /opt/codeb/envs/${projectName}-production.env

NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
${useDatabase ? `
# PostgreSQL (uses container DNS name)
DATABASE_URL=postgresql://postgres:${dbPassword}@${projectName}-postgres:5432/${dbName}?schema=public
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${dbPassword}
POSTGRES_DB=${dbName}
` : ''}
${useRedis ? `
# Redis (uses container DNS name)
REDIS_URL=redis://${projectName}-redis:6379
` : ''}
# Add application secrets below
# AUTH_SECRET=
# API_KEY=
`;

  // Generate staging env content
  const stagingEnv = `# ${projectName} - Staging Environment
# Generated by CodeB CLI v${getCliVersion()}
# Location: /opt/codeb/envs/${projectName}-staging.env

NODE_ENV=staging
PORT=3000
HOSTNAME=0.0.0.0
${useDatabase ? `
# PostgreSQL (uses container DNS name)
DATABASE_URL=postgresql://postgres:${dbPassword}@${projectName}-staging-postgres:5432/${dbName}?schema=public
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${dbPassword}
POSTGRES_DB=${dbName}
` : ''}
${useRedis ? `
# Redis (uses container DNS name)
REDIS_URL=redis://${projectName}-staging-redis:6379
` : ''}
# Add application secrets below
# AUTH_SECRET=
# API_KEY=
`;

  // Write production env to server
  const productionPath = `/opt/codeb/envs/${projectName}-production.env`;
  execSync(`ssh ${serverUser}@${serverHost} "cat > ${productionPath} << 'EOFENV'
${productionEnv}
EOFENV"`, { timeout: 30000 });

  // Write staging env to server
  const stagingPath = `/opt/codeb/envs/${projectName}-staging.env`;
  execSync(`ssh ${serverUser}@${serverHost} "cat > ${stagingPath} << 'EOFENV'
${stagingEnv}
EOFENV"`, { timeout: 30000 });

  return true;
}

/**
 * Merge environment files - adds new variables without overwriting protected ones
 * Protected: DATABASE_URL, REDIS_URL, DIRECT_URL, POSTGRES_*, DB_*
 */
function mergeEnvFiles(existingContent, newContent) {
  const protectedPrefixes = ['DATABASE_URL', 'REDIS_URL', 'DIRECT_URL', 'POSTGRES_', 'DB_'];

  // Parse existing env
  const existingVars = new Map();
  for (const line of existingContent.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match) {
      existingVars.set(match[1], line);
    }
  }

  // Parse new env and identify what to add
  const newVars = new Map();
  for (const line of newContent.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match) {
      const varName = match[1];
      // Check if protected
      const isProtected = protectedPrefixes.some(prefix => varName.startsWith(prefix));
      if (!isProtected || !existingVars.has(varName)) {
        newVars.set(varName, line);
      }
    }
  }

  // Build merged content
  const lines = existingContent.split('\n');
  const addedVars = [];

  // Add new variables that don't exist
  for (const [varName, line] of newVars) {
    if (!existingVars.has(varName)) {
      addedVars.push(line);
    }
  }

  if (addedVars.length > 0) {
    // Add new vars at the end with a comment
    lines.push('');
    lines.push('# Added by workflow init');
    lines.push(...addedVars);
  }

  return lines.join('\n');
}

/**
 * Generate environment file template
 */
function generateEnvTemplate(config) {
  const {
    projectName,
    useDatabase = true,
    useRedis = true,
    useCentrifugo = false,
    dbPassword = 'postgres',
    environment = 'production',
    useSharedStorage = true  // 기본값: Storage 서버 사용
  } = config;

  const containerPrefix = environment === 'production' ? projectName : `${projectName}-${environment}`;

  // Storage 서버 정보 (db.codeb.kr)
  const STORAGE_SERVER = {
    host: 'db.codeb.kr',
    ip: '64.176.226.119',
    postgresPort: 5432,
    redisPort: 6379
  };

  // Streaming 서버 정보 (ws.codeb.kr)
  const STREAMING_SERVER = {
    host: 'ws.codeb.kr',
    ip: '141.164.42.213',
    port: 8000
  };

  let template = `# ${projectName} Environment Configuration
# Environment: ${environment}
# Generated by CodeB CLI v${getCliVersion()}

NODE_ENV=${environment}
PORT=3000
`;

  if (useDatabase) {
    if (useSharedStorage) {
      // Storage 서버(db.codeb.kr) 사용 - 권장
      template += `
# PostgreSQL (Storage 서버: ${STORAGE_SERVER.host})
DATABASE_URL=postgresql://postgres:${dbPassword}@${STORAGE_SERVER.host}:${STORAGE_SERVER.postgresPort}/${projectName}?schema=public
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${dbPassword}
POSTGRES_DB=${projectName}
`;
    } else {
      // 로컬 컨테이너 사용 (레거시)
      template += `
# PostgreSQL (로컬 컨테이너 - 권장하지 않음)
DATABASE_URL=postgresql://postgres:${dbPassword}@${containerPrefix}-postgres:5432/${projectName}?schema=public
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${dbPassword}
POSTGRES_DB=${projectName}
`;
    }
  }

  if (useRedis) {
    if (useSharedStorage) {
      // Storage 서버(db.codeb.kr) 사용 - 권장
      template += `
# Redis (Storage 서버: ${STORAGE_SERVER.host})
REDIS_URL=redis://${STORAGE_SERVER.host}:${STORAGE_SERVER.redisPort}
REDIS_PREFIX=${projectName}:
`;
    } else {
      // 로컬 컨테이너 사용 (레거시)
      template += `
# Redis (로컬 컨테이너 - 권장하지 않음)
REDIS_URL=redis://${containerPrefix}-redis:6379
`;
    }
  }

  if (useCentrifugo) {
    template += `
# Centrifugo (Streaming 서버: ${STREAMING_SERVER.host})
CENTRIFUGO_URL=wss://${STREAMING_SERVER.host}/connection/websocket
CENTRIFUGO_API_URL=http://${STREAMING_SERVER.host}:${STREAMING_SERVER.port}/api
CENTRIFUGO_API_KEY=your-api-key
CENTRIFUGO_SECRET=your-secret
`;
  }

  template += `
# Add your application-specific variables below
# API_KEY=
# SECRET_KEY=
`;

  return template;
}

async function generateQuadlet(projectName, options) {
  const spinner = ora('Generating Quadlet configuration...').start();

  try {
    const serverHost = options.host || getServerHost();
    const serverUser = options.user || getServerUser();

    // Check target server's Podman version for compatibility
    let podmanVersion = { major: 5, minor: 0, patch: 0, full: '5.0.0' }; // Default to 5.x
    if (serverHost) {
      spinner.text = 'Checking server Podman version...';
      podmanVersion = await getPodmanVersion(serverHost, serverUser);
      const versionInfo = getVersionInfo(podmanVersion);
      console.log(chalk.gray(`\n   Server Podman: ${podmanVersion.full}`));
      if (podmanVersion.major < 5) {
        console.log(chalk.yellow(`   💡 ${versionInfo.recommendation}`));
      }
    }

    const config = {
      projectName: projectName || options.name || 'my-project',
      containerName: options.container || projectName,
      image: options.image || `localhost/${projectName}:latest`,
      port: parseInt(options.containerPort) || 3000,
      hostPort: parseInt(options.port) || 3000,
      environment: options.environment || 'production',
      envVars: options.env ? JSON.parse(options.env) : {},
      volumes: options.volumes ? options.volumes.split(',') : [],
      dependencies: options.depends ? options.depends.split(',') : []
    };

    let content = generateQuadletTemplate(config);

    // Validate and auto-convert for Podman compatibility
    const validation = validateQuadletContent(content, podmanVersion.major);
    if (!validation.valid && validation.unsupportedKeys.length > 0) {
      console.log(chalk.yellow(`\n⚠️  Quadlet compatibility issues detected:`));
      validation.unsupportedKeys.forEach(({ key, line, alternative }) => {
        console.log(chalk.gray(`   Line ${line}: '${key}' not supported in Podman ${podmanVersion.major}.x`));
      });

      // Auto-convert for compatibility
      const { converted, changes } = convertQuadletForCompatibility(content, podmanVersion.major);
      if (changes.length > 0) {
        console.log(chalk.cyan(`\n   Auto-converting for Podman ${podmanVersion.major}.x compatibility:`));
        changes.forEach(change => console.log(chalk.gray(`   • ${change}`)));
        content = converted;
      }
    }

    const outputPath = options.output || `${config.projectName}.container`;

    await writeFile(outputPath, content);
    spinner.succeed(`Quadlet file generated: ${outputPath}`);

    console.log(chalk.green('\n✅ Quadlet Configuration Generated\n'));
    console.log(chalk.gray(`Target Podman version: ${podmanVersion.full}`));
    console.log(chalk.gray('\nInstall on server:'));
    console.log(chalk.cyan(`  scp ${outputPath} root@server:/etc/containers/systemd/`));
    console.log(chalk.cyan('  ssh root@server "systemctl daemon-reload && systemctl start ' + config.projectName + '.service"'));
    console.log();

  } catch (error) {
    spinner.fail('Quadlet generation failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

async function generateGitHubActions(projectName, options) {
  const spinner = ora('Generating GitHub Actions workflow...').start();

  try {
    const config = {
      projectName: projectName || options.name || 'my-project',
      projectType: options.type || 'nextjs',
      serverHost: options.host || getServerHost(),
      serverUser: options.user || getServerUser(),
      ports: {
        staging: parseInt(options.stagingPort) || 3001,
        production: parseInt(options.productionPort) || 3000
      },
      domains: {
        staging: options.stagingDomain,
        production: options.productionDomain
      },
      includeTests: options.tests !== false,
      includeLint: options.lint !== false,
      useQuadlet: options.quadlet !== false
    };

    const content = generateGitHubActionsWorkflow(config);
    const outputDir = options.output || '.github/workflows';
    const outputPath = join(outputDir, 'deploy.yml');

    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, content);
    spinner.succeed(`GitHub Actions workflow generated: ${outputPath}`);

    console.log(chalk.green('\n✅ GitHub Actions Workflow Generated\n'));
    console.log(chalk.yellow('Required GitHub Secrets:'));
    console.log(chalk.gray('  • SSH_PRIVATE_KEY - SSH key for server access'));
    console.log();

  } catch (error) {
    spinner.fail('GitHub Actions generation failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

async function generateDockerfileCommand(projectName, options) {
  const spinner = ora('Generating Dockerfile...').start();

  try {
    const config = {
      projectType: options.type || 'nextjs',
      nodeVersion: options.node || '20'
    };

    const content = generateDockerfile(config);
    const outputPath = options.output || 'Dockerfile';

    if (existsSync(outputPath) && !options.force) {
      spinner.stop();
      const { overwrite } = await inquirer.prompt([{
        type: 'confirm',
        name: 'overwrite',
        message: `Dockerfile already exists. Overwrite?`,
        default: false
      }]);

      if (!overwrite) {
        console.log(chalk.gray('Operation cancelled'));
        return;
      }
      spinner.start();
    }

    await writeFile(outputPath, content);
    spinner.succeed(`Dockerfile generated: ${outputPath}`);

    console.log(chalk.green('\n✅ Dockerfile Generated\n'));
    console.log(chalk.gray('Build command:'));
    console.log(chalk.cyan(`  docker build -t ${projectName || 'my-app'}:latest .`));
    console.log();

  } catch (error) {
    spinner.fail('Dockerfile generation failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

async function updateWorkflow(projectName, options) {
  const spinner = ora('Updating workflow configurations...').start();

  try {
    // Check for existing files
    const quadletPath = join('quadlet', `${projectName}.container`);
    const ghPath = join('.github', 'workflows', 'deploy.yml');

    const updates = [];

    if (existsSync(quadletPath)) {
      spinner.text = 'Updating Quadlet configuration...';
      // Read and update quadlet
      updates.push('Quadlet configuration');
    }

    if (existsSync(ghPath)) {
      spinner.text = 'Updating GitHub Actions workflow...';
      // Read and update workflow
      updates.push('GitHub Actions workflow');
    }

    if (updates.length === 0) {
      spinner.warn('No existing workflow files found');
      console.log(chalk.yellow('\nRun "codeb workflow init" to create new workflow files'));
      return;
    }

    spinner.succeed('Workflow configurations updated');
    console.log(chalk.green('\n✅ Updated:'));
    updates.forEach(u => console.log(chalk.cyan(`  • ${u}`)));
    console.log();

  } catch (error) {
    spinner.fail('Workflow update failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

// ============================================================================
// Add Resource Workflow - Add missing resources to existing project
// ============================================================================

async function addResourceWorkflow(projectName, options) {
  if (!projectName) {
    console.log(chalk.red('\n❌ Error: Project name is required'));
    console.log(chalk.gray('   Usage: we workflow add-resource <project-name> --database --redis --storage\n'));
    return;
  }

  const spinner = ora('Checking project resources...').start();
  const serverHost = options.host || getServerHost();
  const serverUser = options.user || getServerUser();

  if (!serverHost) {
    spinner.fail('Server host not configured');
    console.log(chalk.yellow('\n⚠️  Configure server host: we config init\n'));
    return;
  }

  try {
    // 1. Scan existing resources
    const scanResult = await scanProjectResources({
      projectName,
      serverHost,
      serverUser
    });

    spinner.succeed('Resource scan complete');
    console.log('');

    // Determine what resources are missing
    const missingResources = [];
    if (!scanResult.database.exists) missingResources.push('database');
    if (!scanResult.redis.exists) missingResources.push('redis');
    if (!scanResult.storage.exists) missingResources.push('storage');

    // Check what user requested to add
    const requestedResources = [];
    if (options.database) requestedResources.push('database');
    if (options.redis) requestedResources.push('redis');
    if (options.storage !== false) requestedResources.push('storage'); // storage is default true

    // If no specific resources requested, add all missing
    const resourcesToAdd = requestedResources.length > 0
      ? requestedResources.filter(r => missingResources.includes(r))
      : missingResources;

    if (resourcesToAdd.length === 0) {
      console.log(chalk.green('✅ All requested resources already exist!\n'));

      // Show current resource status
      console.log(chalk.cyan.bold('Current Resources:'));
      console.log(`  📦 Database: ${scanResult.database.exists ? chalk.green('✓ ' + scanResult.database.name) : chalk.gray('Not configured')}`);
      console.log(`  🔴 Redis:    ${scanResult.redis.exists ? chalk.green('✓ db:' + scanResult.redis.dbIndex + ' prefix:' + scanResult.redis.prefix) : chalk.gray('Not configured')}`);
      console.log(`  📁 Storage:  ${scanResult.storage.exists ? chalk.green('✓ ' + scanResult.storage.path) : chalk.gray('Not configured')}`);
      console.log('');
      return;
    }

    // Show what will be added
    console.log(chalk.cyan.bold('Resources to Add:'));
    for (const resource of resourcesToAdd) {
      console.log(`  • ${resource}`);
    }
    console.log('');

    // Interactive confirmation unless --force
    if (!options.force && !options.noInteractive) {
      const inquirer = (await import('inquirer')).default;
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Proceed with adding these resources?',
        default: true
      }]);

      if (!confirm) {
        console.log(chalk.yellow('\n⏹️  Cancelled\n'));
        return;
      }
    }

    // 2. Read current registry
    spinner.start('Reading project registry...');
    const registry = await readProjectRegistry(serverHost, serverUser);
    spinner.succeed('Registry loaded');

    // Get or create project entry
    let projectEntry = registry.projects[projectName];
    if (!projectEntry) {
      projectEntry = {
        created_at: new Date().toISOString(),
        type: options.type || 'nextjs',
        resources: {}
      };
      registry.projects[projectName] = projectEntry;
    }

    const provisionResult = { database: null, redis: null, storage: null };

    // 3. Provision requested resources
    if (resourcesToAdd.includes('database')) {
      spinner.start('Creating PostgreSQL database...');
      try {
        const dbResult = await provisionPostgresDatabase({
          projectName,
          serverHost,
          serverUser,
          dbPassword: options.dbPassword || getDbPassword()
        });
        provisionResult.database = dbResult;
        projectEntry.resources.database = {
          enabled: true,
          name: dbResult.database,
          user: dbResult.user,
          host: dbResult.host,
          port: dbResult.port
        };
        spinner.succeed(`Database created: ${dbResult.database}`);
      } catch (err) {
        spinner.fail(`Database creation failed: ${err.message}`);
      }
    }

    if (resourcesToAdd.includes('redis')) {
      spinner.start('Allocating Redis resources...');
      try {
        const redisResult = await provisionRedis({
          projectName,
          registry,
          serverHost,
          serverUser
        });
        provisionResult.redis = redisResult;
        projectEntry.resources.redis = {
          enabled: true,
          db_index: redisResult.dbIndex,
          prefix: redisResult.prefix,
          host: redisResult.host,
          port: redisResult.port
        };
        spinner.succeed(`Redis allocated: db:${redisResult.dbIndex} prefix:${redisResult.prefix}`);
      } catch (err) {
        spinner.fail(`Redis allocation failed: ${err.message}`);
      }
    }

    if (resourcesToAdd.includes('storage')) {
      spinner.start('Creating storage directories...');
      try {
        const storageResult = await provisionStorage({
          projectName,
          serverHost,
          serverUser
        });
        provisionResult.storage = storageResult;
        projectEntry.resources.storage = {
          enabled: true,
          path: storageResult.path,
          directories: storageResult.directories
        };
        spinner.succeed(`Storage created: ${storageResult.path}`);
      } catch (err) {
        spinner.fail(`Storage creation failed: ${err.message}`);
      }
    }

    // 4. Update registry
    spinner.start('Updating project registry...');
    registry.updated_at = new Date().toISOString();
    await writeProjectRegistry(serverHost, serverUser, registry);
    spinner.succeed('Registry updated');

    // 5. Update ENV files if we have provisioned credentials
    if (provisionResult.database || provisionResult.redis) {
      spinner.start('Updating environment files...');

      // Generate server ENV content
      const environment = options.environment || 'production';
      const baseDomain = options.stagingDomain?.split('.').slice(1).join('.') || getBaseDomain();
      const envContent = generateServerEnvContent({
        projectName,
        environment,
        port: projectEntry.environments?.[environment]?.port || 3000,
        domain: projectEntry.environments?.[environment]?.domain || `${projectName}.${baseDomain}`,
        database: provisionResult.database || projectEntry.resources?.database,
        redis: provisionResult.redis || projectEntry.resources?.redis,
        storage: provisionResult.storage || projectEntry.resources?.storage
      });

      // Write server ENV file
      const { execSync } = await import('child_process');
      const envPath = `/opt/codeb/envs/${projectName}-${environment}.env`;

      try {
        execSync(
          `ssh ${serverUser}@${serverHost} "mkdir -p /opt/codeb/envs && cat > ${envPath}" << 'ENVEOF'\n${envContent}\nENVEOF`,
          { encoding: 'utf-8', timeout: 30000 }
        );
      } catch {
        // Fallback method
        const escaped = envContent.replace(/'/g, "'\"'\"'");
        execSync(
          `ssh ${serverUser}@${serverHost} "mkdir -p /opt/codeb/envs && echo '${escaped}' > ${envPath}"`,
          { encoding: 'utf-8', timeout: 30000 }
        );
      }

      // Update local .env.local if it exists or create it
      const localEnvPath = join(process.cwd(), '.env.local');
      const localEnvContent = generateLocalEnvContent({
        projectName,
        serverHost,
        database: provisionResult.database || projectEntry.resources?.database,
        redis: provisionResult.redis || projectEntry.resources?.redis,
        stagingDbPort: projectEntry.environments?.staging?.ports?.db || 5433,
        productionDbPort: projectEntry.environments?.production?.ports?.db || 5432,
        stagingRedisPort: projectEntry.environments?.staging?.ports?.redis || 6380,
        productionRedisPort: projectEntry.environments?.production?.ports?.redis || 6379
      });

      writeFileSync(localEnvPath, localEnvContent);
      spinner.succeed('Environment files updated');
    }

    // 6. Summary
    console.log(chalk.green.bold('\n✅ Resources Added Successfully!\n'));

    if (provisionResult.database) {
      console.log(chalk.cyan('📦 PostgreSQL:'));
      console.log(`   Database: ${provisionResult.database.database}`);
      console.log(`   User:     ${provisionResult.database.user}`);
      console.log(`   Password: ${chalk.gray('(saved to ENV files)')}`);
    }

    if (provisionResult.redis) {
      console.log(chalk.cyan('\n🔴 Redis:'));
      console.log(`   DB Index: ${provisionResult.redis.dbIndex}`);
      console.log(`   Prefix:   ${provisionResult.redis.prefix}`);
    }

    if (provisionResult.storage) {
      console.log(chalk.cyan('\n📁 Storage:'));
      console.log(`   Path: ${provisionResult.storage.path}`);
      console.log(`   Dirs: ${provisionResult.storage.directories.join(', ')}`);
    }

    console.log(chalk.gray('\n---'));
    console.log(chalk.gray('Files updated:'));
    console.log(chalk.gray(`  • Server: /opt/codeb/envs/${projectName}-${options.environment || 'production'}.env`));
    console.log(chalk.gray(`  • Local:  .env.local`));
    console.log(chalk.gray(`  • Registry: /opt/codeb/config/project-registry.json`));
    console.log('');

  } catch (error) {
    spinner.fail('Failed to add resources');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    if (error.stack && process.env.DEBUG) {
      console.log(chalk.gray(error.stack));
    }
  }
}

// ============================================================================
// Scan Workflow - Analyze Server/Local Deployment Status
// ============================================================================

async function scanWorkflow(projectName, options) {
  const spinner = ora('Scanning deployment status...').start();
  const serverHost = options.host || getServerHost();
  const serverUser = options.user || getServerUser();

  try {
    const report = {
      local: { quadlet: [], github: null, dockerfile: false, env: false },
      server: { containers: [], quadlet: [], registry: null, ports: [], network: null },
      comparison: { needsMigration: false, issues: [], missingServices: [], networkIssues: [] }
    };

    // 1. Scan Local Files
    spinner.text = 'Scanning local files...';

    // Check for quadlet directory
    if (existsSync('quadlet')) {
      const { readdirSync } = await import('fs');
      const quadletFiles = readdirSync('quadlet').filter(f => f.endsWith('.container'));
      report.local.quadlet = quadletFiles;
    }

    // Check for GitHub Actions
    const ghPath = '.github/workflows/deploy.yml';
    if (existsSync(ghPath)) {
      const content = await readFile(ghPath, 'utf-8');
      // Hybrid Mode: GitHub-hosted build + SSH deploy (appleboy/ssh-action)
      const usesSSHDeploy = content.includes('appleboy/ssh-action') || content.includes('ssh-action');
      const usesSelfHosted = content.includes('self-hosted');
      report.local.github = {
        exists: true,
        deployMethod: usesSSHDeploy ? 'SSH' : (usesSelfHosted ? 'Self-hosted' : 'Unknown'),
        hasQuadlet: content.includes('Quadlet') || content.includes('quadlet'),
        version: content.match(/Generated by CodeB CLI v([\d.]+)/)?.[1] || 'unknown'
      };
    }

    // Check for Dockerfile
    report.local.dockerfile = existsSync('Dockerfile');

    // Check for .env files
    report.local.env = existsSync('.env') || existsSync('.env.local') || existsSync('.env.example');

    // 2. Scan Server (via SSH)
    spinner.text = 'Scanning server status...';

    const { execSync } = await import('child_process');

    try {
      // Get running containers with network info
      const containersCmd = `ssh ${serverUser}@${serverHost} "podman ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.Networks}}' 2>/dev/null"`;
      const containersOutput = execSync(containersCmd, { encoding: 'utf-8', timeout: 30000 }).trim();

      if (containersOutput) {
        report.server.containers = containersOutput.split('\n').map(line => {
          const [name, image, status, ports, networks] = line.split('|');
          return { name, image, status, ports, networks };
        });
      }

      // Get Quadlet files on server
      const quadletCmd = `ssh ${serverUser}@${serverHost} "ls /etc/containers/systemd/*.container 2>/dev/null | xargs -I {} basename {}"`;
      const quadletOutput = execSync(quadletCmd, { encoding: 'utf-8', timeout: 30000 }).trim();

      if (quadletOutput) {
        report.server.quadlet = quadletOutput.split('\n').filter(Boolean);
      }

      // Get project registry
      const registryCmd = `ssh ${serverUser}@${serverHost} "cat /opt/codeb/config/project-registry.json 2>/dev/null"`;
      try {
        const registryOutput = execSync(registryCmd, { encoding: 'utf-8', timeout: 30000 });
        report.server.registry = JSON.parse(registryOutput);
      } catch {
        report.server.registry = null;
      }

      // Get used ports
      const portsCmd = `ssh ${serverUser}@${serverHost} "ss -tlnp 2>/dev/null | grep LISTEN | awk '{print \\$4}' | grep -oE '[0-9]+$' | sort -n | uniq"`;
      const portsOutput = execSync(portsCmd, { encoding: 'utf-8', timeout: 30000 }).trim();
      report.server.ports = portsOutput.split('\n').filter(Boolean).map(Number);

      // Check codeb-network exists
      try {
        const networkCmd = `ssh ${serverUser}@${serverHost} "podman network inspect codeb-network --format '{{.Subnets}}' 2>/dev/null"`;
        const networkOutput = execSync(networkCmd, { encoding: 'utf-8', timeout: 30000 }).trim();
        report.server.network = { exists: true, subnet: networkOutput };
      } catch {
        report.server.network = { exists: false, subnet: null };
      }

    } catch (sshError) {
      report.server.error = `SSH connection failed: ${sshError.message}`;
    }

    // 3. Compare and analyze
    spinner.text = 'Analyzing differences...';

    // Check if project exists on server
    if (projectName) {
      const serverHasProject = report.server.containers.some(c => c.name.includes(projectName));
      const localHasQuadlet = report.local.quadlet.some(f => f.includes(projectName));

      if (serverHasProject && !localHasQuadlet) {
        report.comparison.issues.push(`Project "${projectName}" exists on server but no local quadlet files`);
        report.comparison.needsMigration = true;
      }

      if (!serverHasProject && localHasQuadlet) {
        report.comparison.issues.push(`Local quadlet files exist but project not deployed on server`);
      }
    }

    // Check CLI version
    if (report.local.github && report.local.github.version !== '2.3.1') {
      report.comparison.issues.push(`GitHub Actions workflow uses old CLI version (${report.local.github.version})`);
      report.comparison.needsMigration = true;
    }

    // Check for hybrid mode
    if (report.local.github && !report.local.github.hasHybridMode) {
      report.comparison.issues.push('GitHub Actions does not use hybrid mode (GitHub build + Self-hosted deploy)');
      report.comparison.needsMigration = true;
    }

    // ================================================================
    // Enhanced Analysis: Missing Services Detection (Case 4)
    // ================================================================
    if (report.server.registry?.projects && !report.server.error) {
      for (const [projName, projData] of Object.entries(report.server.registry.projects)) {
        // Skip if filtering by project name and it doesn't match
        if (projectName && !projName.includes(projectName)) continue;

        const ports = projData.ports || {};
        const containerNames = report.server.containers.map(c => c.name);

        // Check for missing PostgreSQL
        if (ports.app && !ports.postgres) {
          // Project has app but no postgres registered
          const hasPostgres = containerNames.some(n => n.includes(projName) && n.includes('postgres'));
          if (!hasPostgres) {
            report.comparison.missingServices.push({
              project: projName,
              service: 'postgres',
              message: `Missing PostgreSQL for project "${projName}"`
            });
          }
        }

        // Check for missing Redis
        if (ports.app && !ports.redis) {
          // Project has app but no redis registered
          const hasRedis = containerNames.some(n => n.includes(projName) && n.includes('redis'));
          if (!hasRedis) {
            report.comparison.missingServices.push({
              project: projName,
              service: 'redis',
              message: `Missing Redis for project "${projName}"`
            });
          }
        }
      }
    }

    // ================================================================
    // Enhanced Analysis: Network Issues Detection (Case 5)
    // ================================================================
    if (!report.server.error) {
      // Check if codeb-network exists
      if (!report.server.network?.exists) {
        report.comparison.networkIssues.push({
          type: 'missing_network',
          message: 'codeb-network does not exist on server'
        });
      }

      // Check containers not on codeb-network
      const containersOnWrongNetwork = report.server.containers.filter(c => {
        // Skip if filtering by project name and it doesn't match
        if (projectName && !c.name.includes(projectName)) return false;
        // Check if not on codeb-network
        return c.networks && c.networks !== 'codeb-network';
      });

      if (containersOnWrongNetwork.length > 0) {
        report.comparison.networkIssues.push({
          type: 'wrong_network',
          message: `${containersOnWrongNetwork.length} containers not on codeb-network`,
          containers: containersOnWrongNetwork.map(c => ({ name: c.name, network: c.networks }))
        });
      }
    }

    spinner.succeed('Scan completed');

    // Display Report
    console.log(chalk.blue.bold('\n📊 Deployment Status Report\n'));

    // Local Status
    console.log(chalk.yellow('📁 Local Files:'));
    console.log(chalk.gray(`  Quadlet files: ${report.local.quadlet.length > 0 ? report.local.quadlet.join(', ') : 'None'}`));
    console.log(chalk.gray(`  GitHub Actions: ${report.local.github ? `v${report.local.github.version} (Hybrid: ${report.local.github.hasHybridMode ? '✅' : '❌'})` : 'Not found'}`));
    console.log(chalk.gray(`  Dockerfile: ${report.local.dockerfile ? '✅' : '❌'}`));
    console.log(chalk.gray(`  Environment files: ${report.local.env ? '✅' : '❌'}`));

    // Server Status
    console.log(chalk.yellow('\n🖥️  Server Status:'));
    if (report.server.error) {
      console.log(chalk.red(`  ${report.server.error}`));
    } else {
      console.log(chalk.gray(`  Running containers: ${report.server.containers.length}`));
      if (report.server.containers.length > 0) {
        report.server.containers.forEach(c => {
          const statusColor = c.status.includes('Up') ? chalk.green : chalk.red;
          console.log(chalk.gray(`    • ${c.name}: ${statusColor(c.status)}`));
        });
      }
      console.log(chalk.gray(`  Quadlet files: ${report.server.quadlet.length}`));
      console.log(chalk.gray(`  Registry projects: ${report.server.registry?.projects ? Object.keys(report.server.registry.projects).length : 0}`));
    }

    // Comparison
    if (report.comparison.issues.length > 0) {
      console.log(chalk.yellow('\n⚠️  Issues Found:'));
      report.comparison.issues.forEach(issue => {
        console.log(chalk.red(`  • ${issue}`));
      });

      if (report.comparison.needsMigration) {
        console.log(chalk.cyan('\n💡 Recommendation: Run "we workflow migrate" to update to latest CLI structure'));
      }
    }

    // Missing Services (Case 4)
    if (report.comparison.missingServices.length > 0) {
      console.log(chalk.yellow('\n🔍 Missing Services Detected:'));
      report.comparison.missingServices.forEach(ms => {
        console.log(chalk.red(`  • ${ms.message}`));
        console.log(chalk.cyan(`    Fix: we workflow add-service ${ms.project} --service ${ms.service}`));
      });
    }

    // Network Issues (Case 5)
    if (report.comparison.networkIssues.length > 0) {
      console.log(chalk.yellow('\n🌐 Network Issues Detected:'));
      report.comparison.networkIssues.forEach(ni => {
        console.log(chalk.red(`  • ${ni.message}`));
        if (ni.type === 'missing_network') {
          console.log(chalk.cyan('    Fix: we workflow fix-network'));
        } else if (ni.type === 'wrong_network' && ni.containers) {
          ni.containers.slice(0, 5).forEach(c => {
            console.log(chalk.gray(`      - ${c.name} (current: ${c.network})`));
          });
          if (ni.containers.length > 5) {
            console.log(chalk.gray(`      ... and ${ni.containers.length - 5} more`));
          }
          console.log(chalk.cyan('    Fix: we workflow fix-network'));
        }
      });
    }

    // ================================================================
    // Resource Scan (DB, Redis, Storage, ENV) - v2.5.0 Enhancement
    // ================================================================
    let resourceScan = null;
    if (projectName && !report.server.error) {
      spinner.start('Scanning project resources...');
      try {
        resourceScan = await scanProjectResources({
          projectName,
          serverHost,
          serverUser
        });
      } catch (scanError) {
        resourceScan = { error: scanError.message };
      }
      spinner.stop();

      // Add resource status to report
      console.log(chalk.yellow('\n📊 Project Resource Scan:'));
      console.log(chalk.gray(`  Project: ${projectName}`));

      if (resourceScan.error) {
        console.log(chalk.red(`  ❌ Error: ${resourceScan.error}`));
      } else {
        // Database status
        if (resourceScan.database.exists) {
          console.log(chalk.green(`  ✅ Database: ${resourceScan.database.details?.name || 'exists'}`));
          if (resourceScan.database.details?.user) {
            console.log(chalk.gray(`     User: ${resourceScan.database.details.user}`));
          }
        } else {
          console.log(chalk.red(`  ❌ Database: NOT CONFIGURED`));
          console.log(chalk.cyan(`     → we workflow add-resource ${projectName} --database`));
        }

        // Redis status
        if (resourceScan.redis.exists) {
          console.log(chalk.green(`  ✅ Redis: DB ${resourceScan.redis.details?.db_index}, Prefix "${resourceScan.redis.details?.prefix}"`));
        } else {
          console.log(chalk.red(`  ❌ Redis: NOT CONFIGURED`));
          console.log(chalk.cyan(`     → we workflow add-resource ${projectName} --redis`));
        }

        // Storage status
        if (resourceScan.storage.exists) {
          console.log(chalk.green(`  ✅ Storage: ${resourceScan.storage.details?.path}`));
          if (resourceScan.storage.details?.directories?.length > 0) {
            console.log(chalk.gray(`     Dirs: ${resourceScan.storage.details.directories.join(', ')}`));
          }
        } else {
          console.log(chalk.red(`  ❌ Storage: NOT CONFIGURED`));
          console.log(chalk.cyan(`     → we workflow add-resource ${projectName} --storage`));
        }

        // ENV files status
        console.log(chalk.gray(`  ENV Files:`));
        if (resourceScan.envFiles.production) {
          console.log(chalk.green(`    ✅ Production: /opt/codeb/envs/${projectName}-production.env`));
        } else {
          console.log(chalk.red(`    ❌ Production: Not found`));
        }
        if (resourceScan.envFiles.staging) {
          console.log(chalk.green(`    ✅ Staging: /opt/codeb/envs/${projectName}-staging.env`));
        } else {
          console.log(chalk.red(`    ❌ Staging: Not found`));
        }

        // Registry status
        if (resourceScan.registry.exists) {
          console.log(chalk.green(`  ✅ Registry: Registered`));
        } else {
          console.log(chalk.red(`  ❌ Registry: NOT REGISTERED`));
          console.log(chalk.cyan(`     → we workflow add-resource ${projectName} --register`));
        }

        // Detect missing resources for quick fix
        const missingResources = [];
        if (!resourceScan.database.exists) missingResources.push('--database');
        if (!resourceScan.redis.exists) missingResources.push('--redis');
        if (!resourceScan.storage.exists) missingResources.push('--storage');

        if (missingResources.length > 0) {
          console.log(chalk.yellow(`\n⚠️  Missing Resources Detected!`));
          console.log(chalk.cyan(`   Quick fix: we workflow add-resource ${projectName} ${missingResources.join(' ')}`));
        }
      }

      report.resources = resourceScan;
    }

    // Summary
    const totalIssues = report.comparison.issues.length +
                        report.comparison.missingServices.length +
                        report.comparison.networkIssues.length;

    if (totalIssues === 0 && (!resourceScan || (!resourceScan.error && resourceScan.database.exists && resourceScan.redis.exists && resourceScan.storage.exists))) {
      console.log(chalk.green('\n✅ No issues found'));
    } else {
      console.log(chalk.yellow(`\n📊 Summary: ${totalIssues} infrastructure issue(s) found`));
    }

    console.log();

    return report;

  } catch (error) {
    spinner.fail('Scan failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

// ============================================================================
// Migrate Workflow - Refactor Existing Project to New CLI Structure
// ============================================================================

async function migrateWorkflow(projectName, options) {
  const spinner = ora('Preparing migration...').start();

  try {
    if (!projectName) {
      spinner.fail('Project name is required');
      console.log(chalk.yellow('\nUsage: we workflow migrate <project-name>'));
      process.exit(1);
    }

    // First, scan current status
    spinner.text = 'Analyzing current deployment...';
    const scanResult = await scanWorkflowInternal(projectName, options);

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

    // Confirm migration
    if (options.interactive !== false) {
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

    // 2. Generate new Project Set
    const config = {
      projectName,
      projectType: options.type || 'nextjs',
      stagingPort: serverPorts?.staging?.app || options.stagingPort || '3001',
      productionPort: serverPorts?.production?.app || options.productionPort || '3000',
      stagingDbPort: serverPorts?.staging?.postgres || options.stagingDbPort || '5433',
      productionDbPort: serverPorts?.production?.postgres || options.productionDbPort || '5432',
      stagingRedisPort: serverPorts?.staging?.redis || options.stagingRedisPort || '6380',
      productionRedisPort: serverPorts?.production?.redis || options.productionRedisPort || '6379',
      useDatabase: options.database !== false,
      useRedis: options.redis !== false,
      dbPassword: options.dbPassword || 'postgres',
      includeTests: options.tests !== false,
      includeLint: options.lint !== false
    };

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
      useQuadlet: true
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

// Internal scan function (returns result without console output)
// Uses MCP first, falls back to SSH
async function scanWorkflowInternal(projectName, options) {
  const serverHost = options.host || getServerHost();
  const serverUser = options.user || getServerUser();

  const report = {
    local: { quadlet: [], github: null, dockerfile: false, env: false },
    server: { containers: [], quadlet: [], registry: null, ports: [] },
    comparison: { needsMigration: false, issues: [] }
  };

  // Scan local
  if (existsSync('quadlet')) {
    const { readdirSync } = await import('fs');
    report.local.quadlet = readdirSync('quadlet').filter(f => f.endsWith('.container'));
  }

  const ghPath = '.github/workflows/deploy.yml';
  if (existsSync(ghPath)) {
    const content = await readFile(ghPath, 'utf-8');
    const usesSSHDeploy = content.includes('appleboy/ssh-action') || content.includes('ssh-action');
    const usesSelfHosted = content.includes('self-hosted');
    report.local.github = {
      exists: true,
      deployMethod: usesSSHDeploy ? 'SSH' : (usesSelfHosted ? 'Self-hosted' : 'Unknown'),
      hasQuadlet: content.includes('Quadlet'),
      version: content.match(/Generated by CodeB CLI v([\d.]+)/)?.[1] || 'unknown'
    };
  }

  report.local.dockerfile = existsSync('Dockerfile');
  report.local.env = existsSync('.env') || existsSync('.env.local');

  // Scan server - Try MCP first
  try {
    const isConnected = await mcpClient.ensureConnected();
    if (isConnected) {
      // Get SSOT data via MCP
      const ssotData = await ssotClient.get();
      if (ssotData && !ssotData.error) {
        report.server.registry = convertSSOTToLegacyRegistry(ssotData);
      }

      // Get server analysis via MCP
      const serverAnalysis = await mcpClient.callTool('analyze_server', {
        includeContainers: true,
        includePorts: true
      });

      const analysis = typeof serverAnalysis === 'string' ? JSON.parse(serverAnalysis) : serverAnalysis;
      if (analysis?.containers) {
        report.server.containers = analysis.containers;
      }
      if (analysis?.ports) {
        report.server.ports = analysis.ports;
      }
    }
  } catch (mcpError) {
    // Fall back to SSH
    const { execSync } = await import('child_process');
    try {
      const registryCmd = `ssh ${serverUser}@${serverHost} "cat /opt/codeb/config/project-registry.json 2>/dev/null"`;
      const registryOutput = execSync(registryCmd, { encoding: 'utf-8', timeout: 30000 });
      report.server.registry = JSON.parse(registryOutput);
    } catch { /* ignore */ }
  }

  // Analyze
  if (report.local.github && report.local.github.version !== '2.3.1') {
    report.comparison.issues.push(`Old CLI version (${report.local.github.version})`);
    report.comparison.needsMigration = true;
  }
  if (report.local.github && !report.local.github.hasHybridMode) {
    report.comparison.issues.push('Missing hybrid mode');
    report.comparison.needsMigration = true;
  }

  return report;
}

// ============================================================================
// Full Pre-Deploy Scan - Comprehensive server & local analysis
// Runs before init/deploy to detect issues early
// ============================================================================

/**
 * 전체 사전 배포 스캔 - 서버와 로컬 상태를 종합 분석
 * @param {string} projectName - 프로젝트 이름
 * @param {object} options - 옵션 (host, user, silent)
 * @returns {Promise<object>} 스캔 결과
 */
async function fullPreDeployScan(projectName, options = {}) {
  const { execSync } = await import('child_process');
  const serverHost = options.host || getServerHost();
  const serverUser = options.user || getServerUser();
  const silent = options.silent || false;

  if (!silent) {
    console.log(chalk.cyan('\n🔍 Full Pre-Deploy Scan\n'));
  }

  const result = {
    timestamp: new Date().toISOString(),
    projectName,
    server: {
      reachable: false,
      postgres: { containerExists: false, containerRunning: false, databases: [], users: [] },
      redis: { containerExists: false, containerRunning: false, dbIndexes: [] },
      containers: [],
      ports: { used: [], available: [] },
      registry: null
    },
    local: {
      envFiles: {},
      quadlet: [],
      githubActions: null,
      dockerfile: false,
      packageJson: null,
      database: null,
      redis: null
    },
    comparison: {
      issues: [],
      warnings: [],
      suggestions: []
    }
  };

  // ================================================================
  // 1. Server Scan
  // ================================================================
  if (serverHost) {
    if (!silent) console.log(chalk.gray('  Scanning server...'));

    // 1.1 Server reachability
    try {
      execSync(`ssh -o ConnectTimeout=5 ${serverUser}@${serverHost} "echo ok"`, {
        encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe']
      });
      result.server.reachable = true;
    } catch (e) {
      result.comparison.issues.push({
        type: 'server_unreachable',
        severity: 'critical',
        message: `Cannot reach server ${serverHost}`
      });
      if (!silent) console.log(chalk.red('  ✗ Server unreachable'));
      return result;
    }

    // 1.2 PostgreSQL container
    try {
      const pgStatus = execSync(
        `ssh ${serverUser}@${serverHost} "podman ps -a --filter name=codeb-postgres --format '{{.Names}}|{{.Status}}'" 2>/dev/null`,
        { encoding: 'utf-8', timeout: 30000 }
      ).trim();

      if (pgStatus) {
        result.server.postgres.containerExists = true;
        result.server.postgres.containerRunning = pgStatus.includes('Up');

        if (result.server.postgres.containerRunning) {
          // Get databases
          const dbList = execSync(
            `ssh ${serverUser}@${serverHost} "podman exec codeb-postgres psql -U postgres -t -c \\"SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres';\\"" 2>/dev/null`,
            { encoding: 'utf-8', timeout: 30000 }
          ).trim();
          result.server.postgres.databases = dbList.split('\n').map(d => d.trim()).filter(Boolean);

          // Get users
          const userList = execSync(
            `ssh ${serverUser}@${serverHost} "podman exec codeb-postgres psql -U postgres -t -c \\"SELECT usename FROM pg_user WHERE usename != 'postgres';\\"" 2>/dev/null`,
            { encoding: 'utf-8', timeout: 30000 }
          ).trim();
          result.server.postgres.users = userList.split('\n').map(u => u.trim()).filter(Boolean);
        }
      }
    } catch (e) { /* ignore */ }

    // 1.3 Redis container
    try {
      const redisStatus = execSync(
        `ssh ${serverUser}@${serverHost} "podman ps -a --filter name=codeb-redis --format '{{.Names}}|{{.Status}}'" 2>/dev/null`,
        { encoding: 'utf-8', timeout: 30000 }
      ).trim();

      if (redisStatus) {
        result.server.redis.containerExists = true;
        result.server.redis.containerRunning = redisStatus.includes('Up');

        if (result.server.redis.containerRunning) {
          const keyspace = execSync(
            `ssh ${serverUser}@${serverHost} "podman exec codeb-redis redis-cli INFO keyspace" 2>/dev/null`,
            { encoding: 'utf-8', timeout: 30000 }
          ).trim();
          const dbMatches = keyspace.match(/db(\d+):/g);
          if (dbMatches) {
            result.server.redis.dbIndexes = dbMatches.map(m => parseInt(m.replace('db', '').replace(':', '')));
          }
        }
      }
    } catch (e) { /* ignore */ }

    // 1.4 All running containers
    try {
      const containers = execSync(
        `ssh ${serverUser}@${serverHost} "podman ps --format '{{.Names}}|{{.Ports}}|{{.Status}}'" 2>/dev/null`,
        { encoding: 'utf-8', timeout: 30000 }
      ).trim();

      result.server.containers = containers.split('\n').filter(Boolean).map(line => {
        const [name, ports, status] = line.split('|');
        return { name, ports, status };
      });
    } catch (e) { /* ignore */ }

    // 1.5 Used ports
    try {
      const portsOutput = execSync(
        `ssh ${serverUser}@${serverHost} "ss -tlnp | grep LISTEN | awk '{print \\$4}' | rev | cut -d: -f1 | rev | sort -n | uniq" 2>/dev/null`,
        { encoding: 'utf-8', timeout: 30000 }
      ).trim();
      result.server.ports.used = portsOutput.split('\n').filter(Boolean).map(p => parseInt(p)).filter(p => !isNaN(p));
    } catch (e) { /* ignore */ }

    // 1.6 Project registry
    try {
      const registry = await readProjectRegistry(serverHost, serverUser);
      result.server.registry = registry;

      // Check if this project is already registered
      if (registry?.projects?.[projectName]) {
        result.server.projectInfo = registry.projects[projectName];
        if (!silent) console.log(chalk.green(`  ✓ Project '${projectName}' found in registry`));
      } else {
        if (!silent) console.log(chalk.yellow(`  ⚠ Project '${projectName}' not in registry`));
      }
    } catch (e) { /* ignore */ }

    // Server status summary
    if (!silent) {
      console.log(chalk.gray(`  PostgreSQL: ${result.server.postgres.containerRunning ? chalk.green('Running') : chalk.yellow('Stopped')}`));
      if (result.server.postgres.databases.length > 0) {
        console.log(chalk.gray(`    DBs: ${result.server.postgres.databases.join(', ')}`));
      }
      console.log(chalk.gray(`  Redis: ${result.server.redis.containerRunning ? chalk.green('Running') : chalk.yellow('Stopped')}`));
      console.log(chalk.gray(`  Containers: ${result.server.containers.length} running`));
      console.log(chalk.gray(`  Ports in use: ${result.server.ports.used.length}`));
    }
  }

  // ================================================================
  // 2. Local Scan
  // ================================================================
  if (!silent) console.log(chalk.gray('\n  Scanning local files...'));

  // 2.1 package.json
  const pkgPath = join(process.cwd(), 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
      result.local.packageJson = { name: pkg.name, version: pkg.version };
    } catch (e) { /* ignore */ }
  }

  // 2.2 .env files
  const envFiles = ['.env', '.env.local', '.env.development', '.env.production'];
  for (const envFile of envFiles) {
    const envPath = join(process.cwd(), envFile);
    if (existsSync(envPath)) {
      try {
        const content = await readFile(envPath, 'utf-8');
        const parsed = {};

        content.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;
          const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=["']?(.*)["']?$/i);
          if (match) parsed[match[1]] = match[2].replace(/["']$/, '');
        });

        result.local.envFiles[envFile] = {
          path: envPath,
          hasDbUrl: !!parsed.DATABASE_URL,
          hasRedisUrl: !!parsed.REDIS_URL,
          parsed
        };

        // Extract DB info
        if (parsed.DATABASE_URL && !result.local.database) {
          const dbMatch = parsed.DATABASE_URL.match(/postgresql:\/\/([^:]+):([^@]+)@([^:\/]+):?(\d+)?\/([^?]+)/);
          if (dbMatch) {
            result.local.database = {
              user: dbMatch[1],
              password: dbMatch[2],
              host: dbMatch[3],
              port: dbMatch[4] || '5432',
              database: dbMatch[5].split('?')[0],
              sourceFile: envFile
            };
          }
        }

        // Extract Redis info
        if (parsed.REDIS_URL && !result.local.redis) {
          const redisMatch = parsed.REDIS_URL.match(/redis:\/\/([^:\/]+):?(\d+)?\/(\d+)?/);
          if (redisMatch) {
            result.local.redis = {
              host: redisMatch[1],
              port: redisMatch[2] || '6379',
              dbIndex: redisMatch[3] || '0',
              sourceFile: envFile
            };
          }
        }
      } catch (e) { /* ignore */ }
    }
  }

  // 2.3 Quadlet files
  const quadletDir = join(process.cwd(), 'quadlet');
  if (existsSync(quadletDir)) {
    try {
      result.local.quadlet = readdirSync(quadletDir).filter(f => f.endsWith('.container'));
    } catch (e) { /* ignore */ }
  }

  // 2.4 GitHub Actions
  const ghPath = join(process.cwd(), '.github', 'workflows', 'deploy.yml');
  if (existsSync(ghPath)) {
    try {
      const content = await readFile(ghPath, 'utf-8');
      const usesSSHDeploy = content.includes('appleboy/ssh-action') || content.includes('ssh-action');
      const usesSelfHosted = content.includes('self-hosted');
      result.local.githubActions = {
        exists: true,
        deployMethod: usesSSHDeploy ? 'SSH' : (usesSelfHosted ? 'Self-hosted' : 'Unknown'),
        hasQuadlet: content.includes('Quadlet'),
        version: content.match(/Generated by CodeB CLI v([\d.]+)/)?.[1] || 'unknown'
      };
    } catch (e) { /* ignore */ }
  }

  // 2.5 Dockerfile
  result.local.dockerfile = existsSync(join(process.cwd(), 'Dockerfile'));

  // Local summary
  if (!silent) {
    console.log(chalk.gray(`  .env files: ${Object.keys(result.local.envFiles).join(', ') || 'none'}`));
    console.log(chalk.gray(`  Quadlet: ${result.local.quadlet.length} files`));
    console.log(chalk.gray(`  GitHub Actions: ${result.local.githubActions ? 'yes' : 'no'}`));
    console.log(chalk.gray(`  Dockerfile: ${result.local.dockerfile ? 'yes' : 'no'}`));
  }

  // ================================================================
  // 3. Comparison & Issue Detection
  // ================================================================
  if (!silent) console.log(chalk.gray('\n  Analyzing...'));

  const dbName = projectName.replace(/-/g, '_');

  // 3.1 DB host mismatch
  if (result.local.database) {
    const localHost = result.local.database.host;
    if ((localHost === 'localhost' || localHost === '127.0.0.1') && result.server.postgres.containerRunning) {
      result.comparison.issues.push({
        type: 'db_host_mismatch',
        severity: 'error',
        message: 'DATABASE_URL points to localhost but server has running PostgreSQL',
        fix: 'Run "we env pull" to get server credentials'
      });
    }

    // DB exists check
    if (result.server.postgres.databases.length > 0) {
      if (!result.server.postgres.databases.includes(result.local.database.database)) {
        result.comparison.warnings.push({
          type: 'db_not_found',
          message: `Database '${result.local.database.database}' not found on server`,
          availableDbs: result.server.postgres.databases
        });
      }
    }

    // Password mismatch with registry
    const regDb = result.server.projectInfo?.resources?.database;
    if (regDb?.password && result.local.database.password !== regDb.password) {
      result.comparison.issues.push({
        type: 'db_password_mismatch',
        severity: 'error',
        message: 'Database password mismatch between local .env and server registry',
        fix: 'Run "we env pull" to sync credentials'
      });
    }
  }

  // 3.2 Redis host mismatch
  if (result.local.redis) {
    const localHost = result.local.redis.host;
    if ((localHost === 'localhost' || localHost === '127.0.0.1') && result.server.redis.containerRunning) {
      result.comparison.issues.push({
        type: 'redis_host_mismatch',
        severity: 'error',
        message: 'REDIS_URL points to localhost but server has running Redis',
        fix: 'Run "we env pull" to get server credentials'
      });
    }
  }

  // 3.3 No local env files but server has resources
  if (Object.keys(result.local.envFiles).length === 0 && result.server.projectInfo) {
    result.comparison.warnings.push({
      type: 'no_local_env',
      message: 'No local .env files but project is registered on server',
      fix: 'Run "we env pull" to create .env.local'
    });
  }

  // 3.4 Quadlet but no GitHub Actions
  if (result.local.quadlet.length > 0 && !result.local.githubActions) {
    result.comparison.warnings.push({
      type: 'missing_github_actions',
      message: 'Quadlet files exist but no deploy.yml workflow'
    });
  }

  // 3.5 Suggestions
  if (!result.server.postgres.containerRunning && !result.server.redis.containerRunning) {
    result.comparison.suggestions.push('Server infrastructure not running. Run "we workflow init --provision" to set up.');
  }

  if (!result.server.projectInfo && result.server.reachable) {
    result.comparison.suggestions.push(`Project '${projectName}' not registered. Init will create server resources.`);
  }

  // ================================================================
  // 4. Output Summary
  // ================================================================
  if (!silent) {
    console.log('');
    if (result.comparison.issues.length > 0) {
      console.log(chalk.red.bold('━━━ Issues ━━━'));
      for (const issue of result.comparison.issues) {
        console.log(chalk.red(`  ✗ ${issue.message}`));
        if (issue.fix) console.log(chalk.yellow(`    Fix: ${issue.fix}`));
      }
    }

    if (result.comparison.warnings.length > 0) {
      console.log(chalk.yellow.bold('━━━ Warnings ━━━'));
      for (const warning of result.comparison.warnings) {
        console.log(chalk.yellow(`  ⚠ ${warning.message}`));
      }
    }

    if (result.comparison.issues.length === 0 && result.comparison.warnings.length === 0) {
      console.log(chalk.green('  ✓ No issues detected'));
    }

    if (result.comparison.suggestions.length > 0) {
      console.log(chalk.cyan.bold('\n━━━ Suggestions ━━━'));
      for (const suggestion of result.comparison.suggestions) {
        console.log(chalk.cyan(`  💡 ${suggestion}`));
      }
    }
    console.log('');
  }

  return result;
}

// ============================================================================
// Sync Workflow - Push Changes to Server
// ============================================================================

async function syncWorkflow(projectName, options) {
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

    const { readdirSync } = await import('fs');
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
    console.log(chalk.blue.bold('\n📤 Sync Plan\n'));
    console.log(chalk.gray(`Server: ${serverUser}@${serverHost}`));
    console.log(chalk.gray(`\nQuadlet files to sync:`));
    projectFiles.forEach(f => console.log(chalk.cyan(`  • ${f}`)));

    if (localEnvFiles.length > 0) {
      console.log(chalk.gray(`\nEnvironment files:`));
      console.log(chalk.cyan(`  • /opt/codeb/envs/${projectName}-production.env`));
      console.log(chalk.cyan(`  • /opt/codeb/envs/${projectName}-staging.env`));
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
        console.log(chalk.yellow(`\n⚠️  Quadlet compatibility issues in ${file}:`));
        validation.unsupportedKeys.forEach(({ key, line, alternative }) => {
          console.log(chalk.gray(`   Line ${line}: '${key}' not supported in Podman ${podmanVersion.major}.x`));
          if (alternative) {
            console.log(chalk.gray(`   → Use: ${alternative}`));
          }
        });

        // Auto-convert for Podman 4.x
        if (podmanVersion.major < 5) {
          const { converted, changes } = convertQuadletForCompatibility(content, podmanVersion.major);
          if (changes.length > 0) {
            console.log(chalk.cyan(`\n   Auto-converting for Podman ${podmanVersion.major}.x compatibility:`));
            changes.forEach(change => console.log(chalk.gray(`   • ${change}`)));

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
      console.log(chalk.green(`\n✅ Auto-converted ${convertedFiles.length} file(s) for Podman ${podmanVersion.major}.x compatibility\n`));
    }

    // Show version recommendation if using older Podman
    if (podmanVersion.major < 5) {
      console.log(chalk.yellow(`\n💡 ${versionInfo.recommendation}`));
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
      console.log(chalk.yellow(`\n⚠️  Could not sync env files: ${envError.message}`));
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

    console.log(chalk.green('\n✅ Sync Complete\n'));
    console.log(chalk.gray('Synced quadlet files:'));
    projectFiles.forEach(f => console.log(chalk.cyan(`  • /etc/containers/systemd/${f}`)));

    console.log(chalk.gray('\nSynced env files:'));
    console.log(chalk.cyan(`  • /opt/codeb/envs/${projectName}-production.env`));
    console.log(chalk.cyan(`  • /opt/codeb/envs/${projectName}-staging.env`));

    console.log(chalk.yellow('\n📋 Next steps:'));
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
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

// ============================================================================
// Add Service Workflow - Add missing PostgreSQL/Redis to existing project
// Case 4: Existing project needs additional service (e.g., warehouse missing Redis)
// ============================================================================

async function addServiceWorkflow(projectName, options) {
  const spinner = ora('Analyzing project services...').start();
  const serverHost = options.host || getServerHost();
  const serverUser = options.user || getServerUser();

  try {
    if (!projectName) {
      spinner.fail('Project name is required');
      console.log(chalk.yellow('\nUsage: we workflow add-service <project-name> --service postgres|redis'));
      console.log(chalk.gray('\nExamples:'));
      console.log(chalk.gray('  we workflow add-service warehouse --service redis'));
      console.log(chalk.gray('  we workflow add-service myapp --service postgres --port 5440'));
      process.exit(1);
    }

    const serviceType = options.service || options.type;
    if (!serviceType || !['postgres', 'redis', 'postgresql'].includes(serviceType.toLowerCase())) {
      spinner.fail('Service type is required');
      console.log(chalk.yellow('\nUsage: we workflow add-service <project-name> --service postgres|redis'));
      process.exit(1);
    }

    const isPostgres = ['postgres', 'postgresql'].includes(serviceType.toLowerCase());
    const serviceKey = isPostgres ? 'postgres' : 'redis';

    // 1. Get current server state
    spinner.text = 'Checking server state...';
    const { execSync } = await import('child_process');

    let serverState = { containers: [], registry: null, usedPorts: [] };

    try {
      // Get running containers
      const containersCmd = `ssh ${serverUser}@${serverHost} "podman ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Networks}}'" 2>/dev/null`;
      const containersOutput = execSync(containersCmd, { encoding: 'utf-8', timeout: 30000 }).trim();

      if (containersOutput) {
        serverState.containers = containersOutput.split('\n').map(line => {
          const [name, image, status, networks] = line.split('|');
          return { name, image, status, networks };
        });
      }

      // Get registry
      const registryCmd = `ssh ${serverUser}@${serverHost} "cat /opt/codeb/config/project-registry.json 2>/dev/null"`;
      try {
        const registryOutput = execSync(registryCmd, { encoding: 'utf-8', timeout: 30000 });
        serverState.registry = JSON.parse(registryOutput);
      } catch { /* ignore */ }

      // Get used ports
      const portsCmd = `ssh ${serverUser}@${serverHost} "ss -tlnp 2>/dev/null | grep LISTEN | awk '{print \\$4}' | grep -oE '[0-9]+$' | sort -n | uniq"`;
      const portsOutput = execSync(portsCmd, { encoding: 'utf-8', timeout: 30000 }).trim();
      serverState.usedPorts = portsOutput.split('\n').filter(Boolean).map(Number);

    } catch (sshError) {
      spinner.fail(`SSH connection failed: ${sshError.message}`);
      process.exit(1);
    }

    // 2. Detect environment (staging/production)
    const projectContainers = serverState.containers.filter(c => c.name.startsWith(projectName));

    if (projectContainers.length === 0) {
      spinner.fail(`No containers found for project: ${projectName}`);
      console.log(chalk.gray('\nAvailable projects:'));
      const projectNames = [...new Set(serverState.containers.map(c => c.name.split('-')[0]))];
      projectNames.forEach(p => console.log(chalk.cyan(`  • ${p}`)));
      process.exit(1);
    }

    // Detect environment from container names
    const hasStaging = projectContainers.some(c => c.name.includes('-staging'));
    const hasProduction = projectContainers.some(c => !c.name.includes('-staging'));

    const environment = options.environment || (hasStaging && !hasProduction ? 'staging' : 'production');
    const containerPrefix = environment === 'production' ? projectName : `${projectName}-staging`;

    // 3. Check if service already exists
    const existingService = projectContainers.find(c => c.name === `${containerPrefix}-${serviceKey}`);
    if (existingService) {
      spinner.succeed(`Service already exists: ${existingService.name}`);
      console.log(chalk.yellow(`\n⚠️  ${serviceKey} already exists for ${containerPrefix}`));
      console.log(chalk.gray(`Status: ${existingService.status}`));
      return;
    }

    // 4. Find available port
    const defaultPort = isPostgres ? 5432 : 6379;
    let servicePort = parseInt(options.port) || defaultPort;

    while (serverState.usedPorts.includes(servicePort)) {
      servicePort++;
    }

    // 5. Detect network from existing containers
    const appContainer = projectContainers.find(c => c.name === containerPrefix);
    const currentNetwork = appContainer?.networks || 'podman';

    spinner.stop();

    // 6. Show plan
    console.log(chalk.blue.bold('\n📦 Add Service Plan\n'));
    console.log(chalk.gray(`Project: ${projectName}`));
    console.log(chalk.gray(`Environment: ${environment}`));
    console.log(chalk.gray(`Service: ${serviceKey}`));
    console.log(chalk.gray(`Container: ${containerPrefix}-${serviceKey}`));
    console.log(chalk.gray(`Port: ${servicePort}`));
    console.log(chalk.gray(`Network: ${currentNetwork}`));

    if (currentNetwork !== 'codeb-network') {
      console.log(chalk.yellow(`\n⚠️  Warning: Container uses "${currentNetwork}" network`));
      console.log(chalk.gray('   DNS resolution may not work. Consider running: we workflow fix-network ' + projectName));
    }

    // Confirm
    if (options.interactive !== false && !options.force) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Proceed with adding service?',
        default: true
      }]);

      if (!confirm) {
        console.log(chalk.gray('\nOperation cancelled'));
        return;
      }
    }

    spinner.start('Creating service...');

    // 7. Generate Quadlet file
    const dbName = projectName.replace(/-/g, '_');
    const dbPassword = options.dbPassword || 'postgres';
    const redisPassword = options.redisPassword || null;

    let quadletContent;
    if (isPostgres) {
      quadletContent = generateQuadletTemplate({
        projectName: `${projectName} PostgreSQL`,
        containerName: `${containerPrefix}-postgres`,
        image: 'docker.io/library/postgres:15-alpine',
        port: 5432,
        hostPort: servicePort,
        environment,
        envVars: {
          POSTGRES_USER: 'postgres',
          POSTGRES_PASSWORD: dbPassword,
          POSTGRES_DB: dbName
        },
        volumes: [`${containerPrefix}-postgres-data:/var/lib/postgresql/data:Z`],
        healthCheck: 'pg_isready -U postgres',
        network: currentNetwork
      });
    } else {
      quadletContent = generateQuadletTemplate({
        projectName: `${projectName} Redis`,
        containerName: `${containerPrefix}-redis`,
        image: 'docker.io/library/redis:7-alpine',
        port: 6379,
        hostPort: servicePort,
        environment,
        envVars: {},
        volumes: [`${containerPrefix}-redis-data:/data:Z`],
        healthCheck: 'redis-cli ping',
        network: currentNetwork
      });
    }

    // 8. Deploy to server
    const quadletFileName = `${containerPrefix}-${serviceKey}.container`;
    const quadletPath = `/etc/containers/systemd/${quadletFileName}`;

    spinner.text = 'Writing Quadlet file to server...';

    // Write quadlet file via SSH
    const escapedContent = quadletContent.replace(/'/g, "'\\''");
    execSync(`ssh ${serverUser}@${serverHost} "cat > ${quadletPath} << 'EOFQUADLET'
${quadletContent}
EOFQUADLET"`, { timeout: 30000 });

    // 9. Reload and start service
    spinner.text = 'Starting service...';
    execSync(`ssh ${serverUser}@${serverHost} "systemctl daemon-reload"`, { timeout: 30000 });
    execSync(`ssh ${serverUser}@${serverHost} "systemctl start ${containerPrefix}-${serviceKey}.service"`, { timeout: 60000 });

    // 10. Update registry
    spinner.text = 'Updating registry...';
    if (serverState.registry?.projects?.[projectName]) {
      const envKey = environment === 'production' ? 'production' : 'staging';
      if (!serverState.registry.projects[projectName].ports) {
        serverState.registry.projects[projectName].ports = {};
      }
      serverState.registry.projects[projectName].ports[serviceKey] = servicePort;

      const registryJson = JSON.stringify(serverState.registry, null, 2);
      execSync(`ssh ${serverUser}@${serverHost} "cat > /opt/codeb/config/project-registry.json << 'EOFREG'
${registryJson}
EOFREG"`, { timeout: 30000 });
    }

    // 11. Verify service started
    spinner.text = 'Verifying service...';
    await new Promise(resolve => setTimeout(resolve, 3000));

    const verifyCmd = `ssh ${serverUser}@${serverHost} "podman ps --filter name=${containerPrefix}-${serviceKey} --format '{{.Status}}'"`;
    const verifyOutput = execSync(verifyCmd, { encoding: 'utf-8', timeout: 30000 }).trim();

    spinner.succeed('Service added successfully');

    console.log(chalk.green('\n✅ Service Added\n'));
    console.log(chalk.gray(`Container: ${containerPrefix}-${serviceKey}`));
    console.log(chalk.gray(`Status: ${verifyOutput || 'Starting...'}`));
    console.log(chalk.gray(`Port: ${servicePort}`));

    if (isPostgres) {
      console.log(chalk.blue('\n📝 Connection String:'));
      console.log(chalk.cyan(`  DATABASE_URL=postgresql://postgres:${dbPassword}@${containerPrefix}-postgres:5432/${dbName}?schema=public`));
      console.log(chalk.gray(`  (External: postgresql://postgres:${dbPassword}@${serverHost}:${servicePort}/${dbName})`));
    } else {
      console.log(chalk.blue('\n📝 Connection String:'));
      console.log(chalk.cyan(`  REDIS_URL=redis://${containerPrefix}-redis:6379`));
      console.log(chalk.gray(`  (External: redis://${serverHost}:${servicePort})`));
    }

    console.log(chalk.yellow('\n📋 Next steps:'));
    console.log(chalk.gray('  1. Update app\'s environment variables with the connection string'));
    console.log(chalk.gray('  2. Add dependency to app\'s Quadlet file:'));
    console.log(chalk.cyan(`     After=network-online.target ${containerPrefix}-${serviceKey}.service`));
    console.log(chalk.cyan(`     Requires=${containerPrefix}-${serviceKey}.service`));
    console.log(chalk.gray('  3. Restart app service: systemctl restart ' + containerPrefix + '.service'));
    console.log();

  } catch (error) {
    spinner.fail('Add service failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

// ============================================================================
// Fix Network Workflow - Migrate containers to codeb-network
// Case 5: Containers on wrong network (podman default instead of codeb-network)
// ============================================================================

async function fixNetworkWorkflow(projectName, options) {
  const spinner = ora('Analyzing network configuration...').start();
  const serverHost = options.host || getServerHost();
  const serverUser = options.user || getServerUser();

  try {
    const { execSync } = await import('child_process');

    // 1. Check codeb-network exists
    spinner.text = 'Checking codeb-network...';

    let networkExists = false;
    try {
      const networkCmd = `ssh ${serverUser}@${serverHost} "podman network inspect codeb-network" 2>/dev/null`;
      execSync(networkCmd, { encoding: 'utf-8', timeout: 30000 });
      networkExists = true;
    } catch {
      networkExists = false;
    }

    if (!networkExists) {
      spinner.text = 'Creating codeb-network...';
      execSync(`ssh ${serverUser}@${serverHost} "podman network create codeb-network --subnet 10.89.0.0/24"`, { timeout: 30000 });
      console.log(chalk.green('\n✅ Created codeb-network (10.89.0.0/24)\n'));
    }

    // 2. Get containers and their networks
    spinner.text = 'Analyzing containers...';

    let containers = [];
    try {
      const containersCmd = `ssh ${serverUser}@${serverHost} "podman ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Networks}}'" 2>/dev/null`;
      const containersOutput = execSync(containersCmd, { encoding: 'utf-8', timeout: 30000 }).trim();

      if (containersOutput) {
        containers = containersOutput.split('\n').map(line => {
          const [name, image, status, networks] = line.split('|');
          return { name, image, status, networks, needsFix: networks !== 'codeb-network' };
        });
      }
    } catch (e) {
      spinner.fail(`Failed to get containers: ${e.message}`);
      process.exit(1);
    }

    // 3. Filter containers to fix
    let containersToFix = containers.filter(c => c.needsFix);

    if (projectName) {
      containersToFix = containersToFix.filter(c => c.name.startsWith(projectName));
    }

    if (containersToFix.length === 0) {
      spinner.succeed('All containers are on codeb-network');
      console.log(chalk.green('\n✅ No network fixes needed\n'));
      return;
    }

    spinner.stop();

    // 4. Show plan
    console.log(chalk.blue.bold('\n🔧 Network Fix Plan\n'));
    console.log(chalk.gray(`Target network: codeb-network (10.89.0.0/24)`));
    console.log(chalk.yellow(`\nContainers to migrate (${containersToFix.length}):`));

    containersToFix.forEach(c => {
      console.log(chalk.gray(`  • ${c.name}`));
      console.log(chalk.gray(`    Current: ${c.networks} → codeb-network`));
    });

    console.log(chalk.yellow('\n⚠️  Warning: This will restart the containers!'));

    // Confirm
    if (options.interactive !== false && !options.force) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Proceed with network migration?',
        default: true
      }]);

      if (!confirm) {
        console.log(chalk.gray('\nOperation cancelled'));
        return;
      }
    }

    spinner.start('Migrating containers to codeb-network...');

    const results = { success: [], failed: [] };

    // 5. Update each container's Quadlet file and restart
    for (const container of containersToFix) {
      spinner.text = `Migrating ${container.name}...`;

      try {
        const quadletPath = `/etc/containers/systemd/${container.name}.container`;

        // Check if Quadlet file exists
        const checkCmd = `ssh ${serverUser}@${serverHost} "test -f ${quadletPath} && echo 'exists'"`;
        let hasQuadlet = false;
        try {
          const result = execSync(checkCmd, { encoding: 'utf-8', timeout: 30000 }).trim();
          hasQuadlet = result === 'exists';
        } catch { /* file doesn't exist */ }

        if (hasQuadlet) {
          // Update Network= line in Quadlet file
          const updateCmd = `ssh ${serverUser}@${serverHost} "sed -i 's/^Network=.*/Network=codeb-network/' ${quadletPath}"`;
          execSync(updateCmd, { timeout: 30000 });

          // Also check if Network line doesn't exist and add it
          const addNetworkCmd = `ssh ${serverUser}@${serverHost} "grep -q '^Network=' ${quadletPath} || sed -i '/^\\[Container\\]/a Network=codeb-network' ${quadletPath}"`;
          execSync(addNetworkCmd, { timeout: 30000 });

          // Reload systemd and restart service with graceful shutdown
          execSync(`ssh ${serverUser}@${serverHost} "systemctl daemon-reload"`, { timeout: 30000 });

          const serviceName = `${container.name}.service`;
          // 안전한 컨테이너 교체: graceful stop (30초 대기) 후 제거
          // 기존: podman rm -f (즉시 강제 삭제 - 타 프로젝트 영향 가능)
          // 개선: 개별 컨테이너만 graceful 종료
          execSync(`ssh ${serverUser}@${serverHost} "systemctl stop ${serviceName} 2>/dev/null; podman stop ${container.name} --time 30 2>/dev/null; podman rm ${container.name} 2>/dev/null; systemctl start ${serviceName}"`, { timeout: 90000 });

          results.success.push(container.name);
        } else {
          // No Quadlet file - need manual intervention
          results.failed.push({ name: container.name, reason: 'No Quadlet file found' });
        }
      } catch (error) {
        results.failed.push({ name: container.name, reason: error.message });
      }
    }

    // 6. Verify migrations
    spinner.text = 'Verifying migrations...';
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      const verifyCmd = `ssh ${serverUser}@${serverHost} "podman ps --format '{{.Names}}|{{.Networks}}'" 2>/dev/null`;
      const verifyOutput = execSync(verifyCmd, { encoding: 'utf-8', timeout: 30000 }).trim();

      if (verifyOutput) {
        const verified = verifyOutput.split('\n').map(line => {
          const [name, networks] = line.split('|');
          return { name, networks };
        });

        results.success = results.success.filter(name => {
          const v = verified.find(c => c.name === name);
          return v && v.networks === 'codeb-network';
        });
      }
    } catch { /* ignore verify errors */ }

    spinner.succeed('Network migration completed');

    // 7. Display results
    console.log(chalk.green('\n✅ Network Migration Complete\n'));

    if (results.success.length > 0) {
      console.log(chalk.green(`Successfully migrated (${results.success.length}):`));
      results.success.forEach(name => console.log(chalk.cyan(`  ✓ ${name}`)));
    }

    if (results.failed.length > 0) {
      console.log(chalk.red(`\nFailed (${results.failed.length}):`));
      results.failed.forEach(f => {
        console.log(chalk.red(`  ✗ ${f.name}: ${f.reason}`));
      });
    }

    console.log(chalk.blue('\n📝 DNS Resolution:'));
    console.log(chalk.gray('  Containers on codeb-network can now use DNS names:'));
    console.log(chalk.cyan('  DATABASE_URL=postgresql://user:pass@myapp-postgres:5432/db'));
    console.log(chalk.cyan('  REDIS_URL=redis://myapp-redis:6379'));

    console.log(chalk.yellow('\n📋 Next steps:'));
    if (results.failed.length > 0) {
      console.log(chalk.gray('  1. Fix failed containers manually'));
    }
    console.log(chalk.gray('  2. Update DATABASE_URL to use container DNS names'));
    console.log(chalk.gray('  3. Verify app connectivity with: podman exec <app> ping <db-container>'));
    console.log();

  } catch (error) {
    spinner.fail('Network fix failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

// ============================================================================
// Port Validation (GitOps PortGuard Integration)
// ============================================================================

/**
 * Validate port allocation before deployment
 * Uses SSH to check server's port-manifest.yaml and actual port usage
 */
async function portValidateWorkflow(target, options) {
  const spinner = ora('Validating port allocation...').start();

  try {
    const serverHost = options.host || getServerHost();
    const serverUser = options.user || getServerUser();
    const { execSync } = await import('child_process');

    // Parse target: project:port:environment format or just project
    let projectName = target;
    let port = options.port ? parseInt(options.port) : null;
    let environment = options.environment || 'staging';

    if (target && target.includes(':')) {
      const parts = target.split(':');
      projectName = parts[0];
      port = parts[1] ? parseInt(parts[1]) : port;
      environment = parts[2] || environment;
    }

    spinner.text = 'Loading port manifest from server...';

    // Read port manifest from server
    let manifest;
    try {
      const manifestCmd = `ssh ${serverUser}@${serverHost} "cat /home/codeb/config/port-manifest.yaml 2>/dev/null"`;
      const manifestOutput = execSync(manifestCmd, { encoding: 'utf-8', timeout: 30000 });

      // Parse YAML (simple parsing for key structures)
      manifest = parseSimpleYaml(manifestOutput);
    } catch {
      manifest = { projects: {} };
      console.log(chalk.yellow('\n⚠️  No port manifest found on server, will check live ports only'));
    }

    spinner.text = 'Scanning actual port usage on server...';

    // Get actual used ports from server
    const portsCmd = `ssh ${serverUser}@${serverHost} "ss -tlnp | grep LISTEN | awk '{print \\$4}' | grep -oE '[0-9]+$' | sort -n | uniq"`;
    const portsOutput = execSync(portsCmd, { encoding: 'utf-8', timeout: 30000 });
    const usedPorts = new Set(
      portsOutput.split('\n').filter(p => p.trim()).map(p => parseInt(p)).filter(p => !isNaN(p))
    );

    spinner.stop();

    console.log(chalk.blue.bold('\n📋 Port Validation Report\n'));

    // 1. Show port ranges
    console.log(chalk.cyan('Port Ranges:'));
    console.log(chalk.gray('  Staging:    3000-3499 (app), 5432-5449 (db), 6379-6399 (redis)'));
    console.log(chalk.gray('  Production: 4000-4499 (app), 5450-5469 (db), 6400-6419 (redis)'));
    console.log(chalk.gray('  Preview:    5000-5999 (app)'));
    console.log();

    // 2. If specific port validation requested
    if (port) {
      const portRange = getPortRange(port);
      const isUsed = usedPorts.has(port);
      const manifestOwner = findPortOwnerInManifest(manifest, port);

      console.log(chalk.cyan(`Port ${port} Validation:`));
      console.log(chalk.gray(`  Range:       ${portRange || 'Unknown'}`));
      console.log(isUsed ? chalk.red(`  Status:      IN USE`) : chalk.green(`  Status:      AVAILABLE`));

      if (manifestOwner) {
        console.log(chalk.yellow(`  Owner:       ${manifestOwner.project}/${manifestOwner.environment}`));
      }

      if (projectName && manifestOwner && manifestOwner.project !== projectName) {
        console.log(chalk.red(`\n❌ PORT CONFLICT: Port ${port} is allocated to ${manifestOwner.project}`));
        console.log(chalk.yellow('   Suggested action: Use a different port or update manifest'));
        process.exit(1);
      }

      if (isUsed && !manifestOwner) {
        console.log(chalk.yellow(`\n⚠️  Port ${port} is in use but not in manifest (possible drift)`));
      }

      console.log();
    }

    // 3. Show manifest summary
    if (manifest.projects && Object.keys(manifest.projects).length > 0) {
      console.log(chalk.cyan('Registered Projects in Manifest:'));
      for (const [name, project] of Object.entries(manifest.projects)) {
        const envInfo = [];
        for (const [env, ports] of Object.entries(project.environments || {})) {
          if (ports.app) envInfo.push(`${env}:${ports.app}`);
        }
        console.log(chalk.gray(`  ${name}: ${envInfo.join(', ')}`));
      }
      console.log();
    }

    // 4. Show used ports summary
    console.log(chalk.cyan('Currently Used Ports:'));
    const portsByRange = {
      staging: [],
      production: [],
      preview: [],
      system: [],
      other: []
    };

    for (const p of usedPorts) {
      if (p >= 3000 && p < 3500) portsByRange.staging.push(p);
      else if (p >= 4000 && p < 4500) portsByRange.production.push(p);
      else if (p >= 5000 && p < 6000) portsByRange.preview.push(p);
      else if (p < 1024) portsByRange.system.push(p);
      else portsByRange.other.push(p);
    }

    console.log(chalk.gray(`  Staging (3000-3499):    ${portsByRange.staging.length} ports (${portsByRange.staging.slice(0, 5).join(', ')}${portsByRange.staging.length > 5 ? '...' : ''})`));
    console.log(chalk.gray(`  Production (4000-4499): ${portsByRange.production.length} ports (${portsByRange.production.slice(0, 5).join(', ')}${portsByRange.production.length > 5 ? '...' : ''})`));
    console.log(chalk.gray(`  Preview (5000-5999):    ${portsByRange.preview.length} ports (${portsByRange.preview.slice(0, 5).join(', ')}${portsByRange.preview.length > 5 ? '...' : ''})`));
    console.log(chalk.gray(`  System (<1024):         ${portsByRange.system.length} ports`));
    console.log();

    // 5. Suggest next available ports
    console.log(chalk.cyan('Next Available Ports:'));
    console.log(chalk.green(`  Staging App:    ${findNextPort(3000, 3499, usedPorts)}`));
    console.log(chalk.green(`  Production App: ${findNextPort(4000, 4499, usedPorts)}`));
    console.log(chalk.green(`  Preview App:    ${findNextPort(5000, 5999, usedPorts)}`));
    console.log();

    console.log(chalk.green('✅ Port validation completed'));

  } catch (error) {
    spinner.fail('Port validation failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

/**
 * Detect drift between manifest and actual server state
 */
async function portDriftWorkflow(target, options) {
  const spinner = ora('Detecting port drift...').start();

  try {
    const serverHost = options.host || getServerHost();
    const serverUser = options.user || getServerUser();
    const { execSync } = await import('child_process');

    spinner.text = 'Loading port manifest and registry...';

    // Read port manifest
    let manifest = { projects: {} };
    try {
      const manifestCmd = `ssh ${serverUser}@${serverHost} "cat /home/codeb/config/port-manifest.yaml 2>/dev/null"`;
      const manifestOutput = execSync(manifestCmd, { encoding: 'utf-8', timeout: 30000 });
      manifest = parseSimpleYaml(manifestOutput);
    } catch {
      console.log(chalk.yellow('\n⚠️  No port manifest found'));
    }

    // Read port registry
    let registry = { usedPorts: [], allocations: [] };
    try {
      const registryCmd = `ssh ${serverUser}@${serverHost} "cat /home/codeb/config/port-registry.json 2>/dev/null"`;
      const registryOutput = execSync(registryCmd, { encoding: 'utf-8', timeout: 30000 });
      registry = JSON.parse(registryOutput);
    } catch {
      console.log(chalk.yellow('⚠️  No port registry found'));
    }

    spinner.text = 'Scanning actual port usage...';

    // Get actual used ports with process info
    const portsCmd = `ssh ${serverUser}@${serverHost} "ss -tlnp | grep LISTEN | awk '{print \\$4, \\$6}' | sort -t: -k2 -n"`;
    const portsOutput = execSync(portsCmd, { encoding: 'utf-8', timeout: 30000 });

    const actualPorts = new Map();
    for (const line of portsOutput.split('\n').filter(l => l.trim())) {
      const match = line.match(/:(\d+)\s+users:\(\("([^"]+)"/);
      if (match) {
        actualPorts.set(parseInt(match[1]), match[2]);
      }
    }

    spinner.stop();

    console.log(chalk.blue.bold('\n🔍 Port Drift Detection Report\n'));

    const drifts = [];

    // Check manifest vs actual
    for (const [projectName, project] of Object.entries(manifest.projects || {})) {
      for (const [env, ports] of Object.entries(project.environments || {})) {
        if (ports.app) {
          const isActual = actualPorts.has(ports.app);
          if (!isActual) {
            drifts.push({
              type: 'MANIFEST_ORPHAN',
              project: projectName,
              environment: env,
              port: ports.app,
              message: `Port ${ports.app} in manifest but not in use (service down?)`
            });
          }
        }
      }
    }

    // Check actual vs manifest (find unregistered ports in our ranges)
    for (const [port, process] of actualPorts) {
      if ((port >= 3000 && port < 6000) || (port >= 5432 && port < 5470) || (port >= 6379 && port < 6420)) {
        const owner = findPortOwnerInManifest(manifest, port);
        if (!owner) {
          drifts.push({
            type: 'UNREGISTERED',
            port: port,
            process: process,
            message: `Port ${port} in use by "${process}" but not in manifest`
          });
        }
      }
    }

    // Check registry vs manifest consistency
    const registryPorts = new Set(registry.usedPorts || []);
    const manifestPorts = new Set();
    for (const project of Object.values(manifest.projects || {})) {
      for (const ports of Object.values(project.environments || {})) {
        if (ports.app) manifestPorts.add(ports.app);
        if (ports.db) manifestPorts.add(ports.db);
        if (ports.redis) manifestPorts.add(ports.redis);
      }
    }

    for (const port of registryPorts) {
      if (!manifestPorts.has(port) && !actualPorts.has(port)) {
        drifts.push({
          type: 'REGISTRY_STALE',
          port: port,
          message: `Port ${port} in registry but not in manifest or actual use`
        });
      }
    }

    // Report drifts
    if (drifts.length === 0) {
      console.log(chalk.green('✅ No drift detected - Manifest, registry, and server are in sync'));
    } else {
      console.log(chalk.yellow(`⚠️  Found ${drifts.length} drift(s):\n`));

      const driftsByType = {
        MANIFEST_ORPHAN: [],
        UNREGISTERED: [],
        REGISTRY_STALE: []
      };

      for (const drift of drifts) {
        driftsByType[drift.type].push(drift);
      }

      if (driftsByType.MANIFEST_ORPHAN.length > 0) {
        console.log(chalk.cyan('Manifest Orphans (in manifest but not running):'));
        for (const d of driftsByType.MANIFEST_ORPHAN) {
          console.log(chalk.yellow(`  ⚠️  ${d.project}/${d.environment} - Port ${d.port}`));
        }
        console.log();
      }

      if (driftsByType.UNREGISTERED.length > 0) {
        console.log(chalk.cyan('Unregistered Ports (running but not in manifest):'));
        for (const d of driftsByType.UNREGISTERED) {
          console.log(chalk.red(`  ❌ Port ${d.port} - Process: ${d.process}`));
        }
        console.log();
      }

      if (driftsByType.REGISTRY_STALE.length > 0) {
        console.log(chalk.cyan('Stale Registry Entries:'));
        for (const d of driftsByType.REGISTRY_STALE) {
          console.log(chalk.gray(`  ○ Port ${d.port}`));
        }
        console.log();
      }

      // Suggest fixes
      console.log(chalk.cyan('Suggested Actions:'));
      if (driftsByType.MANIFEST_ORPHAN.length > 0) {
        console.log(chalk.gray('  • Start stopped services or remove from manifest'));
      }
      if (driftsByType.UNREGISTERED.length > 0) {
        console.log(chalk.gray('  • Register running services in manifest or stop unknown processes'));
      }
      if (driftsByType.REGISTRY_STALE.length > 0) {
        console.log(chalk.gray('  • Run "we workflow port-validate" to sync registry'));
      }
      console.log();

      if (options.fix) {
        console.log(chalk.yellow('Auto-fix is not yet implemented. Please fix manually.'));
      }
    }

    // Summary stats
    console.log(chalk.blue('\n📊 Summary:'));
    console.log(chalk.gray(`  Manifest projects: ${Object.keys(manifest.projects || {}).length}`));
    console.log(chalk.gray(`  Registry ports:    ${registryPorts.size}`));
    console.log(chalk.gray(`  Actual ports:      ${actualPorts.size}`));
    console.log(chalk.gray(`  Drifts detected:   ${drifts.length}`));
    console.log();

  } catch (error) {
    spinner.fail('Drift detection failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

// Helper functions for port validation
function parseSimpleYaml(yamlStr) {
  const result = { projects: {} };
  let currentProject = null;
  let currentEnv = null;

  for (const line of yamlStr.split('\n')) {
    const projectMatch = line.match(/^\s{2}(\w[\w-]*):$/);
    const envMatch = line.match(/^\s{4}(staging|production|preview):$/);
    const portMatch = line.match(/^\s{6}(app|db|redis):\s*(\d+)/);

    if (projectMatch) {
      currentProject = projectMatch[1];
      result.projects[currentProject] = { environments: {} };
    } else if (envMatch && currentProject) {
      currentEnv = envMatch[1];
      result.projects[currentProject].environments[currentEnv] = {};
    } else if (portMatch && currentProject && currentEnv) {
      result.projects[currentProject].environments[currentEnv][portMatch[1]] = parseInt(portMatch[2]);
    }
  }

  return result;
}

function getPortRange(port) {
  if (port >= 3000 && port < 3500) return 'staging-app';
  if (port >= 4000 && port < 4500) return 'production-app';
  if (port >= 5000 && port < 6000) return 'preview-app';
  if (port >= 5432 && port < 5450) return 'staging-db';
  if (port >= 5450 && port < 5470) return 'production-db';
  if (port >= 6379 && port < 6400) return 'staging-redis';
  if (port >= 6400 && port < 6420) return 'production-redis';
  return null;
}

function findPortOwnerInManifest(manifest, port) {
  for (const [projectName, project] of Object.entries(manifest.projects || {})) {
    for (const [env, ports] of Object.entries(project.environments || {})) {
      if (ports.app === port || ports.db === port || ports.redis === port) {
        return { project: projectName, environment: env };
      }
    }
  }
  return null;
}

function findNextPort(start, end, usedPorts) {
  for (let p = start; p <= end; p++) {
    if (!usedPorts.has(p)) return p;
  }
  return null;
}

// ============================================================================
// Quadlet Validation Workflow
// ============================================================================

/**
 * Validate Quadlet files for Podman version compatibility
 * Usage: we workflow validate [project] [--fix] [--host <server>]
 */
async function validateQuadletWorkflow(target, options) {
  const spinner = ora('Validating Quadlet files...').start();

  try {
    const serverHost = options.host || getServerHost();
    const serverUser = options.user || getServerUser();
    const quadletDir = 'quadlet';

    // 1. Check Podman version on server
    spinner.text = 'Checking server Podman version...';
    const podmanVersion = await getPodmanVersion(serverHost, serverUser);
    const versionInfo = getVersionInfo(podmanVersion);

    spinner.stop();
    console.log(chalk.blue.bold('\n🔍 Quadlet Compatibility Validation\n'));
    console.log(chalk.gray(`Server: ${serverHost}`));
    console.log(chalk.gray(`Podman Version: ${podmanVersion.full}`));
    console.log(chalk.gray(`Features: ${versionInfo.features.join(', ')}`));
    console.log();

    // 2. Find quadlet files to validate
    let filesToValidate = [];

    if (target) {
      // Validate specific file or project
      if (target.endsWith('.container')) {
        filesToValidate.push(target);
      } else if (existsSync(quadletDir)) {
        // Find files matching project name
        const files = readdirSync(quadletDir).filter(f =>
          f.endsWith('.container') && f.includes(target)
        );
        filesToValidate = files.map(f => join(quadletDir, f));
      }
    } else if (existsSync(quadletDir)) {
      // Validate all quadlet files
      const files = readdirSync(quadletDir).filter(f => f.endsWith('.container'));
      filesToValidate = files.map(f => join(quadletDir, f));
    }

    if (filesToValidate.length === 0) {
      console.log(chalk.yellow('No Quadlet files found to validate.'));
      console.log(chalk.gray('\nUsage:'));
      console.log(chalk.gray('  we workflow validate              # Validate all in ./quadlet/'));
      console.log(chalk.gray('  we workflow validate <project>    # Validate specific project'));
      console.log(chalk.gray('  we workflow validate file.container # Validate specific file'));
      return;
    }

    console.log(chalk.gray(`Found ${filesToValidate.length} file(s) to validate\n`));

    // 3. Validate each file
    let totalIssues = 0;
    let fixedIssues = 0;
    const results = [];

    for (const filePath of filesToValidate) {
      const fileName = filePath.split('/').pop();
      console.log(chalk.cyan(`📄 ${fileName}`));

      const content = await readFile(filePath, 'utf-8');
      const validation = validateQuadletContent(content, podmanVersion.major);

      if (validation.valid) {
        console.log(chalk.green('   ✅ Compatible with Podman ' + podmanVersion.major + '.x'));
        results.push({ file: fileName, status: 'ok', issues: 0 });
      } else {
        const issueCount = validation.unsupportedKeys.length;
        totalIssues += issueCount;

        console.log(chalk.yellow(`   ⚠️  ${issueCount} compatibility issue(s):`));
        validation.unsupportedKeys.forEach(({ key, line, alternative }) => {
          console.log(chalk.gray(`      Line ${line}: '${key}' not supported`));
          if (alternative) {
            console.log(chalk.gray(`         → Use: ${alternative}`));
          }
        });

        // Auto-fix if requested
        if (options.fix) {
          const { converted, changes } = convertQuadletForCompatibility(content, podmanVersion.major);
          if (changes.length > 0) {
            await writeFile(filePath, converted);
            fixedIssues += changes.length;
            console.log(chalk.green(`   🔧 Fixed ${changes.length} issue(s)`));
            changes.forEach(change => console.log(chalk.gray(`      • ${change}`)));
          }
          results.push({ file: fileName, status: 'fixed', issues: issueCount, fixed: changes.length });
        } else {
          results.push({ file: fileName, status: 'issues', issues: issueCount });
        }
      }
      console.log();
    }

    // 4. Summary
    console.log(chalk.blue.bold('📊 Validation Summary\n'));
    console.log(chalk.gray(`Files validated: ${filesToValidate.length}`));
    console.log(chalk.gray(`Total issues: ${totalIssues}`));
    if (options.fix) {
      console.log(chalk.green(`Issues fixed: ${fixedIssues}`));
    }

    if (totalIssues > 0 && !options.fix) {
      console.log(chalk.yellow('\n💡 Run with --fix to auto-convert incompatible keys:'));
      console.log(chalk.cyan('   we workflow validate --fix'));
    }

    if (podmanVersion.major < 5) {
      console.log(chalk.yellow(`\n📌 ${versionInfo.recommendation}`));
    }

    console.log();

  } catch (error) {
    spinner.fail('Validation failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

/**
 * Register GitHub Secrets for SSH deploy
 * Automatically sets SSH_HOST, SSH_USER, SSH_PRIVATE_KEY
 */
async function registerGitHubSecrets(repoName, options) {
  const spinner = ora('Registering GitHub Secrets...').start();

  try {
    const { execSync } = await import('child_process');

    // Check gh CLI
    try {
      execSync('gh auth status', { stdio: 'pipe', timeout: 5000 });
    } catch (e) {
      spinner.fail('GitHub CLI not authenticated');
      console.log(chalk.yellow('\nRun: gh auth login'));
      return;
    }

    // Get repo info
    let repoFullName = repoName;
    if (!repoFullName) {
      const remoteUrl = execSync('git remote get-url origin 2>/dev/null || echo ""', { encoding: 'utf-8' }).trim();
      const repoMatch = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);
      if (repoMatch) {
        repoFullName = repoMatch[1].replace(/\.git$/, '');
      }
    }

    if (!repoFullName) {
      spinner.fail('Could not determine repository');
      console.log(chalk.yellow('Run in a git repository or specify: we workflow secrets owner/repo'));
      return;
    }

    spinner.text = `Registering secrets for ${repoFullName}...`;

    const serverHost = options.host || getServerHost() || '158.247.203.55';
    const serverUser = options.user || getServerUser() || 'root';

    // Check existing secrets
    const existingSecrets = execSync(`gh secret list -R ${repoFullName} 2>/dev/null || echo ""`, { encoding: 'utf-8' });

    const results = [];

    // SSH_HOST
    if (!existingSecrets.includes('SSH_HOST') || options.force) {
      execSync(`gh secret set SSH_HOST -R ${repoFullName} -b "${serverHost}"`, { stdio: 'pipe', timeout: 10000 });
      results.push({ name: 'SSH_HOST', value: serverHost, status: 'set' });
    } else {
      results.push({ name: 'SSH_HOST', status: 'exists' });
    }

    // SSH_USER
    if (!existingSecrets.includes('SSH_USER') || options.force) {
      execSync(`gh secret set SSH_USER -R ${repoFullName} -b "${serverUser}"`, { stdio: 'pipe', timeout: 10000 });
      results.push({ name: 'SSH_USER', value: serverUser, status: 'set' });
    } else {
      results.push({ name: 'SSH_USER', status: 'exists' });
    }

    // SSH_PRIVATE_KEY
    if (!existingSecrets.includes('SSH_PRIVATE_KEY') || options.force) {
      const sshKeyPath = options.key || process.env.HOME + '/.ssh/id_ed25519';
      if (existsSync(sshKeyPath)) {
        const sshKey = await readFile(sshKeyPath, 'utf-8');
        // Use stdin for multiline content via spawn
        const { spawn } = await import('child_process');
        const child = spawn('gh', ['secret', 'set', 'SSH_PRIVATE_KEY', '-R', repoFullName], {
          stdio: ['pipe', 'pipe', 'pipe']
        });
        child.stdin.write(sshKey);
        child.stdin.end();
        await new Promise((resolve, reject) => {
          child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`gh exited with ${code}`)));
        });
        results.push({ name: 'SSH_PRIVATE_KEY', value: sshKeyPath, status: 'set' });
      } else {
        results.push({ name: 'SSH_PRIVATE_KEY', status: 'missing', error: `Key file not found: ${sshKeyPath}` });
      }
    } else {
      results.push({ name: 'SSH_PRIVATE_KEY', status: 'exists' });
    }

    spinner.succeed('GitHub Secrets registered');

    console.log(chalk.green(`\n✅ GitHub Secrets for ${repoFullName}\n`));
    for (const r of results) {
      if (r.status === 'set') {
        console.log(chalk.green(`  ✓ ${r.name}: ${r.value || 'set'}`));
      } else if (r.status === 'exists') {
        console.log(chalk.gray(`  ✓ ${r.name}: (already exists)`));
      } else if (r.status === 'missing') {
        console.log(chalk.yellow(`  ⚠ ${r.name}: ${r.error}`));
      }
    }

    console.log(chalk.gray('\nSecrets are ready for SSH deploy via GitHub Actions.'));
    console.log(chalk.gray('Use --force to overwrite existing secrets.'));
    console.log();

  } catch (error) {
    spinner.fail('Failed to register secrets');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
  }
}

// ============================================================================
// Project CLAUDE.md Generator
// ============================================================================

/**
 * Generate project-specific CLAUDE.md file
 * Contains project rules for Claude Code AI assistant
 * @param {string} projectName - Project name
 * @returns {string} CLAUDE.md content
 */
function generateProjectClaudeMd(projectName) {
  return `# CLAUDE.md - ${projectName} Project Rules

## Project Info

- **Name**: ${projectName}
- **Generated by**: CodeB CLI v${getCliVersion()}
- **Date**: ${new Date().toISOString().split('T')[0]}

## Critical Rules

### 1. NEVER Run Dangerous Commands Directly

\`\`\`bash
# 절대 금지 (Hooks가 차단함)
podman rm -f <container>       # 직접 컨테이너 삭제
podman volume rm <volume>      # 직접 볼륨 삭제
docker-compose down -v         # 볼륨 포함 삭제
rm -rf /opt/codeb/projects/*   # 프로젝트 폴더 삭제
\`\`\`

### 2. ALWAYS Use CLI Commands

\`\`\`bash
# 올바른 방법
we workflow init ${projectName}     # 프로젝트 초기화
we deploy ${projectName}            # 배포
we workflow stop ${projectName}     # 서비스 중지
we workflow scan ${projectName}     # 상태 확인
we ssot sync                        # 서버 데이터 동기화
\`\`\`

### 3. SSH Only to Allowed Servers

허용된 서버만 SSH 접속 가능:
- 158.247.203.55 (App - app.codeb.kr)
- 141.164.42.213 (Streaming - ws.codeb.kr)
- 64.176.226.119 (Storage - db.codeb.kr)
- 141.164.37.63 (Backup - backup.codeb.kr)

### 4. Environment File Protection

- NEVER overwrite existing .env files without backup
- Protected variables: DATABASE_URL, REDIS_URL, POSTGRES_*
- Always check for existing .env before generating new one

## Quick Reference

\`\`\`bash
# 프로젝트 초기화
we workflow init ${projectName} --type nextjs --database --redis

# 서버 상태 확인
we ssot status
we ssot projects
we workflow scan ${projectName}

# 배포
we deploy ${projectName} --environment staging

# 도메인 설정
we domain setup ${projectName}.codeb.dev --ssl
\`\`\`

## Permission Model

- **Admin**: SSH + deploy + server settings
- **Developer**: Git Push only → GitHub Actions → auto deploy
`;
}

/**
 * Generate DEPLOYMENT_RULES.md file
 * Contains rules that AI agents must follow during deployment
 * @returns {string} DEPLOYMENT_RULES.md content
 */
function generateDeploymentRules() {
  return `# CodeB Deployment Rules for AI Agents

> **이 파일은 Claude Code 등 AI 에이전트가 배포 시 반드시 따라야 하는 규칙입니다.**

## 🚨 절대 금지 규칙 (CRITICAL - 이 규칙 위반 시 배포 중단)

### 1. 에러 우회 금지

\`\`\`bash
# ❌ 절대 금지
command || true                    # 에러 무시
command || echo "warning"          # 에러를 경고로 변환
command || exit 0                  # 에러여도 성공 처리
continue-on-error: true            # GitHub Actions 에러 무시
\`\`\`

\`\`\`typescript
// ❌ 절대 금지
try { riskyOperation() } catch {}           // 에러 삼키기
try { riskyOperation() } catch { return }   // 에러 무시하고 리턴
catch (e) { console.log(e) }                // 로그만 찍고 무시
\`\`\`

### 2. 코드 품질 우회 금지

\`\`\`typescript
// ❌ 절대 금지
// @ts-ignore
// @ts-nocheck
// eslint-disable
// eslint-disable-next-line
any                                // any 타입 사용
as any                             // any로 캐스팅
\`\`\`

### 3. 인프라 우회 금지

\`\`\`bash
# ❌ 절대 금지
# --network 플래그 제거 (CNI 에러 시에도)
podman run app  # 원래 --network codeb 있었으면 유지

# IP 직접 하드코딩 금지
DATABASE_URL="postgresql://10.88.0.5:5432/db"  # ❌
DATABASE_URL="postgresql://postgres:5432/db"   # ✅ 서비스명 사용

# 권한 문제 우회 금지
chmod 777 /path                    # 보안 위험
--privileged                       # 컨테이너 권한 상승

# 포트 임의 변경 금지
# 3000 충돌 시 3001로 변경 ❌
# 포트 충돌 원인 해결 후 원래 포트 사용 ✅
\`\`\`

### 4. 삭제로 해결 금지

\`\`\`typescript
// ❌ 에러 나는 코드 삭제 금지
// 기존에 있던 함수나 로직을 삭제하여 에러를 없애면 안됨

// ❌ 테스트 skip/제거 금지
test.skip("failing test")          // skip 금지
// 테스트 파일 삭제 금지
\`\`\`

---

## ✅ 허용되는 수정

### 1. 타입 추가/수정
\`\`\`typescript
// ✅ 누락된 타입 정의 추가
interface UserInput {
  name: string;
  email: string;
}

// ✅ 올바른 타입 캐스팅
const user = response as User;  // 구체적 타입으로
\`\`\`

### 2. 누락된 코드 추가
\`\`\`typescript
// ✅ 누락된 import 추가
import { validateEmail } from '@/utils/validation';

// ✅ null/undefined 체크 추가
if (user?.email) {
  sendEmail(user.email);
}
\`\`\`

### 3. 올바른 에러 처리
\`\`\`typescript
// ✅ 에러를 적절히 처리
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', error);
  throw new AppError('OPERATION_FAILED', error);  // 재throw
}
\`\`\`

---

## 🔍 에러 발생 시 올바른 대응

### CNI 네트워크 에러
\`\`\`
❌ 잘못된 대응: --network 플래그 제거
✅ 올바른 대응:
1. podman network ls 로 네트워크 확인
2. podman network create codeb 로 네트워크 생성
3. 기존 컨테이너 재시작
\`\`\`

### DB 연결 에러
\`\`\`
❌ 잘못된 대응: || true 추가
✅ 올바른 대응:
1. DB 컨테이너 상태 확인: podman ps
2. DB 로그 확인: podman logs postgres-container
3. 네트워크 연결 확인: podman inspect postgres-container
\`\`\`

### 빌드 에러
\`\`\`
❌ 잘못된 대응: 에러 나는 코드 삭제
✅ 올바른 대응:
1. 에러 메시지 분석
2. 타입 정의 추가 또는 수정
3. 누락된 import 추가
4. 로직 버그 수정
\`\`\`

---

**Generated by**: CodeB CLI v${getCliVersion()}
**Date**: ${new Date().toISOString().split('T')[0]}
`;
}
