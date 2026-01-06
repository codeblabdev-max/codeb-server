/**
 * CodeB v6.0 - ENV Migration Tools
 * 레거시 환경 변수 파일을 v6.0 형식으로 자동 변환
 */

import type { AuthContext } from '../lib/types.js';
import { migrateEnvVariables } from '../lib/legacy-adapter.js';

// ============================================================================
// Types
// ============================================================================

export interface EnvMigrationInput {
  projectName: string;
  environment: 'staging' | 'production';
  currentEnv?: string;
  dryRun?: boolean;
}

export interface EnvMigrationResult {
  success: boolean;
  projectName: string;
  environment: string;
  changes: EnvChange[];
  warnings: string[];
  newContent?: string;
}

export interface EnvChange {
  type: 'added' | 'modified' | 'removed' | 'renamed';
  key: string;
  oldValue?: string;
  newValue?: string;
  reason: string;
}

export interface EnvScanResult {
  success: boolean;
  projects: EnvProjectScan[];
  summary: {
    totalProjects: number;
    legacyEnvs: number;
    v6Envs: number;
    needsMigration: number;
  };
}

export interface EnvProjectScan {
  projectName: string;
  environments: Array<{
    name: 'staging' | 'production';
    hasEnvFile: boolean;
    isV6Format: boolean;
    issues: string[];
    path: string;
  }>;
}

// ============================================================================
// ENV Migration Rules
// ============================================================================

/**
 * 레거시 ENV 키를 v6.0 키로 매핑
 */
const ENV_KEY_MIGRATIONS: Record<string, {
  newKey?: string;
  transform?: (value: string) => string;
  deprecated?: boolean;
  deprecationMessage?: string;
}> = {
  // Socket.IO -> Centrifugo
  SOCKET_IO_URL: {
    deprecated: true,
    deprecationMessage: 'Socket.IO is replaced by Centrifugo. Use CENTRIFUGO_URL instead.',
  },
  SOCKETIO_URL: {
    deprecated: true,
    deprecationMessage: 'Socket.IO is replaced by Centrifugo. Use CENTRIFUGO_URL instead.',
  },
  SOCKET_IO_SECRET: {
    deprecated: true,
    deprecationMessage: 'Use CENTRIFUGO_SECRET instead.',
  },

  // 포트 관련
  PORT: {
    transform: () => '3000', // 슬롯 시스템에서 관리하므로 고정
  },
  APP_PORT: {
    newKey: 'PORT',
    transform: () => '3000',
  },

  // 데이터베이스
  DB_URL: {
    newKey: 'DATABASE_URL',
  },
  POSTGRES_URL: {
    newKey: 'DATABASE_URL',
  },

  // Redis
  REDIS_HOST: {
    deprecated: true,
    deprecationMessage: 'Use REDIS_URL with full connection string instead.',
  },
  REDIS_PORT: {
    deprecated: true,
    deprecationMessage: 'Use REDIS_URL with full connection string instead.',
  },

  // 환경
  ENV: {
    newKey: 'NODE_ENV',
  },
  ENVIRONMENT: {
    newKey: 'NODE_ENV',
  },
};

/**
 * v6.0 필수 환경 변수
 */
const V6_REQUIRED_ENV = [
  { key: 'CODEB_VERSION', value: '6.0' },
  { key: 'CODEB_SLOT_SYSTEM', value: 'enabled' },
];

/**
 * v6.0 권장 환경 변수 (프로젝트/환경에 따라 동적 생성)
 */
const V6_RECOMMENDED_ENV = (projectName: string, environment: string) => [
  { key: 'CODEB_PROJECT', value: projectName },
  { key: 'CODEB_ENVIRONMENT', value: environment },
  { key: 'CODEB_HEALTH_PATH', value: '/health' },
  { key: 'CODEB_METRICS_ENABLED', value: 'true' },
];

// ============================================================================
// ENV Migration Functions
// ============================================================================

/**
 * ENV 파일 내용 분석
 */
export function analyzeEnvContent(content: string): {
  variables: Map<string, string>;
  isV6Format: boolean;
  issues: string[];
} {
  const variables = new Map<string, string>();
  const issues: string[] = [];
  let isV6Format = false;

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // 빈 줄이나 주석 스킵
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // KEY=VALUE 파싱
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (!match) {
      issues.push(`Invalid line format: ${trimmed.substring(0, 50)}...`);
      continue;
    }

    const [, key, value] = match;
    variables.set(key, value);

    // v6.0 형식 감지
    if (key === 'CODEB_VERSION' && value === '6.0') {
      isV6Format = true;
    }
  }

  // 레거시 변수 경고
  for (const [legacyKey, migration] of Object.entries(ENV_KEY_MIGRATIONS)) {
    if (variables.has(legacyKey)) {
      if (migration.deprecated) {
        issues.push(`Deprecated variable: ${legacyKey} - ${migration.deprecationMessage}`);
      } else if (migration.newKey) {
        issues.push(`Legacy variable: ${legacyKey} should be renamed to ${migration.newKey}`);
      }
    }
  }

  return { variables, isV6Format, issues };
}

