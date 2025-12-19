/**
 * CodeB Deploy MCP - 포트 레지스트리
 * 환경별 포트 관리 및 자동 할당
 * 서버 파일 기반 영구 저장 지원
 */

import type {
  PortAllocation,
  PortRanges,
  PortStatus,
  EnvironmentPorts,
} from './types.js';
import { getSSHClient } from './ssh-client.js';

// 서버 레지스트리 파일 경로
const REGISTRY_FILE = '/home/codeb/config/port-registry.json';

// 기본 포트 범위 (환경별 분리)
// CLI (workflow.js)와 동기화됨 - 변경 시 양쪽 모두 수정 필요
const DEFAULT_PORT_RANGES: PortRanges = {
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
    db: { start: 5470, end: 5499 },    // Added for preview DB support
    redis: { start: 6420, end: 6439 }, // Added for preview Redis support
  },
};

export class PortRegistry {
  private portRanges: PortRanges;
  // public으로 변경하여 외부에서 직렬화/역직렬화 가능
  public usedPorts: Set<number> = new Set();
  public allocations: Map<string, PortAllocation> = new Map();
  public previewAllocations: Map<string, number> = new Map(); // PR ID → Port
  public lastUpdated: Date | null = null;

  constructor(portRanges?: Partial<PortRanges>) {
    this.portRanges = {
      staging: { ...DEFAULT_PORT_RANGES.staging, ...portRanges?.staging },
      production: { ...DEFAULT_PORT_RANGES.production, ...portRanges?.production },
      preview: { ...DEFAULT_PORT_RANGES.preview, ...portRanges?.preview },
    };
  }

  /**
   * 서버에서 수집한 포트 상태로 업데이트
   */
  updateFromServerStatus(portStatus: PortStatus): void {
    this.usedPorts = new Set(portStatus.used);
    this.lastUpdated = new Date();
  }

  /**
   * 사용 중인 포트 목록 직접 설정
   */
  setUsedPorts(ports: number[]): void {
    this.usedPorts = new Set(ports);
    this.lastUpdated = new Date();
  }

  /**
   * 사용 가능한 포트 찾기
   */
  private findAvailablePort(
    env: 'staging' | 'production' | 'preview',
    type: 'app' | 'db' | 'redis'
  ): number {
    const ranges = this.portRanges[env];
    const range = type === 'app' ? ranges.app :
                  env === 'preview' ? ranges.app :
                  (ranges as typeof DEFAULT_PORT_RANGES.staging)[type];

    if (!range) {
      throw new Error(`No port range defined for ${env}/${type}`);
    }

    for (let port = range.start; port <= range.end; port++) {
      if (!this.usedPorts.has(port)) {
        return port;
      }
    }

    throw new Error(`No available ${type} port for ${env} in range ${range.start}-${range.end}`);
  }

  /**
   * 프로젝트에 환경별 포트 할당
   */
  allocateProjectPorts(
    projectName: string,
    services: { app: boolean; db: boolean; redis: boolean }
  ): PortAllocation {
    // 기존 할당 확인
    const existing = this.allocations.get(projectName);
    if (existing) {
      return existing;
    }

    const allocation: PortAllocation = {
      projectName,
      environments: {
        staging: {} as EnvironmentPorts,
        production: {} as EnvironmentPorts,
      },
      allocatedAt: new Date().toISOString(),
    };

    // Staging 포트 할당
    if (services.app) {
      allocation.environments.staging.app = this.findAvailablePort('staging', 'app');
      this.usedPorts.add(allocation.environments.staging.app);
    }
    if (services.db) {
      allocation.environments.staging.db = this.findAvailablePort('staging', 'db');
      this.usedPorts.add(allocation.environments.staging.db);
    }
    if (services.redis) {
      allocation.environments.staging.redis = this.findAvailablePort('staging', 'redis');
      this.usedPorts.add(allocation.environments.staging.redis);
    }

    // Production 포트 할당
    if (services.app) {
      allocation.environments.production.app = this.findAvailablePort('production', 'app');
      this.usedPorts.add(allocation.environments.production.app);
    }
    if (services.db) {
      allocation.environments.production.db = this.findAvailablePort('production', 'db');
      this.usedPorts.add(allocation.environments.production.db);
    }
    if (services.redis) {
      allocation.environments.production.redis = this.findAvailablePort('production', 'redis');
      this.usedPorts.add(allocation.environments.production.redis);
    }

    this.allocations.set(projectName, allocation);
    return allocation;
  }

