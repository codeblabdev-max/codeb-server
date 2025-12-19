/**
 * CodeB Deploy MCP - 프로젝트 레지스트리
 * 배포된 프로젝트 관리 및 영구 저장
 */

import type {
  ProjectConfig,
  EnvironmentPorts,
  Environment,
  ProjectTemplate,
} from './types.js';
import { getSSHClient } from './ssh-client.js';

// 서버 레지스트리 파일 경로
const PROJECT_REGISTRY_FILE = '/home/codeb/config/project-registry.json';
const PROJECTS_BASE_PATH = '/home/codeb/projects';

// 프로젝트 등록 정보
export interface RegisteredProject {
  name: string;
  template: ProjectTemplate;
  repository?: string;
  registeredAt: string;
  lastDeployedAt?: string;
  status: 'active' | 'inactive' | 'unknown';
  source: 'manual' | 'scan' | 'init'; // 등록 방법
  environments: {
    staging?: DeployedEnvironment;
    production?: DeployedEnvironment;
  };
  containers: ContainerRecord[];
  configPath?: string; // 설정 파일 경로
}

export interface DeployedEnvironment {
  ports: EnvironmentPorts;
  domain?: string;
  containerName?: string;
  imageTag?: string;
  lastDeployedAt?: string;
  status: 'running' | 'stopped' | 'unknown';
}

export interface ContainerRecord {
  id: string;
  name: string;
  type: 'app' | 'db' | 'redis' | 'other';
  environment: Environment;
  ports: { host: number; container: number }[];
  status: 'running' | 'stopped' | 'exited';
  image?: string;
}

export interface ScanResult {
  scannedAt: string;
  totalContainers: number;
  projectsFound: number;
  projects: RegisteredProject[];
  orphanedContainers: ContainerRecord[];
  portConflicts: {
    port: number;
    containers: string[];
  }[];
}

class ProjectRegistry {
  private projects: Map<string, RegisteredProject> = new Map();
  public lastUpdated: Date | null = null;

  /**
   * 프로젝트 등록
   */
  registerProject(project: RegisteredProject): void {
    this.projects.set(project.name, project);
    this.lastUpdated = new Date();
  }

  /**
   * 프로젝트 조회
   */
  getProject(name: string): RegisteredProject | undefined {
    return this.projects.get(name);
  }

  /**
   * 모든 프로젝트 조회
   */
  getAllProjects(): RegisteredProject[] {
    return Array.from(this.projects.values());
  }

  /**
   * 프로젝트 업데이트
   */
  updateProject(name: string, updates: Partial<RegisteredProject>): boolean {
    const existing = this.projects.get(name);
    if (!existing) return false;

    this.projects.set(name, { ...existing, ...updates });
    this.lastUpdated = new Date();
    return true;
  }

  /**
   * 프로젝트 삭제
   */
  removeProject(name: string): boolean {
    const deleted = this.projects.delete(name);
    if (deleted) this.lastUpdated = new Date();
    return deleted;
  }

  /**
   * 활성 프로젝트 수
   */
  getActiveCount(): number {
    return Array.from(this.projects.values()).filter(
      (p) => p.status === 'active'
    ).length;
  }

  /**
   * 환경별 포트 사용 현황
   */
  getPortUsage(): {
    staging: EnvironmentPorts[];
    production: EnvironmentPorts[];
  } {
    const usage = { staging: [] as EnvironmentPorts[], production: [] as EnvironmentPorts[] };

    for (const project of this.projects.values()) {
      if (project.environments.staging?.ports) {
        usage.staging.push(project.environments.staging.ports);
      }
      if (project.environments.production?.ports) {
        usage.production.push(project.environments.production.ports);
      }
    }

    return usage;
  }

  /**
   * JSON 직렬화
   */
  toJSON(): object {
    return {
      projects: Array.from(this.projects.entries()),
      lastUpdated: this.lastUpdated?.toISOString(),
    };
  }

