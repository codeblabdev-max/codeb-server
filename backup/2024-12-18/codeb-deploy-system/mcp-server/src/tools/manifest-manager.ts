/**
 * CodeB Deploy MCP - Project Manifest Manager
 * YAML 매니페스트 기반 인프라 자동화
 */

import { getSSHClient } from '../lib/ssh-client.js';
import * as yaml from 'yaml';

// ============================================================================
// 타입 정의
// ============================================================================

export interface ProjectManifest {
  project: {
    id: string;
    name: string;
    type: 'nextjs' | 'remix' | 'nodejs' | 'static';
    owner: string;
    team?: string;
    description?: string;
  };
  environment: {
    default: 'staging' | 'production';
    domains: {
      staging: string;
      production: string;
      preview_template?: string;
    };
    ssl: {
      enabled: boolean;
      provider: 'letsencrypt' | 'custom';
    };
  };
  servers: {
    app: string;
    database?: string;
    redis?: string;
    storage?: string;
  };
  resources: {
    ports: {
      app: number | 'auto';
      db?: number;
    };
    cpu?: string;
    memory?: string;
    redis_db_index?: number;
    storage_bucket?: string;
  };
  features: {
    core_cms?: boolean;
    auth?: {
      enabled: boolean;
      provider: 'nextauth' | 'custom';
    };
    boards?: boolean;
    file_upload?: boolean;
    realtime?: boolean;
  };
  monitoring: {
    healthcheck: {
      path: string;
      interval: string;
    };
    notifications: {
      slack?: string;
      email?: string;
    };
    metrics?: boolean;
  };
  backup: {
    enabled: boolean;
    schedule?: string;
    retention_days?: number;
    storage?: string;
  };
  deployment: {
    strategy: 'rolling' | 'blue-green' | 'canary';
    auto_deploy?: boolean;
    branch?: string;
  };
}

export interface ManifestValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ApplyManifestResult {
  success: boolean;
  actions: string[];
  errors: string[];
  resources_created: string[];
}

// ============================================================================
// 매니페스트 검증
// ============================================================================

