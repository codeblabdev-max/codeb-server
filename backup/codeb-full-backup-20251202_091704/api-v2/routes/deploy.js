/**
 * Deployment Routes
 * Handles deployment orchestration for projects
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const config = require('../config');
const podmanManager = require('../lib/podman');
const pm2Manager = require('../lib/pm2');

const execAsync = promisify(exec);

/**
 * Register deployment routes
 * @param {Express} app - Express app instance
 */
function registerRoutes(app) {
  // Deploy project
  app.post('/projects/:name/deploy', deployProject);

  // Start project
  app.post('/projects/:name/start', startProject);

  // Stop project
  app.post('/projects/:name/stop', stopProject);

  // Restart project
  app.post('/projects/:name/restart', restartProject);

  // Get deployment logs
  app.get('/projects/:name/logs', getProjectLogs);
}

/**
 * Deploy project (full deployment flow)
 */
async function deployProject(req, res) {
  const { name } = req.params;
  const {
    gitUrl,
    branch = 'main',
    buildCommand,
    startCommand
  } = req.body;

  const deploymentLog = [];

  function log(message) {
    deploymentLog.push(`[${new Date().toISOString()}] ${message}`);
    console.log(message);
  }

  try {
    const projectPath = path.join(config.paths.projects, name);
    const appPath = path.join(projectPath, 'app');

    // Load project config
    const configPath = path.join(projectPath, '.codeb', 'project.json');
    const configData = await fs.readFile(configPath, 'utf8');
    const projectConfig = JSON.parse(configData);

    log(`Starting deployment for ${name}`);

    // Step 1: Pull code from Git (if gitUrl provided)
    if (gitUrl) {
      log('Pulling code from Git...');

      try {
        await fs.access(path.join(appPath, '.git'));
        // Git repo exists, pull
        const { stdout: pullOutput } = await execAsync(
          `git pull origin ${branch}`,
          { cwd: appPath, timeout: 120000 }
        );
        log(`Git pull: ${pullOutput}`);
      } catch {
        // Git repo doesn't exist, clone
        await fs.rm(appPath, { recursive: true, force: true });
        await fs.mkdir(appPath, { recursive: true });

        const { stdout: cloneOutput } = await execAsync(
          `git clone -b ${branch} ${gitUrl} .`,
          { cwd: appPath, timeout: 300000 }
        );
        log(`Git clone: ${cloneOutput}`);
      }
    }

    // Step 2: Start database containers
    log('Starting database containers...');
    const containerResult = await podmanManager.startContainers(projectPath);
    if (!containerResult.success) {
      throw new Error(`Container startup failed: ${containerResult.error}`);
    }
    log('Containers started successfully');

    // Wait for containers to be healthy
    log('Waiting for containers to be healthy...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Step 3: Install dependencies
    log('Installing dependencies...');
    const { stdout: installOutput } = await execAsync(
      'npm install',
      { cwd: appPath, timeout: 300000 }
    );
    log('Dependencies installed');

    // Step 4: Build application (if build command provided)
    if (buildCommand) {
      log('Building application...');
      const { stdout: buildOutput } = await execAsync(
        buildCommand,
        { cwd: appPath, timeout: config.deployment.buildTimeout }
      );
      log('Build completed');
    }

    // Step 5: Generate PM2 ecosystem
    log('Generating PM2 configuration...');
    const ecosystemPath = await pm2Manager.generateEcosystem(name, {
      script: startCommand ? startCommand.split(' ')[0] : 'npm',
      args: startCommand ? startCommand.split(' ').slice(1).join(' ') : 'start',
      port: projectConfig.ports.app,
      env: {
        ...projectConfig.credentials?.postgres && {
          DATABASE_URL: projectConfig.credentials.postgres.url
        },
        ...projectConfig.credentials?.redis && {
          REDIS_URL: projectConfig.credentials.redis.url
        }
      }
    });
    log('PM2 configuration generated');

    // Step 6: Start PM2 app
    log('Starting PM2 application...');
    const startResult = await pm2Manager.startApp(name, ecosystemPath);
    if (!startResult.success) {
      throw new Error(`PM2 startup failed: ${startResult.error}`);
    }
    log('PM2 application started');

    // Step 7: Health check
    log('Performing health checks...');
    const healthResult = await pm2Manager.monitorStartup(
      name,
      projectConfig.ports.app,
      {
        retries: config.deployment.healthCheckRetries,
        interval: config.deployment.healthCheckInterval
      }
    );

    if (!healthResult.success) {
      log('Health check failed: ' + healthResult.errors.join(', '));
      throw new Error('Deployment failed health check');
    }
    log('Health checks passed');

    // Step 8: Save PM2 configuration
    await pm2Manager.savePM2();
    log('PM2 configuration saved');

    // Update project status
    projectConfig.status = 'deployed';
    projectConfig.lastDeployed = new Date().toISOString();
    await fs.writeFile(configPath, JSON.stringify(projectConfig, null, 2), 'utf8');

    log('Deployment completed successfully');

    res.json({
      success: true,
      message: 'Deployment completed successfully',
      project: name,
      url: `http://${config.powerdns.serverIp}:${projectConfig.ports.app}`,
      logs: deploymentLog
    });
  } catch (error) {
    log(`Deployment failed: ${error.message}`);

    res.status(500).json({
      success: false,
      error: 'Deployment failed',
      message: error.message,
      logs: deploymentLog
    });
  }
}

/**
 * Start project (containers + PM2 app)
 */
async function startProject(req, res) {
  try {
    const { name } = req.params;
    const projectPath = path.join(config.paths.projects, name);

    // Start containers
    const containerResult = await podmanManager.startContainers(projectPath);
    if (!containerResult.success) {
      throw new Error(`Container startup failed: ${containerResult.error}`);
    }

    // Wait for containers
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Start PM2 app
    const ecosystemPath = path.join(projectPath, '.codeb', 'ecosystem.config.js');
    const pm2Result = await pm2Manager.startApp(name, ecosystemPath);
    if (!pm2Result.success) {
      throw new Error(`PM2 startup failed: ${pm2Result.error}`);
    }

    res.json({
      success: true,
      message: `Project ${name} started successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to start project',
      message: error.message
    });
  }
}

/**
 * Stop project (PM2 app + containers)
 */
async function stopProject(req, res) {
  try {
    const { name } = req.params;
    const projectPath = path.join(config.paths.projects, name);

    // Stop PM2 app
    await pm2Manager.stopApp(name);

    // Stop containers
    await podmanManager.stopContainers(projectPath);

    res.json({
      success: true,
      message: `Project ${name} stopped successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to stop project',
      message: error.message
    });
  }
}

/**
 * Restart project
 */
async function restartProject(req, res) {
  try {
    const { name } = req.params;
    const projectPath = path.join(config.paths.projects, name);

    // Restart containers
    await podmanManager.restartContainers(projectPath);

    // Wait for containers
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Restart PM2 app
    await pm2Manager.restartApp(name);

    res.json({
      success: true,
      message: `Project ${name} restarted successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to restart project',
      message: error.message
    });
  }
}

/**
 * Get project logs
 */
async function getProjectLogs(req, res) {
  try {
    const { name } = req.params;
    const { lines = 100, type = 'pm2' } = req.query;

    let logs;

    if (type === 'pm2') {
      logs = await pm2Manager.getAppLogs(name, parseInt(lines));
    } else if (type === 'container') {
      const containerName = req.query.container || `${name}-postgres`;
      logs = await podmanManager.getContainerLogs(containerName, parseInt(lines));
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid log type. Use "pm2" or "container"'
      });
    }

    res.json({
      success: true,
      project: name,
      type,
      logs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get logs',
      message: error.message
    });
  }
}

module.exports = { registerRoutes };
