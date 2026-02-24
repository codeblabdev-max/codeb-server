/**
 * RollbackService - Instant rollback to previous version
 *
 * Switches traffic back to grace slot.
 * Refactored from mcp-server/src/tools/rollback.ts
 */

import type { SlotRepo } from '@codeb/db';
import type { SSHClientWrapper } from '@codeb/ssh';
import type { SlotName, Environment, AuthContext } from '@codeb/shared';

interface LoggerLike {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  log(level: string, message: string, meta?: Record<string, unknown>): void;
}
import type { RollbackInput, RollbackResult, CaddySiteConfig } from './types.js';
import { SlotService } from './slot.service.js';
import { CaddyService } from './caddy.service.js';

export class RollbackService {
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

  async execute(input: RollbackInput, auth: AuthContext): Promise<RollbackResult> {
    const { projectName, environment, reason } = input;

    // Validate team access
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

    try {
      // Step 1: Get slot status
      const slots = await this.slotService.getRegistry(projectName, environment);

      const currentActive = slots.activeSlot;
      const targetSlot: SlotName = currentActive === 'blue' ? 'green' : 'blue';
      const graceSlot = slots[targetSlot];
      const activeSlot = slots[currentActive];

      // Verify target slot is in grace state
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
      const healthResult = await this.ssh.exec(
        `curl -sf -o /dev/null -w '%{http_code}' http://localhost:${graceSlot.port}/health 2>/dev/null || echo "000"`,
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

      // Step 3: Update Caddy config with rollback marker
      const domain = this.caddyService.getProjectDomain(projectName, environment);
      const caddyConfig: CaddySiteConfig = {
        projectName,
        environment,
        domain,
        activePort: graceSlot.port,
        activeSlot: targetSlot,
        version: graceSlot.version || 'unknown',
        teamId: auth.teamId,
      };

      await this.caddyService.writeCaddyConfig(caddyConfig);

      // Step 4: Update slot states
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

      await this.slotService.updateRegistry(projectName, environment, slots);

      // Step 5: Log rollback event
      await this.logRollbackEvent(projectName, environment, {
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
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async logRollbackEvent(
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
    },
  ): Promise<void> {
    const logDir = '/opt/codeb/logs/rollbacks';
    const logFile = `${logDir}/${projectName}-${environment}.jsonl`;

    await this.ssh.exec(`mkdir -p ${logDir}`);

    const logEntry = JSON.stringify(event);
    const base64Entry = Buffer.from(logEntry).toString('base64');
    await this.ssh.exec(`echo '${base64Entry}' | base64 -d >> ${logFile}`);
  }
}
