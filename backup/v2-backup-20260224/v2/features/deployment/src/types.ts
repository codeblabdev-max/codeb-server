/**
 * Deployment feature types
 */

import type {
  SlotName,
  SlotState,
  Environment,
  AuthContext,
  ProjectSlots,
} from '@codeb/shared';

// ============================================================================
// Deploy Types
// ============================================================================

export interface DeployInput {
  projectName: string;
  environment?: Environment;
  version?: string;
  image?: string;
  useGhcr?: boolean;
  skipHealthcheck?: boolean;
  skipValidation?: boolean;
}

export interface DeployStep {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  duration?: number;
  output?: string;
  error?: string;
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

// ============================================================================
// Slot Types
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

export interface SlotCleanupResult {
  success: boolean;
  cleanedSlot?: SlotName;
  message?: string;
  error?: string;
}

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

// ============================================================================
// Caddy Types
// ============================================================================

export interface CaddySiteConfig {
  projectName: string;
  environment: Environment;
  domain: string;
  activePort: number;
  standbyPort?: number;
  activeSlot: SlotName;
  version: string;
  teamId: string;
  customDomains?: string[];
  healthCheckPath?: string;
  enableGzip?: boolean;
  enableLogs?: boolean;
}

export type { SlotName, SlotState, Environment, AuthContext, ProjectSlots };
