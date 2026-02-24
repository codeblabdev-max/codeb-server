/**
 * CodeB v7.0.58 - Slot Registry Management (DB-Primary)
 * Blue-Green slot state management with Team-based access
 *
 * v7.0.58 Changes:
 * - DB-Primary: PostgreSQL이 주 데이터 소스
 * - File-Secondary: 서버 파일은 백업/캐시 용도
 * - 전체 슬롯 목록을 DB에서 효율적으로 조회
 *
 * Features:
 * - PostgreSQL DB 기반 slot registry (primary)
 * - 파일 기반 백업 (secondary)
 * - Docker 기반 배포 (v7.0.30+)
 */

import { z } from 'zod';
import type {
  ProjectSlots,
  SlotName,
  SlotState,
  Environment,
  AuthContext,
} from '../lib/types.js';
import { withLocal } from '../lib/local-exec.js';
import { SlotRepo } from '../lib/database.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// Constants
// ============================================================================

const REGISTRY_BASE = '/opt/codeb/registry/slots';
const GRACE_PERIOD_HOURS = 48;

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
// Get Slot Registry (DB-Primary)
// ============================================================================

export async function getSlotRegistry(
  projectName: string,
  environment: Environment
): Promise<ProjectSlots> {
  // 1. DB에서 먼저 조회 (Primary)
  try {
    const slots = await SlotRepo.findByProject(projectName, environment);
    if (slots) {
      logger.debug('Slot registry loaded from database', { projectName, environment });
      return slots;
    }
  } catch (error) {
    logger.warn('Failed to load slot registry from database, falling back to file', {
      projectName,
      environment,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // 2. DB에 없으면 파일에서 조회 (Fallback)
  return withLocal(async (local) => {
    const filePath = getSlotFilePath(projectName, environment);
    const content = await local.readFile(filePath);

    if (!content.trim()) {
      throw new Error(`Slot registry not found for ${projectName}/${environment}. Run /we:quick or /we:deploy first.`);
    }

    const slots = JSON.parse(content) as ProjectSlots;

    // 파일에서 로드했으면 DB에 동기화
    try {
      await SlotRepo.upsert(slots);
      logger.info('Slot registry synced from file to database', { projectName, environment });
    } catch (syncError) {
      logger.warn('Failed to sync slot registry to database', {
        projectName,
        environment,
        error: syncError instanceof Error ? syncError.message : String(syncError),
      });
    }

    return slots;
  });
}

// ============================================================================
// Update Slot Registry (DB-Primary, File-Secondary)
// ============================================================================

export async function updateSlotRegistry(
  projectName: string,
  environment: Environment,
  slots: ProjectSlots
): Promise<void> {
  // 업데이트 시간 갱신
  slots.lastUpdated = new Date().toISOString();

  // 1. DB 업데이트 (Primary)
  try {
    await SlotRepo.upsert(slots);
    logger.debug('Slot registry updated in database', { projectName, environment });
  } catch (error) {
    logger.error('Failed to update slot registry in database', {
      projectName,
      environment,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error; // DB 실패 시 전체 실패
  }

  // 2. 파일 백업 (Secondary)
  try {
    await withLocal(async (local) => {
      const filePath = getSlotFilePath(projectName, environment);

      // Ensure directory exists
      await local.mkdir(REGISTRY_BASE);

      // Write slot registry with proper formatting
      await local.writeFile(filePath, JSON.stringify(slots, null, 2));
    });
    logger.debug('Slot registry backed up to file', { projectName, environment });
  } catch (error) {
    // 파일 백업 실패는 경고만 (DB가 primary이므로)
    logger.warn('Failed to backup slot registry to file', {
      projectName,
      environment,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// Initialize Slots (새 프로젝트용)
// ============================================================================

export async function initializeSlots(
  projectName: string,
  environment: Environment,
  basePort: number,
  teamId?: string
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
      port: basePort,     // Blue = even port
    },
    green: {
      name: 'green',
      state: 'empty',
      port: basePort + 1, // Green = odd port
    },
    lastUpdated: now,
  };

  await updateSlotRegistry(projectName, environment, slots);
  logger.info('Initialized slot registry', { projectName, environment, basePort });

  return slots;
}

// ============================================================================
// Slot Status
// ============================================================================

export interface SlotStatusResult {
  success: boolean;
  data?: {
    projectName: string;
    teamId?: string;
    environment: string;
    activeSlot: SlotName;
    blue: {
      state: SlotState;
      port: number;
      version?: string;
      image?: string;
      deployedAt?: string;
      deployedBy?: string;
      healthStatus?: string;
      graceExpiresAt?: string;
    };
    green: {
      state: SlotState;
      port: number;
      version?: string;
      image?: string;
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

    // Stop and remove container via Docker
    await withLocal(async (local) => {
      const containerName = `${projectName}-${environment}-${graceSlot}`;
      await local.exec(`docker stop ${containerName} 2>/dev/null || true`);
      await local.exec(`docker rm ${containerName} 2>/dev/null || true`);
    });

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

    await updateSlotRegistry(projectName, environment, slots);

    logger.info('Slot cleaned up', { projectName, environment, slot: graceSlot });

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

// ============================================================================
// List All Slots (DB-Based)
// ============================================================================

export interface SlotListResult {
  success: boolean;
  data?: Array<{
    projectName: string;
    teamId?: string;
    environment: string;
    activeSlot: SlotName;
    blueState: SlotState;
    bluePort: number;
    blueVersion?: string;
    greenState: SlotState;
    greenPort: number;
    greenVersion?: string;
    lastUpdated: string;
  }>;
  total?: number;
  error?: string;
}

export async function executeSlotList(
  auth: AuthContext
): Promise<SlotListResult> {
  try {
    // DB에서 모든 슬롯 조회
    const allSlots = await SlotRepo.listAll();

    // Filter by team access
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

    logger.debug('Slot list retrieved from database', { total: data.length });

    return {
      success: true,
      data,
      total: data.length,
    };
  } catch (error) {
    logger.error('Failed to list slots from database', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Fallback to file-based listing
    return executeSlotListFromFiles(auth);
  }
}

// Fallback: 파일 기반 슬롯 목록 조회
async function executeSlotListFromFiles(
  auth: AuthContext
): Promise<SlotListResult> {
  return withLocal(async (local) => {
    try {
      // List all slot registry files
      const result = await local.exec(`ls ${REGISTRY_BASE}/*.json 2>/dev/null || echo ""`);

      if (!result.stdout.trim()) {
        return {
          success: true,
          data: [],
          total: 0,
        };
      }

      const files = result.stdout.trim().split('\n');
      const slots: SlotListResult['data'] = [];

      for (const file of files) {
        const content = await local.exec(`cat ${file}`);
        const data = JSON.parse(content.stdout) as ProjectSlots;

        // Filter by team access
        if (auth.role !== 'owner' && !auth.projects.includes(data.projectName)) {
          continue;
        }

        slots.push({
          projectName: data.projectName,
          teamId: data.teamId,
          environment: data.environment,
          activeSlot: data.activeSlot,
          blueState: data.blue.state,
          bluePort: data.blue.port,
          blueVersion: data.blue.version,
          greenState: data.green.state,
          greenPort: data.green.port,
          greenVersion: data.green.version,
          lastUpdated: data.lastUpdated,
        });
      }

      return {
        success: true,
        data: slots,
        total: slots.length,
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
// Get Available Port (DB-Based)
// ============================================================================

export async function getAvailablePort(environment: Environment): Promise<number> {
  // Port ranges by environment
  const portRanges: Record<Environment, { min: number; max: number }> = {
    staging: { min: 4500, max: 4999 },
    production: { min: 4100, max: 4499 },
    preview: { min: 5000, max: 5499 },
  };

  const range = portRanges[environment];

  // DB에서 사용 중인 포트 조회
  const allSlots = await SlotRepo.listAll();
  const usedPorts = new Set<number>();

  for (const slots of allSlots) {
    if (slots.environment === environment) {
      usedPorts.add(slots.blue.port);
      usedPorts.add(slots.green.port);
    }
  }

  // Find available even port (blue) in range
  for (let port = range.min; port <= range.max; port += 2) {
    if (!usedPorts.has(port) && !usedPorts.has(port + 1)) {
      logger.debug('Available port found', { environment, port });
      return port;
    }
  }

  throw new Error(`No available ports in ${environment} range (${range.min}-${range.max})`);
}

// ============================================================================
// Update Slot State Helper
// ============================================================================

export async function updateSlotState(
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
  }>
): Promise<ProjectSlots> {
  const slots = await getSlotRegistry(projectName, environment);

  // Update specific slot
  slots[slotName] = {
    ...slots[slotName],
    ...updates,
  };

  // 만약 grace 상태로 변경되면 graceExpiresAt 설정
  if (updates.state === 'grace' && !updates.graceExpiresAt) {
    const graceExpires = new Date();
    graceExpires.setHours(graceExpires.getHours() + GRACE_PERIOD_HOURS);
    slots[slotName].graceExpiresAt = graceExpires.toISOString();
  }

  await updateSlotRegistry(projectName, environment, slots);

  return slots;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const slotStatusTool = {
  name: 'slot_status',
  description: 'Get Blue-Green slot status for a project (DB-based)',
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
  description: 'List all slot registries from database (filtered by team access)',
  inputSchema: z.object({}),

  async execute(_params: unknown, auth: AuthContext) {
    return executeSlotList(auth);
  },
};