  /**
   * Preview 환경 포트 할당 (PR별)
   */
  allocatePreviewPort(prId: string): number {
    const existing = this.previewAllocations.get(prId);
    if (existing) {
      return existing;
    }

    const port = this.findAvailablePort('preview', 'app');
    this.usedPorts.add(port);
    this.previewAllocations.set(prId, port);
    return port;
  }

  /**
   * Preview 환경 포트 해제
   */
  deallocatePreviewPort(prId: string): void {
    const port = this.previewAllocations.get(prId);
    if (port) {
      this.usedPorts.delete(port);
      this.previewAllocations.delete(prId);
    }
  }

  /**
   * 프로젝트 포트 할당 해제
   */
  deallocateProject(projectName: string): void {
    const allocation = this.allocations.get(projectName);
    if (!allocation) return;

    // Staging 포트 해제
    const staging = allocation.environments.staging;
    if (staging.app) this.usedPorts.delete(staging.app);
    if (staging.db) this.usedPorts.delete(staging.db);
    if (staging.redis) this.usedPorts.delete(staging.redis);

    // Production 포트 해제
    const prod = allocation.environments.production;
    if (prod.app) this.usedPorts.delete(prod.app);
    if (prod.db) this.usedPorts.delete(prod.db);
    if (prod.redis) this.usedPorts.delete(prod.redis);

    this.allocations.delete(projectName);
  }

  /**
   * 프로젝트 할당 조회
   */
  getProjectAllocation(projectName: string): PortAllocation | undefined {
    return this.allocations.get(projectName);
  }

  /**
   * 환경별 포트 조회
   */
  getEnvironmentPorts(
    projectName: string,
    environment: 'staging' | 'production'
  ): EnvironmentPorts | undefined {
    const allocation = this.allocations.get(projectName);
    return allocation?.environments[environment];
  }

  /**
   * 모든 할당 조회
   */
  getAllAllocations(): PortAllocation[] {
    return Array.from(this.allocations.values());
  }

  /**
   * 사용 가능한 포트 미리보기
   */
  getAvailablePorts(
    env: 'staging' | 'production' | 'preview',
    type: 'app' | 'db' | 'redis',
    count: number = 5
  ): number[] {
    const ranges = this.portRanges[env];
    const range = type === 'app' ? ranges.app :
                  env === 'preview' ? ranges.app :
                  (ranges as typeof DEFAULT_PORT_RANGES.staging)[type];

    if (!range) return [];

    const available: number[] = [];
    for (let port = range.start; port <= range.end && available.length < count; port++) {
      if (!this.usedPorts.has(port)) {
        available.push(port);
      }
    }
    return available;
  }

  /**
   * 포트 상태 요약
   */
  getSummary(): {
    totalUsed: number;
    projectAllocations: number;
    previewAllocations: number;
    availableByEnv: Record<string, Record<string, number>>;
    lastUpdated: string | null;
  } {
    const calcAvailable = (env: 'staging' | 'production' | 'preview', type: 'app' | 'db' | 'redis') => {
      const ranges = this.portRanges[env];
      const range = type === 'app' ? ranges.app :
                    env === 'preview' ? ranges.app :
                    (ranges as typeof DEFAULT_PORT_RANGES.staging)[type];
      if (!range) return 0;

      let count = 0;
      for (let port = range.start; port <= range.end; port++) {
        if (!this.usedPorts.has(port)) count++;
      }
      return count;
    };

    return {
      totalUsed: this.usedPorts.size,
      projectAllocations: this.allocations.size,
      previewAllocations: this.previewAllocations.size,
      availableByEnv: {
        staging: {
          app: calcAvailable('staging', 'app'),
          db: calcAvailable('staging', 'db'),
          redis: calcAvailable('staging', 'redis'),
        },
        production: {
          app: calcAvailable('production', 'app'),
          db: calcAvailable('production', 'db'),
          redis: calcAvailable('production', 'redis'),
        },
        preview: {
          app: calcAvailable('preview', 'app'),
        },
      },
      lastUpdated: this.lastUpdated?.toISOString() || null,
    };
  }

  /**
   * 포트 범위 설정 조회
   */
  getPortRanges(): PortRanges {
    return JSON.parse(JSON.stringify(this.portRanges));
  }

  /**
   * 사용 중인 모든 포트
   */
  getUsedPorts(): number[] {
    return Array.from(this.usedPorts).sort((a, b) => a - b);
  }

