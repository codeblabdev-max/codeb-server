/**
 * SyncService - Local <-> Server ENV synchronization
 *
 * Refactored from mcp-server/src/tools/env.ts (envSyncTool)
 */

import type { SSHClientWrapper } from '@codeb/ssh';
import type { Environment, AuthContext } from '@codeb/shared';

interface LoggerLike {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  log(level: string, message: string, meta?: Record<string, unknown>): void;
}
import { EnvService } from './env.service.js';

export interface SyncResult {
  success: boolean;
  projectName: string;
  environment: string;
  variablesSet: number;
  variablesUpdated: number;
  variablesUnchanged: number;
  path: string;
  error?: string;
}

export class SyncService {
  private readonly envService: EnvService;

  constructor(
    envService: EnvService,
    private readonly ssh: SSHClientWrapper,
    private readonly logger: LoggerLike,
  ) {
    this.envService = envService;
  }

  // ===========================================================================
  // Push (local -> server)
  // ===========================================================================

  async push(
    params: {
      projectName: string;
      environment: Environment;
      envContent: string;
      merge?: boolean;
    },
    _auth: AuthContext,
  ): Promise<SyncResult> {
    const { projectName, environment, envContent, merge = true } = params;
    const envPath = `/opt/codeb/projects/${projectName}/.env.${environment}`;

    try {
      const newVars = this.envService.parseEnvContent(envContent);
      const newVarCount = Object.keys(newVars).length;

      if (newVarCount === 0) {
        return {
          success: false,
          projectName,
          environment,
          variablesSet: 0,
          variablesUpdated: 0,
          variablesUnchanged: 0,
          path: envPath,
          error: 'No valid environment variables found in content',
        };
      }

      let existingVars: Record<string, string> = {};
      let updated = 0;
      let unchanged = 0;

      if (merge) {
        try {
          const result = await this.ssh.exec(`cat ${envPath} 2>/dev/null || echo ""`);
          if (result.stdout) {
            existingVars = this.envService.parseEnvContent(result.stdout);
          }
        } catch {
          // No existing file
        }

        for (const [key, value] of Object.entries(newVars)) {
          if (existingVars[key] === value) {
            unchanged++;
          } else if (existingVars[key] !== undefined) {
            updated++;
          }
        }
      }

      const finalVars = merge ? { ...existingVars, ...newVars } : newVars;
      const finalContent = this.formatEnvContent(finalVars);

      // Save to server
      await this.ssh.exec(`mkdir -p /opt/codeb/projects/${projectName}`);
      await this.ssh.exec(
        `if [ -f ${envPath} ]; then cp ${envPath} ${envPath}.backup.$(date +%Y%m%d%H%M%S); fi`,
      );

      const base64Content = Buffer.from(finalContent).toString('base64');
      await this.ssh.exec(`echo "${base64Content}" | base64 -d > ${envPath}`);
      await this.ssh.exec(`chmod 600 ${envPath}`);

      const variablesSet = newVarCount - updated - unchanged;

      return {
        success: true,
        projectName,
        environment,
        variablesSet,
        variablesUpdated: updated,
        variablesUnchanged: unchanged,
        path: envPath,
      };
    } catch (error) {
      return {
        success: false,
        projectName,
        environment,
        variablesSet: 0,
        variablesUpdated: 0,
        variablesUnchanged: 0,
        path: envPath,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===========================================================================
  // Pull (server -> local content)
  // ===========================================================================

  async pull(
    params: { projectName: string; environment: Environment },
    _auth: AuthContext,
  ): Promise<{
    success: boolean;
    projectName: string;
    environment: string;
    content: string;
    variableCount: number;
    error?: string;
  }> {
    const { projectName, environment } = params;
    const envPath = `/opt/codeb/projects/${projectName}/.env.${environment}`;

    try {
      const result = await this.ssh.exec(`cat ${envPath} 2>/dev/null || echo ""`);
      const content = result.stdout;
      const variables = this.envService.parseEnvContent(content);

      return {
        success: true,
        projectName,
        environment,
        content,
        variableCount: Object.keys(variables).length,
      };
    } catch (error) {
      return {
        success: false,
        projectName,
        environment,
        content: '',
        variableCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

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
}
