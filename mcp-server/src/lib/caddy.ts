/**
 * CodeB v7.0 - Caddy Configuration Manager
 *
 * 통합된 Caddy 설정 관리 모듈
 * - 파일 기반 설정 (/etc/caddy/sites/*.caddy)
 * - systemctl reload 방식 (zero-downtime)
 * - Blue-Green 도메인 전환 지원
 */

import { withLocal } from './local-exec.js';
import { logger } from './logger.js';
import type { SlotName, Environment } from './types.js';

// ============================================================================
// Constants
// ============================================================================

const CADDY_SITES_DIR = '/etc/caddy/sites';
const BASE_DOMAIN = 'codeb.kr';
const SUPPORTED_DOMAINS = ['codeb.kr', 'workb.net'];
const APP_SERVER_IP = '158.247.203.55';

// ============================================================================
// Types
// ============================================================================

export interface CaddySiteConfig {
  projectName: string;
  environment: Environment;
  domain: string;
  activePort: number;
  standbyPort?: number;
  activeSlot: SlotName;
  version: string;
  teamId: string;
  customDomains?: string[];
  healthCheckPath?: string;
  enableGzip?: boolean;
  enableLogs?: boolean;
}

export interface DomainInfo {
  domain: string;
  projectName: string;
  environment: Environment;
  activePort: number;
  activeSlot: SlotName;
  version: string;
  isCustom: boolean;
  createdAt: string;
}

// ============================================================================
// Domain Helper Functions
// ============================================================================

/**
 * Get default domain for project/environment
 */
export function getProjectDomain(projectName: string, environment: Environment): string {
  if (environment === 'production') {
    return `${projectName}.${BASE_DOMAIN}`;
  }
  return `${projectName}-${environment}.${BASE_DOMAIN}`;
}

/**
 * Check if domain is a subdomain of supported domains (codeb.kr, workb.net)
 */
export function isSubdomain(domain: string): boolean {
  return SUPPORTED_DOMAINS.some(baseDomain => domain.endsWith(`.${baseDomain}`));
}

/**
 * Get the base domain for a subdomain
 */
export function getBaseDomain(domain: string): string | null {
  for (const baseDomain of SUPPORTED_DOMAINS) {
    if (domain.endsWith(`.${baseDomain}`)) {
      return baseDomain;
    }
  }
  return null;
}

/**
 * Get subdomain name from full domain
 */
export function getSubdomainName(domain: string): string | null {
  const baseDomain = getBaseDomain(domain);
  if (!baseDomain) return null;
  return domain.replace(`.${baseDomain}`, '');
}

/**
 * Get Caddy config file path
 */
export function getCaddyConfigPath(projectName: string, environment: Environment): string {
  return `${CADDY_SITES_DIR}/${projectName}-${environment}.caddy`;
}

// ============================================================================
// Caddy Configuration Generation
// ============================================================================

/**
 * Generate Caddy configuration for a site
 * Supports Blue-Green deployment with failover
 */
export function generateCaddyConfig(config: CaddySiteConfig): string {
  const timestamp = new Date().toISOString();
  const allDomains = [config.domain, ...(config.customDomains || [])];
  const domainList = allDomains.join(', ');

  // Reverse proxy configuration
  let reverseProxyConfig: string;
  if (config.standbyPort) {
    // Blue-Green mode: active first, standby as fallback
    reverseProxyConfig = `reverse_proxy localhost:${config.activePort} localhost:${config.standbyPort} {
    lb_policy first
    fail_duration 10s
    health_uri ${config.healthCheckPath || '/health'}
    health_interval 10s
    health_timeout 5s
  }`;
  } else {
    // Single port mode
    reverseProxyConfig = `reverse_proxy localhost:${config.activePort} {
    health_uri ${config.healthCheckPath || '/health'}
    health_interval 10s
    health_timeout 5s
  }`;
  }

  // Build configuration
  let caddyConfig = `# CodeB v7.0 - Caddy Site Configuration
# Project: ${config.projectName}
# Environment: ${config.environment}
# Version: ${config.version}
# Active Slot: ${config.activeSlot} (port ${config.activePort})
# Team: ${config.teamId}
# Generated: ${timestamp}

${domainList} {
  ${reverseProxyConfig}
`;

  // Add gzip encoding
  if (config.enableGzip !== false) {
    caddyConfig += `  encode gzip
`;
  }

  // Add headers
  caddyConfig += `  header {
    X-CodeB-Project ${config.projectName}
    X-CodeB-Version ${config.version}
    X-CodeB-Slot ${config.activeSlot}
    X-CodeB-Environment ${config.environment}
    -Server
  }
`;

  // Add logging
  if (config.enableLogs !== false) {
    caddyConfig += `  log {
    output file /var/log/caddy/${config.projectName}.log {
      roll_size 10mb
      roll_keep 5
    }
  }
`;
  }

  caddyConfig += `}
`;

  return caddyConfig;
}

