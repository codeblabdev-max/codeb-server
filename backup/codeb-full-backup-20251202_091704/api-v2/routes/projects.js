/**
 * Project Management Routes
 * CRUD operations for CodeB projects
 */

const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const portManager = require('../lib/ports');
const podmanManager = require('../lib/podman');
const pm2Manager = require('../lib/pm2');

/**
 * Register project routes
 * @param {Express} app - Express app instance
 */
function registerRoutes(app) {
  // List all projects
  app.get('/projects', listProjects);

  // Get project details
  app.get('/projects/:name', getProject);

  // Create new project
  app.post('/projects', createProject);

  // Delete project
  app.delete('/projects/:name', deleteProject);

  // Get project status
  app.get('/projects/:name/status', getProjectStatus);
}

/**
 * List all registered projects
 */
async function listProjects(req, res) {
  try {
    const projectsDir = config.paths.projects;
    const entries = await fs.readdir(projectsDir);

    const projects = [];

    for (const entry of entries) {
      const projectPath = path.join(projectsDir, entry);
      const stat = await fs.stat(projectPath);

      if (!stat.isDirectory()) continue;

      const configPath = path.join(projectPath, '.codeb', 'project.json');

      try {
        const configData = await fs.readFile(configPath, 'utf8');
        const projectConfig = JSON.parse(configData);
        projects.push(projectConfig);
      } catch (error) {
        // Project directory exists but no config - skip
        continue;
      }
    }

    res.json({
      success: true,
      count: projects.length,
      projects
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to list projects',
      message: error.message
    });
  }
}

/**
 * Get project details
 */
async function getProject(req, res) {
  try {
    const { name } = req.params;
    const configPath = path.join(config.paths.projects, name, '.codeb', 'project.json');

    const configData = await fs.readFile(configPath, 'utf8');
    const projectConfig = JSON.parse(configData);

    // Get runtime status
    const pm2Status = await pm2Manager.getAppStatus(name);
    const containerStatus = await podmanManager.getContainerStatus(name);

    res.json({
      success: true,
      project: {
        ...projectConfig,
        runtime: {
          pm2: pm2Status,
          containers: containerStatus
        }
      }
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: 'Project not found',
      message: error.message
    });
  }
}

/**
 * Create new project
 */
async function createProject(req, res) {
  try {
    const {
      name,
      type = 'nodejs',
      services = {}
    } = req.body;

    // Validate project name
    if (!name || !/^[a-z0-9-]+$/.test(name)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid project name. Use lowercase letters, numbers, and hyphens only.'
      });
    }

    // Check if project already exists
    const projectPath = path.join(config.paths.projects, name);
    try {
      await fs.access(projectPath);
      return res.status(409).json({
        success: false,
        error: 'Project already exists'
      });
    } catch {
      // Project doesn't exist, continue
    }

    // Allocate ports
    const serviceTypes = ['app'];
    if (services.postgres) serviceTypes.push('postgres');
    if (services.mysql) serviceTypes.push('mysql');
    if (services.redis) serviceTypes.push('redis');
    if (services.memcached) serviceTypes.push('memcached');

    const ports = await portManager.allocatePorts(name, serviceTypes);

    // Create project directory structure
    await fs.mkdir(projectPath, { recursive: true });
    await fs.mkdir(path.join(projectPath, 'app'), { recursive: true });
    await fs.mkdir(path.join(projectPath, '.codeb'), { recursive: true });
    await fs.mkdir(path.join(projectPath, '.codeb', 'logs'), { recursive: true });

    // Create docker-compose.yml if services requested
    let serviceCredentials = {};
    if (serviceTypes.length > 1) {
      await podmanManager.createDockerCompose(name, services, ports);

      // Extract credentials from services object (modified by createDockerCompose)
      if (services.postgres?.credentials) {
        serviceCredentials.postgres = services.postgres.credentials;
      }
      if (services.mysql?.credentials) {
        serviceCredentials.mysql = services.mysql.credentials;
      }
      if (services.redis?.credentials) {
        serviceCredentials.redis = services.redis.credentials;
      }
      if (services.memcached?.credentials) {
        serviceCredentials.memcached = services.memcached.credentials;
      }
    }

    // Generate .env file
    const envVars = {
      NODE_ENV: 'production',
      PORT: ports.app,
      ...serviceCredentials.postgres && {
        DATABASE_URL: serviceCredentials.postgres.url
      },
      ...serviceCredentials.mysql && {
        DATABASE_URL: serviceCredentials.mysql.url
      },
      ...serviceCredentials.redis && {
        REDIS_URL: serviceCredentials.redis.url
      }
    };

    const envContent = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    await fs.writeFile(path.join(projectPath, 'app', '.env'), envContent, 'utf8');

    // Create project config
    const projectConfig = {
      name,
      type,
      version: '1.0.0',
      created: new Date().toISOString(),
      ports,
      services: Object.keys(services),
      credentials: serviceCredentials,
      pm2: {
        name,
        instances: 1,
        exec_mode: 'fork'
      },
      status: 'created'
    };

    await fs.writeFile(
      path.join(projectPath, '.codeb', 'project.json'),
      JSON.stringify(projectConfig, null, 2),
      'utf8'
    );

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      project: projectConfig
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to create project',
      message: error.message
    });
  }
}

/**
 * Delete project
 */
async function deleteProject(req, res) {
  try {
    const { name } = req.params;
    const projectPath = path.join(config.paths.projects, name);

    // Check if project exists
    try {
      await fs.access(projectPath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Stop and delete PM2 app
    await pm2Manager.stopApp(name);
    await pm2Manager.deleteApp(name);

    // Stop and remove containers
    await podmanManager.removeContainers(projectPath);

    // Remove project directory
    await fs.rm(projectPath, { recursive: true, force: true });

    res.json({
      success: true,
      message: `Project ${name} deleted successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete project',
      message: error.message
    });
  }
}

/**
 * Get project status
 */
async function getProjectStatus(req, res) {
  try {
    const { name } = req.params;

    // Get PM2 status
    const pm2Status = await pm2Manager.getAppStatus(name);

    // Get container status
    const containerStatus = await podmanManager.getContainerStatus(name);

    // Get ports
    const ports = await portManager.getProjectPorts(name);

    res.json({
      success: true,
      project: name,
      status: {
        pm2: pm2Status,
        containers: containerStatus,
        ports
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get project status',
      message: error.message
    });
  }
}

module.exports = { registerRoutes };
