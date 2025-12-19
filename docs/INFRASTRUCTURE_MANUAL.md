# CodeB Infrastructure Manual v2.0

## 완벽한 서버 구성 및 배포 가이드

> **Coolify 대안** - Podman + Caddy + Quadlet + systemd 기반 자체 호스팅 플랫폼

---

## 목차

1. [아키텍처 개요](#1-아키텍처-개요)
2. [4-서버 구성](#2-4-서버-구성)
3. [핵심 컴포넌트](#3-핵심-컴포넌트)
4. [MCP Agent 설치](#4-mcp-agent-설치)
5. [SSOT Registry](#5-ssot-registry)
6. [Quadlet 배포](#6-quadlet-배포)
7. [GitHub Actions CI/CD](#7-github-actions-cicd)
8. [프로젝트 생성 워크플로우](#8-프로젝트-생성-워크플로우)
9. [배포 전략](#9-배포-전략)
10. [모니터링 및 로깅](#10-모니터링-및-로깅)
11. [문제 해결](#11-문제-해결)

---

## 1. 아키텍처 개요

### 1.1 시스템 구성도

```
┌─────────────────────────────────────────────────────────────────────┐
│                        개발자 워크스테이션                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
│  │   VS Code   │    │  Claude Code │    │   we CLI    │              │
│  │  + Claude   │    │   Terminal   │    │  Commands   │              │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘              │
└─────────┼──────────────────┼──────────────────┼─────────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         GitHub Repository                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  git push → GitHub Actions Workflow (Hybrid Mode)           │    │
│  │  ┌──────────────────┐  ┌──────────────────┐                 │    │
│  │  │ GitHub-hosted    │  │ Self-hosted      │                 │    │
│  │  │ • lint           │  │ • port-validate  │                 │    │
│  │  │ • test           │→→│ • deploy         │                 │    │
│  │  │ • build & push   │  │ • health-check   │                 │    │
│  │  └──────────────────┘  └────────┬─────────┘                 │    │
│  └─────────────────────────────────┼───────────────────────────┘    │
└────────────────────────────────────┼────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Production Infrastructure                         │
│                                                                      │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐         │
│  │   App Server   │  │Streaming Server│  │ Storage Server │         │
│  │ 158.247.203.55 │  │141.164.42.213  │  │ 64.176.226.119 │         │
│  │                │  │                │  │                │         │
│  │ • Dashboard    │  │ • Centrifugo   │  │ • PostgreSQL   │         │
│  │ • SSOT Registry│  │ • WebSocket    │  │ • Redis        │         │
│  │ • Apps (Next.js)│ │ • Real-time    │  │ • MinIO        │         │
│  │ • MCP Agent    │  │ • MCP Agent    │  │ • MCP Agent    │         │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘         │
│          │                   │                   │                   │
│          └───────────────────┼───────────────────┘                   │
│                              │                                       │
│                    ┌─────────▼─────────┐                            │
│                    │   Backup Server   │                            │
│                    │  141.164.37.63    │                            │
│                    │  • Daily Backups  │                            │
│                    │  • MCP Agent      │                            │
│                    └───────────────────┘                            │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 기술 스택

| 계층 | 기술 | 역할 |
|------|------|------|
| **Container Runtime** | Podman | Docker 대체, Rootless 지원 |
| **Service Manager** | systemd + Quadlet | 컨테이너 라이프사이클 관리 |
| **Reverse Proxy** | Caddy | 자동 SSL, 로드밸런싱 |
| **Registry** | ghcr.io | 컨테이너 이미지 저장소 |
| **CI/CD** | GitHub Actions | 하이브리드 빌드/배포 |
| **API Server** | MCP Agent | 서버 관리 HTTP API |
| **Central Registry** | SSOT Registry | 포트/프로젝트 중앙 관리 |

---

## 2. 4-서버 구성

### 2.1 서버 목록

| 서버 | IP 주소 | 역할 | 주요 서비스 | MCP 포트 |
|------|---------|------|-------------|----------|
| **App** | 158.247.203.55 | 메인 애플리케이션 | Dashboard, CMS, Apps | 3101 |
| **Streaming** | 141.164.42.213 | 실시간 통신 | Centrifugo, WebSocket | 3101 |
| **Storage** | 64.176.226.119 | 데이터 저장 | PostgreSQL, Redis, MinIO | 3101 |
| **Backup** | 141.164.37.63 | 백업 | Daily Backups, Archive | 3101 |

### 2.2 포트 할당 규칙

```yaml
# Port Allocation Strategy
ranges:
  system:      1000-2999   # 시스템 서비스
  apps:        3000-3999   # 애플리케이션
  databases:   5000-5999   # 데이터베이스
  cache:       6000-6999   # 캐시 서비스
  monitoring:  9000-9999   # 모니터링

# Reserved Ports (절대 사용 금지)
reserved:
  - 22    # SSH
  - 80    # HTTP (Caddy)
  - 443   # HTTPS (Caddy)
  - 3101  # MCP Agent
```

### 2.3 각 서버 상세

#### App Server (158.247.203.55)

```bash
# 실행 중인 서비스
┌─────────────────────────────────────────────────┐
│ Service              │ Port  │ Status           │
├─────────────────────────────────────────────────┤
│ codeb-dashboard      │ 3100  │ ● running        │
│ codeb-cms            │ 3202  │ ● running        │
│ mcp-agent            │ 3101  │ ● running        │
│ ssot-registry        │ 3102  │ ● running        │
│ caddy                │ 80/443│ ● running        │
│ actions-runner       │ -     │ ● listening      │
└─────────────────────────────────────────────────┘

# 디렉토리 구조
/opt/codeb/
├── config/           # 설정 파일
├── dashboard/        # Dashboard 소스
├── mcp-agent/        # MCP Agent
├── ssot-registry/    # Central Registry
├── projects/         # 프로젝트별 폴더
│   └── codeb-cms/
│       ├── .env
│       └── data/
├── env/              # 환경변수 백업
├── logs/             # 로그 파일
└── backups/          # 로컬 백업

/etc/containers/systemd/  # Quadlet 파일
├── codeb-dashboard.container
├── codeb-cms.container
├── codeb-cms.network
└── ...
```

#### Streaming Server (141.164.42.213)

```bash
# 실행 중인 서비스
┌─────────────────────────────────────────────────┐
│ Service              │ Port  │ Status           │
├─────────────────────────────────────────────────┤
│ centrifugo           │ 8000  │ ● running        │
│ mcp-agent            │ 3101  │ ● running        │
│ caddy                │ 80/443│ ● running        │
└─────────────────────────────────────────────────┘
```

#### Storage Server (64.176.226.119)

```bash
# 실행 중인 서비스
┌─────────────────────────────────────────────────┐
│ Service              │ Port  │ Status           │
├─────────────────────────────────────────────────┤
│ postgresql           │ 5433  │ ● running        │
│ redis                │ 6380  │ ● running        │
│ minio                │ 9000  │ ● running        │
│ mcp-agent            │ 3101  │ ● running        │
└─────────────────────────────────────────────────┘
```

#### Backup Server (141.164.37.63)

```bash
# 실행 중인 서비스
┌─────────────────────────────────────────────────┐
│ Service              │ Port  │ Status           │
├─────────────────────────────────────────────────┤
│ backup-scheduler     │ -     │ ● running        │
│ mcp-agent            │ 3101  │ ● running        │
└─────────────────────────────────────────────────┘

# 백업 스케줄
- Daily: 03:00 UTC - Full backup
- Hourly: Database WAL archive
- Weekly: Retention cleanup (30 days)
```

---

## 3. 핵심 컴포넌트

### 3.1 Podman (컨테이너 런타임)

```bash
# 설치 (Ubuntu 22.04+)
sudo apt update
sudo apt install -y podman podman-compose

# 버전 확인
podman --version

# 기본 명령어
podman ps                      # 실행 중인 컨테이너
podman logs <container>        # 로그 확인
podman exec -it <container> sh # 컨테이너 접속
podman images                  # 이미지 목록
podman pull <image>            # 이미지 다운로드
```

### 3.2 Quadlet (systemd 통합)

Quadlet은 Podman 컨테이너를 systemd 서비스로 관리합니다.

```bash
# Quadlet 파일 위치
/etc/containers/systemd/

# 파일 확장자
*.container  # 컨테이너 정의
*.network    # 네트워크 정의
*.volume     # 볼륨 정의

# 예시: codeb-cms.container
[Unit]
Description=CodeB CMS Application
After=network-online.target

[Container]
Image=ghcr.io/wodory/codeb-cms:latest
ContainerName=codeb-cms
AutoUpdate=registry
Network=codeb-cms.network
PublishPort=3202:3000
EnvironmentFile=/opt/codeb/projects/codeb-cms/.env
Volume=/opt/codeb/projects/codeb-cms/data:/app/data:Z

# Health Check
HealthCmd=curl -f http://localhost:3000/api/health || exit 1
HealthInterval=30s
HealthTimeout=10s
HealthRetries=3
HealthStartPeriod=40s

[Service]
Restart=always
RestartSec=10s
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target

# 서비스 관리
systemctl daemon-reload                    # 설정 리로드
systemctl start codeb-cms.service          # 시작
systemctl stop codeb-cms.service           # 중지
systemctl restart codeb-cms.service        # 재시작
systemctl status codeb-cms.service         # 상태 확인
journalctl -u codeb-cms.service -f         # 로그 확인
```

### 3.3 Caddy (리버스 프록시)

```bash
# Caddyfile 위치
/etc/caddy/Caddyfile

# 예시 설정
codeb-cms.one-q.xyz {
    reverse_proxy localhost:3202

    # 자동 HTTPS (Let's Encrypt)
    tls {
        email admin@example.com
    }

    # 로깅
    log {
        output file /var/log/caddy/codeb-cms.log
    }

    # 헤더
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        -Server
    }
}

# Caddy 관리
sudo systemctl reload caddy    # 설정 리로드
sudo systemctl status caddy    # 상태 확인
caddy validate                 # 설정 검증
```

---

## 4. MCP Agent 설치

### 4.1 MCP Agent란?

MCP (Model Context Protocol) Agent는 각 서버에서 실행되는 HTTP API 서버입니다.
- 컨테이너 상태 조회
- 서비스 시작/중지/재시작
- 환경변수 관리
- 시스템 리소스 모니터링

### 4.2 설치 스크립트

```bash
#!/bin/bash
# install-mcp-agent.sh

MCP_DIR="/opt/codeb/mcp-agent"
MCP_PORT="${MCP_PORT:-3101}"
MCP_API_KEY="${MCP_API_KEY:-$(openssl rand -hex 32)}"

# 디렉토리 생성
mkdir -p "$MCP_DIR"

# Node.js 확인
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# MCP Agent 코드 생성
cat > "$MCP_DIR/index.js" << 'AGENT_CODE'
const http = require('http');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const PORT = process.env.MCP_PORT || 3101;
const API_KEY = process.env.MCP_API_KEY || '';

// 인증 미들웨어
function authenticate(req) {
  if (!API_KEY) return true;
  const authHeader = req.headers['authorization'];
  return authHeader === `Bearer ${API_KEY}`;
}

// 명령 실행
async function runCommand(cmd) {
  try {
    const { stdout } = await execAsync(cmd, { timeout: 30000 });
    return stdout.trim();
  } catch (error) {
    return error.message;
  }
}

// 시스템 상태
async function getSystemStatus() {
  const [containers, disk, memory, uptime] = await Promise.all([
    runCommand('podman ps --format json 2>/dev/null || echo "[]"'),
    runCommand("df -h / | tail -1 | awk '{print $5}'"),
    runCommand("free -m | awk '/Mem:/ {printf \"%.1f%%\", $3/$2*100}'"),
    runCommand('uptime -p')
  ]);

  return {
    containers: JSON.parse(containers || '[]'),
    disk: disk,
    memory: memory,
    uptime: uptime,
    timestamp: new Date().toISOString()
  };
}

// 라우터
const routes = {
  'GET /health': async () => ({ status: 'healthy', version: '1.0.0' }),
  'GET /status': async () => await getSystemStatus(),
  'GET /containers': async () => {
    const output = await runCommand('podman ps -a --format json');
    return JSON.parse(output || '[]');
  },
  'POST /service/start': async (body) => {
    const { name } = body;
    await runCommand(`systemctl start ${name}.service`);
    return { success: true, action: 'start', service: name };
  },
  'POST /service/stop': async (body) => {
    const { name } = body;
    await runCommand(`systemctl stop ${name}.service`);
    return { success: true, action: 'stop', service: name };
  },
  'POST /service/restart': async (body) => {
    const { name } = body;
    await runCommand(`systemctl restart ${name}.service`);
    return { success: true, action: 'restart', service: name };
  }
};

// HTTP 서버
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (!authenticate(req)) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  const routeKey = `${req.method} ${req.url.split('?')[0]}`;
  const handler = routes[routeKey];

  if (!handler) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'Not found' }));
  }

  try {
    let body = {};
    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    }

    const result = await handler(body);
    res.end(JSON.stringify(result));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP Agent running on port ${PORT}`);
});
AGENT_CODE

# systemd 서비스 생성
cat > /etc/systemd/system/mcp-agent.service << EOF
[Unit]
Description=CodeB MCP Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$MCP_DIR
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
Environment=MCP_PORT=$MCP_PORT
Environment=MCP_API_KEY=$MCP_API_KEY

[Install]
WantedBy=multi-user.target
EOF

# 서비스 시작
systemctl daemon-reload
systemctl enable mcp-agent
systemctl start mcp-agent

echo "MCP Agent installed and running on port $MCP_PORT"
echo "API Key: $MCP_API_KEY"
```

### 4.3 API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/health` | 헬스 체크 |
| GET | `/status` | 시스템 상태 |
| GET | `/containers` | 컨테이너 목록 |
| POST | `/service/start` | 서비스 시작 |
| POST | `/service/stop` | 서비스 중지 |
| POST | `/service/restart` | 서비스 재시작 |

### 4.4 사용 예시

```bash
# 헬스 체크
curl http://158.247.203.55:3101/health

# 시스템 상태 (API 키 필요)
curl -H "Authorization: Bearer YOUR_API_KEY" \
     http://158.247.203.55:3101/status

# 서비스 재시작
curl -X POST \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"name": "codeb-cms"}' \
     http://158.247.203.55:3101/service/restart
```

---

## 5. SSOT Registry

### 5.1 개념

SSOT (Single Source of Truth) Registry는 모든 서버의 포트, 프로젝트, 도메인을 중앙에서 관리합니다.

```
┌─────────────────────────────────────────────────────────────┐
│                    SSOT Registry (158 서버)                  │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Port Manager │  │Project Manager│  │Domain Manager│       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │                │
│         └─────────────────┼─────────────────┘                │
│                           │                                  │
│                  ┌────────▼────────┐                        │
│                  │  registry.json  │                        │
│                  │  (Central Data) │                        │
│                  └─────────────────┘                        │
│                           │                                  │
│         ┌─────────────────┼─────────────────┐               │
│         ▼                 ▼                 ▼               │
│    App Server      Streaming Server   Storage Server        │
│    MCP Agent        MCP Agent         MCP Agent             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Registry 구조

```json
{
  "version": "1.0.0",
  "lastUpdated": "2024-12-18T12:00:00Z",
  "servers": {
    "app": {
      "ip": "158.247.203.55",
      "role": "application",
      "mcpPort": 3101,
      "status": "online"
    },
    "streaming": {
      "ip": "141.164.42.213",
      "role": "streaming",
      "mcpPort": 3101,
      "status": "online"
    },
    "storage": {
      "ip": "64.176.226.119",
      "role": "storage",
      "mcpPort": 3101,
      "status": "online"
    },
    "backup": {
      "ip": "141.164.37.63",
      "role": "backup",
      "mcpPort": 3101,
      "status": "online"
    }
  },
  "ports": {
    "3100": { "project": "codeb-dashboard", "server": "app", "environment": "production" },
    "3101": { "project": "mcp-agent", "server": "*", "environment": "system" },
    "3102": { "project": "ssot-registry", "server": "app", "environment": "system" },
    "3202": { "project": "codeb-cms", "server": "app", "environment": "production" },
    "5433": { "project": "postgresql", "server": "storage", "environment": "production" },
    "6380": { "project": "redis", "server": "storage", "environment": "production" }
  },
  "projects": {
    "codeb-cms": {
      "name": "codeb-cms",
      "server": "app",
      "port": 3202,
      "domain": "codeb-cms.one-q.xyz",
      "image": "ghcr.io/wodory/codeb-cms:latest",
      "status": "running",
      "database": true,
      "redis": true
    }
  },
  "domains": {
    "codeb-cms.one-q.xyz": {
      "project": "codeb-cms",
      "ssl": true,
      "target": "localhost:3202"
    }
  }
}
```

### 5.3 SSOT Registry 설치

```bash
#!/bin/bash
# install-ssot-registry.sh

SSOT_DIR="/opt/codeb/ssot-registry"
SSOT_PORT="${SSOT_PORT:-3102}"

mkdir -p "$SSOT_DIR"

# Registry 코드
cat > "$SSOT_DIR/index.js" << 'REGISTRY_CODE'
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.SSOT_PORT || 3102;
const REGISTRY_FILE = path.join(__dirname, 'registry.json');

// 초기 레지스트리
const defaultRegistry = {
  version: "1.0.0",
  lastUpdated: new Date().toISOString(),
  servers: {},
  ports: {},
  projects: {},
  domains: {}
};

// 레지스트리 로드
function loadRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  } catch {
    return defaultRegistry;
  }
}

// 레지스트리 저장
function saveRegistry(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
}

// 포트 할당
function allocatePort(projectName, server, environment) {
  const registry = loadRegistry();

  // 사용 중인 포트 확인
  const usedPorts = Object.keys(registry.ports).map(Number);

  // 3200-3999 범위에서 빈 포트 찾기
  for (let port = 3200; port < 4000; port++) {
    if (!usedPorts.includes(port)) {
      registry.ports[port] = { project: projectName, server, environment };
      saveRegistry(registry);
      return port;
    }
  }

  throw new Error('No available ports');
}

// HTTP 서버
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (req.method === 'GET' && url.pathname === '/registry') {
      return res.end(JSON.stringify(loadRegistry()));
    }

    if (req.method === 'GET' && url.pathname === '/ports') {
      return res.end(JSON.stringify(loadRegistry().ports));
    }

    if (req.method === 'GET' && url.pathname === '/projects') {
      return res.end(JSON.stringify(loadRegistry().projects));
    }

    if (req.method === 'POST' && url.pathname === '/port/allocate') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());

      const port = allocatePort(body.project, body.server, body.environment);
      return res.end(JSON.stringify({ port, success: true }));
    }

    if (req.method === 'POST' && url.pathname === '/project/register') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());

      const registry = loadRegistry();
      registry.projects[body.name] = body;
      saveRegistry(registry);

      return res.end(JSON.stringify({ success: true, project: body.name }));
    }

    if (req.method === 'POST' && url.pathname === '/scan') {
      // 모든 서버 스캔
      const registry = loadRegistry();
      const results = {};

      for (const [name, server] of Object.entries(registry.servers)) {
        try {
          const response = await fetch(`http://${server.ip}:${server.mcpPort}/status`);
          results[name] = await response.json();
          registry.servers[name].status = 'online';
        } catch {
          results[name] = { error: 'unreachable' };
          registry.servers[name].status = 'offline';
        }
      }

      saveRegistry(registry);
      return res.end(JSON.stringify(results));
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SSOT Registry running on port ${PORT}`);

  // 초기 레지스트리 생성
  if (!fs.existsSync(REGISTRY_FILE)) {
    saveRegistry(defaultRegistry);
  }
});
REGISTRY_CODE

# 초기 레지스트리 데이터
cat > "$SSOT_DIR/registry.json" << 'INITIAL_DATA'
{
  "version": "1.0.0",
  "lastUpdated": "2024-12-18T00:00:00Z",
  "servers": {
    "app": {
      "ip": "158.247.203.55",
      "role": "application",
      "mcpPort": 3101,
      "status": "online"
    },
    "streaming": {
      "ip": "141.164.42.213",
      "role": "streaming",
      "mcpPort": 3101,
      "status": "online"
    },
    "storage": {
      "ip": "64.176.226.119",
      "role": "storage",
      "mcpPort": 3101,
      "status": "online"
    },
    "backup": {
      "ip": "141.164.37.63",
      "role": "backup",
      "mcpPort": 3101,
      "status": "online"
    }
  },
  "ports": {
    "3100": { "project": "codeb-dashboard", "server": "app", "environment": "production" },
    "3101": { "project": "mcp-agent", "server": "*", "environment": "system" },
    "3102": { "project": "ssot-registry", "server": "app", "environment": "system" },
    "3202": { "project": "codeb-cms", "server": "app", "environment": "production" },
    "5433": { "project": "postgresql", "server": "storage", "environment": "production" },
    "6380": { "project": "redis", "server": "storage", "environment": "production" }
  },
  "projects": {
    "codeb-dashboard": {
      "name": "codeb-dashboard",
      "server": "app",
      "port": 3100,
      "status": "running"
    },
    "codeb-cms": {
      "name": "codeb-cms",
      "server": "app",
      "port": 3202,
      "domain": "codeb-cms.one-q.xyz",
      "image": "ghcr.io/wodory/codeb-cms:latest",
      "status": "running"
    }
  },
  "domains": {}
}
INITIAL_DATA

# systemd 서비스
cat > /etc/systemd/system/ssot-registry.service << EOF
[Unit]
Description=CodeB SSOT Registry
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$SSOT_DIR
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
Environment=SSOT_PORT=$SSOT_PORT

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ssot-registry
systemctl start ssot-registry

echo "SSOT Registry running on port $SSOT_PORT"
```

---

## 6. Quadlet 배포

### 6.1 새 프로젝트 배포

```bash
# 1. 포트 할당 (SSOT Registry)
PORT=$(curl -X POST http://localhost:3102/port/allocate \
  -H "Content-Type: application/json" \
  -d '{"project":"my-app","server":"app","environment":"production"}' \
  | jq -r '.port')

echo "Allocated port: $PORT"

# 2. 프로젝트 디렉토리 생성
mkdir -p /opt/codeb/projects/my-app
cat > /opt/codeb/projects/my-app/.env << EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@64.176.226.119:5433/myapp
REDIS_URL=redis://64.176.226.119:6380
EOF

# 3. Quadlet 파일 생성
cat > /etc/containers/systemd/my-app.container << EOF
[Unit]
Description=My App
After=network-online.target

[Container]
Image=ghcr.io/myorg/my-app:latest
ContainerName=my-app
AutoUpdate=registry
PublishPort=${PORT}:3000
EnvironmentFile=/opt/codeb/projects/my-app/.env
HealthCmd=curl -f http://localhost:3000/api/health || exit 1
HealthInterval=30s

[Service]
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 4. 서비스 시작
systemctl daemon-reload
systemctl start my-app.service

# 5. 프로젝트 등록 (SSOT Registry)
curl -X POST http://localhost:3102/project/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-app",
    "server": "app",
    "port": '${PORT}',
    "domain": "my-app.one-q.xyz",
    "image": "ghcr.io/myorg/my-app:latest",
    "status": "running"
  }'

# 6. Caddy 도메인 설정
cat >> /etc/caddy/Caddyfile << EOF

my-app.one-q.xyz {
    reverse_proxy localhost:${PORT}
}
EOF

systemctl reload caddy
```

### 6.2 네트워크 구성 (여러 컨테이너 연결)

```ini
# /etc/containers/systemd/my-app.network
[Network]
NetworkName=my-app-net
Subnet=10.89.0.0/24
Gateway=10.89.0.1
```

```ini
# /etc/containers/systemd/my-app.container (수정)
[Container]
...
Network=my-app.network
```

---

## 7. GitHub Actions CI/CD

### 7.1 Hybrid 워크플로우

GitHub-hosted 러너에서 빌드, Self-hosted 러너에서 배포하는 하이브리드 방식입니다.

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions Workflow                   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           GitHub-hosted Runners (ubuntu-latest)       │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────────────────┐   │   │
│  │  │  Lint   │→→│  Test   │→→│  Build & Push Image │   │   │
│  │  │ ESLint  │  │  Jest   │  │  ghcr.io            │   │   │
│  │  └─────────┘  └─────────┘  └──────────┬──────────┘   │   │
│  └───────────────────────────────────────┼──────────────┘   │
│                                          │                   │
│                                          ▼                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Self-hosted Runner (158.247.203.55)         │   │
│  │  ┌──────────────────┐  ┌──────────────────────────┐  │   │
│  │  │  Port Validate   │→→│  Deploy via Quadlet      │  │   │
│  │  │  (SSOT Check)    │  │  systemctl restart       │  │   │
│  │  └──────────────────┘  └──────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 워크플로우 파일 (.github/workflows/deploy.yml)

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  # ===== GitHub-hosted =====
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test -- --passWithNoTests

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    if: github.event_name == 'push' || github.event_name == 'workflow_dispatch'
    permissions:
      contents: read
      packages: write
    outputs:
      image_tag: ${{ steps.vars.outputs.image_tag }}

    steps:
      - uses: actions/checkout@v4

      - name: Set variables
        id: vars
        run: |
          if [ "${{ github.ref }}" = "refs/heads/main" ]; then
            echo "image_tag=latest" >> $GITHUB_OUTPUT
          else
            echo "image_tag=staging" >> $GITHUB_OUTPUT
          fi

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ steps.vars.outputs.image_tag }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ===== Self-hosted =====
  port-validate:
    runs-on: self-hosted
    needs: build
    steps:
      - name: Validate port allocation
        run: |
          # SSOT Registry에서 포트 검증
          RESULT=$(curl -s http://localhost:3102/ports | jq '."3202"')
          if [ "$RESULT" != "null" ]; then
            echo "✅ Port validated"
          else
            echo "❌ Port not allocated"
            exit 1
          fi

  deploy:
    runs-on: self-hosted
    needs: [build, port-validate]
    steps:
      - name: Pull latest image
        run: |
          podman pull ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ needs.build.outputs.image_tag }}

      - name: Update Quadlet and restart
        run: |
          CONTAINER_NAME="${{ github.event.repository.name }}"
          QUADLET_FILE="/etc/containers/systemd/${CONTAINER_NAME}.container"

          # Update image in Quadlet file
          sed -i "s|^Image=.*|Image=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ needs.build.outputs.image_tag }}|" "$QUADLET_FILE"

          # Restart service
          systemctl daemon-reload
          systemctl restart ${CONTAINER_NAME}.service

      - name: Health check
        run: |
          sleep 10
          for i in {1..15}; do
            if curl -sf http://localhost:3202/api/health; then
              echo "✅ Health check passed"
              exit 0
            fi
            echo "Attempt $i/15..."
            sleep 3
          done
          echo "❌ Health check failed"
          exit 1