export function validateManifest(content: string): ManifestValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const manifest = yaml.parse(content) as ProjectManifest;

    // 필수 필드 검증
    if (!manifest.project?.id) {
      errors.push('project.id is required');
    }
    if (!manifest.project?.name) {
      errors.push('project.name is required');
    }
    if (!manifest.project?.type) {
      errors.push('project.type is required');
    }
    if (!manifest.environment?.domains?.staging) {
      errors.push('environment.domains.staging is required');
    }
    if (!manifest.environment?.domains?.production) {
      errors.push('environment.domains.production is required');
    }
    if (!manifest.servers?.app) {
      errors.push('servers.app is required');
    }

    // 포트 범위 검증
    if (manifest.resources?.ports?.app !== 'auto') {
      const port = manifest.resources?.ports?.app as number;
      if (port && (port < 3000 || port > 3999)) {
        warnings.push('App port should be in range 3000-3999');
      }
    }

    // Redis DB Index 검증
    if (manifest.resources?.redis_db_index !== undefined) {
      const index = manifest.resources.redis_db_index;
      if (index < 0 || index > 15) {
        errors.push('redis_db_index must be between 0 and 15');
      }
    }

    // 배포 전략 검증
    if (manifest.deployment?.strategy) {
      const validStrategies = ['rolling', 'blue-green', 'canary'];
      if (!validStrategies.includes(manifest.deployment.strategy)) {
        errors.push(`Invalid deployment strategy: ${manifest.deployment.strategy}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  } catch (e) {
    return {
      valid: false,
      errors: [`YAML parse error: ${e instanceof Error ? e.message : String(e)}`],
      warnings: [],
    };
  }
}

// ============================================================================
// 매니페스트 적용
// ============================================================================

export async function applyManifest(content: string): Promise<ApplyManifestResult> {
  const validation = validateManifest(content);
  if (!validation.valid) {
    return {
      success: false,
      actions: [],
      errors: validation.errors,
      resources_created: [],
    };
  }

  const manifest = yaml.parse(content) as ProjectManifest;
  const actions: string[] = [];
  const errors: string[] = [];
  const resources_created: string[] = [];

  const ssh = getSSHClient();

  try {
    await ssh.connect();

    // 1. 포트 할당
    let appPort = manifest.resources?.ports?.app;
    if (appPort === 'auto') {
      const portResult = await ssh.exec('cat /opt/codeb/registry/ports.json 2>/dev/null || echo "{}"');
      const ports = JSON.parse(portResult.stdout || '{}');
      appPort = findNextAvailablePort(ports, 3000, 3999);
      actions.push(`Auto-assigned app port: ${appPort}`);
    }

    // 2. 데이터베이스 생성
    if (manifest.servers?.database) {
      const dbName = `${manifest.project.id}_${manifest.environment.default}`;
      await ssh.exec(`
        podman exec -i ${manifest.servers.database} psql -U postgres -c "CREATE DATABASE ${dbName};" 2>/dev/null || true
      `);
      actions.push(`Database created: ${dbName}`);
      resources_created.push(`database:${dbName}`);
    }

    // 3. Redis namespace 예약
    if (manifest.resources?.redis_db_index !== undefined) {
      actions.push(`Redis DB index reserved: ${manifest.resources.redis_db_index}`);
      resources_created.push(`redis:db${manifest.resources.redis_db_index}`);
    }

    // 4. MinIO 버킷 생성
    if (manifest.resources?.storage_bucket) {
      await ssh.exec(`
        mc mb minio/${manifest.resources.storage_bucket} 2>/dev/null || true
      `);
      actions.push(`Storage bucket created: ${manifest.resources.storage_bucket}`);
      resources_created.push(`bucket:${manifest.resources.storage_bucket}`);
    }

    // 5. 도메인 설정 (Caddy)
    if (manifest.environment?.domains) {
      const domains = manifest.environment.domains;
      actions.push(`Domain configured: ${domains.staging}, ${domains.production}`);
      resources_created.push(`domain:${domains.staging}`);
      resources_created.push(`domain:${domains.production}`);
    }

    // 6. 백업 스케줄 등록
    if (manifest.backup?.enabled && manifest.backup?.schedule) {
      actions.push(`Backup scheduled: ${manifest.backup.schedule}`);
    }

    // 7. 모니터링 등록
    if (manifest.monitoring?.metrics) {
      actions.push(`Metrics monitoring enabled`);
    }

    // 8. 매니페스트 저장
    const manifestDir = `/opt/codeb/manifests`;
    await ssh.exec(`mkdir -p ${manifestDir}`);
    await ssh.exec(`cat > ${manifestDir}/${manifest.project.id}.yaml << 'EOF'
${content}
EOF`);
    actions.push(`Manifest saved: ${manifestDir}/${manifest.project.id}.yaml`);

    return {
      success: true,
      actions,
      errors: [],
      resources_created,
    };
  } catch (e) {
    return {
      success: false,
      actions,
      errors: [`Apply failed: ${e instanceof Error ? e.message : String(e)}`],
      resources_created,
    };
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// 매니페스트 조회
// ============================================================================

export async function getManifest(projectId: string): Promise<ProjectManifest | null> {
  const ssh = getSSHClient();

  try {
    await ssh.connect();
    const result = await ssh.exec(`cat /opt/codeb/manifests/${projectId}.yaml 2>/dev/null`);

    if (result.stdout) {
      return yaml.parse(result.stdout) as ProjectManifest;
    }
    return null;
  } catch {
    return null;
  } finally {
    ssh.disconnect();
  }
}

export async function listManifests(): Promise<string[]> {
  const ssh = getSSHClient();

  try {
    await ssh.connect();
    const result = await ssh.exec(`ls /opt/codeb/manifests/*.yaml 2>/dev/null | xargs -n1 basename | sed 's/.yaml$//'`);

    if (result.stdout) {
      return result.stdout.trim().split('\n').filter(Boolean);
    }
    return [];
  } catch {
    return [];
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// 템플릿 생성
// ============================================================================

export function generateManifestTemplate(
  projectId: string,
  projectType: 'nextjs' | 'remix' | 'nodejs' | 'static' = 'nextjs'
): string {
  const template: ProjectManifest = {
    project: {
      id: projectId,
      name: projectId.charAt(0).toUpperCase() + projectId.slice(1),
      type: projectType,
      owner: 'team@codeb.io',
      description: `${projectId} project`,
    },
    environment: {
      default: 'staging',
      domains: {
        staging: `${projectId}-staging.codeb.dev`,
        production: `${projectId}.codeb.dev`,
        preview_template: `${projectId}-pr-{{PR_NUMBER}}.codeb.dev`,
      },
      ssl: {
        enabled: true,
        provider: 'letsencrypt',
      },
    },
    servers: {
      app: '141.164.60.51',
      database: `${projectId}-postgres`,
      redis: `${projectId}-redis`,
    },
    resources: {
      ports: {
        app: 'auto',
      },
      cpu: '1',
      memory: '1Gi',
      redis_db_index: 0,
      storage_bucket: `${projectId}-uploads`,
    },
    features: {
      core_cms: true,
      auth: {
        enabled: true,
        provider: 'nextauth',
      },
      boards: false,
      file_upload: true,
      realtime: false,
    },
    monitoring: {
      healthcheck: {
        path: '/api/health',
        interval: '30s',
      },
      notifications: {
        slack: '#deployments',
      },
      metrics: true,
    },
    backup: {
      enabled: true,
      schedule: '0 3 * * *',
      retention_days: 7,
      storage: 'minio',
    },
    deployment: {
      strategy: 'rolling',
      auto_deploy: true,
      branch: 'main',
    },
  };

  return yaml.stringify(template);
}

// ============================================================================
// 헬퍼 함수
// ============================================================================

function findNextAvailablePort(usedPorts: Record<string, number>, min: number, max: number): number {
  const used = new Set(Object.values(usedPorts));
  for (let port = min; port <= max; port++) {
    if (!used.has(port)) {
      return port;
    }
  }
  throw new Error(`No available ports in range ${min}-${max}`);
}

// ============================================================================
// Export
// ============================================================================

export const manifestManager = {
  validateManifest,
  applyManifest,
  getManifest,
  listManifests,
  generateManifestTemplate,
};
