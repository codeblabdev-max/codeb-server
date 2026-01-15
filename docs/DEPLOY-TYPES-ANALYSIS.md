# CodeB 하이브리드 배포 타입 분석 리포트

> **버전**: v7.0.40
> **작성일**: 2026-01-13
> **목적**: 3가지 배포 타입 (Self-hosted, SSH, API) 하이브리드 구현 분석

---

## 1. Executive Summary

### 1.1 현재 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                    현재 배포 프로세스                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  로컬 개발                                                       │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 공통 단계 (로컬 MCP)                                         ││
│  │ ├─→ /we:workflow init - 프로젝트 초기화                     ││
│  │ ├─→ SSOT 등록 (포트, DB, Redis)                             ││
│  │ ├─→ env_sync - 환경변수 동기화                              ││
│  │ └─→ domain_setup - 도메인 설정                              ││
│  └─────────────────────────────────────────────────────────────┘│
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ git push → GitHub Actions 트리거                            ││
│  │                                                             ││
│  │ 현재: Self-hosted Runner 방식만 사용                        ││
│  │ - runs-on: [self-hosted, docker]                            ││
│  │ - 서버에서 직접 docker pull/run 실행                         ││
│  └─────────────────────────────────────────────────────────────┘│
│      │                                                          │
│      ▼                                                          │
│  App Server (158.247.203.55)                                    │
│  └─→ Blue-Green 배포 완료                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 목표 아키텍처 (하이브리드)

```
┌─────────────────────────────────────────────────────────────────┐
│                    하이브리드 배포 아키텍처                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  공통 단계 (로컬 MCP - 변경 없음)                                │
│  ├─→ workflow_init, env_sync, domain_setup                     │
│  └─→ SSOT 기반 포트/ENV 관리                                    │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ GitHub Actions (3가지 배포 타입 선택)                        ││
│  │                                                             ││
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   ││
│  │  │ Self-hosted   │  │ SSH 방식      │  │ API 방식      │   ││
│  │  │ Runner        │  │               │  │               │   ││
│  │  │               │  │               │  │               │   ││
│  │  │ [self-hosted] │  │ ubuntu-latest │  │ ubuntu-latest │   ││
│  │  │               │  │      +        │  │      +        │   ││
│  │  │ 직접 실행     │  │ appleboy/ssh  │  │ curl API     │   ││
│  │  │               │  │               │  │               │   ││
│  │  │ 관리자        │  │ admin 권한    │  │ 팀원          │   ││
│  │  └───────────────┘  └───────────────┘  └───────────────┘   ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│      │                                                          │
│      ▼                                                          │
│  App Server (Blue-Green 배포)                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 현재 코드 구조 분석

### 2.1 핵심 파일 위치

| 영역 | 파일 | 역할 |
|------|------|------|
| **MCP Server** | `mcp-server/src/tools/deploy.ts` | 배포 로직 (비활성 슬롯) |
| | `mcp-server/src/tools/promote.ts` | 트래픽 전환 |
| | `mcp-server/src/tools/rollback.ts` | 롤백 |
| | `mcp-server/src/tools/project.ts` | 프로젝트 초기화 |
| | `mcp-server/src/tools/slot.ts` | 슬롯 관리 |
| | `mcp-server/src/tools/env.ts` | 환경변수 |
| **인프라** | `mcp-server/src/lib/ssh.ts` | SSH 연결 |
| | `mcp-server/src/lib/servers.ts` | 서버 설정 (SSOT) |
| **CI/CD** | `.github/workflows/deploy-api.yml` | API 서버 배포 |
| | `.github/workflows/ci-cd.yml` | 프로젝트 배포 템플릿 |
| **Skills** | `.claude/skills/deploy/deploy.md` | /we:deploy |
| | `.claude/skills/infrastructure/workflow.md` | /we:workflow |

### 2.2 SSOT 구조 (Single Source of Truth)

**서버 경로**: `/opt/codeb/registry/`

```
/opt/codeb/registry/
├── ssot.json                           # 전역 SSOT
│   {
│     "version": "7.0",
│     "projects": {
│       "myapp": {
│         "teamId": "team_xxx",
│         "ports": { "blue": 4100, "green": 4101 },
│         "database": { "name": "myapp_db" },
│         "redis": { "db": 1 },
│         "domain": "myapp.codeb.kr"
│       }
│     },
│     "ports": { "used": [4100, 4101], "allocated": {...} },
│     "redis": { "used": {...}, "nextDb": 2 }
│   }
│
├── slots/
│   └── {project}-{env}.json            # 슬롯 레지스트리
│       {
│         "projectName": "myapp",
│         "environment": "production",
│         "activeSlot": "blue",
│         "blue": { "state": "active", "port": 4100, "version": "abc123" },
│         "green": { "state": "grace", "port": 4101, "version": "old789" }
│       }
│
└── env-backup/
    └── {project}/.env.{timestamp}      # 환경변수 백업
