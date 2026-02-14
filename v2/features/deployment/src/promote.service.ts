/**
 * PromoteService - Switch traffic from active slot to deployed slot
 *
 * Zero-downtime traffic switch via Caddy configuration.
 * Refactored from mcp-server/src/tools/promote.ts
 */

import type { SlotRepo } from '@codeb/db';
import type { SSHClientWrapper } from '@codeb/ssh';
import type { SlotName, AuthContext } from '@codeb/shared';

interface LoggerLike {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  log(level: string, message: string, meta?: Record<string, unknown>): void;
}
import type { PromoteInput, PromoteResult, CaddySiteConfig } from './types.js';
import { SlotService } from './slot.service.js';
import { CaddyService } from './caddy.service.js';

const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000;

export class PromoteService {
  private readonly slotService: SlotService;
  private readonly caddyService: CaddyService;

  constructor(
    private readonly slotRepo: typeof SlotRepo,
    private readonly ssh: SSHClientWrapper,
    private readonly logger: LoggerLike,
  ) {
    this.slotService = new SlotService(slotRepo, ssh, logger);
    this.caddyService = new CaddyService(ssh, logger);
  }

  async execute(input: PromoteInput, auth: AuthContext): Promise<PromoteResult> {
    const { projectName, environment } = input;

    // Validate team access
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

    try {
      // Step 1: Get slot status
      const slots = await this.slotService.getRegistry(projectName, environment);

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
      const healthResult = await this.ssh.exec(
        `curl -sf -o /dev/null -w '%{http_code}' http://localhost:${newSlot.port}/ --connect-timeout 5 2>/dev/null || echo "000"`,
      );

      if (
        !healthResult.stdout.trim().startsWith('2') &&
        !healthResult.stdout.trim().startsWith('3')
      ) {
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

      // Step 3: Generate unified Caddy config
      const domain = this.caddyService.getProjectDomain(projectName, environment);
      const customDomains = await this.caddyService.getCustomDomains(projectName, environment);

      const caddyConfig: CaddySiteConfig = {
        projectName,
        environment,
        domain,
        activePort: newSlot.port,
        standbyPort: oldSlot.port,
        activeSlot: newActive,
        version: newSlot.version || 'unknown',
        teamId: auth.teamId,
        customDomains,
      };

      // Step 4: Write Caddy config and reload
      await this.caddyService.writeCaddyConfig(caddyConfig);

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

      await this.slotService.updateRegistry(projectName, environment, slots);

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
  }
}
