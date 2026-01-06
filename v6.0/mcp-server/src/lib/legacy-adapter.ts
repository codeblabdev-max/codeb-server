/**
 * CodeB v6.0 - Legacy Compatibility Adapter
 * v3.x/v5.x 시스템을 v6.0 Blue-Green 슬롯 시스템으로 매핑
 */

import type { AuthContext } from './types.js';
import type {
  LegacySSOT,
  LegacySSOTProject,
  LegacyDetectionResult,
  LegacyProjectInfo,
  LegacyContainerInfo,
  LegacyCaddyConfig,
  LegacyPortMapping,
  LegacySystemType,
  MigrationPlan,
  MigrationProjectPlan,
  MigrationStep,
} from './legacy-types.js';

// ============================================================================
// Constants
// ============================================================================

/** 레거시 SSOT 파일 경로 */
export const LEGACY_SSOT_PATH = '/opt/codeb/registry/ssot.json';

/** 레거시 프로젝트 디렉토리 */
export const LEGACY_PROJECT_DIR = '/opt/codeb/projects';

/** 레거시 Caddy 설정 디렉토리 */
export const LEGACY_CADDY_DIR = '/etc/caddy/sites';

/** v6.0 슬롯 레지스트리 경로 */
export const V6_SLOT_REGISTRY_DIR = '/opt/codeb/slots';

/** v6.0 Quadlet 경로 */
export const V6_QUADLET_DIR = '/etc/containers/systemd';

/** 레거시 포트 범위 */
export const LEGACY_PORT_RANGES = {
  staging: { app: { start: 3000, end: 3499 } },
  production: { app: { start: 4000, end: 4499 } },
  preview: { app: { start: 5000, end: 5999 } },
};

/** v6.0 Blue-Green 포트 범위 */
export const V6_PORT_RANGES = {
  staging: {
    blue: { start: 3000, end: 3249 },
    green: { start: 3250, end: 3499 },
  },
  production: {
    blue: { start: 4000, end: 4249 },
    green: { start: 4250, end: 4499 },
  },
  preview: {
    blue: { start: 5000, end: 5499 },
    green: { start: 5500, end: 5999 },
  },
};

// ============================================================================
// Legacy SSOT Parser
// ============================================================================

/**
 * 레거시 SSOT 파일 파싱
 */
export function parseLegacySSOT(content: string): LegacySSOT | null {
  try {
    const ssot = JSON.parse(content) as LegacySSOT;

    // 버전 확인
    if (ssot.version !== '1.0') {
      console.warn(`Unknown SSOT version: ${ssot.version}`);
    }

    return ssot;
  } catch {
    return null;
  }
}

/**
 * SSOT 프로젝트를 v6.0 형식으로 변환
 */
export function convertSSOTProject(
  project: LegacySSOTProject,
  ssot: LegacySSOT
): LegacyProjectInfo {
  const environments: LegacyProjectInfo['environments'] = [];

  // Staging 환경
  if (project.environments.staging) {
    const staging = project.environments.staging;
    environments.push({
      name: 'staging',
      port: staging.ports.app,
      domain: staging.domain,
      containerName: staging.containerName,
      status: staging.status === 'running' ? 'running' : 'stopped',
      version: staging.lastVersion,
    });
  }

  // Production 환경
  if (project.environments.production) {
    const prod = project.environments.production;
    environments.push({
      name: 'production',
      port: prod.ports.app,
      domain: prod.domain,
      containerName: prod.containerName,
      status: prod.status === 'running' ? 'running' : 'stopped',
      version: prod.lastVersion,
    });
  }

  // Preview 환경들
  if (project.environments.preview) {
    for (const [prNumber, preview] of Object.entries(project.environments.preview)) {
      environments.push({
        name: 'preview',
        port: preview.ports.app,
        domain: preview.domain,
        containerName: preview.containerName,
        status: preview.status === 'running' ? 'running' : 'stopped',
        version: preview.lastVersion,
      });
    }
  }

  return {
    name: project.name,
    path: `${LEGACY_PROJECT_DIR}/${project.name}`,
    source: 'ssot',
    environments,
    type: project.type,
    repository: project.repository,
    canMigrate: project.status === 'active',
    migrationBlocker: project.status !== 'active' ? `Project status is ${project.status}` : undefined,
  };
}