```

### 7.3 Self-hosted Runner 설치

```bash
# 서버에서 실행 (158.247.203.55)
cd /opt/actions-runner

# 다운로드
curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.320.0/actions-runner-linux-x64.tar.gz

tar xzf actions-runner-linux-x64.tar.gz

# 구성 (GitHub에서 토큰 발급 필요)
./config.sh --url https://github.com/YOUR_ORG/YOUR_REPO \
            --token YOUR_TOKEN

# 서비스 설치 및 시작
sudo ./svc.sh install
sudo ./svc.sh start
```

---

## 8. 프로젝트 생성 워크플로우

### 8.1 완전한 프로젝트 생성 흐름

```
개발자                    시스템
   │
   │  1. we workflow init my-app
   │  ─────────────────────────→
   │                              │ 포트 할당 (SSOT)
   │                              │ 디렉토리 생성
   │                              │ .env 생성
   │                              │ Quadlet 파일 생성
   │                              │ GitHub Actions 생성
   │  ←─────────────────────────
   │  "Project initialized"
   │
   │  2. git push origin main
   │  ─────────────────────────→
   │                              │ GitHub Actions 트리거
   │                              │ lint → test → build
   │                              │ Push to ghcr.io
   │                              │ Self-hosted: deploy
   │  ←─────────────────────────
   │  "Deployment complete"
   │
   │  3. we workflow status my-app
   │  ─────────────────────────→
   │                              │ 컨테이너 상태 확인
   │                              │ 헬스 체크
   │  ←─────────────────────────
   │  "Status: running ✅"
