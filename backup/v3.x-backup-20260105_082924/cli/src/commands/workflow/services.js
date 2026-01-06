/**
 * Services Module
 *
 * Handles service management workflows:
 * - addResourceWorkflow: Add missing resources (DB, Redis, Storage) to existing project
 * - addServiceWorkflow: Add PostgreSQL/Redis service containers
 * - fixNetworkWorkflow: Migrate containers to codeb-network
 * - syncWorkflow: Push workflow changes to server
 *
 * @module workflow/services
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { getServerHost, getServerUser, getDbPassword, getBaseDomain } from '../../lib/config.js';
import {
  readProjectRegistry,
  writeProjectRegistry,
  generateQuadletTemplate,
  provisionPostgresDatabase,
  provisionRedis,
  provisionStorage,
  generateServerEnvContent,
  generateLocalEnvContent
} from './index.js';
import { scanProjectResources } from './resource-scanner.js';
import { createServerEnvFiles } from './env-generator.js';

// ============================================================================
// Add Resource Workflow
// ============================================================================

/**
 * Add missing resources to existing project
 * @param {string} projectName - Project name
 * @param {Object} options - Options
 */
export async function addResourceWorkflow(projectName, options) {
  if (!projectName) {
    console.log(chalk.red('\n Error: Project name is required'));
    console.log(chalk.gray('   Usage: we workflow add-resource <project-name> --database --redis --storage\n'));
    return;
  }

  const spinner = ora('Checking project resources...').start();
  const serverHost = options.host || getServerHost();
  const serverUser = options.user || getServerUser();

  if (!serverHost) {
    spinner.fail('Server host not configured');
    console.log(chalk.yellow('\n Configure server host: we config init\n'));
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
    if (options.storage !== false) requestedResources.push('storage');

    // If no specific resources requested, add all missing
    const resourcesToAdd = requestedResources.length > 0
      ? requestedResources.filter(r => missingResources.includes(r))
      : missingResources;

    if (resourcesToAdd.length === 0) {
      console.log(chalk.green(' All requested resources already exist!\n'));

      // Show current resource status
      console.log(chalk.cyan.bold('Current Resources:'));
      console.log(`   Database: ${scanResult.database.exists ? chalk.green(' ' + scanResult.database.name) : chalk.gray('Not configured')}`);
      console.log(`   Redis:    ${scanResult.redis.exists ? chalk.green(' db:' + scanResult.redis.dbIndex + ' prefix:' + scanResult.redis.prefix) : chalk.gray('Not configured')}`);
      console.log(`   Storage:  ${scanResult.storage.exists ? chalk.green(' ' + scanResult.storage.path) : chalk.gray('Not configured')}`);
      console.log('');
      return;
    }

    // Show what will be added
    console.log(chalk.cyan.bold('Resources to Add:'));
    for (const resource of resourcesToAdd) {
      console.log(`  - ${resource}`);
    }
    console.log('');

    // Interactive confirmation unless --force
    if (!options.force && !options.noInteractive) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Proceed with adding these resources?',
        default: true
      }]);

      if (!confirm) {
        console.log(chalk.yellow('\n Cancelled\n'));
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
    console.log(chalk.green.bold('\n Resources Added Successfully!\n'));

    if (provisionResult.database) {
      console.log(chalk.cyan(' PostgreSQL:'));
      console.log(`   Database: ${provisionResult.database.database}`);
      console.log(`   User:     ${provisionResult.database.user}`);
      console.log(`   Password: ${chalk.gray('(saved to ENV files)')}`);
    }

    if (provisionResult.redis) {
      console.log(chalk.cyan('\n Redis:'));
      console.log(`   DB Index: ${provisionResult.redis.dbIndex}`);
      console.log(`   Prefix:   ${provisionResult.redis.prefix}`);
    }

    if (provisionResult.storage) {
      console.log(chalk.cyan('\n Storage:'));
      console.log(`   Path: ${provisionResult.storage.path}`);
      console.log(`   Dirs: ${provisionResult.storage.directories.join(', ')}`);
    }

    console.log(chalk.gray('\n---'));
    console.log(chalk.gray('Files updated:'));
    console.log(chalk.gray(`  - Server: /opt/codeb/envs/${projectName}-${options.environment || 'production'}.env`));
    console.log(chalk.gray(`  - Local:  .env.local`));
    console.log(chalk.gray(`  - Registry: /opt/codeb/config/project-registry.json`));
    console.log('');

  } catch (error) {
    spinner.fail('Failed to add resources');
    console.log(chalk.red(`\n Error: ${error.message}\n`));
    if (error.stack && process.env.DEBUG) {
      console.log(chalk.gray(error.stack));
    }
  }
}

// ============================================================================
// Add Service Workflow
// ============================================================================

/**
 * Add PostgreSQL or Redis service container to existing project
 * @param {string} projectName - Project name
 * @param {Object} options - Options
 */
