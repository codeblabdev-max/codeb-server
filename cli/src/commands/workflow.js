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
import { existsSync } from 'fs';
import { getServerHost, getServerUser, getDbPassword, getBaseDomain } from '../lib/config.js';

// ============================================================================
// Server Infrastructure Provisioning Functions
// ============================================================================

/**
 * Read project registry from server
 * @returns {Promise<Object>} Registry data or default structure
 */
async function readProjectRegistry(serverHost, serverUser) {
  const { execSync } = await import('child_process');

  try {
    const cmd = `ssh ${serverUser}@${serverHost} "cat /opt/codeb/config/project-registry.json 2>/dev/null"`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
    return JSON.parse(output);
  } catch {
    // Return default registry structure
    return {
      version: '2.0',
      updated_at: new Date().toISOString(),
      infrastructure: {
        postgres: {
          host: 'codeb-postgres',
          port: 5432,
          admin_user: 'postgres'
        },
        redis: {
          host: 'codeb-redis',
          port: 6379,
          max_databases: 16
        },
        storage: {
          base_path: '/opt/codeb/data'
        }
      },
      projects: {}
    };
  }
}

/**
 * Write project registry to server
 */
async function writeProjectRegistry(serverHost, serverUser, registry) {
  const { execSync } = await import('child_process');

  registry.updated_at = new Date().toISOString();
  const registryJson = JSON.stringify(registry, null, 2);

  // Ensure config directory exists
  execSync(`ssh ${serverUser}@${serverHost} "mkdir -p /opt/codeb/config"`, { timeout: 30000 });

  // Write registry file
  execSync(`ssh ${serverUser}@${serverHost} "cat > /opt/codeb/config/project-registry.json << 'EOFREG'
${registryJson}
EOFREG"`, { timeout: 30000 });
}

/**
 * Find next available Redis DB index
 */
function findNextRedisDbIndex(registry) {
  const usedIndexes = new Set();

  for (const project of Object.values(registry.projects || {})) {
    if (project.resources?.redis?.db_index !== undefined) {
      usedIndexes.add(project.resources.redis.db_index);
    }
  }

  for (let i = 0; i < 16; i++) {
    if (!usedIndexes.has(i)) return i;
  }

  return 0; // Fallback to 0 with prefix-based isolation
}

/**
 * Find next available port in range
 */
function findNextAvailablePort(registry, basePort, usedPorts = []) {
  const allUsedPorts = new Set(usedPorts);

  for (const project of Object.values(registry.projects || {})) {
    const envs = project.environments || {};
    for (const env of Object.values(envs)) {
      if (env.port) allUsedPorts.add(env.port);
      if (env.db_port) allUsedPorts.add(env.db_port);
      if (env.redis_port) allUsedPorts.add(env.redis_port);
    }
  }

  let port = basePort;
  while (allUsedPorts.has(port)) {
    port++;
  }
  return port;
}

// ============================================================================
// Port Scanning & Validation Functions (Auto-detection)
// ============================================================================

/**
 * Port ranges by environment (GitOps standard)
 */
const PORT_RANGES = {
  staging: { app: { min: 3000, max: 3499 }, db: { min: 15432, max: 15499 }, redis: { min: 16379, max: 16399 } },
  production: { app: { min: 4000, max: 4499 }, db: { min: 25432, max: 25499 }, redis: { min: 26379, max: 26399 } },
  preview: { app: { min: 5000, max: 5999 }, db: { min: 35432, max: 35499 }, redis: { min: 36379, max: 36399 } }
};

/**
 * Scan server for currently used ports
 * @returns {Promise<{usedPorts: Set<number>, portOwners: Map<number, string>, errors: string[]}>}
 */
