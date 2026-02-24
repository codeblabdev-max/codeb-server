/**
 * EnvService - Environment variable reading, scanning, comparison
 *
 * Refactored from mcp-server/src/tools/env.ts (envGetTool, envScanTool)
 */

import type { ProjectRepo, ProjectEnvRepo } from '@codeb/db';
import type { SSHClientWrapper } from '@codeb/ssh';
import type { Environment, AuthContext } from '@codeb/shared';

interface LoggerLike {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  log(level: string, message: string, meta?: Record<string, unknown>): void;
}

const APP_SERVER_IP = '158.247.203.55';

export interface EnvGetResult {
  success: boolean;
  projectName: string;
  environment: string;
  variables: Record<string, string>;
  path: string;
  error?: string;
}

export interface EnvDiff {
  key: string;
  localValue?: string;
  serverValue?: string;
  status: 'added' | 'removed' | 'changed' | 'same';
}

export interface EnvScanResult {
  success: boolean;
  projectName: string;
  environment: string;
  differences: EnvDiff[];
  summary: {
    total: number;
    added: number;
    removed: number;
    changed: number;
    same: number;
  };
  serverBackups?: string[];
  teamProjects?: string[];
  error?: string;
}

export class EnvService {
  constructor(
    private readonly projectRepo: typeof ProjectRepo,
    private readonly envRepo: typeof ProjectEnvRepo,
    private readonly ssh: SSHClientWrapper,
    private readonly logger: LoggerLike,
  ) {}

  // ===========================================================================
  // Get (masked)
  // ===========================================================================