  /**
   * JSON에서 복원
   */
  static fromJSON(data: {
    projects?: [string, RegisteredProject][];
    lastUpdated?: string;
  }): ProjectRegistry {
    const registry = new ProjectRegistry();
    registry.projects = new Map(data.projects || []);
    registry.lastUpdated = data.lastUpdated ? new Date(data.lastUpdated) : null;
    return registry;
  }
}

// 글로벌 인스턴스
export const projectRegistry = new ProjectRegistry();

/**
 * 서버에서 프로젝트 레지스트리 로드
 */
export async function loadProjectRegistryFromServer(): Promise<void> {
  const ssh = getSSHClient();

  try {
    await ssh.connect();

    const exists = await ssh.fileExists(PROJECT_REGISTRY_FILE);
    if (!exists) {
      console.error('[ProjectRegistry] No registry file found, starting fresh');
      return;
    }

    const content = await ssh.readFile(PROJECT_REGISTRY_FILE);
    const data = JSON.parse(content);

    // 레지스트리 복원
    const loaded = ProjectRegistry.fromJSON(data);
    for (const project of loaded.getAllProjects()) {
      projectRegistry.registerProject(project);
    }

    console.error(
      `[ProjectRegistry] Loaded ${projectRegistry.getAllProjects().length} projects from server`
    );
  } catch (error) {
    console.error('[ProjectRegistry] Failed to load from server:', error);
  } finally {
    ssh.disconnect();
  }
}

/**
 * 서버에 프로젝트 레지스트리 저장
 */
export async function saveProjectRegistryToServer(): Promise<void> {
  const ssh = getSSHClient();

  try {
    await ssh.connect();

    // 디렉토리 확보
    await ssh.mkdir('/home/codeb/config');

    const data = {
      ...projectRegistry.toJSON(),
      savedAt: new Date().toISOString(),
    };

    await ssh.writeFile(PROJECT_REGISTRY_FILE, JSON.stringify(data, null, 2));

    console.error(
      `[ProjectRegistry] Saved ${projectRegistry.getAllProjects().length} projects to server`
    );
  } catch (error) {
    console.error('[ProjectRegistry] Failed to save to server:', error);
  } finally {
    ssh.disconnect();
  }
}

/**
 * 설정 파일에서 프로젝트-컨테이너 매핑 로드
 * 각 프로젝트의 deploy/config.json에서 containers 배열을 읽어옴
 */
async function loadProjectContainerMappings(
  ssh: any
): Promise<Map<string, Set<string>>> {
  const mappings = new Map<string, Set<string>>();

  try {
    // 프로젝트 디렉토리 목록 조회
    const projectDirs = await ssh.exec(
      `ls -d ${PROJECTS_BASE_PATH}/*/ 2>/dev/null || echo ""`
    );

    if (!projectDirs.stdout.trim()) {
      return mappings;
    }

    const dirs = projectDirs.stdout.trim().split('\n').filter(Boolean);

    for (const dir of dirs) {
      const projectName = dir.split('/').filter(Boolean).pop() || '';
      const configPath = `${dir}deploy/config.json`;

      try {
        const configExists = await ssh.fileExists(configPath);
        if (!configExists) continue;

        const configContent = await ssh.readFile(configPath);
        const config = JSON.parse(configContent);

        // containers 배열에서 컨테이너 이름들 추출
        if (config.containers && Array.isArray(config.containers)) {
          const containerNames = new Set<string>();
          for (const container of config.containers) {
            if (container.name) {
              containerNames.add(container.name);
            }
          }
          if (containerNames.size > 0) {
            mappings.set(projectName, containerNames);
            console.error(
              `[Scan] Loaded ${containerNames.size} container mappings for project: ${projectName}`
            );
          }
        }
      } catch (e) {
        console.error(`[Scan] Failed to read config for ${projectName}:`, e);
      }
    }
  } catch (e) {
    console.error('[Scan] Failed to load project container mappings:', e);
  }

  return mappings;
}

/**
 * 컨테이너 이름으로 프로젝트 찾기 (설정 파일 기반)
 */