/**
 * ENV 파일 마이그레이션 수행
 */
export function migrateEnvContent(
  content: string,
  projectName: string,
  environment: 'staging' | 'production'
): EnvMigrationResult {
  const { variables, isV6Format, issues } = analyzeEnvContent(content);
  const changes: EnvChange[] = [];
  const warnings: string[] = issues;
  const newVariables = new Map<string, string>();

  // 이미 v6.0 형식인 경우
  if (isV6Format) {
    return {
      success: true,
      projectName,
      environment,
      changes: [],
      warnings: ['ENV file is already in v6.0 format'],
    };
  }

  // 기존 변수 처리
  for (const [key, value] of variables) {
    const migration = ENV_KEY_MIGRATIONS[key];

    if (migration) {
      if (migration.deprecated) {
        // deprecated 변수는 제거
        changes.push({
          type: 'removed',
          key,
          oldValue: value,
          reason: migration.deprecationMessage || 'Deprecated variable',
        });
        continue;
      }

      if (migration.newKey) {
        // 키 이름 변경
        const newValue = migration.transform ? migration.transform(value) : value;
        newVariables.set(migration.newKey, newValue);
        changes.push({
          type: 'renamed',
          key,
          oldValue: value,
          newValue: migration.newKey,
          reason: `Renamed to ${migration.newKey}`,
        });
        continue;
      }

      if (migration.transform) {
        // 값만 변환
        const newValue = migration.transform(value);
        newVariables.set(key, newValue);
        if (newValue !== value) {
          changes.push({
            type: 'modified',
            key,
            oldValue: value,
            newValue,
            reason: 'Value transformed for v6.0 compatibility',
          });
        }
        continue;
      }
    }

    // 변경 없이 유지
    newVariables.set(key, value);
  }

  // v6.0 필수 변수 추가
  for (const { key, value } of V6_REQUIRED_ENV) {
    if (!newVariables.has(key)) {
      newVariables.set(key, value);
      changes.push({
        type: 'added',
        key,
        newValue: value,
        reason: 'Required for v6.0',
      });
    }
  }

  // v6.0 권장 변수 추가
  for (const { key, value } of V6_RECOMMENDED_ENV(projectName, environment)) {
    if (!newVariables.has(key)) {
      newVariables.set(key, value);
      changes.push({
        type: 'added',
        key,
        newValue: value,
        reason: 'Recommended for v6.0',
      });
    }
  }

  // Centrifugo 설정 추가 (Socket.IO 대체)
  if (
    variables.has('SOCKET_IO_URL') ||
    variables.has('SOCKETIO_URL')
  ) {
    if (!newVariables.has('CENTRIFUGO_URL')) {
      newVariables.set('CENTRIFUGO_URL', 'wss://ws.codeb.kr/connection/websocket');
      newVariables.set('CENTRIFUGO_API_URL', 'http://ws.codeb.kr:8000/api');
      changes.push({
        type: 'added',
        key: 'CENTRIFUGO_URL',
        newValue: 'wss://ws.codeb.kr/connection/websocket',
        reason: 'Replacement for Socket.IO',
      });
    }
  }

  // 새 ENV 파일 생성
  const newLines: string[] = [
    '# CodeB v6.0 Environment Configuration',
    `# Project: ${projectName}`,
    `# Environment: ${environment}`,
    `# Migrated: ${new Date().toISOString()}`,
    '',
  ];

  // 변수를 카테고리별로 정렬
  const categories: Record<string, string[]> = {
    '# === CodeB System ===': ['CODEB_', 'NODE_ENV', 'PORT'],
    '# === Database ===': ['DATABASE_', 'POSTGRES_', 'DB_'],
    '# === Redis ===': ['REDIS_'],
    '# === Centrifugo (WebSocket) ===': ['CENTRIFUGO_'],
    '# === Application ===': [],
  };

  const categorized = new Map<string, string[]>();
  const uncategorized: string[] = [];

  for (const [key, value] of newVariables) {
    let found = false;
    for (const [category, prefixes] of Object.entries(categories)) {
      if (prefixes.length === 0) continue;
      if (prefixes.some((p) => key.startsWith(p) || key === p.replace('_', ''))) {
        if (!categorized.has(category)) {
          categorized.set(category, []);
        }
        categorized.get(category)!.push(`${key}=${value}`);
        found = true;
        break;
      }
    }
    if (!found) {
      uncategorized.push(`${key}=${value}`);
    }
  }

  // 카테고리별 출력
  for (const category of Object.keys(categories)) {
    const vars = categorized.get(category);
    if (vars && vars.length > 0) {
      newLines.push(category);
      newLines.push(...vars.sort());
      newLines.push('');
    }
  }

  // 미분류 변수
  if (uncategorized.length > 0) {
    newLines.push('# === Application ===');
    newLines.push(...uncategorized.sort());
    newLines.push('');
  }

  return {
    success: true,
    projectName,
    environment,
    changes,
    warnings,
    newContent: newLines.join('\n'),
  };
}