// ============================================================================
// Container Name Parser
// ============================================================================

/**
 * 컨테이너 이름에서 프로젝트/환경 추론
 * 레거시 명명 규칙: {project}-{environment} 또는 {project}_{environment}
 */
export function parseContainerName(containerName: string): {
  project: string;
  environment: 'staging' | 'production' | 'preview' | 'unknown';
  prNumber?: string;
} {
  // v6.0 슬롯 형식: {project}-{environment}-{slot}
  const slotMatch = containerName.match(/^(.+)-(staging|production|preview)-(blue|green)$/);
  if (slotMatch) {
    return {
      project: slotMatch[1],
      environment: slotMatch[2] as 'staging' | 'production' | 'preview',
    };
  }

  // 레거시 형식: {project}-{environment} 또는 {project}_{environment}
  const legacyMatch = containerName.match(/^(.+)[_-](staging|production|prod|stg)$/i);
  if (legacyMatch) {
    const env = legacyMatch[2].toLowerCase();
    return {
      project: legacyMatch[1],
      environment: env === 'prod' ? 'production' : env === 'stg' ? 'staging' : env as 'staging' | 'production',
    };
  }

  // Preview 형식: {project}-preview-{prNumber}
  const previewMatch = containerName.match(/^(.+)-preview-(\d+)$/);
  if (previewMatch) {
    return {
      project: previewMatch[1],
      environment: 'preview',
      prNumber: previewMatch[2],
    };
  }

  // 추론 불가
  return {
    project: containerName,
    environment: 'unknown',
  };
}

// ============================================================================
// Port Migration
// ============================================================================

/**
 * 레거시 포트를 v6.0 Blue-Green 포트로 변환
 */
export function calculateSlotPorts(
  legacyPort: number,
  environment: 'staging' | 'production' | 'preview',
  usedPorts: Set<number>
): { blue: number; green: number } {
  const range = V6_PORT_RANGES[environment];

  // Blue 슬롯 포트 찾기
  let bluePort = range.blue.start;
  while (usedPorts.has(bluePort) && bluePort <= range.blue.end) {
    bluePort++;
  }

  // Green 슬롯 포트 찾기
  let greenPort = range.green.start;
  while (usedPorts.has(greenPort) && greenPort <= range.green.end) {
    greenPort++;
  }

  // 사용 중으로 마킹
  usedPorts.add(bluePort);
  usedPorts.add(greenPort);

  return { blue: bluePort, green: greenPort };
}

/**
 * 현재 환경에서 레거시 포트인지 확인
 */
export function isLegacyPort(port: number): boolean {
  // 레거시 단일 포트 범위 체크
  return (
    (port >= 3000 && port <= 3499) ||  // staging
    (port >= 4000 && port <= 4499) ||  // production
    (port >= 5000 && port <= 5999)     // preview
  );
}

// ============================================================================
// Caddy Config Parser
// ============================================================================

/**
 * Caddyfile에서 도메인과 포트 추출
 */
