/**
 * BackupService - ENV backup & restore with DB versioning
 *
 * Refactored from mcp-server/src/tools/env.ts (envRestoreTool)
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
import { EnvService } from './env.service.js';

export interface RestoreResult {
  success: boolean;
  projectName: string;
  environment: string;
  restoredFrom: string;
  keysRestored: number;
  error?: string;
}

export class BackupService {
  private readonly envService: EnvService;

  constructor(
    private readonly projectRepo: typeof ProjectRepo,
    private readonly envRepo: typeof ProjectEnvRepo,
    envService: EnvService,
    private readonly ssh: SSHClientWrapper,
    private readonly logger: LoggerLike,
  ) {
    this.envService = envService;
  }

  // ===========================================================================
  // Create backup
  // ===========================================================================

  async create(
    params: { projectName: string; environment: Environment },
    auth: AuthContext,
  ): Promise<{
    success: boolean;
    projectName: string;
    backupPath: string;
    keysBackedUp: number;
    error?: string;
  }> {
    const { projectName, environment } = params;

    try {
      const envPath = `/opt/codeb/env/${projectName}/.env`;
      const backupDir = `/opt/codeb/env-backup/${projectName}`;
      const timestamp = Date.now();
      const backupPath = `${backupDir}/.env.${timestamp}`;

      const result = await this.ssh.exec(`cat ${envPath} 2>/dev/null || echo ""`);
      if (!result.stdout.trim()) {
        return {
          success: false,
          projectName,
          backupPath: '',
          keysBackedUp: 0,
          error: 'No ENV file found on server',
        };
      }

      // Copy to backup
      await this.ssh.exec(`mkdir -p ${backupDir}`);
      await this.ssh.exec(`cp ${envPath} ${backupPath}`);

      // Also save to DB
      const envData = this.envService.parseEnvContent(result.stdout);
      if (Object.keys(envData).length > 0) {
        await this.envRepo.saveEnv({
          projectName,
          environment,
          envData,
          createdBy: auth.teamId,
        });
      }

      this.logger.info('ENV backup created', { projectName, backupPath });

      return {
        success: true,
        projectName,
        backupPath,
        keysBackedUp: Object.keys(envData).length,
      };
    } catch (error) {
      return {
        success: false,
        projectName,
        backupPath: '',
        keysBackedUp: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ===========================================================================
  // Restore
  // ===========================================================================

  async restore(
    params: {
      projectName: string;
      environment: Environment;
      version: 'master' | 'current';
    },
    auth: AuthContext,
  ): Promise<RestoreResult> {
    const { projectName, environment, version } = params;

    this.logger.info('Restoring ENV', { projectName, environment, version });

    try {
      const project = await this.projectRepo.findByName(projectName);
      if (!project) {
        return {
          success: false,
          projectName,
          environment,
          restoredFrom: '',
          keysRestored: 0,
          error: `Project '${projectName}' not found in DB.`,
        };
      }

      let restoredEnv: Record<string, string> = {};
      let restoredFrom = '';

      if (version === 'current') {
        // Restore from DB
        const dbEnv = await this.envRepo.getEnv(projectName, environment);
        if (dbEnv && Object.keys(dbEnv.envData).length > 0) {
          restoredEnv = dbEnv.envData;
          restoredFrom = `DB v${dbEnv.version}`;
        } else {
          return {
            success: false,
            projectName,
            environment,
            restoredFrom: '',
            keysRestored: 0,
            error: 'No ENV stored in DB.',
          };
        }
      } else {
        // Restore from file backup (master = latest)
        const backupDir = `/opt/codeb/env-backup/${projectName}`;
        const envPath = `/opt/codeb/env/${projectName}/.env`;

        const result = await this.ssh.exec(`ls -t ${backupDir}/.env.* 2>/dev/null | head -1`);
        const backupPath = result.stdout.trim();

        if (!backupPath) {
          return {
            success: false,
            projectName,
            environment,
            restoredFrom: '',
            keysRestored: 0,
            error: 'No backup files found.',
          };
        }

        const contentResult = await this.ssh.exec(`cat ${backupPath}`);
        restoredEnv = this.envService.parseEnvContent(contentResult.stdout);
        restoredFrom = backupPath;

        // Write to current ENV file
        await this.ssh.exec(`mkdir -p /opt/codeb/env/${projectName}`);
        const base64Content = Buffer.from(contentResult.stdout).toString('base64');
        await this.ssh.exec(`echo "${base64Content}" | base64 -d > ${envPath}`);
        await this.ssh.exec(`chmod 600 ${envPath}`);

        const timestamp = Date.now();
        await this.ssh.exec(`cp ${envPath} ${backupDir}/.env.${timestamp}`);
      }

      // Save to DB SSOT
      if (Object.keys(restoredEnv).length > 0) {
        await this.envRepo.saveEnv({
          projectName,
          environment,
          envData: restoredEnv,
          createdBy: auth.teamId,
        });
      }

      this.logger.info('ENV restored', {
        projectName,
        environment,
        restoredFrom,
        keysRestored: Object.keys(restoredEnv).length,
      });

      return {
        success: true,
        projectName,
        environment,
        restoredFrom,
        keysRestored: Object.keys(restoredEnv).length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('ENV restore failed', { projectName, error: errorMessage });
      return {
        success: false,
        projectName,
        environment,
        restoredFrom: '',
        keysRestored: 0,
        error: errorMessage,
      };
    }
  }

  // ===========================================================================
  // List Versions
  // ===========================================================================

  async listVersions(
    params: { projectName: string },
  ): Promise<{
    success: boolean;
    backups: string[];
    error?: string;
  }> {
    const { projectName } = params;

    try {
      const backupDir = `/opt/codeb/env-backup/${projectName}`;
      const result = await this.ssh.exec(
        `ls -t ${backupDir}/.env.* 2>/dev/null | head -20 || true`,
      );
      const backups = result.stdout.trim().split('\n').filter(Boolean);

      return { success: true, backups };
    } catch (error) {
      return {
        success: false,
        backups: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