```

### 8.2 CLI 명령어 요약

```bash
# 프로젝트 초기화
we workflow init my-app --type nextjs --database --redis

# 배포
we deploy my-app --environment production

# 상태 확인
we workflow status my-app
we workflow scan my-app

# 서비스 관리
we workflow stop my-app
we workflow start my-app
we workflow restart my-app

# 로그 확인
we workflow logs my-app --follow

# 도메인 설정
we domain setup my-app.example.com --ssl

# SSOT 관리
we ssot status
we ssot projects
we ssot sync
```

---

## 9. 배포 전략

### 9.1 Rolling Deploy (기본)

```
┌─────────────────────────────────────────┐
│           Rolling Deploy                 │
│                                          │
│  1. Pull new image                       │
│  2. Stop old container (graceful)        │
│  3. Start new container                  │
│  4. Health check                         │
│  5. Route traffic                        │
└─────────────────────────────────────────┘
```

### 9.2 Blue-Green Deploy

```
┌─────────────────────────────────────────┐
│          Blue-Green Deploy               │
│                                          │
│  Traffic →→ [Blue v1.0] (current)       │
│             [Green v1.1] (new)          │
│                                          │
│  After health check:                     │
│  Traffic →→ [Green v1.1] (current)      │
│             [Blue v1.0] (standby)       │
└─────────────────────────────────────────┘
```

### 9.3 Canary Deploy

```
┌─────────────────────────────────────────┐
│           Canary Deploy                  │
│                                          │
│  90% Traffic →→ [v1.0] (stable)         │
│  10% Traffic →→ [v1.1] (canary)         │
│                                          │
│  Monitor metrics...                      │
│  Gradually increase canary %             │
└─────────────────────────────────────────┘
```

---

## 10. 모니터링 및 로깅

### 10.1 Dashboard 접속

```
URL: http://158.247.203.55:3100
또는
URL: https://dashboard.one-q.xyz
```

### 10.2 로그 확인

```bash
# systemd 서비스 로그
journalctl -u codeb-cms.service -f

