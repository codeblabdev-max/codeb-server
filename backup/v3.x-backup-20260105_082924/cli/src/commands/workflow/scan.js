/**
 * Workflow Scan Module
 *
 * Scans project deployment status and detects issues
 * - Blue-Green Slot API scan (primary)
 * - Legacy SSH-based scan (fallback)
 * - Resource scanning (DB, Redis, Storage)
 */

import chalk from 'chalk';
import ora from 'ora';
import { readFile, writeFile, copyFile, mkdir } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getServerHost, getServerUser, getCliVersion, getApiKey, getConfigDir } from '../../lib/config.js';
import { mcpClient } from '../../lib/mcp-client.js';
import { generateEnvTemplate } from './env-generator.js';
import { ssotClient } from '../../lib/ssot-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CLI rules source directory (for CLAUDE.md)
const RULES_SOURCE = join(__dirname, '../../../rules');

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

// Deployment methods
const DEPLOY_METHODS = {
  SSH: 'SSH',
  MCP_API: 'MCP-API',
  UNKNOWN: 'Unknown'
};

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
// CLAUDE.md Version Check
// ============================================================================

/**
 * Check CLAUDE.md version and compare with CLI version
 * @param {string} projectPath - Project path
 * @returns {Promise<Object>} Version check result
 */
export async function checkClaudeMdVersion(projectPath = '.') {
  const claudeMdPath = join(projectPath, 'CLAUDE.md');
  const cliClaudeMdPath = join(RULES_SOURCE, 'CLAUDE.md');

  const result = {
    exists: false,
    localVersion: null,
    cliVersion: null,
    isOutdated: false,
    needsUpdate: false
  };

  // Check if local CLAUDE.md exists
  if (!existsSync(claudeMdPath)) {
    result.needsUpdate = true;
    return result;
  }
  result.exists = true;

  // Read local CLAUDE.md version
  try {
    const localContent = await readFile(claudeMdPath, 'utf-8');
    const localMatch = localContent.match(/CLAUDE\.md v([\d.]+)/);
    result.localVersion = localMatch?.[1] || 'unknown';
  } catch {
    result.localVersion = 'unknown';
  }

  // Read CLI CLAUDE.md version
  try {
    if (existsSync(cliClaudeMdPath)) {
      const cliContent = await readFile(cliClaudeMdPath, 'utf-8');
      const cliMatch = cliContent.match(/CLAUDE\.md v([\d.]+)/);
      result.cliVersion = cliMatch?.[1] || CURRENT_CLI_VERSION;
    } else {
      result.cliVersion = CURRENT_CLI_VERSION;
    }
  } catch {
    result.cliVersion = CURRENT_CLI_VERSION;
  }

  // Compare versions
  if (result.localVersion && result.cliVersion && result.localVersion !== 'unknown') {
    result.isOutdated = result.localVersion < result.cliVersion;
    result.needsUpdate = result.isOutdated;
  }

  return result;
}

/**
 * Update CLAUDE.md to latest version
 * @param {string} projectPath - Project path
 * @returns {Promise<boolean>} Success status
 */
