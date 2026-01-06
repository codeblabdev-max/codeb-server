/**
 * CodeB v5.0 - Rollback Tool
 * Instant rollback to previous slot
 */

import { z } from 'zod';
import type {
  RollbackInput,
  RollbackResult,
  SlotName,
} from '../lib/types.js';
import { getSSHClient } from '../lib/ssh.js';
import { getSlotRegistry, updateSlotRegistry } from './slot.js';

// Input schema
export const rollbackInputSchema = z.object({
  projectName: z.string().describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).describe('Environment'),
  reason: z.string().optional().describe('Rollback reason for audit log'),
});

/**
 * Execute Rollback
 *
 * Flow:
 * 1. Get slot status
 * 2. Verify grace slot exists and is healthy
 * 3. Switch Caddy back to grace slot
 * 4. Swap slot states (grace → active, active → deployed)
 */
export async function executeRollback(input: RollbackInput): Promise<RollbackResult> {
  const { projectName, environment, reason } = input;

  const ssh = getSSHClient();
  const startTime = Date.now();

  try {
    await ssh.connect();

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
        error: `Grace slot ${targetSlot} is not healthy. Manual intervention required.`,
      };
    }

    // Step 3: Update Caddy config
    const domain = getDomain(projectName, environment);
    const caddyConfig = generateCaddyConfig(domain, graceSlot.port, projectName, environment, true);

    const caddyPath = `/etc/caddy/sites/${projectName}-${environment}.caddy`;
    await ssh.writeFile(caddyPath, caddyConfig);

    // Step 4: Reload Caddy
    await ssh.exec('systemctl reload caddy');

    // Step 5: Update slot states
    slots.activeSlot = targetSlot;
    slots[targetSlot] = {
      ...graceSlot,
      state: 'active',
      graceExpiresAt: undefined,
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
  } finally {
    ssh.disconnect();
  }
}

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
function generateCaddyConfig(
  domain: string,
  port: number,
  projectName: string,
  environment: string,
  isRollback: boolean
): string {
  return `# CodeB v5.0 - Auto-generated
# Project: ${projectName}
# Environment: ${environment}
# Generated: ${new Date().toISOString()}
# ROLLBACK: ${isRollback}

${domain} {
    reverse_proxy localhost:${port} {
        health_uri /health
        health_interval 10s
        health_timeout 5s
    }

    encode gzip

    header {
        X-CodeB-Project ${projectName}
        X-CodeB-Environment ${environment}
        X-CodeB-Rollback ${isRollback}
        -Server
    }

    log {
        output file /var/log/caddy/${projectName}-${environment}.log {
            roll_size 10mb
            roll_keep 5
        }
    }
}
`;
}

/**
 * Log rollback event for audit
 */
async function logRollbackEvent(
  ssh: ReturnType<typeof getSSHClient>,
  projectName: string,
  environment: string,
  event: {
    fromSlot: SlotName;
    toSlot: SlotName;
    fromVersion?: string;
    toVersion?: string;
    reason?: string;
    timestamp: string;
  }
): Promise<void> {
  const logDir = `/opt/codeb/logs/rollbacks`;
  const logFile = `${logDir}/${projectName}-${environment}.log`;

  await ssh.exec(`mkdir -p ${logDir}`);

  const logEntry = JSON.stringify(event);
  await ssh.exec(`echo '${logEntry}' >> ${logFile}`);
}

/**
 * Rollback tool definition
 */
export const rollbackTool = {
  name: 'rollback',
  description: 'Instant rollback to previous version. Switches traffic back to grace slot.',
  inputSchema: rollbackInputSchema,
  execute: executeRollback,
};