export async function addServiceWorkflow(projectName, options) {
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
      projectNames.forEach(p => console.log(chalk.cyan(`  - ${p}`)));
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
      console.log(chalk.yellow(`\n ${serviceKey} already exists for ${containerPrefix}`));
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
    console.log(chalk.blue.bold('\n Add Service Plan\n'));
    console.log(chalk.gray(`Project: ${projectName}`));
    console.log(chalk.gray(`Environment: ${environment}`));
    console.log(chalk.gray(`Service: ${serviceKey}`));
    console.log(chalk.gray(`Container: ${containerPrefix}-${serviceKey}`));
    console.log(chalk.gray(`Port: ${servicePort}`));
    console.log(chalk.gray(`Network: ${currentNetwork}`));

    if (currentNetwork !== 'codeb-network') {
      console.log(chalk.yellow(`\n Warning: Container uses "${currentNetwork}" network`));
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

    console.log(chalk.green('\n Service Added\n'));
    console.log(chalk.gray(`Container: ${containerPrefix}-${serviceKey}`));
    console.log(chalk.gray(`Status: ${verifyOutput || 'Starting...'}`));
    console.log(chalk.gray(`Port: ${servicePort}`));

    if (isPostgres) {
      console.log(chalk.blue('\n Connection String:'));
      console.log(chalk.cyan(`  DATABASE_URL=postgresql://postgres:${dbPassword}@${containerPrefix}-postgres:5432/${dbName}?schema=public`));
      console.log(chalk.gray(`  (External: postgresql://postgres:${dbPassword}@${serverHost}:${servicePort}/${dbName})`));
    } else {
      console.log(chalk.blue('\n Connection String:'));
      console.log(chalk.cyan(`  REDIS_URL=redis://${containerPrefix}-redis:6379`));
      console.log(chalk.gray(`  (External: redis://${serverHost}:${servicePort})`));
    }

    console.log(chalk.yellow('\n Next steps:'));
    console.log(chalk.gray('  1. Update app\'s environment variables with the connection string'));
    console.log(chalk.gray('  2. Add dependency to app\'s Quadlet file:'));
    console.log(chalk.cyan(`     After=network-online.target ${containerPrefix}-${serviceKey}.service`));
    console.log(chalk.cyan(`     Requires=${containerPrefix}-${serviceKey}.service`));
    console.log(chalk.gray('  3. Restart app service: systemctl restart ' + containerPrefix + '.service'));
    console.log();

  } catch (error) {
    spinner.fail('Add service failed');
    console.log(chalk.red(`\n Error: ${error.message}\n`));
    process.exit(1);
  }
}

// ============================================================================
// Fix Network Workflow
// ============================================================================

/**
 * Migrate containers to codeb-network
 * @param {string} projectName - Optional project name filter
 * @param {Object} options - Options
 */
export async function fixNetworkWorkflow(projectName, options) {
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
      console.log(chalk.green('\n Created codeb-network (10.89.0.0/24)\n'));
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
      console.log(chalk.green('\n No network fixes needed\n'));
      return;
    }

    spinner.stop();

    // 4. Show plan
    console.log(chalk.blue.bold('\n Network Fix Plan\n'));
    console.log(chalk.gray(`Target network: codeb-network (10.89.0.0/24)`));
    console.log(chalk.yellow(`\nContainers to migrate (${containersToFix.length}):`));

    containersToFix.forEach(c => {
      console.log(chalk.gray(`  - ${c.name}`));
      console.log(chalk.gray(`    Current: ${c.networks} -> codeb-network`));
    });

    console.log(chalk.yellow('\n Warning: This will restart the containers!'));

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
          // Safe container replacement: graceful stop (30s wait) then remove
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
    console.log(chalk.green('\n Network Migration Complete\n'));

    if (results.success.length > 0) {
      console.log(chalk.green(`Successfully migrated (${results.success.length}):`));
      results.success.forEach(name => console.log(chalk.cyan(`   ${name}`)));
    }

    if (results.failed.length > 0) {
      console.log(chalk.red(`\nFailed (${results.failed.length}):`));
      results.failed.forEach(f => {
        console.log(chalk.red(`   ${f.name}: ${f.reason}`));
      });
    }

    console.log(chalk.blue('\n DNS Resolution:'));
    console.log(chalk.gray('  Containers on codeb-network can now use DNS names:'));
    console.log(chalk.cyan('  DATABASE_URL=postgresql://user:pass@myapp-postgres:5432/db'));
    console.log(chalk.cyan('  REDIS_URL=redis://myapp-redis:6379'));

    console.log(chalk.yellow('\n Next steps:'));
    if (results.failed.length > 0) {
      console.log(chalk.gray('  1. Fix failed containers manually'));
    }
    console.log(chalk.gray('  2. Update DATABASE_URL to use container DNS names'));
    console.log(chalk.gray('  3. Verify app connectivity with: podman exec <app> ping <db-container>'));
    console.log();

  } catch (error) {
    spinner.fail('Network fix failed');
    console.log(chalk.red(`\n Error: ${error.message}\n`));
    process.exit(1);
  }
}
