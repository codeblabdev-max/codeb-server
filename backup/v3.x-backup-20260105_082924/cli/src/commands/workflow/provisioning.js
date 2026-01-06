/**
 * Server Infrastructure Provisioning
 *
 * Handles provisioning of server resources:
 * - PostgreSQL database and user creation
 * - Redis DB index allocation
 * - Storage directory creation
 * - ENV backup/restore to backup server
 */

import chalk from 'chalk';
import { ssotClient } from '../../lib/ssot-client.js';
import { mcpClient } from '../../lib/mcp-client.js';
import { readProjectRegistry, writeProjectRegistry } from './registry.js';
import { findNextRedisDbIndex } from './port-utils.js';

// Backup server configuration
const BACKUP_SERVER = {
  host: '141.164.37.63',  // backup.codeb.kr
  user: 'root',
  envPath: '/opt/codeb/env-backup'
};

/**
 * Generate secure random password
 * @param {number} length - Password length
 * @returns {string} Random password
 */
export function generateSecurePassword(length = 24) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Provision PostgreSQL database and user for project
 * Uses MCP for status check, SSH for actual database creation
 * @param {Object} config - Configuration
 * @returns {Promise<Object>} Database credentials
 */
export async function provisionPostgresDatabase(config) {
  const { projectName, serverHost, serverUser, dbPassword = 'postgres' } = config;

  const dbName = projectName.replace(/-/g, '_');
  const dbUser = `${dbName}_user`;

  // 1. Check existing DB info in registry
  try {
    const registry = await readProjectRegistry(serverHost, serverUser);
    const existingDb = registry.projects?.[projectName]?.resources?.database;

    if (existingDb && existingDb.password) {
      console.log(chalk.green(`  Found existing database credentials for ${projectName}`));
      return {
        database: existingDb.name || dbName,
        user: existingDb.user || dbUser,
        password: existingDb.password,
        host: 'codeb-postgres',
        port: 5432
      };
    }
  } catch (e) {
    // Registry not available, continue to create
  }

  // 2. Generate new password (only if no existing DB)
  const userPassword = config.userPassword || generateSecurePassword();

  // Try MCP first (preferred path)
  try {
    const isConnected = await mcpClient.ensureConnected();
    if (isConnected) {
      const serverAnalysis = await mcpClient.callTool('analyze_server', {
        includeContainers: true,
        includeDatabases: true
      });

      const analysis = typeof serverAnalysis === 'string' ? JSON.parse(serverAnalysis) : serverAnalysis;
      const hasPostgres = analysis?.containers?.some(c =>
        c.name?.includes('postgres') || c.name?.includes('codeb-postgres')
      );

      if (!hasPostgres) {
        throw new Error('Shared PostgreSQL container (codeb-postgres) not found. Run "we workflow setup-infra" first.');
      }

      // Register in SSOT
      await ssotClient.registerProject(projectName, config.projectType || 'nextjs', {
        description: `Database: ${dbName}`,
      });
    }
  } catch (mcpError) {
    console.log(chalk.gray(`  MCP check passed, using SSH for database creation...`));
  }

  // SSH for database creation
  const { execSync } = await import('child_process');

  // Check if shared PostgreSQL container exists
  const containerCheck = `ssh ${serverUser}@${serverHost} "podman ps --filter name=codeb-postgres --format '{{.Names}}'" 2>/dev/null`;
  let containerOutput;
  try {
    containerOutput = execSync(containerCheck, { encoding: 'utf-8', timeout: 30000 }).trim();
  } catch {
    containerOutput = '';
  }

  if (!containerOutput) {
    throw new Error('Shared PostgreSQL container (codeb-postgres) not found. Run "we workflow setup-infra" first.');
  }

  // Create database and user
  const createDbSql = `
    SELECT 'CREATE DATABASE ${dbName}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${dbName}')\\gexec
    DO \\$\\$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${dbUser}') THEN
        CREATE USER ${dbUser} WITH PASSWORD '${userPassword}';
      END IF;
    END
    \\$\\$;
    GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser};
    \\c ${dbName}
    GRANT ALL ON SCHEMA public TO ${dbUser};
  `;

  const createCmd = `ssh ${serverUser}@${serverHost} "podman exec codeb-postgres psql -U postgres -c \\"${createDbSql.replace(/\n/g, ' ')}\\"" 2>/dev/null || true`;

  try {
    execSync(createCmd, { encoding: 'utf-8', timeout: 60000 });
  } catch (e) {
    // Try simpler approach if complex SQL fails
    const simpleSql = [
      `CREATE DATABASE ${dbName};`,
      `CREATE USER ${dbUser} WITH PASSWORD '${userPassword}';`,
      `GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser};`
    ];

    for (const sql of simpleSql) {
      try {
        execSync(`ssh ${serverUser}@${serverHost} "podman exec codeb-postgres psql -U postgres -c '${sql}'" 2>/dev/null || true`,
          { encoding: 'utf-8', timeout: 30000 });
      } catch { /* ignore individual errors */ }
    }
  }

  return {
    database: dbName,
    user: dbUser,
    password: userPassword,
    host: 'codeb-postgres',
    port: 5432
  };
}

