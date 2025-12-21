/**
 * Workflow Module - Template Generators & Utilities
 *
 * Re-exports all modular components for use in main workflow.js
 * This module structure allows for easier maintenance and testing
 *
 * Structure:
 * - github-actions.js: GitHub Actions CI/CD workflow generator
 * - dockerfile.js: Dockerfile generator for various project types
 * - quadlet.js: Podman Quadlet configuration generators
 * - registry.js: Project registry management
 * - port-utils.js: Port scanning, validation, and allocation
 * - provisioning.js: Server infrastructure provisioning
 * - env-generator.js: Environment file generators
 */

// GitHub Actions CI/CD workflow generator
export { generateGitHubActionsWorkflow } from './github-actions.js';

// Dockerfile generator for various project types
export { generateDockerfile } from './dockerfile.js';

// Quadlet (Podman systemd) configuration generators
export { generateQuadletTemplate, generateProjectSet } from './quadlet.js';

// Project registry management
export {
  readProjectRegistry,
  writeProjectRegistry,
  convertSSOTToLegacyRegistry,
  getDefaultRegistryStructure
} from './registry.js';

// Port utilities
export {
  PORT_RANGES,
  findNextRedisDbIndex,
  findNextAvailablePort,
  getProjectNetworkName,
  ensureNetworkExists,
  scanServerPorts,
  validatePort,
  findSafePort,
  autoScanAndValidatePorts
} from './port-utils.js';

// Server infrastructure provisioning
export {
  generateSecurePassword,
  provisionPostgresDatabase,
  provisionRedis,
  provisionStorage,
  backupEnvToServer,
  restoreEnvFromBackup,
  listEnvBackups,
  provisionServerInfrastructure
} from './provisioning.js';

// Environment file generators
export {
  generateServerEnvContent,
  generateLocalEnvContent
} from './env-generator.js';
