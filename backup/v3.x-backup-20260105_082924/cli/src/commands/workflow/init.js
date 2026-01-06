/**
 * Init Module
 *
 * Handles project initialization workflow:
 * - Interactive configuration
 * - Port validation and auto-assignment
 * - Quadlet file generation
 * - GitHub Actions workflow generation
 * - Server infrastructure provisioning
 * - Environment file generation
 *
 * @module workflow/init
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { getServerHost, getServerUser } from '../../lib/config.js';
import {
  // Template generators
  generateGitHubActionsWorkflow,
  generateDockerfile,
  generateProjectSet,
  // Registry management
  writeProjectRegistry,
  // Port utilities
  autoScanAndValidatePorts,
  // Provisioning
  provisionServerInfrastructure,
  backupEnvToServer,
  // ENV generators
  generateServerEnvContent,
  generateLocalEnvContent,
  generateEnvTemplate,
  generateLocalEnvForDev,
  mergeEnvFiles
} from './index.js';
import { generateProjectClaudeMd, generateDeploymentRules } from './templates.js';
import { fullPreDeployScan } from './pre-deploy-scan.js';

/**
 * Main init workflow handler
 * Initializes a new project with complete configuration
 */
export async function initWorkflow(projectName, options) {
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
          console.log(chalk.cyan(`\n Found existing server credentials for '${scanProjectName}':`));
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
          console.log(chalk.yellow('\n Port Conflicts Detected:'));
          for (const conflict of portValidation.conflicts) {
            console.log(chalk.red(`   - ${conflict.label}: Port ${conflict.originalPort} is used by "${conflict.conflictWith}"`));
            console.log(chalk.green(`     -> Auto-assigned: ${conflict.suggestedPort}`));
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
            console.log(chalk.yellow(`    ${warning}`));
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
          console.log(chalk.yellow('\n Existing environment file detected with DB configuration:'));
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
              console.log(chalk.green(`   Backup created: ${backupPath}`));
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
          console.log(chalk.gray('\n   Server credentials generated but not applied to local .env'));
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
        console.log(chalk.yellow(`\n Server provisioning error: ${serverError.message}`));
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

    console.log(chalk.green('\n Workflow Initialization Complete\n'));

    // Show port validation summary
    if (portValidation?.scanned) {
      console.log(chalk.blue(' Port Scan Summary:'));
      console.log(chalk.gray(`  Scanned ${portValidation.usedPortCount} ports in use on server`));
      if (portValidation.adjustments.length > 0) {
        console.log(chalk.yellow(`  ${portValidation.adjustments.length} port(s) were auto-adjusted to avoid conflicts`));
        for (const adj of portValidation.adjustments) {
          console.log(chalk.gray(`    - ${adj.label}: ${adj.from} -> ${adj.to}`));
        }
      } else {
        console.log(chalk.green('   No port conflicts detected'));
      }
      console.log('');
    }

    console.log(chalk.gray('Generated files:'));
    files.forEach(f => console.log(chalk.cyan(`  - ${f}`)));

    if (provisionResult) {
      console.log(chalk.green('\n Server Resources Provisioned:'));
      if (provisionResult.database) {
        console.log(chalk.cyan(`   PostgreSQL: ${provisionResult.database.database}`));
        console.log(chalk.gray(`    User: ${provisionResult.database.user}`));
      }
      if (provisionResult.redis) {
        console.log(chalk.cyan(`   Redis: DB ${provisionResult.redis.db_index}, Prefix "${provisionResult.redis.prefix}"`));
      }
      if (provisionResult.storage) {
        console.log(chalk.cyan(`   Storage: ${provisionResult.storage.path}`));
      }

      console.log(chalk.green('\n Server ENV Files:'));
      console.log(chalk.cyan(`  - /opt/codeb/envs/${config.projectName}-production.env`));
      console.log(chalk.cyan(`  - /opt/codeb/envs/${config.projectName}-staging.env`));
    }

    console.log(chalk.blue('\n Local Development Setup:'));
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
    // MCP API 사용 (기본값) - CODEB_API_KEY 필요
    // SSH는 Admin 전용
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
        console.log(chalk.blue(`\n Registering GitHub Secrets for ${repoFullName}...`));

        // Check if secrets already exist
        const existingSecrets = execSync(`gh secret list -R ${repoFullName} 2>/dev/null || echo ""`, { encoding: 'utf-8' });

        // CODEB_API_KEY (MCP API 배포용 - 기본값)
        if (!existingSecrets.includes('CODEB_API_KEY')) {
          console.log(chalk.yellow('   CODEB_API_KEY: Not set - get from app.codeb.kr/settings'));
        } else {
          console.log(chalk.green('   CODEB_API_KEY (already exists)'));
        }

        // GHCR_PAT (GitHub Container Registry)
        if (!existingSecrets.includes('GHCR_PAT')) {
          console.log(chalk.yellow('   GHCR_PAT: Not set - create at github.com/settings/tokens'));
        } else {
          console.log(chalk.green('   GHCR_PAT (already exists)'));
        }

        secretsRegistered = existingSecrets.includes('CODEB_API_KEY');
      }
    } catch (e) {
      // gh CLI not available or not authenticated - show manual instructions
    }

    console.log(chalk.yellow('\n Next steps:'));
    console.log(chalk.gray('  1. Run: we workflow sync ' + config.projectName + ' (copy files to server)'));
    if (!secretsRegistered) {
      console.log(chalk.gray('  2. Add GitHub Secrets (run: we workflow secrets):'));
      console.log(chalk.cyan('     - CODEB_API_KEY: MCP API 배포 키 (app.codeb.kr/settings)'));
      console.log(chalk.cyan('     - GHCR_PAT: GitHub Container Registry 토큰'));
    } else {
      console.log(chalk.green('  2.  GitHub Secrets already configured'));
    }
    console.log(chalk.gray('  3. Push to GitHub to trigger deployment'));
    console.log(chalk.gray('\n   Deploy: GitHub builds -> ghcr.io -> MCP API deploys'));
    console.log(chalk.gray('   Local dev connects to server DB automatically'));
    console.log();

    // Output environment info for reference
    if (config.useDatabase || config.useRedis) {
      console.log(chalk.blue(' Project Infrastructure:'));
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
    console.log(chalk.red(`\n Error: ${error.message}\n`));
    process.exit(1);
  }
}