```

### 2.3 현재 GitHub Actions 워크플로우

**파일**: `.github/workflows/ci-cd.yml`

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      action:
        type: choice
        options: [deploy, promote, rollback]

jobs:
  build-and-deploy:
    runs-on: [self-hosted, docker]     # ← Self-hosted Runner 사용
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker Image
        run: docker build -t ghcr.io/${{ github.repository }}:${{ github.sha }} .
      - name: Push to GHCR
        run: docker push ghcr.io/${{ github.repository }}:${{ github.sha }}
      - name: Deploy to inactive slot
        run: |
          # 직접 docker 명령어 실행 (Self-hosted이므로 가능)
          docker pull ghcr.io/${{ github.repository }}:${{ github.sha }}
          docker stop ${PROJECT}-${SLOT} || true
          docker rm ${PROJECT}-${SLOT} || true
          docker run -d --name ${PROJECT}-${SLOT} ...
```

---

## 3. 3가지 배포 타입 상세 분석

### 3.1 Type 1: Self-hosted Runner (현재 방식)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Type 1: Self-hosted Runner                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GitHub Actions                     App Server (158.247.203.55) │
│  ┌──────────────┐                  ┌──────────────────────────┐ │
│  │ Workflow     │                  │ Self-hosted Runner       │ │
│  │ Trigger      │ ──runs-on───→   │ (actions-runner 프로세스) │ │
│  │              │                  │                          │ │
│  │              │                  │ ├─ GHCR Pull            │ │
│  │              │                  │ ├─ Docker Deploy        │ │
│  │              │                  │ ├─ Caddy 설정           │ │
│  │              │                  │ └─ Health Check         │ │
│  └──────────────┘                  └──────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 워크플로우 예시                                              ││
│  │                                                             ││
│  │ jobs:                                                       ││
│  │   deploy:                                                   ││
│  │     runs-on: [self-hosted, docker]                          ││
│  │     steps:                                                  ││
│  │       - name: Deploy                                        ││
│  │         run: |                                              ││
│  │           # 서버에서 직접 실행                               ││
│  │           docker pull ghcr.io/org/app:${{ github.sha }}     ││
│  │           docker stop app-blue || true                      ││
│  │           docker run -d --name app-blue \                   ││
│  │             -e DATABASE_URL="${{ secrets.DATABASE_URL }}" \ ││
│  │             -p 4100:3000 \                                  ││
│  │             ghcr.io/org/app:${{ github.sha }}               ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  장점:                                                          │
│  ✅ 직접 파일 시스템 접근 (SSOT 읽기/쓰기)                       │
│  ✅ Docker 소켓 직접 제어                                        │
│  ✅ 네트워크 레이턴시 없음                                       │
│  ✅ Secrets가 서버에서만 노출                                    │
│  ✅ 대용량 이미지 빠른 처리                                      │
│  ✅ 복잡한 배포 로직 구현 가능                                   │
│                                                                 │
│  단점:                                                          │
│  ⚠️ Runner 프로세스 관리 필요 (systemd, 모니터링)               │
│  ⚠️ 서버 리소스 사용 (CPU, Memory)                              │
│  ⚠️ Runner 장애 시 배포 불가                                    │
│  ⚠️ Runner 업데이트 필요                                        │
│                                                                 │
│  권장 대상: 관리자, 인프라팀                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Type 2: GitHub-hosted + SSH

