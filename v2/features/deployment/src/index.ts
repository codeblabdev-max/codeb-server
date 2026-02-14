/**
 * @codeb/feature-deployment
 *
 * Blue-Green deployment feature services.
 * Refactored from mcp-server/src/tools/deploy.ts, promote.ts, rollback.ts, slot.ts, caddy.ts
 */

export { DeployService } from './deploy.service.js';
export { PromoteService } from './promote.service.js';
export { RollbackService } from './rollback.service.js';
export { SlotService } from './slot.service.js';
export { CaddyService } from './caddy.service.js';

export type {
  DeployInput,
  DeployResult,
  DeployStep,
  PromoteInput,
  PromoteResult,
  RollbackInput,
  RollbackResult,
  SlotStatusResult,
  SlotCleanupResult,
  SlotListResult,
  CaddySiteConfig,
} from './types.js';