# Podman 컨테이너 로그
podman logs codeb-cms --follow --tail 100

# 모든 서비스 상태
systemctl list-units --type=service | grep codeb
```

### 10.3 리소스 모니터링

```bash
# 컨테이너 리소스 사용량
podman stats

# 디스크 사용량
df -h

# 메모리 사용량
free -h

# MCP Agent를 통한 확인
curl http://localhost:3101/status
```

---

## 11. 문제 해결

### 11.1 일반적인 문제

#### 컨테이너가 시작되지 않음

```bash
# 1. 서비스 상태 확인
systemctl status my-app.service

# 2. 로그 확인
journalctl -u my-app.service -n 50

# 3. Quadlet 파일 문법 확인
quadlet-generator /etc/containers/systemd/

# 4. 수동 실행 테스트
podman run --rm ghcr.io/myorg/my-app:latest
```

#### 포트 충돌

```bash
# 1. 사용 중인 포트 확인
ss -tlnp | grep LISTEN

# 2. SSOT에서 포트 할당 확인
curl http://localhost:3102/ports

# 3. 다른 포트 할당
curl -X POST http://localhost:3102/port/allocate \
  -d '{"project":"my-app","server":"app","environment":"production"}'
```

#### 이미지 Pull 실패

```bash
# 1. ghcr.io 로그인
podman login ghcr.io -u USERNAME -p TOKEN

