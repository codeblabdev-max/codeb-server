/**
 * CodeB Deploy MCP - 서버 분석 도구
 * 서버 상태, 포트, 컨테이너 현황 분석
 */

import { getSSHClient } from '../lib/ssh-client.js';
import { portRegistry } from '../lib/port-registry.js';
import type {
  ServerStatus,
  SystemInfo,
  ContainerInfo,
  PM2Process,
  PortStatus,
  DatabaseInfo,
  RegistryStatus,
  PortMapping,
} from '../lib/types.js';

/**
 * 서버 전체 상태 분석
 */
export async function analyzeServer(): Promise<ServerStatus> {
  const ssh = getSSHClient();
  const timestamp = new Date().toISOString();
  const host = ssh.getConfig().host;

  try {
    // 먼저 연결 확립 (병렬 실행 전에)
    await ssh.connect();

    // 순차적으로 정보 수집 (SSH 연결 안정성을 위해)
    // 병렬 실행 시 동일 연결에서 여러 채널 사용으로 인한 충돌 방지
    const system = await getSystemInfo(ssh);
    const containers = await getContainers(ssh);
    const pm2 = await getPM2Processes(ssh);
    const ports = await getPortStatus(ssh);
    const databases = await getDatabases(ssh);
    const registry = await getRegistryStatus(ssh);

    // 포트 레지스트리 업데이트
    portRegistry.updateFromServerStatus(ports);

    return {
      timestamp,
      host,
      system,
      containers,
      pm2Processes: pm2,
      ports,
      databases,
      registry,
    };
  } finally {
    ssh.disconnect();
  }
}

/**
 * 시스템 정보 수집
 */
async function getSystemInfo(ssh: ReturnType<typeof getSSHClient>): Promise<SystemInfo> {
  const commands = await ssh.execMultiple([
    'cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\'',
    'hostname',
    'cat /proc/uptime | cut -d. -f1',
    'free -b | grep Mem',
    'df -B1 / | tail -1',
    'nproc',
    'top -bn1 | grep "Cpu(s)" | awk \'{print $2}\'',
  ]);

  const [os, hostname, uptime, memory, disk, cores, cpuUsage] = commands;

  // 메모리 파싱
  const memParts = memory.stdout.split(/\s+/);
  const memTotal = parseInt(memParts[1]) || 0;
  const memUsed = parseInt(memParts[2]) || 0;
  const memFree = parseInt(memParts[3]) || 0;

  // 디스크 파싱
  const diskParts = disk.stdout.split(/\s+/);
  const diskTotal = parseInt(diskParts[1]) || 0;
  const diskUsed = parseInt(diskParts[2]) || 0;
  const diskAvailable = parseInt(diskParts[3]) || 0;

  return {
    os: os.stdout || 'Unknown',
    hostname: hostname.stdout || 'Unknown',
    uptime: parseInt(uptime.stdout) || 0,
    memory: {
      total: memTotal,
      used: memUsed,
      free: memFree,
      usagePercent: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0,
    },
    disk: {
      total: diskTotal,
      used: diskUsed,
      available: diskAvailable,
      usagePercent: diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0,
    },
    cpu: {
      cores: parseInt(cores.stdout) || 1,
      usage: parseFloat(cpuUsage.stdout) || 0,
    },
  };
}

/**
 * Podman 컨테이너 목록 수집
 */
