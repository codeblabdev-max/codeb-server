/**
 * CodeB Deploy MCP - 완전한 타입 정의
 * 100% CI/CD 시스템 지원
 */

// ============================================================================
// 환경 타입
// ============================================================================

export type Environment = 'development' | 'staging' | 'production' | 'preview';
export type DeployStrategy = 'rolling' | 'blue-green' | 'canary';
export type NotificationChannel = 'slack' | 'discord' | 'pagerduty' | 'email';

// ============================================================================
// 서버 상태 타입
// ============================================================================

export interface ServerStatus {
  timestamp: string;
  host: string;
  system: SystemInfo;
  containers: ContainerInfo[];
  pm2Processes: PM2Process[];
  ports: PortStatus;
  databases: DatabaseInfo[];
  registry: RegistryStatus;
}

export interface SystemInfo {
  os: string;
  hostname: string;
  uptime: number;
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  };
  disk: {
    total: number;
    used: number;
    available: number;
    usagePercent: number;
  };
  cpu: {
    cores: number;
    usage: number;
  };
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  imageVersion: string;
  status: 'running' | 'stopped' | 'paused' | 'exited';
  ports: PortMapping[];
  created: string;
  health?: 'healthy' | 'unhealthy' | 'starting';
  environment?: string; // staging, production
}

export interface PortMapping {
  container: number;
  host: number;
  protocol: 'tcp' | 'udp';
}

export interface PM2Process {
  name: string;
  pid: number;
  status: 'online' | 'stopping' | 'stopped' | 'errored';
  memory: number;
  cpu: number;
  uptime: string;
  restarts: number;
}

export interface PortStatus {
  used: number[];
  byService: Record<string, number[]>;
  byEnvironment: {
    staging: EnvironmentPorts;
    production: EnvironmentPorts;
    preview: Record<string, EnvironmentPorts>; // PR ID별
  };
  available: {
    app: { staging: number[]; production: number[]; preview: number[] };
    db: { staging: number[]; production: number[] };
    redis: { staging: number[]; production: number[] };
  };
}

export interface EnvironmentPorts {
  app: number;
  db?: number;
  redis?: number;
}

export interface DatabaseInfo {
  name: string;
  size: string;
  owner: string;
  environment?: Environment;
}

export interface RegistryStatus {
  url: string;
  available: boolean;
  images: RegistryImage[];
}

export interface RegistryImage {
  name: string;
  tags: string[];
  size: number;
  created: string;
}

// ============================================================================
// 포트 할당 타입
// ============================================================================

export interface PortAllocation {
  projectName: string;
  environments: {
    staging: EnvironmentPorts;
    production: EnvironmentPorts;
  };
  allocatedAt: string;
}

export interface PortRanges {
  staging: {
    app: { start: number; end: number };
    db: { start: number; end: number };
    redis: { start: number; end: number };
  };
  production: {
    app: { start: number; end: number };
    db: { start: number; end: number };
    redis: { start: number; end: number };
  };
  preview: {
    app: { start: number; end: number };
  };
}

// ============================================================================
// 프로젝트 설정 타입
// ============================================================================

export interface ProjectConfig {
  version: '1.0';
  project: {
    name: string;
    template: ProjectTemplate;
    repository: string;
    createdAt: string;
  };
  server: {
    host: string;
    user: string;
    basePath: string;
  };
  environments: {
    staging: EnvironmentConfig;
    production: EnvironmentConfig;
  };
  ci: CIConfig;
  healthCheck: HealthCheckConfig;
  deployment: DeploymentConfig;
  rollback: RollbackConfig;
  monitoring: MonitoringConfig;
  notifications: NotificationConfig;
}

export type ProjectTemplate = 'nextjs' | 'remix' | 'nodejs' | 'python' | 'go';

export interface EnvironmentConfig {
  ports: EnvironmentPorts;
  domain?: string;
  envFile: string;
  replicas: number;
  resources: {
    memory: string;
    cpu: string;
  };
}

export interface CIConfig {
  enabled: boolean;
  stages: {
    lint: boolean;
    typecheck: boolean;
    unitTest: boolean;
    integrationTest: boolean;
    e2eTest: boolean;
    securityScan: boolean;
    buildVerify: boolean;
  };
  e2e?: {
    browser: 'chromium' | 'firefox' | 'webkit';
    baseUrl: string;
  };
}

export interface HealthCheckConfig {
  enabled: boolean;
  endpoint: string;
  timeout: number;
  interval: number;
  retries: number;
  startPeriod: number;
}

