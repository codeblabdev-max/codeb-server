/**
 * Resource Scanner Module
 *
 * Scans server resources for project infrastructure:
 * - Database (PostgreSQL)
 * - Redis cache
 * - Storage directories
 * - Environment files
 * - Project registry
 *
 * @module workflow/resource-scanner
 */

import { mcpClient } from '../../lib/mcp-client.js';
import { ssotClient } from '../../lib/ssot-client.js';
import { readProjectRegistry } from './registry.js';

/**
 * Scan project resources on server via MCP
 * Falls back to SSH direct only when MCP is unavailable
 * @param {Object} config - Configuration
 * @param {string} config.projectName - Project name
 * @param {string} config.serverHost - Server hostname
 * @param {string} config.serverUser - Server username
 * @returns {Object} Resource scan results
 */
export async function scanProjectResources(config) {
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
