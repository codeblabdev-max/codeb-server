/**
 * CodeB v5.0 - Promote Tool
 * Switch traffic from active slot to deployed slot
 */

import { z } from 'zod';
import type {
  PromoteInput,
  PromoteResult,
  SlotName,
  ProjectSlots,
} from '../lib/types.js';
import { getSSHClient } from '../lib/ssh.js';
import { SERVERS } from '../lib/servers.js';
import { getSlotRegistry, updateSlotRegistry } from './slot.js';

// Input schema
export const promoteInputSchema = z.object({
  projectName: z.string().describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).describe('Environment'),
});

// Grace period before cleaning up old slot (48 hours)
const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000;

/**
 * Execute Promote
 *
 * Flow:
 * 1. Get slot status
 * 2. Verify deployed slot is healthy
 * 3. Update Caddy config to point to new slot
 * 4. Reload Caddy (zero-downtime)
 * 5. Mark old slot as "grace" (48h cleanup)
 * 6. Mark new slot as "active"
 */
export async function executePromote(input: PromoteInput): Promise<PromoteResult> {
  const { projectName, environment } = input;

  const ssh = getSSHClient();
  const startTime = Date.now();

  try {
    await ssh.connect();

    // Step 1: Get slot status
    const slots = await getSlotRegistry(projectName, environment);

    const currentActive = slots.activeSlot;
    const newActive: SlotName = currentActive === 'blue' ? 'green' : 'blue';
    const newSlot = slots[newActive];
    const oldSlot = slots[currentActive];

    // Verify new slot is in "deployed" state
    if (newSlot.state !== 'deployed') {
      return {
        success: false,
        fromSlot: currentActive,
        toSlot: newActive,
        productionUrl: '',
        newVersion: '',
        duration: Date.now() - startTime,
        error: `Slot ${newActive} is not deployed (state: ${newSlot.state}). Run 'we deploy' first.`,
      };
    }

    // Step 2: Final health check on new slot
    const healthResult = await ssh.exec(
      `curl -sf -o /dev/null -w '%{http_code}' http://localhost:${newSlot.port}/health 2>/dev/null || echo "000"`
    );

    if (!healthResult.stdout.trim().startsWith('2')) {
      return {
        success: false,
        fromSlot: currentActive,
        toSlot: newActive,
        productionUrl: '',
        newVersion: newSlot.version || '',
        duration: Date.now() - startTime,
        error: `Health check failed on ${newActive} slot (port ${newSlot.port})`,
      };
    }

    // Step 3: Generate Caddy config
    const domain = getDomain(projectName, environment);
    const caddyConfig = generateCaddyConfig(domain, newSlot.port, projectName, environment);

    // Step 4: Write Caddy config
    const caddyPath = `/etc/caddy/sites/${projectName}-${environment}.caddy`;
    await ssh.writeFile(caddyPath, caddyConfig);

    // Step 5: Reload Caddy (zero-downtime)
    await ssh.exec('systemctl reload caddy');

    // Step 6: Update slot states
    const graceExpiresAt = new Date(Date.now() + GRACE_PERIOD_MS).toISOString();

    slots.activeSlot = newActive;
    slots[newActive] = {
      ...newSlot,
      state: 'active',
    };
    slots[currentActive] = {
      ...oldSlot,
      state: 'grace',
      graceExpiresAt,
    };
    slots.lastUpdated = new Date().toISOString();

    await updateSlotRegistry(projectName, environment, slots);

    // Build production URL
    const productionUrl = `https://${domain}`;

    return {
      success: true,
      fromSlot: currentActive,
      toSlot: newActive,
      productionUrl,
      previousVersion: oldSlot.version,
      newVersion: newSlot.version || 'unknown',
      duration: Date.now() - startTime,
    };

  } catch (error) {
    return {
      success: false,
      fromSlot: 'blue',
      toSlot: 'green',
      productionUrl: '',
      newVersion: '',
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
 * Generate Caddy configuration
 */
function generateCaddyConfig(
  domain: string,
  port: number,
  projectName: string,
  environment: string
): string {
  return `# CodeB v5.0 - Auto-generated
# Project: ${projectName}
# Environment: ${environment}
# Generated: ${new Date().toISOString()}

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
 * Promote tool definition
 */
export const promoteTool = {
  name: 'promote',
  description: 'Switch production traffic to deployed slot. Zero-downtime traffic switch.',
  inputSchema: promoteInputSchema,
  execute: executePromote,
};
