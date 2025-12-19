/**
 * CodeB SSOT (Single Source of Truth) 타입 정의
 *
 * 서버의 모든 포트-프로젝트-도메인 매핑을 중앙 관리
 * 이 파일이 진실의 원천(SSOT)
 */

// ============================================================================
// SSOT 메인 스키마
// ============================================================================

export interface CodeBSSOT {
  /** 스키마 버전 */
  version: '1.0';

  /** 마지막 수정 시간 (ISO 8601) */
  lastModified: string;

  /** 수정 주체 */
  lastModifiedBy: 'mcp' | 'watchdog' | 'admin' | 'migration';

  /** 무결성 체크섬 (SHA256) - _indexes 제외한 내용 */
  checksum: string;

  /** 서버 정보 */
  server: ServerConfig;

  /** 포트 범위 정의 */
  portRanges: PortRangeConfig;

  /** 프로젝트 목록 */
  projects: Record<string, SSOTProject>;

  /** 역참조 인덱스 (빠른 조회용, checksum 계산 제외) */
  _indexes: SSOTIndexes;
}

// ============================================================================
// 서버 설정
// ============================================================================

export interface ServerConfig {
  /** 서버 IP 주소 */
  ip: string;

  /** 호스트명 */
  hostname: string;

  /** 관리하는 DNS 존 목록 */
  zones: string[];

  /** SSH 접속 정보 */
  ssh: {
    user: string;
    port: number;
    keyPath: string;
  };

  /** Caddy 설정 경로 */
  caddyConfigDir: string;

  /** PowerDNS 관리 여부 */
  manageDns: boolean;
}

// ============================================================================
// 포트 범위 설정
// ============================================================================

export interface PortRangeConfig {
  staging: EnvironmentPortRange;
  production: EnvironmentPortRange;
  preview: EnvironmentPortRange;
}

export interface EnvironmentPortRange {
  app: PortRange;
  db: PortRange;
  redis: PortRange;
}

export interface PortRange {
  start: number;
  end: number;
}

// ============================================================================
// 프로젝트 설정
// ============================================================================

export interface SSOTProject {
  /** 프로젝트 ID (고유) */
  id: string;

  /** 표시 이름 */
  name: string;

  /** 프로젝트 유형 */
  type: 'nextjs' | 'remix' | 'nodejs' | 'static' | 'python' | 'go';

  /** GitHub 저장소 URL */
  repository?: string;

  /** 생성 시간 */
  createdAt: string;

  /** 환경별 설정 */
  environments: {
    staging?: SSOTEnvironmentConfig;
    production?: SSOTEnvironmentConfig;
    preview?: Record<string, SSOTPreviewConfig>;
  };

  /** 프로젝트 상태 */
  status: 'active' | 'paused' | 'archived';
}

export interface SSOTEnvironmentConfig {
  /** 포트 할당 */
  ports: {
    app: number;
    db?: number;
    redis?: number;
  };

  /** 도메인 (필수!) */
  domain: string;

  /** 컨테이너 이름 */
  containerName: string;

  /** 실행 상태 */
  status: 'running' | 'stopped' | 'failed' | 'deploying';

  /** 마지막 배포 시간 */
  lastDeployed?: string;

  /** 마지막 배포 버전 */
  lastVersion?: string;

  /** 헬스체크 엔드포인트 */
  healthEndpoint?: string;

  /** Caddy 설정 파일명 */
  caddyConfigFile: string;

  /** DNS 레코드 설정 여부 */
  dnsConfigured: boolean;
}

export interface SSOTPreviewConfig extends Omit<SSOTEnvironmentConfig, 'status'> {
  /** PR 번호 */
  prNumber: string;

  /** 생성 시간 */
  createdAt: string;

  /** 만료 시간 (TTL) */
  expiresAt: string;

  /** 상태 */
  status: 'running' | 'stopped' | 'expired';
}

// ============================================================================
// 인덱스 (빠른 조회용)
// ============================================================================

export interface SSOTIndexes {
  /** 포트 → 프로젝트 매핑 */
  portToProject: Record<number, PortProjectMapping>;

