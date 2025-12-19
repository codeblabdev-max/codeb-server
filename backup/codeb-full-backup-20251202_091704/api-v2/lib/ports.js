/**
 * Port Management System
 * Handles port allocation, conflict detection, and availability checking
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const config = require('../config');

const execAsync = promisify(exec);

/**
 * Get all currently used ports on the system
 * @returns {Promise<Set<number>>} Set of used port numbers
 */
async function getUsedPorts() {
  const used = new Set();

  try {
    // Get Podman container ports
    const { stdout: podmanPorts } = await execAsync('podman ps -a --format "{{.Ports}}"');
    const portMappings = podmanPorts.split('\n').filter(Boolean);

    for (const mapping of portMappings) {
      // Extract host ports from format like "0.0.0.0:3010->3000/tcp"
      const matches = mapping.matchAll(/(\d+)->/g);
      for (const match of matches) {
        used.add(parseInt(match[1]));
      }
    }

    // Get PM2 process ports (from environment or config)
    const { stdout: pm2List } = await execAsync('pm2 jlist');
    const pm2Processes = JSON.parse(pm2List);

    for (const proc of pm2Processes) {
      if (proc.pm2_env && proc.pm2_env.PORT) {
        used.add(parseInt(proc.pm2_env.PORT));
      }
    }
  } catch (error) {
    console.warn('Warning: Could not get all used ports:', error.message);
  }

  return used;
}

/**
 * Find next available port in a given range
 * @param {string} type - Port type (app, postgres, mysql, redis, memcached)
 * @param {Set<number>} usedPorts - Set of already used ports
 * @returns {number} Next available port number
 * @throws {Error} If no ports available in range
 */
function findNextPort(type, usedPorts = new Set()) {
  const portConfig = config.ports[type];

  if (!portConfig) {
    throw new Error(`Unknown port type: ${type}`);
  }

  for (let i = 0; i < portConfig.max; i++) {
    const port = portConfig.start + i;
    if (!usedPorts.has(port)) {
      return port;
    }
  }

  throw new Error(`No available ports for ${type} (range: ${portConfig.start}-${portConfig.start + portConfig.max - 1})`);
}

/**
 * Allocate ports for a new project
 * @param {string} projectName - Name of the project
 * @param {string[]} services - List of services (app, postgres, redis, etc.)
 * @returns {Promise<Object>} Map of service to allocated port
 */
async function allocatePorts(projectName, services = ['app']) {
  const usedPorts = await getUsedPorts();
  const allocation = {};

  for (const service of services) {
    try {
      const port = findNextPort(service, usedPorts);
      allocation[service] = port;
      usedPorts.add(port); // Mark as used for next iteration
    } catch (error) {
      throw new Error(`Failed to allocate port for ${service}: ${error.message}`);
    }
  }

  return allocation;
}

/**
 * Check if a specific port is available
 * @param {number} port - Port number to check
 * @returns {Promise<boolean>} True if port is available
 */
async function isPortAvailable(port) {
  const used = await getUsedPorts();
  return !used.has(port);
}

/**
 * Get port allocation for existing project
 * @param {string} projectName - Name of the project
 * @returns {Promise<Object|null>} Port allocation or null if not found
 */
async function getProjectPorts(projectName) {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const projectPath = path.join(config.paths.projects, projectName, '.codeb', 'project.json');

    const data = await fs.readFile(projectPath, 'utf8');
    const projectConfig = JSON.parse(data);

    return projectConfig.ports || null;
  } catch (error) {
    return null;
  }
}

/**
 * Release ports (mark as available again)
 * @param {Object} ports - Map of service to port number
 * @returns {Promise<void>}
 */
async function releasePorts(ports) {
  // In future, maintain a registry of allocated ports
  // For now, ports are released when containers/processes stop
  console.log('Ports released:', ports);
}

/**
 * Get port usage statistics
 * @returns {Promise<Object>} Usage statistics by port type
 */
async function getPortStats() {
  const used = await getUsedPorts();
  const stats = {};

  for (const [type, portConfig] of Object.entries(config.ports)) {
    const rangeStart = portConfig.start;
    const rangeEnd = portConfig.start + portConfig.max - 1;

    const usedInRange = Array.from(used).filter(
      port => port >= rangeStart && port <= rangeEnd
    ).length;

    stats[type] = {
      name: portConfig.name,
      range: `${rangeStart}-${rangeEnd}`,
      total: portConfig.max,
      used: usedInRange,
      available: portConfig.max - usedInRange,
      utilization: ((usedInRange / portConfig.max) * 100).toFixed(1) + '%'
    };
  }

  return stats;
}

module.exports = {
  getUsedPorts,
  findNextPort,
  allocatePorts,
  isPortAvailable,
  getProjectPorts,
  releasePorts,
  getPortStats
};