async function getContainers(ssh: ReturnType<typeof getSSHClient>): Promise<ContainerInfo[]> {
  const result = await ssh.exec(
    'podman ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.Created}}" 2>/dev/null || echo ""'
  );

  if (!result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const [id, name, image, status, portsStr, created] = line.split('|');

      // 포트 파싱
      const ports: PortMapping[] = [];
      if (portsStr) {
        const portMatches = portsStr.matchAll(/(\d+)->(\d+)\/(tcp|udp)/g);
        for (const match of portMatches) {
          ports.push({
            host: parseInt(match[1]),
            container: parseInt(match[2]),
            protocol: match[3] as 'tcp' | 'udp',
          });
        }
      }

      // 이미지 버전 추출
      const imageParts = image.split(':');
      const imageVersion = imageParts[1] || 'latest';

      // 환경 추출 (컨테이너 이름에서)
      let environment: string | undefined;
      if (name.includes('staging')) environment = 'staging';
      else if (name.includes('prod')) environment = 'production';
      else if (name.includes('preview')) environment = 'preview';

      // 상태 파싱
      let containerStatus: ContainerInfo['status'] = 'stopped';
      if (status.toLowerCase().includes('up')) containerStatus = 'running';
      else if (status.toLowerCase().includes('paused')) containerStatus = 'paused';
      else if (status.toLowerCase().includes('exited')) containerStatus = 'exited';

      // 헬스체크 상태
      let health: ContainerInfo['health'];
      if (status.includes('healthy')) health = 'healthy';
      else if (status.includes('unhealthy')) health = 'unhealthy';
      else if (status.includes('starting')) health = 'starting';

      return {
        id,
        name,
        image: imageParts[0],
        imageVersion,
        status: containerStatus,
        ports,
        created,
        health,
        environment,
      };
    });
}

/**
 * PM2 프로세스 목록 수집
 */
async function getPM2Processes(ssh: ReturnType<typeof getSSHClient>): Promise<PM2Process[]> {
  const result = await ssh.exec(
    'pm2 jlist 2>/dev/null || echo "[]"'
  );

  try {
    const processes = JSON.parse(result.stdout);
    return processes.map((p: Record<string, unknown>) => ({
      name: p.name as string,
      pid: p.pid as number,
      status: (p.pm2_env as Record<string, string>)?.status || 'stopped',
      memory: (p.monit as Record<string, number>)?.memory || 0,
      cpu: (p.monit as Record<string, number>)?.cpu || 0,
      uptime: formatUptime((p.pm2_env as Record<string, number>)?.pm_uptime || 0),
      restarts: (p.pm2_env as Record<string, number>)?.restart_time || 0,
    }));
  } catch {
    return [];
  }
}

/**
 * 포트 상태 수집
 */
async function getPortStatus(ssh: ReturnType<typeof getSSHClient>): Promise<PortStatus> {
  const result = await ssh.exec(
    'ss -tlnp | grep LISTEN | awk \'{print $4}\' | grep -oE \'[0-9]+$\' | sort -n | uniq'
  );

  const usedPorts = result.stdout
    .split('\n')
    .filter((p) => p.trim())
    .map((p) => parseInt(p))
    .filter((p) => !isNaN(p));

  // 서비스별 포트 분류
  const byService: Record<string, number[]> = {
    postgresql: usedPorts.filter((p) => p >= 5432 && p < 5500),
    redis: usedPorts.filter((p) => p >= 6379 && p < 6500),
    apps: usedPorts.filter((p) => p >= 3000 && p < 6000),
    web: usedPorts.filter((p) => p === 80 || p === 443),
    ssh: usedPorts.filter((p) => p === 22),
  };

  // 환경별 분류
  const byEnvironment = {
    staging: { app: 0, db: undefined, redis: undefined } as { app: number; db?: number; redis?: number },
    production: { app: 0, db: undefined, redis: undefined } as { app: number; db?: number; redis?: number },
    preview: {} as Record<string, { app: number; db?: number; redis?: number }>,
  };

  // 사용 가능한 포트 계산
  const ranges = portRegistry.getPortRanges();
  const calcAvailable = (start: number, end: number, count: number = 10) => {
    const available: number[] = [];
    for (let p = start; p <= end && available.length < count; p++) {
      if (!usedPorts.includes(p)) available.push(p);
    }
    return available;
  };

  return {
    used: usedPorts,
    byService,
    byEnvironment,
    available: {
      app: {
        staging: calcAvailable(ranges.staging.app.start, ranges.staging.app.end),
        production: calcAvailable(ranges.production.app.start, ranges.production.app.end),
        preview: calcAvailable(ranges.preview.app.start, ranges.preview.app.end),
      },
      db: {
        staging: calcAvailable(ranges.staging.db.start, ranges.staging.db.end),
        production: calcAvailable(ranges.production.db.start, ranges.production.db.end),
      },
      redis: {
        staging: calcAvailable(ranges.staging.redis.start, ranges.staging.redis.end),
        production: calcAvailable(ranges.production.redis.start, ranges.production.redis.end),
      },
    },
  };
}

