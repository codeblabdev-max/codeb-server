/**
 * Workflow Scan API Module
 *
 * MCP API 기반 스캔 기능
 * - Blue-Green Slot API 스캔 (primary)
 * - MCP 연결 상태 확인
 * - SSOT 동기화 상태 확인
 * - 버전 비교
 *
 * @module workflow/scan-api
 * @version 3.0.0
 */

import chalk from 'chalk';
import ora from 'ora';
import { readFile } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { getCliVersion, getApiKey, getConfigDir } from '../../lib/config.js';
import { mcpClient } from '../../lib/mcp-client.js';
import { ssotClient } from '../../lib/ssot-client.js';

// ============================================================================
// Constants
// ============================================================================

// Current CLI version for comparison
const CURRENT_CLI_VERSION = getCliVersion();

// ============================================================================
// MCP API Key Validation
// ============================================================================

/**
 * Check MCP API key and connection status
 * @returns {Promise<Object>} Connection status
 */
export async function checkMcpConnection() {
  const result = {
    hasApiKey: false,
    apiKey: null,
    connected: false,
    serverVersion: null,
    error: null
  };

  // Check API key
  const apiKey = getApiKey();
  if (apiKey) {
    result.hasApiKey = true;
    result.apiKey = apiKey.substring(0, 15) + '...'; // Masked
  }

  // Try connection
  try {
    const connected = await mcpClient.ensureConnected();
    result.connected = connected;

    if (connected) {
      // Get server version via health check
      try {
        const health = await mcpClient.callTool('health_check', {});
        result.serverVersion = health?.version || 'unknown';
      } catch {
        result.serverVersion = 'unknown';
      }
    }
  } catch (error) {
    result.error = error.message;
  }

  return result;
}

/**
 * Prompt user for MCP API key if not set
 * @param {Function} promptFn - Prompt function (inquirer or readline)
 * @returns {Promise<string|null>} API key or null
 */
export async function promptForApiKey(promptFn) {
  if (!promptFn) return null;

  console.log(chalk.yellow('\n⚠️  MCP API 키가 설정되지 않았습니다.'));
  console.log(chalk.gray('   API 키는 app.codeb.kr/settings 에서 발급받을 수 있습니다.\n'));

  const configDir = getConfigDir();
  console.log(chalk.gray(`   설정 방법:`));
  console.log(chalk.gray(`   1. 환경변수: export CODEB_API_KEY=codeb_xxx`));
  console.log(chalk.gray(`   2. 설정파일: ${configDir}/config.json`));
  console.log(chalk.gray(`   3. .env 파일: CODEB_API_KEY=codeb_xxx\n`));

  return null;
}

// ============================================================================
// Version Comparison (CLI vs Local vs Server)
// ============================================================================

/**
 * Compare versions across CLI, local project, and server
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Version comparison result
 */
export async function compareVersions(projectPath = '.') {
  const result = {
    cli: { version: CURRENT_CLI_VERSION, source: 'package.json' },
    local: { version: null, source: null, needsUpdate: false },
    server: { version: null, source: null, needsUpdate: false },
    allMatch: false,
    issues: []
  };

  // Check local CLAUDE.md version
  const claudeMdPath = join(projectPath, 'CLAUDE.md');
  if (existsSync(claudeMdPath)) {
    try {
      const content = await readFile(claudeMdPath, 'utf-8');
      const match = content.match(/CLAUDE\.md v([\d.]+)/);
      result.local.version = match?.[1] || 'unknown';
      result.local.source = 'CLAUDE.md';

      if (result.local.version !== CURRENT_CLI_VERSION) {
        result.local.needsUpdate = true;
        result.issues.push(`Local CLAUDE.md (v${result.local.version}) ≠ CLI (v${CURRENT_CLI_VERSION})`);
      }
    } catch {
      result.local.version = 'error';
    }
  } else {
    result.local.version = 'missing';
    result.local.needsUpdate = true;
    result.issues.push('Local CLAUDE.md not found');
  }

  // Check server version via MCP
  try {
    const connected = await mcpClient.ensureConnected();
    if (connected) {
      const health = await mcpClient.callTool('health_check', {});
      result.server.version = health?.version || 'unknown';
      result.server.source = 'MCP API';

      if (result.server.version !== CURRENT_CLI_VERSION && result.server.version !== 'unknown') {
        result.server.needsUpdate = true;
        result.issues.push(`Server (v${result.server.version}) ≠ CLI (v${CURRENT_CLI_VERSION})`);
      }
    }
  } catch {
    result.server.version = 'offline';
    result.server.source = 'connection failed';
  }

  // Check if all versions match
  result.allMatch = !result.local.needsUpdate && !result.server.needsUpdate;

  return result;
}

