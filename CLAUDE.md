# CLAUDE.md v8.0.0 - CodeB Project Rules

> 버전은 VERSION 파일에서 관리됩니다 (SSOT)

> **Claude Code 2.1 100% Integration + Blue-Green Deployment + Skills System + Advanced Hooks**

---

## v8.0 변경사항

```
┌─────────────────────────────────────────────────────────────────┐
│                    v8.0.0 주요 변경사항                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. GitHub Actions 자동 배포 도입                                │
│     └─→ git push → 자동 빌드 & 배포                             │
│     └─→ Self-Hosted Runner + Minio S3 Cache                    │
│     └─→ 해외 경유 없음 (로컬 네트워크만 사용)                   │
│                                                                 │
│  2. 버전 관리 통합                                               │
│     └─→ VERSION 파일이 SSOT (Single Source of Truth)           │
│     └─→ 모든 package.json, CLAUDE.md 자동 동기화               │
│     └─→ API + CLI + Registry 동시 업데이트                     │
│                                                                 │
│  3. 문서 정리                                                    │
│     └─→ VERSION-MANAGEMENT.md 신규                             │
│     └─→ API-REFERENCE.md 20개 도구 문서화                      │
│     └─→ KNOWN-ISSUES.md 업데이트                               │
│                                                                 │
│  4. 클라이언트 버전 체크                                         │
│     └─→ API가 자동으로 CLI 버전 확인                           │
│     └─→ 버전 낮으면 업데이트 안내 반환                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 프로젝트별 배포 방식

```
┌─────────────────────────────────────────────────────────────────┐
│                    올바른 배포 방식 선택                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  codeb-server (본 프로젝트) - v8.0 변경                          │
│  ───────────────────────────────────────────────────────────    │
│  ✅ git push origin main → GitHub Actions 자동 배포             │
│  ✅ 또는 ./scripts/deploy-all.sh (수동 백업용)                  │
│  ❌ /we:deploy 사용 금지 (인프라 자체라 불가)                   │
│                                                                 │
│  workb, heeling 등 (일반 프로젝트)                               │
│  ───────────────────────────────────────────────────────────    │
│  ✅ git push origin main → GitHub Actions 자동 배포             │
│  ✅ /we:promote → 트래픽 전환                                   │
│  ✅ /we:rollback → 문제 시 롤백                                 │
│                                                                 │
│  신규 프로젝트                                                   │
│  ───────────────────────────────────────────────────────────    │
│  ✅ /we:init → 서버 리소스 생성                                 │
│  ✅ /we:workflow → GitHub Actions 워크플로우 생성               │
│  ✅ git push → 자동 배포                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## GitHub Actions CI/CD (workb 방식)

### 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│               일반 프로젝트 GitHub Actions CI/CD                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [로컬] ──git push──→ [GitHub Actions]                          │
│                            │                                    │
│                            │ runs-on: [self-hosted, docker]     │
│                            ▼                                    │
│                    [Self-Hosted Runner]                         │
│                            │                                    │
│                 ┌──────────┴──────────┐                        │
│                 │ Docker BuildKit     │                        │
│                 │ + Minio S3 Cache    │                        │
│                 └──────────┬──────────┘                        │
│                            │                                    │
│                            ▼                                    │
│              ┌─────────────────────────────┐                   │
│              │ Private Registry Push       │                   │
│              │ 64.176.226.119:5000         │                   │
│              └─────────────┬───────────────┘                   │
│                            │                                    │
│                            ▼                                    │
│              ┌─────────────────────────────┐                   │
│              │ MCP API 호출                │                   │
│              │ deploy_project(image=...)   │                   │
│              └─────────────┬───────────────┘                   │
│                            │                                    │
│                            ▼                                    │
│              Preview URL 반환 → /we:promote                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 배포 흐름

```bash
# 1. 코드 수정 후 커밋 & 푸시 (자동 배포)
git add -A && git commit -m "feat: 새로운 기능" && git push

# GitHub Actions가 자동으로:
# - Self-Hosted Runner에서 Docker 빌드 (Minio S3 캐시)
# - Private Registry에 이미지 푸시
# - MCP API 호출 → 비활성 슬롯에 배포
# - Preview URL 반환

# 2. Preview URL 확인 후 트래픽 전환
/we:promote workb

# 3. 문제 발생 시 즉시 롤백
/we:rollback workb
```

