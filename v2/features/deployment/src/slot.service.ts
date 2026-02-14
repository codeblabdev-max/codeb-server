/**
 * SlotService - Blue-Green slot registry management
 *
 * DB-Primary, File-Secondary strategy.
 * Refactored from mcp-server/src/tools/slot.ts
 */

import type { SlotRepo } from '@codeb/db';
import type { SSHClientWrapper } from '@codeb/ssh';
import type {
  ProjectSlots,
  SlotName,
  SlotState,
  Environment,
  AuthContext,
  SlotStatusResult,
  SlotCleanupResult,
  SlotListResult,
} from './types.js';

interface LoggerLike {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  log(level: string, message: string, meta?: Record<string, unknown>): void;
}

const REGISTRY_BASE = '/opt/codeb/registry/slots';
const GRACE_PERIOD_HOURS = 48;

export class SlotService {
  constructor(
    private readonly slotRepo: typeof SlotRepo,
    private readonly ssh: SSHClientWrapper,
    private readonly logger: LoggerLike,
  ) {}

  // ===========================================================================
  // Get Slot Registry (DB-Primary, File-Fallback)
  // ===========================================================================

  async getRegistry(
    projectName: string,
    environment: Environment,
  ): Promise<ProjectSlots> {
    // 1. DB Primary
    try {
      const slots = await this.slotRepo.findByProject(projectName, environment);
      if (slots) {
        this.logger.debug('Slot registry loaded from database', { projectName, environment });
        return slots;
      }
    } catch (error) {
      this.logger.warn('Failed to load slot registry from database, falling back to file', {
        projectName,
        environment,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 2. File Fallback
    const filePath = `${REGISTRY_BASE}/${projectName}-${environment}.json`;
    const result = await this.ssh.exec(`cat ${filePath} 2>/dev/null || echo ""`);
    const content = result.stdout.trim();

    if (!content) {
      throw new Error(
        `Slot registry not found for ${projectName}/${environment}. Run project init first.`,
      );
    }

    const slots = JSON.parse(content) as ProjectSlots;

    // Sync file to DB
    try {
      await this.slotRepo.upsert(slots);
      this.logger.info('Slot registry synced from file to database', { projectName, environment });
    } catch (syncError) {
      this.logger.warn('Failed to sync slot registry to database', {
        projectName,
        environment,
        error: syncError instanceof Error ? syncError.message : String(syncError),
      });
    }

    return slots;
  }

  // ===========================================================================
  // Update Slot Registry (DB-Primary, File-Secondary)
  // ===========================================================================

  async updateRegistry(
    projectName: string,
    environment: Environment,
    slots: ProjectSlots,
  ): Promise<void> {
    slots.lastUpdated = new Date().toISOString();

    // 1. DB Primary
    try {
      await this.slotRepo.upsert(slots);
      this.logger.debug('Slot registry updated in database', { projectName, environment });
    } catch (error) {
      this.logger.error('Failed to update slot registry in database', {
        projectName,
        environment,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // 2. File backup (Secondary)
    try {
      const filePath = `${REGISTRY_BASE}/${projectName}-${environment}.json`;
      await this.ssh.exec(`mkdir -p ${REGISTRY_BASE}`);
      const base64 = Buffer.from(JSON.stringify(slots, null, 2)).toString('base64');
      await this.ssh.exec(`echo "${base64}" | base64 -d > ${filePath}`);
      this.logger.debug('Slot registry backed up to file', { projectName, environment });
    } catch (error) {
      this.logger.warn('Failed to backup slot registry to file', {
        projectName,
        environment,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ===========================================================================
  // Initialize Slots
  // ===========================================================================

  async initializeSlots(
    projectName: string,
    environment: Environment,
    basePort: number,
    teamId?: string,
  ): Promise<ProjectSlots> {
    const now = new Date().toISOString();

    const slots: ProjectSlots = {
      projectName,
      teamId,
      environment,
      activeSlot: 'blue',
      blue: {
        name: 'blue',
        state: 'empty',
        port: basePort,
      },
      green: {
        name: 'green',
        state: 'empty',
        port: basePort + 1,
      },
      lastUpdated: now,
    };

    await this.updateRegistry(projectName, environment, slots);
    this.logger.info('Initialized slot registry', { projectName, environment, basePort });

    return slots;
  }

  // ===========================================================================
  // Get Available Port
  // ===========================================================================

  async getAvailablePort(environment: Environment): Promise<number> {
    const portRanges: Record<Environment, { min: number; max: number }> = {
      staging: { min: 4500, max: 4999 },
      production: { min: 4100, max: 4499 },
      preview: { min: 5000, max: 5499 },
    };

    const range = portRanges[environment];
    const allSlots = await this.slotRepo.listAll();
    const usedPorts = new Set<number>();

    for (const slots of allSlots) {
      if (slots.environment === environment) {
        usedPorts.add(slots.blue.port);
        usedPorts.add(slots.green.port);
      }
    }

    for (let port = range.min; port <= range.max; port += 2) {
      if (!usedPorts.has(port) && !usedPorts.has(port + 1)) {
        this.logger.debug('Available port found', { environment, port });
        return port;
      }
    }

    throw new Error(`No available ports in ${environment} range (${range.min}-${range.max})`);
  }

  // ===========================================================================
  // Slot Status
  // ===========================================================================

  async getStatus(
    input: { projectName: string; environment: Environment },
    auth: AuthContext,
  ): Promise<SlotStatusResult> {
    if (!auth.projects.includes(input.projectName) && auth.role !== 'owner') {
      return {
        success: false,
        error: `Access denied: project ${input.projectName} not in team scope`,
      };
    }

    try {
      const slots = await this.getRegistry(input.projectName, input.environment);

      return {
        success: true,
        data: {
          projectName: slots.projectName,
          teamId: slots.teamId,
          environment: slots.environment,
          activeSlot: slots.activeSlot,
          blue: {
            state: slots.blue.state,
            port: slots.blue.port,
            version: slots.blue.version,
            image: slots.blue.image,
            deployedAt: slots.blue.deployedAt,
            deployedBy: slots.blue.deployedBy,
            healthStatus: slots.blue.healthStatus,
            graceExpiresAt: slots.blue.graceExpiresAt,
          },
          green: {
            state: slots.green.state,
            port: slots.green.port,
            version: slots.green.version,
            image: slots.green.image,
            deployedAt: slots.green.deployedAt,
            deployedBy: slots.green.deployedBy,
            healthStatus: slots.green.healthStatus,
            graceExpiresAt: slots.green.graceExpiresAt,
          },
          lastUpdated: slots.lastUpdated,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ===========================================================================
  // Slot Cleanup
  // ===========================================================================

  async cleanup(
    input: { projectName: string; environment: Environment; force?: boolean },
    auth: AuthContext,
  ): Promise<SlotCleanupResult> {
    const { projectName, environment, force = false } = input;

    if (!auth.projects.includes(projectName) && auth.role !== 'owner') {
      return {
        success: false,
        error: `Access denied: project ${projectName} not in team scope`,
      };
    }

    try {
      const slots = await this.getRegistry(projectName, environment);

      let graceSlot: SlotName | null = null;
      if (slots.blue.state === 'grace') graceSlot = 'blue';
      else if (slots.green.state === 'grace') graceSlot = 'green';

      if (!graceSlot) {
        return { success: true, message: 'No slots in grace state to clean up' };
      }

      const slot = slots[graceSlot];

      if (!force && slot.graceExpiresAt) {
        const expiresAt = new Date(slot.graceExpiresAt);
        if (expiresAt > new Date()) {
          const remaining = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60));
          return {
            success: false,
            error: `Grace period not expired. ${remaining} hours remaining. Use force=true to override.`,
          };
        }
      }

      // Stop and remove container
      const containerName = `${projectName}-${environment}-${graceSlot}`;
      await this.ssh.exec(`docker stop ${containerName} 2>/dev/null || true`);
      await this.ssh.exec(`docker rm ${containerName} 2>/dev/null || true`);

      // Update slot state
      slots[graceSlot] = {
        ...slot,
        state: 'empty',
        version: undefined,
        image: undefined,
        deployedAt: undefined,
        deployedBy: undefined,
        healthStatus: undefined,
        graceExpiresAt: undefined,
      };

      await this.updateRegistry(projectName, environment, slots);
      this.logger.info('Slot cleaned up', { projectName, environment, slot: graceSlot });

      return {
        success: true,
        cleanedSlot: graceSlot,
        message: `Cleaned up ${graceSlot} slot for ${projectName}/${environment}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ===========================================================================
  // List All Slots
  // ===========================================================================

  async list(auth: AuthContext): Promise<SlotListResult> {
    try {
      const allSlots = await this.slotRepo.listAll();

      const filteredSlots = allSlots.filter((slots) => {
        if (auth.role === 'owner') return true;
        return auth.projects.includes(slots.projectName);
      });

      const data = filteredSlots.map((slots) => ({
        projectName: slots.projectName,
        teamId: slots.teamId,
        environment: slots.environment,
        activeSlot: slots.activeSlot,
        blueState: slots.blue.state,
        bluePort: slots.blue.port,
        blueVersion: slots.blue.version,
        greenState: slots.green.state,
        greenPort: slots.green.port,
        greenVersion: slots.green.version,
        lastUpdated: slots.lastUpdated,
      }));

      this.logger.debug('Slot list retrieved from database', { total: data.length });

      return { success: true, data, total: data.length };
    } catch (error) {
      this.logger.error('Failed to list slots', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ===========================================================================
  // Update Slot State Helper
  // ===========================================================================

  async updateSlotState(
    projectName: string,
    environment: Environment,
    slotName: SlotName,
    updates: Partial<{
      state: SlotState;
      version: string;
      image: string;
      deployedAt: string;
      deployedBy: string;
      promotedAt: string;
      promotedBy: string;
      rolledBackAt: string;
      rolledBackBy: string;
      healthStatus: 'healthy' | 'unhealthy' | 'unknown';
      graceExpiresAt: string;
    }>,
  ): Promise<ProjectSlots> {
    const slots = await this.getRegistry(projectName, environment);

    slots[slotName] = { ...slots[slotName], ...updates };

    if (updates.state === 'grace' && !updates.graceExpiresAt) {
      const graceExpires = new Date();
      graceExpires.setHours(graceExpires.getHours() + GRACE_PERIOD_HOURS);
      slots[slotName].graceExpiresAt = graceExpires.toISOString();
    }

    await this.updateRegistry(projectName, environment, slots);
    return slots;
  }
}