export async function updateClaudeMd(projectPath = '.') {
  const claudeMdPath = join(projectPath, 'CLAUDE.md');
  const cliClaudeMdPath = join(RULES_SOURCE, 'CLAUDE.md');

  if (!existsSync(cliClaudeMdPath)) {
    return false;
  }

  try {
    // Backup existing if exists
    if (existsSync(claudeMdPath)) {
      const backupPath = `${claudeMdPath}.backup.${Date.now()}`;
      await copyFile(claudeMdPath, backupPath);
    }

    // Copy new version
    await copyFile(cliClaudeMdPath, claudeMdPath);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// deploy.yml MCP API Check
// ============================================================================

/**
 * Check if deploy.yml uses MCP API (not SSH/Self-hosted)
 * @param {string} content - deploy.yml content
 * @returns {Object} Check result
 */
export function checkDeployYmlMcpApi(content) {
  const result = {
    usesMcpApi: false,
    usesSshDeploy: false,
    usesSelfHosted: false,
    needsUpdate: false,
    issues: []
  };

  // Check for MCP API usage
  result.usesMcpApi = content.includes('app.codeb.kr/api') ||
                       content.includes('CODEB_API_KEY') ||
                       (content.includes('"tool":') && content.includes('"deploy"'));

  // Check for SSH deploy
  result.usesSshDeploy = content.includes('appleboy/ssh-action') ||
                          content.includes('ssh-action@');

  // Check for self-hosted runner
  result.usesSelfHosted = content.includes('self-hosted') ||
                           content.includes('codeb-app');

  // Determine if update needed
  if (!result.usesMcpApi && (result.usesSshDeploy || result.usesSelfHosted)) {
    result.needsUpdate = true;
    if (result.usesSshDeploy) {
      result.issues.push('SSH deploy detected - should use MCP API');
    }
    if (result.usesSelfHosted) {
      result.issues.push('Self-hosted runner detected - should use MCP API');
    }
  }

  return result;
}

/**
 * Generate MCP API deploy.yml content
 * @param {string} projectName - Project name
 * @param {Object} options - Options
 * @returns {string} deploy.yml content
 */
export function generateMcpApiDeployYml(projectName, options = {}) {
  const imageName = options.imageName || `codeb-dev-run/${projectName}`;
  const environment = options.environment || 'production';
  const domain = options.domain || `${projectName}.codeb.kr`;

  return `# ==============================================================================
# ${projectName} - CI/CD Pipeline (MCP API v${CURRENT_CLI_VERSION})
# Generated by CodeB CLI v${CURRENT_CLI_VERSION}
# ==============================================================================
# MCP API Deployment:
#   - Build: GitHub-hosted runner (ubuntu-latest)
#   - Deploy: MCP API (no SSH required)
# ==============================================================================

name: CI/CD Pipeline

on:
  push:
    branches:
      - main
      - staging
    paths-ignore:
      - '**.md'
      - 'docs/**'
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${imageName}

jobs:
  build:
    name: Build & Push
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    outputs:
      image_tag: \${{ steps.meta.outputs.version }}
      environment: \${{ steps.vars.outputs.environment }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set variables
        id: vars
        run: |
          echo "short_sha=\$(git rev-parse --short HEAD)" >> \$GITHUB_OUTPUT
          if [ "\${{ github.ref }}" = "refs/heads/main" ]; then
            echo "environment=production" >> \$GITHUB_OUTPUT
          else
            echo "environment=staging" >> \$GITHUB_OUTPUT
          fi

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GHCR_PAT }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=latest,enable=\${{ github.ref == 'refs/heads/main' }}
            type=raw,value=staging,enable=\${{ github.ref == 'refs/heads/staging' }}
            type=sha,prefix=,format=short

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    name: Deploy via MCP API
    needs: build
    runs-on: ubuntu-latest

    steps:
      - name: Deploy via CodeB MCP API
        run: |
          ENVIRONMENT="\${{ needs.build.outputs.environment }}"
          IMAGE_TAG="\${{ github.ref == 'refs/heads/main' && 'latest' || 'staging' }}"

          echo "🚀 Deploying ${projectName} to \$ENVIRONMENT..."

          RESPONSE=\$(curl -sf -X POST "https://app.codeb.kr/api/tool" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d "{
              \\"tool\\": \\"deploy\\",
              \\"params\\": {
                \\"project\\": \\"${projectName}\\",
                \\"image\\": \\"ghcr.io/\${{ env.IMAGE_NAME }}:\$IMAGE_TAG\\",
                \\"environment\\": \\"\$ENVIRONMENT\\"
              }
            }")

          echo "Deploy Response: \$RESPONSE"

          if echo "\$RESPONSE" | grep -q '"success":true'; then
            echo "✅ Deployment successful!"
          else
            echo "❌ Deployment failed"
            exit 1
          fi

      - name: Health Check
        run: |
          sleep 10
          curl -sf "https://${domain}/api/health" || echo "⚠️ Health check pending..."
`;
}

// ============================================================================
// GitHub Actions Analysis
// ============================================================================

/**
 * Analyze GitHub Actions workflow file
 * @param {string} content - Workflow file content
 * @returns {Object} Analysis result
 */
export function analyzeGitHubActions(content) {
  const usesSSHDeploy = content.includes('appleboy/ssh-action') || content.includes('ssh-action');
  const usesMcpApi = content.includes('api.codeb.kr') ||
                     content.includes('MCP_API') ||
                     content.includes('workflow_scan') ||
                     content.includes('deploy:') && content.includes('curl');

  // Extract version from comment
  const versionMatch = content.match(/Generated by CodeB CLI v([\d.]+)/);
  const version = versionMatch?.[1] || 'unknown';

  // Determine deployment method
  let deployMethod = DEPLOY_METHODS.UNKNOWN;
  if (usesMcpApi) {
    deployMethod = DEPLOY_METHODS.MCP_API;
  } else if (usesSSHDeploy) {
    deployMethod = DEPLOY_METHODS.SSH;
  }

  return {
    exists: true,
    version,
    deployMethod,
    usesMcpApi,
    usesSSHDeploy,
    hasQuadlet: content.includes('Quadlet') || content.includes('quadlet'),
    hasBlueGreen: content.includes('blue') && content.includes('green'),
    // Version check - warn if significantly outdated
    isOutdated: version !== 'unknown' && version < '3.0.0'
  };
}

// ============================================================================
// Blue-Green Slot API Scan (Primary)
// ============================================================================

/**
 * Scan using Blue-Green Slot API
 * @param {string} projectName - Project name
 * @param {Object} options - Scan options
 * @returns {Promise<Object>} Scan result
 */
export async function scanBlueGreen(projectName, options = {}) {
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
    if (error.message.includes('API') ||
        error.message.includes('fetch') ||
        error.message.includes('ECONNREFUSED')) {
      console.log(chalk.yellow('\n⚠️  MCP API unavailable, falling back to legacy scan...\n'));
      return scanLegacy(projectName, options);
    }

    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    throw error;
  }
}

// ============================================================================
// Legacy SSH-based Scan (Fallback)
// ============================================================================

/**
 * Scan using legacy SSH method
 * @param {string} projectName - Project name
 * @param {Object} options - Scan options
 * @returns {Promise<Object>} Scan result
 */
export async function scanLegacy(projectName, options = {}) {
  const spinner = ora('Scanning deployment status...').start();
  const serverHost = options.host || getServerHost();
  const serverUser = options.user || getServerUser();
  const autoFix = options.fix || options.autoFix || false;

  try {
    const report = {
      local: { quadlet: [], github: null, dockerfile: false, env: false, claudeMd: null, deployYml: null },
      server: { containers: [], quadlet: [], registry: null, ports: [], network: null },
      comparison: { needsMigration: false, issues: [], missingServices: [], networkIssues: [], fixable: [] },
      fixed: []
    };

    // 1. Scan Local Files
    spinner.text = 'Scanning local files...';

    // Check for quadlet directory
    if (existsSync('quadlet')) {
      const quadletFiles = readdirSync('quadlet').filter(f => f.endsWith('.container'));
      report.local.quadlet = quadletFiles;
    }

    // Check for GitHub Actions
    const ghPath = '.github/workflows/deploy.yml';
    if (existsSync(ghPath)) {
      const content = await readFile(ghPath, 'utf-8');
      report.local.github = analyzeGitHubActions(content);
      report.local.deployYml = checkDeployYmlMcpApi(content);
    }

    // Check for CLAUDE.md
    spinner.text = 'Checking CLAUDE.md version...';
    report.local.claudeMd = await checkClaudeMdVersion('.');

    // Check for Dockerfile
    report.local.dockerfile = existsSync('Dockerfile');

    // Check for .env files (detailed)
    report.local.envFiles = {
      env: existsSync('.env'),
      envLocal: existsSync('.env.local'),
      envExample: existsSync('.env.example'),
      envProduction: existsSync('.env.production'),
      envStaging: existsSync('.env.staging')
    };
    report.local.env = report.local.envFiles.env || report.local.envFiles.envLocal || report.local.envFiles.envExample;

    // 2. Scan Server (via SSH)
    spinner.text = 'Scanning server status...';

    const { execSync } = await import('child_process');

    try {
      // Get running containers with network info
      const containersCmd = `ssh ${serverUser}@${serverHost} "podman ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.Networks}}' 2>/dev/null"`;
      const containersOutput = execSync(containersCmd, { encoding: 'utf-8', timeout: 30000 }).trim();

      if (containersOutput) {
        report.server.containers = containersOutput.split('\n').map(line => {
          const [name, image, status, ports, networks] = line.split('|');
          return { name, image, status, ports, networks };
        });
      }

      // Get Quadlet files on server
      const quadletCmd = `ssh ${serverUser}@${serverHost} "ls /etc/containers/systemd/*.container 2>/dev/null | xargs -I {} basename {}"`;
      const quadletOutput = execSync(quadletCmd, { encoding: 'utf-8', timeout: 30000 }).trim();

      if (quadletOutput) {
        report.server.quadlet = quadletOutput.split('\n').filter(Boolean);
      }

      // Get project registry
      const registryCmd = `ssh ${serverUser}@${serverHost} "cat /opt/codeb/config/project-registry.json 2>/dev/null"`;
      try {
        const registryOutput = execSync(registryCmd, { encoding: 'utf-8', timeout: 30000 });
        report.server.registry = JSON.parse(registryOutput);
      } catch {
        report.server.registry = null;
      }

      // Get used ports
      const portsCmd = `ssh ${serverUser}@${serverHost} "ss -tlnp 2>/dev/null | grep LISTEN | awk '{print \\$4}' | grep -oE '[0-9]+$' | sort -n | uniq"`;
      const portsOutput = execSync(portsCmd, { encoding: 'utf-8', timeout: 30000 }).trim();
      report.server.ports = portsOutput.split('\n').filter(Boolean).map(Number);

      // Check codeb-network exists
      try {
        const networkCmd = `ssh ${serverUser}@${serverHost} "podman network inspect codeb-network --format '{{.Subnets}}' 2>/dev/null"`;
        const networkOutput = execSync(networkCmd, { encoding: 'utf-8', timeout: 30000 }).trim();
        report.server.network = { exists: true, subnet: networkOutput };
      } catch {
        report.server.network = { exists: false, subnet: null };
      }

    } catch (sshError) {
      report.server.error = `SSH connection failed: ${sshError.message}`;
    }

    // 3. Compare and analyze
    spinner.text = 'Analyzing differences...';
    analyzeReport(report, projectName);

    // 4. Auto-fix if requested
    if (autoFix && report.comparison.fixable.length > 0) {
      spinner.text = 'Applying fixes...';

      for (const fix of report.comparison.fixable) {
        if (fix.type === 'claude_md') {
          const updated = await updateClaudeMd('.');
          if (updated) {
            report.fixed.push('CLAUDE.md updated to latest version');
          }
        }

        if (fix.type === 'deploy_yml' && projectName) {
          const ghPath = '.github/workflows/deploy.yml';
          const backupPath = `${ghPath}.backup.${Date.now()}`;

          // Backup existing
          if (existsSync(ghPath)) {
            await copyFile(ghPath, backupPath);
          }

          // Generate new MCP API deploy.yml
          const newContent = generateMcpApiDeployYml(projectName, {
            imageName: `codeb-dev-run/${projectName}`,
            domain: `${projectName}.codeb.kr`
          });

          await mkdir('.github/workflows', { recursive: true });
          await writeFile(ghPath, newContent);
          report.fixed.push(`deploy.yml updated to MCP API (backup: ${backupPath})`);
        }

        if (fix.type === 'env_example' && projectName) {
          // Generate .env.example if missing
          const envConfig = {
            projectName,
            hasDatabase: true,
            hasRedis: true,
            hasStorage: false
          };

          const envContent = generateEnvTemplate(envConfig);
          await writeFile('.env.example', envContent);
          report.fixed.push('.env.example generated');
        }
      }
    }

    spinner.succeed('Scan completed');

    // Display Report
    displayReport(report, projectName, autoFix);

    return report;

  } catch (error) {
    spinner.fail('Scan failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    throw error;
  }
}

// ============================================================================
// Report Analysis
// ============================================================================

/**
 * Analyze report and detect issues
 * @param {Object} report - Scan report
 * @param {string} projectName - Project name
 */
function analyzeReport(report, projectName) {
  // Check if project exists on server
  if (projectName) {
    const serverHasProject = report.server.containers.some(c => c.name.includes(projectName));
    const localHasQuadlet = report.local.quadlet.some(f => f.includes(projectName));

    if (serverHasProject && !localHasQuadlet) {
      report.comparison.issues.push(`Project "${projectName}" exists on server but no local quadlet files`);
      report.comparison.needsMigration = true;
    }

    if (!serverHasProject && localHasQuadlet) {
      report.comparison.issues.push(`Local quadlet files exist but project not deployed on server`);
    }
  }

  // Check GitHub Actions deployment method
  if (report.local.github) {
    // Warn if using SSH instead of MCP API (SSH는 Admin 전용)
    if (report.local.github.usesSSHDeploy && !report.local.github.usesMcpApi) {
      report.comparison.issues.push('SSH deploy detected (Admin only) - run "we workflow migrate" for MCP API');
      report.comparison.needsMigration = true;
    }

    // Warn if version is significantly outdated
    if (report.local.github.isOutdated) {
      report.comparison.issues.push(`GitHub Actions workflow is outdated (v${report.local.github.version})`);
      report.comparison.needsMigration = true;
    }
  }

  // Check deploy.yml MCP API usage
  if (report.local.deployYml?.needsUpdate) {
    report.local.deployYml.issues.forEach(issue => {
      report.comparison.issues.push(issue);
    });
    report.comparison.fixable.push({
      type: 'deploy_yml',
      message: 'deploy.yml needs MCP API update',
      fix: 'we workflow scan --fix'
    });
    report.comparison.needsMigration = true;
  }

  // Check CLAUDE.md version
  if (report.local.claudeMd) {
    if (!report.local.claudeMd.exists) {
      report.comparison.issues.push('CLAUDE.md not found - project rules missing');
      report.comparison.fixable.push({
        type: 'claude_md',
        message: 'CLAUDE.md needs to be created',
        fix: 'we workflow scan --fix'
      });
    } else if (report.local.claudeMd.needsUpdate) {
      report.comparison.issues.push(`CLAUDE.md outdated (v${report.local.claudeMd.localVersion} → v${report.local.claudeMd.cliVersion})`);
      report.comparison.fixable.push({
        type: 'claude_md',
        message: 'CLAUDE.md needs update',
        fix: 'we workflow scan --fix'
      });
    }
  }

  // Check ENV files
  if (report.local.envFiles) {
    if (!report.local.envFiles.envExample) {
      report.comparison.issues.push('.env.example not found - ENV template missing');
      report.comparison.fixable.push({
        type: 'env_example',
        message: '.env.example needs to be created',
        fix: 'we workflow scan --fix'
      });
    }
  }

  // Check for missing services
  if (report.server.registry?.projects && !report.server.error) {
    for (const [projName, projData] of Object.entries(report.server.registry.projects)) {
      if (projectName && !projName.includes(projectName)) continue;

      const ports = projData.ports || {};
      const containerNames = report.server.containers.map(c => c.name);

      // Check for missing PostgreSQL
      if (ports.app && !ports.postgres) {
        const hasPostgres = containerNames.some(n => n.includes(projName) && n.includes('postgres'));
        if (!hasPostgres) {
          report.comparison.missingServices.push({
            project: projName,
            service: 'postgres',
            message: `Missing PostgreSQL for project "${projName}"`
          });
        }
      }

      // Check for missing Redis
      if (ports.app && !ports.redis) {
        const hasRedis = containerNames.some(n => n.includes(projName) && n.includes('redis'));
        if (!hasRedis) {
          report.comparison.missingServices.push({
            project: projName,
            service: 'redis',
            message: `Missing Redis for project "${projName}"`
          });
        }
      }
    }
  }

  // Check network issues
  if (!report.server.error) {
    if (!report.server.network?.exists) {
      report.comparison.networkIssues.push({
        type: 'missing_network',
        message: 'codeb-network does not exist on server'
      });
    }

    const containersOnWrongNetwork = report.server.containers.filter(c => {
      if (projectName && !c.name.includes(projectName)) return false;
      return c.networks && c.networks !== 'codeb-network';
    });

    if (containersOnWrongNetwork.length > 0) {
      report.comparison.networkIssues.push({
        type: 'wrong_network',
        message: `${containersOnWrongNetwork.length} containers not on codeb-network`,
        containers: containersOnWrongNetwork.map(c => ({ name: c.name, network: c.networks }))
      });
    }
  }
}

// ============================================================================
// Report Display
// ============================================================================

/**
 * Display scan report
 * @param {Object} report - Scan report
 * @param {string} projectName - Project name
 * @param {boolean} showFixes - Show fixed items
 */
function displayReport(report, projectName, showFixes = false) {
  console.log(chalk.blue.bold('\n📊 Deployment Status Report\n'));

  // Local Status
  console.log(chalk.yellow('📁 Local Files:'));
  console.log(chalk.gray(`  Quadlet files: ${report.local.quadlet.length > 0 ? report.local.quadlet.join(', ') : 'None'}`));

  if (report.local.github) {
    const gh = report.local.github;
    const mcpStatus = report.local.deployYml?.usesMcpApi ? '✅ MCP API' :
                      report.local.deployYml?.usesSelfHosted ? '⚠️ Self-hosted' :
                      report.local.deployYml?.usesSshDeploy ? '⚠️ SSH' : '';
    console.log(chalk.gray(`  GitHub Actions: v${gh.version} (${gh.deployMethod}) ${mcpStatus}`));
  } else {
    console.log(chalk.gray(`  GitHub Actions: Not found`));
  }

  // CLAUDE.md status
  if (report.local.claudeMd) {
    const cm = report.local.claudeMd;
    if (!cm.exists) {
      console.log(chalk.red(`  CLAUDE.md: ❌ Not found`));
    } else if (cm.needsUpdate) {
      console.log(chalk.yellow(`  CLAUDE.md: ⚠️ v${cm.localVersion} (latest: v${cm.cliVersion})`));
    } else {
      console.log(chalk.gray(`  CLAUDE.md: ✅ v${cm.localVersion}`));
    }
  }

  console.log(chalk.gray(`  Dockerfile: ${report.local.dockerfile ? '✅' : '❌'}`));

  // ENV files status (detailed)
  if (report.local.envFiles) {
    const ef = report.local.envFiles;
    const envStatus = [];
    if (ef.env) envStatus.push('.env');
    if (ef.envLocal) envStatus.push('.env.local');
    if (ef.envExample) envStatus.push('.env.example');
    if (ef.envProduction) envStatus.push('.env.production');
    if (ef.envStaging) envStatus.push('.env.staging');

    if (envStatus.length > 0) {
      console.log(chalk.gray(`  Environment files: ✅ ${envStatus.join(', ')}`));
    } else {
      console.log(chalk.red(`  Environment files: ❌ Not found`));
    }
  } else {
    console.log(chalk.gray(`  Environment files: ${report.local.env ? '✅' : '❌'}`));
  }

  // Server Status
  console.log(chalk.yellow('\n🖥️  Server Status:'));
  if (report.server.error) {
    console.log(chalk.red(`  ${report.server.error}`));
  } else {
    console.log(chalk.gray(`  Running containers: ${report.server.containers.length}`));
    if (report.server.containers.length > 0) {
      report.server.containers.forEach(c => {
        const statusColor = c.status.includes('Up') ? chalk.green : chalk.red;
        console.log(chalk.gray(`    • ${c.name}: ${statusColor(c.status)}`));
      });
    }
    console.log(chalk.gray(`  Quadlet files: ${report.server.quadlet.length}`));
    console.log(chalk.gray(`  Registry projects: ${report.server.registry?.projects ? Object.keys(report.server.registry.projects).length : 0}`));
  }

  // Issues
  if (report.comparison.issues.length > 0) {
    console.log(chalk.yellow('\n⚠️  Issues Found:'));
    report.comparison.issues.forEach(issue => {
      console.log(chalk.red(`  • ${issue}`));
    });

    if (report.comparison.needsMigration) {
      console.log(chalk.cyan('\n💡 Recommendation: Run "we workflow migrate" to update'));
    }
  }

  // Missing Services
  if (report.comparison.missingServices.length > 0) {
    console.log(chalk.yellow('\n🔍 Missing Services Detected:'));
    report.comparison.missingServices.forEach(ms => {
      console.log(chalk.red(`  • ${ms.message}`));
      console.log(chalk.cyan(`    Fix: we workflow add-service ${ms.project} --service ${ms.service}`));
    });
  }

  // Network Issues
  if (report.comparison.networkIssues.length > 0) {
    console.log(chalk.yellow('\n🌐 Network Issues Detected:'));
    report.comparison.networkIssues.forEach(ni => {
      console.log(chalk.red(`  • ${ni.message}`));
      if (ni.type === 'missing_network') {
        console.log(chalk.cyan('    Fix: we workflow fix-network'));
      } else if (ni.type === 'wrong_network' && ni.containers) {
        ni.containers.slice(0, 5).forEach(c => {
          console.log(chalk.gray(`      - ${c.name} (current: ${c.network})`));
        });
        if (ni.containers.length > 5) {
          console.log(chalk.gray(`      ... and ${ni.containers.length - 5} more`));
        }
        console.log(chalk.cyan('    Fix: we workflow fix-network'));
      }
    });
  }

  // Fixed Items (when --fix was used)
  if (showFixes && report.fixed && report.fixed.length > 0) {
    console.log(chalk.green('\n✅ Fixed Items:'));
    report.fixed.forEach(item => {
      console.log(chalk.green(`  • ${item}`));
    });
  }

  // Fixable Items Recommendation (when --fix was NOT used)
  if (!showFixes && report.comparison.fixable && report.comparison.fixable.length > 0) {
    console.log(chalk.cyan('\n🔧 Auto-Fixable Issues:'));
    report.comparison.fixable.forEach(fix => {
      console.log(chalk.cyan(`  • ${fix.message}`));
    });
    console.log(chalk.yellow('\n💡 Run with --fix to auto-update:'));
    console.log(chalk.white('   we workflow scan ' + (projectName || '<project>') + ' --fix'));
  }

  // Summary
  const totalIssues = report.comparison.issues.length +
                      report.comparison.missingServices.length +
                      report.comparison.networkIssues.length;

  if (totalIssues === 0 && (!report.fixed || report.fixed.length === 0)) {
    console.log(chalk.green('\n✅ All checks passed - project is up to date'));
  } else if (report.fixed && report.fixed.length > 0) {
    console.log(chalk.green(`\n📊 Summary: ${report.fixed.length} item(s) fixed`));
  } else {
    console.log(chalk.yellow(`\n📊 Summary: ${totalIssues} issue(s) found`));
  }

  console.log();
}

// ============================================================================
// Internal Scan (for migrate command)
// ============================================================================

/**
 * Internal scan without display (for other commands)
 * @param {string} projectName - Project name
 * @param {Object} options - Scan options
 * @returns {Promise<Object>} Scan result
 */
export async function scanInternal(projectName, options = {}) {
  const serverHost = options.host || getServerHost();
  const serverUser = options.user || getServerUser();

  const report = {
    local: { quadlet: [], github: null, dockerfile: false, env: false },
    server: { containers: [], quadlet: [], registry: null },
    comparison: { needsMigration: false, issues: [] }
  };

  // Scan local
  if (existsSync('quadlet')) {
    report.local.quadlet = readdirSync('quadlet').filter(f => f.endsWith('.container'));
  }

  const ghPath = '.github/workflows/deploy.yml';
  if (existsSync(ghPath)) {
    const content = await readFile(ghPath, 'utf-8');
    report.local.github = analyzeGitHubActions(content);
  }

  report.local.dockerfile = existsSync('Dockerfile');
  report.local.env = existsSync('.env') || existsSync('.env.local');

  // Scan server - Try MCP first
  try {
    const mcpConnected = await mcpClient.ensureConnected();
    if (mcpConnected) {
      const ssotData = await mcpClient.callTool('ssot_get', {});
      if (ssotData && !ssotData.error) {
        report.server.registry = ssotData;
      }
    }
  } catch {
    // Fall back to SSH
    const { execSync } = await import('child_process');
    try {
      const cmd = `ssh ${serverUser}@${serverHost} "cat /opt/codeb/config/project-registry.json 2>/dev/null"`;
      const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
      report.server.registry = JSON.parse(output);
    } catch {
      report.server.registry = null;
    }
  }

  // Analyze
  if (report.local.github) {
    if (report.local.github.isOutdated) {
      report.comparison.issues.push(`Old CLI version (${report.local.github.version})`);
      report.comparison.needsMigration = true;
    }
    if (!report.local.github.usesMcpApi) {
      report.comparison.issues.push('Should use MCP API for deployment');
      report.comparison.needsMigration = true;
    }
  }

  return report;
}

// ============================================================================
// Exports
// ============================================================================

export { DEPLOY_METHODS };

export default {
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
  DEPLOY_METHODS
};
