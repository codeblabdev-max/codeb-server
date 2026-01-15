/**
 * CodeB v6.0 - Promote Tool
 * Switch traffic from active slot to deployed slot
 */

import { z } from 'zod';
import type {
  PromoteInput,
  PromoteResult,
  SlotName,
  AuthContext,
} from '../lib/types.js';
import { withSSH } from '../lib/ssh.js';
import { SERVERS } from '../lib/servers.js';
import { getSlotRegistry, updateSlotRegistry } from './slot.js';

// ============================================================================
// Input Schema
// ============================================================================

export const promoteInputSchema = z.object({
  projectName: z.string().describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).describe('Environment'),
});

// Grace period before cleaning up old slot (48 hours)
const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000;

// ============================================================================
// Promote Execution
// ============================================================================

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
export async function executePromote(
  input: PromoteInput,
  auth: AuthContext
): Promise<PromoteResult> {
  const { projectName, environment } = input;

  // Validate team has access to project
  if (!auth.projects.includes(projectName) && auth.role !== 'owner') {
    return {
      success: false,
      fromSlot: 'blue',
      toSlot: 'green',
      productionUrl: '',
      newVersion: '',
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
          error: `Slot ${newActive} is not deployed (state: ${newSlot.state}). Run 'deploy' first.`,
        };
      }

      // Step 2: Final health check on new slot (root path, not /health)
      const healthResult = await ssh.exec(
        `curl -sf -o /dev/null -w '%{http_code}' http://localhost:${newSlot.port}/ --connect-timeout 5 2>/dev/null || echo "000"`
      );

      if (!healthResult.stdout.trim().startsWith('2') && !healthResult.stdout.trim().startsWith('3')) {
        return {
          success: false,
          fromSlot: currentActive,
          toSlot: newActive,
          productionUrl: '',
          newVersion: newSlot.version || '',
          duration: Date.now() - startTime,
          error: `Health check failed on ${newActive} slot (port ${newSlot.port}): HTTP ${healthResult.stdout.trim()}`,
        };
      }

      // Step 3: Generate Caddy config (Blue-Green)
      const domain = getDomain(projectName, environment);
      const caddyConfig = generateCaddyConfig({
        domain,
        activePort: newSlot.port,      // 새 활성 슬롯 (먼저)
        standbyPort: oldSlot.port,     // 이전 슬롯 (대기)
        projectName,
        environment,
        version: newSlot.version || 'unknown',
        activeSlot: newActive,
        teamId: auth.teamId,
      });

      // Step 4: Write Caddy config
      const caddyDir = '/etc/caddy/sites';
      const caddyPath = `${caddyDir}/${projectName}-${environment}.caddy`;

      await ssh.mkdir(caddyDir);
      await ssh.writeFile(caddyPath, caddyConfig);

      // Step 5: Reload Caddy (zero-downtime)
      await ssh.exec('systemctl reload caddy');

      // Step 6: Update slot states
      const graceExpiresAt = new Date(Date.now() + GRACE_PERIOD_MS).toISOString();

      slots.activeSlot = newActive;
      slots[newActive] = {
        ...newSlot,
        state: 'active',
        promotedAt: new Date().toISOString(),
        promotedBy: auth.keyId,
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
    return `${projectName}.codeb.kr`;
  }
  return `${projectName}-${environment}.codeb.kr`;
}

/**
 * Generate Caddy configuration for Blue-Green deployment
 * Active slot comes first in reverse_proxy list (lb_policy first)
 */
function generateCaddyConfig(config: {
  domain: string;
  activePort: number;
  standbyPort: number;
  projectName: string;
  environment: string;
  version: string;
  activeSlot: string;
  teamId: string;
}): string {
  const timestamp = new Date().toISOString();

  return `# CodeB v7.0 - Blue-Green Caddy Config
# Project: ${config.projectName}
# Environment: ${config.environment}
# Version: ${config.version}
# Active Slot: ${config.activeSlot} (port ${config.activePort})
# Team: ${config.teamId}
# Generated: ${timestamp}

${config.domain} {
  reverse_proxy localhost:${config.activePort} localhost:${config.standbyPort} {
    lb_policy first
    fail_duration 10s
  }
  encode gzip
  header {
    X-CodeB-Project ${config.projectName}
    X-CodeB-Version ${config.version}
    X-CodeB-Slot ${config.activeSlot}
    -Server
  }
  log {
    output file /var/log/caddy/${config.projectName}.log
  }
}
`;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const promoteTool = {
  name: 'promote',
  description: 'Switch production traffic to deployed slot. Zero-downtime traffic switch via Caddy.',
  inputSchema: promoteInputSchema,

  async execute(params: PromoteInput, auth: AuthContext): Promise<PromoteResult> {
    return executePromote(params, auth);
  },
};