// ============================================================================
// SSOT Sync Check
// ============================================================================

/**
 * Check SSOT synchronization status between local project and server
 * @param {string} projectName - Project name
 * @returns {Promise<Object>} SSOT sync status
 */
export async function checkSsotSync(projectName) {
  const result = {
    connected: false,
    projectRegistered: false,
    serverData: null,
    localConfig: null,
    issues: [],
    recommendations: []
  };

  // Try to get SSOT data from server
  try {
    const ssotData = await ssotClient.getProject(projectName);

    if (ssotData && !ssotData.error) {
      result.connected = true;
      result.projectRegistered = true;
      result.serverData = {
        name: ssotData.name || projectName,
        port: ssotData.port,
        domain: ssotData.domain,
        environment: ssotData.environment,
        status: ssotData.status,
        slots: ssotData.slots
      };
    } else if (ssotData?.error) {
      result.connected = true;
      result.projectRegistered = false;
      result.issues.push(`프로젝트가 SSOT에 등록되지 않음: ${projectName}`);
      result.recommendations.push('we workflow init으로 프로젝트 등록 필요');
    }
  } catch (error) {
    // Try direct API call
    try {
      const health = await mcpClient.callTool('health_check', {});
      if (health?.success) {
        result.connected = true;

        // Try to get project from SSOT
        const ssot = await mcpClient.callTool('ssot_get', {});
        if (ssot?.projects?.[projectName]) {
          result.projectRegistered = true;
          result.serverData = ssot.projects[projectName];
        } else {
          result.projectRegistered = false;
          result.issues.push(`프로젝트가 SSOT에 등록되지 않음: ${projectName}`);
          result.recommendations.push('we workflow init으로 프로젝트 등록 필요');
        }
      }
    } catch {
      result.issues.push('MCP API 서버 연결 실패');
      result.recommendations.push('we health로 서버 상태 확인');
    }
  }

  // Read local quadlet files to compare
  const quadletDir = join(process.cwd(), 'quadlet');
  if (existsSync(quadletDir)) {
    try {
      const files = readdirSync(quadletDir).filter(f => f.endsWith('.container'));
      const localPorts = [];

      for (const file of files) {
        const content = await readFile(join(quadletDir, file), 'utf-8');
        const portMatch = content.match(/PublishPort=(\d+):/);
        if (portMatch) {
          localPorts.push({ file, port: parseInt(portMatch[1]) });
        }
      }

      result.localConfig = { quadletFiles: files, ports: localPorts };

      // Compare with server
      if (result.serverData?.port && localPorts.length > 0) {
        const serverPort = result.serverData.port;
        const localMainPort = localPorts.find(p => !p.file.includes('staging'))?.port;

        if (localMainPort && localMainPort !== serverPort) {
          result.issues.push(`포트 불일치: 로컬(${localMainPort}) vs 서버(${serverPort})`);
          result.recommendations.push('we ssot sync로 동기화 필요');
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  return result;
}

/**
 * Get full SSOT status summary
 * @returns {Promise<Object>} SSOT status
 */
export async function getSsotStatus() {
  const result = {
    connected: false,
    version: null,
    projectCount: 0,
    projects: [],
    error: null
  };

  try {
    const health = await mcpClient.callTool('health_check', {});
    if (health?.success) {
      result.connected = true;
      result.version = health.version;

      const ssot = await mcpClient.callTool('ssot_get', {});
      if (ssot?.projects) {
        result.projects = Object.keys(ssot.projects);
        result.projectCount = result.projects.length;
      }
    }
  } catch (error) {
    result.error = error.message;
  }

  return result;
}

// ============================================================================
// Blue-Green Slot API Scan (Primary)
// ============================================================================

/**
 * Scan using Blue-Green Slot API
 * @param {string} projectName - Project name
 * @param {Object} options - Scan options
 * @param {Function} fallbackFn - Fallback function for legacy scan
 * @returns {Promise<Object>} Scan result
 */
export async function scanBlueGreen(projectName, options = {}, fallbackFn = null) {
  const spinner = ora('Scanning with Blue-Green Slot API...').start();

  try {
    const result = await mcpClient.workflowScan(projectName, {
      gitRepo: options.gitRepo,
      autoFix: options.autoFix || false,
    });

    spinner.succeed('Scan completed (Blue-Green Slot API)');

    // Display result
    console.log(chalk.blue.bold('\n📊 Blue-Green Slot Workflow Scan\n'));

    if (result.error) {
      console.log(chalk.red(`❌ Error: ${result.error}`));
      return result;
    }

    // Current Status
    if (result.currentStatus) {
      console.log(chalk.yellow('🔍 Current Status:'));
      const status = result.currentStatus;
      console.log(chalk.gray(`  Project: ${status.projectName || projectName}`));
      console.log(chalk.gray(`  Registered: ${status.isRegistered ? '✅' : '❌'}`));

      if (status.slots) {
        console.log(chalk.gray(`  Active Slot: ${status.slots.activeSlot || 'none'}`));
        console.log(chalk.gray(`  Blue: ${status.slots.blue?.status || 'empty'}`));
        console.log(chalk.gray(`  Green: ${status.slots.green?.status || 'empty'}`));
      }

      if (status.domain) {
        console.log(chalk.gray(`  Domain: ${status.domain}`));
      }
    }

    // New Workflow
    if (result.workflow) {
      console.log(chalk.yellow('\n📄 Generated Workflow:'));
      console.log(chalk.gray(`  Version: ${result.workflow.version}`));
      console.log(chalk.gray(`  Type: ${result.workflow.type}`));
      if (result.workflow.features) {
        console.log(chalk.gray(`  Features: ${result.workflow.features.join(', ')}`));
      }
    }

    // Recommendations
    if (result.recommendations?.length > 0) {
      console.log(chalk.yellow('\n💡 Recommendations:'));
      result.recommendations.forEach((rec, i) => {
        console.log(chalk.cyan(`  ${i + 1}. ${rec}`));
      });
    }

    // Next Steps
    if (result.nextSteps?.length > 0) {
      console.log(chalk.yellow('\n🚀 Next Steps:'));
      result.nextSteps.forEach((step, i) => {
        console.log(chalk.green(`  ${i + 1}. ${step}`));
      });
    }

    console.log();
    return result;

  } catch (error) {
    spinner.fail('Scan failed');

    // Check if it's an API error and fall back to legacy scan
    if (fallbackFn && (
        error.message.includes('API') ||
        error.message.includes('fetch') ||
        error.message.includes('ECONNREFUSED'))) {
      console.log(chalk.yellow('\n⚠️  MCP API unavailable, falling back to legacy scan...\n'));
      return fallbackFn(projectName, options);
    }

    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    throw error;
  }
}

// ============================================================================
// Exports
// ============================================================================

export default {
  checkMcpConnection,
  promptForApiKey,
  compareVersions,
  checkSsotSync,
  getSsotStatus,
  scanBlueGreen,
  CURRENT_CLI_VERSION,
};