# 2. 이미지 존재 확인
podman search ghcr.io/myorg/my-app

# 3. 수동 Pull
podman pull ghcr.io/myorg/my-app:latest
```

### 11.2 긴급 롤백

```bash
# 1. 이전 이미지로 롤백
podman pull ghcr.io/myorg/my-app:previous-tag

# 2. Quadlet 파일 수정
sed -i 's/:latest/:previous-tag/' /etc/containers/systemd/my-app.container

# 3. 재시작
systemctl daemon-reload
systemctl restart my-app.service
```

### 11.3 지원 연락처

- **GitHub Issues**: https://github.com/wodory/codeb-server/issues
- **Documentation**: https://docs.codeb.dev

---

## 부록

### A. 서버 초기 설정 스크립트

```bash
#!/bin/bash
# setup-server.sh

# 1. 기본 패키지 설치
apt update && apt upgrade -y
apt install -y curl git jq podman podman-compose

# 2. Node.js 설치
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 3. Caddy 설치
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install caddy

# 4. 디렉토리 구조 생성
mkdir -p /opt/codeb/{config,dashboard,mcp-agent,projects,env,logs,backups}

# 5. MCP Agent 설치
# (위의 install-mcp-agent.sh 실행)

# 6. 방화벽 설정
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3101/tcp  # MCP Agent
ufw enable

