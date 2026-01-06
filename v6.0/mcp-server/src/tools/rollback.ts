/**
 * CodeB v6.0 - Rollback Tool
 * Instant rollback to previous slot
 */

import { z } from 'zod';
import type {
  RollbackInput,
  RollbackResult,
  SlotName,
  AuthContext,
} from '../lib/types.js';
import { withSSH } from '../lib/ssh.js';
import { SERVERS } from '../lib/servers.js';
import { getSlotRegistry, updateSlotRegistry } from './slot.js';

// ============================================================================
// Input Schema
// ============================================================================

export const rollbackInputSchema = z.object({
  projectName: z.string().describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).describe('Environment'),
  reason: z.string().optional().describe('Rollback reason for audit log'),
});

// ============================================================================
// Rollback Execution
// ============================================================================

/**
 * Execute Rollback
 *
 * Flow:
 * 1. Get slot status
 * 2. Verify grace slot exists and is healthy
 * 3. Switch Caddy back to grace slot
 * 4. Swap slot states (grace → active, active → deployed)
 * 5. Log rollback event
 */
export async function executeRollback(
  input: RollbackInput,
  auth: AuthContext
): Promise<RollbackResult> {
  const { projectName, environment, reason } = input;

  // Validate team has access to project
  if (!auth.projects.includes(projectName) && auth.role !== 'owner') {
    return {
      success: false,
      fromSlot: 'blue',
      toSlot: 'green',
      restoredVersion: '',
      duration: 0,
      error: `Access denied: project ${projectName} not in team scope`,
    };
  }

  const startTime = Date.now();

  return withSSH(SERVERS.app.ip, async (ssh) => {
    try {
      // Step 1: Get slot status
      const slots = await getSlotRegistry(projectName, environment);

      const currentActive = slots.activeSlot;
      const targetSlot: SlotName = currentActive === 'blue' ? 'green' : 'blue';
      const graceSlot = slots[targetSlot];
      const activeSlot = slots[currentActive];

      // Verify target slot is in grace state (has previous version)
      if (graceSlot.state !== 'grace') {
        return {
          success: false,
          fromSlot: currentActive,
          toSlot: targetSlot,
          restoredVersion: '',
          duration: Date.now() - startTime,
          error: `No previous version available for rollback. Slot ${targetSlot} is ${graceSlot.state}.`,
        };
      }

      // Step 2: Health check on grace slot
      const healthResult = await ssh.exec(
        `curl -sf -o /dev/null -w '%{http_code}' http://localhost:${graceSlot.port}/health 2>/dev/null || echo "000"`
      );

      if (!healthResult.stdout.trim().startsWith('2')) {
        return {
          success: false,
          fromSlot: currentActive,
          toSlot: targetSlot,
          restoredVersion: graceSlot.version || '',
          duration: Date.now() - startTime,
          error: `Grace slot ${targetSlot} is not healthy (port ${graceSlot.port}). Manual intervention required.`,
        };
      }

      // Step 3: Update Caddy config
      const domain = getDomain(projectName, environment);
      const caddyConfig = generateCaddyConfig({
        domain,
        port: graceSlot.port,
        projectName,
        environment,
        version: graceSlot.version || 'unknown',
        slot: targetSlot,
        teamId: auth.teamId,
        isRollback: true,
        reason,
      });

      const caddyPath = `/etc/caddy/sites/${projectName}-${environment}.caddy`;
      await ssh.writeFile(caddyPath, caddyConfig);

      // Step 4: Reload Caddy (zero-downtime)
      await ssh.exec('systemctl reload caddy');

      // Step 5: Update slot states
      slots.activeSlot = targetSlot;
      slots[targetSlot] = {
        ...graceSlot,
        state: 'active',
        graceExpiresAt: undefined,
        rolledBackAt: new Date().toISOString(),
        rolledBackBy: auth.keyId,
      };
      slots[currentActive] = {
        ...activeSlot,
        state: 'deployed', // Can be promoted again or cleaned up
      };
      slots.lastUpdated = new Date().toISOString();

      await updateSlotRegistry(projectName, environment, slots);

      // Step 6: Log rollback event
      await logRollbackEvent(ssh, projectName, environment, {
        fromSlot: currentActive,
        toSlot: targetSlot,
        fromVersion: activeSlot.version,
        toVersion: graceSlot.version,
        reason,
        keyId: auth.keyId,
        teamId: auth.teamId,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        fromSlot: currentActive,
        toSlot: targetSlot,
        restoredVersion: graceSlot.version || 'unknown',
        duration: Date.now() - startTime,
      };

    } catch (error) {
      return {
        success: false,
        fromSlot: 'blue',
        toSlot: 'green',
        restoredVersion: '',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get domain for project/environment
 */
function getDomain(projectName: string, environment: string): string {
  if (environment === 'production') {
    return `${projectName}.codeb.dev`;
  }
  return `${projectName}-${environment}.codeb.dev`;
}

/**
 * Generate Caddy configuration with rollback marker
 */
function generateCaddyConfig(config: {
  domain: string;
  port: number;
  projectName: string;
  environment: string;
  version: string;
  slot: string;
  teamId: string;
  isRollback: boolean;
  reason?: string;
}): string {
  const timestamp = new Date().toISOString();

  return `# CodeB v6.0 - Auto-generated Caddy Config
# Project: ${config.projectName}
# Environment: ${config.environment}
# Version: ${config.version}
# Slot: ${config.slot}
# Team: ${config.teamId}
# ROLLBACK: true
# Rollback Reason: ${config.reason || 'Not specified'}
# Generated: ${timestamp}

${config.domain} {
    reverse_proxy localhost:${config.port} {
        health_uri /health
        health_interval 10s
        health_timeout 5s
        health_status 2xx
    }

    encode gzip zstd

    header {
        X-CodeB-Project ${config.projectName}
        X-CodeB-Environment ${config.environment}
        X-CodeB-Version ${config.version}
        X-CodeB-Rollback true
        -Server
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
    }

    log {
        output file /var/log/caddy/${config.projectName}-${config.environment}.log {
            roll_size 10mb
            roll_keep 5
            roll_keep_for 720h
        }
        format json
    }
}
`;
}

/**
 * Log rollback event for audit
 */
async function logRollbackEvent(
  ssh: ReturnType<typeof import('../lib/ssh.js').getSSHClient>,
  projectName: string,
  environment: string,
  event: {
    fromSlot: SlotName;
    toSlot: SlotName;
    fromVersion?: string;
    toVersion?: string;
    reason?: string;
    keyId: string;
    teamId: string;
    timestamp: string;
  }
): Promise<void> {
  const logDir = `/opt/codeb/logs/rollbacks`;
  const logFile = `${logDir}/${projectName}-${environment}.jsonl`;

  await ssh.mkdir(logDir);

  // Use JSON Lines format for easy parsing
  const logEntry = JSON.stringify(event);

  // Escape for shell - use base64 to avoid any escaping issues
  const base64Entry = Buffer.from(logEntry).toString('base64');
  await ssh.exec(`echo '${base64Entry}' | base64 -d >> ${logFile}`);
}

// ============================================================================
// Tool Definition
// ============================================================================

export const rollbackTool = {
  name: 'rollback',
  description: 'Instant rollback to previous version. Switches traffic back to grace slot.',
  inputSchema: rollbackInputSchema,

  async execute(params: RollbackInput, auth: AuthContext): Promise<RollbackResult> {
    return executeRollback(params, auth);
  },
};