function findProjectByContainerName(
  containerName: string,
  mappings: Map<string, Set<string>>
): string | null {
  for (const [projectName, containerNames] of mappings) {
    if (containerNames.has(containerName)) {
      return projectName;
    }
  }
  return null;
}

/**
 * 서버에서 기존 배포된 프로젝트 스캔
 */
export async function scanExistingProjects(): Promise<ScanResult> {
  const ssh = getSSHClient();
  const result: ScanResult = {
    scannedAt: new Date().toISOString(),
    totalContainers: 0,
    projectsFound: 0,
    projects: [],
    orphanedContainers: [],
    portConflicts: [],
  };

  try {
    await ssh.connect();

    // 1. 설정 파일에서 프로젝트-컨테이너 매핑 로드 (먼저 실행)
    const configMappings = await loadProjectContainerMappings(ssh);
    console.error(
      `[Scan] Loaded config mappings for ${configMappings.size} projects`
    );

    // 2. 실행 중인 모든 Podman 컨테이너 조회
    const containerList = await ssh.exec(
      `podman ps -a --format json 2>/dev/null || echo "[]"`
    );

    let containers: any[] = [];
    try {
      containers = JSON.parse(containerList.stdout || '[]');
    } catch {
      console.error('[Scan] Failed to parse container list');
      return result;
    }

    result.totalContainers = containers.length;

    // 3. 컨테이너를 프로젝트별로 그룹화
    const projectMap = new Map<string, ContainerRecord[]>();
    const portUsage = new Map<number, string[]>();

    for (const container of containers) {
      const name = container.Names?.[0] || container.Name || '';
      const containerRecord = parseContainer(container, name);

      // 프로젝트 이름 추출:
      // 1단계: 설정 파일의 containers 배열에서 찾기 (우선)
      // 2단계: 컨테이너 이름 패턴으로 추출 (폴백)
      let projectName = findProjectByContainerName(name, configMappings);
      if (!projectName) {
        projectName = extractProjectName(name);
      }

      if (projectName) {
        if (!projectMap.has(projectName)) {
          projectMap.set(projectName, []);
        }
        projectMap.get(projectName)!.push(containerRecord);
      } else {
        result.orphanedContainers.push(containerRecord);
      }

      // 포트 충돌 체크
      for (const port of containerRecord.ports) {
        if (!portUsage.has(port.host)) {
          portUsage.set(port.host, []);
        }
        portUsage.get(port.host)!.push(name);
      }
    }

    // 4. 프로젝트별로 RegisteredProject 생성
    for (const [projectName, projectContainers] of projectMap) {
      const project = buildProjectFromContainers(projectName, projectContainers);
      result.projects.push(project);
      result.projectsFound++;

      // 레지스트리에 등록
      projectRegistry.registerProject(project);
    }

    // 5. 포트 충돌 감지
    for (const [port, containerNames] of portUsage) {
      if (containerNames.length > 1) {
        result.portConflicts.push({ port, containers: containerNames });
      }
    }

    // 6. 기존 프로젝트 디렉토리에서 설정 파일 경로 업데이트
    const projectDirs = await ssh.exec(
      `ls -d ${PROJECTS_BASE_PATH}/*/ 2>/dev/null || echo ""`
    );

    if (projectDirs.stdout.trim()) {
      const dirs = projectDirs.stdout.trim().split('\n').filter(Boolean);
      for (const dir of dirs) {
        const projectName = dir.split('/').filter(Boolean).pop() || '';
        const configPath = `${dir}deploy/config.json`;

        const configExists = await ssh.fileExists(configPath);
        if (configExists) {
          const existingProject = projectRegistry.getProject(projectName);
          if (existingProject) {
            projectRegistry.updateProject(projectName, { configPath });
          }
        }
      }
    }

    // 7. 레지스트리 저장
    await saveProjectRegistryToServer();

    return result;
  } finally {
    ssh.disconnect();
  }
}

/**
 * 컨테이너 정보 파싱
 */