/**
 * PostgreSQL 데이터베이스 목록 수집
 */
async function getDatabases(ssh: ReturnType<typeof getSSHClient>): Promise<DatabaseInfo[]> {
  const result = await ssh.exec(
    'sudo -u postgres psql -t -c "SELECT datname, pg_size_pretty(pg_database_size(datname)), datdba::regrole FROM pg_database WHERE datistemplate = false;" 2>/dev/null || echo ""'
  );

  if (!result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const parts = line.split('|').map((p) => p.trim());
      const name = parts[0] || '';

      // 환경 추출
      let environment: DatabaseInfo['environment'];
      if (name.includes('staging')) environment = 'staging';
      else if (name.includes('prod')) environment = 'production';

      return {
        name,
        size: parts[1] || '0 bytes',
        owner: parts[2] || 'postgres',
        environment,
      };
    });
}

/**
 * 컨테이너 레지스트리 상태 (ghcr.io 사용)
 * 참고: 실제 이미지 목록은 GitHub Container Registry에서 관리됨
 */
async function getRegistryStatus(ssh: ReturnType<typeof getSSHClient>): Promise<RegistryStatus> {
  // ghcr.io 연결 확인 (기본 레지스트리)
  const ghcrCheck = await ssh.exec(
    'curl -s -o /dev/null -w "%{http_code}" https://ghcr.io/v2/ 2>/dev/null || echo "000"'
  );

  const ghcrAvailable = ghcrCheck.stdout.trim() === '401' || ghcrCheck.stdout.trim() === '200';

  // 로컬에 캐시된 이미지 목록
  const localImagesResult = await ssh.exec(
    'podman images --format "{{.Repository}}:{{.Tag}} {{.Size}}" | grep -E "^ghcr\\.io" | head -20 2>/dev/null || echo ""'
  );

  let images: RegistryStatus['images'] = [];
  try {
    const lines = localImagesResult.stdout.trim().split('\n').filter(Boolean);
    const imageMap = new Map<string, { tags: string[]; size: string }>();

    for (const line of lines) {
      const parts = line.split(' ');
      const [repoTag, size] = [parts[0], parts[1] || '0'];
      const [repo, tag] = repoTag.split(':');

      if (!imageMap.has(repo)) {
        imageMap.set(repo, { tags: [], size });
      }
      imageMap.get(repo)!.tags.push(tag || 'latest');
    }

    for (const [name, data] of imageMap) {
      images.push({
        name,
        tags: data.tags,
        size: 0, // 사이즈는 별도 계산 필요
        created: '',
      });
    }
  } catch {
    // 파싱 실패 시 빈 배열
  }

  return {
    url: 'ghcr.io',
    available: ghcrAvailable,
    images,
  };
}

/**
 * 업타임 포맷팅
 */
function formatUptime(timestamp: number): string {
  if (!timestamp) return '0s';

  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/**
 * 간단한 상태 요약
 */
export async function getServerSummary(): Promise<{
  healthy: boolean;
  containers: { running: number; total: number };
  ports: { used: number; available: number };
  memory: { usagePercent: number };
  disk: { usagePercent: number };
}> {
  const status = await analyzeServer();

  const runningContainers = status.containers.filter((c) => c.status === 'running').length;

  return {
    healthy: status.system.memory.usagePercent < 90 && status.system.disk.usagePercent < 90,
    containers: {
      running: runningContainers,
      total: status.containers.length,
    },
    ports: {
      used: status.ports.used.length,
      available:
        status.ports.available.app.staging.length +
        status.ports.available.app.production.length,
    },
    memory: {
      usagePercent: status.system.memory.usagePercent,
    },
    disk: {
      usagePercent: status.system.disk.usagePercent,
    },
  };
}