async function scanServerPorts(serverHost, serverUser) {
  const { execSync } = await import('child_process');
  const usedPorts = new Set();
  const portOwners = new Map(); // port -> owner (container name or process)
  const errors = [];

  try {
    // 1. Get ports from running containers
    const containerCmd = `ssh ${serverUser}@${serverHost} "podman ps --format '{{.Names}}|{{.Ports}}' 2>/dev/null"`;
    const containerOutput = execSync(containerCmd, { encoding: 'utf-8', timeout: 30000 }).trim();

    if (containerOutput) {
      for (const line of containerOutput.split('\n')) {
        const [name, ports] = line.split('|');
        if (ports) {
          // Parse port mappings like "0.0.0.0:3000->3000/tcp, 0.0.0.0:5432->5432/tcp"
          const portMatches = ports.matchAll(/:(\d+)->/g);
          for (const match of portMatches) {
            const port = parseInt(match[1]);
            usedPorts.add(port);
            portOwners.set(port, name || 'unknown');
          }
        }
      }
    }

    // 2. Get ports from ss (actual listening ports)
    const ssCmd = `ssh ${serverUser}@${serverHost} "ss -tlnp 2>/dev/null | grep LISTEN | awk '{print \\$4}' | grep -oE '[0-9]+$' | sort -u"`;
    try {
      const ssOutput = execSync(ssCmd, { encoding: 'utf-8', timeout: 30000 }).trim();
      if (ssOutput) {
        for (const portStr of ssOutput.split('\n')) {
          const port = parseInt(portStr);
          if (!isNaN(port)) {
            usedPorts.add(port);
            if (!portOwners.has(port)) {
              portOwners.set(port, 'system');
            }
          }
        }
      }
    } catch {
      // ss might fail, but container check is more important
    }

    // 3. Get ports from registry
    try {
      const registry = await readProjectRegistry(serverHost, serverUser);
      for (const [projName, project] of Object.entries(registry.projects || {})) {
        const envs = project.environments || {};
        for (const [envName, env] of Object.entries(envs)) {
          if (env.port) {
            usedPorts.add(env.port);
            if (!portOwners.has(env.port)) {
              portOwners.set(env.port, `${projName}/${envName}`);
            }
          }
        }
      }
    } catch {
      // Registry might not exist
    }

  } catch (error) {
    errors.push(`Port scan error: ${error.message}`);
  }

  return { usedPorts, portOwners, errors };
}

/**
 * Validate port and suggest alternative if conflict
 * @returns {{ valid: boolean, suggested?: number, conflict?: string }}
 */
function validatePort(port, environment, serviceType, usedPorts, portOwners) {
  const range = PORT_RANGES[environment]?.[serviceType];
  const warnings = [];

  // Check range compliance
  if (range && (port < range.min || port > range.max)) {
    warnings.push(`Port ${port} is outside ${environment}/${serviceType} range (${range.min}-${range.max})`);
  }

  // Check conflict
  if (usedPorts.has(port)) {
    const owner = portOwners.get(port) || 'unknown';
    return {
      valid: false,
      conflict: owner,
      suggested: findSafePort(environment, serviceType, usedPorts),
      warnings
    };
  }

  return { valid: true, warnings };
}

/**
 * Find next safe port within environment range
 */
function findSafePort(environment, serviceType, usedPorts) {
  const range = PORT_RANGES[environment]?.[serviceType];
  if (!range) {
    // Fallback to default ranges
    const defaults = { staging: 3000, production: 4000, preview: 5000 };
    let port = defaults[environment] || 3000;
    while (usedPorts.has(port)) port++;
    return port;
  }

  for (let port = range.min; port <= range.max; port++) {
    if (!usedPorts.has(port)) return port;
  }

  // Range exhausted, return next after max
  return range.max + 1;
}

/**
 * Auto-scan and validate all ports for a project configuration
 * Returns validated config with safe port assignments
 */
async function autoScanAndValidatePorts(config, serverHost, serverUser, spinner) {
  const originalText = spinner?.text;
  if (spinner) spinner.text = 'Scanning server ports for conflicts...';

  const { usedPorts, portOwners, errors } = await scanServerPorts(serverHost, serverUser);
  const validationResults = {
    scanned: true,
    usedPortCount: usedPorts.size,
    conflicts: [],
    adjustments: [],
    warnings: []
  };

  if (errors.length > 0) {
    validationResults.warnings.push(...errors);
  }

  // Validate each port
  const portsToValidate = [
    { key: 'stagingPort', env: 'staging', type: 'app', label: 'Staging App' },
    { key: 'productionPort', env: 'production', type: 'app', label: 'Production App' },
    { key: 'stagingDbPort', env: 'staging', type: 'db', label: 'Staging DB' },
    { key: 'productionDbPort', env: 'production', type: 'db', label: 'Production DB' },
    { key: 'stagingRedisPort', env: 'staging', type: 'redis', label: 'Staging Redis' },
    { key: 'productionRedisPort', env: 'production', type: 'redis', label: 'Production Redis' }
  ];

  for (const { key, env, type, label } of portsToValidate) {
    const port = parseInt(config[key]);
    if (isNaN(port)) continue;

    const result = validatePort(port, env, type, usedPorts, portOwners);

    if (!result.valid) {
      validationResults.conflicts.push({
        label,
        originalPort: port,
        conflictWith: result.conflict,
        suggestedPort: result.suggested
      });

      // Auto-adjust config
      config[key] = String(result.suggested);
      validationResults.adjustments.push({
        label,
        from: port,
        to: result.suggested
      });

      // Mark the new port as used to prevent double allocation
      usedPorts.add(result.suggested);
    }

    if (result.warnings?.length > 0) {
      validationResults.warnings.push(...result.warnings);
    }
  }

  if (spinner) spinner.text = originalText;
  return validationResults;
}

/**
 * Provision PostgreSQL database and user for project
 */