  /** 도메인 → 프로젝트 매핑 */
  domainToProject: Record<string, DomainProjectMapping>;

  /** 컨테이너 → 프로젝트 매핑 */
  containerToProject: Record<string, ContainerProjectMapping>;
}

export interface PortProjectMapping {
  projectId: string;
  environment: 'staging' | 'production' | 'preview';
  service: 'app' | 'db' | 'redis';
  prNumber?: string;  // preview인 경우
}

export interface DomainProjectMapping {
  projectId: string;
  environment: 'staging' | 'production' | 'preview';
  prNumber?: string;
}

export interface ContainerProjectMapping {
  projectId: string;
  environment: 'staging' | 'production' | 'preview';
  prNumber?: string;
}

// ============================================================================
// SSOT 작업 결과 타입
// ============================================================================

export interface SSOTValidationResult {
  valid: boolean;
  errors: SSOTValidationError[];
  warnings: SSOTValidationWarning[];
}

export interface SSOTValidationError {
  code: string;
  message: string;
  path?: string;
  details?: Record<string, unknown>;
}

export interface SSOTValidationWarning {
  code: string;
  message: string;
  suggestion?: string;
}

export interface SSOTSyncResult {
  synced: boolean;
  changes: SSOTSyncChange[];
  errors: string[];
}

export interface SSOTSyncChange {
  type: 'caddy' | 'dns' | 'container';
  action: 'create' | 'update' | 'delete';
  target: string;
  before?: string;
  after?: string;
}

// ============================================================================
// Watchdog 관련 타입
// ============================================================================

export interface WatchdogConfig {
  /** 검증 주기 (초) */
  checkInterval: number;

  /** 자동 복원 활성화 */
  autoRestore: boolean;

  /** 알림 웹훅 URL */
  notifyWebhook?: string;

  /** 로그 경로 */
  logPath: string;

  /** 히스토리 보관 일수 */
  historyRetentionDays: number;
}

export interface WatchdogReport {
  timestamp: string;
  status: 'ok' | 'drift_detected' | 'restored' | 'error';
  checks: {
    ssotIntegrity: boolean;
    caddySync: boolean;
    dnsSync: boolean;
    portSync: boolean;
  };
  drifts: DriftInfo[];
  restoredItems: string[];
  errors: string[];
}

export interface DriftInfo {
  type: 'caddy' | 'dns' | 'port' | 'container';
  projectId: string;
  environment: string;
  expected: string;
  actual: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================================================
// 히스토리 타입
// ============================================================================

export interface SSOTHistoryEntry {
  timestamp: string;
  action: 'create' | 'update' | 'delete' | 'restore';
  actor: 'mcp' | 'watchdog' | 'admin' | 'migration';
  target: string;
  changes: {
    path: string;
    before: unknown;
    after: unknown;
  }[];
  reason?: string;
}

// ============================================================================
// 기본값 상수
// ============================================================================

// 포트 범위: port-registry.ts 및 workflow.js (CLI)와 동기화됨
// 변경 시 세 파일 모두 수정 필요!
export const DEFAULT_PORT_RANGES: PortRangeConfig = {
  staging: {
    app: { start: 3000, end: 3499 },
    db: { start: 5432, end: 5449 },
    redis: { start: 6379, end: 6399 },
  },
  production: {
    app: { start: 4000, end: 4499 },
    db: { start: 5450, end: 5469 },
    redis: { start: 6400, end: 6419 },
  },
  preview: {
    app: { start: 5000, end: 5999 },
    db: { start: 5470, end: 5499 },
    redis: { start: 6420, end: 6439 },
  },
};

export const DEFAULT_SERVER_CONFIG: Partial<ServerConfig> = {
  ssh: {
    user: 'root',
    port: 22,
    keyPath: '~/.ssh/id_rsa',
  },
  caddyConfigDir: '/etc/caddy/Caddyfile.d',
  manageDns: true,
};

export const DEFAULT_WATCHDOG_CONFIG: WatchdogConfig = {
  checkInterval: 30,
  autoRestore: true,
  logPath: '/opt/codeb/logs/watchdog.log',
  historyRetentionDays: 30,
};
