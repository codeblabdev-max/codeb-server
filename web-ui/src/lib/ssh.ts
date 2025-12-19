/**
 * CodeB SSH Connection Library
 * 서버 SSH 연결 및 명령 실행
 */

import { spawn } from 'child_process';

// 서버 설정
export const SERVERS = {
  app: {
    ip: '158.247.203.55',
    name: 'App Server',
    role: 'application',
    domain: 'app.codeb.kr',
    services: ['dashboard', 'cms', 'web-apps', 'powerdns'],
    portRange: { production: '4000-4499', staging: '4500-4999' },
  },
  streaming: {
    ip: '141.164.42.213',
    name: 'Streaming Server',
    role: 'streaming',
    domain: 'ws.codeb.kr',
    services: ['centrifugo', 'websocket'],
  },
  storage: {
    ip: '64.176.226.119',
    name: 'Storage Server',
    role: 'storage',
    domain: 'db.codeb.kr',
    services: ['postgresql', 'redis'],
  },
  backup: {
    ip: '141.164.37.63',
    name: 'Backup Server',
    role: 'backup',
    domain: 'backup.codeb.kr',
    services: ['env-backup', 'file-storage', 'preview'],
    portRange: { preview: '5000-5999' },
  },
} as const;

export type ServerName = keyof typeof SERVERS;

interface SSHResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * SSH 명령 실행
 */
export async function sshExec(
  serverName: ServerName,
  command: string,
  timeout = 30000
): Promise<SSHResult> {
  const server = SERVERS[serverName];
  if (!server) {
    return { success: false, output: '', error: `Unknown server: ${serverName}` };
  }

  const user = process.env.SSH_USER || 'root';

  return new Promise((resolve) => {
    const proc = spawn('ssh', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ConnectTimeout=10',
      `${user}@${server.ip}`,
      command,
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ success: false, output: stdout, error: 'Command timed out' });
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ success: true, output: stdout.trim() });
      } else {
        resolve({ success: false, output: stdout, error: stderr || `Exit code: ${code}` });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ success: false, output: '', error: err.message });
    });
  });
}

/**
 * 서버 시스템 정보 조회
 */
export async function getServerMetrics(serverName: ServerName) {
  const commands = {
    uptime: 'uptime -p',
    loadAvg: 'cat /proc/loadavg | awk \'{print $1,$2,$3}\'',
    memory: 'free -m | awk \'/Mem:/ {printf "%d/%d", $3, $2}\'',
    disk: 'df -h / | tail -1 | awk \'{print $5}\'',
    containers: 'podman ps --format "{{.Names}}" 2>/dev/null | wc -l',
  };

  const results: Record<string, string> = {};

  for (const [key, cmd] of Object.entries(commands)) {
    const result = await sshExec(serverName, cmd, 10000);
    results[key] = result.success ? result.output : 'N/A';
  }

  return {
    ...SERVERS[serverName],
    metrics: results,
    status: results.uptime !== 'N/A' ? 'online' : 'offline',
    checkedAt: new Date().toISOString(),
  };
}

/**
 * 모든 서버 상태 조회
 */
export async function getAllServersStatus() {
  const serverNames = Object.keys(SERVERS) as ServerName[];
  const results = await Promise.all(
    serverNames.map(async (name) => {
      try {
        return await getServerMetrics(name);
      } catch {
        return {
          ...SERVERS[name],
          status: 'error',
          metrics: {},
          checkedAt: new Date().toISOString(),
        };
      }
    })
  );

  return Object.fromEntries(
    serverNames.map((name, i) => [name, results[i]])
  );
}

/**
 * 컨테이너 목록 조회
 */
export async function getContainers(serverName: ServerName) {
  const result = await sshExec(
    serverName,
    'podman ps -a --format "{{.Names}}|{{.Status}}|{{.Ports}}|{{.Image}}"'
  );

  if (!result.success) {
    return [];
  }

  return result.output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, status, ports, image] = line.split('|');
      return { name, status, ports, image };
    });
}

/**
 * 프로젝트 목록 조회 (App 서버 기준)
 */
