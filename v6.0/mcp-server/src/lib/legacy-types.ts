/**
 * CodeB v6.0 - Legacy System Types
 * 기존 v3.x/v5.x 시스템과의 호환을 위한 타입 정의
 */

// ============================================================================
// Legacy SSOT Types (v3.x/v5.x)
// ============================================================================

/**
 * 레거시 SSOT 메인 스키마
 */
export interface LegacySSOT {
  version: '1.0';
  lastModified: string;
  lastModifiedBy: 'mcp' | 'watchdog' | 'admin' | 'migration';
  checksum: string;
  server: LegacyServerConfig;
  portRanges: LegacyPortRangeConfig;
  projects: Record<string, LegacySSOTProject>;
  _indexes: LegacySSOTIndexes;
}

export interface LegacyServerConfig {
  ip: string;
  hostname: string;
  zones: string[];
  ssh: {
    user: string;
    port: number;
    keyPath: string;
  };
  caddyConfigDir: string;
  manageDns: boolean;
}

export interface LegacyPortRangeConfig {
  staging: LegacyEnvironmentPortRange;
  production: LegacyEnvironmentPortRange;
  preview: LegacyEnvironmentPortRange;
}

export interface LegacyEnvironmentPortRange {
  app: { start: number; end: number };
  db: { start: number; end: number };
  redis: { start: number; end: number };
}

export interface LegacySSOTProject {
  id: string;
  name: string;
  type: 'nextjs' | 'remix' | 'nodejs' | 'static' | 'python' | 'go';
  repository?: string;
  createdAt: string;
  environments: {
    staging?: LegacySSOTEnvironmentConfig;
    production?: LegacySSOTEnvironmentConfig;
    preview?: Record<string, LegacySSOTPreviewConfig>;
  };
  status: 'active' | 'paused' | 'archived';
}

export interface LegacySSOTEnvironmentConfig {
  ports: {
    app: number;
    db?: number;
    redis?: number;
  };
  domain: string;
  containerName: string;
  status: 'running' | 'stopped' | 'failed' | 'deploying';
  lastDeployed?: string;
  lastVersion?: string;
  healthEndpoint?: string;
  caddyConfigFile: string;
  dnsConfigured: boolean;
}

export interface LegacySSOTPreviewConfig extends Omit<LegacySSOTEnvironmentConfig, 'status'> {
  prNumber: string;
  createdAt: string;
  expiresAt: string;
  status: 'running' | 'stopped' | 'expired';
}

export interface LegacySSOTIndexes {
  portToProject: Record<number, {
    projectId: string;
    environment: 'staging' | 'production' | 'preview';
    service: 'app' | 'db' | 'redis';
    prNumber?: string;
  }>;
  domainToProject: Record<string, {
    projectId: string;
    environment: 'staging' | 'production' | 'preview';
    prNumber?: string;
  }>;
  containerToProject: Record<string, {
    projectId: string;
    environment: 'staging' | 'production' | 'preview';
    prNumber?: string;
  }>;
}

// ============================================================================
// Legacy Detection Result
// ============================================================================

export type LegacySystemType =
  | 'ssot-v1'      // SSOT 기반 (v5.x)
  | 'workflow'     // workflow.js 기반 (v3.x)
  | 'docker-compose' // docker-compose 직접 사용
  | 'podman-direct'  // podman 직접 명령어
  | 'quadlet-v6'   // 이미 v6.0 슬롯 시스템
  | 'unknown';

export interface LegacyDetectionResult {
  /** 감지된 시스템 유형 */
  systemType: LegacySystemType;

  /** SSOT 파일 존재 여부 */
  hasSSOT: boolean;

  /** SSOT 버전 */
  ssotVersion?: string;

  /** 발견된 프로젝트 목록 */
  projects: LegacyProjectInfo[];

  /** 발견된 컨테이너 */
  containers: LegacyContainerInfo[];

  /** 발견된 Caddy 설정 */
  caddyConfigs: LegacyCaddyConfig[];

  /** 포트 매핑 */
  portMappings: LegacyPortMapping[];

  /** 감지 시간 */
  detectedAt: string;

  /** 경고 메시지 */
  warnings: string[];

  /** 에러 */
  errors: string[];
}

export interface LegacyProjectInfo {
  /** 프로젝트 이름 */
  name: string;

  /** 프로젝트 경로 */
  path: string;

  /** 감지된 소스 */
  source: 'ssot' | 'container' | 'caddy' | 'directory';

  /** 환경 */
  environments: Array<{
    name: 'staging' | 'production' | 'preview';
    port?: number;
    domain?: string;
    containerName?: string;
    status: 'running' | 'stopped' | 'unknown';
    version?: string;
  }>;

  /** 프로젝트 타입 */
  type?: string;

  /** GitHub 저장소 */
  repository?: string;

  /** 마이그레이션 가능 여부 */
  canMigrate: boolean;

  /** 마이그레이션 불가 이유 */
  migrationBlocker?: string;
}

export interface LegacyContainerInfo {
  /** 컨테이너 이름 */
  name: string;

  /** 컨테이너 ID */
  id: string;

  /** 이미지 */
  image: string;

  /** 상태 */
  status: 'running' | 'stopped' | 'paused';

