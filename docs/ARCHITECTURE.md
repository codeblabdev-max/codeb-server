# System Architecture

> **버전: VERSION 파일 참조** | SSOT 기반 버전 관리

## Overview

CodeB Server는 **Vercel 수준의 Self-hosted 배포 플랫폼**입니다:

- **Blue-Green Slot 배포** (무중단 배포)
- **Team-based API Key 인증** (v6.0+)
- **Claude Code 2.1 통합** (v7.0 신규 - Skills, Hooks, Agent)
- **MCP API** for Claude Code 통합
- **4-Server 인프라** on Vultr
- **실시간 백업** (PostgreSQL WAL + Redis AOF)
- **Edge Functions** (Deno Runtime)
- **Analytics & Web Vitals** (Vercel 스타일)

---

## Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Container Runtime | Docker | Production containers |
| Reverse Proxy | Caddy 2.x | HTTPS + Auto SSL |
| DNS | PowerDNS 4.x | Dynamic DNS management |
| Service Manager | systemd + Docker | Container management |
| Database | PostgreSQL 15 | Shared database |
| Cache | Redis 7 | Shared cache |
| WebSocket | Centrifugo | Real-time communication |
| CI/CD | GitHub Actions (self-hosted) | Build & deploy automation |
| MCP API | Express.js + TypeScript | HTTP API server (v6.0) |
| Edge Runtime | Deno | Edge Functions |

---

## Server Infrastructure

### 4-Server Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        App Server (158.247.203.55)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  PowerDNS   │  │    Caddy    │  │  MCP API    │  │ Containers  │    │
│  │ (DNS:53)    │  │ (HTTPS:443) │  │ (HTTP:9101) │  │ (3000-4999) │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐                                       │
│  │ GitHub      │  │  Edge       │                                       │
│  │ Runner      │  │  Runtime    │                                       │
│  └─────────────┘  └─────────────┘                                       │
└─────────────────────────────────────────────────────────────────────────┘
        │                                                    │
        │                                                    │
        ▼                                                    ▼
┌───────────────────────┐                    ┌───────────────────────┐
│ Storage (64.176.226.119)│                    │ Streaming (141.164.42.213)│
│  ┌─────────────────┐  │                    │  ┌─────────────────┐  │
│  │  PostgreSQL     │  │                    │  │   Centrifugo    │  │
│  │  (port 5432)    │  │                    │  │   (port 8000)   │  │
│  ├─────────────────┤  │                    │  └─────────────────┘  │
│  │     Redis       │  │                    └───────────────────────┘
│  │  (port 6379)    │  │
│  └─────────────────┘  │                    ┌───────────────────────┐
└───────────────────────┘                    │ Backup (141.164.37.63)  │
                                             │  ┌─────────────────┐  │
                                             │  │   ENV Backup    │  │
                                             │  │   Prometheus    │  │
                                             │  │   Grafana       │  │
                                             │  └─────────────────┘  │
                                             └───────────────────────┘
```

### Server Roles

| Server | IP | Domain | Services |
|--------|-----|--------|----------|
| **App** | 158.247.203.55 | app.codeb.kr, api.codeb.kr | Containers, Caddy, PowerDNS, MCP API, GitHub Runner, Edge Runtime |
| **Storage** | 64.176.226.119 | db.codeb.kr | PostgreSQL, Redis |
| **Streaming** | 141.164.42.213 | ws.codeb.kr | Centrifugo (WebSocket) |
| **Backup** | 141.164.37.63 | backup.codeb.kr | ENV backup, Prometheus, Grafana |

---

## Blue-Green Slot System

### Concept

각 프로젝트는 **두 개의 Slot** (blue/green)을 가지며, 하나만 활성 상태입니다.

```
Project: myapp
Environment: staging

┌─────────────────────────────────────────────┐
│              Caddy Config                   │
│  myapp-staging.codeb.kr → localhost:3000    │
└─────────────────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         │                         │
         ▼                         ▼
   ┌──────────┐              ┌──────────┐
   │  BLUE    │ ◀── Active   │  GREEN   │
   │ :3000    │              │ :3001    │
   │ Running  │              │ Standby  │
   └──────────┘              └──────────┘
```

### State Transitions

```
EMPTY → deploy → DEPLOYED → promote → ACTIVE
                                ↓
                         (previous slot)
                                ↓
                          GRACE-PERIOD → cleanup → EMPTY
                                ↓
                             rollback
                                ↓
                              ACTIVE
