/**
 * @codeb/shared - Deployment & Slot Types
 * Based on mcp-server/src/lib/types.ts
 */

// ============================================================================
// Environment & Slot Types
// ============================================================================

export type Environment = 'staging' | 'production' | 'preview';
export type SlotName = 'blue' | 'green';
export type SlotState = 'empty' | 'deployed' | 'active' | 'grace';

export interface Slot {
  name: SlotName;
  state: SlotState;
  port: number;
  version?: string;
  image?: string;
  deployedAt?: string;
  deployedBy?: string;
  promotedAt?: string;
  promotedBy?: string;
  rolledBackAt?: string;
  rolledBackBy?: string;
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
  graceExpiresAt?: string;
}

export interface ProjectSlots {
  projectName: string;
  teamId?: string;
  environment: Environment;
  activeSlot: SlotName;
  blue: Slot;
  green: Slot;
  lastUpdated: string;
}

// ============================================================================
// Deploy Types
// ============================================================================

export interface DeployInput {
  projectName: string;
  environment: Environment;
  version?: string;
  image?: string;
  useGhcr?: boolean;
  skipHealthcheck?: boolean;
  skipValidation?: boolean;
}

export interface DeployResult {
  success: boolean;
  slot: SlotName;
  port: number;
  previewUrl: string;
  steps: DeployStep[];
  duration: number;
  error?: string;
}

export interface DeployStep {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  duration?: number;
  output?: string;
  error?: string;
}

// ============================================================================
// Promote Types
// ============================================================================

export interface PromoteInput {
  projectName: string;
  environment: Environment;
}

export interface PromoteResult {
  success: boolean;
  fromSlot: SlotName;
  toSlot: SlotName;
  productionUrl: string;
  previousVersion?: string;
  newVersion: string;
  duration: number;
  error?: string;
}

// ============================================================================
// Rollback Types
// ============================================================================

export interface RollbackInput {
  projectName: string;
  environment: Environment;
  reason?: string;
}

export interface RollbackResult {
  success: boolean;
  fromSlot: SlotName;
  toSlot: SlotName;
  restoredVersion: string;
  duration: number;
  error?: string;
}