export interface DeploymentConfig {
  strategy: DeployStrategy;
  blueGreen?: {
    enabled: boolean;
    switchTimeout: number;
  };
  canary?: {
    enabled: boolean;
    steps: number[]; // [10, 30, 50, 100]
    interval: number;
    thresholds: {
      errorRate: number;
      latency: number;
    };
  };
  preview?: {
    enabled: boolean;
    ttl: number; // hours
    autoCleanup: boolean;
  };
}

export interface RollbackConfig {
  enabled: boolean;
  automatic: boolean;
  keepVersions: number;
  triggers: {
    healthCheckFail: boolean;
    errorRateThreshold: number;
    latencyThreshold: number;
  };
}

export interface MonitoringConfig {
  enabled: boolean;
  prometheus: {
    enabled: boolean;
    scrapeInterval: number;
    port: number;
  };
  grafana: {
    enabled: boolean;
    dashboards: string[];
  };
  sentry?: {
    enabled: boolean;
    dsn: string;
  };
  jaeger?: {
    enabled: boolean;
    endpoint: string;
  };
}

export interface NotificationConfig {
  channels: NotificationChannelConfig[];
  events: {
    deployStart: boolean;
    deploySuccess: boolean;
    deployFail: boolean;
    rollback: boolean;
    healthCheckFail: boolean;
    securityAlert: boolean;
  };
}

export interface NotificationChannelConfig {
  type: NotificationChannel;
  enabled: boolean;
  webhook?: string;
  apiKey?: string;
  severity: 'all' | 'warning' | 'critical';
}

// ============================================================================
// 배포 관련 타입
// ============================================================================

export interface DeploymentRequest {
  projectName: string;
  environment: Environment;
  version?: string;
  strategy?: DeployStrategy;
  dryRun?: boolean;
}

export interface DeploymentResult {
  success: boolean;
  deploymentId: string;
  projectName: string;
  environment: Environment;
  version: string;
  previousVersion?: string;
  strategy: DeployStrategy;
  stages: DeploymentStage[];
  duration: number;
  url?: string;
  error?: string;
}

export interface DeploymentStage {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  duration?: number;
  logs?: string[];
  error?: string;
}

export interface RollbackRequest {
  projectName: string;
  environment: Environment;
  targetVersion?: string; // undefined = 이전 버전
  reason?: string;
}

export interface RollbackResult {
  success: boolean;
  projectName: string;
  environment: Environment;
  fromVersion: string;
  toVersion: string;
  duration: number;
  error?: string;
}

// ============================================================================
// 헬스체크 타입
// ============================================================================

export interface HealthCheckRequest {
  projectName: string;
  environment: Environment;
  timeout?: number;
  retries?: number;
}

export interface HealthCheckResult {
  healthy: boolean;
  projectName: string;
  environment: Environment;
  checks: HealthCheck[];
  responseTime: number;
  timestamp: string;
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  responseTime: number;
  message?: string;
}

// ============================================================================
// 알림 타입
// ============================================================================

export interface NotificationRequest {
  channel: NotificationChannel;
  event: NotificationEvent;
  projectName: string;
  environment: Environment;
  details: Record<string, unknown>;
}

export type NotificationEvent =
  | 'deploy_start'
  | 'deploy_success'
  | 'deploy_fail'
  | 'rollback_start'
  | 'rollback_complete'
  | 'health_check_fail'
  | 'security_alert'
  | 'canary_progress'
  | 'canary_fail';

export interface NotificationResult {
  sent: boolean;
  channel: NotificationChannel;
  messageId?: string;
  error?: string;
}

// ============================================================================
// SSH 관련 타입
// ============================================================================

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
}

export interface SSHCommandResult {
  stdout: string;
  stderr: string;
  code: number;
  duration: number;
}

// ============================================================================
// GitHub Actions 관련 타입
// ============================================================================

export interface GitHubActionsWorkflow {
  name: string;
  filename: string;
  content: string;
}

export interface WorkflowConfig {
  projectName: string;
  template: ProjectTemplate;
  ci: CIConfig;
  environments: {
    staging: EnvironmentConfig;
    production: EnvironmentConfig;
  };
}

// ============================================================================
// 생성 스크립트 타입
// ============================================================================

export interface GeneratedScript {
  name: string;
  path: string;
  content: string;
  executable: boolean;
}

export interface DeployFolder {
  projectPath: string;
  config: ProjectConfig;
  scripts: GeneratedScript[];
  workflows: GitHubActionsWorkflow[];
  dockerfiles: GeneratedScript[];
}
