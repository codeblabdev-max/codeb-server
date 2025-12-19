/**
 * CodeB Deploy MCP - Port Manifest (GitOps 방식)
 * Single Source of Truth for port allocation
 *
 * 핵심 원칙:
 * 1. 모든 포트 변경은 Manifest를 통해서만 가능
 * 2. 배포 전 필수 검증 (강제)
 * 3. 드리프트 감지 및 자동 복구
 * 4. MCP 실패 시 폴백 처리
 */

import { getSSHClient } from './ssh-client.js';
import * as yaml from 'yaml';

// ============================================================================
// 타입 정의
// ============================================================================

export interface PortEntry {
  project: string;
  service: 'app' | 'db' | 'redis' | 'cache' | 'worker';
  status: 'active' | 'reserved' | 'pending' | 'released';
  container?: string;
  allocatedAt?: string;
  lastVerified?: string;
  metadata?: Record<string, any>;
}

export interface PortRule {
  name: string;
  enforce: boolean;
  action: 'reject' | 'warn' | 'auto-fix';
  params?: Record<string, any>;
}

export interface PortManifest {
  version: string;
  lastUpdated: string;
  ports: {
    staging: Record<number, PortEntry>;
    production: Record<number, PortEntry>;
    preview: Record<number, PortEntry>;
  };
  ranges: {
    staging: { app: [number, number]; db: [number, number]; redis: [number, number] };
    production: { app: [number, number]; db: [number, number]; redis: [number, number] };
    preview: { app: [number, number]; db: [number, number]; redis: [number, number] };
  };
  rules: PortRule[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  reservation?: PortReservation;
}

export interface ValidationError {
  code: string;
  message: string;
  port?: number;
  project?: string;
  conflictWith?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  suggestion?: string;
}

export interface PortReservation {
  port: number;
  project: string;
  environment: 'staging' | 'production' | 'preview';
  reservedAt: string;
  expiresAt: string;
  token: string;
}

export interface DriftReport {
  hasDrift: boolean;
  timestamp: string;
  drifts: DriftEntry[];
  summary: {
    added: number;      // 실제에만 있음 (매니페스트에 없음)
    removed: number;    // 매니페스트에만 있음 (실제에 없음)
    modified: number;   // 상태 불일치
  };
}

export interface DriftEntry {
  type: 'added' | 'removed' | 'modified';
  port: number;
  environment: string;
  expected?: PortEntry;
  actual?: {
    project?: string;
    container?: string;
    listening: boolean;
  };
  recommendation: string;
}

// ============================================================================
// 상수
// ============================================================================

const MANIFEST_PATH = '/home/codeb/config/port-manifest.yaml';
const RESERVATION_TTL = 5 * 60 * 1000; // 5분

const DEFAULT_MANIFEST: PortManifest = {
  version: '1.0.0',
  lastUpdated: new Date().toISOString(),
  ports: {
    staging: {},
    production: {},
    preview: {},
  },
  ranges: {
    // Synchronized with CLI (workflow.js) and port-registry.ts
    staging: { app: [3000, 3499], db: [5432, 5449], redis: [6379, 6399] },
    production: { app: [4000, 4499], db: [5450, 5469], redis: [6400, 6419] },
    preview: { app: [5000, 5999], db: [5470, 5499], redis: [6420, 6439] },
  },
  rules: [
    { name: 'no-duplicate-ports', enforce: true, action: 'reject' },
    { name: 'range-validation', enforce: true, action: 'reject' },
    { name: 'require-project-name', enforce: true, action: 'reject' },
    { name: 'max-ports-per-project', enforce: false, action: 'warn', params: { max: 10 } },
  ],
};

// ============================================================================
// In-memory 상태
// ============================================================================

let cachedManifest: PortManifest | null = null;
let lastLoadTime: Date | null = null;
// 캐시 TTL 단축: 배포 중 포트 충돌 방지를 위해 10초로 변경
// 이전: 60초 - 동시 배포 시 stale 데이터로 인한 충돌 발생
const CACHE_TTL = 10 * 1000; // 10초 캐시 (동시 배포 안전성 강화)

const activeReservations = new Map<string, PortReservation>(); // token -> reservation

// ============================================================================
// Manifest 관리
// ============================================================================

/**
 * 서버에서 매니페스트 로드
 */
export async function loadManifest(forceRefresh = false): Promise<PortManifest> {
  // 캐시 확인
  if (!forceRefresh && cachedManifest && lastLoadTime) {
    const age = Date.now() - lastLoadTime.getTime();
    if (age < CACHE_TTL) {
      return cachedManifest;
    }
  }

  const ssh = getSSHClient();

  try {
    await ssh.connect();

    const exists = await ssh.fileExists(MANIFEST_PATH);
    if (!exists) {
      console.error('[PortManifest] No manifest found, creating default');
      await saveManifest(DEFAULT_MANIFEST);
      cachedManifest = DEFAULT_MANIFEST;
      lastLoadTime = new Date();
      return DEFAULT_MANIFEST;
    }

    const content = await ssh.readFile(MANIFEST_PATH);
    const manifest = yaml.parse(content) as PortManifest;

    cachedManifest = manifest;
    lastLoadTime = new Date();

    console.error(`[PortManifest] Loaded: ${Object.keys(manifest.ports.staging).length} staging, ${Object.keys(manifest.ports.production).length} production ports`);

    return manifest;
  } catch (error) {
    console.error('[PortManifest] Failed to load:', error);
    // 로드 실패 시 캐시 반환 또는 기본값
    return cachedManifest || DEFAULT_MANIFEST;
  } finally {
    ssh.disconnect();
  }
}

/**
 * 매니페스트 저장
 */
export async function saveManifest(manifest: PortManifest): Promise<boolean> {
  const ssh = getSSHClient();

  try {
    await ssh.connect();

    // 디렉토리 확보
    await ssh.mkdir('/home/codeb/config');

    // 업데이트 시간 갱신
    manifest.lastUpdated = new Date().toISOString();

    // YAML로 저장
    const content = yaml.stringify(manifest, { indent: 2 });
    await ssh.writeFile(MANIFEST_PATH, content);

    // 캐시 업데이트
    cachedManifest = manifest;
    lastLoadTime = new Date();

    console.error('[PortManifest] Saved successfully');
    return true;
  } catch (error) {
    console.error('[PortManifest] Failed to save:', error);
    return false;
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// PortGuard - 강제 검증 레이어
// ============================================================================

export class PortGuard {
  private manifest: PortManifest | null = null;

  /**
   * 배포 전 필수 검증 (모든 배포는 이 함수를 통과해야 함)
   */
  async validateBeforeDeploy(
    projectName: string,
    port: number,
    environment: 'staging' | 'production' | 'preview',
    options: {
      service?: 'app' | 'db' | 'redis';
      skipServerCheck?: boolean;
      mcpAvailable?: boolean;
    } = {}
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      // 1. 매니페스트 로드
      this.manifest = await loadManifest(true); // 항상 최신 로드

      // 2. 기본 검증
      if (!projectName) {
        errors.push({
          code: 'MISSING_PROJECT',
          message: 'Project name is required',
        });
      }

      if (!port || port < 1 || port > 65535) {
        errors.push({
          code: 'INVALID_PORT',
          message: `Invalid port number: ${port}`,
          port,
        });
      }

      // 3. 범위 검증
      const rangeError = this.validateRange(port, environment, options.service || 'app');
      if (rangeError) {
        errors.push(rangeError);
      }

      // 4. 매니페스트 충돌 검사
      const manifestConflict = this.checkManifestConflict(port, environment, projectName);
      if (manifestConflict) {
        errors.push(manifestConflict);
      }

      // 5. 서버 실제 상태 검사 (MCP 실패 대비)
      if (!options.skipServerCheck) {
        const serverConflict = await this.checkServerConflict(port, projectName, options.mcpAvailable);
        if (serverConflict) {
          // MCP 불가 시 경고로 처리, 가능 시 에러로 처리
          if (options.mcpAvailable === false) {
            warnings.push({
              code: 'SERVER_CHECK_SKIPPED',
              message: 'MCP unavailable, server check performed via SSH fallback',
              suggestion: 'Verify port availability manually if deployment fails',
            });
          }
          if (serverConflict.code !== 'SERVER_CHECK_FAILED') {
            errors.push(serverConflict);
          }
        }
      }

      // 6. 기존 예약 확인
      const existingReservation = this.findActiveReservation(port, environment);
      if (existingReservation && existingReservation.project !== projectName) {
        errors.push({
          code: 'PORT_RESERVED',
          message: `Port ${port} is reserved by project '${existingReservation.project}'`,
          port,
          project: projectName,
          conflictWith: existingReservation.project,
        });
      }

      // 7. 검증 통과 시 예약 생성
      let reservation: PortReservation | undefined;
      if (errors.length === 0) {
        reservation = this.createReservation(port, projectName, environment);
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        reservation,
      };
    } catch (error) {
      // 전체 검증 실패 - 안전하게 거부
      errors.push({
        code: 'VALIDATION_FAILED',
        message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
      });

      return {
        valid: false,
        errors,
        warnings,
      };
    }
  }

  /**
   * 범위 검증
   */
  private validateRange(
    port: number,
    environment: 'staging' | 'production' | 'preview',
    service: 'app' | 'db' | 'redis'
  ): ValidationError | null {
    if (!this.manifest) return null;

    const ranges = this.manifest.ranges[environment];
    if (!ranges) return null;

    let range: [number, number] | undefined;

    if (service === 'app' || environment === 'preview') {
      range = ranges.app;
    } else if (service === 'db' && 'db' in ranges) {
      range = (ranges as any).db;
    } else if (service === 'redis' && 'redis' in ranges) {
      range = (ranges as any).redis;
    }

    if (range && (port < range[0] || port > range[1])) {
      return {
        code: 'OUT_OF_RANGE',
        message: `Port ${port} is outside ${environment}/${service} range [${range[0]}-${range[1]}]`,
        port,
      };
    }

    return null;
  }

  /**
   * 매니페스트 충돌 검사
   */
  private checkManifestConflict(
    port: number,
    environment: 'staging' | 'production' | 'preview',
    projectName: string
  ): ValidationError | null {
    if (!this.manifest) return null;

    const envPorts = this.manifest.ports[environment];
    const existing = envPorts[port];

    if (existing && existing.project !== projectName && existing.status !== 'released') {
      return {
        code: 'MANIFEST_CONFLICT',
        message: `Port ${port} is allocated to project '${existing.project}' in manifest`,
        port,
        project: projectName,
        conflictWith: existing.project,
      };
    }

    return null;
  }

  /**
   * 서버 실제 상태 검사 (MCP 실패 시 SSH 폴백)
   */
  private async checkServerConflict(
    port: number,
    projectName: string,
    mcpAvailable?: boolean
  ): Promise<ValidationError | null> {
    const ssh = getSSHClient();

    try {
      await ssh.connect();

      // 방법 1: ss로 리스닝 포트 확인
      const listenCheck = await ssh.exec(
        `ss -tlnp | grep ":${port} " | head -1`
      );

      if (listenCheck.stdout.trim()) {
        // 포트가 사용 중 - 어떤 프로세스인지 확인
        const processInfo = listenCheck.stdout.trim();

        // Podman 컨테이너인지 확인
        const containerCheck = await ssh.exec(
          `podman ps --format '{{.Names}}' --filter "publish=${port}" 2>/dev/null | head -1`
        );

        const containerName = containerCheck.stdout.trim();

        // 같은 프로젝트의 컨테이너면 OK (업데이트 케이스)
        if (containerName && containerName.includes(projectName)) {
          return null;
        }

        if (containerName) {
          return {
            code: 'PORT_IN_USE_CONTAINER',
            message: `Port ${port} is in use by container '${containerName}'`,
            port,
            conflictWith: containerName,
          };
        }

        return {
          code: 'PORT_IN_USE',
          message: `Port ${port} is in use: ${processInfo.substring(0, 100)}`,
          port,
        };
      }

      // 방법 2: iptables/nftables 규칙 확인 (CNI 충돌 감지)
      const iptablesCheck = await ssh.exec(
        `sudo iptables -t nat -L -n 2>/dev/null | grep "dpt:${port}" | head -1 || true`
      );

      if (iptablesCheck.stdout.trim()) {
        return {
          code: 'PORT_IPTABLES_CONFLICT',
          message: `Port ${port} has existing iptables NAT rule - potential CNI conflict`,
          port,
        };
      }

      return null;
    } catch (error) {
      console.error('[PortGuard] Server check failed:', error);
      // 서버 검사 실패 시 경고만 (배포 차단하지 않음)
      return {
        code: 'SERVER_CHECK_FAILED',
        message: `Could not verify port ${port} on server: ${error instanceof Error ? error.message : String(error)}`,
        port,
      };
    } finally {
      ssh.disconnect();
    }
  }

  /**
   * 활성 예약 찾기
   */
  private findActiveReservation(
    port: number,
    environment: string
  ): PortReservation | null {
    for (const reservation of activeReservations.values()) {
      if (reservation.port === port && reservation.environment === environment) {
        // 만료 확인
        if (new Date(reservation.expiresAt) > new Date()) {
          return reservation;
        } else {
          // 만료된 예약 정리
          activeReservations.delete(reservation.token);
        }
      }
    }
    return null;
  }

  /**
   * 예약 생성
   */
  private createReservation(
    port: number,
    project: string,
    environment: 'staging' | 'production' | 'preview'
  ): PortReservation {
    const token = `${project}-${port}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const reservation: PortReservation = {
      port,
      project,
      environment,
      reservedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + RESERVATION_TTL).toISOString(),
      token,
    };

    activeReservations.set(token, reservation);
    console.error(`[PortGuard] Created reservation: ${project}:${port} (token: ${token.substring(0, 16)}...)`);

    return reservation;
  }

  /**
   * 예약 완료 (배포 성공 후 호출)
   */
  async commitReservation(token: string): Promise<boolean> {
    const reservation = activeReservations.get(token);
    if (!reservation) {
      console.error('[PortGuard] Reservation not found:', token);
      return false;
    }

    try {
      const manifest = await loadManifest(true);

      // 매니페스트에 영구 등록
      manifest.ports[reservation.environment][reservation.port] = {
        project: reservation.project,
        service: 'app',
        status: 'active',
        allocatedAt: reservation.reservedAt,
        lastVerified: new Date().toISOString(),
      };

      await saveManifest(manifest);

      // 예약 정리
      activeReservations.delete(token);

      console.error(`[PortGuard] Committed reservation: ${reservation.project}:${reservation.port}`);
      return true;
    } catch (error) {
      console.error('[PortGuard] Failed to commit reservation:', error);
      return false;
    }
  }

  /**
   * 예약 취소 (배포 실패 시 호출)
   */
  releaseReservation(token: string): void {
    const reservation = activeReservations.get(token);
    if (reservation) {
      console.error(`[PortGuard] Released reservation: ${reservation.project}:${reservation.port}`);
      activeReservations.delete(token);
    }
  }
}

// ============================================================================
// GitOps 컨트롤러 - 드리프트 감지 및 수정
// ============================================================================

export class PortGitOpsController {
  /**
   * 드리프트 감지 (매니페스트 vs 실제 상태)
   */
  async detectDrift(): Promise<DriftReport> {
    const report: DriftReport = {
      hasDrift: false,
      timestamp: new Date().toISOString(),
      drifts: [],
      summary: { added: 0, removed: 0, modified: 0 },
    };

    const ssh = getSSHClient();

    try {
      await ssh.connect();

      // 1. 매니페스트 로드
      const manifest = await loadManifest(true);

      // 2. 서버 실제 포트 스캔
      const actualPorts = await this.scanActualPorts(ssh);

      // 3. 매니페스트 포트와 비교
      for (const env of ['staging', 'production', 'preview'] as const) {
        const manifestPorts = manifest.ports[env];

        // 매니페스트에 있는데 실제에 없음 (removed)
        for (const [portStr, entry] of Object.entries(manifestPorts)) {
          const port = parseInt(portStr);
          if (entry.status !== 'active') continue;

          const actual = actualPorts.get(port);
          if (!actual || !actual.listening) {
            report.drifts.push({
              type: 'removed',
              port,
              environment: env,
              expected: entry,
              actual: actual || { listening: false },
              recommendation: `Container for ${entry.project} on port ${port} is not running. Restart or remove from manifest.`,
            });
            report.summary.removed++;
          } else if (actual.project && actual.project !== entry.project) {
            // 다른 프로젝트가 사용 중 (modified)
            report.drifts.push({
              type: 'modified',
              port,
              environment: env,
              expected: entry,
              actual,
              recommendation: `Port ${port} is used by '${actual.project}' but manifest says '${entry.project}'. Update manifest or stop conflicting container.`,
            });
            report.summary.modified++;
          }
        }

        // 실제에 있는데 매니페스트에 없음 (added)
        for (const [port, actual] of actualPorts) {
          if (!actual.listening) continue;

          // 해당 환경 범위 확인
          const ranges = manifest.ranges[env];
          if (port < ranges.app[0] || port > ranges.app[1]) continue;

          if (!manifestPorts[port]) {
            report.drifts.push({
              type: 'added',
              port,
              environment: env,
              actual,
              recommendation: `Port ${port} is in use but not in manifest. Add to manifest or stop the service.`,
            });
            report.summary.added++;
          }
        }
      }

      report.hasDrift = report.drifts.length > 0;

      return report;
    } finally {
      ssh.disconnect();
    }
  }

  /**
   * 실제 포트 스캔
   */
  private async scanActualPorts(ssh: any): Promise<Map<number, { project?: string; container?: string; listening: boolean }>> {
    const result = new Map();

    try {
      // ss로 리스닝 포트 조회
      const ssResult = await ssh.exec(
        `ss -tlnp | grep LISTEN | awk '{print $4}' | grep -oE '[0-9]+$' | sort -nu`
      );

      const listeningPorts = ssResult.stdout.trim().split('\n')
        .filter(Boolean)
        .map((p: string) => parseInt(p))
        .filter((p: number) => !isNaN(p));

      for (const port of listeningPorts) {
        result.set(port, { listening: true });
      }

      // Podman 컨테이너 포트 매핑 조회
      const podmanResult = await ssh.exec(
        `podman ps --format '{{.Names}}|{{.Ports}}' 2>/dev/null || true`
      );

      for (const line of podmanResult.stdout.trim().split('\n').filter(Boolean)) {
        const [name, ports] = line.split('|');
        if (!ports) continue;

        // 포트 파싱: 0.0.0.0:3000->3000/tcp
        const portMatches = ports.matchAll(/(\d+)->(\d+)/g);
        for (const match of portMatches) {
          const hostPort = parseInt(match[1]);
          const existing = result.get(hostPort) || { listening: false };
          result.set(hostPort, {
            ...existing,
            container: name,
            project: this.extractProjectFromContainer(name),
            listening: true,
          });
        }
      }
    } catch (error) {
      console.error('[GitOps] Port scan failed:', error);
    }

    return result;
  }

  /**
   * 컨테이너 이름에서 프로젝트 추출
   */
  private extractProjectFromContainer(containerName: string): string | undefined {
    // 패턴: project-staging, project-production, project_app, etc.
    const patterns = [
      /^(.+?)-(staging|production|preview)$/,
      /^(.+?)_(app|web|api|db|redis)$/,
      /^(.+?)-\d+$/,
    ];

    for (const pattern of patterns) {
      const match = containerName.match(pattern);
      if (match) return match[1];
    }

    return containerName;
  }

  /**
   * 드리프트 자동 수정
   */
  async reconcile(options: { dryRun?: boolean; autoFix?: 'manifest' | 'server' | 'ask' } = {}): Promise<{
    success: boolean;
    actions: string[];
    errors: string[];
  }> {
    const actions: string[] = [];
    const errors: string[] = [];

    const report = await this.detectDrift();

    if (!report.hasDrift) {
      return { success: true, actions: ['No drift detected'], errors: [] };
    }

    const manifest = await loadManifest(true);

    for (const drift of report.drifts) {
      if (options.dryRun) {
        actions.push(`[DRY-RUN] Would fix: ${drift.type} - port ${drift.port} (${drift.environment})`);
        continue;
      }

      try {
        switch (drift.type) {
          case 'added':
            // 실제에만 있음 → 매니페스트에 추가
            if (options.autoFix === 'manifest' && drift.actual) {
              manifest.ports[drift.environment as keyof typeof manifest.ports][drift.port] = {
                project: drift.actual.project || 'unknown',
                service: 'app',
                status: 'active',
                container: drift.actual.container,
                allocatedAt: new Date().toISOString(),
              };
              actions.push(`Added port ${drift.port} to manifest (project: ${drift.actual.project})`);
            }
            break;

          case 'removed':
            // 매니페스트에만 있음 → 상태를 released로 변경
            if (options.autoFix === 'manifest') {
              manifest.ports[drift.environment as keyof typeof manifest.ports][drift.port].status = 'released';
              actions.push(`Marked port ${drift.port} as released in manifest`);
            }
            break;

          case 'modified':
            // 충돌 → 경고만 (수동 해결 필요)
            actions.push(`CONFLICT: Port ${drift.port} needs manual resolution`);
            break;
        }
      } catch (error) {
        errors.push(`Failed to fix drift for port ${drift.port}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 매니페스트 저장
    if (!options.dryRun && options.autoFix === 'manifest') {
      await saveManifest(manifest);
    }

    return {
      success: errors.length === 0,
      actions,
      errors,
    };
  }
}

// ============================================================================
// 헬퍼 함수
// ============================================================================

/**
 * 다음 사용 가능한 포트 찾기
 */
export async function findNextAvailablePort(
  environment: 'staging' | 'production' | 'preview',
  service: 'app' | 'db' | 'redis' = 'app'
): Promise<number> {
  const manifest = await loadManifest();
  const ranges = manifest.ranges[environment];

  let range: [number, number];
  if (service === 'app' || environment === 'preview') {
    range = ranges.app;
  } else if (service === 'db' && 'db' in ranges) {
    range = (ranges as any).db;
  } else if (service === 'redis' && 'redis' in ranges) {
    range = (ranges as any).redis;
  } else {
    range = ranges.app;
  }

  const usedPorts = new Set(
    Object.keys(manifest.ports[environment])
      .map(p => parseInt(p))
      .filter(p => manifest.ports[environment][p].status !== 'released')
  );

  for (let port = range[0]; port <= range[1]; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }

  throw new Error(`No available ${service} port for ${environment} in range [${range[0]}-${range[1]}]`);
}

/**
 * 포트 해제 (프로젝트 삭제 시)
 */
export async function releasePort(
  port: number,
  environment: 'staging' | 'production' | 'preview'
): Promise<boolean> {
  const manifest = await loadManifest(true);

  if (manifest.ports[environment][port]) {
    manifest.ports[environment][port].status = 'released';
    manifest.ports[environment][port].lastVerified = new Date().toISOString();
    return await saveManifest(manifest);
  }

  return false;
}

// ============================================================================
// 싱글톤 인스턴스
// ============================================================================

export const portGuard = new PortGuard();
export const portGitOps = new PortGitOpsController();
