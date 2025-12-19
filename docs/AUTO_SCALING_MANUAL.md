# CodeB 서버 오토스케일링 및 자동화 배포 매뉴얼

## 목차

1. [인프라 개요](#1-인프라-개요)
2. [권한 모델](#2-권한-모델)
3. [자동화 배포 플로우](#3-자동화-배포-플로우)
4. [서버별 역할 및 스케일링](#4-서버별-역할-및-스케일링)
5. [CLI 명령어 레퍼런스](#5-cli-명령어-레퍼런스)
6. [GitHub Actions CI/CD](#6-github-actions-cicd)
7. [모니터링 및 헬스체크](#7-모니터링-및-헬스체크)
8. [트러블슈팅](#8-트러블슈팅)

---

## 1. 인프라 개요

### 4-서버 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CodeB 4-서버 인프라 구조                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────┐    ┌───────────────────┐                             │
│  │   App Server (n1)  │    │ Streaming (n2)    │                             │
│  │  158.247.203.55   │    │  141.164.42.213   │                             │
│  │                   │    │                   │                             │
│  │  • Next.js Apps   │───▶│  • Centrifugo     │                             │
│  │  • Dashboard      │    │  • WebSocket      │                             │
│  │  • PowerDNS       │    │  • 실시간 메시징  │                             │
│  │  • Caddy (Proxy)  │    │                   │                             │
│  │  • Self-hosted    │    │                   │                             │
│  │    Runner         │    │                   │                             │
│  └─────────┬─────────┘    └───────────────────┘                             │
│            │                                                                 │
│            │                                                                 │
│            ▼                                                                 │
│  ┌───────────────────┐    ┌───────────────────┐                             │
│  │  Storage (n3)     │    │   Backup (n4)     │                             │
│  │  64.176.226.119   │    │  141.164.37.63    │                             │
│  │                   │    │                   │                             │
│  │  • PostgreSQL     │◀──▶│  • DB 백업        │                             │
│  │  • Redis          │    │  • 파일 백업      │                             │
│  │  • 공유 데이터    │    │  • 모니터링       │                             │
│  │                   │    │  • 로그 수집      │                             │
│  └───────────────────┘    └───────────────────┘                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 서버별 도메인 매핑

| 서버 | IP | 도메인 | 역할 |
|------|-----|--------|------|
| App | 158.247.203.55 | n1.codeb.kr | 앱 서버 (스케일링 대상) |
| Streaming | 141.164.42.213 | n2.codeb.kr | WebSocket 서버 |
| Storage | 64.176.226.119 | n3.codeb.kr | 데이터베이스 서버 |
| Backup | 141.164.37.63 | n4.codeb.kr | 백업 서버 |

### 포트 할당 규칙

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              포트 할당 체계                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  시스템 포트 (1-3999)                                                        │
│  ├── 3000: 예약 (Next.js 기본)                                              │
│  ├── 3102: SSOT Registry API                                                │
│  ├── 3103: Domain Manager API                                               │
│  └── 5432: PostgreSQL                                                       │
│                                                                              │
│  프로덕션 포트 (4000-4499)  ← App Server 배포 대상                          │
│  ├── 4000: codeb-dashboard                                                  │
│  ├── 4001: myapp-production                                                 │
│  ├── 4002: videopick-production                                             │
│  └── ...                                                                     │
│                                                                              │
│  스테이징 포트 (4500-4999)  ← App Server 배포 대상                          │
│  ├── 4500: myapp-staging                                                    │
│  ├── 4501: videopick-staging                                                │
│  └── ...                                                                     │
│                                                                              │
│  Preview 포트 (5000-5999)  ← PR Preview 환경                                │
│  ├── 5000: pr-123-preview                                                   │
│  └── ...                                                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 권한 모델

### 역할 정의

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              권한 모델                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐   ┌─────────────────────────────────────────────────────┐  │
│  │   Admin     │   │ • SSH 직접 접속 가능                                │  │
│  │  (관리자)   │──▶│ • 서버 설정 변경                                    │  │
│  │             │   │ • 팀원 관리                                         │  │
│  │             │   │ • 모든 배포 권한                                    │  │
│  └─────────────┘   └─────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─────────────┐   ┌─────────────────────────────────────────────────────┐  │
│  │  Developer  │   │ • SSH 접속 불가 (MCP API만 사용)                    │  │
│  │   (개발자)  │──▶│ • Git Push → GitHub Actions → 자동 배포            │  │
│  │             │   │ • we deploy 명령어로 수동 배포                      │  │
│  │             │   │ • 로그 조회, 상태 확인                              │  │
│  └─────────────┘   └─────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─────────────┐   ┌─────────────────────────────────────────────────────┐  │
│  │   Viewer    │   │ • 읽기 전용                                         │  │
│  │   (뷰어)    │──▶│ • 대시보드 열람                                     │  │
│  │             │   │ • 로그 조회                                         │  │
│  └─────────────┘   └─────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 팀원 관리 명령어

```bash
# 팀원 목록 조회
we team list

# 팀원 추가 (interactive)
we team add

# 팀원 역할 변경
we team role <id> <admin|developer|viewer>

# 팀원 활성/비활성 토글
we team toggle <id>

# 팀 현황 요약
we team status
```

---

## 3. 자동화 배포 플로우

### Developer 배포 플로우 (SSH 없이)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Developer 자동화 배포 플로우                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [로컬 개발 환경]                                                            │
│       │                                                                      │
│       │ git push                                                            │
│       ▼                                                                      │
│  ┌─────────────────┐                                                        │
│  │    GitHub       │                                                        │
│  │  Repository     │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           │ Webhook Trigger                                                 │
│           ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    GitHub Actions Pipeline                           │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │   │
│  │  │   Lint   │─▶│   Test   │─▶│  Build   │─▶│  Push to GHCR    │    │   │
│  │  │          │  │          │  │  Image   │  │                  │    │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────┬─────────┘    │   │
│  │                      (GitHub-hosted runners)         │              │   │
│  └──────────────────────────────────────────────────────┼──────────────┘   │
│                                                         │                   │
│                                                         │                   │
│  ┌──────────────────────────────────────────────────────┼──────────────┐   │
│  │                 Self-hosted Runner (App Server)       │              │   │
│  │                                                       ▼              │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────────┐   │   │
│  │  │  Port Validate  │─▶│  Pull & Deploy  │─▶│   Health Check    │   │   │
│  │  │  (Manifest)     │  │   (Quadlet)     │  │                   │   │   │
│  │  └─────────────────┘  └─────────────────┘  └───────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 프로젝트 초기화 플로우

```bash
# 1. 새 프로젝트 초기화
we workflow init myapp --type nextjs --database --redis

# 자동으로 수행되는 작업:
# - SSOT Registry에 프로젝트 등록
# - PostgreSQL 데이터베이스 생성 (myapp_db)
# - PostgreSQL 사용자 생성 (myapp_user)
# - Redis DB 인덱스 할당 또는 prefix 설정
# - 포트 자동 할당 (4xxx)
# - Quadlet 컨테이너 파일 생성
# - GitHub Actions workflow 생성
# - .env 파일 자동 생성

# 2. 배포
we deploy myapp --environment staging
```

### .env 자동 생성 내용

```bash
# Node
NODE_ENV=production
PORT=4001

# Database (Storage 서버 자동 연결)
DATABASE_URL=postgresql://myapp_user:생성된비밀번호@n3.codeb.kr:5432/myapp_db?schema=public

# Redis (Storage 서버 자동 연결)
REDIS_URL=redis://n3.codeb.kr:6379/0
REDIS_PREFIX=myapp:

# Centrifugo (Streaming 서버 자동 연결)
CENTRIFUGO_URL=wss://n2.codeb.kr/connection/websocket
CENTRIFUGO_API_URL=http://n2.codeb.kr:8000/api
CENTRIFUGO_API_KEY=자동생성
CENTRIFUGO_SECRET=자동생성
```

---

## 4. 서버별 역할 및 스케일링

### App Server (n1) - 수평 스케일링 대상

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     App Server 스케일링 전략                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  현재 구성 (단일 서버)                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  n1.codeb.kr (158.247.203.55)                                        │   │
│  │  ├── app-1:4001 (production)                                         │   │
│  │  ├── app-2:4002 (production)                                         │   │
│  │  ├── app-1-staging:4500 (staging)                                    │   │
│  │  └── Caddy (reverse proxy)                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  스케일 아웃 시나리오 (부하 증가)                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          Load Balancer                               │   │
│  │                        (Caddy / HAProxy)                             │   │
│  └────────────────────────────┬─────────────────────────────────────────┘   │
│                               │                                              │
│           ┌───────────────────┼───────────────────┐                         │
│           ▼                   ▼                   ▼                         │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                │
│  │  n1.codeb.kr   │  │  n1-2.codeb.kr │  │  n1-3.codeb.kr │                │
│  │  (기존)        │  │  (추가)        │  │  (추가)        │                │
│  │                │  │                │  │                │                │
│  │  app:4001      │  │  app:4001      │  │  app:4001      │                │
│  │  app:4002      │  │  app:4002      │  │  app:4002      │                │
│  └────────────────┘  └────────────────┘  └────────────────┘                │
│                                                                              │
│  ※ 모든 앱 서버는 동일한 Storage(n3)를 바라봄                               │
│  ※ 세션은 Redis로 공유 (Stateless)                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Streaming Server (n2) - WebSocket 전용

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Streaming Server 구성                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  n2.codeb.kr (141.164.42.213)                                               │
│  ├── Centrifugo:8000 (WebSocket 서버)                                       │
│  │   ├── wss://n2.codeb.kr/connection/websocket                             │
│  │   └── http://n2.codeb.kr:8000/api                                        │
│  └── ※ Socket.IO 사용 금지 - 반드시 Centrifugo 사용                        │
│                                                                              │
│  스케일링: 동접 10만+ 시 Centrifugo 클러스터링 고려                         │
│  현재 단일 서버로 동접 5만 이상 처리 가능                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Storage Server (n3) - 수직 스케일링

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Storage Server 구성                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  n3.codeb.kr (64.176.226.119)                                               │
│  ├── PostgreSQL:5432                                                        │
│  │   ├── 프로젝트별 데이터베이스 분리                                       │
│  │   └── 자동 백업 (n4로 전송)                                              │
│  └── Redis:6379                                                             │
│      ├── 프로젝트별 prefix 또는 DB 인덱스                                   │
│      └── 세션 공유, 캐시, 큐                                                │
│                                                                              │
│  스케일링 전략:                                                              │
│  1. 수직 스케일링 (RAM, SSD 증설) 우선                                      │
│  2. Read Replica 추가 (읽기 부하 분산)                                      │
│  3. 최종: PostgreSQL 클러스터 (Patroni/Citus)                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Backup Server (n4)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Backup Server 구성                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  n4.codeb.kr (141.164.37.63)                                                │
│  ├── PostgreSQL 백업 (pg_dump 자동화)                                       │
│  ├── 파일 백업 (rsync)                                                      │
│  ├── 로그 수집 및 보관                                                      │
│  └── 모니터링 에이전트                                                      │
│                                                                              │
│  백업 스케줄:                                                                │
│  - 매시간: WAL 아카이브                                                     │
│  - 매일 03:00: 전체 DB 백업                                                 │
│  - 매주 일요일: 파일 시스템 백업                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. CLI 명령어 레퍼런스

### 프로젝트 관리

```bash
# 프로젝트 초기화 (DB, Redis 자동 프로비저닝)
we workflow init <project> --type nextjs --database --redis

# 프로젝트 스캔 (로컬 vs 서버 상태 비교)
we scan <project> --diff

# 서버 상태만 스캔
we scan --server-only

# 포트 현황 스캔
we scan --ports
```

### 배포

```bash
# 배포 (사전 스캔 자동 실행)
we deploy <project> --environment staging

# 강제 배포 (스캔 스킵)
we deploy <project> --skip-scan --force

# Dry-run (실제 배포 없이 계획만)
we deploy <project> --dry-run
```

### SSOT (Single Source of Truth)

```bash
# SSOT 상태 확인
we ssot status

# 등록된 프로젝트 목록
we ssot projects

# 서버와 동기화
we ssot sync

# 동기화 프리뷰 (dry-run)
we ssot sync --dry-run

# SSOT 검증 및 자동 수정
we ssot validate --fix
```

### 도메인 관리

```bash
# 도메인 설정 (DNS + Caddy 자동)
we domain setup <project> --domain myapp.codeb.kr --ssl

# 도메인 목록
we domain list

# 도메인 삭제
we domain remove myapp.codeb.kr
```

### 서버 상태

```bash
# 서버 상태 전체 조회
we up

# 컨테이너 상태 조회
we up --containers

# 포트 사용 현황
we up --ports
```

---

## 6. GitHub Actions CI/CD

### 자동 생성되는 워크플로우 구조

```yaml
# .github/workflows/<project>-deploy.yml
name: <project> CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        type: choice
        options: [staging, production]

jobs:
  # GitHub-hosted runners (빌드)
  lint:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node, lint, type-check]

  test:
    runs-on: ubuntu-latest
    needs: lint
    steps: [checkout, setup-node, test]

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps: [checkout, docker-build, push-to-ghcr]

  # Self-hosted runner (App Server 배포)
  port-validate:
    runs-on: self-hosted
    needs: build
    steps: [validate-port-from-manifest]

  deploy:
    runs-on: self-hosted
    needs: [build, port-validate]
    steps:
      - pull-image
      - update-quadlet
      - restart-service
      - health-check
```

### Self-hosted Runner 설정

```bash
# App Server에서 실행
cd /opt/actions-runner

# Runner 등록
./config.sh --url https://github.com/<org>/<repo> \
  --token <RUNNER_TOKEN> \
  --name codeb-runner \
  --labels self-hosted,Linux,X64

# 서비스로 실행
sudo ./svc.sh install
sudo ./svc.sh start
```

---

## 7. 모니터링 및 헬스체크

### 헬스체크 엔드포인트

모든 앱에서 `/api/health` 엔드포인트 구현 필요:

```typescript
// app/api/health/route.ts
export async function GET() {
  try {
    // DB 연결 체크
    await prisma.$queryRaw`SELECT 1`;

    // Redis 연결 체크 (선택)
    // await redis.ping();

    return Response.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    return Response.json(
      { status: 'error', error: error.message },
      { status: 503 }
    );
  }
}
```

### 모니터링 명령어

```bash
# 전체 서비스 헬스체크
we health

# 특정 프로젝트 헬스체크
we health <project>

# 상세 헬스 정보
we health --verbose

# 컨테이너 로그 조회
we logs <project> --tail 100
```

---

## 8. 트러블슈팅

### 일반적인 문제

#### 포트 충돌
```bash
# 포트 현황 확인
we scan --ports

# 포트 manifest 확인
cat /home/codeb/config/port-manifest.yaml

# 충돌 포트 찾기
ss -tlnp | grep :<port>
```

#### 배포 실패
```bash
# 사전 스캔으로 문제 확인
we scan <project> --diff

# 컨테이너 로그 확인
podman logs <container-name> --tail 100

# Quadlet 서비스 상태
systemctl status <project>.service

# 서비스 재시작
systemctl restart <project>.service
```

#### DB 연결 실패
```bash
# Storage 서버 연결 테스트
nc -zv n3.codeb.kr 5432

# DB 접속 테스트
psql -h n3.codeb.kr -U <project>_user -d <project>_db

# Redis 연결 테스트
redis-cli -h n3.codeb.kr ping
```

### 긴급 복구

```bash
# 최근 백업에서 복구
we env restore <project> --date 2024-12-20

# 롤백 (이전 이미지로)
we rollback <project> --environment production

# SSOT 강제 동기화
we ssot sync --force
```

---

## 9. 스케일링 로드맵 (Terraform → VKE)

### Phase 1: 현재 - Terraform + API (VPS 유지)

```
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│ n1 App  │  │n2 Stream│  │n3 Storage│ │n4 Backup│
│ (VPS)   │  │ (VPS)   │  │  (VPS)   │ │  (VPS)  │
└─────────┘  └─────────┘  └─────────┘  └─────────┘
     │
     └── Terraform으로 필요 시 n1-2, n1-3 추가
```

- 기존 4대 서버 유지
- Vultr API + Terraform으로 서버 추가/제거 자동화
- Load Balancer로 트래픽 분산

```bash
# 예정 CLI 명령어
we scale app --add      # 새 App 서버 생성 + LB 등록
we scale app --remove   # 서버 제거
we scale status         # 현재 스케일 상태
```

### Phase 2: 서비스별 VKE 전환 (점진적)

```
┌──────────────────────────┐
│  VKE Cluster (App)       │ ← 오토스케일링 (min:2, max:10)
│  ├── videopick (pods)    │
│  ├── codeb-cms (pods)    │
│  └── dashboard (pods)    │
└──────────────────────────┘
           │
┌──────────┴───────────────────────────────┐
▼                    ▼                     ▼
┌─────────┐    ┌─────────┐          ┌─────────┐
│n2 Stream│    │n3 Storage│         │n4 Backup│
│ (VPS)   │    │  (VPS)   │         │  (VPS)  │
│Centrifugo│   │ PG/Redis │         │         │
└─────────┘    └─────────┘          └─────────┘
```

- App 서버만 VKE로 이전 (오토스케일링 필요한 부분)
- Storage/Streaming/Backup은 VPS 유지
- 부하 기반 자동 Pod/Node 스케일링

### 전환 기준

| 조건 | Phase 1 유지 | Phase 2 전환 |
|------|-------------|-------------|
| 동시 사용자 | < 1,000 | > 1,000 |
| CPU 사용률 | < 70% | > 70% 지속 |
| 배포 빈도 | 주 1-2회 | 일 10회+ |
| 다운타임 허용 | 분 단위 | 초 단위 (Zero) |

---

## 부록: 빠른 시작 가이드

### 신규 프로젝트 5분 배포

```bash
# 1. 프로젝트 초기화
we workflow init my-new-app --type nextjs --database --redis

# 2. 환경변수 확인
cat .env

# 3. GitHub 리포지토리 연결
git remote add origin https://github.com/my-org/my-new-app

# 4. 첫 배포
git add . && git commit -m "Initial commit"
git push -u origin main

# 5. 배포 상태 확인
we scan my-new-app --diff
```

### Admin 체크리스트

- [ ] 팀원 역할 확인: `we team list`
- [ ] SSOT 상태 확인: `we ssot status`
- [ ] 서버 상태 확인: `we up`
- [ ] 포트 충돌 확인: `we scan --ports`
- [ ] 백업 상태 확인: `we env backups`