function parseContainer(container: any, name: string): ContainerRecord {
  const ports: { host: number; container: number }[] = [];

  // 포트 매핑 파싱
  if (container.Ports) {
    for (const portInfo of container.Ports) {
      if (portInfo.hostPort) {
        ports.push({
          host: portInfo.hostPort,
          container: portInfo.containerPort,
        });
      }
    }
  }

  // 컨테이너 타입 추론
  let type: 'app' | 'db' | 'redis' | 'other' = 'other';
  const nameLower = name.toLowerCase();
  const image = (container.Image || '').toLowerCase();

  if (nameLower.includes('-app') || nameLower.includes('_app')) {
    type = 'app';
  } else if (
    nameLower.includes('-db') ||
    nameLower.includes('_db') ||
    nameLower.includes('postgres') ||
    image.includes('postgres')
  ) {
    type = 'db';
  } else if (
    nameLower.includes('-redis') ||
    nameLower.includes('_redis') ||
    image.includes('redis')
  ) {
    type = 'redis';
  }

  // 환경 추론
  let environment: Environment = 'staging';
  if (nameLower.includes('production') || nameLower.includes('prod')) {
    environment = 'production';
  } else if (nameLower.includes('preview') || nameLower.includes('pr-')) {
    environment = 'preview';
  }

  // 상태 매핑
  let status: 'running' | 'stopped' | 'exited' = 'stopped';
  const containerState = (container.State || '').toLowerCase();
  if (containerState === 'running') {
    status = 'running';
  } else if (containerState === 'exited') {
    status = 'exited';
  }

  return {
    id: container.Id || '',
    name,
    type,
    environment,
    ports,
    status,
    image: container.Image,
  };
}

/**
 * 컨테이너 이름에서 프로젝트 이름 추출
 */