---

## codeb-server 배포 (수동)

### 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                 codeb-server 수동 배포 시스템                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [로컬] ──./scripts/deploy-all.sh──→ [App Server + Storage]    │
│                                                                 │
│  배포 대상:                                                     │
│  ├── [1/5] 로컬 파일 버전 동기화 (package.json, CLAUDE.md)     │
│  ├── [2/5] Git 커밋 & 푸시 (백업용)                            │
│  ├── [3/5] API Server (Docker → Systemd)                       │
│  ├── [4/5] CLI Package (tarball → Minio)                       │
│  └── [5/5] SSOT Registry 업데이트                              │
│                                                                 │
│  ⚠️ GitHub Actions 워크플로우 추가 금지!                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 배포 명령

```bash
# 전체 배포 (Git + API + CLI)
./scripts/deploy-all.sh [version]

# 버전 확인
cat VERSION
curl -s https://api.codeb.kr/health | jq '.version'
```

---

## Skills 사용 가이드

### 사용 가능한 Skills

| Skill | 용도 | 주의사항 |
|-------|------|----------|
| `/we:init` | 신규 프로젝트 초기화 | workflow_init이 도메인까지 처리 |
| `/we:quick` | One-Shot 설정 | domain_setup 단계 오류 있음 |
| `/we:deploy` | 배포 | GitHub Actions 있는 프로젝트는 사용 금지 |
| `/we:promote` | 트래픽 전환 | 모든 프로젝트에서 사용 가능 |
| `/we:rollback` | 즉시 롤백 | 모든 프로젝트에서 사용 가능 |
| `/we:domain` | 도메인 관리 | 배포 후에만 사용 가능 |
| `/we:health` | 헬스체크 | 모든 프로젝트에서 사용 가능 |
| `/we:workflow` | CI/CD 생성 | 신규 프로젝트에서 사용 |

### Skills 위치

```
cli/skills/we/
├── init.md       # /we:init - 프로젝트 초기화
├── quick.md      # /we:quick - One-Shot 설정
├── deploy.md     # /we:deploy - 배포
├── domain.md     # /we:domain - 도메인 관리
├── rollback.md   # /we:rollback - 롤백
├── health.md     # /we:health - 헬스체크
└── workflow.md   # /we:workflow - CI/CD 워크플로우
```

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
│  │ • MCP API   │     │ • Centri-   │     │ • Postgres  │       │
│  │ • Caddy     │     │   fugo      │     │ • Redis     │       │
│  │ • Docker    │     │ • WebSocket │     │ • Minio     │       │
│  │ • Self-Host │     │             │     │ • Registry  │       │
│  │   Runner    │     │             │     │   :5000     │       │
│  └─────────────┘     └─────────────┘     └─────────────┘       │
│         │                   │                   │               │
│         └───────────────────┼───────────────────┘               │
│                             │                                   │
│                     ┌─────────────┐                             │
│                     │   Backup    │                             │
│                     │ 141.164.    │                             │
│                     │   37.63     │                             │
│                     │ • Prometheus│                             │
│                     │ • Grafana   │                             │
│                     └─────────────┘                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

| 역할 | IP | 도메인 | 서비스 |
|------|-----|--------|--------|
| **App** | 158.247.203.55 | api.codeb.kr | MCP API, Caddy, Docker, Self-Hosted Runner |
| **Streaming** | 141.164.42.213 | ws.codeb.kr | Centrifugo (WebSocket) |
| **Storage** | 64.176.226.119 | db.codeb.kr | PostgreSQL, Redis, Minio, Private Registry |
| **Backup** | 141.164.37.63 | backup.codeb.kr | Prometheus, Grafana |

---

## MCP API v7.0

### 엔드포인트

```
Primary:  https://api.codeb.kr/api
Health:   https://api.codeb.kr/health
```

### 인증