```
┌─────────────────────────────────────────────────────────────────┐
│              Type 2: GitHub-hosted Runner + SSH                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GitHub Actions (Ubuntu Runner)     App Server                  │
│  ┌──────────────────────────┐      ┌──────────────────────────┐│
│  │ runs-on: ubuntu-latest   │      │                          ││
│  │                          │      │                          ││
│  │ 1. Checkout              │      │                          ││
│  │ 2. Docker Build          │      │                          ││
│  │ 3. GHCR Push             │      │                          ││
│  │ 4. SSH 연결 ─────────────────→  │ docker pull & run       ││
│  │    (appleboy/ssh-action) │      │                          ││
│  └──────────────────────────┘      └──────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 워크플로우 예시                                              ││
│  │                                                             ││
│  │ jobs:                                                       ││
│  │   deploy:                                                   ││
│  │     runs-on: ubuntu-latest                                  ││
│  │     steps:                                                  ││
│  │       - uses: actions/checkout@v4                           ││
│  │                                                             ││
│  │       - name: Build & Push                                  ││
│  │         run: |                                              ││
│  │           docker build -t ghcr.io/${{ github.repository }}  ││
│  │           docker push ghcr.io/${{ github.repository }}      ││
│  │                                                             ││
│  │       - name: Deploy via SSH                                ││
│  │         uses: appleboy/ssh-action@v1                        ││
│  │         with:                                               ││
│  │           host: ${{ secrets.SERVER_HOST }}                  ││
│  │           username: ${{ secrets.SERVER_USER }}              ││
│  │           key: ${{ secrets.SSH_PRIVATE_KEY }}               ││
│  │           envs: DATABASE_URL,REDIS_URL,PORT                 ││
│  │           script: |                                         ││
│  │             cd /opt/codeb/projects/$PROJECT                 ││
│  │             source .env.production                          ││
│  │             docker pull ghcr.io/org/app:${{ github.sha }}   ││
│  │             docker stop $PROJECT-$SLOT || true              ││
│  │             docker rm $PROJECT-$SLOT || true                ││
│  │             docker run -d --name $PROJECT-$SLOT \           ││
│  │               --env-file .env.production \                  ││
│  │               -p $PORT:3000 \                               ││
│  │               ghcr.io/org/app:${{ github.sha }}             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  필요한 GitHub Secrets:                                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ SERVER_HOST      = 158.247.203.55                           ││
│  │ SERVER_USER      = deploy (또는 root)                        ││
│  │ SSH_PRIVATE_KEY  = -----BEGIN OPENSSH PRIVATE KEY-----      ││
│  │                    (Ed25519 또는 RSA)                        ││
│  │ DATABASE_URL     = postgresql://...                         ││
│  │ REDIS_URL        = redis://...                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  장점:                                                          │
│  ✅ Self-hosted Runner 관리 불필요                              │
│  ✅ GitHub 무료 분수 사용 (월 2000분)                            │
│  ✅ 직접 서버 제어 가능 (SSOT 읽기/쓰기)                        │
│  ✅ 복잡한 배포 스크립트 실행 가능                              │
│                                                                 │
│  단점:                                                          │
│  ⚠️ SSH Key 관리 필요                                           │
│  ⚠️ Secrets가 GitHub에서 서버로 전송됨                          │
│  ⚠️ 네트워크 레이턴시 존재                                      │
│  ⚠️ SSH 포트 노출 (방화벽 필요)                                 │
│                                                                 │
│  권장 대상: admin 권한 사용자                                   │
│  보안: SSH Key는 admin만 접근 가능하도록 제한                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Type 3: GitHub-hosted + CodeB API

```
┌─────────────────────────────────────────────────────────────────┐
│              Type 3: GitHub-hosted Runner + CodeB API            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  GitHub Actions (Ubuntu Runner)     CodeB API     App Server    │
│  ┌────────────────────────────┐    ┌────────┐   ┌────────────┐ │
│  │ runs-on: ubuntu-latest     │    │        │   │            │ │
│  │                            │    │  MCP   │   │  Docker    │ │
│  │ 1. Checkout                │    │  API   │   │  Deploy    │ │
│  │ 2. Docker Build            │    │        │   │            │ │
│  │ 3. GHCR Push               │    │  9101  │   │            │ │
│  │ 4. curl API ──────────────────→ │ ──────────→│            │ │
│  │    deploy_project          │    │        │   │            │ │
│  └────────────────────────────┘    └────────┘   └────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 워크플로우 예시                                              ││
│  │                                                             ││
│  │ jobs:                                                       ││
│  │   deploy:                                                   ││
│  │     runs-on: ubuntu-latest                                  ││
│  │     steps:                                                  ││
│  │       - uses: actions/checkout@v4                           ││
│  │                                                             ││
│  │       - name: Build & Push                                  ││
│  │         run: |                                              ││
│  │           docker build -t ghcr.io/${{ github.repository }}  ││
│  │           docker push ghcr.io/${{ github.repository }}      ││
│  │                                                             ││
│  │       - name: Deploy via CodeB API                          ││
│  │         run: |                                              ││
│  │           curl -X POST https://api.codeb.kr/api/tool \      ││
│  │             -H "Content-Type: application/json" \           ││
│  │             -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \  ││
│  │             -d '{                                           ││
│  │               "tool": "deploy_project",                     ││
│  │               "params": {                                   ││
│  │                 "projectName": "${{ github.event.repo }}",  ││
│  │                 "image": "ghcr.io/.../${{ github.sha }}",   ││
│  │                 "environment": "production"                 ││
│  │               }                                             ││
│  │             }'                                              ││
│  │                                                             ││
│  │       - name: Promote (optional)                            ││
│  │         run: |                                              ││
│  │           curl -X POST https://api.codeb.kr/api/tool \      ││
│  │             -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \  ││
│  │             -d '{                                           ││
│  │               "tool": "slot_promote",                       ││
│  │               "params": { "projectName": "..." }            ││
│  │             }'                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  필요한 GitHub Secrets:                                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ CODEB_API_KEY    = codeb_team123_member_abc...             ││
│  │ GHCR_TOKEN       = ghp_... (Docker 이미지 push용)           ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  장점:                                                          │
│  ✅ Self-hosted Runner 관리 불필요                              │
│  ✅ SSH Key 관리 불필요                                         │
│  ✅ Blue-Green 배포 완벽 지원 (API 내장)                        │
│  ✅ 롤백 API 한 줄 (`slot_promote` 역방향)                      │
│  ✅ CodeB 대시보드에서 모니터링                                 │
│  ✅ Team RBAC으로 권한 관리                                     │
│  ✅ 가장 간단한 설정                                            │
│                                                                 │
│  단점:                                                          │
│  ⚠️ API 서버 장애 시 배포 불가                                  │
│  ⚠️ SSOT 직접 접근 불가 (API 통해서만)                         │
│  ⚠️ 복잡한 커스텀 로직 제한적                                   │
│                                                                 │
│  권장 대상: 팀원 (member, viewer 역할)                          │
│  보안: API Key로 RBAC 권한 검증                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. ENV/PORT/DOMAIN 처리 비교 (SSOT 관점)

