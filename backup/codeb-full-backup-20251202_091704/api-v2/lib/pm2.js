/**
 * PM2 Process Management
 * Handles application lifecycle using PM2
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

const execAsync = promisify(exec);

/**
 * Generate PM2 ecosystem file for a project
 * @param {string} projectName - Project name
 * @param {Object} options - PM2 configuration options
 * @returns {Promise<string>} Path to ecosystem file
 */
async function generateEcosystem(projectName, options = {}) {
  const projectPath = path.join(config.paths.projects, projectName, 'app');
  const ecosystemPath = path.join(config.paths.projects, projectName, '.codeb', 'ecosystem.config.js');

  const ecosystem = {
    apps: [{
      name: projectName,
      cwd: projectPath,
      script: options.script || 'npm',
      args: options.args || 'start',
      instances: options.instances || 1,
      exec_mode: options.exec_mode || 'fork',
      autorestart: config.pm2.autorestart,
      watch: config.pm2.watch,
      max_restarts: config.pm2.maxRestarts,
      min_uptime: config.pm2.minUptime,
      env: {
        NODE_ENV: 'production',
        PORT: options.port || 3000,
        ...options.env
      },
      error_file: path.join(config.paths.projects, projectName, '.codeb', 'logs', 'error.log'),
      out_file: path.join(config.paths.projects, projectName, '.codeb', 'logs', 'output.log'),
      time: true,
      merge_logs: true
    }]
  };

  await fs.writeFile(
    ecosystemPath,
    `module.exports = ${JSON.stringify(ecosystem, null, 2)};`,
    'utf8'
  );

  return ecosystemPath;
}

/**
 * Start PM2 app for a project
 * @param {string} projectName - Project name
 * @param {string} ecosystemPath - Path to ecosystem config
 * @returns {Promise<Object>} Result of operation
 */
async function startApp(projectName, ecosystemPath) {
  try {
    const { stdout, stderr } = await execAsync(`pm2 start ${ecosystemPath}`);

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
 * Stop PM2 app
 * @param {string} projectName - Project name
 * @returns {Promise<Object>} Result of operation
 */
async function stopApp(projectName) {
  try {
    const { stdout, stderr } = await execAsync(`pm2 stop ${projectName}`);

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
 * Restart PM2 app
 * @param {string} projectName - Project name
 * @returns {Promise<Object>} Result of operation
 */
async function restartApp(projectName) {
  try {
    const { stdout, stderr } = await execAsync(`pm2 restart ${projectName}`);

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
 * Reload PM2 app (zero-downtime)
 * @param {string} projectName - Project name
 * @returns {Promise<Object>} Result of operation
 */
async function reloadApp(projectName) {
  try {
    const { stdout, stderr } = await execAsync(`pm2 reload ${projectName}`);

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
 * Delete PM2 app
 * @param {string} projectName - Project name
 * @returns {Promise<Object>} Result of operation
 */
async function deleteApp(projectName) {
  try {
    const { stdout, stderr } = await execAsync(`pm2 delete ${projectName}`);

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
 * Get PM2 app status
 * @param {string} projectName - Project name (optional)
 * @returns {Promise<Object|Array>} App status or list of all apps
 */
async function getAppStatus(projectName = null) {
  try {
    const { stdout } = await execAsync('pm2 jlist');
    const apps = JSON.parse(stdout);

    if (projectName) {
      const app = apps.find(a => a.name === projectName);
      if (!app) {
        return { error: 'App not found' };
      }

      return {
        name: app.name,
        status: app.pm2_env.status,
        uptime: app.pm2_env.pm_uptime,
        restarts: app.pm2_env.restart_time,
        cpu: app.monit.cpu,
        memory: app.monit.memory,
        pid: app.pid,
        pm_id: app.pm_id
      };
    }

    return apps.map(app => ({
      name: app.name,
      status: app.pm2_env.status,
      uptime: app.pm2_env.pm_uptime,
      restarts: app.pm2_env.restart_time,
      cpu: app.monit.cpu,
      memory: app.monit.memory
    }));
  } catch (error) {
    throw new Error(`Failed to get app status: ${error.message}`);
  }
}

/**
 * Get PM2 app logs
 * @param {string} projectName - Project name
 * @param {number} lines - Number of lines to retrieve
 * @returns {Promise<string>} App logs
 */
async function getAppLogs(projectName, lines = 100) {
  try {
    const { stdout } = await execAsync(`pm2 logs ${projectName} --lines ${lines} --nostream`);
    return stdout;
  } catch (error) {
    throw new Error(`Failed to get logs: ${error.message}`);
  }
}

/**
 * Flush PM2 logs
 * @param {string} projectName - Project name
 * @returns {Promise<Object>} Result of operation
 */
async function flushLogs(projectName) {
  try {
    const { stdout } = await execAsync(`pm2 flush ${projectName}`);
    return {
      success: true,
      stdout
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Save PM2 process list
 * @returns {Promise<Object>} Result of operation
 */
async function savePM2() {
  try {
    const { stdout } = await execAsync('pm2 save');
    return {
      success: true,
      stdout
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Health check for PM2 app
 * @param {string} projectName - Project name
 * @param {number} port - App port
 * @param {string} path - Health check path
 * @returns {Promise<boolean>} True if healthy
 */
async function healthCheck(projectName, port, path = '/health') {
  try {
    const { stdout } = await execAsync(
      `curl -f -s http://localhost:${port}${path}`,
      { timeout: 5000 }
    );

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Monitor app startup and perform health checks
 * @param {string} projectName - Project name
 * @param {number} port - App port
 * @param {Object} options - Monitoring options
 * @returns {Promise<Object>} Health check results
 */
async function monitorStartup(projectName, port, options = {}) {
  const retries = options.retries || config.deployment.healthCheckRetries;
  const interval = options.interval || config.deployment.healthCheckInterval;
  const healthPath = options.healthPath || '/health';

  const results = {
    success: false,
    attempts: 0,
    errors: []
  };

  for (let i = 0; i < retries; i++) {
    results.attempts++;

    // Wait before checking
    await new Promise(resolve => setTimeout(resolve, interval));

    // Check PM2 status
    const status = await getAppStatus(projectName);
    if (status.error || status.status !== 'online') {
      results.errors.push(`Attempt ${i + 1}: PM2 status is ${status.status || 'unknown'}`);
      continue;
    }

    // Check HTTP health
    const healthy = await healthCheck(projectName, port, healthPath);
    if (healthy) {
      results.success = true;
      break;
    }

    results.errors.push(`Attempt ${i + 1}: Health check failed`);
  }

  return results;
}

module.exports = {
  generateEcosystem,
  startApp,
  stopApp,
  restartApp,
  reloadApp,
  deleteApp,
  getAppStatus,
  getAppLogs,
  flushLogs,
  savePM2,
  healthCheck,
  monitorStartup
};