// ============================================================================
// Caddy File Operations (via SSH)
// ============================================================================

/**
 * Write Caddy configuration file and reload
 */
export async function writeCaddyConfig(config: CaddySiteConfig): Promise<void> {
  const caddyContent = generateCaddyConfig(config);
  const caddyPath = getCaddyConfigPath(config.projectName, config.environment);

  await withLocal(async (local) => {
    // Ensure directory exists
    await local.mkdir(CADDY_SITES_DIR);

    // Backup existing config if exists
    const backupPath = `${caddyPath}.backup.${Date.now()}`;
    await local.exec(`[ -f ${caddyPath} ] && cp ${caddyPath} ${backupPath} || true`);

    // Write new config
    await local.writeFile(caddyPath, caddyContent);

    // Validate configuration
    const validateResult = await local.exec('caddy validate --config /etc/caddy/Caddyfile 2>&1');
    if (validateResult.code !== 0 && !validateResult.stdout.includes('Valid')) {
      // Restore backup on validation failure
      await local.exec(`[ -f ${backupPath} ] && mv ${backupPath} ${caddyPath} || true`);
      throw new Error(`Caddy config validation failed: ${validateResult.stdout}`);
    }

    // Reload Caddy (zero-downtime)
    await local.exec('systemctl reload caddy');

    logger.info('Caddy config updated', {
      projectName: config.projectName,
      environment: config.environment,
      domain: config.domain
    });
  });
}

/**
 * Add custom domain to existing project config
 */
export async function addCustomDomain(
  projectName: string,
  environment: Environment,
  customDomain: string,
  slotInfo: { activePort: number; standbyPort?: number; activeSlot: SlotName; version: string },
  teamId: string
): Promise<void> {
  const existingDomains = await getCustomDomains(projectName, environment);

  if (existingDomains.includes(customDomain)) {
    throw new Error(`Domain ${customDomain} already configured for this project`);
  }

  const config: CaddySiteConfig = {
    projectName,
    environment,
    domain: getProjectDomain(projectName, environment),
    activePort: slotInfo.activePort,
    standbyPort: slotInfo.standbyPort,
    activeSlot: slotInfo.activeSlot,
    version: slotInfo.version,
    teamId,
    customDomains: [...existingDomains, customDomain],
  };

  await writeCaddyConfig(config);
}

/**
 * Remove custom domain from project config
 */
export async function removeCustomDomain(
  projectName: string,
  environment: Environment,
  customDomain: string,
  slotInfo: { activePort: number; standbyPort?: number; activeSlot: SlotName; version: string },
  teamId: string
): Promise<void> {
  const existingDomains = await getCustomDomains(projectName, environment);
  const updatedDomains = existingDomains.filter(d => d !== customDomain);

  if (existingDomains.length === updatedDomains.length) {
    throw new Error(`Domain ${customDomain} not found for this project`);
  }

  const config: CaddySiteConfig = {
    projectName,
    environment,
    domain: getProjectDomain(projectName, environment),
    activePort: slotInfo.activePort,
    standbyPort: slotInfo.standbyPort,
    activeSlot: slotInfo.activeSlot,
    version: slotInfo.version,
    teamId,
    customDomains: updatedDomains,
  };

  await writeCaddyConfig(config);
}

/**
 * Get custom domains for a project
 */
export async function getCustomDomains(
  projectName: string,
  environment: Environment
): Promise<string[]> {
  const caddyPath = getCaddyConfigPath(projectName, environment);

  return withLocal(async (local) => {
    try {
      const result = await local.exec(`cat ${caddyPath} 2>/dev/null || echo ""`);
      const content = result.stdout;

      if (!content.trim()) {
        return [];
      }

      // Parse domains from first non-comment line containing {
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.includes('{') && !line.startsWith('#')) {
          const domainPart = line.replace('{', '').trim();
          const domains = domainPart.split(',').map(d => d.trim()).filter(Boolean);
          const baseDomain = getProjectDomain(projectName, environment);
          return domains.filter(d => d !== baseDomain);
        }
      }

      return [];
    } catch {
      return [];
    }
  });
}