export function parseCaddyConfig(content: string, filePath: string): LegacyCaddyConfig | null {
  // 간단한 Caddyfile 파싱
  // 형식: domain.com { reverse_proxy localhost:port }
  const domainMatch = content.match(/^([a-zA-Z0-9.-]+)\s*\{/m);
  const portMatch = content.match(/reverse_proxy\s+(?:localhost|127\.0\.0\.1):(\d+)/);

  if (!domainMatch || !portMatch) {
    return null;
  }

  const domain = domainMatch[1];
  const port = parseInt(portMatch[1], 10);

  // 프로젝트/환경 추론
  let inferredProject: string | undefined;
  let inferredEnvironment: 'staging' | 'production' | 'preview' | undefined;

  // 도메인에서 추론: myapp.codeb.dev, myapp-staging.codeb.dev
  const subdomainMatch = domain.match(/^([^.]+)(?:-(staging|production))?\.codeb\./);
  if (subdomainMatch) {
    inferredProject = subdomainMatch[1];
    inferredEnvironment = (subdomainMatch[2] as 'staging' | 'production') || 'production';
  }

  return {
    path: filePath,
    domain,
    targetPort: port,
    inferredProject,
    inferredEnvironment,
  };
}

// ============================================================================
// ENV Migration
// ============================================================================

/**
 * 레거시 ENV를 v6.0 형식으로 변환
 */
export function migrateEnvVariables(
  envContent: string,
  projectName: string,
  environment: 'staging' | 'production'
): { content: string; changes: string[] } {
  const lines = envContent.split('\n');
  const changes: string[] = [];
  const newLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // 빈 줄이나 주석은 그대로 유지
    if (!trimmed || trimmed.startsWith('#')) {
      newLines.push(line);
      continue;
    }

    // KEY=VALUE 파싱
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (!match) {
      newLines.push(line);
      continue;
    }

    const [, key, value] = match;
    let newValue = value;
    let changed = false;

    // 레거시 설정 변환
    switch (key) {
      case 'REDIS_URL':
        // Redis prefix 추가
        if (!value.includes('?name=')) {
          newValue = `${value}?name=${projectName}:${environment}`;
          changed = true;
        }
        break;

      case 'DATABASE_URL':
        // 스키마 파라미터 추가
        if (!value.includes('?schema=')) {
          newValue = `${value}?schema=public`;
          changed = true;
        }
        break;

      case 'SOCKET_IO_URL':
      case 'SOCKETIO_URL':
        // Centrifugo로 변경
        changes.push(`Removed deprecated ${key} (use CENTRIFUGO_URL instead)`);
        continue; // 라인 스킵

      case 'PORT':
        // 포트는 슬롯 시스템에서 자동 관리
        changes.push('PORT will be managed by Blue-Green slot system');
        break;
    }

    if (changed) {
      changes.push(`${key}: ${value} → ${newValue}`);
    }

    newLines.push(`${key}=${newValue}`);
  }

  // v6.0 필수 변수 추가
  const requiredVars: Record<string, string> = {
    CODEB_VERSION: '6.0',
    CODEB_SLOT_SYSTEM: 'enabled',
    CODEB_PROJECT: projectName,
    CODEB_ENVIRONMENT: environment,
  };

  for (const [key, value] of Object.entries(requiredVars)) {
    if (!newLines.some((line) => line.startsWith(`${key}=`))) {
      newLines.push(`${key}=${value}`);
      changes.push(`Added ${key}=${value}`);
    }
  }

  return {
    content: newLines.join('\n'),
    changes,
  };
}

// ============================================================================
// Quadlet Generator
// ============================================================================

/**
 * 레거시 컨테이너 설정을 Quadlet 형식으로 변환
 */
export function generateQuadletFromLegacy(
  containerInfo: LegacyContainerInfo,
  projectName: string,
  environment: 'staging' | 'production',
  slot: 'blue' | 'green',
  port: number
): string {
  const serviceName = `${projectName}-${environment}-${slot}`;
  const containerName = serviceName;

  return `# CodeB v6.0 - Auto-generated from legacy container
# Source: ${containerInfo.name}
# Generated: ${new Date().toISOString()}

[Unit]
Description=CodeB ${projectName} (${environment}/${slot})
After=network-online.target
Wants=network-online.target

[Container]
ContainerName=${containerName}
Image=${containerInfo.image}
PublishPort=${port}:3000

# Environment
EnvironmentFile=/opt/codeb/env/${projectName}/${environment}/.env

# Volumes
Volume=/opt/codeb/projects/${projectName}/data:/app/data:Z

# Health check
HealthCmd=/usr/bin/curl -sf http://localhost:3000/health || exit 1
HealthInterval=30s
HealthTimeout=10s
HealthRetries=3
HealthStartPeriod=60s

# Resource limits
PodmanArgs=--cpus=2 --memory=2g

[Service]
Restart=on-failure
RestartSec=10s
TimeoutStartSec=120

[Install]
WantedBy=default.target
`;
}

