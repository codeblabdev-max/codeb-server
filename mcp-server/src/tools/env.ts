/**
 * CodeB v9.0 - Environment Variables Management Tools
 *
 * Vercel 스타일 환경변수 관리:
 * - env_sync: 로컬 .env를 서버로 동기화
 * - env_get: 서버 ENV 조회 (마스킹)
 * - env_scan: 로컬 vs 서버 ENV 비교 (v7.0.62)
 * - env_restore: 백업에서 ENV 복원 (v7.0.62)
 */

import { z } from 'zod';
import type { AuthContext, Environment } from '../lib/types.js';
import { withLocal } from '../lib/local-exec.js';
import { ProjectRepo, ProjectEnvRepo } from '../lib/database.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// Input Schema
// ============================================================================

export const envSyncInputSchema = z.object({
  projectName: z.string().min(1).max(50),
  environment: z.enum(['staging', 'production']).default('production'),
  content: z.string().min(1).optional(),      // MCP 파라미터명 (content)
  envContent: z.string().min(1).optional(),    // 레거시 파라미터명
  merge: z.boolean().default(true), // true: 기존 값과 병합, false: 덮어쓰기
}).refine(data => !!(data.content || data.envContent), {
  message: 'content 또는 envContent 필수',
});

export const envGetInputSchema = z.object({
  projectName: z.string().min(1).max(50),
  environment: z.enum(['staging', 'production']).default('production'),
});

// ============================================================================
// Types
// ============================================================================

interface EnvSyncResult {
  success: boolean;
  projectName: string;
  environment: string;
  variablesSet: number;
  variablesUpdated: number;
  variablesUnchanged: number;
  path: string;
  error?: string;
}