/**
 * Delete Caddy configuration file
 */
export async function deleteCaddyConfig(
  projectName: string,
  environment: Environment
): Promise<void> {
  const caddyPath = getCaddyConfigPath(projectName, environment);

  await withLocal(async (local) => {
    // Check if file exists
    const checkResult = await local.exec(`[ -f ${caddyPath} ] && echo "exists" || echo "not_found"`);

    if (checkResult.stdout.trim() === 'not_found') {
      throw new Error(`Caddy config not found for ${projectName}-${environment}`);
    }

    // Backup before delete
    const backupPath = `${caddyPath}.deleted.${Date.now()}`;
    await local.exec(`mv ${caddyPath} ${backupPath}`);

    // Reload Caddy
    await local.exec('systemctl reload caddy');

    logger.info('Caddy config deleted', { projectName, environment });
  });
}

/**
 * List all configured domains
 */
export async function listAllDomains(): Promise<DomainInfo[]> {
  return withLocal(async (local) => {
    const result = await local.exec(`ls -1 ${CADDY_SITES_DIR}/*.caddy 2>/dev/null || echo ""`);
    const files = result.stdout.trim().split('\n').filter(Boolean);

    const domains: DomainInfo[] = [];

    for (const file of files) {
      try {
        const content = await local.exec(`cat ${file}`);
        const info = parseCaddyConfig(content.stdout);
        if (info) {
          domains.push(info);
        }
      } catch {
        // Skip invalid files
      }
    }

    return domains;
  });
}

/**
 * Parse Caddy config file to extract domain info
 */
function parseCaddyConfig(content: string): DomainInfo | null {
  try {
    const lines = content.split('\n');
    let projectName = '';
    let environment: Environment = 'production';
    let version = 'unknown';
    let activeSlot: SlotName = 'blue';
    let activePort = 0;
    let domain = '';

    for (const line of lines) {
      if (line.includes('# Project:')) {
        projectName = line.split(':')[1]?.trim() || '';
      } else if (line.includes('# Environment:')) {
        environment = (line.split(':')[1]?.trim() || 'production') as Environment;
      } else if (line.includes('# Version:')) {
        version = line.split(':')[1]?.trim() || 'unknown';
      } else if (line.includes('# Active Slot:')) {
        const match = line.match(/Active Slot:\s*(\w+)\s*\(port\s*(\d+)\)/);
        if (match) {
          activeSlot = match[1] as SlotName;
          activePort = parseInt(match[2], 10);
        }
      } else if (line.includes('# Generated:')) {
        // Get domain from the line after comments
        continue;
      } else if (line.includes('{') && !line.startsWith('#') && !domain) {
        domain = line.replace('{', '').trim().split(',')[0].trim();
      }
    }

    if (!projectName || !domain) {
      return null;
    }

    return {
      domain,
      projectName,
      environment,
      activePort,
      activeSlot,
      version,
      isCustom: !domain.endsWith(`.${BASE_DOMAIN}`),
      createdAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Caddy Service Operations
// ============================================================================

/**
 * Check Caddy service status
 */
export async function getCaddyStatus(): Promise<{
  running: boolean;
  version: string;
  configValid: boolean;
}> {
  return withLocal(async (local) => {
    const statusResult = await local.exec('systemctl is-active caddy');
    const versionResult = await local.exec('caddy version 2>/dev/null || echo "unknown"');
    const validateResult = await local.exec('caddy validate --config /etc/caddy/Caddyfile 2>&1');

    return {
      running: statusResult.stdout.trim() === 'active',
      version: versionResult.stdout.trim().split(' ')[0] || 'unknown',
      configValid: validateResult.code === 0 || validateResult.stdout.includes('Valid'),
    };
  });
}

/**
 * Force reload Caddy configuration
 */
export async function reloadCaddy(): Promise<void> {
  await withLocal(async (local) => {
    await local.exec('systemctl reload caddy');
  });
}

export { BASE_DOMAIN, SUPPORTED_DOMAINS, APP_SERVER_IP, CADDY_SITES_DIR };