```

### Slot States

| State | Description |
|-------|-------------|
| `empty` | 컨테이너 없음 |
| `deployed` | 배포됨 (Preview URL 사용 가능) |
| `active` | 트래픽 수신 중 |
| `grace` | 이전 버전 (48시간 유지 후 정리) |

### Registry Files (v6.0)

| File | Location | Purpose |
|------|----------|---------|
| SSOT | `/opt/codeb/registry/ssot.json` | Project registry |
| Slots | `/opt/codeb/registry/slots/{project}-{env}.json` | Slot state |
| Teams | `/opt/codeb/registry/teams.json` | Team registry |
| API Keys | `/opt/codeb/registry/api-keys.json` | API key registry |
| Edge | `/opt/codeb/registry/edge-functions/{project}/manifest.json` | Edge functions |
| ENV | `/opt/codeb/env-backup/{project}/{env}/` | Environment files |
| Caddy | `/etc/caddy/sites/{project}-{env}.caddy` | Reverse proxy config |

---

## Port Allocation

### Port Ranges

| Environment | App Ports | Blue | Green |
|-------------|-----------|------|-------|
| Staging | 3000-3499 | Base | Base+1 |
| Production | 4000-4499 | Base | Base+1 |
| Preview | 5000-5999 | Base | Base+1 |
| Edge Functions | 9200 | - | - |

### Port Calculation

```javascript
// Hash-based port allocation
const hash = projectName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
const basePort = environment === 'production'
  ? 4000 + (hash % 500)
  : 3000 + (hash % 500);

// Slot ports
const bluePort = basePort;      // e.g., 3050
const greenPort = basePort + 1; // e.g., 3051
```

---

## Request Flow

### Deploy Request

```
1. Client → POST /api/tool {tool: "deploy"}
2. API → Validate API Key (codeb_{teamId}_{role}_{token})
3. API → Check permissions (member+)
4. API → Load slot registry
5. API → Determine target slot (opposite of active)
6. API → SSH to app server
7. API → docker pull + docker run
8. API → Health check
9. API → Update slot registry
10. API → Return preview URL
```

### Promote Request

```
1. Client → POST /api/tool {tool: "promote"}
2. API → Validate permissions (member+)
3. API → Load slot registry
4. API → Generate Caddy config
5. API → Write to /etc/caddy/sites/
6. API → systemctl reload caddy
7. API → Update slot registry (active slot, grace period)
8. API → Return domain URL
```

---

## Authentication (v6.0)

### API Key Format

```
codeb_{teamId}_{role}_{randomToken}

Examples:
- codeb_default_admin_a1b2c3d4e5f6g7h8
- codeb_myteam_member_x9y8z7w6v5u4t3s2
- codeb_default_viewer_abcdefghijklmnop
```

### Role Hierarchy

| Role | Level | Capabilities |
|------|-------|--------------|
| **owner** | 4 | 모든 권한 + 팀 삭제 |
| **admin** | 3 | 멤버 관리, 토큰 생성, 슬롯 정리 |
| **member** | 2 | 배포, promote, rollback, ENV 설정 |
| **viewer** | 1 | 조회만 (상태, 로그, 메트릭) |

### Permission Matrix

| Operation | owner | admin | member | viewer |
|-----------|:-----:|:-----:|:------:|:------:|
| team.delete | O | X | X | X |
| member.manage | O | O | X | X |
| slot.cleanup | O | O | X | X |
| deploy | O | O | O | X |
| promote | O | O | O | X |
| rollback | O | O | O | X |
| env.set | O | O | O | X |
| view.* | O | O | O | O |

---

## Database Architecture

### Shared Database

모든 프로젝트는 Storage 서버의 PostgreSQL/Redis를 공유합니다.

```
PostgreSQL (db.codeb.kr:5432)
├── myapp (database)
├── another-app (database)
└── codeb (system database)

Redis (db.codeb.kr:6379)
├── myapp: (prefix)
├── another-app: (prefix)
└── codeb: (system prefix)
```

### Connection

```bash
# ENV 자동 생성
DATABASE_URL=postgresql://postgres:password@db.codeb.kr:5432/myapp?schema=public
REDIS_URL=redis://db.codeb.kr:6379/0
REDIS_PREFIX=myapp:
```

---

## Edge Functions (v6.0)

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Caddy (Reverse Proxy)                    │
└─────────────────────────────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
   ┌──────────┐           ┌──────────┐           ┌──────────┐
   │ Deno     │           │ Next.js  │           │ Deno     │
   │ Edge     │           │ App      │           │ Edge     │
   │ (9200)   │           │ (:3000)  │           │ (9200)   │
   └──────────┘           └──────────┘           └──────────┘
   middleware               main app               api route
```

### Function Types

| Type | Use Case | Example |
|------|----------|---------|
| `middleware` | 요청 전처리 | 인증, 로깅, 헤더 수정 |
| `api` | API 엔드포인트 | REST API, Webhook |
| `rewrite` | URL 재작성 | A/B 테스트, 프록시 |
| `redirect` | 리디렉션 | 301/302 리디렉트 |

### Resource Limits

| Resource | Default | Max |
|----------|---------|-----|
| Timeout | 10s | 30s |
| Memory | 64MB | 128MB |
| Code Size | - | 1MB |

---

## File Structure (v7.0)

