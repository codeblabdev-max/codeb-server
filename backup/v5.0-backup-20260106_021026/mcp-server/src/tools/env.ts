/**
 * CodeB v5.0 - ENV Management Tool
 * Master/Current/History backup system
 */

import { z } from 'zod';
import type { Environment } from '../lib/types.js';
import { getSSHClient } from '../lib/ssh.js';
import { SERVERS } from '../lib/servers.js';

// ============================================================================
// Types
// ============================================================================

export interface EnvGetInput {
  projectName: string;
  environment: Environment;
  key?: string;
}

export interface EnvSetInput {
  projectName: string;
  environment: Environment;
  key: string;
  value: string;
}

export interface EnvRestoreInput {
  projectName: string;
  environment: Environment;
  version: 'master' | 'current' | string; // string = timestamp
}

export interface EnvHistoryInput {
  projectName: string;
  environment: Environment;
  limit?: number;
}

export interface EnvResult {
  success: boolean;
  data?: Record<string, string> | string[];
  error?: string;
}

// ============================================================================
// Paths
// ============================================================================

const BACKUP_SERVER = SERVERS.backup;
const ENV_BACKUP_BASE = '/opt/codeb/env-backup';
const APP_SERVER = SERVERS.app;
const ENV_APP_BASE = '/opt/codeb/projects';

function getBackupPath(projectName: string, environment: string): string {
  return `${ENV_BACKUP_BASE}/${projectName}/${environment}`;
}

function getAppEnvPath(projectName: string, environment: string): string {
  return `${ENV_APP_BASE}/${projectName}/.env.${environment}`;
}

// ============================================================================
// Input Schemas
// ============================================================================

export const envGetInputSchema = z.object({
  projectName: z.string().describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).describe('Environment'),
  key: z.string().optional().describe('Specific key to get (optional, returns all if omitted)'),
});

export const envSetInputSchema = z.object({
  projectName: z.string().describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).describe('Environment'),
  key: z.string().describe('Environment variable key'),
  value: z.string().describe('Environment variable value'),
});

export const envRestoreInputSchema = z.object({
  projectName: z.string().describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).describe('Environment'),
  version: z.string().describe('Version to restore: "master", "current", or timestamp'),
});

export const envHistoryInputSchema = z.object({
  projectName: z.string().describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).describe('Environment'),
  limit: z.number().optional().describe('Number of history entries to return'),
});

// ============================================================================
// ENV Get
// ============================================================================

