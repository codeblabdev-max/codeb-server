# System Architecture

> **버전**: VERSION 파일 참조 (SSOT) | 최종 업데이트: 2026-02-25

## Overview

CodeB Server는 **Vercel 수준의 Self-hosted 배포 플랫폼**입니다:

- **Blue-Green Slot 배포** (무중단 배포)
- **Team-based API Key 인증** (RBAC)
- **Claude Code 통합** (Skills, Hooks, MCP)
- **MCP API** (Express.js + TypeScript, 38개 Tool)
- **4-Server 인프라** on Vultr
- **SSH-Free 아키텍처** (LocalExec 기반)
- **실시간 백업** (PostgreSQL WAL + Redis AOF)

---

## Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| MCP API | Express.js + TypeScript | HTTP API 서버 (:9101) |
| Container Runtime | Docker | 프로덕션 컨테이너 |
| Reverse Proxy | Caddy 2.x | HTTPS + Auto SSL + Blue-Green 전환 |
| Database | PostgreSQL 15 | Slot/Project/ENV/Audit 저장 |
| Cache | Redis 7 | 프로젝트별 공유 캐시 |
| Object Storage | MinIO | Docker 빌드 캐시 + Registry |
| WebSocket | Centrifugo | 실시간 통신 |
| CI/CD | GitHub Actions (self-hosted) | Docker Buildx + MinIO S3 캐시 |
| Monitoring | Prometheus + Grafana | 메트릭 수집 + 대시보드 |
| Execution | LocalExec (child_process) | SSH-Free 로컬 실행 |

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
│  │    Caddy    │  │  MCP API    │  │ Containers  │  │ GitHub      │    │
│  │ (HTTPS:443) │  │ (HTTP:9101) │  │ (4100-5499) │  │ Runner      │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
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
│  ├─────────────────┤  │                    ┌───────────────────────┐
│  │ MinIO S3 :9000  │  │                    │ Backup (141.164.37.63)  │
│  │ Registry :5000  │  │                    │  ┌─────────────────┐  │
│  └─────────────────┘  │                    │  │   Prometheus    │  │
└───────────────────────┘                    │  │   Grafana       │  │
                                             │  └─────────────────┘  │
                                             └───────────────────────┘
```

### Server Roles

| Server | IP | Domain | Services |
|--------|-----|--------|----------|
| **App** | 158.247.203.55 | api.codeb.kr | MCP API, Caddy, Docker 컨테이너, GitHub Runner |
| **Storage** | 64.176.226.119 | db.codeb.kr | PostgreSQL, Redis, MinIO S3, Private Registry |
| **Streaming** | 141.164.42.213 | ws.codeb.kr | Centrifugo (WebSocket/SSE) |
| **Backup** | 141.164.37.63 | backup.codeb.kr | Prometheus, Grafana |

---

## Blue-Green Slot System

### Concept

각 프로젝트는 **두 개의 Slot** (blue/green)을 가지며, 하나만 활성 상태입니다.

```
Project: myapp (production)

         ┌─── Caddy (lb_policy first) ───┐
         │                                │
         ▼                                ▼
   ┌──────────┐                     ┌──────────┐
   │  BLUE    │ ◀── Active          │  GREEN   │
   │ :4100    │     (트래픽 수신)    │ :4101    │
   └──────────┘                     └──────────┘
```

### State Transitions

```
                    deploy
    ┌──────┐  ──────────────→  ┌──────────┐
    │ empty │                   │ deployed │
    └──────┘                   └────┬─────┘
                                     │ promote
                                     ▼
                               ┌──────────┐
                               │  active  │ ← 모든 트래픽
                               └────┬─────┘
                                     │ 다른 slot promote
                                     ▼
                               ┌──────────┐
                               │  grace   │ ← 48시간 유지
                               └────┬─────┘
                              rollback│    만료/cleanup
                                     ▼         ▼
                               ┌────────┐ ┌──────┐
                               │ active │ │ empty │
                               └────────┘ └──────┘
```

### Slot States

| State | Description |
|-------|-------------|
| `empty` | 컨테이너 없음 |
| `deployed` | 배포됨 (Preview URL 사용 가능) |
| `active` | 트래픽 수신 중 |
| `grace` | 이전 버전 (48시간 유지, 롤백 가능) |

---

## Port Allocation

| Environment | Range | Blue | Green |
|-------------|-------|------|-------|
| **Production** | 4100-4499 | 짝수 (4100, 4102, ...) | 홀수 (4101, 4103, ...) |
| **Staging** | 4500-4999 | 짝수 | 홀수 |
| **Preview** | 5000-5499 | 짝수 | 홀수 |

---

## Execution Layer (SSH-Free)

MCP API는 App 서버에서 직접 실행되므로 SSH가 불필요합니다.

```
┌──────────────────┐     ┌──────────────────────────┐
│   Tool Handler   │────→│     LocalExec            │
└──────────────────┘     │  (child_process.exec)    │
                          │                          │
                          │  exec(cmd)               │
                          │  writeFile(path, content) │
                          │  readFile(path)           │
                          │  fileExists(path)         │
                          │  mkdir(path)              │
                          └──────────────────────────┘