```
codeb-server/
├── VERSION                     # Single source of truth (SSOT)
├── mcp-server/                 # TypeScript MCP API Server
│   │   ├── src/
│   │   │   ├── index.ts        # Express HTTP API
│   │   │   ├── lib/
│   │   │   │   ├── auth.ts     # Team-based auth
│   │   │   │   ├── types.ts    # TypeScript types
│   │   │   │   └── servers.ts  # Server config
│   │   │   └── tools/          # 30 API tools
│   │   └── package.json
│   └── infrastructure/         # Setup scripts
│
├── .claude/                    # Claude Code 2.1 Integration
│   ├── settings.local.json     # Project settings (Wildcard, Hooks)
│   ├── skills/                 # Skills System (Hot Reload)
│   │   ├── deploy/             # 배포 관련 Skills
│   │   ├── monitoring/         # 모니터링 Skills
│   │   ├── infrastructure/     # 인프라 Skills
│   │   └── analysis/           # 분석 Skills
│   └── hooks/                  # Hook Scripts
│       ├── pre-deploy.py       # PreToolUse: 배포 검증
│       ├── post-deploy.py      # PostToolUse: 배포 완료 알림
│       ├── post-promote.py     # PostToolUse: 프로모트 로깅
│       ├── post-rollback.py    # PostToolUse: 롤백 로깅
│       ├── session-summary.py  # Stop (once: true): 세션 요약
│       └── agent-audit.py      # Agent: 감사 로깅
│
├── cli/                        # we CLI Tool
│   ├── package.json
│   ├── bin/we.js               # Entry point
│   └── src/                    # CLI source
│
├── docs/                       # Documentation
│
├── .github/
│   └── workflows/
│       └── deploy-mcp-api.yml  # Self-hosted runner workflow
│
└── CLAUDE.md                   # AI instructions (v7.0)
```

---

## Container Lifecycle

### Container Naming

```
{project}-{environment}-{slot}

Examples:
- myapp-staging-blue
- myapp-staging-green
- myapp-production-blue
```

### Labels

```bash
docker run \
  -l "codeb.project=myapp" \
  -l "codeb.environment=staging" \
  -l "codeb.slot=blue" \
  -l "codeb.version=v1.2.3" \
  ...
```

### Network

모든 컨테이너는 `codeb-main` 네트워크에 연결:

```bash
docker network create codeb-main
```

---

## GitHub Actions Self-Hosted Runner

### Configuration

| Item | Value |
|------|-------|
| Location | App Server (158.247.203.55) |
| Path | /opt/actions-runner |
| User | runner |
| Labels | self-hosted, Linux, X64, codeb, app-server |

### Why Host-Based Runner

```
❌ Containerized Runner 문제점:
   - Docker-in-Docker 설정 복잡
   - 볼륨 마운트 제한
   - 불안정한 빌드 환경

✅ Host systemd 서비스 장점:
   - 호스트의 Docker 직접 사용
   - 안정적이고 빠른 빌드
   - 간단한 설정 및 유지보수
```

---

## Monitoring & Logging

### Current Setup

| Component | Method | Location |
|-----------|--------|----------|
| Containers | docker logs | journalctl |
| Caddy | Access logs | /var/log/caddy/ |
| MCP API | Console | journalctl -u codeb-mcp-api |
| Audit | SQLite | /var/lib/codeb/audit.db |
| Metrics | Prometheus | backup.codeb.kr |
| Dashboard | Grafana | backup.codeb.kr |

### Health Checks

```bash
# API health (v6.0.5)
curl https://api.codeb.kr/health

# Full server check
curl -X POST https://api.codeb.kr/api/tool \
  -H "X-API-Key: codeb_default_viewer_xxx" \
  -d '{"tool": "health_check"}'
```

---

## Backup System (v6.0)

### 실시간 백업 구조

```
┌─────────────┐                      ┌─────────────┐
│  Storage    │   WAL 스트리밍        │   Backup    │
│   Server    │ ────────────────────▶│   Server    │
│             │   (실시간)            │             │
│ PostgreSQL  │                      │ WAL Archive │
│   Redis     │ ────────────────────▶│ RDB + AOF   │
│             │   매시간 동기화        │             │
└─────────────┘                      └─────────────┘
```

### 백업 유형

| 유형 | 방식 | 주기 | 보관 |
|------|------|------|------|
| PostgreSQL WAL | 스트리밍 | 실시간 | 7일 |
| PostgreSQL Dump | pg_dump | 매일 03:00 | 7일 |
| Redis RDB | BGSAVE | 매시간 | 24시간 |
| Redis AOF | everysec | 실시간 | 최신 1개 |
| ENV | 자동 | 변경 시 | 무제한 |

### ENV 백업 구조

```
/opt/codeb/env-backup/{project}/{environment}/
├── master.env           # 최초 생성 시 저장 (불변, 복구 기준)
├── current.env          # 현재 버전
├── 2026-01-15T10:30:00.env  # 변경 이력
└── ...
```

### 복구 명령

```bash
# ENV 복구 (master에서)
we env restore myapp --version master

# ENV 복구 (최신 백업에서)
we env restore myapp --version current
```

---

## Related Documents

- [QUICK_START.md](./QUICK_START.md) - 빠른 시작 가이드
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 배포 가이드
- [API-REFERENCE.md](./API-REFERENCE.md) - MCP API 레퍼런스
