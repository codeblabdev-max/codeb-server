/**
 * Workflow Scan Module
 *
 * Scans project deployment status and detects issues
 * - Blue-Green Slot API scan (primary)
 * - Legacy SSH-based scan (fallback)
 * - Resource scanning (DB, Redis, Storage)
 *
 * @module workflow/scan
 * @version 3.0.0 (Refactored - split into scan-api.js + scan-legacy.js)
 */

// ============================================================================
// Re-export from split modules
// ============================================================================

// scan-api.js: MCP API 기반 스캔
export {
  checkMcpConnection,
  promptForApiKey,
  compareVersions,
  checkSsotSync,
  getSsotStatus,
  scanBlueGreen,
} from './scan-api.js';

// scan-legacy.js: SSH 기반 레거시 스캔 및 유틸리티
export {
  checkClaudeMdVersion,
  updateClaudeMd,
  checkDeployYmlMcpApi,
  generateMcpApiDeployYml,
  analyzeGitHubActions,
  scanLegacy,
  scanInternal,
  DEPLOY_METHODS,
} from './scan-legacy.js';

// ============================================================================
// Default Export (backward compatibility)
// ============================================================================

import {
  checkMcpConnection,
  promptForApiKey,
  compareVersions,
  checkSsotSync,
  getSsotStatus,
  scanBlueGreen as scanBlueGreenApi,
} from './scan-api.js';

import {
  checkClaudeMdVersion,
  updateClaudeMd,
  checkDeployYmlMcpApi,
  generateMcpApiDeployYml,
  analyzeGitHubActions,
  scanLegacy,
  scanInternal,
  DEPLOY_METHODS,
} from './scan-legacy.js';

// Wrap scanBlueGreen to include legacy fallback
async function scanBlueGreen(projectName, options = {}) {
  return scanBlueGreenApi(projectName, options, scanLegacy);
}

export default {
  // API-based functions
  scanBlueGreen,
  checkMcpConnection,
  promptForApiKey,
  compareVersions,
  checkSsotSync,
  getSsotStatus,

  // Legacy/utility functions
  scanLegacy,
  scanInternal,
  analyzeGitHubActions,
  checkClaudeMdVersion,
  updateClaudeMd,
  checkDeployYmlMcpApi,
  generateMcpApiDeployYml,
  DEPLOY_METHODS,
};