  /** 포트 매핑 */
  ports: Array<{
    host: number;
    container: number;
    protocol: 'tcp' | 'udp';
  }>;

  /** 시작 시간 */
  startedAt?: string;

  /** 런타임 */
  runtime: 'podman' | 'docker';

  /** Quadlet 관리 여부 */
  isQuadlet: boolean;

  /** Systemd 서비스 이름 */
  systemdService?: string;
}

export interface LegacyCaddyConfig {
  /** 설정 파일 경로 */
  path: string;

  /** 도메인 */
  domain: string;

  /** 타겟 포트 */
  targetPort: number;

  /** 프로젝트 이름 (추론) */
  inferredProject?: string;

  /** 환경 (추론) */
  inferredEnvironment?: 'staging' | 'production' | 'preview';
}

export interface LegacyPortMapping {
  /** 포트 번호 */
  port: number;

  /** 사용 중인 프로젝트 */
  project?: string;

  /** 환경 */
  environment?: string;

  /** 서비스 타입 */
  service: 'app' | 'db' | 'redis' | 'unknown';

  /** 소스 */
  source: 'ssot' | 'container' | 'caddy';
}

// ============================================================================
// Migration Types
// ============================================================================

export interface MigrationPlan {
  /** 마이그레이션 ID */
  id: string;

  /** 생성 시간 */
  createdAt: string;

  /** 소스 시스템 */
  sourceSystem: LegacySystemType;

  /** 대상 프로젝트 */
  projects: MigrationProjectPlan[];

  /** 예상 다운타임 */
  estimatedDowntime: string;

  /** 롤백 가능 여부 */
  canRollback: boolean;

  /** 전체 단계 */
  steps: MigrationStep[];

  /** 상태 */
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
}

export interface MigrationProjectPlan {
  /** 프로젝트 이름 */
  name: string;

  /** 현재 상태 */
  current: {
    port: number;
    domain?: string;
    containerName: string;
    version?: string;
  };

  /** 마이그레이션 후 상태 */
  target: {
    bluePort: number;
    greenPort: number;
    domain?: string;
    activeSlot: 'blue' | 'green';
  };

  /** 환경별 마이그레이션 */
  environments: Array<{
    name: 'staging' | 'production';
    action: 'migrate' | 'skip' | 'manual';
    reason?: string;
  }>;
}

export interface MigrationStep {
  /** 단계 ID */
  id: string;

  /** 단계 이름 */
  name: string;

  /** 설명 */
  description: string;

  /** 순서 */
  order: number;

  /** 상태 */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

  /** 실행 시간 */
  duration?: number;

  /** 결과 */
  result?: {
    success: boolean;
    message?: string;
    data?: unknown;
  };

  /** 롤백 가능 여부 */
  canRollback: boolean;

  /** 롤백 명령 */
  rollbackCommand?: string;
}

export interface MigrationResult {
  /** 성공 여부 */
  success: boolean;

  /** 마이그레이션 ID */
  migrationId: string;

  /** 마이그레이션된 프로젝트 */
  migratedProjects: string[];

  /** 실패한 프로젝트 */
  failedProjects: Array<{
    name: string;
    error: string;
  }>;

  /** 소요 시간 */
  duration: number;

  /** 다음 단계 안내 */
  nextSteps: string[];

  /** 경고 */
  warnings: string[];
}

// ============================================================================
// Compatibility Layer Types
// ============================================================================

export interface LegacyCommandMapping {
  /** 레거시 명령어 */
  legacy: string;

  /** v6.0 명령어 */
  v6Command: string;

  /** 파라미터 매핑 */
  paramMapping?: Record<string, string>;

  /** 지원 중단 여부 */
  deprecated: boolean;

  /** 대체 안내 메시지 */
  deprecationMessage?: string;
}

/**
 * 레거시 명령어 → v6.0 명령어 매핑
 */
export const LEGACY_COMMAND_MAPPINGS: LegacyCommandMapping[] = [
  // Workflow 명령어 (v3.x)
  {
    legacy: 'we workflow init',
    v6Command: 'we init',
    deprecated: true,
    deprecationMessage: 'Use "we init" instead',
  },
  {
    legacy: 'we workflow scan',
    v6Command: 'we slot status',
    deprecated: true,
    deprecationMessage: 'Use "we slot status" instead',
  },
  {
    legacy: 'we workflow stop',
    v6Command: 'we slot cleanup',
    deprecated: true,
    deprecationMessage: 'Use "we slot cleanup" instead',
  },

  // SSOT 명령어 (v5.x)
  {
    legacy: 'we ssot status',
    v6Command: 'we registry status',
    deprecated: true,
    deprecationMessage: 'Use "we registry status" instead',
  },
  {
    legacy: 'we ssot sync',
    v6Command: 'we registry sync',
    deprecated: true,
    deprecationMessage: 'Use "we registry sync" instead',
  },
  {
    legacy: 'we ssot projects',
    v6Command: 'we slot list',
    deprecated: true,
    deprecationMessage: 'Use "we slot list" instead',
  },

  // 배포 명령어
  {
    legacy: 'we deploy --env staging',
    v6Command: 'we deploy --environment staging',
    paramMapping: { '--env': '--environment' },
    deprecated: false,
  },
];