export async function getProjects() {
  // App 서버의 컨테이너 목록 조회
  const appContainers = await getContainers('app');

  // Preview 서버의 컨테이너 목록 조회
  const previewContainers = await getContainers('backup');

  // SSOT 레지스트리 조회
  const ssotResult = await sshExec(
    'app',
    'cat /opt/codeb/config/ssot-registry.json 2>/dev/null || echo "{}"'
  );

  let ssotData: Record<string, unknown> = {};
  try {
    ssotData = JSON.parse(ssotResult.output);
  } catch {
    // JSON 파싱 실패 시 빈 객체 사용
  }

  // 컨테이너 정보를 프로젝트로 변환
  const projects = new Map<string, unknown>();

  for (const container of appContainers) {
    // 시스템 컨테이너 제외
    if (container.name.startsWith('codeb-') && !container.name.includes('-staging') && !container.name.includes('-production')) {
      continue;
    }

    const projectName = container.name.replace(/-staging|-production|-preview.*/, '');
    const environment = container.name.includes('-staging')
      ? 'staging'
      : container.name.includes('-production')
      ? 'production'
      : 'unknown';

    if (!projects.has(projectName)) {
      projects.set(projectName, {
        id: projectName,
        name: projectName,
        type: container.image.includes('node') ? 'nodejs' : 'unknown',
        status: container.status.includes('Up') ? 'running' : 'stopped',
        environments: [],
      });
    }

    const project = projects.get(projectName) as { environments: unknown[] };
    project.environments.push({
      name: environment,
      status: container.status.includes('Up') ? 'running' : 'stopped',
      container: container.name,
      image: container.image,
    });
  }

  // Preview 컨테이너 추가
  for (const container of previewContainers) {
    if (!container.name.includes('-preview')) continue;

    const projectName = container.name.split('-preview')[0];
    if (!projects.has(projectName)) {
      projects.set(projectName, {
        id: projectName,
        name: projectName,
        type: 'unknown',
        status: container.status.includes('Up') ? 'running' : 'stopped',
        environments: [],
      });
    }

    const project = projects.get(projectName) as { environments: unknown[] };
    project.environments.push({
      name: 'preview',
      branch: container.name.split('-preview-')[1] || 'unknown',
      status: container.status.includes('Up') ? 'running' : 'stopped',
      container: container.name,
      server: 'backup',
    });
  }

  return Array.from(projects.values());
}

/**
 * ENV 백업 목록 조회
 */
export async function getEnvBackups(projectName: string) {
  const result = await sshExec(
    'backup',
    `ls -la /opt/codeb/env-backup/${projectName}/*/*.env 2>/dev/null | awk '{print $9, $6, $7, $8}'`
  );

  if (!result.success || !result.output) {
    return [];
  }

  return result.output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(' ');
      const path = parts[0];
      const date = parts.slice(1).join(' ');
      const [, , , project, env, file] = path.split('/');
      return {
        project,
        environment: env,
        filename: file,
        path,
        date,
        isMaster: file === 'master.env',
        isCurrent: file === 'current.env',
      };
    });
}

/**
 * Preview 목록 조회
 */
export async function getPreviewList() {
  const result = await sshExec(
    'backup',
    'ls -1 /opt/codeb/preview/*.json 2>/dev/null | xargs -I {} cat {} 2>/dev/null'
  );

  if (!result.success || !result.output) {
    return [];
  }

  // JSON 파싱
  const entries = result.output.split('}{').map((entry, i, arr) => {
    if (arr.length === 1) return entry;
    if (i === 0) return entry + '}';
    if (i === arr.length - 1) return '{' + entry;
    return '{' + entry + '}';
  });

  const previews = [];
  for (const entry of entries) {
    try {
      previews.push(JSON.parse(entry));
    } catch {
      // 파싱 실패 무시
    }
  }

  return previews;
}

/**
 * 도메인 목록 조회 (PowerDNS)
 */
export async function getDomains() {
  const result = await sshExec(
    'app',
    'curl -s -H "X-API-Key: wc-hub-pdns-api-key-2024" http://localhost:8081/api/v1/servers/localhost/zones/codeb.kr | jq -r ".rrsets[] | select(.type==\\"A\\") | .name"'
  );

  if (!result.success) {
    return [];
  }

  return result.output
    .split('\n')
    .filter(Boolean)
    .map((domain) => ({
      name: domain.replace(/\.$/, ''),
      type: 'A',
      managed: true,
    }));
}

/**
 * Caddy 설정 조회
 */
export async function getCaddyDomains(serverName: ServerName) {
  const result = await sshExec(
    serverName,
    'grep -h "^[a-zA-Z0-9*]" /etc/caddy/*.caddy /etc/caddy/*/*.caddy 2>/dev/null | grep -v "#"'
  );

  if (!result.success) {
    return [];
  }

  return result.output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const domain = line.split(' ')[0].replace('{', '').trim();
      return { domain, server: serverName };
    });
}
