/**
 * CodeB Deploy MCP - 환경변수 & Secrets 관리
 * GitHub Secrets 및 서버 .env 파일 관리
 */

import { getSSHClient } from '../lib/ssh-client.js';

// ============================================================================
// 타입 정의
// ============================================================================

export interface ManageEnvInput {
  action: 'get' | 'set' | 'delete' | 'list' | 'sync';
  projectName: string;
  environment: 'staging' | 'production' | 'preview';
  key?: string;
  value?: string;
  envFile?: Record<string, string>;  // 여러 환경변수 한번에 설정
}

export interface ManageEnvResult {
  success: boolean;
  action: string;
  environment: string;
  data?: Record<string, string> | string;
  message: string;
}

export interface ManageSecretsInput {
  action: 'get' | 'set' | 'delete' | 'list';
  owner: string;
  repo: string;
  secretName?: string;
  secretValue?: string;
  githubToken?: string;
}

export interface ManageSecretsResult {
  success: boolean;
  action: string;
  secrets?: string[];
  message: string;
}

// ============================================================================
// 서버 ENV 파일 관리
// ============================================================================

const ENV_BASE_PATH = '/opt/codeb/projects';

export async function manageEnv(input: ManageEnvInput): Promise<ManageEnvResult> {
  const { action, projectName, environment, key, value, envFile } = input;
  const ssh = getSSHClient();

  try {
    await ssh.connect();

    const envPath = `${ENV_BASE_PATH}/${projectName}/.env.${environment}`;

    switch (action) {
      case 'list': {
        // 환경변수 목록 조회
        const exists = await ssh.fileExists(envPath);
        if (!exists) {
          return {
            success: true,
            action,
            environment,
            data: {},
            message: `환경변수 파일이 없습니다: ${envPath}`,
          };
        }

        const content = await ssh.readFile(envPath);
        const envVars = parseEnvFile(content);

        // 값은 마스킹 처리
        const maskedVars: Record<string, string> = {};
        for (const [k, v] of Object.entries(envVars)) {
          maskedVars[k] = maskValue(v);
        }

        return {
          success: true,
          action,
          environment,
          data: maskedVars,
          message: `${Object.keys(maskedVars).length}개의 환경변수 조회됨`,
        };
      }

      case 'get': {
        if (!key) {
          return { success: false, action, environment, message: 'key가 필요합니다' };
        }

        const exists = await ssh.fileExists(envPath);
        if (!exists) {
          return { success: false, action, environment, message: `환경변수 파일이 없습니다` };
        }

        const content = await ssh.readFile(envPath);
        const envVars = parseEnvFile(content);

        if (key in envVars) {
          return {
            success: true,
            action,
            environment,
            data: maskValue(envVars[key]),
            message: `${key} 조회 완료`,
          };
        } else {
          return { success: false, action, environment, message: `${key}가 존재하지 않습니다` };
        }
      }

      case 'set': {
        // 단일 또는 다중 환경변수 설정
        const varsToSet: Record<string, string> = envFile || (key && value ? { [key]: value } : {});

        if (Object.keys(varsToSet).length === 0) {
          return { success: false, action, environment, message: 'key/value 또는 envFile이 필요합니다' };
        }

        // 기존 파일 읽기 또는 빈 객체
        let envVars: Record<string, string> = {};
        const exists = await ssh.fileExists(envPath);
        if (exists) {
          const content = await ssh.readFile(envPath);
          envVars = parseEnvFile(content);
        }

        // 새 값 병합
        Object.assign(envVars, varsToSet);

        // 파일 쓰기
        const newContent = serializeEnvFile(envVars);
        await ssh.writeFile(envPath, newContent);

        // 파일 권한 설정 (소유자만 읽기/쓰기)
        await ssh.exec(`chmod 600 "${envPath}"`);

        return {
          success: true,
          action,
          environment,
          message: `${Object.keys(varsToSet).length}개 환경변수 설정 완료`,
        };
      }

      case 'delete': {
        if (!key) {
          return { success: false, action, environment, message: 'key가 필요합니다' };
        }

        const exists = await ssh.fileExists(envPath);
        if (!exists) {
          return { success: false, action, environment, message: `환경변수 파일이 없습니다` };
        }

        const content = await ssh.readFile(envPath);
        const envVars = parseEnvFile(content);

        if (!(key in envVars)) {
          return { success: false, action, environment, message: `${key}가 존재하지 않습니다` };
        }

        delete envVars[key];

        const newContent = serializeEnvFile(envVars);
        await ssh.writeFile(envPath, newContent);

        return {
          success: true,
          action,
          environment,
          message: `${key} 삭제 완료`,
        };
      }

      case 'sync': {
        // .env.example과 현재 환경변수 비교
        const examplePath = `${ENV_BASE_PATH}/${projectName}/.env.example`;
        const exampleExists = await ssh.fileExists(examplePath);

        if (!exampleExists) {
          return { success: false, action, environment, message: '.env.example 파일이 없습니다' };
        }

        const exampleContent = await ssh.readFile(examplePath);
        const exampleVars = parseEnvFile(exampleContent);

        let currentVars: Record<string, string> = {};
        const envExists = await ssh.fileExists(envPath);
        if (envExists) {
          const content = await ssh.readFile(envPath);
          currentVars = parseEnvFile(content);
        }

        // 누락된 변수 찾기
        const missing: string[] = [];
        for (const k of Object.keys(exampleVars)) {
          if (!(k in currentVars)) {
            missing.push(k);
          }
        }

        return {
          success: true,
          action,
          environment,
          data: {
            totalInExample: String(Object.keys(exampleVars).length),
            totalInCurrent: String(Object.keys(currentVars).length),
            missing: missing.join(', ') || 'none',
          },
          message: missing.length > 0
            ? `${missing.length}개 환경변수 누락: ${missing.join(', ')}`
            : '모든 환경변수가 설정되어 있습니다',
        };
      }

      default:
        return { success: false, action, environment, message: `알 수 없는 action: ${action}` };
    }
  } catch (error) {
    return {
      success: false,
      action,
      environment,
      message: `에러: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// GitHub Secrets 관리 (gh CLI 사용)
// ============================================================================

export async function manageSecrets(input: ManageSecretsInput): Promise<ManageSecretsResult> {
  const { action, owner, repo, secretName, secretValue, githubToken } = input;
  const ssh = getSSHClient();

  const token = githubToken || process.env.GITHUB_TOKEN;

  try {
    await ssh.connect();

    // gh CLI 인증 설정
    if (token) {
      await ssh.exec(`echo "${token}" | gh auth login --with-token 2>/dev/null || true`);
    }

    const repoPath = `${owner}/${repo}`;

    switch (action) {
      case 'list': {
        const result = await ssh.exec(`gh secret list --repo ${repoPath} 2>/dev/null || echo ""`);

        const secrets = result.stdout
          .split('\n')
          .filter(line => line.trim())
          .map(line => line.split('\t')[0]);

        return {
          success: true,
          action,
          secrets,
          message: `${secrets.length}개 시크릿 조회됨`,
        };
      }

      case 'set': {
        if (!secretName || !secretValue) {
          return { success: false, action, message: 'secretName과 secretValue가 필요합니다' };
        }

        // gh CLI로 시크릿 설정
        const result = await ssh.exec(
          `echo "${secretValue}" | gh secret set ${secretName} --repo ${repoPath}`
        );

        if (result.code === 0) {
          return {
            success: true,
            action,
            message: `${secretName} 시크릿 설정 완료`,
          };
        } else {
          return {
            success: false,
            action,
            message: `시크릿 설정 실패: ${result.stderr}`,
          };
        }
      }

      case 'delete': {
        if (!secretName) {
          return { success: false, action, message: 'secretName이 필요합니다' };
        }

        const result = await ssh.exec(
          `gh secret delete ${secretName} --repo ${repoPath}`
        );

        if (result.code === 0) {
          return {
            success: true,
            action,
            message: `${secretName} 시크릿 삭제 완료`,
          };
        } else {
          return {
            success: false,
            action,
            message: `시크릿 삭제 실패: ${result.stderr}`,
          };
        }
      }

      default:
        return { success: false, action, message: `알 수 없는 action: ${action}` };
    }
  } catch (error) {
    return {
      success: false,
      action,
      message: `에러: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// 유틸리티 함수
// ============================================================================

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // 빈 줄이나 주석 건너뛰기
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1).trim();

      // 따옴표 제거
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }
  }

  return result;
}

function serializeEnvFile(vars: Record<string, string>): string {
  const lines: string[] = [
    '# Auto-generated by CodeB Deploy MCP',
    `# Updated: ${new Date().toISOString()}`,
    '',
  ];

  // 알파벳 순 정렬
  const sortedKeys = Object.keys(vars).sort();

  for (const key of sortedKeys) {
    const value = vars[key];
    // 공백이나 특수문자가 있으면 따옴표로 감싸기
    if (value.includes(' ') || value.includes('$') || value.includes('"')) {
      lines.push(`${key}="${value.replace(/"/g, '\\"')}"`);
    } else {
      lines.push(`${key}=${value}`);
    }
  }

  return lines.join('\n') + '\n';
}

function maskValue(value: string): string {
  if (value.length <= 4) {
    return '****';
  }
  return value.substring(0, 2) + '****' + value.substring(value.length - 2);
}