  /**
   * JSON으로 내보내기 (지속성)
   */
  toJSON(): object {
    return {
      portRanges: this.portRanges,
      usedPorts: Array.from(this.usedPorts),
      allocations: Array.from(this.allocations.entries()),
      previewAllocations: Array.from(this.previewAllocations.entries()),
      lastUpdated: this.lastUpdated?.toISOString(),
    };
  }

  /**
   * JSON에서 복원
   */
  static fromJSON(data: {
    portRanges?: PortRanges;
    usedPorts?: number[];
    allocations?: [string, PortAllocation][];
    previewAllocations?: [string, number][];
    lastUpdated?: string;
  }): PortRegistry {
    const registry = new PortRegistry(data.portRanges);
    registry.usedPorts = new Set(data.usedPorts || []);
    registry.allocations = new Map(data.allocations || []);
    registry.previewAllocations = new Map(data.previewAllocations || []);
    registry.lastUpdated = data.lastUpdated ? new Date(data.lastUpdated) : null;
    return registry;
  }
}

// 글로벌 인스턴스
export const portRegistry = new PortRegistry();

/**
 * 서버에서 포트 레지스트리 로드
 */
export async function loadPortRegistryFromServer(): Promise<void> {
  const ssh = getSSHClient();

  try {
    await ssh.connect();

    // 레지스트리 파일 존재 확인
    const exists = await ssh.fileExists(REGISTRY_FILE);
    if (!exists) {
      console.error('[PortRegistry] No registry file found, using defaults');
      return;
    }

    // 파일 읽기
    const content = await ssh.readFile(REGISTRY_FILE);
    const data = JSON.parse(content);

    // 레지스트리 복원
    portRegistry.usedPorts = new Set(data.usedPorts || []);
    portRegistry.allocations = new Map(data.allocations || []);
    portRegistry.previewAllocations = new Map(data.previewAllocations || []);
    portRegistry.lastUpdated = data.lastUpdated ? new Date(data.lastUpdated) : null;

    console.error(`[PortRegistry] Loaded from server: ${portRegistry.usedPorts.size} ports in use`);
  } catch (error) {
    console.error('[PortRegistry] Failed to load from server:', error);
  } finally {
    ssh.disconnect();
  }
}

/**
 * 서버에 포트 레지스트리 저장
 */
export async function savePortRegistryToServer(): Promise<void> {
  const ssh = getSSHClient();

  try {
    await ssh.connect();

    // 디렉토리 확보
    await ssh.mkdir('/home/codeb/config');

    // 레지스트리 데이터 직렬화
    const data = {
      portRanges: portRegistry.getPortRanges(),
      usedPorts: portRegistry.getUsedPorts(),
      allocations: Array.from(portRegistry.allocations.entries()),
      previewAllocations: Array.from(portRegistry.previewAllocations.entries()),
      lastUpdated: new Date().toISOString(),
    };

    // 파일 저장
    await ssh.writeFile(REGISTRY_FILE, JSON.stringify(data, null, 2));

    console.error(`[PortRegistry] Saved to server: ${data.usedPorts.length} ports`);
  } catch (error) {
    console.error('[PortRegistry] Failed to save to server:', error);
  } finally {
    ssh.disconnect();
  }
}

/**
 * 서버에서 실제 사용 중인 포트 스캔 후 레지스트리 동기화
 */
export async function syncPortRegistryWithServer(): Promise<{
  added: number[];
  removed: number[];
  total: number;
}> {
  const ssh = getSSHClient();

  try {
    await ssh.connect();

    // 서버에서 실제 사용 중인 포트 조회
    const result = await ssh.exec(
      "ss -tlnp | grep LISTEN | awk '{print $4}' | grep -oE '[0-9]+$' | sort -n | uniq"
    );

    const actualPorts = result.stdout
      .split('\n')
      .filter((p) => p.trim())
      .map((p) => parseInt(p))
      .filter((p) => !isNaN(p));

    const actualSet = new Set(actualPorts);
    const registrySet = new Set(portRegistry.getUsedPorts());

    // 차이 계산
    const added = actualPorts.filter((p) => !registrySet.has(p));
    const removed = portRegistry.getUsedPorts().filter((p) => !actualSet.has(p));

    // 레지스트리 업데이트
    portRegistry.setUsedPorts(actualPorts);

    // 서버에 저장
    await savePortRegistryToServer();

    return {
      added,
      removed,
      total: actualPorts.length,
    };
  } finally {
    ssh.disconnect();
  }
}