  async get(
    params: { projectName: string; environment: Environment },
    _auth: AuthContext,
  ): Promise<EnvGetResult> {
    const { projectName, environment } = params;
    const envPath = `/opt/codeb/projects/${projectName}/.env.${environment}`;

    try {
      const result = await this.ssh.exec(`cat ${envPath} 2>/dev/null || echo ""`);
      const variables = this.parseEnvContent(result.stdout);

      // Mask sensitive values
      const maskedVariables: Record<string, string> = {};
      for (const [key, value] of Object.entries(variables)) {
        const isSensitive = /SECRET|PASSWORD|KEY|TOKEN|CREDENTIAL/i.test(key);
        maskedVariables[key] = isSensitive
          ? `${value.slice(0, 4)}****${value.slice(-4)}`
          : value;
      }

      return {
        success: true,
        projectName,
        environment,
        variables: maskedVariables,
        path: envPath,
      };
    } catch (error) {
      return {
        success: false,
        projectName,
        environment,
        variables: {},
        path: envPath,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===========================================================================
  // Set (individual key)
  // ===========================================================================

  async set(
    params: { projectName: string; environment: Environment; key: string; value: string },
    _auth: AuthContext,
  ): Promise<{ success: boolean; error?: string }> {
    const { projectName, environment, key, value } = params;
    const envPath = `/opt/codeb/projects/${projectName}/.env.${environment}`;

    try {
      // Read existing
      const result = await this.ssh.exec(`cat ${envPath} 2>/dev/null || echo ""`);
      const existing = this.parseEnvContent(result.stdout);

      // Set key
      existing[key] = value;

      // Write back
      const content = this.formatEnvContent(existing);
      const base64 = Buffer.from(content).toString('base64');
      await this.ssh.exec(`mkdir -p /opt/codeb/projects/${projectName}`);
      await this.ssh.exec(`echo "${base64}" | base64 -d > ${envPath}`);
      await this.ssh.exec(`chmod 600 ${envPath}`);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ===========================================================================
  // Scan (compare local vs server)
  // ===========================================================================

  async scan(
    params: { projectName: string; environment: Environment; localEnvContent?: string },
    auth: AuthContext,
  ): Promise<EnvScanResult> {
    const { projectName, environment, localEnvContent } = params;

    this.logger.info('Scanning ENV differences', { projectName, environment });

    try {
      const project = await this.projectRepo.findByName(projectName);
      let teamProjects: string[] = [];

      if (!project) {
        try {
          const allTeamProjects = await this.projectRepo.findByTeam(auth.teamId);
          teamProjects = allTeamProjects.map((p: any) => p.name);
        } catch {
          // ignore
        }

        return {
          success: false,
          projectName,
          environment,
          differences: [],
          summary: { total: 0, added: 0, removed: 0, changed: 0, same: 0 },
          teamProjects: teamProjects.length > 0 ? teamProjects : undefined,
          error: `Project '${projectName}' not found in DB.${teamProjects.length > 0 ? ` Team projects: ${teamProjects.join(', ')}` : ''}`,
        };
      }

      // Get server ENV
      let serverEnv: Record<string, string> = {};
      let serverBackups: string[] = [];

      const dbEnv = await this.envRepo.getEnv(projectName, environment);
      if (dbEnv && Object.keys(dbEnv.envData).length > 0) {
        serverEnv = dbEnv.envData;
      } else {
        const envPath = `/opt/codeb/env/${projectName}/.env`;
        try {
          const result = await this.ssh.exec(`cat ${envPath} 2>/dev/null || echo ""`);
          if (result.stdout.trim()) {
            serverEnv = this.parseEnvContent(result.stdout);
          }
        } catch {
          // No server ENV file
        }

        try {
          const backupDir = `/opt/codeb/env-backup/${projectName}`;
          const result = await this.ssh.exec(
            `ls -t ${backupDir}/.env.* 2>/dev/null | head -10 || true`,
          );
          serverBackups = result.stdout.trim().split('\n').filter(Boolean);
        } catch {
          // No backups
        }
      }

      const localEnv = localEnvContent ? this.parseEnvContent(localEnvContent) : {};
      const differences = this.compareEnvs(localEnv, serverEnv);

      const summary = {
        total: differences.length,
        added: differences.filter((d) => d.status === 'added').length,
        removed: differences.filter((d) => d.status === 'removed').length,
        changed: differences.filter((d) => d.status === 'changed').length,
        same: differences.filter((d) => d.status === 'same').length,
      };

      this.logger.info('ENV scan completed', { projectName, environment, summary });

      return {
        success: true,
        projectName,
        environment,
        differences,
        summary,
        serverBackups: serverBackups.length > 0 ? serverBackups : undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('ENV scan failed', { projectName, error: errorMessage });
      return {
        success: false,
        projectName,
        environment,
        differences: [],
        summary: { total: 0, added: 0, removed: 0, changed: 0, same: 0 },
        error: errorMessage,
      };
    }
  }

  // ===========================================================================
  // Compare helper
  // ===========================================================================

  compare(
    localEnv: Record<string, string>,
    serverEnv: Record<string, string>,
  ): EnvDiff[] {
    return this.compareEnvs(localEnv, serverEnv);
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  parseEnvContent(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const equalIndex = trimmed.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmed.slice(0, equalIndex).trim();
        let value = trimmed.slice(equalIndex + 1).trim();

        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          result[key] = value;
        }
      }
    }

    return result;
  }

  private formatEnvContent(vars: Record<string, string>): string {
    const lines: string[] = [
      '# CodeB v8.0 - Environment Variables',
      `# Updated: ${new Date().toISOString()}`,
      '',
    ];

    const sortedKeys = Object.keys(vars).sort();
    for (const key of sortedKeys) {
      const value = vars[key];
      if (value.includes(' ') || value.includes('=') || value.includes('#')) {
        lines.push(`${key}="${value}"`);
      } else {
        lines.push(`${key}=${value}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  private maskValue(value: string | undefined): string {
    if (!value) return '(none)';
    if (value.length <= 8) return '****';
    return value.slice(0, 4) + '****' + value.slice(-4);
  }

  private compareEnvs(
    localEnv: Record<string, string>,
    serverEnv: Record<string, string>,
  ): EnvDiff[] {
    const diffs: EnvDiff[] = [];
    const allKeys = new Set([...Object.keys(localEnv), ...Object.keys(serverEnv)]);

    for (const key of allKeys) {
      const localValue = localEnv[key];
      const serverValue = serverEnv[key];

      if (localValue !== undefined && serverValue === undefined) {
        diffs.push({ key, localValue: this.maskValue(localValue), status: 'added' });
      } else if (localValue === undefined && serverValue !== undefined) {
        diffs.push({ key, serverValue: this.maskValue(serverValue), status: 'removed' });
      } else if (localValue !== serverValue) {
        diffs.push({
          key,
          localValue: this.maskValue(localValue),
          serverValue: this.maskValue(serverValue),
          status: 'changed',
        });
      } else {
        diffs.push({
          key,
          localValue: this.maskValue(localValue),
          serverValue: this.maskValue(serverValue),
          status: 'same',
        });
      }
    }

    const statusOrder = { changed: 0, added: 1, removed: 2, same: 3 };
    diffs.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

    return diffs;
  }
}
