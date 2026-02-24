/**
 * CodeB v7.0 - Promote Tool (Unified)
 *
 * Switch traffic from active slot to deployed slot
 * Uses unified caddy.ts module for configuration
 */

import { z } from 'zod';
import type {
  PromoteInput,
  PromoteResult,
  SlotName,
  AuthContext,
} from '../lib/types.js';
import { withLocal } from '../lib/local-exec.js';
import { getSlotRegistry, updateSlotRegistry } from './slot.js';
import {
  writeCaddyConfig,
  getProjectDomain,
  getCustomDomains,
  type CaddySiteConfig,
} from '../lib/caddy.js';

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
 * 3. Update Caddy config via caddy.ts module
 * 4. Mark old slot as "grace" (48h cleanup)
 * 5. Mark new slot as "active"
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

  return withLocal(async (local) => {
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

      // Step 2: Final health check on new slot
      const healthResult = await local.exec(
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

      // Step 3: Get custom domains and generate unified Caddy config
      const domain = getProjectDomain(projectName, environment);
      const customDomains = await getCustomDomains(projectName, environment);

      const caddyConfig: CaddySiteConfig = {
        projectName,
        environment,
        domain,
        activePort: newSlot.port,      // 새 활성 슬롯 (먼저)
        standbyPort: oldSlot.port,     // 이전 슬롯 (대기/폴백)
        activeSlot: newActive,
        version: newSlot.version || 'unknown',
        teamId: auth.teamId,
        customDomains,
      };

      // Step 4: Write Caddy config and reload (via unified module)
      await writeCaddyConfig(caddyConfig);

      // Step 5: Update slot states
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
