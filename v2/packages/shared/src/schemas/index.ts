/**
 * @codeb/shared - Zod Schemas
 * Re-export all schemas from domain modules
 */

export {
  deployInputSchema,
  promoteInputSchema,
  rollbackInputSchema,
  type DeployInputSchema,
  type PromoteInputSchema,
  type RollbackInputSchema,
} from './deploy.js';

export {
  domainSetupSchema,
  domainDeleteSchema,
  type DomainSetupSchema,
  type DomainDeleteSchema,
} from './domain.js';

export {
  envSyncSchema,
  envScanSchema,
  envRestoreSchema,
  type EnvSyncSchema,
  type EnvScanSchema,
  type EnvRestoreSchema,
} from './env.js';

export {
  projectInitSchema,
  projectScanSchema,
  workflowGenerateSchema,
  type ProjectInitSchema,
  type ProjectScanSchema,
  type WorkflowGenerateSchema,
} from './project.js';
