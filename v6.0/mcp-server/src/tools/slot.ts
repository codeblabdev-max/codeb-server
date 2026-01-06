/**
 * CodeB v6.0 - Slot Registry Management
 * Blue-Green slot state management with Team-based access
 */

import { z } from 'zod';
import type {
  ProjectSlots,
  SlotName,
  Environment,
  AuthContext,
} from '../lib/types.js';
import { withSSH } from '../lib/ssh.js';
import { SERVERS } from '../lib/servers.js';

// ============================================================================
// Constants
// ============================================================================

const REGISTRY_BASE = '/opt/codeb/registry/slots';

function getSlotFilePath(projectName: string, environment: string): string {
  return `${REGISTRY_BASE}/${projectName}-${environment}.json`;
}

// ============================================================================
// Input Schemas
// ============================================================================

export const slotStatusInputSchema = z.object({
  projectName: z.string().describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).describe('Environment'),
});

export const slotCleanupInputSchema = z.object({
  projectName: z.string().describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).describe('Environment'),
  force: z.boolean().optional().describe('Force cleanup even if grace period not expired'),
});

// ============================================================================
// Get Slot Registry
// ============================================================================

export async function getSlotRegistry(
  projectName: string,
  environment: Environment
): Promise<ProjectSlots> {
  return withSSH(SERVERS.app.ip, async (ssh) => {
    const filePath = getSlotFilePath(projectName, environment);
    const content = await ssh.readFile(filePath);

    if (!content.trim()) {
      throw new Error(`Slot registry not found for ${projectName}/${environment}`);
    }

    return JSON.parse(content) as ProjectSlots;
  });
}

// ============================================================================
// Update Slot Registry
// ============================================================================

export async function updateSlotRegistry(
  projectName: string,
  environment: Environment,
  slots: ProjectSlots
): Promise<void> {
  return withSSH(SERVERS.app.ip, async (ssh) => {
    const filePath = getSlotFilePath(projectName, environment);

    // Ensure directory exists
    await ssh.mkdir(REGISTRY_BASE);

    // Write slot registry with proper formatting
    await ssh.writeFile(filePath, JSON.stringify(slots, null, 2));
  });
}

// ============================================================================
// Slot Status
// ============================================================================

export interface SlotStatusResult {
  success: boolean;
  data?: {
    projectName: string;
    environment: string;
    activeSlot: SlotName;
    blue: {
      state: string;
      port: number;
      version?: string;
      deployedAt?: string;
      deployedBy?: string;
      healthStatus?: string;
      graceExpiresAt?: string;
    };
    green: {
      state: string;
      port: number;
      version?: string;
      deployedAt?: string;
      deployedBy?: string;
      healthStatus?: string;
      graceExpiresAt?: string;
    };
    lastUpdated: string;
  };
  error?: string;
}

