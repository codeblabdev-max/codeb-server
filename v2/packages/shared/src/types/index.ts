/**
 * @codeb/shared - Type Definitions
 * Re-export all types from domain modules
 */

export type {
  TeamRole,
  Team,
  TeamSettings,
  TeamMember,
  ApiKey,
  ApiKeyCreateInput,
  AuthContext,
  TeamsRegistry,
  ApiKeysRegistry,
} from './auth.js';

export type {
  Environment,
  SlotName,
  SlotState,
  Slot,
  ProjectSlots,
  DeployInput,
  DeployResult,
  DeployStep,
  PromoteInput,
  PromoteResult,
  RollbackInput,
  RollbackResult,
} from './deployment.js';

export type {
  DomainConfig,
  DomainRecord,
} from './domain.js';

export type {
  EnvFile,
  EnvSyncInput,
  EnvScanResult,
} from './env.js';

export type {
  ProjectRegistry,
  EnvironmentRegistry,
  SSOTRegistry,
} from './project.js';

export type {
  ServerConfig,
  SSHConfig,
  SSHResult,
  APIRequest,
  APIResponse,
  AuditLogEntry,
} from './server.js';
