/**
 * @codeb/db - PostgreSQL Database Layer
 * Connection pool, repositories, and migrations
 */

// Pool management
export { getPool, closePool, withTransaction } from './pool.js';

// Migrations
export { runMigrations } from './migrations/index.js';

// Repositories
export {
  ProjectRepo,
  SlotRepo,
  DeploymentRepo,
  TeamRepo,
  ProjectEnvRepo,
  DomainRepo,
  AuditLogRepo,
  type ProjectRecord,
  type DeploymentRecord,
  type ProjectEnvRecord,
} from './repos/index.js';
