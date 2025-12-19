/**
 * Podman Container Management
 * Handles container lifecycle for databases and services
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

const execAsync = promisify(exec);

/**
 * Generate random password
 * @param {number} length - Password length
 * @returns {string} Random password
 */
function generatePassword(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Create docker-compose.yml for project services
 * @param {string} projectName - Project name
 * @param {Object} services - Services configuration
 * @param {Object} ports - Port allocation
 * @returns {Promise<string>} Path to docker-compose.yml
 */
async function createDockerCompose(projectName, services, ports) {
  const projectPath = path.join(config.paths.projects, projectName);
  const composePath = path.join(projectPath, 'docker-compose.yml');

  const composeConfig = {
    version: '3.8',
    services: {},
    networks: {
      [`${projectName}-network`]: {
        driver: 'bridge'
      }
    },
    volumes: {}
  };

  // Add PostgreSQL if requested
  if (services.postgres) {
    const dbPassword = generatePassword(config.database.postgres.passwordLength);
    const dbName = services.postgres.database || projectName.replace(/-/g, '_');

    composeConfig.services.postgres = {
      image: config.podman.images.postgres,
      container_name: `${projectName}-postgres`,
      restart: 'unless-stopped',
      environment: {
        POSTGRES_USER: services.postgres.user || config.database.postgres.user,
        POSTGRES_PASSWORD: dbPassword,
        POSTGRES_DB: dbName
      },
      ports: [`${ports.postgres}:5432`],
      volumes: [`${projectName}-postgres-data:/var/lib/postgresql/data`],
      networks: [`${projectName}-network`],
      healthcheck: {
        test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER}'],
        interval: '10s',
        timeout: '5s',
        retries: 5
      }
    };

    composeConfig.volumes[`${projectName}-postgres-data`] = { driver: 'local' };

    // Store DB credentials for app
    services.postgres.credentials = {
      host: `${projectName}-postgres`,
      port: 5432,
      user: services.postgres.user || config.database.postgres.user,
      password: dbPassword,
      database: dbName,
      url: `postgresql://${services.postgres.user || config.database.postgres.user}:${dbPassword}@localhost:${ports.postgres}/${dbName}`
    };
  }

  // Add MySQL if requested
  if (services.mysql) {
    const dbPassword = generatePassword(config.database.mysql.passwordLength);
    const rootPassword = generatePassword(config.database.mysql.rootPasswordLength);
    const dbName = services.mysql.database || projectName.replace(/-/g, '_');

    composeConfig.services.mysql = {
      image: config.podman.images.mysql,
      container_name: `${projectName}-mysql`,
      restart: 'unless-stopped',
      environment: {
        MYSQL_ROOT_PASSWORD: rootPassword,
        MYSQL_DATABASE: dbName,
        MYSQL_USER: services.mysql.user || config.database.mysql.user,
        MYSQL_PASSWORD: dbPassword
      },
      ports: [`${ports.mysql}:3306`],
      volumes: [`${projectName}-mysql-data:/var/lib/mysql`],
      networks: [`${projectName}-network`],
      healthcheck: {
        test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost'],
        interval: '10s',
        timeout: '5s',
        retries: 5
      }
    };

    composeConfig.volumes[`${projectName}-mysql-data`] = { driver: 'local' };

    services.mysql.credentials = {
      host: `${projectName}-mysql`,
      port: 3306,
      user: services.mysql.user || config.database.mysql.user,
      password: dbPassword,
      database: dbName,
      url: `mysql://${services.mysql.user || config.database.mysql.user}:${dbPassword}@localhost:${ports.mysql}/${dbName}`
    };
  }

  // Add Redis if requested
  if (services.redis) {
    composeConfig.services.redis = {
      image: config.podman.images.redis,
      container_name: `${projectName}-redis`,
      restart: 'unless-stopped',
      ports: [`${ports.redis}:6379`],
      volumes: [`${projectName}-redis-data:/data`],
      networks: [`${projectName}-network`],
      command: 'redis-server --appendonly yes',
      healthcheck: {
        test: ['CMD', 'redis-cli', 'ping'],
        interval: '10s',
        timeout: '5s',
        retries: 5
      }
    };

    composeConfig.volumes[`${projectName}-redis-data`] = { driver: 'local' };

    services.redis.credentials = {
      host: `${projectName}-redis`,
      port: 6379,
      url: `redis://localhost:${ports.redis}`
    };
  }

  // Add Memcached if requested
  if (services.memcached) {
    composeConfig.services.memcached = {
      image: config.podman.images.memcached,
      container_name: `${projectName}-memcached`,
      restart: 'unless-stopped',
      ports: [`${ports.memcached}:11211`],
      networks: [`${projectName}-network`]
    };

    services.memcached.credentials = {
      host: `${projectName}-memcached`,
      port: 11211,
      url: `localhost:${ports.memcached}`
    };
  }

  // Write docker-compose.yml
  const yaml = require('js-yaml');
  const composeYaml = yaml.dump(composeConfig);
  await fs.writeFile(composePath, composeYaml, 'utf8');

  return composePath;
}

