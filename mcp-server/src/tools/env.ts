/**
 * CodeB v7.0 - Environment Variables Sync Tool
 *
 * Vercel 스타일 환경변수 관리:
 * - 로컬 .env 파일 내용을 API로 전송
 * - 서버에서 파싱 후 저장
 * - SSH 권한 없이 환경변수 동기화
 */

import { z } from 'zod';
import type { AuthContext } from '../lib/types.js';
import { withSSH } from '../lib/ssh.js';
import { SERVERS } from '../lib/servers.js';

const APP_SERVER = SERVERS.app.ip;

// ============================================================================
// Input Schema
// ============================================================================

export const envSyncInputSchema = z.object({
  projectName: z.string().min(1).max(50),
  environment: z.enum(['staging', 'production']).default('production'),
  envContent: z.string().min(1), // .env 파일 내용 전체
  merge: z.boolean().default(true), // true: 기존 값과 병합, false: 덮어쓰기
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
function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
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
    '# CodeB v7.0 - Environment Variables',
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
    const { projectName, environment, envContent, merge } = params;
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
        const existingContent = await withSSH(APP_SERVER, async (ssh) => {
          try {
            const result = await ssh.exec(`cat ${envPath} 2>/dev/null || echo ""`);
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
      await withSSH(APP_SERVER, async (ssh) => {
        // 디렉토리 생성
        await ssh.exec(`mkdir -p /opt/codeb/projects/${projectName}`);

        // 백업 (기존 파일이 있으면)
        await ssh.exec(`
          if [ -f ${envPath} ]; then
            cp ${envPath} ${envPath}.backup.$(date +%Y%m%d%H%M%S)
          fi
        `);

        // 새 파일 저장 (base64로 안전하게 전송)
        const base64Content = Buffer.from(finalContent).toString('base64');
        await ssh.exec(`echo "${base64Content}" | base64 -d > ${envPath}`);

        // 권한 설정
        await ssh.exec(`chmod 600 ${envPath}`);
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
      const content = await withSSH(APP_SERVER, async (ssh) => {
        const result = await ssh.exec(`cat ${envPath} 2>/dev/null || echo ""`);
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

export default { envSyncTool, envGetTool };
