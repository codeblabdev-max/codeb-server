# CodeB Server Documentation

> **v7.0.31** | Docker Blue-Green Deployment | 2026-01-13

## Project Structure

```
codeb-server/
├── VERSION                    # 7.0.31 (SSOT)
├── mcp-server/                # MCP API Server (TypeScript + Express)
├── cli/                       # we-cli (npm 배포용)
│   └── mcp-proxy/             # MCP Proxy (팀원용)
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
# 1. API 키 설정
mkdir -p ~/.codeb
echo "CODEB_API_KEY=codeb_팀ID_역할_토큰" > ~/.codeb/.env

# 2. CLI 설치
npm install -g @codeblabdev-max/we-cli

# 3. 배포
we deploy myapp              # → Preview URL 반환
we promote myapp             # → Production 전환
we rollback myapp            # → 즉시 롤백
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
│  │ • Docker    │     │             │     │             │       │
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
| **Storage** | 64.176.226.119 | db.codeb.kr | PostgreSQL, Redis |
| **Backup** | 141.164.37.63 | backup.codeb.kr | Prometheus, Grafana |

### Port Ranges (v7.0.30+)

| Environment | Range | Blue | Green |
|-------------|-------|------|-------|
| **Production** | 4100-4499 | even | odd |
| **Staging** | 4500-4999 | even | odd |
| **Preview** | 5000-5499 | - | - |

---

## Blue-Green Deployment (Docker)

```
┌──────────┐    deploy    ┌──────────┐   promote   ┌──────────┐
│  empty   │ ──────────→  │ deployed │ ─────────→  │  active  │
└──────────┘              └──────────┘             └──────────┘
                                                        │
                                                        │ promote (다른 slot)
                                                        ▼
                                                  ┌──────────┐
                                                  │  grace   │
                                                  │ (48시간) │
                                                  └──────────┘
```

### Deploy Flow

1. **we deploy myapp** → 비활성 Slot에 Docker 컨테이너 배포 → Preview URL
2. **we promote myapp** → Caddy 설정 변경 → 무중단 트래픽 전환
3. **we rollback myapp** → Grace Slot 활성화 → 즉시 롤백

---

## MCP API (22 Tools)

### Endpoint

```
Primary:  https://api.codeb.kr/api
Health:   https://api.codeb.kr/health
```

### Authentication

```bash
# Header
X-API-Key: codeb_{teamId}_{role}_{randomToken}

# Roles
owner  - 모든 권한 + 팀 삭제
admin  - 멤버 관리, 토큰 관리
member - 배포, promote, rollback
viewer - 조회만
```

### Tools

| Category | Tools |
|----------|-------|
| **Team** | team_create, team_list, team_get, team_delete, team_settings |
| **Member** | member_invite, member_remove, member_list |
| **Token** | token_create, token_revoke, token_list |
| **Deploy** | deploy, deploy_project, promote, slot_promote, rollback |
| **Slot** | slot_status, slot_cleanup, slot_list |
| **Domain** | domain_setup, domain_verify, domain_list, domain_delete, ssl_status |
| **Workflow** | workflow_init, workflow_scan |

---

## GitHub Actions Workflow

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4

      - name: Build & Push
        run: |
          docker build -t ghcr.io/${{ github.repository }}:${{ github.sha }} .
          docker push ghcr.io/${{ github.repository }}:${{ github.sha }}

      - name: Deploy via CodeB API
        run: |
          curl -sf -X POST "https://api.codeb.kr/api/tool" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{
              "tool": "deploy",
              "params": {
                "projectName": "${{ github.event.repository.name }}",
                "environment": "staging",
                "image": "ghcr.io/${{ github.repository }}:${{ github.sha }}"
              }
            }'
```

---

## CLI Commands

```bash
# Authentication
we login                           # API Key 입력
we whoami                          # 현재 사용자

# Deploy
we deploy                          # 현재 프로젝트 → Preview URL
we deploy myapp production         # 특정 프로젝트/환경
we promote myapp                   # → Production 전환
we rollback myapp                  # → 즉시 롤백

# Status
we slot status myapp               # Slot 상태
we health                          # 시스템 헬스

# Domain
we domain setup myapp.codeb.kr     # 도메인 설정

# Workflow
we workflow init myapp --type nextjs
```

---

## Version

- **Server**: 7.0.31
- **MCP Server**: @codeblabdev-max/mcp-server@7.0.31
- **CLI**: @codeblabdev-max/we-cli@7.0.31
- **API Endpoint**: https://api.codeb.kr/api (22 tools)
- **Container Runtime**: Docker

---

## Related Documents

- [CLAUDE.md](../CLAUDE.md) - Claude Code 규칙
- [API-REFERENCE.md](./API-REFERENCE.md) - API 상세 레퍼런스
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 시스템 아키텍처 상세
