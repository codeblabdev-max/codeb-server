# CodeB Server Documentation

> **버전: 6.0.5** | 코드명: Blue-Green | 업데이트: 2026-01-11

## 프로젝트 구조

```
codeb-server/
├── api/                    # Project Generator + MCP HTTP API (포트 9101)
├── cli/                    # npm 배포용 we-cli 패키지
├── docs/                   # 문서
├── scripts/                # 빌드/배포 스크립트
├── v6.0/                   # v6.0 핵심 시스템
│   ├── mcp-server/         # MCP API 서버 (TypeScript + Express)
│   ├── mcp-proxy/          # MCP Proxy (팀원용, HTTP API 프록시)
│   ├── cli/                # v6.0 CLI (Ink React TUI)
│   ├── analytics-sdk/      # 분석 SDK (Web Vitals)
│   ├── edge-runtime/       # Edge Functions 런타임
│   ├── infrastructure/     # 인프라 설정 스크립트
│   └── VERSION             # 버전 기준 파일 (6.0.5)
├── web-ui/                 # 관리 대시보드 (Next.js)
├── backup/                 # 레거시 백업 폴더
├── package.json            # 루트 패키지 (6.0.5)
├── CLAUDE.md               # AI 코딩 규칙
└── VERSION                 # 루트 버전 (v6.0/VERSION과 동기화)
```

---

## Quick Navigation

| Document | 대상 | 설명 |
|----------|-----|------|
| [QUICK_START.md](./QUICK_START.md) | 개발자 | 5분 설치 및 첫 배포 |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | 개발자 | Blue-Green 배포 상세 가이드 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 개발자 | 시스템 아키텍처 |
| [API-REFERENCE.md](./API-REFERENCE.md) | 개발자/AI | MCP API 전체 레퍼런스 |
| [AI-CONTEXT.md](./AI-CONTEXT.md) | AI | Claude Code용 컨텍스트 |
| [v6.0-INFRASTRUCTURE.md](./v6.0-INFRASTRUCTURE.md) | 관리자 | v6.0 인프라 가이드 |
| [v6.0-BACKUP-SYSTEM.md](./v6.0-BACKUP-SYSTEM.md) | 관리자 | v6.0 백업 시스템 |

---

## What is CodeB Server?

**Vercel 스타일 무중단 배포 시스템** for self-hosted infrastructure.

### 핵심 기능

| 기능 | 설명 |
|------|------|
| **Blue-Green Slot 배포** | 컨테이너 2개 유지, Caddy만 전환 (다운타임 0) |
| **Preview URL** | 배포 전 테스트, promote로 트래픽 전환 |
| **Grace Period** | 48시간 롤백 가능 (컨테이너 재배포 없음) |
| **MCP API** | Claude Code에서 직접 배포/관리 |
| **팀 협업** | SSH 없이 API Key로 팀원 배포 가능 |
| **실시간 백업** | PostgreSQL WAL + Redis AOF |
| **Edge Functions** | Deno 기반 서버리스 함수 |
| **Analytics** | Web Vitals (LCP, FID, CLS, INP) 수집 |

---

## 4-Server Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CodeB 4-Server Architecture                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │ App Server  │     │  Streaming  │     │   Storage   │       │
│  │ 158.247.    │     │ 141.164.    │     │  64.176.    │       │
│  │   203.55    │     │   42.213    │     │   226.119   │       │
│  │             │     │             │     │             │       │
│  │ • Next.js   │     │ • Centri-   │     │ • Postgres  │       │
│  │ • MCP API   │     │   fugo      │     │ • Redis     │       │
│  │ • Caddy     │     │ • WebSocket │     │             │       │
│  │ • Podman    │     │             │     │             │       │
│  │ • Edge RT   │     │             │     │             │       │
│  └─────────────┘     └─────────────┘     └─────────────┘       │
│         │                   │                   │               │
│         └───────────────────┼───────────────────┘               │
│                             │                                   │
│                     ┌─────────────┐                             │
│                     │   Backup    │                             │
│                     │ 141.164.    │                             │
│                     │   37.63     │                             │
│                     │             │                             │
│                     │ • ENV 백업  │                             │
│                     │ • Prometheus│                             │
│                     │ • Grafana   │                             │
│                     └─────────────┘                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 서버 상세

| Server | IP | Domain | Role | Port |
|--------|-----|--------|------|------|
| **App** | 158.247.203.55 | app.codeb.kr, api.codeb.kr | Apps, MCP API, Caddy | 9101 (API) |
| **Streaming** | 141.164.42.213 | ws.codeb.kr | Centrifugo (WebSocket) | 8000 |
| **Storage** | 64.176.226.119 | db.codeb.kr | PostgreSQL, Redis | 5432, 6379 |
| **Backup** | 141.164.37.63 | backup.codeb.kr | ENV Backup, Monitoring | - |