// ============================================================================
// Migration Plan Generator
// ============================================================================

/**
 * 마이그레이션 계획 생성
 */
export function generateMigrationPlan(
  detection: LegacyDetectionResult,
  projectFilter?: string[]
): MigrationPlan {
  const planId = `mig-${Date.now().toString(36)}`;
  const usedPorts = new Set<number>();

  // 현재 사용 중인 포트 수집
  for (const mapping of detection.portMappings) {
    usedPorts.add(mapping.port);
  }

  // 마이그레이션할 프로젝트 필터링
  let projects = detection.projects.filter((p) => p.canMigrate);
  if (projectFilter && projectFilter.length > 0) {
    projects = projects.filter((p) => projectFilter.includes(p.name));
  }

  // 프로젝트별 마이그레이션 계획
  const projectPlans: MigrationProjectPlan[] = projects.map((project) => {
    const stagingEnv = project.environments.find((e) => e.name === 'staging');
    const prodEnv = project.environments.find((e) => e.name === 'production');

    // 포트 계산
    const stagingPorts = stagingEnv
      ? calculateSlotPorts(stagingEnv.port || 3000, 'staging', usedPorts)
      : { blue: 0, green: 0 };

    const prodPorts = prodEnv
      ? calculateSlotPorts(prodEnv.port || 4000, 'production', usedPorts)
      : { blue: 0, green: 0 };

    return {
      name: project.name,
      current: {
        port: stagingEnv?.port || prodEnv?.port || 0,
        domain: stagingEnv?.domain || prodEnv?.domain,
        containerName: stagingEnv?.containerName || prodEnv?.containerName || project.name,
        version: stagingEnv?.version || prodEnv?.version,
      },
      target: {
        bluePort: stagingPorts.blue || prodPorts.blue,
        greenPort: stagingPorts.green || prodPorts.green,
        domain: stagingEnv?.domain || prodEnv?.domain,
        activeSlot: 'blue',
      },
      environments: [
        {
          name: 'staging' as const,
          action: stagingEnv ? 'migrate' : 'skip',
          reason: stagingEnv ? undefined : 'No staging environment found',
        },
        {
          name: 'production' as const,
          action: prodEnv ? 'migrate' : 'skip',
          reason: prodEnv ? undefined : 'No production environment found',
        },
      ],
    };
  });

  // 마이그레이션 단계 생성
  const steps: MigrationStep[] = [
    {
      id: 'step-1',
      name: 'Backup SSOT',
      description: 'Create backup of current SSOT registry',
      order: 1,
      status: 'pending',
      canRollback: true,
      rollbackCommand: 'cp /opt/codeb/registry/ssot.json.bak /opt/codeb/registry/ssot.json',
    },
    {
      id: 'step-2',
      name: 'Backup Caddy',
      description: 'Create backup of Caddy configuration',
      order: 2,
      status: 'pending',
      canRollback: true,
      rollbackCommand: 'cp -r /etc/caddy/sites.bak/* /etc/caddy/sites/',
    },
    {
      id: 'step-3',
      name: 'Create Slot Registry',
      description: 'Create v6.0 slot registry files for each project',
      order: 3,
      status: 'pending',
      canRollback: true,
      rollbackCommand: 'rm -rf /opt/codeb/slots/*',
    },
    {
      id: 'step-4',
      name: 'Generate Quadlet Files',
      description: 'Generate systemd Quadlet files for Blue-Green containers',
      order: 4,
      status: 'pending',
      canRollback: true,
      rollbackCommand: 'rm -f /etc/containers/systemd/*.container',
    },
    {
      id: 'step-5',
      name: 'Migrate ENV Files',
      description: 'Update environment files with v6.0 variables',
      order: 5,
      status: 'pending',
      canRollback: true,
    },
    {
      id: 'step-6',
      name: 'Deploy to Blue Slot',
      description: 'Deploy current version to Blue slot',
      order: 6,
      status: 'pending',
      canRollback: true,
    },
    {
      id: 'step-7',
      name: 'Update Caddy Config',
      description: 'Update Caddy to route to new slot ports',
      order: 7,
      status: 'pending',
      canRollback: true,
    },
    {
      id: 'step-8',
      name: 'Health Check',
      description: 'Verify all migrated services are healthy',
      order: 8,
      status: 'pending',
      canRollback: false,
    },
    {
      id: 'step-9',
      name: 'Cleanup Legacy',
      description: 'Stop and remove legacy containers',
      order: 9,
      status: 'pending',
      canRollback: false,
    },
  ];

  return {
    id: planId,
    createdAt: new Date().toISOString(),
    sourceSystem: detection.systemType,
    projects: projectPlans,
    estimatedDowntime: `${projectPlans.length * 30} seconds`,
    canRollback: true,
    steps,
    status: 'pending',
  };
}

