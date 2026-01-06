/**
 * CodeB v6.0 - Type Definitions
 * Unified Blue-Green Deployment System with Team Management
 */

// ============================================================================
// Team & Auth Types
// ============================================================================

export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Team {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  owner: string;
  plan: 'free' | 'pro' | 'enterprise';
  projects: string[];
  settings: TeamSettings;
}

export interface TeamSettings {
  defaultEnvironment: Environment;
  autoPromote: boolean;
  gracePeriodHours: number;
  allowedDomains?: string[];
  notificationWebhook?: string;
}

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: TeamRole;
  joinedAt: string;
  invitedBy: string;
  lastActiveAt?: string;
}

export interface ApiKey {
  id: string;
  key: string; // hashed, never stored plain
  name: string;
  teamId: string;
  role: TeamRole;
  createdAt: string;
  createdBy: string;
  lastUsed?: string;
  expiresAt?: string;
  scopes: string[];
  rateLimit?: {
    requests: number;
    window: number; // seconds
  };
}

export interface ApiKeyCreateInput {
  name: string;
  teamId: string;
  role: TeamRole;
  expiresAt?: string;
  scopes?: string[];
}

export interface AuthContext {
  apiKey: string;
  keyId: string;
  teamId: string;
  role: TeamRole;
  scopes: string[];
  projects: string[];
}

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
  version: 'master' | 'current' | string;
  variables: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Registry Types (SSOT)
// ============================================================================

export interface TeamsRegistry {
  version: '6.0';
  updatedAt: string;
  teams: Record<string, Team>;
}

export interface ApiKeysRegistry {
  version: '6.0';
  updatedAt: string;
  keys: Record<string, Omit<ApiKey, 'key'> & { keyHash: string }>;
}

export interface ProjectRegistry {
  projectName: string;
  teamId: string;
  type: 'nextjs' | 'remix' | 'nodejs' | 'python' | 'go';
  createdAt: string;
  environments: {
    staging?: EnvironmentRegistry;
    production?: EnvironmentRegistry;
    preview?: EnvironmentRegistry;
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
  version: '6.0';
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

// ============================================================================
// Audit Log Types
// ============================================================================

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  teamId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ip: string;
  userAgent: string;
  duration: number;
  success: boolean;
  error?: string;
}