function extractProjectName(containerName: string): string | null {
  // 패턴: projectname-environment-type 또는 projectname_environment_type
  // 예: warehouse-rental-staging-app, myapp_production_db

  const patterns = [
    /^(.+?)[-_](staging|production|preview|dev)[-_](app|db|redis|web|api)$/i,
    /^(.+?)[-_](staging|production|preview|dev)$/i,
    /^(.+?)[-_](app|db|redis|web|api)$/i,
  ];

  for (const pattern of patterns) {
    const match = containerName.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * 컨테이너 목록에서 프로젝트 정보 구축
 */
function buildProjectFromContainers(
  projectName: string,
  containers: ContainerRecord[]
): RegisteredProject {
  const project: RegisteredProject = {
    name: projectName,
    template: 'nodejs', // 기본값, 나중에 Dockerfile에서 추론 가능
    registeredAt: new Date().toISOString(),
    status: 'unknown',
    source: 'scan',
    environments: {},
    containers,
  };

  // 환경별 정보 구축
  const stagingContainers = containers.filter((c) => c.environment === 'staging');
  const productionContainers = containers.filter(
    (c) => c.environment === 'production'
  );

  if (stagingContainers.length > 0) {
    project.environments.staging = buildEnvironmentInfo(stagingContainers);
  }

  if (productionContainers.length > 0) {
    project.environments.production = buildEnvironmentInfo(productionContainers);
  }

  // 상태 결정 (하나라도 running이면 active)
  const hasRunning = containers.some((c) => c.status === 'running');
  project.status = hasRunning ? 'active' : 'inactive';

  return project;
}

/**
 * 컨테이너에서 환경 정보 구축
 */
function buildEnvironmentInfo(containers: ContainerRecord[]): DeployedEnvironment {
  const ports: EnvironmentPorts = {} as EnvironmentPorts;

  for (const container of containers) {
    if (container.type === 'app' && container.ports.length > 0) {
      ports.app = container.ports[0].host;
    } else if (container.type === 'db' && container.ports.length > 0) {
      ports.db = container.ports[0].host;
    } else if (container.type === 'redis' && container.ports.length > 0) {
      ports.redis = container.ports[0].host;
    }
  }

  const appContainer = containers.find((c) => c.type === 'app');
  const hasRunning = containers.some((c) => c.status === 'running');

  return {
    ports,
    containerName: appContainer?.name,
    imageTag: appContainer?.image,
    status: hasRunning ? 'running' : 'stopped',
  };
}

/**
 * 스캔 결과로 설정 파일 생성
 */
export async function generateConfigForProject(
  projectName: string
): Promise<{ success: boolean; configPath?: string; error?: string }> {
  const project = projectRegistry.getProject(projectName);
  if (!project) {
    return { success: false, error: `Project ${projectName} not found in registry` };
  }

  const ssh = getSSHClient();

  try {
    await ssh.connect();

    const projectPath = `${PROJECTS_BASE_PATH}/${projectName}`;
    const deployPath = `${projectPath}/deploy`;

    // 디렉토리 생성
    await ssh.mkdir(deployPath);

    // 설정 파일 생성
    const config: ProjectConfig = {
      version: '1.0',
      project: {
        name: projectName,
        template: project.template,
        repository: project.repository || '',
        createdAt: project.registeredAt,
      },
      server: {
        host: '141.164.60.51',
        user: 'codeb',
        basePath: projectPath,
      },
      environments: {
        staging: {
          ports: project.environments.staging?.ports || ({} as EnvironmentPorts),
          envFile: '.env.staging',
          replicas: 1,
          resources: { memory: '512Mi', cpu: '0.5' },
        },
        production: {
          ports: project.environments.production?.ports || ({} as EnvironmentPorts),
          envFile: '.env.production',
          replicas: 1,
          resources: { memory: '1Gi', cpu: '1' },
        },
      },
      ci: {
        enabled: true,
        stages: {
          lint: true,
          typecheck: true,
          unitTest: true,
          integrationTest: false,
          e2eTest: false,
          securityScan: true,
          buildVerify: true,
        },
      },
      healthCheck: {
        enabled: true,
        endpoint: '/api/health',
        timeout: 30,
        interval: 30,
        retries: 3,
        startPeriod: 40,
      },
      deployment: {
        strategy: 'rolling',
      },
      rollback: {
        enabled: true,
        automatic: true,
        keepVersions: 5,
        triggers: {
          healthCheckFail: true,
          errorRateThreshold: 5,
          latencyThreshold: 2000,
        },
      },
      monitoring: {
        enabled: true,
        prometheus: { enabled: false, scrapeInterval: 15, port: 9090 },
        grafana: { enabled: false, dashboards: [] },
      },
      notifications: {
        channels: [],
        events: {
          deployStart: true,
          deploySuccess: true,
          deployFail: true,
          rollback: true,
          healthCheckFail: true,
          securityAlert: true,
        },
      },
    };

    const configPath = `${deployPath}/config.json`;
    await ssh.writeFile(configPath, JSON.stringify(config, null, 2));

    // 레지스트리 업데이트
    projectRegistry.updateProject(projectName, { configPath });
    await saveProjectRegistryToServer();

    return { success: true, configPath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    ssh.disconnect();
  }
}

/**
 * 프로젝트 요약 정보
 */
export function getProjectRegistrySummary(): {
  totalProjects: number;
  activeProjects: number;
  inactiveProjects: number;
  projectsBySource: Record<string, number>;
  environmentCounts: { staging: number; production: number };
  lastUpdated: string | null;
} {
  const projects = projectRegistry.getAllProjects();

  const summary = {
    totalProjects: projects.length,
    activeProjects: projects.filter((p) => p.status === 'active').length,
    inactiveProjects: projects.filter((p) => p.status === 'inactive').length,
    projectsBySource: {} as Record<string, number>,
    environmentCounts: { staging: 0, production: 0 },
    lastUpdated: projectRegistry.lastUpdated?.toISOString() || null,
  };

  for (const project of projects) {
    summary.projectsBySource[project.source] =
      (summary.projectsBySource[project.source] || 0) + 1;

    if (project.environments.staging) summary.environmentCounts.staging++;
    if (project.environments.production) summary.environmentCounts.production++;
  }

  return summary;
}
