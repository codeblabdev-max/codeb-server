/**
 * Port Utilities
 *
 * Port scanning, validation, and allocation functions
 * - Port range definitions by environment
 * - Server port scanning via MCP/SSH
 * - Port conflict detection and resolution
 * - Redis DB index allocation
 * - Network management
 */

import chalk from 'chalk';
import { ssotClient } from '../../lib/ssot-client.js';
import { mcpClient } from '../../lib/mcp-client.js';
import { readProjectRegistry } from './registry.js';

/**
 * Port ranges by environment (GitOps standard)
 * Aligned with MCP server (codeb-deploy) for consistency
 */
export const PORT_RANGES = {
  staging: {
    app: { min: 3000, max: 3499 },
    db: { min: 5432, max: 5449 },
    redis: { min: 6379, max: 6399 }
  },
  production: {
    app: { min: 4000, max: 4499 },
    db: { min: 5450, max: 5469 },
    redis: { min: 6400, max: 6419 }
  },
  preview: {
    app: { min: 5000, max: 5999 },
    db: { min: 5470, max: 5499 },
    redis: { min: 6420, max: 6439 }
  }
};

/**
 * Find next available Redis DB index
 * @param {Object} registry - Project registry
 * @returns {number} Next available DB index (0-15)
 */
export function findNextRedisDbIndex(registry) {
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
 * @param {Object} registry - Project registry
 * @param {number} basePort - Starting port
 * @param {number[]} usedPorts - Additional used ports
 * @returns {number} Next available port
 */
export function findNextAvailablePort(registry, basePort, usedPorts = []) {
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

/**
 * Get project network name for isolation
 * MCP server의 podman-helpers.ts와 동일한 로직
 *
 * @param {string} projectName - Project name
 * @param {string} environment - Environment (staging|production|preview)
 * @param {boolean} useIsolatedNetwork - Use isolated network (default: true)
 * @returns {string} Network name
 */
export function getProjectNetworkName(projectName, environment, useIsolatedNetwork = true) {
  if (useIsolatedNetwork && projectName && environment) {
    return `codeb-net-${projectName}-${environment}`;
  }
  return 'codeb-network';  // Legacy shared network
}

/**
 * Ensure network exists on server, create if not
 * @param {string} networkName - Network name
 * @param {string} serverHost - Server hostname
 * @param {string} serverUser - SSH username
 * @returns {Promise<{exists: boolean, created: boolean}>}
 */
export async function ensureNetworkExists(networkName, serverHost, serverUser) {
  const { execSync } = await import('child_process');

  try {
    // Check if network exists
    const checkCmd = `ssh ${serverUser}@${serverHost} "podman network exists ${networkName} && echo 'exists' || echo 'not_found'"`;
    const result = execSync(checkCmd, { encoding: 'utf-8', timeout: 10000 }).trim();

    if (result === 'exists') {
      return { exists: true, created: false };
    }

    // Create network
    const createCmd = `ssh ${serverUser}@${serverHost} "podman network create ${networkName} --label codeb.managed=true"`;
    execSync(createCmd, { timeout: 30000 });

    return { exists: true, created: true };
  } catch (error) {
    console.error(`Failed to ensure network ${networkName}: ${error.message}`);
    return { exists: false, created: false };
  }
}

/**
 * Scan server for currently used ports via MCP
 * Falls back to SSH direct only when MCP is unavailable
 * @param {string} serverHost - Server hostname
 * @param {string} serverUser - SSH username
 * @returns {Promise<{usedPorts: Set<number>, portOwners: Map<number, string>, errors: string[]}>}
 */
export async function scanServerPorts(serverHost, serverUser) {
  const usedPorts = new Set();
  const portOwners = new Map(); // port -> owner (container name or process)
  const errors = [];

  // Try MCP first (preferred path)
  try {
    const isConnected = await mcpClient.ensureConnected();
    if (isConnected) {
      // Use MCP port_summary and sync_port_registry for comprehensive port data
      const [portSummary, syncResult] = await Promise.all([
        mcpClient.callTool('port_summary', {}),
        mcpClient.callTool('sync_port_registry', { saveToServer: false })
      ]);

      // Process port summary data
      if (portSummary && !portSummary.error) {
        const summary = typeof portSummary === 'string' ? JSON.parse(portSummary) : portSummary;

        // Add allocated ports from summary
        if (summary.allocatedPorts) {
          for (const allocation of summary.allocatedPorts) {
            const port = parseInt(allocation.port);
            if (!isNaN(port)) {
              usedPorts.add(port);
              portOwners.set(port, allocation.project || allocation.owner || 'allocated');
            }
          }
        }
      }

      // Process sync result (actual server state)
      if (syncResult && !syncResult.error) {
        const sync = typeof syncResult === 'string' ? JSON.parse(syncResult) : syncResult;

        if (sync.serverPorts) {
          for (const portInfo of sync.serverPorts) {
            const port = parseInt(portInfo.port);
            if (!isNaN(port)) {
              usedPorts.add(port);
              if (!portOwners.has(port)) {
                portOwners.set(port, portInfo.container || portInfo.process || 'server');
              }
            }
          }
        }
      }

      // Also get from SSOT for completeness
      const ssotData = await ssotClient.get();
      if (ssotData && ssotData.projects) {
        for (const [projName, project] of Object.entries(ssotData.projects)) {
          if (project.environments) {
            for (const [envName, env] of Object.entries(project.environments)) {
              if (env.ports) {
                for (const [serviceType, port] of Object.entries(env.ports)) {
                  if (port) {
                    usedPorts.add(parseInt(port));
                    if (!portOwners.has(parseInt(port))) {
                      portOwners.set(parseInt(port), `${projName}/${envName}/${serviceType}`);
                    }
                  }
                }
              }
            }
          }
        }
      }

      return { usedPorts, portOwners, errors };
    }
  } catch (mcpError) {
    // MCP failed, will fall through to SSH fallback
    errors.push(`MCP port scan failed, using SSH fallback: ${mcpError.message}`);
  }

  // SSH Fallback (only when MCP unavailable)
  const { execSync } = await import('child_process');

  try {
    // 1. Get ports from running containers
    const containerCmd = `ssh ${serverUser}@${serverHost} "podman ps --format '{{.Names}}|{{.Ports}}' 2>/dev/null"`;
    const containerOutput = execSync(containerCmd, { encoding: 'utf-8', timeout: 30000 }).trim();

    if (containerOutput) {
      for (const line of containerOutput.split('\n')) {
        const [name, ports] = line.split('|');
        if (ports) {
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
    errors.push(`SSH port scan error: ${error.message}`);
  }

  return { usedPorts, portOwners, errors };
}

/**
 * Validate port and suggest alternative if conflict
 * @param {number} port - Port to validate
 * @param {string} environment - Environment (staging|production|preview)
 * @param {string} serviceType - Service type (app|db|redis)
 * @param {Set<number>} usedPorts - Set of used ports
 * @param {Map<number, string>} portOwners - Map of port to owner
 * @returns {{ valid: boolean, suggested?: number, conflict?: string, warnings: string[] }}
 */
export function validatePort(port, environment, serviceType, usedPorts, portOwners) {
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
 * @param {string} environment - Environment
 * @param {string} serviceType - Service type
 * @param {Set<number>} usedPorts - Set of used ports
 * @returns {number} Next available port
 */
export function findSafePort(environment, serviceType, usedPorts) {
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
 * @param {Object} config - Project configuration
 * @param {string} serverHost - Server hostname
 * @param {string} serverUser - SSH username
 * @param {Object} spinner - Ora spinner instance
 * @returns {Promise<Object>} Validation results
 */
export async function autoScanAndValidatePorts(config, serverHost, serverUser, spinner) {
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