/**
 * Provision Redis for project (allocate DB index and prefix)
 * @param {Object} config - Configuration
 * @param {Object} registry - Project registry
 * @returns {Promise<Object>} Redis configuration
 */
export async function provisionRedis(config, registry) {
  const { projectName } = config;

  const dbIndex = findNextRedisDbIndex(registry);
  const prefix = `${projectName}:`;

  return {
    enabled: true,
    db_index: dbIndex,
    prefix: prefix,
    host: 'codeb-redis',
    port: 6379
  };
}

/**
 * Provision storage directories for project
 * @param {Object} config - Configuration
 * @returns {Promise<Object>} Storage configuration
 */
export async function provisionStorage(config) {
  const { execSync } = await import('child_process');
  const { projectName, serverHost, serverUser } = config;

  const basePath = `/opt/codeb/data/${projectName}`;
  const directories = ['uploads', 'cache', 'temp'];

  // Create directories
  const mkdirCmd = `ssh ${serverUser}@${serverHost} "mkdir -p ${basePath}/{${directories.join(',')}}"`;
  execSync(mkdirCmd, { timeout: 30000 });

  // Set permissions
  const chmodCmd = `ssh ${serverUser}@${serverHost} "chmod -R 755 ${basePath}"`;
  execSync(chmodCmd, { timeout: 30000 });

  return {
    enabled: true,
    path: basePath,
    directories: directories
  };
}

/**
 * Backup ENV to backup server
 * @param {Object} config - Configuration
 * @returns {Promise<{success: boolean, paths: Object}>}
 */
export async function backupEnvToServer(config) {
  const { execSync } = await import('child_process');
  const { projectName, environment, envContent, isInitial = false } = config;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const projectDir = `${BACKUP_SERVER.envPath}/${projectName}`;
  const envDir = `${projectDir}/${environment}`;

  const paths = {
    project: projectDir,
    env: envDir,
    current: `${envDir}/current.env`,
    timestamped: `${envDir}/${timestamp}.env`,
    master: isInitial ? `${envDir}/master.env` : null
  };

  try {
    // 1. Create directory
    execSync(
      `ssh ${BACKUP_SERVER.user}@${BACKUP_SERVER.host} "mkdir -p ${envDir}"`,
      { timeout: 10000 }
    );

    // 2. Save timestamped version
    execSync(
      `ssh ${BACKUP_SERVER.user}@${BACKUP_SERVER.host} "cat > ${paths.timestamped}" << 'ENVEOF'
${envContent}
ENVEOF`,
      { timeout: 30000 }
    );

    // 3. Copy to current.env
    execSync(
      `ssh ${BACKUP_SERVER.user}@${BACKUP_SERVER.host} "cp ${paths.timestamped} ${paths.current}"`,
      { timeout: 10000 }
    );

    // 4. Save as master.env on initial creation
    if (isInitial) {
      execSync(
        `ssh ${BACKUP_SERVER.user}@${BACKUP_SERVER.host} "cp ${paths.timestamped} ${paths.master}"`,
        { timeout: 10000 }
      );
    }

    // 5. Save metadata
    const metadata = {
      projectName,
      environment,
      createdAt: new Date().toISOString(),
      isInitial,
      backupPath: paths.timestamped
    };

    execSync(
      `ssh ${BACKUP_SERVER.user}@${BACKUP_SERVER.host} "echo '${JSON.stringify(metadata)}' >> ${envDir}/backup-log.json"`,
      { timeout: 10000 }
    );

    return { success: true, paths };

  } catch (error) {
    console.error(`ENV backup failed: ${error.message}`);
    return { success: false, paths, error: error.message };
  }
}