### 4.1 환경변수 처리

| 항목 | Self-hosted | SSH | API |
|------|-------------|-----|-----|
| **Secrets 저장** | 서버 로컬 | GitHub → SSH 전송 | GitHub → API 전송 |
| **SSOT 접근** | 직접 파일 읽기 | SSH로 파일 읽기 | API 응답으로 수신 |
| **env_sync** | 로컬에서 실행 | 로컬에서 실행 | 로컬에서 실행 |
| **Docker -e** | 직접 주입 | SSH로 주입 | API가 자동 주입 |

**Self-hosted**:
```yaml
- name: Deploy
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
  run: |
    # 서버에서 직접 실행 - 환경변수 즉시 사용 가능
    # SSOT에서 .env 파일 읽기 가능
    source /opt/codeb/projects/$PROJECT/.env.production
    docker run -d --env-file /opt/codeb/projects/$PROJECT/.env.production ...
```

**SSH**:
```yaml
- name: Deploy via SSH
  uses: appleboy/ssh-action@v1
  with:
    envs: DATABASE_URL,REDIS_URL
    script: |
      # SSH를 통해 환경변수 전달됨
      # 서버의 .env 파일도 사용 가능
      docker run -d --env-file /opt/codeb/projects/$PROJECT/.env.production ...
```

**API**:
```yaml
- name: Deploy via API
  run: |
    # 환경변수는 서버에 이미 저장된 .env 파일 사용
    # API가 자동으로 --env-file 옵션 추가
    curl -X POST https://api.codeb.kr/api/tool \
      -d '{"tool": "deploy_project", "params": {...}}'
```

### 4.2 포트 처리

| 항목 | Self-hosted | SSH | API |
|------|-------------|-----|-----|
| **포트 할당** | SSOT 직접 조회 | SSOT SSH 조회 | API가 자동 할당 |
| **범위** | 4100-4499 (prod) | 4100-4499 (prod) | 4100-4499 (prod) |
| **충돌 검사** | 직접 구현 | SSH 스크립트 | API 내장 |

**포트 할당 로직 (SSOT)**:
```
1. /opt/codeb/registry/ssot.json 읽기
2. projects.{projectName}.ports에서 기존 할당 확인
3. 없으면 ports.used에서 사용 가능한 포트 찾기
4. Blue: 짝수 (4100, 4102, ...), Green: 홀수 (4101, 4103, ...)
```