// ============================================================================
// Compatibility Checker
// ============================================================================

/**
 * 시스템 호환성 체크
 */
export function checkCompatibility(detection: LegacyDetectionResult): {
  compatible: boolean;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];

  // 이미 v6.0인 경우
  if (detection.systemType === 'quadlet-v6') {
    return {
      compatible: true,
      issues: [],
      recommendations: ['System is already running v6.0. No migration needed.'],
    };
  }

  // 알 수 없는 시스템
  if (detection.systemType === 'unknown') {
    issues.push('Unable to detect system type. Manual migration may be required.');
  }

  // 충돌 포트 체크
  const portConflicts = detection.portMappings.filter((p) => {
    // v6.0 범위와 겹치는 레거시 포트
    return isLegacyPort(p.port);
  });

  if (portConflicts.length > 0) {
    recommendations.push(
      `${portConflicts.length} ports will be reassigned during migration.`
    );
  }

  // 마이그레이션 불가 프로젝트
  const blockedProjects = detection.projects.filter((p) => !p.canMigrate);
  if (blockedProjects.length > 0) {
    for (const project of blockedProjects) {
      issues.push(`Project "${project.name}" cannot be migrated: ${project.migrationBlocker}`);
    }
  }

  // docker-compose 사용 시
  if (detection.systemType === 'docker-compose') {
    recommendations.push(
      'docker-compose projects will be converted to Podman Quadlet format.'
    );
  }

  return {
    compatible: issues.length === 0,
    issues,
    recommendations,
  };
}

// ============================================================================
// Legacy Command Adapter
// ============================================================================

/**
 * 레거시 명령어를 v6.0 명령어로 변환
 */
export function adaptLegacyCommand(command: string): {
  v6Command: string;
  deprecated: boolean;
  message: string;
} {
  // workflow 명령어
  if (command.startsWith('we workflow ')) {
    const action = command.replace('we workflow ', '');

    switch (action) {
      case 'init':
        return {
          v6Command: 'we init',
          deprecated: true,
          message: 'Use "we init" for project initialization',
        };
      case 'scan':
        return {
          v6Command: 'we slot status',
          deprecated: true,
          message: 'Use "we slot status" for status checks',
        };
      case 'stop':
        return {
          v6Command: 'we slot cleanup',
          deprecated: true,
          message: 'Use "we slot cleanup" for cleanup',
        };
      default:
        return {
          v6Command: `we ${action}`,
          deprecated: true,
          message: `"we workflow ${action}" is deprecated`,
        };
    }
  }

  // ssot 명령어
  if (command.startsWith('we ssot ')) {
    const action = command.replace('we ssot ', '');

    switch (action) {
      case 'status':
        return {
          v6Command: 'we registry status',
          deprecated: true,
          message: 'Use "we registry status" for registry status',
        };
      case 'sync':
        return {
          v6Command: 'we registry sync',
          deprecated: true,
          message: 'Use "we registry sync" for synchronization',
        };
      case 'projects':
        return {
          v6Command: 'we slot list',
          deprecated: true,
          message: 'Use "we slot list" for project listing',
        };
      default:
        return {
          v6Command: `we registry ${action}`,
          deprecated: true,
          message: `"we ssot ${action}" is deprecated`,
        };
    }
  }

  // 이미 v6.0 명령어
  return {
    v6Command: command,
    deprecated: false,
    message: '',
  };
}