export async function executeSlotStatus(
  input: { projectName: string; environment: Environment },
  auth: AuthContext
): Promise<SlotStatusResult> {
  // Check project access
  if (!auth.projects.includes(input.projectName) && auth.role !== 'owner') {
    return {
      success: false,
      error: `Access denied: project ${input.projectName} not in team scope`,
    };
  }

  try {
    const slots = await getSlotRegistry(input.projectName, input.environment);

    return {
      success: true,
      data: {
        projectName: slots.projectName,
        environment: slots.environment,
        activeSlot: slots.activeSlot,
        blue: {
          state: slots.blue.state,
          port: slots.blue.port,
          version: slots.blue.version,
          deployedAt: slots.blue.deployedAt,
          deployedBy: slots.blue.deployedBy,
          healthStatus: slots.blue.healthStatus,
          graceExpiresAt: slots.blue.graceExpiresAt,
        },
        green: {
          state: slots.green.state,
          port: slots.green.port,
          version: slots.green.version,
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

// ============================================================================
// Slot Cleanup
// ============================================================================

export interface SlotCleanupResult {
  success: boolean;
  cleanedSlot?: SlotName;
  message?: string;
  error?: string;
}

export async function executeSlotCleanup(
  input: { projectName: string; environment: Environment; force?: boolean },
  auth: AuthContext
): Promise<SlotCleanupResult> {
  const { projectName, environment, force = false } = input;

  // Check project access
  if (!auth.projects.includes(projectName) && auth.role !== 'owner') {
    return {
      success: false,
      error: `Access denied: project ${projectName} not in team scope`,
    };
  }

  return withSSH(SERVERS.app.ip, async (ssh) => {
    try {
      const slots = await getSlotRegistry(projectName, environment);

      // Find slot in grace state
      let graceSlot: SlotName | null = null;
      if (slots.blue.state === 'grace') {
        graceSlot = 'blue';
      } else if (slots.green.state === 'grace') {
        graceSlot = 'green';
      }

      if (!graceSlot) {
        return {
          success: true,
          message: 'No slots in grace state to clean up',
        };
      }

      const slot = slots[graceSlot];

      // Check grace period
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

      // Stop container via systemd
      const serviceName = `${projectName}-${environment}-${graceSlot}`;
      await ssh.exec(`systemctl --user stop ${serviceName} 2>/dev/null || true`);

      // Remove Quadlet file
      const quadletPath = `/opt/codeb/projects/${projectName}/.config/containers/systemd/${serviceName}.container`;
      await ssh.exec(`rm -f ${quadletPath}`);
      await ssh.exec(`systemctl --user daemon-reload`);

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
      slots.lastUpdated = new Date().toISOString();

      await updateSlotRegistry(projectName, environment, slots);

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
  });
}

// ============================================================================
// List All Slots
// ============================================================================

export interface SlotListResult {
  success: boolean;
  data?: Array<{
    projectName: string;
    environment: string;
    activeSlot: SlotName;
    blueState: string;
    greenState: string;
    lastUpdated: string;
  }>;
  error?: string;
}

export async function executeSlotList(
  auth: AuthContext
): Promise<SlotListResult> {
  return withSSH(SERVERS.app.ip, async (ssh) => {
    try {
      // List all slot registry files
      const result = await ssh.exec(`ls ${REGISTRY_BASE}/*.json 2>/dev/null || echo ""`);

      if (!result.stdout.trim()) {
        return {
          success: true,
          data: [],
        };
      }

      const files = result.stdout.trim().split('\n');
      const slots: SlotListResult['data'] = [];

      for (const file of files) {
        const content = await ssh.exec(`cat ${file}`);
        const data = JSON.parse(content.stdout) as ProjectSlots;

        // Filter by team access
        if (auth.role !== 'owner' && !auth.projects.includes(data.projectName)) {
          continue;
        }

        slots.push({
          projectName: data.projectName,
          environment: data.environment,
          activeSlot: data.activeSlot,
          blueState: data.blue.state,
          greenState: data.green.state,
          lastUpdated: data.lastUpdated,
        });
      }

      return {
        success: true,
        data: slots,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const slotStatusTool = {
  name: 'slot_status',
  description: 'Get Blue-Green slot status for a project',
  inputSchema: slotStatusInputSchema,

  async execute(params: { projectName: string; environment: Environment }, auth: AuthContext) {
    return executeSlotStatus(params, auth);
  },
};

export const slotCleanupTool = {
  name: 'slot_cleanup',
  description: 'Clean up expired grace slots',
  inputSchema: slotCleanupInputSchema,

  async execute(
    params: { projectName: string; environment: Environment; force?: boolean },
    auth: AuthContext
  ) {
    return executeSlotCleanup(params, auth);
  },
};

export const slotListTool = {
  name: 'slot_list',
  description: 'List all slot registries (filtered by team access)',
  inputSchema: z.object({}),

  async execute(_params: unknown, auth: AuthContext) {
    return executeSlotList(auth);
  },
};