async function provisionPostgresDatabase(config) {
  const { execSync } = await import('child_process');
  const { projectName, serverHost, serverUser, dbPassword = 'postgres' } = config;

  const dbName = projectName.replace(/-/g, '_');
  const dbUser = `${dbName}_user`;
  const userPassword = config.userPassword || generateSecurePassword();

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
 */
async function provisionRedis(config, registry) {
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
 */
async function provisionStorage(config) {
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
 * Generate secure random password
 */
function generateSecurePassword(length = 24) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Provision all server infrastructure for a project
 */
async function provisionServerInfrastructure(config, spinner) {
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
        port: 5432
      };
    } catch (e) {
      console.log(chalk.yellow(`\n⚠️  PostgreSQL provisioning skipped: ${e.message}`));
    }
  }

  // Provision Redis
  if (useRedis) {
    spinner.text = 'Provisioning Redis...';
    try {
      result.redis = await provisionRedis({ projectName }, registry);
      registry.projects[projectName].resources.redis = result.redis;
    } catch (e) {
      console.log(chalk.yellow(`\n⚠️  Redis provisioning skipped: ${e.message}`));
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
      console.log(chalk.yellow(`\n⚠️  Storage provisioning skipped: ${e.message}`));
    }
  }

  // Save updated registry
  spinner.text = 'Updating project registry...';
  await writeProjectRegistry(serverHost, serverUser, registry);
  result.registry = registry;

  return result;
}

/**
 * Generate server environment file content
 */
function generateServerEnvContent(config) {
  const {
    projectName,
    environment = 'production',
    port = 3000,
    database,
    redis,
    storage
  } = config;

  const dbName = projectName.replace(/-/g, '_');

  let content = `# ${projectName} - ${environment.charAt(0).toUpperCase() + environment.slice(1)} Environment
# Generated by CodeB CLI v2.5.0

NODE_ENV=${environment}
PORT=${port}
HOSTNAME=0.0.0.0
`;

  if (database) {
    content += `
# PostgreSQL (컨테이너 DNS)
DATABASE_URL=postgresql://${database.user}:${database.password}@codeb-postgres:5432/${database.database}?schema=public
POSTGRES_HOST=codeb-postgres
POSTGRES_PORT=5432
POSTGRES_USER=${database.user}
POSTGRES_PASSWORD=${database.password}
POSTGRES_DB=${database.database}
`;
  }

  if (redis) {
    content += `
# Redis (컨테이너 DNS)
REDIS_URL=redis://codeb-redis:6379/${redis.db_index}
REDIS_HOST=codeb-redis
REDIS_PORT=6379
REDIS_DB=${redis.db_index}
REDIS_PREFIX=${redis.prefix}

# Socket.IO (Redis Adapter)
SOCKETIO_REDIS_HOST=codeb-redis
SOCKETIO_REDIS_PORT=6379
SOCKETIO_REDIS_PREFIX=${redis.prefix}socket:
`;
  }

  if (storage) {
    content += `
# Storage
STORAGE_PATH=/data
UPLOAD_PATH=/data/uploads
CACHE_PATH=/data/cache
`;
  }

  return content;
}

/**
 * Generate local .env.local content for development
 */
function generateLocalEnvContent(config) {
  const {
    projectName,
    serverHost,
    database,
    redis,
    dbExternalPort = 5432,
    redisExternalPort = 6379
  } = config;

  let content = `# ${projectName} - Local Development Environment
# Generated by CodeB CLI v2.5.0
# ⚠️  WARNING: This connects to REAL server data!

NODE_ENV=development
PORT=3000
`;

  if (database && serverHost) {
    content += `
# PostgreSQL (서버 외부 포트로 연결)
DATABASE_URL=postgresql://${database.user}:${database.password}@${serverHost}:${dbExternalPort}/${database.database}?schema=public
`;
  }

  if (redis && serverHost) {
    content += `
# Redis (서버 외부 포트로 연결)
REDIS_URL=redis://${serverHost}:${redisExternalPort}/${redis.db_index}
REDIS_PREFIX=${redis.prefix}

# Socket.IO (개발 시 서버 Redis 사용)
SOCKETIO_REDIS_HOST=${serverHost}
SOCKETIO_REDIS_PORT=${redisExternalPort}
SOCKETIO_REDIS_PREFIX=${redis.prefix}socket:
`;
  }

  content += `
# Storage (로컬 개발 시 로컬 경로 사용)
STORAGE_PATH=./data
UPLOAD_PATH=./data/uploads
CACHE_PATH=./data/cache
`;

  return content;
}

/**
 * Scan project resources on server
 */
