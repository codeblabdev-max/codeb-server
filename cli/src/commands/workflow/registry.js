/**
 * Project Registry Management
 *
 * Handles project registry operations via MCP SSOT or SSH fallback
 * - Read/Write project registry
 * - SSOT to legacy format conversion
 * - Default registry structure
 */

import chalk from 'chalk';
import { ssotClient } from '../../lib/ssot-client.js';
import { mcpClient } from '../../lib/mcp-client.js';

/**
 * Read project registry from server via MCP SSOT
 * Falls back to SSH direct only when MCP is unavailable
 * @param {string} serverHost - Server hostname
 * @param {string} serverUser - SSH username
 * @returns {Promise<Object>} Registry data or default structure
 */
export async function readProjectRegistry(serverHost, serverUser) {
  // Try MCP first (preferred path)
  try {
    const isConnected = await mcpClient.ensureConnected();
    if (isConnected) {
      const ssotData = await ssotClient.get();
      if (ssotData && !ssotData.error) {
        // Convert SSOT format to legacy registry format for compatibility
        return convertSSOTToLegacyRegistry(ssotData);
      }
    }
  } catch (mcpError) {
    // MCP failed, will fall through to SSH fallback
    console.log(chalk.gray(`  MCP not available, using SSH fallback...`));
  }

  // SSH Fallback (only when MCP unavailable)
  const { execSync } = await import('child_process');
  try {
    const cmd = `ssh ${serverUser}@${serverHost} "cat /opt/codeb/config/project-registry.json 2>/dev/null"`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
    return JSON.parse(output);
  } catch {
    // Return default registry structure
    return getDefaultRegistryStructure();
  }
}

/**
 * Convert SSOT format to legacy registry format
 * @param {Object} ssotData - SSOT data
 * @returns {Object} Legacy registry format
 */
export function convertSSOTToLegacyRegistry(ssotData) {
  const registry = {
    version: ssotData.version || '2.0',
    updated_at: ssotData.lastModified || new Date().toISOString(),
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

  // Convert SSOT projects to legacy format
  if (ssotData.projects) {
    for (const [projectId, projectData] of Object.entries(ssotData.projects)) {
      registry.projects[projectId] = {
        created_at: projectData.createdAt || new Date().toISOString(),
        type: projectData.type || 'nextjs',
        resources: projectData.resources || {},
        environments: {}
      };

      // Convert environments
      if (projectData.environments) {
        for (const [envName, envData] of Object.entries(projectData.environments)) {
          registry.projects[projectId].environments[envName] = {
            port: envData.ports?.app,
            db_port: envData.ports?.db,
            redis_port: envData.ports?.redis,
            domain: envData.domain
          };
        }
      }
    }
  }

  return registry;
}

/**
 * Get default registry structure
 * @returns {Object} Default registry structure
 */
export function getDefaultRegistryStructure() {
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

/**
 * Write project registry to server via MCP SSOT
 * Falls back to SSH direct only when MCP is unavailable
 * @param {string} serverHost - Server hostname
 * @param {string} serverUser - SSH username
 * @param {Object} registry - Registry data to write
 */
export async function writeProjectRegistry(serverHost, serverUser, registry) {
  // Try MCP first (preferred path) - register/update projects via SSOT
  try {
    const isConnected = await mcpClient.ensureConnected();
    if (isConnected) {
      // Update each project in SSOT
      for (const [projectId, projectData] of Object.entries(registry.projects || {})) {
        const existingProject = await ssotClient.getProject(projectId);

        if (!existingProject) {
          // Register new project
          await ssotClient.registerProject(projectId, projectData.type || 'nextjs', {
            description: projectData.description,
            gitRepo: projectData.git_repo
          });
        }

        // Update environment ports/domains
        for (const [envName, envData] of Object.entries(projectData.environments || {})) {
          if (envData.port) {
            await ssotClient.allocatePort(projectId, envName, 'app');
          }
          if (envData.domain) {
            await ssotClient.setDomain(projectId, envName, envData.domain, envData.port);
          }
        }
      }

      // Clear SSOT cache to ensure fresh data on next read
      ssotClient.clearCache();
      return;
    }
  } catch (mcpError) {
    // MCP failed, will fall through to SSH fallback
    console.log(chalk.gray(`  MCP not available, using SSH fallback...`));
  }

  // SSH Fallback (only when MCP unavailable)
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
