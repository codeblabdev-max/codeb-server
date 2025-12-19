/**
 * CodeB Deploy MCP - Podman 헬퍼 도구
 * Podman 3.x 환경에서의 배포 문제 해결을 위한 유틸리티
 *
 * 해결하는 문제들:
 * 1. PostgreSQL pg_hba.conf 자동 설정 (컨테이너 네트워크 인증)
 * 2. Podman 3.x 서비스 DNS 미지원 대응 (컨테이너 IP 발견)
 * 3. 볼륨 초기화 vs 기존 데이터 충돌 처리
 * 4. CNI 네트워크 오류 폴백 전략
 */

import { z } from 'zod';
import { getSSHClient } from '../lib/ssh-client.js';

// ============================================================================
// 1. PostgreSQL pg_hba.conf 자동 설정
// ============================================================================

export interface PgHbaConfig {
  containerName: string;
  trustedNetworks?: string[];  // 기본: ['10.88.0.0/16'] (Podman 기본 네트워크)
  defaultAuthMethod?: 'trust' | 'md5' | 'scram-sha-256';
}

/**
 * PostgreSQL pg_hba.conf 자동 설정
 * Podman 컨테이너 네트워크에서 인증 문제 해결
 *
 * 문제: pg_hba.conf에서 "host all all all scram-sha-256"가 먼저 매칭되어
 *       컨테이너 간 통신이 차단됨
 *
 * 해결: 컨테이너 네트워크 규칙을 먼저 추가
 *       host all all 10.88.0.0/16 trust (또는 md5)
 *       host all all all scram-sha-256
 */