### 4.3 도메인 처리

| 항목 | Self-hosted | SSH | API |
|------|-------------|-----|-----|
| **도메인 설정** | 로컬 MCP | 로컬 MCP | 로컬 MCP |
| **Caddy 설정** | 직접 생성 | SSH로 생성 | API가 자동 생성 |
| **SSL 인증서** | Caddy 자동 | Caddy 자동 | Caddy 자동 |

**모든 타입 공통**: 도메인 설정은 `domain_setup` API로 처리
```bash
# 로컬에서 실행 (배포 전)
/we:domain setup myapp.codeb.kr
```

---

## 5. 3가지 타입 비교표

### 5.1 기능 비교

| 기능 | Self-hosted | SSH | API |
|------|:-----------:|:---:|:---:|
| **배포 (deploy)** | ✅ | ✅ | ✅ |
| **프로모트 (promote)** | ✅ | ✅ | ✅ |
| **롤백 (rollback)** | ✅ | ✅ | ✅ |
| **Blue-Green** | ✅ | ⚠️ 스크립트 | ✅ 내장 |
| **SSOT 직접 접근** | ✅ | ✅ | ❌ API 통해 |
| **커스텀 스크립트** | ✅ | ✅ | ⚠️ 제한적 |
| **Health Check** | ✅ 직접 | ✅ SSH | ✅ 내장 |

### 5.2 운영 비교

| 항목 | Self-hosted | SSH | API |
|------|:-----------:|:---:|:---:|
| **설정 복잡도** | 중간 | 낮음 | 낮음 |
| **유지보수** | 높음 (Runner) | 낮음 | 낮음 |
| **배포 속도** | 빠름 | 중간 | 빠름 |
| **보안 수준** | 높음 | 중간 | 높음 |
| **장애 대응** | 직접 | SSH 접속 | 제한적 |

### 5.3 권한 비교

| 역할 | Self-hosted | SSH | API |
|------|:-----------:|:---:|:---:|
| **owner** | ✅ | ✅ | ✅ |
| **admin** | ✅ | ✅ | ✅ |
| **member** | ❌ | ❌ | ✅ |
| **viewer** | ❌ | ❌ | ❌ (조회만) |

---

## 6. 구현 필요 항목

### 6.1 workflow_init 수정

**현재**: Self-hosted Runner 템플릿만 생성

**변경**: 3가지 타입 선택 가능
```typescript
// project.ts
interface WorkflowInitParams {
  projectName: string;
  type: 'nextjs' | 'remix' | 'nodejs' | 'python' | 'go';
  deployType: 'self-hosted' | 'ssh' | 'api';  // ← 추가
  database?: boolean;
  redis?: boolean;
}
```

### 6.2 GitHub Actions 템플릿

**3가지 템플릿 필요**:

```
templates/
├── workflows/
│   ├── deploy-self-hosted.yml    # Self-hosted Runner
│   ├── deploy-ssh.yml            # GitHub-hosted + SSH
│   └── deploy-api.yml            # GitHub-hosted + API
```

### 6.3 GitHub Secrets 관리

| 타입 | 필요한 Secrets |
|------|----------------|
| **Self-hosted** | `GHCR_TOKEN` |
| **SSH** | `GHCR_TOKEN`, `SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY` |
| **API** | `GHCR_TOKEN`, `CODEB_API_KEY` |

### 6.4 Skills 수정

**/we:workflow init** 파라미터 추가:
```
/we:workflow init myapp --deploy-type=api
```

---

## 7. 권장 사항

### 7.1 기본 타입 선택 (workflow_init 시)

| 사용자 역할 | 권장 타입 | 이유 |
|------------|---------|------|
| **인프라팀/관리자** | Self-hosted | 완전한 제어, 복잡한 로직 |
| **admin 권한** | SSH | Runner 없이 직접 제어 |
| **팀원 (member)** | API | 가장 간단, RBAC 자동 적용 |

### 7.2 하이브리드 운영 전략