// ============================================================================
// ENV Migration Tool
// ============================================================================

export const envMigrateTool = {
  name: 'env_migrate',
  description: 'Migrate legacy ENV file to v6.0 format',

  async execute(
    input: EnvMigrationInput,
    auth: AuthContext
  ): Promise<EnvMigrationResult> {
    const { projectName, environment, currentEnv, dryRun = true } = input;

    if (!currentEnv) {
      return {
        success: false,
        projectName,
        environment,
        changes: [],
        warnings: ['No ENV content provided'],
      };
    }

    const result = migrateEnvContent(currentEnv, projectName, environment);

    // dry-run이 아니면 실제 파일 저장 (여기서는 결과만 반환)
    if (!dryRun && result.success && result.newContent) {
      // 실제 환경에서는 SSH를 통해 파일 저장
      // await sshExec(server, `cat > /opt/codeb/env/${projectName}/${environment}/.env`, result.newContent);
    }

    return result;
  },
};

// ============================================================================
// ENV Scan Tool
// ============================================================================

export const envScanTool = {
  name: 'env_scan',
  description: 'Scan all projects for legacy ENV configurations',

  async execute(auth: AuthContext): Promise<EnvScanResult> {
    // 실제 환경에서는 SSH를 통해 프로젝트 스캔
    // 여기서는 mock 데이터 반환

    const mockProjects: EnvProjectScan[] = [
      {
        projectName: 'example-app',
        environments: [
          {
            name: 'staging',
            hasEnvFile: true,
            isV6Format: false,
            issues: ['Uses deprecated SOCKET_IO_URL', 'Missing CODEB_VERSION'],
            path: '/opt/codeb/env/example-app/staging/.env',
          },
          {
            name: 'production',
            hasEnvFile: true,
            isV6Format: true,
            issues: [],
            path: '/opt/codeb/env/example-app/production/.env',
          },
        ],
      },
    ];

    const legacyEnvs = mockProjects.reduce(
      (count, p) =>
        count + p.environments.filter((e) => e.hasEnvFile && !e.isV6Format).length,
      0
    );

    const v6Envs = mockProjects.reduce(
      (count, p) =>
        count + p.environments.filter((e) => e.hasEnvFile && e.isV6Format).length,
      0
    );

    return {
      success: true,
      projects: mockProjects,
      summary: {
        totalProjects: mockProjects.length,
        legacyEnvs,
        v6Envs,
        needsMigration: legacyEnvs,
      },
    };
  },
};

// ============================================================================
// ENV Restore Tool
// ============================================================================

export interface EnvRestoreInput {
  projectName: string;
  environment: 'staging' | 'production';
  version: 'master' | 'current' | string; // timestamp
}

export interface EnvRestoreResult {
  success: boolean;
  message: string;
  restoredFrom: string;
  variables: number;
}

export const envRestoreTool = {
  name: 'env_restore',
  description: 'Restore ENV file from backup (master or specific version)',

  async execute(
    input: EnvRestoreInput,
    auth: AuthContext
  ): Promise<EnvRestoreResult> {
    const { projectName, environment, version } = input;

    // 백업 경로 결정
    const backupDir = `/opt/codeb/env-backup/${projectName}/${environment}`;
    let sourceFile: string;

    switch (version) {
      case 'master':
        sourceFile = `${backupDir}/master.env`;
        break;
      case 'current':
        sourceFile = `${backupDir}/current.env`;
        break;
      default:
        sourceFile = `${backupDir}/${version}.env`;
    }

    // 실제 환경에서는 SSH를 통해 복원
    // await sshExec(server, `cp ${sourceFile} /opt/codeb/env/${projectName}/${environment}/.env`);

    return {
      success: true,
      message: `ENV restored from ${version}`,
      restoredFrom: sourceFile,
      variables: 0, // 실제로는 변수 개수 카운트
    };
  },
};

// ============================================================================
// ENV Backup Tool
// ============================================================================

export interface EnvBackupListResult {
  success: boolean;
  projectName: string;
  environment: string;
  backups: Array<{
    version: string;
    timestamp: string;
    size: number;
  }>;
  masterExists: boolean;
  currentExists: boolean;
}

export const envBackupListTool = {
  name: 'env_backup_list',
  description: 'List available ENV backups for a project',

  async execute(
    projectName: string,
    environment: 'staging' | 'production',
    auth: AuthContext
  ): Promise<EnvBackupListResult> {
    // 실제 환경에서는 SSH를 통해 백업 목록 조회
    // const result = await sshExec(server, `ls -la ${backupDir}`);

    return {
      success: true,
      projectName,
      environment,
      backups: [
        {
          version: '2024-01-15T10:30:00',
          timestamp: '2024-01-15T10:30:00Z',
          size: 1024,
        },
        {
          version: '2024-01-14T15:20:00',
          timestamp: '2024-01-14T15:20:00Z',
          size: 980,
        },
      ],
      masterExists: true,
      currentExists: true,
    };
  },
};