interface EnvGetResult {
  success: boolean;
  projectName: string;
  environment: string;
  variables: Record<string, string>;
  path: string;
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * .env 파일 내용을 파싱하여 key=value 객체로 변환
 */
function parseEnvContent(content: string | undefined | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!content) return result;
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // 빈 줄이나 주석은 건너뜀
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // key=value 파싱
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex > 0) {
      const key = trimmed.slice(0, equalIndex).trim();
      let value = trimmed.slice(equalIndex + 1).trim();

      // 따옴표 제거
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // 유효한 키만 저장
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * 객체를 .env 파일 형식으로 변환
 */
function formatEnvContent(vars: Record<string, string>): string {
  const lines: string[] = [
    '# CodeB v9.0 - Environment Variables',
    `# Updated: ${new Date().toISOString()}`,
    '',
  ];

  // 키를 알파벳 순으로 정렬
  const sortedKeys = Object.keys(vars).sort();

  for (const key of sortedKeys) {
    const value = vars[key];
    // 특수문자가 있으면 따옴표로 감싸기
    if (value.includes(' ') || value.includes('=') || value.includes('#')) {
      lines.push(`${key}="${value}"`);
    } else {
      lines.push(`${key}=${value}`);
    }
  }

  return lines.join('\n') + '\n';
}

// ============================================================================
// env_sync Tool
// ============================================================================

export const envSyncTool = {
  name: 'env_sync',
  description: 'Sync environment variables from local .env file to server',
  inputSchema: envSyncInputSchema,

  async execute(
    params: z.infer<typeof envSyncInputSchema>,
    _auth: AuthContext
  ): Promise<EnvSyncResult> {
    const { projectName, environment, merge } = params;
    // MCP는 'content', 레거시는 'envContent' 파라미터 사용
    const envContent = params.content || params.envContent || '';
    const envPath = `/opt/codeb/projects/${projectName}/.env.${environment}`;

    try {
      // 1. 새로운 환경변수 파싱
      const newVars = parseEnvContent(envContent);
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

      // 2. 서버에서 기존 환경변수 읽기 (merge 모드일 때)
      let existingVars: Record<string, string> = {};
      let updated = 0;
      let unchanged = 0;

      if (merge) {
        const existingContent = await withLocal(async (local) => {
          try {
            const result = await local.exec(`cat ${envPath} 2>/dev/null || echo ""`);
            return result.stdout;
          } catch {
            return '';
          }
        });

        if (existingContent) {
          existingVars = parseEnvContent(existingContent);
        }

        // 변경 사항 계산
        for (const [key, value] of Object.entries(newVars)) {
          if (existingVars[key] === value) {
            unchanged++;
          } else if (existingVars[key] !== undefined) {
            updated++;
          }
        }
      }

      // 3. 환경변수 병합
      const finalVars = merge
        ? { ...existingVars, ...newVars }
        : newVars;

      const finalContent = formatEnvContent(finalVars);

      // 4. 서버에 저장
      await withLocal(async (local) => {
        // 디렉토리 생성
        await local.exec(`mkdir -p /opt/codeb/projects/${projectName}`);

        // 백업 (기존 파일이 있으면)
        await local.exec(`
          if [ -f ${envPath} ]; then
            cp ${envPath} ${envPath}.backup.$(date +%Y%m%d%H%M%S)
          fi
        `);

        // 새 파일 저장 (base64로 안전하게 전송)
        const base64Content = Buffer.from(finalContent).toString('base64');
        await local.exec(`echo "${base64Content}" | base64 -d > ${envPath}`);

        // 권한 설정
        await local.exec(`chmod 600 ${envPath}`);
      });

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
  },
};

// ============================================================================
// env_get Tool
// ============================================================================

export const envGetTool = {
  name: 'env_get',
  description: 'Get environment variables from server (values masked)',
  inputSchema: envGetInputSchema,

  async execute(
    params: z.infer<typeof envGetInputSchema>,
    _auth: AuthContext
  ): Promise<EnvGetResult> {
    const { projectName, environment } = params;
    const envPath = `/opt/codeb/projects/${projectName}/.env.${environment}`;

    try {
      const content = await withLocal(async (local) => {
        const result = await local.exec(`cat ${envPath} 2>/dev/null || echo ""`);
        return result.stdout;
      });

      const variables = parseEnvContent(content);

      // 민감한 값 마스킹 (SECRET, PASSWORD, KEY, TOKEN 포함)
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
  },
};

// ============================================================================
// env_scan Tool (v7.0.62) - 로컬 vs 서버 ENV 비교
// ============================================================================

export const envScanInputSchema = z.object({
  projectName: z.string().min(1).max(50),
  environment: z.enum(['staging', 'production']).default('production'),
  localEnvContent: z.string().optional(), // 로컬 .env 내용 (없으면 서버만 조회)
});

interface EnvDiff {
  key: string;
  localValue?: string;
  serverValue?: string;
  status: 'added' | 'removed' | 'changed' | 'same';
}

interface EnvScanResult {
  success: boolean;
  projectName: string;
  environment: string;
  differences: EnvDiff[];
  summary: {
    total: number;
    added: number;    // 로컬에만 있음
    removed: number;  // 서버에만 있음
    changed: number;  // 값이 다름
    same: number;     // 동일
  };
  serverBackups?: string[];
  teamProjects?: string[];
  error?: string;
}

function maskValue(value: string | undefined): string {
  if (!value) return '(없음)';
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

function compareEnvs(
  localEnv: Record<string, string>,
  serverEnv: Record<string, string>
): EnvDiff[] {
  const diffs: EnvDiff[] = [];
  const allKeys = new Set([...Object.keys(localEnv), ...Object.keys(serverEnv)]);

  for (const key of allKeys) {
    const localValue = localEnv[key];
    const serverValue = serverEnv[key];

    if (localValue !== undefined && serverValue === undefined) {
      diffs.push({ key, localValue: maskValue(localValue), status: 'added' });
    } else if (localValue === undefined && serverValue !== undefined) {
      diffs.push({ key, serverValue: maskValue(serverValue), status: 'removed' });
    } else if (localValue !== serverValue) {
      diffs.push({ key, localValue: maskValue(localValue), serverValue: maskValue(serverValue), status: 'changed' });
    } else {
      diffs.push({ key, localValue: maskValue(localValue), serverValue: maskValue(serverValue), status: 'same' });
    }
  }

  // Sort: changed first, then added, removed, same
  const statusOrder = { changed: 0, added: 1, removed: 2, same: 3 };
  diffs.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  return diffs;
}

export const envScanTool = {
  name: 'env_scan',
  description: 'Compare local .env with server ENV variables and list backups',
  inputSchema: envScanInputSchema,

  async execute(
    params: z.infer<typeof envScanInputSchema>,
    auth: AuthContext
  ): Promise<EnvScanResult> {
    const { projectName, environment, localEnvContent } = params;

    logger.info('Scanning ENV differences', { projectName, environment });

    try {
      // Check if project exists
      const project = await ProjectRepo.findByName(projectName);
      let teamProjects: string[] = [];

      if (!project) {
        // Get team projects for suggestion
        try {
          const allTeamProjects = await ProjectRepo.findByTeam(auth.teamId);
          teamProjects = allTeamProjects.map(p => p.name);
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
          error: `프로젝트 '${projectName}'가 DB에 등록되지 않았습니다.${teamProjects.length > 0 ? ` 팀 프로젝트: ${teamProjects.join(', ')}` : ''}`,
        };
      }

      // Get server ENV
      let serverEnv: Record<string, string> = {};
      let serverBackups: string[] = [];

      // 1. Try DB SSOT first
      const dbEnv = await ProjectEnvRepo.findByProject(projectName, environment);
      if (dbEnv && Object.keys(dbEnv.env_data).length > 0) {
        serverEnv = dbEnv.env_data;
      } else {
        // 2. Fallback to file on server
        await withLocal(async (local) => {
          const envPath = `/opt/codeb/env/${projectName}/.env`;
          try {
            const result = await local.exec(`cat ${envPath} 2>/dev/null || echo ""`);
            if (result.stdout.trim()) {
              serverEnv = parseEnvContent(result.stdout);
            }
          } catch {
            // No server ENV file
          }

          // Get backup list
          try {
            const backupDir = `/opt/codeb/env-backup/${projectName}`;
            const result = await local.exec(`ls -t ${backupDir}/.env.* 2>/dev/null | head -10 || true`);
            serverBackups = result.stdout.trim().split('\n').filter(Boolean);
          } catch {
            // No backups
          }
        });
      }

      // Parse local ENV
      const localEnv = localEnvContent ? parseEnvContent(localEnvContent) : {};

      // Compare
      const differences = compareEnvs(localEnv, serverEnv);

      // Calculate summary
      const summary = {
        total: differences.length,
        added: differences.filter(d => d.status === 'added').length,
        removed: differences.filter(d => d.status === 'removed').length,
        changed: differences.filter(d => d.status === 'changed').length,
        same: differences.filter(d => d.status === 'same').length,
      };

      logger.info('ENV scan completed', { projectName, environment, summary });

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
      logger.error('ENV scan failed', { projectName, error: errorMessage });
      return {
        success: false,
        projectName,
        environment,
        differences: [],
        summary: { total: 0, added: 0, removed: 0, changed: 0, same: 0 },
        error: errorMessage,
      };
    }
  },
};

// ============================================================================
// env_restore Tool (v7.0.62) - 백업에서 ENV 복원
// ============================================================================

export const envRestoreInputSchema = z.object({
  projectName: z.string().min(1).max(50),
  environment: z.enum(['staging', 'production']).default('production'),
  version: z.enum(['master', 'current']).default('master'), // master=최신백업, current=DB
});

export const envRestoreTool = {
  name: 'env_restore',
  description: 'Restore ENV from backup (master=latest backup, current=DB)',
  inputSchema: envRestoreInputSchema,

  async execute(
    params: z.infer<typeof envRestoreInputSchema>,
    auth: AuthContext
  ): Promise<{
    success: boolean;
    projectName: string;
    environment: string;
    restoredFrom: string;
    keysRestored: number;
    error?: string;
  }> {
    const { projectName, environment, version } = params;

    logger.info('Restoring ENV', { projectName, environment, version });

    try {
      // Check if project exists
      const project = await ProjectRepo.findByName(projectName);
      if (!project) {
        return {
          success: false,
          projectName,
          environment,
          restoredFrom: '',
          keysRestored: 0,
          error: `프로젝트 '${projectName}'가 DB에 등록되지 않았습니다.`,
        };
      }

      let restoredEnv: Record<string, string> = {};
      let restoredFrom = '';

      if (version === 'current') {
        // Restore from DB
        const dbEnv = await ProjectEnvRepo.findByProject(projectName, environment);
        if (dbEnv && Object.keys(dbEnv.env_data).length > 0) {
          restoredEnv = dbEnv.env_data;
          restoredFrom = `DB v${dbEnv.version}`;
        } else {
          return {
            success: false,
            projectName,
            environment,
            restoredFrom: '',
            keysRestored: 0,
            error: 'DB에 저장된 ENV가 없습니다.',
          };
        }
      } else {
        // Restore from file backup (master = latest)
        await withLocal(async (local) => {
          const backupDir = `/opt/codeb/env-backup/${projectName}`;
          const envPath = `/opt/codeb/env/${projectName}/.env`;

          // Get latest backup
          const result = await local.exec(`ls -t ${backupDir}/.env.* 2>/dev/null | head -1`);
          const backupPath = result.stdout.trim();

          if (!backupPath) {
            throw new Error('백업 파일이 없습니다.');
          }

          // Read backup content
          const contentResult = await local.exec(`cat ${backupPath}`);
          restoredEnv = parseEnvContent(contentResult.stdout);
          restoredFrom = backupPath;

          // Write to current ENV file
          await local.exec(`mkdir -p /opt/codeb/env/${projectName}`);
          const base64Content = Buffer.from(contentResult.stdout).toString('base64');
          await local.exec(`echo "${base64Content}" | base64 -d > ${envPath}`);
          await local.exec(`chmod 600 ${envPath}`);

          // Create new backup with timestamp
          const timestamp = Date.now();
          await local.exec(`cp ${envPath} ${backupDir}/.env.${timestamp}`);
        });
      }

      // Save to DB SSOT
      if (Object.keys(restoredEnv).length > 0) {
        await ProjectEnvRepo.upsert({
          projectName,
          environment,
          envData: restoredEnv,
          createdBy: auth.teamId,
        });
      }

      logger.info('ENV restored', {
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
      logger.error('ENV restore failed', { projectName, error: errorMessage });
      return {
        success: false,
        projectName,
        environment,
        restoredFrom: '',
        keysRestored: 0,
        error: errorMessage,
      };
    }
  },
};

export default { envSyncTool, envGetTool, envScanTool, envRestoreTool };