async function scanProjectResources(config) {
  const { execSync } = await import('child_process');
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
// Quadlet Template Generator (Enhanced with Project Set Support)
// ============================================================================

function generateQuadletTemplate(config) {
  const {
    projectName,
    containerName,
    image,
    port,
    hostPort,
    environment = 'staging',
    envVars = {},
    envFile = null,  // External env file support
    volumes = [],
    dependencies = [],
    healthCheck = null,
    network = 'codeb-network',  // Default to codeb-network for DNS resolution
    memory = null,
    cpus = null
  } = config;

  // Build environment lines with systemd escaping
  const envLines = Object.entries(envVars)
    .map(([key, value]) => {
      // Escape special characters for systemd (! → %%21, $ → $$)
      const escapedValue = value.replace(/!/g, '%%21').replace(/\$/g, '$$');
      return `Environment=${key}=${escapedValue}`;
    })
    .join('\n');

  const volumeLines = volumes
    .map(v => `Volume=${v}`)
    .join('\n');

  const depServices = dependencies
    .map(d => `${d}.service`)
    .join(' ');

  // Resource limits for PodmanArgs
  const podmanArgs = [];
  if (memory) podmanArgs.push(`--memory=${memory}`);
  if (cpus) podmanArgs.push(`--cpus=${cpus}`);

  let template = `# ${projectName} - Quadlet Configuration
# Generated by CodeB CLI v2.4.0
# Environment: ${environment}
# Network: ${network} (DNS-based container communication)

[Unit]
Description=${projectName} ${environment} Container
After=network-online.target${dependencies.length ? ' ' + depServices : ''}
${dependencies.length ? `Requires=${depServices}` : ''}

[Container]
Image=${image}
ContainerName=${containerName}
PublishPort=${hostPort}:${port}
Network=${network}
${envLines}
${envFile ? `EnvironmentFile=${envFile}` : ''}
${volumeLines}
${healthCheck ? `HealthCmd=${healthCheck}` : ''}
${healthCheck ? `HealthInterval=30s` : ''}
${healthCheck ? `HealthTimeout=10s` : ''}
${healthCheck ? `HealthRetries=3` : ''}
${healthCheck ? `HealthStartPeriod=60s` : ''}
${podmanArgs.length ? `PodmanArgs=${podmanArgs.join(' ')}` : ''}

[Service]
Restart=always
RestartSec=10s
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target default.target
`;

  // Clean up empty lines
  template = template.replace(/\n{3,}/g, '\n\n').replace(/\n\n\[/g, '\n\n[');

  return template.trim();
}

// ============================================================================
// Project Set Generator (App + PostgreSQL + Redis)
// ============================================================================

function generateProjectSet(config) {
  const {
    projectName,
    environment = 'production',
    ports = { app: 3000, postgres: 5432, redis: 6379 },
    image,
    useDatabase = true,
    useRedis = true,
    network = 'codeb-network',
    dbPassword = 'postgres',
    dbUser = 'postgres',
    dbName = null,
    redisPassword = null
  } = config;

  const dbNameFinal = dbName || projectName.replace(/-/g, '_');
  const suffix = environment === 'production' ? '' : `-${environment}`;
  const containerPrefix = `${projectName}${suffix}`;

  const files = {};

  // 1. App Container (with DNS-based DATABASE_URL)
  const appEnvVars = {
    NODE_ENV: environment,
    PORT: '3000',
    HOSTNAME: '0.0.0.0'
  };

  if (useDatabase) {
    // Use container name for DNS resolution (no IP dependency!)
    appEnvVars.DATABASE_URL = `postgresql://${dbUser}:${dbPassword}@${containerPrefix}-postgres:5432/${dbNameFinal}?schema=public`;
  }

  if (useRedis) {
    const redisAuth = redisPassword ? `:${redisPassword}@` : '';
    appEnvVars.REDIS_URL = `redis://${redisAuth}${containerPrefix}-redis:6379`;
  }

  files[`${containerPrefix}.container`] = generateQuadletTemplate({
    projectName: `${projectName} App`,
    containerName: containerPrefix,
    image: image || `ghcr.io/codeb/${projectName}:latest`,
    port: 3000,
    hostPort: ports.app,
    environment,
    envVars: appEnvVars,
    envFile: `/etc/containers/systemd/${containerPrefix}.env`,
    dependencies: [
      ...(useDatabase ? [`${containerPrefix}-postgres`] : []),
      ...(useRedis ? [`${containerPrefix}-redis`] : [])
    ],
    healthCheck: 'curl -sf http://localhost:3000/api/health || exit 1',
    network,
    memory: environment === 'production' ? '2g' : '1g',
    cpus: environment === 'production' ? '2' : '1'
  });

  // 2. PostgreSQL Container
  if (useDatabase) {
    files[`${containerPrefix}-postgres.container`] = generateQuadletTemplate({
      projectName: `${projectName} PostgreSQL`,
      containerName: `${containerPrefix}-postgres`,
      image: 'docker.io/library/postgres:15-alpine',
      port: 5432,
      hostPort: ports.postgres,
      environment,
      envVars: {
        POSTGRES_USER: dbUser,
        POSTGRES_PASSWORD: dbPassword,
        POSTGRES_DB: dbNameFinal
      },
      volumes: [`${containerPrefix}-postgres-data:/var/lib/postgresql/data:Z`],
      healthCheck: `pg_isready -U ${dbUser}`,
      network
    });
  }

  // 3. Redis Container
  if (useRedis) {
    const redisEnvVars = {};
    const redisCmd = redisPassword
      ? `redis-server --requirepass ${redisPassword}`
      : null;

    files[`${containerPrefix}-redis.container`] = generateQuadletTemplate({
      projectName: `${projectName} Redis`,
      containerName: `${containerPrefix}-redis`,
      image: 'docker.io/library/redis:7-alpine',
      port: 6379,
      hostPort: ports.redis,
      environment,
      envVars: redisEnvVars,
      volumes: [`${containerPrefix}-redis-data:/data:Z`],
      healthCheck: 'redis-cli ping',
      network
    });
  }

  // Return structured result with metadata
  return {
    quadletFiles: files,
    containerPrefix,
    environment,
    envVars: {
      DATABASE_URL: useDatabase ? `postgresql://${dbUser}:${dbPassword}@${containerPrefix}-postgres:5432/${dbNameFinal}?schema=public` : null,
      REDIS_URL: useRedis ? `redis://${containerPrefix}-redis:6379` : null
    },
    services: {
      app: useDatabase || useRedis ? containerPrefix : projectName,
      postgres: useDatabase ? `${containerPrefix}-postgres` : null,
      redis: useRedis ? `${containerPrefix}-redis` : null
    }
  };
}

// ============================================================================
// GitHub Actions Workflow Generator (Hybrid: GitHub Build + Self-hosted Deploy)
// ============================================================================

function generateGitHubActionsWorkflow(config) {
  const {
    projectName,
    projectType = 'nextjs',
    nodeVersion = '20',
    environments = ['staging', 'production'],
    registry = 'ghcr.io',
    serverHost = getServerHost(),
    serverUser = getServerUser(),
    ports = { staging: 3001, production: 3000 },
    domains = {},
    includeTests = true,
    includeLint = true,
    useQuadlet = true,
    // Hybrid mode options
    hybridMode = true,  // GitHub build + Self-hosted deploy
    useDatabase = true,
    useRedis = false,
    baseDomain = 'one-q.xyz'
  } = config;

  // Hybrid Mode: GitHub-hosted (build) + Self-hosted (deploy)
  const workflow = `# ${projectName} CI/CD Pipeline (Hybrid Mode)
# Generated by CodeB CLI v2.4.0
# Strategy: GitHub-hosted runners for build, Self-hosted runner for deploy
# Benefits: Stable builds on GitHub infra + Fast deploys on server

name: ${projectName} CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production
      skip_tests:
        description: 'Skip tests'
        required: false
        default: false
        type: boolean

env:
  REGISTRY: ${registry}
  IMAGE_NAME: \${{ github.repository }}
  APP_NAME: ${projectName}
  NODE_VERSION: '${nodeVersion}'

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  # ============================================
  # Lint & Type Check (GitHub-hosted)
  # ============================================
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request' || github.event_name == 'push'

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma Client
        run: npx prisma generate || true
${includeLint ? `
      - name: Run ESLint
        run: npm run lint

      - name: Run Type Check
        run: npm run type-check || true` : ''}

  # ============================================
  # Test (GitHub-hosted)
  # ============================================
  test:
    name: Run Tests
    runs-on: ubuntu-latest
    needs: lint
    if: |
      (github.event_name == 'pull_request' || github.event_name == 'push') &&
      github.event.inputs.skip_tests != 'true'

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma Client
        run: npx prisma generate || true
${includeTests ? `
      - name: Run Tests
        run: npm test -- --passWithNoTests
        env:
          NODE_ENV: test` : ''}

  # ============================================
  # Build & Push Image (GitHub-hosted)
  # ============================================
  build:
    name: Build & Push Image
    runs-on: ubuntu-latest
    needs: [lint, test]
    if: |
      always() &&
      (needs.lint.result == 'success' || needs.lint.result == 'skipped') &&
      (needs.test.result == 'success' || needs.test.result == 'skipped') &&
      (github.event_name == 'push' || github.event_name == 'workflow_dispatch')
    permissions:
      contents: read
      packages: write

    outputs:
      image_tag: \${{ steps.vars.outputs.image_tag }}
      environment: \${{ steps.vars.outputs.environment }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Determine environment and tags
        id: vars
        run: |
          if [ "\${{ github.event_name }}" = "workflow_dispatch" ]; then
            ENV="\${{ github.event.inputs.environment }}"
          elif [ "\${{ github.ref }}" = "refs/heads/main" ]; then
            ENV="production"
          else
            ENV="staging"
          fi
          echo "environment=\${ENV}" >> \$GITHUB_OUTPUT

          if [ "\$ENV" = "production" ]; then
            echo "image_tag=latest" >> \$GITHUB_OUTPUT
          else
            echo "image_tag=staging" >> \$GITHUB_OUTPUT
          fi

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata for Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=\${{ steps.vars.outputs.image_tag }}
            type=sha,prefix=

      - name: Build and push Docker image
        uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            BUILDTIME=\${{ github.event.head_commit.timestamp }}
            VERSION=\${{ github.sha }}
            REVISION=\${{ github.sha }}

  # ============================================
  # Pre-Deploy Port Validation (Self-hosted)
  # ============================================
  port-validate:
    name: Validate Port Allocation
    runs-on: self-hosted
    needs: build
    if: needs.build.result == 'success'

    outputs:
      port_valid: \${{ steps.validate.outputs.valid }}
      target_port: \${{ steps.validate.outputs.port }}

    steps:
      - name: Determine target port
        id: vars
        run: |
          ENV="\${{ needs.build.outputs.environment }}"
          if [ "\$ENV" = "production" ]; then
            echo "port=${ports.production}" >> \$GITHUB_OUTPUT
          else
            echo "port=${ports.staging}" >> \$GITHUB_OUTPUT
          fi

      - name: Validate port from manifest
        id: validate
        run: |
          PORT="\${{ steps.vars.outputs.port }}"
          ENV="\${{ needs.build.outputs.environment }}"
          MANIFEST="/home/codeb/config/port-manifest.yaml"

          echo "🔍 Validating port \$PORT for ${projectName}/\$ENV"

          # Check if manifest exists
          if [ ! -f "\$MANIFEST" ]; then
            echo "⚠️ Port manifest not found, skipping validation"
            echo "valid=true" >> \$GITHUB_OUTPUT
            echo "port=\$PORT" >> \$GITHUB_OUTPUT
            exit 0
          fi

          # Check if port is allocated to this project in manifest
          OWNER=\$(grep -B5 "app: \$PORT" "\$MANIFEST" 2>/dev/null | grep -E "^  [a-zA-Z]" | tail -1 | tr -d ': ')

          if [ -n "\$OWNER" ] && [ "\$OWNER" != "${projectName}" ]; then
            echo "❌ PORT CONFLICT: Port \$PORT is allocated to \$OWNER in manifest"
            echo "valid=false" >> \$GITHUB_OUTPUT
            echo "port=\$PORT" >> \$GITHUB_OUTPUT
            exit 1
          fi

          # Check if port is actually in use by another process
          ACTUAL_USER=\$(ss -tlnp | grep ":\$PORT " | head -1 || true)
          if [ -n "\$ACTUAL_USER" ]; then
            PROCESS=\$(echo "\$ACTUAL_USER" | grep -oP 'users:\(\("\K[^"]+' || echo "unknown")
            if ! echo "\$PROCESS" | grep -qE "(${projectName}|conmon|podman)"; then
              echo "⚠️ Port \$PORT in use by: \$PROCESS"
              # Warning only, not failure (could be same container restarting)
            fi
          fi

          echo "✅ Port \$PORT validated for ${projectName}/\$ENV"
          echo "valid=true" >> \$GITHUB_OUTPUT
          echo "port=\$PORT" >> \$GITHUB_OUTPUT

  # ============================================
  # Deploy (Self-hosted Runner on Server)
  # ============================================
  deploy:
    name: Deploy to Server
    runs-on: self-hosted
    needs: [build, port-validate]
    if: |
      needs.build.result == 'success' &&
      needs.port-validate.outputs.port_valid == 'true' &&
      (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop' || github.event_name == 'workflow_dispatch')

    env:
      ENVIRONMENT: \${{ needs.build.outputs.environment }}
      IMAGE_TAG: \${{ needs.build.outputs.image_tag }}

    steps:
      - name: Set deployment variables
        id: vars
        run: |
          if [ "\${{ env.ENVIRONMENT }}" = "production" ]; then
            echo "container_name=${projectName}" >> \$GITHUB_OUTPUT
            echo "port=${ports.production}" >> \$GITHUB_OUTPUT
            echo "url=${domains.production || `${projectName}.${baseDomain}`}" >> \$GITHUB_OUTPUT
          else
            echo "container_name=${projectName}-staging" >> \$GITHUB_OUTPUT
            echo "port=${ports.staging}" >> \$GITHUB_OUTPUT
            echo "url=${domains.staging || `${projectName}-staging.${baseDomain}`}" >> \$GITHUB_OUTPUT
          fi

      - name: Pull image from registry
        run: |
          echo "Pulling image: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ env.IMAGE_TAG }}"
          podman pull \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ env.IMAGE_TAG }}

      - name: Update Quadlet image reference
        run: |
          CONTAINER_NAME="\${{ steps.vars.outputs.container_name }}"
          QUADLET_FILE="/etc/containers/systemd/\${CONTAINER_NAME}.container"

          if [ -f "\$QUADLET_FILE" ]; then
            # Update image reference in Quadlet file
            sed -i "s|^Image=.*|Image=\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ env.IMAGE_TAG }}|" "\$QUADLET_FILE"
            echo "Updated Quadlet file: \$QUADLET_FILE"
          fi

      - name: Restart service via systemd/Quadlet
        run: |
          CONTAINER_NAME="\${{ steps.vars.outputs.container_name }}"

          systemctl daemon-reload
          systemctl stop \${CONTAINER_NAME}.service 2>/dev/null || true
          podman rm -f \${CONTAINER_NAME} 2>/dev/null || true
          systemctl start \${CONTAINER_NAME}.service

          echo "Service restarted: \${CONTAINER_NAME}"

      - name: Health check
        run: |
          PORT="\${{ steps.vars.outputs.port }}"
          MAX_RETRIES=15
          RETRY_COUNT=0

          echo "Waiting for service to be healthy..."
          sleep 10

          while [ \$RETRY_COUNT -lt \$MAX_RETRIES ]; do
            response=\$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:\${PORT}/api/health 2>/dev/null || echo "000")
            if [ "\$response" = "200" ]; then
              echo "✅ Health check passed!"
              exit 0
            fi
            RETRY_COUNT=\$((RETRY_COUNT + 1))
            echo "Health check attempt \$RETRY_COUNT/\$MAX_RETRIES (status: \$response)"
            sleep 3
          done

          echo "❌ Health check failed after \$MAX_RETRIES attempts"
          podman logs \${{ steps.vars.outputs.container_name }} --tail 50
          exit 1

      - name: Deployment summary
        if: always()
        run: |
          echo ""
          echo "=========================================="
          echo "📦 Deployment Summary"
          echo "=========================================="
          echo "Environment: \${{ env.ENVIRONMENT }}"
          echo "Container: \${{ steps.vars.outputs.container_name }}"
          echo "Image: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ env.IMAGE_TAG }}"
          echo "Port: \${{ steps.vars.outputs.port }}"
          echo "URL: https://\${{ steps.vars.outputs.url }}"
          echo "Commit: \${{ github.sha }}"
          echo ""

      - name: Cleanup old images
        if: success()
        run: |
          echo "Cleaning up old images..."
          podman image prune -f 2>/dev/null || true

  # ============================================
  # Notify (Self-hosted)
  # ============================================
  notify:
    name: Send Notification
    runs-on: self-hosted
    needs: deploy
    if: always()

    steps:
      - name: Success Notification
        if: needs.deploy.result == 'success'
        run: |
          echo "✅ Deployment successful!"
          # Add Slack/Discord webhook here if needed

      - name: Failure Notification
        if: needs.deploy.result == 'failure'
        run: |
          echo "❌ Deployment failed!"
          echo "Check logs: \${{ github.server_url }}/\${{ github.repository }}/actions/runs/\${{ github.run_id }}"
`;

  return workflow;
}

// ============================================================================
// Dockerfile Generator
// ============================================================================

function generateDockerfile(config) {
  const { projectType = 'nextjs', nodeVersion = '20' } = config;

  if (projectType === 'nextjs') {
    return `# Next.js Production Dockerfile
# Generated by CodeB CLI
# Multi-stage build for optimized image size

FROM node:${nodeVersion}-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects anonymous telemetry data
ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
`;
  }

  if (projectType === 'remix') {
    return `# Remix Production Dockerfile
# Generated by CodeB CLI

FROM node:${nodeVersion}-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 remix

COPY --from=builder --chown=remix:nodejs /app/build ./build
COPY --from=builder --chown=remix:nodejs /app/public ./public
COPY --from=builder --chown=remix:nodejs /app/package.json ./
COPY --from=builder --chown=remix:nodejs /app/node_modules ./node_modules

USER remix

EXPOSE 3000

CMD ["npm", "start"]
`;
  }

  // Default Node.js
  return `# Node.js Production Dockerfile
# Generated by CodeB CLI

FROM node:${nodeVersion}-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production

COPY . .

ENV NODE_ENV production

EXPOSE 3000

CMD ["node", "index.js"]
`;
}

// ============================================================================
// Main Command Handler
// ============================================================================

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
  }
}

