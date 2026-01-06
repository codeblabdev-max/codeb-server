/**
 * CodeB v5.0 - Type Definitions
 * Blue-Green Deployment System
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
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
  graceExpiresAt?: string; // 48h after demotion
}

export interface ProjectSlots {
  projectName: string;
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
  skipHealthcheck?: boolean;
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

// ============================================================================
// ENV Types
// ============================================================================

export interface EnvFile {
  projectName: string;
  environment: Environment;
  version: 'master' | 'current' | string; // timestamp for history
  variables: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface EnvGetInput {
  projectName: string;
  environment: Environment;
  key?: string; // if omitted, get all
}

export interface EnvSetInput {
  projectName: string;
  environment: Environment;
  key: string;
  value: string;
}

export interface EnvRestoreInput {
  projectName: string;
  environment: Environment;
  version: 'master' | string;
}

// ============================================================================
// Health Check Types
// ============================================================================

export interface HealthCheckInput {
  projectName: string;
  environment: Environment;
  slot?: SlotName;
  checks?: ('http' | 'container' | 'database' | 'redis')[];
}

export interface HealthCheckResult {
  healthy: boolean;
  checks: {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    responseTime?: number;
    message?: string;
  }[];
  timestamp: string;
}

// ============================================================================
// Registry Types (SSOT)
// ============================================================================

export interface ProjectRegistry {
  projectName: string;
  type: 'nextjs' | 'remix' | 'nodejs' | 'python' | 'go';
  createdAt: string;
  environments: {
    staging?: EnvironmentRegistry;
    production?: EnvironmentRegistry;
  };
  database?: {
    name: string;
    port: number;
  };
  redis?: {
    db: number;
    port: number;
  };
}

export interface EnvironmentRegistry {
  domain: string;
  basePort: number;
  slots: ProjectSlots;
  lastDeployedAt?: string;
  lastDeployedVersion?: string;
}

export interface SSOTRegistry {
  version: '5.0';
  updatedAt: string;
  projects: Record<string, ProjectRegistry>;
  ports: {
    used: number[];
    reserved: number[];
  };
}

// ============================================================================
// SSH Types
// ============================================================================

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string;
}

export interface SSHResult {
  stdout: string;
  stderr: string;
  code: number;
  duration: number;
}

// ============================================================================
// API Types
// ============================================================================

export interface APIRequest {
  tool: string;
  params: Record<string, unknown>;
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}