echo "Server setup complete!"
```

### B. 환경변수 템플릿

```bash
# /opt/codeb/projects/my-app/.env.example
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@64.176.226.119:5433/myapp

# Redis
REDIS_URL=redis://64.176.226.119:6380

# Application
APP_SECRET=your-secret-key
APP_URL=https://my-app.one-q.xyz

# External Services
SMTP_HOST=smtp.example.com
SMTP_PORT=587
```

### C. 자주 사용하는 명령어

```bash
# Podman
podman ps -a                          # 모든 컨테이너
podman logs <name> -f                 # 로그 (follow)
podman exec -it <name> sh             # 컨테이너 접속
podman stats                          # 리소스 사용량
podman system prune -af               # 정리

# systemd
systemctl daemon-reload               # 설정 리로드
systemctl list-units --type=service   # 서비스 목록
systemctl status <name>.service       # 상태
journalctl -u <name>.service -f       # 로그

# Caddy
caddy validate                        # 설정 검증
systemctl reload caddy                # 리로드

# SSH
ssh root@158.247.203.55              # App 서버
ssh root@141.164.42.213              # Streaming 서버
ssh root@64.176.226.119              # Storage 서버
ssh root@141.164.37.63               # Backup 서버
```

---

**문서 버전**: 2.0
**최종 업데이트**: 2024-12-18
**작성자**: CodeB Team