/**
 * Start containers using podman-compose
 * @param {string} projectPath - Path to project directory
 * @returns {Promise<Object>} Result of operation
 */
async function startContainers(projectPath) {
  try {
    const { stdout, stderr } = await execAsync('podman-compose up -d', {
      cwd: projectPath,
      timeout: 120000 // 2 minutes
    });

    return {
      success: true,
      stdout,
      stderr
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stdout: error.stdout,
      stderr: error.stderr
    };
  }
}

/**
 * Stop containers for a project
 * @param {string} projectPath - Path to project directory
 * @returns {Promise<Object>} Result of operation
 */
async function stopContainers(projectPath) {
  try {
    const { stdout, stderr } = await execAsync('podman-compose down', {
      cwd: projectPath,
      timeout: 60000 // 1 minute
    });

    return {
      success: true,
      stdout,
      stderr
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Restart containers for a project
 * @param {string} projectPath - Path to project directory
 * @returns {Promise<Object>} Result of operation
 */
async function restartContainers(projectPath) {
  try {
    const { stdout, stderr } = await execAsync('podman-compose restart', {
      cwd: projectPath,
      timeout: 120000
    });

    return {
      success: true,
      stdout,
      stderr
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get container status for a project
 * @param {string} projectName - Project name
 * @returns {Promise<Array>} Container status array
 */
async function getContainerStatus(projectName) {
  try {
    const { stdout } = await execAsync(`podman ps -a --filter name=${projectName} --format json`);
    const containers = JSON.parse(stdout);

    return containers.map(c => ({
      name: c.Names,
      status: c.Status,
      state: c.State,
      image: c.Image,
      ports: c.Ports,
      created: c.CreatedAt
    }));
  } catch (error) {
    console.error('Failed to get container status:', error.message);
    return [];
  }
}

/**
 * Remove all containers for a project
 * @param {string} projectPath - Path to project directory
 * @returns {Promise<Object>} Result of operation
 */
async function removeContainers(projectPath) {
  try {
    const { stdout, stderr } = await execAsync('podman-compose down -v', {
      cwd: projectPath,
      timeout: 60000
    });

    return {
      success: true,
      stdout,
      stderr
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get container logs
 * @param {string} containerName - Container name
 * @param {number} lines - Number of lines to retrieve
 * @returns {Promise<string>} Container logs
 */
async function getContainerLogs(containerName, lines = 100) {
  try {
    const { stdout } = await execAsync(`podman logs --tail ${lines} ${containerName}`);
    return stdout;
  } catch (error) {
    throw new Error(`Failed to get logs: ${error.message}`);
  }
}

module.exports = {
  createDockerCompose,
  startContainers,
  stopContainers,
  restartContainers,
  getContainerStatus,
  removeContainers,
  getContainerLogs,
  generatePassword
};