### 포트 할당

| Environment | Port Range | Blue | Green |
|-------------|------------|------|-------|
| **Staging** | 3000-3499 | basePort | basePort+1 |
| **Production** | 4000-4499 | basePort | basePort+1 |
| **Preview** | 5000-5999 | - | - |
| **Edge Functions** | 9200 | - | - |

---

## 패키지 버전 현황 (v6.0.5)

| 패키지 | 경로 | 버전 | 설명 |
|--------|------|------|------|
| **@codeblabdev-max/we-cli** | `package.json` | 6.0.5 | 루트 npm 패키지 |
| **codeb-api** | `api/package.json` | 6.0.5 | Project Generator + MCP HTTP API |
| **@codeblabdev-max/we-cli** | `cli/package.json` | 6.0.5 | CLI npm 패키지 배포용 |
| **codeb-web-ui** | `web-ui/package.json` | 6.0.5 | 관리 대시보드 |
| **@codeblabdev-max/mcp-server** | `v6.0/mcp-server/package.json` | 6.0.5 | MCP API 서버 |
| **@codeb/mcp-proxy** | `v6.0/mcp-proxy/package.json` | 6.0.5 | MCP Proxy (팀원용) |
| **@codeblabdev-max/we-cli** | `v6.0/cli/package.json` | 6.0.5 | v6.0 CLI |
| **@codeb/analytics** | `v6.0/analytics-sdk/package.json` | 6.0.5 | 분석 SDK |
| **@codeblabdev-max/edge-runtime** | `v6.0/edge-runtime/package.json` | 6.0.5 | Edge Functions |

### 버전 관리

```bash
# 서버가 항상 버전 기준
cat v6.0/VERSION  # 6.0.5

# 버전 동기화
npm run version:sync

# 버전 업데이트
echo "6.0.6" > v6.0/VERSION
git add . && git commit -m "chore: bump version to 6.0.6"
git push  # → GitHub Actions 자동 배포
```

---

## API Key 인증 (v6.0)

### 형식

```
codeb_{teamId}_{role}_{randomToken}

예시: codeb_default_admin_a1b2c3d4e5f6g7h8
```

### 역할 계층

```
owner   ─────→ 모든 권한 + 팀 삭제
   │
admin   ─────→ 멤버 관리, 토큰 생성, 슬롯 정리
   │
member  ─────→ 배포, promote, rollback, ENV 설정
   │
viewer  ─────→ 조회만 (상태, 로그, 메트릭)
```

### 팀원 설정

```bash
# 1. 디렉토리 생성
mkdir -p ~/.codeb

# 2. API 키 설정
echo "CODEB_API_KEY=codeb_팀ID_역할_토큰" > ~/.codeb/.env

# 3. 확인
cat ~/.codeb/.env
```

---

## MCP API Tools (30개)

### Team Management (11개)

| Tool | 설명 | 최소 권한 |
|------|------|----------|
| `team_create` | 팀 생성 | owner |
| `team_list` | 팀 목록 조회 | viewer |
| `team_get` | 팀 상세 조회 | viewer |
| `team_delete` | 팀 삭제 | owner |
| `team_settings` | 팀 설정 변경 | admin |
| `member_invite` | 멤버 초대 | admin |
| `member_remove` | 멤버 제거 | admin |
| `member_list` | 멤버 목록 | viewer |
| `token_create` | API 토큰 생성 | admin |
| `token_revoke` | API 토큰 폐기 | member |
| `token_list` | 토큰 목록 조회 | member |

### Blue-Green Deployment (6개)

| Tool | 설명 | 최소 권한 |
|------|------|----------|
| `deploy` / `deploy_project` | Blue-Green Slot 배포 | member |
| `promote` / `slot_promote` | 트래픽 전환 | member |
| `rollback` | 이전 버전으로 롤백 | member |
| `slot_status` | Slot 상태 조회 | viewer |
| `slot_cleanup` | Grace 만료 Slot 정리 | admin |
| `slot_list` | 전체 Slot 목록 | viewer |

### Domain & ENV (5개)

| Tool | 설명 | 최소 권한 |
|------|------|----------|
| `domain_setup` | 도메인 설정 | member |
| `domain_list` | 도메인 목록 | viewer |
| `domain_delete` | 도메인 삭제 | admin |
| `env_scan` | ENV 스캔 | viewer |
| `env_restore` | ENV 복구 | member |