```
┌─────────────────────────────────────────────────────────────────┐
│                    권장 하이브리드 전략                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1️⃣ 초기 설정 (관리자)                                         │
│     └─→ Self-hosted 또는 SSH로 인프라 구성                      │
│     └─→ SSOT 초기화, 포트 할당, 도메인 설정                     │
│                                                                 │
│  2️⃣ 일상 배포 (팀원)                                           │
│     └─→ API 방식으로 배포                                       │
│     └─→ git push → 자동 배포 → Preview URL                     │
│                                                                 │
│  3️⃣ 프로모트/롤백 (admin+)                                     │
│     └─→ API 방식 (promote, rollback API 호출)                  │
│                                                                 │
│  4️⃣ 긴급 상황 (관리자)                                         │
│     └─→ SSH 방식으로 직접 서버 접근                             │
│     └─→ 또는 Self-hosted Runner로 커스텀 스크립트               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 Fallback 전략

```yaml
# API 실패 시 SSH로 fallback
- name: Deploy via API
  id: api-deploy
  continue-on-error: true
  run: curl ... deploy_project

- name: Fallback to SSH
  if: steps.api-deploy.outcome == 'failure'
  uses: appleboy/ssh-action@v1
  with: ...
```

---

## 8. 결론

### 8.1 추천 구현 순서

1. **API 타입 워크플로우 템플릿** - 가장 범용적, 팀원용
2. **SSH 타입 워크플로우 템플릿** - admin용, API fallback
3. **workflow_init 파라미터 추가** - `--deploy-type` 옵션
4. **Skills 업데이트** - `/we:workflow init` 문서 갱신
5. **Secrets 자동 설정 가이드** - `/we:secrets` 스킬 추가

### 8.2 최종 비교

| 타입 | 추천도 | 대상 | 복잡도 |
|------|:-----:|------|:------:|
| **API** | ⭐⭐⭐⭐⭐ | 팀원, 일반 배포 | 낮음 |
| **SSH** | ⭐⭐⭐⭐ | admin, fallback | 중간 |
| **Self-hosted** | ⭐⭐⭐ | 관리자, 커스텀 | 높음 |

---

## 부록: 워크플로우 템플릿 예시

### A. API 타입 (deploy-api.yml)

```yaml
name: Deploy (API)

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      action:
        type: choice
        options: [deploy, promote, rollback]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GHCR_TOKEN }}

      - name: Build and Push
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to CodeB
        run: |
          curl -X POST https://api.codeb.kr/api/tool \
            -H "Content-Type: application/json" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -d '{
              "tool": "deploy_project",
              "params": {
                "projectName": "${{ github.event.repository.name }}",
                "image": "ghcr.io/${{ github.repository }}:${{ github.sha }}",
                "environment": "production"
              }
            }'
```

### B. SSH 타입 (deploy-ssh.yml)

```yaml
name: Deploy (SSH)

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GHCR_TOKEN }}

      - name: Build and Push
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            PROJECT=${{ github.event.repository.name }}
            IMAGE=ghcr.io/${{ github.repository }}:${{ github.sha }}

            # SSOT에서 슬롯 정보 읽기
            SLOT_FILE=/opt/codeb/registry/slots/${PROJECT}-production.json
            if [ -f "$SLOT_FILE" ]; then
              ACTIVE=$(jq -r '.activeSlot' $SLOT_FILE)
              SLOT=$([ "$ACTIVE" = "blue" ] && echo "green" || echo "blue")
            else
              SLOT="blue"
            fi

            PORT_FILE=/opt/codeb/registry/ssot.json
            PORT=$(jq -r ".projects.${PROJECT}.ports.${SLOT}" $PORT_FILE)

            # 배포
            docker pull $IMAGE
            docker stop ${PROJECT}-${SLOT} || true
            docker rm ${PROJECT}-${SLOT} || true
            docker run -d --name ${PROJECT}-${SLOT} \
              --env-file /opt/codeb/projects/${PROJECT}/.env.production \
              -p ${PORT}:3000 \
              $IMAGE
```

### C. Self-hosted 타입 (deploy-self-hosted.yml)

```yaml
name: Deploy (Self-hosted)

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: [self-hosted, docker]
    steps:
      - uses: actions/checkout@v4

      - name: Build and Push
        run: |
          docker build -t ghcr.io/${{ github.repository }}:${{ github.sha }} .
          docker push ghcr.io/${{ github.repository }}:${{ github.sha }}

      - name: Deploy to inactive slot
        run: |
          PROJECT=${{ github.event.repository.name }}
          IMAGE=ghcr.io/${{ github.repository }}:${{ github.sha }}

          # ... Self-hosted 전용 배포 스크립트
```

---

> **문서 끝** | CodeB v7.0.40 | 2026-01-13
