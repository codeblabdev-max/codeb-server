/**
 * Workflow Module - Template Generators & Utilities
 *
 * Re-exports all modular components for use in main workflow.js
 * This module structure allows for easier maintenance and testing
 *
 * Structure:
 * - scan.js: Project scanning and analysis
 * - migrate.js: Project migration to new CLI structure
 * - init.js: Project initialization workflow
 * - templates.js: Project configuration templates (CLAUDE.md, DEPLOYMENT_RULES.md)
 * - github-actions.js: GitHub Actions CI/CD workflow generator
 * - dockerfile.js: Dockerfile generator for various project types
 * - quadlet.js: Podman Quadlet configuration generators
 * - registry.js: Project registry management
 * - port-utils.js: Port scanning, validation, and allocation
 * - provisioning.js: Server infrastructure provisioning
 * - env-generator.js: Environment file generators
 */

// Scan module - Project scanning and analysis
export {
  scanBlueGreen,
  scanLegacy,
  scanInternal,
  analyzeGitHubActions,
  checkClaudeMdVersion,
  updateClaudeMd,
  checkDeployYmlMcpApi,
  generateMcpApiDeployYml,
  checkMcpConnection,
  promptForApiKey,
  compareVersions,
  checkSsotSync,
  getSsotStatus,
  DEPLOY_METHODS
} from './scan.js';

// Pre-deploy scan module
export { fullPreDeployScan } from './pre-deploy-scan.js';

// Migrate module - Project migration
export { migrate } from './migrate.js';

// Init module - Project initialization
export { initWorkflow } from './init.js';

// Resource scanner module
export { scanProjectResources } from './resource-scanner.js';

// Templates module - Project configuration templates
export {
  generateProjectClaudeMd,
  generateDeploymentRules
} from './templates.js';

// Services module - Service management workflows
export {
  addResourceWorkflow,
  addServiceWorkflow,
  fixNetworkWorkflow
} from './services.js';

// Sync module - Push workflow changes to server
export { syncWorkflow } from './sync.js';

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
  generateLocalEnvContent,
  generateEnvTemplate,
  generateLocalEnvForDev,
  createServerEnvFiles,
  mergeEnvFiles
} from './env-generator.js';
