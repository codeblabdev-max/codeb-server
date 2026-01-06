/**
 * CodeB v5.0 - Slot Registry Management
 * Blue-Green slot state management
 */

import { z } from 'zod';
import type {
  ProjectSlots,
  SlotName,
  Environment,
} from '../lib/types.js';
import { getSSHClient } from '../lib/ssh.js';

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
  const ssh = getSSHClient();

  try {
    await ssh.connect();

    const filePath = getSlotFilePath(projectName, environment);
    const result = await ssh.exec(`cat ${filePath} 2>/dev/null || echo ""`);

    if (!result.stdout.trim()) {
      throw new Error(`Slot registry not found for ${projectName}/${environment}`);
    }

    return JSON.parse(result.stdout) as ProjectSlots;
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// Update Slot Registry
// ============================================================================

export async function updateSlotRegistry(
  projectName: string,
  environment: Environment,
  slots: ProjectSlots
): Promise<void> {
  const ssh = getSSHClient();

  try {
    await ssh.connect();

    const filePath = getSlotFilePath(projectName, environment);

    // Ensure directory exists
    await ssh.exec(`mkdir -p ${REGISTRY_BASE}`);

    // Write slot registry
    await ssh.writeFile(filePath, JSON.stringify(slots, null, 2));
  } finally {
    ssh.disconnect();
  }
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
      healthStatus?: string;
      graceExpiresAt?: string;
    };
    green: {
      state: string;
      port: number;
      version?: string;
      deployedAt?: string;
      healthStatus?: string;
      graceExpiresAt?: string;
    };
    lastUpdated: string;
  };
  error?: string;
}

export async function executeSlotStatus(input: {
  projectName: string;
  environment: Environment;
}): Promise<SlotStatusResult> {
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
          healthStatus: slots.blue.healthStatus,
          graceExpiresAt: slots.blue.graceExpiresAt,
        },
        green: {
          state: slots.green.state,
          port: slots.green.port,
          version: slots.green.version,
          deployedAt: slots.green.deployedAt,
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

export async function executeSlotCleanup(input: {
  projectName: string;
  environment: Environment;
  force?: boolean;
}): Promise<SlotCleanupResult> {
  const { projectName, environment, force = false } = input;
  const ssh = getSSHClient();

  try {
    await ssh.connect();

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
          error: `Grace period not expired. ${remaining} hours remaining. Use --force to override.`,
        };
      }
    }

    // Stop and remove container
    const containerName = `${projectName}-${environment}-${graceSlot}`;
    await ssh.exec(`podman stop ${containerName} --time 10 2>/dev/null || true`);
    await ssh.exec(`podman rm ${containerName} 2>/dev/null || true`);

    // Update slot state
    slots[graceSlot] = {
      ...slot,
      state: 'empty',
      version: undefined,
      image: undefined,
      deployedAt: undefined,
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
  } finally {
    ssh.disconnect();
  }
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
  }>;
  error?: string;
}

export async function executeSlotList(): Promise<SlotListResult> {
  const ssh = getSSHClient();

  try {
    await ssh.connect();

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

      slots.push({
        projectName: data.projectName,
        environment: data.environment,
        activeSlot: data.activeSlot,
        blueState: data.blue.state,
        greenState: data.green.state,
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
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const slotStatusTool = {
  name: 'slot_status',
  description: 'Get Blue-Green slot status for a project',
  inputSchema: slotStatusInputSchema,
  execute: executeSlotStatus,
};

export const slotCleanupTool = {
  name: 'slot_cleanup',
  description: 'Clean up expired grace slots',
  inputSchema: slotCleanupInputSchema,
  execute: executeSlotCleanup,
};

export const slotListTool = {
  name: 'slot_list',
  description: 'List all slot registries',
  inputSchema: z.object({}),
  execute: executeSlotList,
};