/**
 * Restore ENV from backup server
 * @param {Object} config - Configuration
 * @returns {Promise<{success: boolean, content: string}>}
 */
export async function restoreEnvFromBackup(config) {
  const { execSync } = await import('child_process');
  const { projectName, environment, version = 'master' } = config;

  const envDir = `${BACKUP_SERVER.envPath}/${projectName}/${environment}`;
  let targetFile;

  if (version === 'master') {
    targetFile = `${envDir}/master.env`;
  } else if (version === 'current') {
    targetFile = `${envDir}/current.env`;
  } else {
    targetFile = `${envDir}/${version}.env`;
  }

  try {
    const content = execSync(
      `ssh ${BACKUP_SERVER.user}@${BACKUP_SERVER.host} "cat ${targetFile}"`,
      { encoding: 'utf-8', timeout: 30000 }
    );

    return { success: true, content: content.trim() };

  } catch (error) {
    return { success: false, content: null, error: error.message };
  }
}

/**
 * List ENV backups for a project
 * @param {string} projectName - Project name
 * @param {string} environment - Environment (optional)
 * @returns {Promise<{success: boolean, backups: string[]}>}
 */
export async function listEnvBackups(projectName, environment = null) {
  const { execSync } = await import('child_process');

  const projectDir = `${BACKUP_SERVER.envPath}/${projectName}`;

  try {
    const cmd = environment
      ? `ssh ${BACKUP_SERVER.user}@${BACKUP_SERVER.host} "ls -la ${projectDir}/${environment}/*.env 2>/dev/null || echo 'empty'"`
      : `ssh ${BACKUP_SERVER.user}@${BACKUP_SERVER.host} "find ${projectDir} -name '*.env' -type f 2>/dev/null || echo 'empty'"`;

    const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });

    if (output.trim() === 'empty') {
      return { success: true, backups: [] };
    }

    const backups = output.trim().split('\n').filter(line => line.includes('.env'));
    return { success: true, backups };

  } catch (error) {
    return { success: false, backups: [], error: error.message };
  }
}

/**
 * Provision all server infrastructure for a project
 * @param {Object} config - Project configuration
 * @param {Object} spinner - Ora spinner instance
 * @returns {Promise<Object>} Provisioning results
 */
export async function provisionServerInfrastructure(config, spinner) {
  const {
    projectName,
    serverHost,
    serverUser,
    useDatabase = true,
    useRedis = true,
    useStorage = true,
    dbPassword
  } = config;

  const result = {
    database: null,
    redis: null,
    storage: null,
    registry: null
  };

  // Read current registry
  spinner.text = 'Reading project registry...';
  const registry = await readProjectRegistry(serverHost, serverUser);

  // Initialize project in registry if not exists
  if (!registry.projects[projectName]) {
    registry.projects[projectName] = {
      created_at: new Date().toISOString(),
      type: config.projectType || 'nextjs',
      resources: {},
      environments: {}
    };
  }

  // Provision PostgreSQL
  if (useDatabase) {
    spinner.text = 'Provisioning PostgreSQL database...';
    try {
      result.database = await provisionPostgresDatabase({
        projectName,
        serverHost,
        serverUser,
        dbPassword
      });
      registry.projects[projectName].resources.database = {
        enabled: true,
        name: result.database.database,
        user: result.database.user,
        password: result.database.password,
        port: 5432
      };
    } catch (e) {
      console.log(chalk.yellow(`\nPostgreSQL provisioning skipped: ${e.message}`));
    }
  }

  // Provision Redis
  if (useRedis) {
    spinner.text = 'Provisioning Redis...';
    try {
      result.redis = await provisionRedis({ projectName }, registry);
      registry.projects[projectName].resources.redis = result.redis;
    } catch (e) {
      console.log(chalk.yellow(`\nRedis provisioning skipped: ${e.message}`));
    }
  }

  // Provision Storage
  if (useStorage) {
    spinner.text = 'Provisioning storage directories...';
    try {
      result.storage = await provisionStorage({
        projectName,
        serverHost,
        serverUser
      });
      registry.projects[projectName].resources.storage = result.storage;
    } catch (e) {
      console.log(chalk.yellow(`\nStorage provisioning skipped: ${e.message}`));
    }
  }

  // Save updated registry
  spinner.text = 'Updating project registry...';
  await writeProjectRegistry(serverHost, serverUser, registry);
  result.registry = registry;

  return result;
}