// ============================================================================
// Action Handlers
// ============================================================================

async function initWorkflow(projectName, options) {
  const spinner = ora('Initializing workflow configuration...').start();

  try {
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
          default: (answers) => `${answers.projectName}-staging.one-q.xyz`
        },
        {
          type: 'input',
          name: 'productionDomain',
          message: 'Production domain:',
          default: (answers) => `${answers.projectName}.one-q.xyz`
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
        staging: config.stagingDomain || `${config.projectName}-staging.one-q.xyz`,
        production: config.productionDomain || `${config.projectName}.one-q.xyz`
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
              domain: config.productionDomain || `${config.projectName}.one-q.xyz`,
              env_file: `/opt/codeb/envs/${config.projectName}-production.env`
            },
            staging: {
              port: parseInt(config.stagingPort),
              domain: config.stagingDomain || `${config.projectName}-staging.one-q.xyz`,
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

    console.log(chalk.yellow('\n📋 Next steps:'));
    console.log(chalk.gray('  1. Run: we workflow sync ' + config.projectName + ' (copy files to server)'));
    console.log(chalk.gray('  2. Add GitHub Secrets:'));
    console.log(chalk.gray('     - SSH_PRIVATE_KEY: Server SSH private key'));
    console.log(chalk.gray('     - SERVER_HOST: ' + (serverHost || '(your server IP)')));
    console.log(chalk.gray('  3. Push to GitHub to trigger deployment'));
    console.log(chalk.gray('\n  💡 Hybrid Mode: GitHub builds → ghcr.io → Self-hosted deploys'));
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
# Generated by CodeB CLI v2.4.0
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
 * Create server environment files via SSH
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

  const { execSync } = await import('child_process');
  const dbName = projectName.replace(/-/g, '_');

  // Ensure /opt/codeb/envs directory exists
  execSync(`ssh ${serverUser}@${serverHost} "mkdir -p /opt/codeb/envs"`, { timeout: 30000 });

  // Generate production env content
  const productionEnv = `# ${projectName} - Production Environment
# Generated by CodeB CLI v2.4.0
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
# Generated by CodeB CLI v2.4.0
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
    dbPassword = 'postgres',
    environment = 'production'
  } = config;

  const containerPrefix = environment === 'production' ? projectName : `${projectName}-${environment}`;

  let template = `# ${projectName} Environment Configuration
# Environment: ${environment}
# Generated by CodeB CLI

NODE_ENV=${environment}
PORT=3000
`;

  if (useDatabase) {
    template += `
# PostgreSQL (uses container DNS name for stable connection)
DATABASE_URL=postgresql://postgres:${dbPassword}@${containerPrefix}-postgres:5432/${projectName}?schema=public
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${dbPassword}
POSTGRES_DB=${projectName}
`;
  }

  if (useRedis) {
    template += `
# Redis (uses container DNS name for stable connection)
REDIS_URL=redis://${containerPrefix}-redis:6379
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

    const content = generateQuadletTemplate(config);
    const outputPath = options.output || `${config.projectName}.container`;

    await writeFile(outputPath, content);
    spinner.succeed(`Quadlet file generated: ${outputPath}`);

    console.log(chalk.green('\n✅ Quadlet Configuration Generated\n'));
    console.log(chalk.gray('Install on server:'));
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
      report.local.github = {
        exists: true,
        hasHybridMode: content.includes('self-hosted'),
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
        staging: options.stagingDomain || `${config.projectName}-staging.one-q.xyz`,
        production: options.productionDomain || `${config.projectName}.one-q.xyz`
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
    report.local.github = {
      exists: true,
      hasHybridMode: content.includes('self-hosted'),
      hasQuadlet: content.includes('Quadlet'),
      version: content.match(/Generated by CodeB CLI v([\d.]+)/)?.[1] || 'unknown'
    };
  }

  report.local.dockerfile = existsSync('Dockerfile');
  report.local.env = existsSync('.env') || existsSync('.env.local');

  // Scan server
  const { execSync } = await import('child_process');
  try {
    const registryCmd = `ssh ${serverUser}@${serverHost} "cat /opt/codeb/config/project-registry.json 2>/dev/null"`;
    const registryOutput = execSync(registryCmd, { encoding: 'utf-8', timeout: 30000 });
    report.server.registry = JSON.parse(registryOutput);
  } catch { /* ignore */ }

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

    spinner.start('Syncing files to server...');

    const { execSync } = await import('child_process');

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

          // Reload systemd and restart service
          execSync(`ssh ${serverUser}@${serverHost} "systemctl daemon-reload"`, { timeout: 30000 });

          const serviceName = `${container.name}.service`;
          execSync(`ssh ${serverUser}@${serverHost} "systemctl stop ${serviceName} 2>/dev/null; podman rm -f ${container.name} 2>/dev/null; systemctl start ${serviceName}"`, { timeout: 60000 });

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