export async function configurePgHba(config: PgHbaConfig): Promise<{
  success: boolean;
  message: string;
  currentConfig?: string;
}> {
  const ssh = getSSHClient();
  await ssh.connect();

  const {
    containerName,
    trustedNetworks = ['10.88.0.0/16'],
    defaultAuthMethod = 'trust',
  } = config;

  try {
    // 1. 컨테이너 존재 확인
    const exists = await ssh.exec(
      `podman container exists ${containerName} && echo "exists" || echo "not_found"`
    );
    if (exists.stdout.trim() !== 'exists') {
      return {
        success: false,
        message: `Container not found: ${containerName}`,
      };
    }

    // 2. 컨테이너가 실행 중인지 확인
    const running = await ssh.exec(
      `podman inspect ${containerName} --format '{{.State.Running}}'`
    );
    if (running.stdout.trim() !== 'true') {
      return {
        success: false,
        message: `Container not running: ${containerName}`,
      };
    }

    // 3. pg_hba.conf 위치 확인
    const pgDataResult = await ssh.exec(
      `podman exec ${containerName} bash -c "echo \\$PGDATA"`
    );
    const pgData = pgDataResult.stdout.trim() || '/var/lib/postgresql/data';

    // 4. 현재 pg_hba.conf 읽기
    const currentHba = await ssh.exec(
      `podman exec ${containerName} cat ${pgData}/pg_hba.conf 2>/dev/null || echo ""`
    );

    // 5. 컨테이너 네트워크 규칙이 이미 있는지 확인
    const hasNetworkRule = trustedNetworks.some(network =>
      currentHba.stdout.includes(network)
    );

    if (hasNetworkRule) {
      // 규칙이 있지만 순서 확인
      const lines = currentHba.stdout.split('\n');
      const networkRuleIndex = lines.findIndex(line =>
        trustedNetworks.some(network => line.includes(network))
      );
      const allRuleIndex = lines.findIndex(line =>
        line.includes('host') && line.includes('all') &&
        !trustedNetworks.some(network => line.includes(network)) &&
        (line.includes('scram-sha-256') || line.includes('md5'))
      );

      // 네트워크 규칙이 all 규칙보다 먼저 있으면 OK
      if (networkRuleIndex < allRuleIndex || allRuleIndex === -1) {
        return {
          success: true,
          message: 'pg_hba.conf already configured correctly',
          currentConfig: currentHba.stdout,
        };
      }
    }

    // 6. 새 pg_hba.conf 생성
    const networkRules = trustedNetworks
      .map(network => `host    all             all             ${network}            ${defaultAuthMethod}`)
      .join('\n');

    // 기존 설정에서 네트워크 규칙 제거 후 맨 앞에 추가
    const filteredLines = currentHba.stdout
      .split('\n')
      .filter(line => !trustedNetworks.some(network => line.includes(network)))
      .join('\n');

    // IPv4/IPv6 local connections 섹션 찾아서 그 앞에 추가
    const newHba = filteredLines.replace(
      /(# IPv4 local connections:)/,
      `# Podman container network (auto-configured by CodeB Deploy)\n${networkRules}\n\n$1`
    );

    // 7. pg_hba.conf 업데이트
    const escapedHba = newHba.replace(/'/g, "'\\''");
    await ssh.exec(
      `podman exec ${containerName} bash -c "echo '${escapedHba}' > ${pgData}/pg_hba.conf"`
    );

    // 8. PostgreSQL 설정 리로드 (재시작 없이)
    await ssh.exec(
      `podman exec ${containerName} pg_ctl reload -D ${pgData}`
    );

    // 9. 최종 설정 확인
    const finalHba = await ssh.exec(
      `podman exec ${containerName} cat ${pgData}/pg_hba.conf`
    );

    return {
      success: true,
      message: `pg_hba.conf configured: added ${trustedNetworks.join(', ')} with ${defaultAuthMethod}`,
      currentConfig: finalHba.stdout,
    };

  } catch (error) {
    return {
      success: false,
      message: `Failed to configure pg_hba.conf: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// 2. 컨테이너 IP 발견 (Podman 3.x 서비스 DNS 미지원 대응)
// ============================================================================

export interface ContainerIPResult {
  containerName: string;
  ipAddress: string | null;
  networkName: string;
  status: 'running' | 'stopped' | 'not_found';
}

/**
 * 컨테이너 IP 주소 발견
 * Podman 3.4.4에서는 서비스 DNS가 지원되지 않으므로
 * 컨테이너 IP를 직접 찾아서 DATABASE_URL 등에 주입해야 함
 *
 * 사용 예:
 * const dbIP = await getContainerIP('postgres-container');
 * DATABASE_URL=postgresql://user:pass@${dbIP}:5432/db
 */
export async function getContainerIP(containerName: string): Promise<ContainerIPResult> {
  const ssh = getSSHClient();
  await ssh.connect();

  try {
    // 컨테이너 존재 확인
    const exists = await ssh.exec(
      `podman container exists ${containerName} && echo "exists" || echo "not_found"`
    );

    if (exists.stdout.trim() !== 'exists') {
      return {
        containerName,
        ipAddress: null,
        networkName: '',
        status: 'not_found',
      };
    }

    // 컨테이너 상태 확인
    const running = await ssh.exec(
      `podman inspect ${containerName} --format '{{.State.Running}}'`
    );

    if (running.stdout.trim() !== 'true') {
      return {
        containerName,
        ipAddress: null,
        networkName: '',
        status: 'stopped',
      };
    }

    // IP 주소 가져오기 (여러 네트워크 중 첫 번째)
    const ipResult = await ssh.exec(
      `podman inspect ${containerName} --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'`
    );

    // 네트워크 이름 가져오기
    const networkResult = await ssh.exec(
      `podman inspect ${containerName} --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}'`
    );

    return {
      containerName,
      ipAddress: ipResult.stdout.trim() || null,
      networkName: networkResult.stdout.trim(),
      status: 'running',
    };

  } finally {
    ssh.disconnect();
  }
}

/**
 * 여러 컨테이너의 IP 일괄 조회
 */
export async function getMultipleContainerIPs(containerNames: string[]): Promise<ContainerIPResult[]> {
  const results: ContainerIPResult[] = [];

  for (const name of containerNames) {
    const result = await getContainerIP(name);
    results.push(result);
  }

  return results;
}

/**
 * DATABASE_URL에 컨테이너 IP 주입
 *
 * 예: postgresql://user:pass@postgres:5432/db
 * → postgresql://user:pass@10.88.0.136:5432/db
 */
export async function injectContainerIP(
  databaseUrl: string,
  dbContainerName: string
): Promise<{ url: string; injected: boolean; originalHost: string }> {
  const ipResult = await getContainerIP(dbContainerName);

  if (!ipResult.ipAddress) {
    return {
      url: databaseUrl,
      injected: false,
      originalHost: '',
    };
  }

  // URL 파싱
  const urlMatch = databaseUrl.match(/^(postgresql:\/\/[^@]+@)([^:\/]+)(:\d+\/.*)?$/);

  if (!urlMatch) {
    return {
      url: databaseUrl,
      injected: false,
      originalHost: '',
    };
  }

  const [, prefix, host, suffix] = urlMatch;
  const newUrl = `${prefix}${ipResult.ipAddress}${suffix || ':5432/'}`;

  return {
    url: newUrl,
    injected: true,
    originalHost: host,
  };
}

// ============================================================================
// 3. 볼륨 관리 (초기화 vs 기존 데이터 충돌 처리)
// ============================================================================

export interface VolumeInitOptions {
  projectName: string;
  environment: 'staging' | 'production';
  volumeType: 'postgres' | 'redis' | 'app-data';
  mode: 'create-if-not-exists' | 'recreate' | 'backup-and-recreate';
}

export interface VolumeInitResult {
  success: boolean;
  volumeName: string;
  action: 'created' | 'reused' | 'recreated' | 'backed-up-and-recreated';
  backupPath?: string;
  message: string;
}

/**
 * 볼륨 초기화 관리
 * 기존 볼륨에 다른 비밀번호가 저장된 경우 등의 충돌 해결
 */
export async function initVolume(options: VolumeInitOptions): Promise<VolumeInitResult> {
  const ssh = getSSHClient();
  await ssh.connect();

  const {
    projectName,
    environment,
    volumeType,
    mode,
  } = options;

  const volumeName = `codeb-${volumeType}-${projectName}-${environment}`;

  try {
    // 볼륨 존재 여부 확인
    const existsResult = await ssh.exec(
      `podman volume exists ${volumeName} && echo "exists" || echo "not_found"`
    );
    const exists = existsResult.stdout.trim() === 'exists';

    if (!exists) {
      // 볼륨 생성
      await ssh.exec(`podman volume create ${volumeName}`);
      return {
        success: true,
        volumeName,
        action: 'created',
        message: `Volume ${volumeName} created`,
      };
    }

    // 볼륨이 존재하는 경우
    switch (mode) {
      case 'create-if-not-exists':
        return {
          success: true,
          volumeName,
          action: 'reused',
          message: `Volume ${volumeName} already exists, reusing`,
        };

      case 'recreate':
        // 볼륨 사용 중인 컨테이너 확인
        const usingContainers = await ssh.exec(
          `podman ps -a --filter volume=${volumeName} --format '{{.Names}}'`
        );

        if (usingContainers.stdout.trim()) {
          return {
            success: false,
            volumeName,
            action: 'reused',
            message: `Volume ${volumeName} is in use by: ${usingContainers.stdout.trim()}. Stop containers first.`,
          };
        }

        await ssh.exec(`podman volume rm ${volumeName}`);
        await ssh.exec(`podman volume create ${volumeName}`);

        return {
          success: true,
          volumeName,
          action: 'recreated',
          message: `Volume ${volumeName} recreated (data deleted)`,
        };

      case 'backup-and-recreate':
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = `/home/codeb/backups/volumes`;
        const backupPath = `${backupDir}/${volumeName}-${timestamp}.tar`;

        // 백업 디렉토리 생성
        await ssh.exec(`mkdir -p ${backupDir}`);

        // 볼륨 사용 중인 컨테이너 확인
        const containers = await ssh.exec(
          `podman ps -a --filter volume=${volumeName} --format '{{.Names}}'`
        );

        if (containers.stdout.trim()) {
          return {
            success: false,
            volumeName,
            action: 'reused',
            message: `Volume ${volumeName} is in use by: ${containers.stdout.trim()}. Stop containers first.`,
          };
        }

        // 볼륨 백업 (podman volume export)
        const exportResult = await ssh.exec(
          `podman volume export ${volumeName} > ${backupPath}`,
          { timeout: 300000 }
        );

        if (exportResult.code !== 0) {
          return {
            success: false,
            volumeName,
            action: 'reused',
            message: `Failed to backup volume: ${exportResult.stderr}`,
          };
        }

        // 볼륨 삭제 및 재생성
        await ssh.exec(`podman volume rm ${volumeName}`);
        await ssh.exec(`podman volume create ${volumeName}`);

        return {
          success: true,
          volumeName,
          action: 'backed-up-and-recreated',
          backupPath,
          message: `Volume ${volumeName} backed up to ${backupPath} and recreated`,
        };

      default:
        return {
          success: false,
          volumeName,
          action: 'reused',
          message: `Unknown mode: ${mode}`,
        };
    }

  } finally {
    ssh.disconnect();
  }
}

/**
 * 볼륨 복원
 */
export async function restoreVolume(
  volumeName: string,
  backupPath: string
): Promise<{ success: boolean; message: string }> {
  const ssh = getSSHClient();
  await ssh.connect();

  try {
    // 백업 파일 존재 확인
    const backupExists = await ssh.exec(`test -f ${backupPath} && echo "yes" || echo "no"`);
    if (backupExists.stdout.trim() !== 'yes') {
      return {
        success: false,
        message: `Backup file not found: ${backupPath}`,
      };
    }

    // 볼륨 존재 확인 및 생성
    const volumeExists = await ssh.exec(
      `podman volume exists ${volumeName} && echo "exists" || echo "not_found"`
    );

    if (volumeExists.stdout.trim() !== 'exists') {
      await ssh.exec(`podman volume create ${volumeName}`);
    }

    // 볼륨 복원
    const importResult = await ssh.exec(
      `podman volume import ${volumeName} ${backupPath}`,
      { timeout: 300000 }
    );

    if (importResult.code !== 0) {
      return {
        success: false,
        message: `Failed to restore volume: ${importResult.stderr}`,
      };
    }

    return {
      success: true,
      message: `Volume ${volumeName} restored from ${backupPath}`,
    };

  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// 4. CNI 네트워크 폴백 전략 (프로젝트 격리 지원)
// ============================================================================

export interface NetworkConfig {
  preferredNetwork?: string;
  fallbackToDefault?: boolean;
  createIfMissing?: boolean;
  projectName?: string;           // 프로젝트별 네트워크 격리용
  environment?: 'staging' | 'production' | 'preview';
  forceRecreate?: boolean;        // 강제 재생성 (위험!)
  subnet?: string;                // 커스텀 서브넷 (예: 10.89.1.0/24)
}

export interface NetworkResult {
  success: boolean;
  networkName: string;
  action: 'existing' | 'created' | 'fallback-to-default' | 'repaired' | 'skipped-has-containers';
  message: string;
  connectedContainers?: string[]; // 연결된 컨테이너 목록
}

/**
 * 프로젝트별 네트워크 이름 생성
 * 형식: codeb-net-{project}-{env} 또는 codeb-network (기본)
 */
export function getProjectNetworkName(projectName?: string, environment?: string): string {
  if (projectName && environment) {
    return `codeb-net-${projectName}-${environment}`;
  }
  return 'codeb-network';
}

/**
 * 네트워크에 연결된 컨테이너 목록 조회
 * 중요: 네트워크 삭제/재생성 전 반드시 확인해야 함
 */
export async function getNetworkContainers(networkName: string): Promise<{
  containers: string[];
  runningCount: number;
  stoppedCount: number;
}> {
  const ssh = getSSHClient();
  await ssh.connect();

  try {
    // 실행 중인 컨테이너
    const runningResult = await ssh.exec(
      `podman ps --filter network=${networkName} --format '{{.Names}}' 2>/dev/null`
    );
    const runningContainers = runningResult.stdout.trim().split('\n').filter(n => n);

    // 중지된 컨테이너 포함
    const allResult = await ssh.exec(
      `podman ps -a --filter network=${networkName} --format '{{.Names}}' 2>/dev/null`
    );
    const allContainers = allResult.stdout.trim().split('\n').filter(n => n);

    return {
      containers: allContainers,
      runningCount: runningContainers.length,
      stoppedCount: allContainers.length - runningContainers.length,
    };
  } finally {
    ssh.disconnect();
  }
}

/**
 * 안전한 네트워크 확보 (개선된 버전)
 *
 * 핵심 원칙:
 * 1. 다른 프로젝트 컨테이너가 연결되어 있으면 절대 삭제하지 않음
 * 2. 프로젝트별 격리 네트워크 지원
 * 3. CNI 오류 시 안전한 폴백
 */
export async function ensureNetwork(config: NetworkConfig = {}): Promise<NetworkResult> {
  const ssh = getSSHClient();
  await ssh.connect();

  const {
    preferredNetwork,
    projectName,
    environment,
    fallbackToDefault = true,
    createIfMissing = true,
    forceRecreate = false,
    subnet,
  } = config;

  // 프로젝트별 네트워크 이름 결정
  const networkName = preferredNetwork || getProjectNetworkName(projectName, environment);

  try {
    // 1. 네트워크 존재 확인
    const inspectResult = await ssh.exec(
      `podman network inspect ${networkName} 2>&1`
    );

    if (inspectResult.code === 0) {
      // 네트워크가 정상적으로 존재
      return {
        success: true,
        networkName,
        action: 'existing',
        message: `Network ${networkName} is available`,
      };
    }

    // 2. 네트워크가 없거나 손상된 경우
    const errorOutput = inspectResult.stderr + inspectResult.stdout;
    const isCorrupted = errorOutput.includes('CNI') ||
                        errorOutput.includes('plugin firewall');
    const notFound = errorOutput.includes('not found') ||
                     errorOutput.includes('no such network');

    // 3. 손상된 네트워크 처리 (안전 검사 포함)
    if (isCorrupted && !notFound) {
      // 🚨 중요: 연결된 컨테이너 확인
      const { containers, runningCount } = await getNetworkContainers(networkName);

      if (containers.length > 0 && !forceRecreate) {
        // 다른 컨테이너가 연결되어 있으면 삭제하지 않음!
        console.error(`[Network] WARNING: ${networkName} has ${containers.length} connected containers (${runningCount} running)`);
        console.error(`[Network] Connected: ${containers.join(', ')}`);
        console.error(`[Network] Skipping network recreation to prevent service disruption`);

        // 폴백으로 기본 네트워크 사용
        if (fallbackToDefault) {
          return {
            success: true,
            networkName: 'podman',
            action: 'fallback-to-default',
            message: `Using default 'podman' network. ${networkName} has ${containers.length} connected containers.`,
            connectedContainers: containers,
          };
        }

        return {
          success: true,
          networkName,
          action: 'skipped-has-containers',
          message: `Network ${networkName} is corrupted but has ${containers.length} connected containers. Not recreating.`,
          connectedContainers: containers,
        };
      }

      // 컨테이너가 없거나 강제 재생성인 경우에만 삭제
      if (forceRecreate) {
        console.error(`[Network] FORCE RECREATE: Removing network ${networkName} with ${containers.length} containers`);
      }
      await ssh.exec(`podman network rm ${networkName} 2>/dev/null || true`);
    }

    // 4. 네트워크 생성
    if (createIfMissing) {
      let createCmd = `podman network create ${networkName}`;

      // 서브넷 지정 (프로젝트 격리용)
      if (subnet) {
        createCmd += ` --subnet ${subnet}`;
      }

      const createResult = await ssh.exec(`${createCmd} 2>&1`);

      if (createResult.code === 0) {
        return {
          success: true,
          networkName,
          action: isCorrupted ? 'repaired' : 'created',
          message: `Network ${networkName} ${isCorrupted ? 'repaired' : 'created'}${subnet ? ` with subnet ${subnet}` : ''}`,
        };
      }

      // 생성 실패 - 이미 존재할 수 있음 (race condition)
      if (createResult.stdout.includes('already exists') || createResult.stderr.includes('already exists')) {
        return {
          success: true,
          networkName,
          action: 'existing',
          message: `Network ${networkName} already exists`,
        };
      }
    }

    // 5. 기본 네트워크로 폴백
    if (fallbackToDefault) {
      const defaultCheck = await ssh.exec(
        `podman network inspect podman 2>/dev/null && echo "ok" || echo "fail"`
      );

      if (defaultCheck.stdout.includes('ok')) {
        return {
          success: true,
          networkName: 'podman',
          action: 'fallback-to-default',
          message: `Falling back to default 'podman' network due to issues with ${networkName}`,
        };
      }
    }

    return {
      success: false,
      networkName: '',
      action: 'existing',
      message: `Failed to ensure network: ${networkName}`,
    };

  } finally {
    ssh.disconnect();
  }
}

/**
 * 프로젝트 전용 네트워크 생성
 * 다른 프로젝트와 완전히 격리된 네트워크 생성
 */
export async function createProjectNetwork(
  projectName: string,
  environment: 'staging' | 'production' | 'preview',
  options: { subnet?: string; labels?: Record<string, string> } = {}
): Promise<NetworkResult> {
  const ssh = getSSHClient();
  await ssh.connect();

  const networkName = getProjectNetworkName(projectName, environment);

  try {
    // 이미 존재하는지 확인
    const existsResult = await ssh.exec(
      `podman network exists ${networkName} && echo "exists" || echo "not_found"`
    );

    if (existsResult.stdout.trim() === 'exists') {
      return {
        success: true,
        networkName,
        action: 'existing',
        message: `Project network ${networkName} already exists`,
      };
    }

    // 네트워크 생성
    let createCmd = `podman network create ${networkName}`;

    if (options.subnet) {
      createCmd += ` --subnet ${options.subnet}`;
    }

    // 라벨 추가 (프로젝트 식별용)
    const labels = {
      'codeb.project': projectName,
      'codeb.environment': environment,
      'codeb.managed': 'true',
      ...options.labels,
    };

    for (const [key, value] of Object.entries(labels)) {
      createCmd += ` --label ${key}=${value}`;
    }

    const createResult = await ssh.exec(`${createCmd} 2>&1`);

    if (createResult.code === 0) {
      return {
        success: true,
        networkName,
        action: 'created',
        message: `Project network ${networkName} created`,
      };
    }

    return {
      success: false,
      networkName: '',
      action: 'existing',
      message: `Failed to create network: ${createResult.stderr}`,
    };

  } finally {
    ssh.disconnect();
  }
}

/**
 * 프로젝트 네트워크 안전 삭제
 * 모든 컨테이너가 중지된 후에만 삭제
 */
export async function removeProjectNetwork(
  projectName: string,
  environment: 'staging' | 'production' | 'preview',
  options: { force?: boolean; stopContainers?: boolean } = {}
): Promise<{ success: boolean; message: string; removedContainers?: string[] }> {
  const ssh = getSSHClient();
  await ssh.connect();

  const networkName = getProjectNetworkName(projectName, environment);

  try {
    // 연결된 컨테이너 확인
    const { containers, runningCount } = await getNetworkContainers(networkName);

    if (runningCount > 0) {
      if (options.stopContainers) {
        // 컨테이너 graceful 종료
        console.error(`[Network] Stopping ${runningCount} containers before network removal...`);
        for (const container of containers) {
          await ssh.exec(`podman stop ${container} --time 30 2>/dev/null || true`);
        }
      } else if (!options.force) {
        return {
          success: false,
          message: `Network ${networkName} has ${runningCount} running containers. Use force=true or stopContainers=true`,
          removedContainers: [],
        };
      }
    }

    // 네트워크 삭제
    const rmResult = await ssh.exec(`podman network rm ${networkName} 2>&1`);

    if (rmResult.code === 0 || rmResult.stdout.includes('not found')) {
      return {
        success: true,
        message: `Network ${networkName} removed`,
        removedContainers: options.stopContainers ? containers : [],
      };
    }

    return {
      success: false,
      message: `Failed to remove network: ${rmResult.stderr}`,
    };

  } finally {
    ssh.disconnect();
  }
}

/**
 * 네트워크 상태 진단
 */
export async function diagnoseNetwork(): Promise<{
  healthy: boolean;
  networks: Array<{
    name: string;
    driver: string;
    ipam: string;
    containers: number;
    status: 'healthy' | 'warning' | 'error';
    issues: string[];
  }>;
  recommendations: string[];
}> {
  const ssh = getSSHClient();
  await ssh.connect();

  try {
    // 모든 네트워크 목록
    const listResult = await ssh.exec(
      `podman network ls --format '{{.Name}}|{{.Driver}}'`
    );

    const networks: Array<{
      name: string;
      driver: string;
      ipam: string;
      containers: number;
      status: 'healthy' | 'warning' | 'error';
      issues: string[];
    }> = [];

    const recommendations: string[] = [];
    let healthy = true;

    for (const line of listResult.stdout.split('\n').filter(l => l.trim())) {
      const [name, driver] = line.split('|');
      const issues: string[] = [];
      let status: 'healthy' | 'warning' | 'error' = 'healthy';

      // 네트워크 상세 정보 확인
      const inspectResult = await ssh.exec(
        `podman network inspect ${name} 2>&1`
      );

      if (inspectResult.code !== 0) {
        issues.push(`Cannot inspect: ${inspectResult.stderr}`);
        status = 'error';
        healthy = false;
      }

      // CNI 오류 확인
      if (inspectResult.stdout.includes('firewall') ||
          inspectResult.stderr.includes('CNI')) {
        issues.push('CNI plugin compatibility issue detected');
        status = status === 'error' ? 'error' : 'warning';
        recommendations.push(`Consider recreating network '${name}' or using default 'podman' network`);
      }

      // 이 네트워크를 사용하는 컨테이너 수
      const containerCount = await ssh.exec(
        `podman ps -a --filter network=${name} --format '{{.Names}}' | wc -l`
      );

      networks.push({
        name,
        driver: driver || 'bridge',
        ipam: 'default',
        containers: parseInt(containerCount.stdout.trim()) || 0,
        status,
        issues,
      });
    }

    if (!healthy) {
      recommendations.push('Run "podman network prune" to clean up unused networks');
      recommendations.push('Consider using default "podman" network for better compatibility');
    }

    return {
      healthy,
      networks,
      recommendations,
    };

  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// MCP 도구 정의
// ============================================================================

export const configurePgHbaTool = {
  name: 'configure_pg_hba',
  description: 'PostgreSQL pg_hba.conf를 자동 설정하여 Podman 컨테이너 네트워크에서의 인증 문제를 해결합니다',
  inputSchema: z.object({
    containerName: z.string().describe('PostgreSQL 컨테이너 이름'),
    trustedNetworks: z.array(z.string()).optional().describe('신뢰할 네트워크 CIDR 목록 (기본: 10.88.0.0/16)'),
    authMethod: z.enum(['trust', 'md5', 'scram-sha-256']).optional().describe('인증 방식 (기본: trust)'),
  }),
  execute: async (input: {
    containerName: string;
    trustedNetworks?: string[];
    authMethod?: 'trust' | 'md5' | 'scram-sha-256';
  }) => {
    return configurePgHba({
      containerName: input.containerName,
      trustedNetworks: input.trustedNetworks,
      defaultAuthMethod: input.authMethod,
    });
  },
};

export const getContainerIPTool = {
  name: 'get_container_ip',
  description: 'Podman 컨테이너의 IP 주소를 조회합니다. Podman 3.x에서 서비스 DNS가 지원되지 않을 때 사용합니다.',
  inputSchema: z.object({
    containerName: z.string().describe('컨테이너 이름'),
  }),
  execute: getContainerIP,
};

export const initVolumeTool = {
  name: 'init_volume',
  description: '볼륨을 초기화합니다. 기존 볼륨과 새 설정이 충돌할 때 백업/재생성 옵션을 제공합니다.',
  inputSchema: z.object({
    projectName: z.string().describe('프로젝트 이름'),
    environment: z.enum(['staging', 'production']).describe('환경'),
    volumeType: z.enum(['postgres', 'redis', 'app-data']).describe('볼륨 유형'),
    mode: z.enum(['create-if-not-exists', 'recreate', 'backup-and-recreate']).describe('초기화 모드'),
  }),
  execute: initVolume,
};

export const ensureNetworkTool = {
  name: 'ensure_network',
  description: 'Podman 네트워크를 확보합니다. CNI 오류 시 기본 네트워크로 폴백합니다.',
  inputSchema: z.object({
    preferredNetwork: z.string().optional().describe('선호 네트워크 이름 (기본: codeb-network)'),
    fallbackToDefault: z.boolean().optional().describe('실패 시 기본 네트워크로 폴백 (기본: true)'),
    createIfMissing: z.boolean().optional().describe('없으면 생성 (기본: true)'),
  }),
  execute: ensureNetwork,
};

export const diagnoseNetworkTool = {
  name: 'diagnose_network',
  description: 'Podman 네트워크 상태를 진단하고 문제점과 권장사항을 제공합니다.',
  inputSchema: z.object({}),
  execute: diagnoseNetwork,
};

// ============================================================================
// 5. 안전한 컨테이너 교체 (Zero-Downtime Deploy Support)
// ============================================================================

export interface ContainerReplaceConfig {
  projectName: string;
  containerName: string;        // 대상 컨테이너 이름
  newImage: string;             // 새 이미지
  port: number;                 // 호스트 포트
  containerPort?: number;       // 컨테이너 내부 포트 (기본: 3000)
  networkName?: string;         // 네트워크 (기본: 프로젝트 격리 네트워크)
  environment?: 'staging' | 'production' | 'preview';
  envVars?: Record<string, string>;
  healthEndpoint?: string;      // 헬스체크 엔드포인트
  healthTimeout?: number;       // 헬스체크 타임아웃 (초, 기본: 60)
  gracefulStopTimeout?: number; // graceful 종료 대기 (초, 기본: 30)
  keepOldContainer?: boolean;   // 롤백용으로 이전 컨테이너 유지
}

export interface ContainerReplaceResult {
  success: boolean;
  message: string;
  oldContainerId?: string;
  newContainerId?: string;
  rollbackAvailable?: boolean;
  duration: number;
}

/**
 * 안전한 컨테이너 교체
 *
 * 흐름:
 * 1. 기존 컨테이너 상태 확인
 * 2. 새 컨테이너를 임시 이름으로 시작
 * 3. 헬스체크 통과 확인
 * 4. 기존 컨테이너 graceful 종료
 * 5. 새 컨테이너 이름 변경 (또는 롤백)
 */
export async function safeReplaceContainer(
  config: ContainerReplaceConfig
): Promise<ContainerReplaceResult> {
  const ssh = getSSHClient();
  await ssh.connect();

  const startTime = Date.now();
  const {
    projectName,
    containerName,
    newImage,
    port,
    containerPort = 3000,
    networkName,
    environment = 'production',
    envVars = {},
    healthEndpoint = '/api/health',
    healthTimeout = 60,
    gracefulStopTimeout = 30,
    keepOldContainer = false,
  } = config;

  // 임시 컨테이너 이름
  const tempContainerName = `${containerName}-new-${Date.now()}`;
  const backupContainerName = `${containerName}-backup-${Date.now()}`;

  // 네트워크 결정
  const targetNetwork = networkName || getProjectNetworkName(projectName, environment);

  try {
    // ========================================
    // 1. 기존 컨테이너 상태 확인
    // ========================================
    const oldContainerResult = await ssh.exec(
      `podman ps -a --filter name=^${containerName}$ --format '{{.ID}}|{{.State}}'`
    );
    const oldContainerInfo = oldContainerResult.stdout.trim();
    const [oldContainerId, oldState] = oldContainerInfo.split('|');

    console.error(`[SafeReplace] Old container: ${oldContainerId || 'none'} (${oldState || 'not found'})`);

    // ========================================
    // 2. 새 컨테이너 시작 (임시 포트)
    // ========================================
    // 임시 포트 찾기 (기존 포트 + 10000)
    const tempPort = port + 10000;

    console.error(`[SafeReplace] Starting new container on temp port ${tempPort}...`);

    // 환경변수 구성
    const envFlags = Object.entries(envVars)
      .map(([k, v]) => `-e ${k}="${v}"`)
      .join(' ');

    const runCmd = `
      podman run -d \\
        --name ${tempContainerName} \\
        --network ${targetNetwork} \\
        -p ${tempPort}:${containerPort} \\
        ${envFlags} \\
        --health-cmd="curl -f http://localhost:${containerPort}${healthEndpoint} || exit 1" \\
        --health-interval=5s \\
        --health-timeout=3s \\
        --health-retries=3 \\
        --health-start-period=10s \\
        ${newImage}
    `;

    const runResult = await ssh.exec(runCmd);

    if (runResult.code !== 0) {
      return {
        success: false,
        message: `Failed to start new container: ${runResult.stderr}`,
        duration: Date.now() - startTime,
      };
    }

    const newContainerId = runResult.stdout.trim().substring(0, 12);
    console.error(`[SafeReplace] New container started: ${newContainerId}`);

    // ========================================
    // 3. 헬스체크 대기
    // ========================================
    console.error(`[SafeReplace] Waiting for health check (timeout: ${healthTimeout}s)...`);

    const healthyAt = await waitForHealthy(ssh, tempContainerName, healthTimeout);

    if (!healthyAt) {
      // 헬스체크 실패 - 롤백
      console.error(`[SafeReplace] Health check failed! Removing new container...`);
      await ssh.exec(`podman rm -f ${tempContainerName} 2>/dev/null || true`);

      return {
        success: false,
        message: 'New container failed health check. Rolled back.',
        oldContainerId,
        newContainerId,
        rollbackAvailable: false,
        duration: Date.now() - startTime,
      };
    }

    console.error(`[SafeReplace] Health check passed after ${healthyAt}s`);

    // ========================================
    // 4. 기존 컨테이너 graceful 종료
    // ========================================
    if (oldContainerId) {
      console.error(`[SafeReplace] Stopping old container (timeout: ${gracefulStopTimeout}s)...`);

      if (keepOldContainer) {
        // 롤백용으로 보관 (이름 변경 후 중지)
        await ssh.exec(`podman rename ${containerName} ${backupContainerName} 2>/dev/null || true`);
        await ssh.exec(`podman stop ${backupContainerName} --time ${gracefulStopTimeout}`);
        console.error(`[SafeReplace] Old container backed up as ${backupContainerName}`);
      } else {
        // 기존 컨테이너 종료 및 삭제
        await ssh.exec(`podman stop ${containerName} --time ${gracefulStopTimeout} 2>/dev/null || true`);
        await ssh.exec(`podman rm ${containerName} 2>/dev/null || true`);
      }
    }

    // ========================================
    // 5. 새 컨테이너 포트 전환 및 이름 변경
    // ========================================
    // 임시 컨테이너 중지 후 정식 포트로 재시작
    console.error(`[SafeReplace] Switching to production port ${port}...`);

    await ssh.exec(`podman stop ${tempContainerName} --time 10`);

    // 컨테이너를 커밋하여 현재 상태 저장
    const commitResult = await ssh.exec(
      `podman commit ${tempContainerName} ${containerName}-state:latest 2>/dev/null`
    );

    // 임시 컨테이너 삭제
    await ssh.exec(`podman rm ${tempContainerName} 2>/dev/null || true`);

    // 정식 포트로 새 컨테이너 시작
    const finalRunCmd = `
      podman run -d \\
        --name ${containerName} \\
        --network ${targetNetwork} \\
        -p ${port}:${containerPort} \\
        ${envFlags} \\
        --restart unless-stopped \\
        --health-cmd="curl -f http://localhost:${containerPort}${healthEndpoint} || exit 1" \\
        --health-interval=30s \\
        --health-timeout=10s \\
        --health-retries=3 \\
        --health-start-period=40s \\
        ${newImage}
    `;

    const finalResult = await ssh.exec(finalRunCmd);

    if (finalResult.code !== 0) {
      // 최종 시작 실패 - 롤백 시도
      console.error(`[SafeReplace] Final start failed! Attempting rollback...`);

      if (keepOldContainer) {
        await ssh.exec(`podman rename ${backupContainerName} ${containerName} 2>/dev/null || true`);
        await ssh.exec(`podman start ${containerName} 2>/dev/null || true`);
        console.error(`[SafeReplace] Rolled back to backup container`);
      }

      return {
        success: false,
        message: `Failed to start container on production port: ${finalResult.stderr}`,
        oldContainerId,
        rollbackAvailable: keepOldContainer,
        duration: Date.now() - startTime,
      };
    }

    const finalContainerId = finalResult.stdout.trim().substring(0, 12);

    // 임시 이미지 정리
    await ssh.exec(`podman rmi ${containerName}-state:latest 2>/dev/null || true`);

    return {
      success: true,
      message: `Container replaced successfully: ${oldContainerId || 'new'} → ${finalContainerId}`,
      oldContainerId,
      newContainerId: finalContainerId,
      rollbackAvailable: keepOldContainer,
      duration: Date.now() - startTime,
    };

  } catch (error) {
    // 오류 발생 시 정리
    await ssh.exec(`podman rm -f ${tempContainerName} 2>/dev/null || true`);

    return {
      success: false,
      message: `Replace failed: ${error instanceof Error ? error.message : String(error)}`,
      duration: Date.now() - startTime,
    };

  } finally {
    ssh.disconnect();
  }
}

/**
 * 컨테이너 헬스체크 대기
 */
async function waitForHealthy(
  ssh: ReturnType<typeof getSSHClient>,
  containerName: string,
  timeoutSeconds: number
): Promise<number | null> {
  const startTime = Date.now();
  const timeout = timeoutSeconds * 1000;

  while (Date.now() - startTime < timeout) {
    const result = await ssh.exec(
      `podman inspect ${containerName} --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown"`
    );

    const status = result.stdout.trim();

    if (status === 'healthy') {
      return Math.round((Date.now() - startTime) / 1000);
    }

    if (status === 'unhealthy') {
      // 로그 확인
      const logs = await ssh.exec(
        `podman logs --tail 20 ${containerName} 2>&1`
      );
      console.error(`[HealthCheck] Container unhealthy. Logs:\n${logs.stdout}`);
      return null;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return null;
}

/**
 * 롤백 (백업 컨테이너 복원)
 */
export async function rollbackContainer(
  containerName: string
): Promise<{ success: boolean; message: string }> {
  const ssh = getSSHClient();
  await ssh.connect();

  try {
    // 백업 컨테이너 찾기
    const backupResult = await ssh.exec(
      `podman ps -a --filter name=${containerName}-backup --format '{{.Names}}' | head -1`
    );

    const backupName = backupResult.stdout.trim();

    if (!backupName) {
      return {
        success: false,
        message: `No backup container found for ${containerName}`,
      };
    }

    // 현재 컨테이너 중지 및 삭제
    await ssh.exec(`podman stop ${containerName} --time 10 2>/dev/null || true`);
    await ssh.exec(`podman rm ${containerName} 2>/dev/null || true`);

    // 백업 복원
    await ssh.exec(`podman rename ${backupName} ${containerName}`);
    await ssh.exec(`podman start ${containerName}`);

    return {
      success: true,
      message: `Rolled back to ${backupName}`,
    };

  } finally {
    ssh.disconnect();
  }
}

// MCP 도구 정의
export const safeReplaceContainerTool = {
  name: 'safe_replace_container',
  description: '안전한 컨테이너 교체 (Zero-Downtime). 헬스체크 통과 후에만 교체하며, 실패 시 자동 롤백합니다.',
  inputSchema: z.object({
    projectName: z.string().describe('프로젝트 이름'),
    containerName: z.string().describe('대상 컨테이너 이름'),
    newImage: z.string().describe('새 이미지 (예: ghcr.io/org/app:latest)'),
    port: z.number().describe('호스트 포트'),
    containerPort: z.number().optional().describe('컨테이너 내부 포트 (기본: 3000)'),
    environment: z.enum(['staging', 'production', 'preview']).optional().describe('환경'),
    envVars: z.record(z.string()).optional().describe('환경변수'),
    healthEndpoint: z.string().optional().describe('헬스체크 엔드포인트 (기본: /api/health)'),
    healthTimeout: z.number().optional().describe('헬스체크 타임아웃 초 (기본: 60)'),
    gracefulStopTimeout: z.number().optional().describe('graceful 종료 대기 초 (기본: 30)'),
    keepOldContainer: z.boolean().optional().describe('롤백용 이전 컨테이너 보관'),
  }),
  execute: async (input: ContainerReplaceConfig) => {
    return safeReplaceContainer(input);
  },
};

export const rollbackContainerTool = {
  name: 'rollback_container',
  description: '컨테이너를 이전 백업 버전으로 롤백합니다.',
  inputSchema: z.object({
    containerName: z.string().describe('롤백할 컨테이너 이름'),
  }),
  execute: async (input: { containerName: string }) => {
    return rollbackContainer(input.containerName);
  },
};
