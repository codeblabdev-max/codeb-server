# CodeB Server Documentation

> **버전**: VERSION 파일 참조 (SSOT) | Docker Blue-Green Deployment

## Project Structure

```
codeb-server/
├── VERSION                    # SSOT (Single Source of Truth)
├── mcp-server/                # MCP API Server (TypeScript + Express)
│   ├── src/                   # 소스 코드 (38 tools)
│   ├── Dockerfile             # Docker 빌드
│   └── package.json
├── cli/                       # we-cli (npm 배포용)
│   └── bin/we.js              # CLI 진입점 (VERSION SSOT)
├── scripts/                   # 유틸리티 스크립트
├── docs/                      # 문서
└── .github/workflows/         # CI/CD

.claude/
├── settings.local.json        # Claude Code 설정
├── skills/                    # Skills 시스템
└── hooks/                     # Hook 스크립트
```

---

## Quick Start

```bash
# 1. CLI 설치
npm install -g @codeblabdev-max/we-cli

# 2. MCP 서버 등록
claude mcp add codeb-deploy \
  --command node \
  --args "/opt/homebrew/lib/node_modules/@codeblabdev-max/we-cli/bin/codeb-mcp.js" \
  --env CODEB_API_URL=https://api.codeb.kr

# 3. API 키 설정
export CODEB_API_KEY=codeb_팀ID_역할_토큰

# 4. 배포 (git push = 자동 배포)
git push origin main           # → Actions → Blue-Green 배포
/we:promote myapp              # → Production 전환
/we:rollback myapp             # → 즉시 롤백
```

---

## 4-Server Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │ App Server  │     │  Streaming  │     │   Storage   │       │
│  │ 158.247.    │     │ 141.164.    │     │  64.176.    │       │
│  │   203.55    │     │   42.213    │     │   226.119   │       │
│  │ • MCP API   │     │ • Centrifugo│     │ • Postgres  │       │
│  │ • Caddy     │     │ • WebSocket │     │ • Redis     │       │
│  │ • Docker    │     │             │     │ • MinIO     │       │
│  │             │     │             │     │ • Registry  │       │
│  └─────────────┘     └─────────────┘     └─────────────┘       │
│         │                   │                   │               │
│         └───────────────────┼───────────────────┘               │
│                     ┌─────────────┐                             │
│                     │   Backup    │                             │
│                     │ 141.164.    │                             │
│                     │   37.63     │                             │
│                     │ • Prometheus│                             │
│                     │ • Grafana   │                             │
│                     └─────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

| Server | IP | Domain | Role |
|--------|-----|--------|------|
| **App** | 158.247.203.55 | api.codeb.kr | MCP API, Caddy, Docker |
| **Streaming** | 141.164.42.213 | ws.codeb.kr | Centrifugo (WebSocket) |
| **Storage** | 64.176.226.119 | db.codeb.kr | PostgreSQL, Redis, MinIO, Registry |
| **Backup** | 141.164.37.63 | backup.codeb.kr | Prometheus, Grafana |

---

## Blue-Green Deployment

```
┌──────────┐    deploy    ┌──────────┐   promote   ┌──────────┐
│  empty   │ ──────────→  │ deployed │ ─────────→  │  active  │
└──────────┘              └──────────┘             └──────────┘
                                                        │
                                                  promote (다른 slot)
                                                        ▼
                                                  ┌──────────┐
                                                  │  grace   │
                                                  │ (48시간) │
                                                  └──────────┘
```

### Deploy Flow

1. **git push** → GitHub Actions → Docker Buildx → Private Registry → MCP API 호출 → 비활성 Slot 배포 → Preview URL
2. **/we:promote myapp** → Caddy 설정 변경 → 무중단 트래픽 전환 → 이전 Slot은 48시간 grace
3. **/we:rollback myapp** → Grace Slot 활성화 → 즉시 롤백

---

## MCP API (38 Tools)

### Endpoint

```
Primary:  https://api.codeb.kr/api
Health:   https://api.codeb.kr/health
Metrics:  https://api.codeb.kr/metrics
SSE:      https://api.codeb.kr/api/logs/stream
```

### Authentication

```bash
X-API-Key: codeb_{teamId}_{role}_{randomToken}

# Roles: owner > admin > member > viewer
```

### Tool Categories

| Category | Tools | Count |
|----------|-------|-------|
| **Deploy** | deploy, deploy_project, promote, slot_promote, rollback | 5 |
| **Slot** | slot_status, slot_cleanup, slot_list | 3 |
| **Domain** | domain_setup, domain_list, domain_delete | 3 |
| **Project** | workflow_init, workflow_scan, workflow_generate, scan | 4 |
| **ENV** | env_sync, env_get, env_scan, env_restore | 4 |
| **Git/PR** | pr_list, pr_review, pr_merge, pr_create, git_sync | 5 |
| **Task** | task_create, task_list, task_get, task_update, task_check, task_complete | 6 |
| **Team** | team_create, team_list, team_get, team_settings | 4 |
| **Member** | member_invite, member_remove, member_list | 3 |
| **Token** | token_create, token_revoke, token_list | 3 |
| **Utility** | health_check | 1 |

---

## CI/CD (GitHub Actions + MinIO S3)

```bash
# 배포 = git push (자동)
git push origin main
# → Docker Buildx + MinIO S3 캐시
# → Private Registry (64.176.226.119:5000) push
# → MCP API → Blue-Green 배포

# 수동 트리거
gh workflow run deploy.yml -f action=promote
gh workflow run deploy.yml -f action=rollback
```

### Required Secrets

| Secret | Description |
|--------|-------------|
| `CODEB_API_KEY` | MCP API 인증 키 |
| `MINIO_ACCESS_KEY` | MinIO S3 Access Key |
| `MINIO_SECRET_KEY` | MinIO S3 Secret Key |

---

## Version

버전은 `VERSION` 파일에서 관리됩니다 (SSOT).

```bash
cat VERSION
curl -s https://api.codeb.kr/health | jq '.version'
```

- **MCP Server**: codeb-mcp (Express.js, 38 tools)
- **CLI**: @codeblabdev-max/we-cli
- **API Endpoint**: https://api.codeb.kr
- **Container Runtime**: Docker

---

## Documentation Index

| Document | Description |
|----------|-------------|
| [SERVICE-FLOW.md](./SERVICE-FLOW.md) | 전체 서비스 플로우 (요청→인증→실행→응답) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 시스템 아키텍처 상세 |
| [API-REFERENCE.md](./API-REFERENCE.md) | MCP API 레퍼런스 (38개 Tool 상세) |
| [DEPLOY-FLOW.md](./DEPLOY-FLOW.md) | Blue-Green 배포 플로우 상세 |
| [DATABASE-SCHEMA.md](./DATABASE-SCHEMA.md) | PostgreSQL 스키마 + Repository API |
| [DOMAIN-MANAGEMENT.md](./DOMAIN-MANAGEMENT.md) | 도메인 + DNS + SSL 관리 |
| [SKILLS-GUIDE.md](./SKILLS-GUIDE.md) | Claude Code Skills 가이드 |
| [TEAM-INSTALL-GUIDE.md](./TEAM-INSTALL-GUIDE.md) | 팀원 온보딩 가이드 |
| [VERSION-MANAGEMENT.md](./VERSION-MANAGEMENT.md) | 버전 관리 (SSOT) |
| [PRIVATE-REGISTRY.md](./PRIVATE-REGISTRY.md) | Private Docker Registry |
| [KNOWN-ISSUES.md](./KNOWN-ISSUES.md) | 알려진 이슈 |