```bash
# API Key 형식
X-API-Key: codeb_{teamId}_{role}_{randomToken}

# 역할 계층
owner  - 팀 삭제, 모든 작업
admin  - 멤버 관리, 토큰 관리
member - 배포, promote, rollback
viewer - 조회만
```

### Tool 목록 (16개)

| 카테고리 | Tool | 설명 |
|---------|------|------|
| **Deploy** | deploy, deploy_project, promote, slot_promote, rollback | Blue-Green 배포 |
| **Slot** | slot_status, slot_cleanup, slot_list | Slot 관리 |
| **Domain** | domain_setup, domain_list, domain_delete | 도메인 관리 |
| **Project** | workflow_init, workflow_scan, scan | 프로젝트 초기화 |
| **Utility** | health_check | 인프라 상태

---

## Critical Rules

### 절대 금지 명령어

```bash
# Hooks가 자동 차단
docker system prune -a         # Docker 전체 정리
docker volume prune -a         # Docker 볼륨 전체 삭제
rm -rf /opt/codeb/*            # 프로젝트 폴더 삭제
rm -rf /var/lib/docker/*       # Docker 데이터 삭제
```

### Vultr CLI 안전 규칙

> **경고**: Vultr CLI는 인프라 관리 권한이 있습니다.

```bash
# ⛔ 절대 금지 (복구 불가능)
vultr-cli instance delete *           # 서버 삭제
vultr-cli instance reinstall *        # 서버 초기화
vultr-cli firewall group delete *     # 방화벽 그룹 삭제
vultr-cli snapshot delete *           # 스냅샷 삭제

# ✅ 허용되는 작업
vultr-cli instance list               # 서버 목록 조회
vultr-cli instance get <id>           # 서버 상세 정보
vultr-cli firewall rule list <id>     # 방화벽 규칙 조회
vultr-cli snapshot list               # 스냅샷 목록 조회
```

### 서버 정보 (삭제/초기화 금지)

| 역할 | Instance ID | IP |
|------|-------------|-----|
| App | `00bad969-1751-4ff7-b0ba-26e9359c0d88` | 158.247.203.55 |
| Streaming | `56797584-ce45-4d5c-bb0f-6e47db0d2ed4` | 141.164.42.213 |
| Storage | `5b3c19bf-a6ac-4b36-8e3a-bbef72b2c8d1` | 64.176.226.119 |
| Backup | `27f996e9-7bb7-4354-b3b5-6f6234f713d1` | 141.164.37.63 |

---

## Version

버전은 `VERSION` 파일에서 관리됩니다 (SSOT).

```bash
# 버전 확인
cat VERSION
curl -s https://api.codeb.kr/health | jq '.version'
```

- **Claude Code**: 2.1.x (Skills + Advanced Hooks)
- **CLI**: @codeblabdev-max/we-cli
- **MCP Server**: @codeblabdev-max/mcp-server
- **API Endpoint**: https://api.codeb.kr (16 tools)
- **CLI Download**: https://releases.codeb.kr/cli/install.sh
- **Container Runtime**: Docker

### 프로젝트 구조

```
codeb-server/
├── VERSION                    # SSOT (Single Source of Truth)
├── mcp-server/                # TypeScript MCP API Server
├── cli/                       # we CLI
│   └── skills/we/             # Skills 시스템
└── scripts/                   # 배포 스크립트 (deploy-all.sh)
    # 주의: .github/workflows/ 사용하지 않음 (수동 배포만)

docs/
├── KNOWN-ISSUES.md            # 알려진 문제점 ⭐
├── deployment-guide.md        # 배포 가이드
├── DEPLOY-FLOW.md             # 배포 플로우
└── SKILLS-GUIDE.md            # Skills 사용 가이드
```

---

## 관련 문서

- [docs/KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md) - 알려진 문제점 및 해결 방안
- [docs/deployment-guide.md](docs/deployment-guide.md) - 배포 가이드
- [docs/DEPLOY-FLOW.md](docs/DEPLOY-FLOW.md) - 배포 플로우 상세
- [docs/SKILLS-GUIDE.md](docs/SKILLS-GUIDE.md) - Skills 사용 가이드

> 이 파일은 CLI 설치/업데이트 시 자동으로 최신 버전으로 교체됩니다.