```

허용 경로: `/opt/codeb/`, `/etc/caddy/`, `/etc/containers/`, `/var/log/`, `/tmp/`

Storage DB 접근: SSH 터널 없이 TCP 직접 연결 (`psql -h 64.176.226.119`)

---

## Authentication

### API Key Format

```
codeb_{teamId}_{role}_{randomToken}
```

### Role Hierarchy

| Role | Level | Capabilities |
|------|-------|--------------|
| **owner** | 3 | 모든 권한 + 팀 생성/삭제 |
| **admin** | 2 | 멤버 관리, 토큰 관리, slot 정리 |
| **member** | 1 | 배포, promote, rollback, ENV 설정, 토큰 관리 |
| **viewer** | 0 | 조회만 (상태, 로그, 메트릭) |

### Auth Storage

인증은 파일 기반: `/opt/codeb/registry/api-keys.json` (SHA-256 해시 저장)

---

## Data Storage

### PostgreSQL (Primary, Storage 서버)

| Table | Purpose |
|-------|---------|
| `projects` | 프로젝트 레지스트리 |
| `project_slots` | Blue/Green Slot 상태 (SSOT) |
| `project_envs` | 환경변수 (버전 관리) |
| `deployments` | 배포 이력 |
| `domains` | 도메인 매핑 |
| `audit_logs` | API 감사 로그 |
| `work_tasks` | 작업 관리 + 파일 잠금 |

### File System (Fallback, App 서버)

| Path | Purpose |
|------|---------|
| `/opt/codeb/registry/api-keys.json` | 인증 SSOT |
| `/opt/codeb/registry/teams.json` | 팀 레지스트리 |
| `/opt/codeb/registry/slots/*.json` | Slot fallback |
| `/opt/codeb/env/{project}/.env.*` | ENV 파일 |
| `/etc/caddy/sites/{project}-*.caddy` | 리버스 프록시 |

---

## Container Lifecycle

### Naming Convention

```
{project}-{environment}-{slot}

Examples:
- myapp-production-blue
- myapp-staging-green
```

### Labels

```bash
docker run \
  -l "codeb.project=myapp" \
  -l "codeb.environment=production" \
  -l "codeb.slot=blue" \
  ...
```

### Resource Limits

```bash
--memory=512m --cpus=1
```

---

## Monitoring & Logging

| Component | Method | Location |
|-----------|--------|----------|
| MCP API | Prometheus | `GET /metrics` (20+ 메트릭) |
| Containers | docker logs | journalctl |
| Caddy | Access logs | /var/log/caddy/ |
| API Calls | Audit Log | PostgreSQL `audit_logs` 테이블 |
| Real-time | SSE Stream | `GET /api/logs/stream` |
| Dashboard | Grafana | backup.codeb.kr:3000 |

---

## File Structure

```
codeb-server/
├── VERSION                     # SSOT (버전 관리)
├── mcp-server/                 # MCP API Server
│   ├── src/
│   │   ├── index.ts            # Express HTTP API (38 tools)
│   │   ├── lib/
│   │   │   ├── auth.ts         # Team-based 인증
│   │   │   ├── caddy.ts        # Caddy 설정 관리
│   │   │   ├── database.ts     # PostgreSQL (migration v3)
│   │   │   ├── local-exec.ts   # SSH-Free 실행 계층
│   │   │   ├── log-stream.ts   # SSE 실시간 로그
│   │   │   └── servers.ts      # 4-Server 설정
│   │   └── tools/              # 38 API tools
│   ├── Dockerfile
│   └── package.json
│
├── cli/                        # we CLI Tool
│   ├── bin/we.js               # Entry (VERSION SSOT 읽기)
│   └── src/
│
├── docs/                       # Documentation
├── .github/workflows/          # CI/CD
│
├── .claude/
│   ├── settings.local.json     # Claude Code 설정
│   ├── skills/                 # Skills 시스템
│   └── hooks/                  # Hook 스크립트
│
└── CLAUDE.md                   # AI 규칙
```

---

## Related Documents

- [SERVICE-FLOW.md](./SERVICE-FLOW.md) - 전체 서비스 플로우
- [API-REFERENCE.md](./API-REFERENCE.md) - MCP API 레퍼런스
- [DEPLOY-FLOW.md](./DEPLOY-FLOW.md) - 배포 플로우 상세
- [DATABASE-SCHEMA.md](./DATABASE-SCHEMA.md) - DB 스키마