### Health & Workflow (3개)

| Tool | 설명 | 최소 권한 |
|------|------|----------|
| `health_check` | 헬스체크 | viewer |
| `workflow_init` | 워크플로우 초기화 | member |
| `workflow_scan` | 워크플로우 스캔 | viewer |

---

## 배포 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│                    CodeB v6.0 배포 흐름                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. we deploy myapp                                             │
│     └─→ 비활성 Slot에 배포 → Preview URL 반환                    │
│         https://myapp-green.preview.codeb.dev                   │
│                                                                 │
│  2. we promote myapp                                            │
│     └─→ Caddy 설정만 변경 → 무중단 트래픽 전환                    │
│         이전 Slot → grace 상태 (48시간 유지)                     │
│                                                                 │
│  3. we rollback myapp                                           │
│     └─→ 즉시 이전 버전으로 롤백 (grace Slot 활성화)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## GitHub Actions Self-Hosted Runner

### 설정

| 항목 | 값 |
|------|-----|
| 위치 | App Server (158.247.203.55) |
| 경로 | /opt/actions-runner |
| 사용자 | runner |
| 라벨 | self-hosted, Linux, X64, codeb, app-server |

### 워크플로우 예시

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: self-hosted  # 반드시 self-hosted 사용
    steps:
      - uses: actions/checkout@v4

      - name: Build & Push
        run: |
          sudo podman build -t ghcr.io/${{ github.repository }}:${{ github.sha }} .
          sudo podman push ghcr.io/${{ github.repository }}:${{ github.sha }}

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

## 백업 시스템

### ENV 백업

```
백업 서버: backup.codeb.kr (141.164.37.63)
백업 경로: /opt/codeb/env-backup/{project}/{environment}/
├── master.env       # 최초 생성 (불변, 복구 기준)
├── current.env      # 현재 버전
└── {timestamp}.env  # 변경 이력
```

### PostgreSQL 백업

```bash
# WAL 아카이빙 (Storage 서버)
wal_level = replica
archive_mode = on
archive_command = 'cp %p /wal-archive/%f'

# 일일 백업 (03:00 UTC)
pg_dump -Fc $DB > /opt/codeb/db-backup/postgresql/$DB-$DATE.dump
rsync -avz /opt/codeb/db-backup/ root@backup.codeb.kr:/opt/codeb/db-backup/
```

### Redis 백업

```bash
# AOF 설정
appendonly yes
appendfsync everysec
```

---

## 레지스트리

### SSOT (Single Source of Truth)

```
/opt/codeb/registry/
├── ssot.json              # 프로젝트/포트 정보
├── slots/
│   └── {project}-{env}.json   # Slot 상태
├── teams.json             # 팀 정보
├── api-keys.json          # API 키 (해시)
└── domains/
    └── {project}.json     # 도메인 매핑
```

---

## CLI 명령어

```bash
# 인증
we login                           # API Key 입력
we whoami                          # 현재 사용자 정보

# 초기화
we workflow init myapp --type nextjs --database --redis

# Blue-Green 배포
we deploy                          # 현재 프로젝트 배포 → Preview URL
we deploy myapp                    # 특정 프로젝트 배포
we promote myapp                   # → Production 전환
we rollback myapp                  # → 즉시 롤백

# 상태 확인
we slot status myapp               # Slot 상태
we health                          # 시스템 헬스

# ENV 관리
we env get myapp                   # 전체 조회
we env set myapp KEY=value         # 설정
we env restore myapp               # 복구

# 도메인
we domain setup myapp.codeb.dev    # 도메인 설정
```

---

## Version History

| 버전 | 날짜 | 변경사항 |
|------|------|----------|
| 6.0.5 | 2026-01-11 | 버전 통일, 레지스트리 동기화, 프로젝트 정리 |
| 6.0.4 | 2026-01-10 | Self-hosted runner 설정, DB env vars 수정 |
| 6.0.3 | 2026-01-09 | Container 배포 방식 전환 |
| 6.0.2 | 2026-01-08 | MCP API 서버 개선 |
| 6.0.1 | 2026-01-07 | 인프라 문서화 |
| 6.0.0 | 2026-01-06 | v6.0 초기 릴리즈 |

---

## 관련 문서

- [CLAUDE.md](../CLAUDE.md) - AI 코딩 규칙
- [DEPLOYMENT_RULES.md](../DEPLOYMENT_RULES.md) - 배포 규칙
- [CHANGELOG.md](../CHANGELOG.md) - 변경 이력