export async function executeEnvGet(input: EnvGetInput): Promise<EnvResult> {
  const { projectName, environment, key } = input;
  const ssh = getSSHClient();

  try {
    await ssh.connect();

    const envPath = getAppEnvPath(projectName, environment);
    const result = await ssh.exec(`cat ${envPath} 2>/dev/null || echo ""`);

    if (!result.stdout.trim()) {
      return {
        success: false,
        error: `ENV file not found: ${envPath}`,
      };
    }

    const envVars = parseEnvFile(result.stdout);

    if (key) {
      if (envVars[key] !== undefined) {
        return {
          success: true,
          data: { [key]: envVars[key] },
        };
      }
      return {
        success: false,
        error: `Key not found: ${key}`,
      };
    }

    return {
      success: true,
      data: envVars,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// ENV Set
// ============================================================================

export async function executeEnvSet(input: EnvSetInput): Promise<EnvResult> {
  const { projectName, environment, key, value } = input;
  const ssh = getSSHClient();
  const backupSsh = getSSHClient(BACKUP_SERVER.ip);

  try {
    await ssh.connect();
    await backupSsh.connect();

    const envPath = getAppEnvPath(projectName, environment);
    const backupPath = getBackupPath(projectName, environment);

    // Step 1: Read current ENV
    const currentResult = await ssh.exec(`cat ${envPath} 2>/dev/null || echo ""`);
    const currentVars = parseEnvFile(currentResult.stdout);

    // Step 2: Update variable
    currentVars[key] = value;

    // Step 3: Generate new ENV content
    const newContent = generateEnvFile(currentVars);

    // Step 4: Backup to backup server with timestamp
    const timestamp = new Date().toISOString();
    await backupSsh.exec(`mkdir -p ${backupPath}`);
    await backupSsh.writeFile(`${backupPath}/${timestamp}.env`, newContent);
    await backupSsh.writeFile(`${backupPath}/current.env`, newContent);

    // Check if master.env exists, create if first time
    const masterExists = await backupSsh.exec(`test -f ${backupPath}/master.env && echo "yes" || echo "no"`);
    if (masterExists.stdout.trim() === 'no') {
      await backupSsh.writeFile(`${backupPath}/master.env`, newContent);
    }

    // Step 5: Write to app server
    await ssh.writeFile(envPath, newContent);

    return {
      success: true,
      data: { [key]: value },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    ssh.disconnect();
    backupSsh.disconnect();
  }
}

// ============================================================================
// ENV Restore
// ============================================================================

export async function executeEnvRestore(input: EnvRestoreInput): Promise<EnvResult> {
  const { projectName, environment, version } = input;
  const ssh = getSSHClient();
  const backupSsh = getSSHClient(BACKUP_SERVER.ip);

  try {
    await ssh.connect();
    await backupSsh.connect();

    const backupPath = getBackupPath(projectName, environment);
    const envPath = getAppEnvPath(projectName, environment);

    // Determine which backup file to restore
    let backupFile: string;
    if (version === 'master') {
      backupFile = `${backupPath}/master.env`;
    } else if (version === 'current') {
      backupFile = `${backupPath}/current.env`;
    } else {
      backupFile = `${backupPath}/${version}.env`;
    }

    // Step 1: Read backup from backup server
    const backupResult = await backupSsh.exec(`cat ${backupFile} 2>/dev/null || echo ""`);

    if (!backupResult.stdout.trim()) {
      return {
        success: false,
        error: `Backup not found: ${backupFile}`,
      };
    }

    const content = backupResult.stdout;

    // Step 2: Create new backup before restore (safety)
    const timestamp = new Date().toISOString();
    const currentResult = await ssh.exec(`cat ${envPath} 2>/dev/null || echo ""`);
    if (currentResult.stdout.trim()) {
      await backupSsh.writeFile(`${backupPath}/pre-restore-${timestamp}.env`, currentResult.stdout);
    }

    // Step 3: Write restored content to app server
    await ssh.writeFile(envPath, content);

    // Step 4: Update current.env on backup server
    await backupSsh.writeFile(`${backupPath}/current.env`, content);

    return {
      success: true,
      data: parseEnvFile(content),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    ssh.disconnect();
    backupSsh.disconnect();
  }
}

// ============================================================================
// ENV History
// ============================================================================

export async function executeEnvHistory(input: EnvHistoryInput): Promise<EnvResult> {
  const { projectName, environment, limit = 20 } = input;
  const backupSsh = getSSHClient(BACKUP_SERVER.ip);

  try {
    await backupSsh.connect();

    const backupPath = getBackupPath(projectName, environment);

    // List all backup files sorted by date
    const result = await backupSsh.exec(
      `ls -1t ${backupPath}/*.env 2>/dev/null | head -${limit}`
    );

    if (!result.stdout.trim()) {
      return {
        success: false,
        error: `No backups found for ${projectName}/${environment}`,
      };
    }

    const files = result.stdout
      .trim()
      .split('\n')
      .map(f => f.replace(`${backupPath}/`, '').replace('.env', ''));

    return {
      success: true,
      data: files,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    backupSsh.disconnect();
  }
}

// ============================================================================
// Auto-Generate ENV
// ============================================================================

export interface EnvAutoGenerateInput {
  projectName: string;
  environment: Environment;
  options?: {
    database?: boolean;
    redis?: boolean;
    centrifugo?: boolean;
  };
}

export async function executeEnvAutoGenerate(input: EnvAutoGenerateInput): Promise<EnvResult> {
  const { projectName, environment, options = {} } = input;
  const { database = true, redis = true, centrifugo = true } = options;

  const ssh = getSSHClient();
  const backupSsh = getSSHClient(BACKUP_SERVER.ip);

  try {
    await ssh.connect();
    await backupSsh.connect();

    const envPath = getAppEnvPath(projectName, environment);
    const backupPath = getBackupPath(projectName, environment);

    // Check if already exists
    const existsResult = await ssh.exec(`test -f ${envPath} && echo "yes" || echo "no"`);
    if (existsResult.stdout.trim() === 'yes') {
      return {
        success: false,
        error: `ENV file already exists: ${envPath}. Use 'we env set' to modify.`,
      };
    }

    // Generate ENV content
    const envVars: Record<string, string> = {
      NODE_ENV: 'production',
      PORT: '3000',
    };

    if (database) {
      const dbName = `${projectName}_${environment}`;
      const dbUser = `${projectName}_user`;
      const dbPassword = generateSecurePassword();
      envVars.DATABASE_URL = `postgresql://${dbUser}:${dbPassword}@${SERVERS.storage.domain}:5432/${dbName}?schema=public`;
    }

    if (redis) {
      const redisPassword = generateSecurePassword();
      const redisDb = await allocateRedisDb(environment);
      envVars.REDIS_URL = `redis://:${redisPassword}@${SERVERS.storage.domain}:6379/${redisDb}`;
      envVars.REDIS_PREFIX = `${projectName}:`;
    }

    if (centrifugo) {
      envVars.CENTRIFUGO_URL = `wss://${SERVERS.streaming.domain}/connection/websocket`;
      envVars.CENTRIFUGO_API_URL = `http://${SERVERS.streaming.domain}:8000/api`;
      envVars.CENTRIFUGO_API_KEY = generateSecurePassword(32);
      envVars.CENTRIFUGO_SECRET = generateSecurePassword(32);
    }

    const content = generateEnvFile(envVars);

    // Create directories
    await ssh.exec(`mkdir -p ${ENV_APP_BASE}/${projectName}`);
    await backupSsh.exec(`mkdir -p ${backupPath}`);

    // Write to app server
    await ssh.writeFile(envPath, content);

    // Write to backup server (master + current)
    await backupSsh.writeFile(`${backupPath}/master.env`, content);
    await backupSsh.writeFile(`${backupPath}/current.env`, content);

    return {
      success: true,
      data: envVars,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    ssh.disconnect();
    backupSsh.disconnect();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex);
    let value = trimmed.substring(eqIndex + 1);

    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function generateEnvFile(vars: Record<string, string>): string {
  const lines = [
    '# CodeB v5.0 - Auto-generated ENV',
    `# Generated: ${new Date().toISOString()}`,
    '',
  ];

  for (const [key, value] of Object.entries(vars)) {
    // Quote values with special characters
    if (value.includes(' ') || value.includes('=') || value.includes('#')) {
      lines.push(`${key}="${value}"`);
    } else {
      lines.push(`${key}=${value}`);
    }
  }

  return lines.join('\n') + '\n';
}

function generateSecurePassword(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function allocateRedisDb(environment: string): Promise<number> {
  // Simple allocation based on environment
  const base = {
    staging: 0,
    production: 10,
    preview: 20,
  };
  return base[environment as keyof typeof base] || 0;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const envGetTool = {
  name: 'env_get',
  description: 'Get environment variables for a project',
  inputSchema: envGetInputSchema,
  execute: executeEnvGet,
};

export const envSetTool = {
  name: 'env_set',
  description: 'Set an environment variable (auto-backs up to backup server)',
  inputSchema: envSetInputSchema,
  execute: executeEnvSet,
};

export const envRestoreTool = {
  name: 'env_restore',
  description: 'Restore ENV from backup (master, current, or specific timestamp)',
  inputSchema: envRestoreInputSchema,
  execute: executeEnvRestore,
};

export const envHistoryTool = {
  name: 'env_history',
  description: 'List ENV backup history',
  inputSchema: envHistoryInputSchema,
  execute: executeEnvHistory,
};
