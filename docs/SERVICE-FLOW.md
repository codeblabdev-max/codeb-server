# CodeB v9.0 — 전체 서비스 플로우

> **버전**: VERSION 파일 참조 (SSOT)
> **최종 업데이트**: 2026-02-25

---

## 목차

1. [시스템 아키텍처 개요](#1-시스템-아키텍처-개요)
2. [요청 라이프사이클](#2-요청-라이프사이클)
3. [인증 플로우](#3-인증-플로우)
4. [Blue-Green 배포 플로우](#4-blue-green-배포-플로우)
5. [Promote 플로우 (트래픽 전환)](#5-promote-플로우-트래픽-전환)
6. [Rollback 플로우](#6-rollback-플로우)
7. [CI/CD 플로우 (GitHub Actions)](#7-cicd-플로우-github-actions)
8. [데이터 저장 계층](#8-데이터-저장-계층)
9. [실행 계층 (LocalExec)](#9-실행-계층-localexec)
10. [모니터링 & 관측성](#10-모니터링--관측성)
11. [Slot 상태 전이도](#11-slot-상태-전이도)
12. [접근 경로별 요약](#12-접근-경로별-요약)

---

## 1. 시스템 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CodeB v9.0 Service Flow                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [개발자 로컬]                                                          │
│    ├── Claude Code + MCP Client ──→ POST /api/tool                     │
│    ├── CLI (we.js) ──→ MCP Client ──→ POST /api/tool                   │
│    └── git push ──→ GitHub Actions ──→ POST /api/tool                  │
│                                                                         │
│           ┌──────────────────────────────────────────┐                  │
│           │         App Server (158.247.203.55)      │                  │
│           │                                          │                  │
│           │  ┌──────────────────────────────────┐    │                  │
│           │  │     MCP API (Express :9101)      │    │                  │
│           │  │  ┌────┐ ┌────┐ ┌────┐ ┌────┐    │    │                  │
│           │  │  │Auth│→│Tool│→│Exec│→│Resp│    │    │                  │
│           │  │  └────┘ └────┘ └────┘ └────┘    │    │                  │
│           │  └──────────────────────────────────┘    │                  │
│           │       │              │            │       │                  │
│           │       ▼              ▼            ▼       │                  │
│           │  ┌────────┐  ┌──────────┐  ┌─────────┐  │                  │
│           │  │ Docker  │  │  Caddy   │  │   SSE   │  │                  │
│           │  │Container│  │ Reverse  │  │  Logs   │  │                  │
│           │  │:4100-   │  │  Proxy   │  │ Stream  │  │                  │
│           │  │ 5499    │  │          │  │         │  │                  │
│           │  └────────┘  └──────────┘  └─────────┘  │                  │
│           └──────────────────────────────────────────┘                  │
│                    │                                                    │
│        ┌───────────┼───────────────────────┐                           │
│        ▼           ▼                       ▼                           │
│  ┌──────────┐ ┌──────────┐          ┌──────────┐                      │
│  │ Storage  │ │Streaming │          │  Backup  │                      │
│  │64.176.   │ │141.164.  │          │141.164.  │                      │
│  │226.119   │ │42.213    │          │37.63     │                      │
│  │          │ │          │          │          │                      │
│  │Postgres  │ │Centrifugo│          │Prometheus│                      │
│  │Redis     │ │WebSocket │          │Grafana   │                      │
│  │MinIO     │ │          │          │          │                      │
│  │Registry  │ │          │          │          │                      │
│  └──────────┘ └──────────┘          └──────────┘                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4-Server 역할

| 역할 | IP | 도메인 | 서비스 |
|------|-----|--------|--------|
| **App** | 158.247.203.55 | api.codeb.kr | MCP API :9101, Caddy, Docker 컨테이너들 |
| **Streaming** | 141.164.42.213 | ws.codeb.kr | Centrifugo (WebSocket/SSE) |
| **Storage** | 64.176.226.119 | db.codeb.kr | PostgreSQL :5432, Redis :6379, MinIO :9000, Private Registry :5000 |
| **Backup** | 141.164.37.63 | backup.codeb.kr | Prometheus :9090, Grafana :3000 |

---

## 2. 요청 라이프사이클

모든 API 호출은 `POST /api/tool` 단일 엔드포인트를 통합니다.

```
HTTP Request (POST /api/tool)
    │
    ▼
┌──────────── Express Middleware Stack ────────────┐
│                                                   │
│  1. helmet()           → 보안 헤더               │
│  2. cors()             → CORS 허용               │
│  3. express.json(10MB) → Body 파싱               │
│  4. Request Logger     → correlationId 부여      │
│  5. Prometheus          → 활성 요청 카운터 증가   │
│                                                   │
└───────────────────────┬───────────────────────────┘
                        │
                        ▼
┌──────────── 인증 (Auth Middleware) ──────────────┐
│                                                   │
│  X-API-Key 헤더 추출                              │
│  → 포맷 파싱 (codeb_{teamId}_{role}_{token})     │
│  → SHA-256 해싱 → api-keys.json 조회             │
│  → 만료일 확인 → Rate Limit 체크                 │
│  → AuthContext 생성 → res.locals 부착            │
│                                                   │
└───────────────────────┬───────────────────────────┘
                        │
                        ▼
┌──────────── Tool 디스패치 ──────────────────────┐
│                                                   │
│  req.body = { tool: "deploy", params: {...} }    │
│  → TOOLS[tool] 레지스트리 조회 (38개)            │
│  → checkPermission(auth, tool.permission)        │
│  → handler(params, auth) 호출                    │
│                                                   │
└───────────────────────┬───────────────────────────┘
                        │
                        ▼
┌──────────── Tool 실행 ─────────────────────────┐
│                                                   │
│  1. Zod 스키마 입력 검증                         │
│  2. 비즈니스 로직 (DB + LocalExec + Docker)      │
│  3. return { success: true, ...result }          │
│                                                   │
└───────────────────────┬───────────────────────────┘
                        │
                        ▼
┌──────────── 후처리 ────────────────────────────┐
│                                                   │
│  1. Prometheus 메트릭 기록                       │
│  2. AuditLog DB 기록 (실패해도 응답 영향 없음)  │
│  3. SSE broadcast (실시간 로그 스트림)           │
│  4. X-Client-Version 헤더 확인                   │
│                                                   │
└───────────────────────┬───────────────────────────┘
                        │
                        ▼
                  HTTP Response (JSON)
```

---

## 3. 인증 플로우

### API Key 형식

```
codeb_{teamId}_{role}_{randomToken}
```

예: `codeb_myteam_member_AbCdEfGhIjKlMnOp`

### 검증 단계

1. 정규식 파싱: `/^codeb_([a-zA-Z0-9-]+)_(owner|admin|member|viewer)_([a-zA-Z0-9_-]+)$/`
2. SHA-256 해싱 → `/opt/codeb/registry/api-keys.json` 조회
3. `expiresAt` 만료일 확인
4. Rate Limit: 100 req / 60초 per keyId (인메모리)
5. AuthContext 생성: `{ keyId, teamId, role, scopes, projects }`

### 역할 계층 (Role Hierarchy)

```
viewer (0) < member (1) < admin (2) < owner (3)
```

| 역할 | 권한 |
|------|------|
| **viewer** | 조회만 (slot_status, env_get, slot_list 등) |
| **member** | 배포, promote, rollback, env_sync, 토큰 관리 |
| **admin** | 멤버 관리, slot_cleanup, domain_delete, 팀 설정 |
| **owner** | 팀 생성/삭제, 모든 권한 |

### 개발 모드

`NODE_ENV=development`일 때 유효한 형식의 키는 레지스트리 미등록이어도 허용 (`scopes: ['*']`).

---

## 4. Blue-Green 배포 플로우

### 포트 할당 규칙

| 환경 | 포트 범위 | 규칙 |
|------|----------|------|
| Production | 4100-4499 | blue=짝수, green=짝수+1 |
| Staging | 4500-4999 | blue=짝수, green=짝수+1 |
| Preview | 5000-5499 | blue=짝수, green=짝수+1 |

### 10단계 배포 프로세스

```
Step 1.  DB 검증
         ProjectRepo.findByName(projectName)
         → 없으면 Levenshtein 유사 이름 제안
              │
              ▼
Step 2.  Slot 상태 조회
         getSlotRegistry(projectName, environment)
         → DB 우선, 파일 fallback, 자동 동기화
              │
              ▼
Step 3.  대상 Slot 선택
         active=blue → target=green (반대편)
         둘 다 empty → target=blue (기본값)
              │
              ▼
Step 4.  배포 레코드 생성
         DeploymentRepo.create({ status: 'pending' })
              │
              ▼
Step 5.  Docker Pull
         docker pull 64.176.226.119:5000/{project}:{sha}
              │
              ▼
Step 6.  기존 컨테이너 정리
         docker stop + rm {project}-{env}-{slot}
              │
              ▼
Step 7.  ENV 동기화
         DB → /opt/codeb/env/{project}/.env.{env}
              │
              ▼
Step 8.  컨테이너 시작
         docker run -d --name {project}-{env}-{slot}
           -p {port}:3000 --memory=512m --cpus=1
           --env-file .env.{env}
           --health-cmd="curl localhost:3000/health"
              │
              ▼
Step 9.  헬스체크 (3중 검증, 60초 타임아웃, 5초 재시도)
         ① docker inspect → Health.Status === 'healthy'
         ② docker exec curl localhost:3000/health
         ③ curl localhost:{port}/health
         실패 시: docker stop+rm, 원복
              │
              ▼
Step 10. Slot 레지스트리 업데이트
         SlotRepo.upsert({ {slot}_state: 'deployed' })
         → Preview URL 반환
```

### 결과

```json
{
  "success": true,
  "slot": "green",
  "port": 4101,
  "image": "64.176.226.119:5000/myapp:abc1234",
  "previewUrl": "https://myapp-green.preview.codeb.kr",
  "healthChecked": true,
  "deploymentId": "dep_xyz"
}
```

---

## 5. Promote 플로우 (트래픽 전환)

```
Before:
┌──────────────┐           ┌──────────────┐
│  BLUE :4100  │ ← ACTIVE │ GREEN :4101  │ ← DEPLOYED (new)
│  (v1.0.0)    │  traffic  │  (v2.0.0)    │  preview only
└──────────────┘           └──────────────┘

                    promote 실행
                        │
                        ▼

After:
┌──────────────┐           ┌──────────────┐
│  BLUE :4100  │ ← GRACE  │ GREEN :4101  │ ← ACTIVE
│  (v1.0.0)    │  48h TTL  │  (v2.0.0)    │  all traffic
└──────────────┘           └──────────────┘
```

### 단계

1. 새 Slot 헬스체크 → `curl :4101/health` → 200 OK
2. 커스텀 도메인 조회 (DomainRepo + Caddy 파일 파싱)
3. Caddy 설정 재생성 (`lb_policy first` — 새 Slot이 첫 번째)
4. `caddy validate` → 실패 시 .bak에서 복원
5. `systemctl reload caddy` → 즉시 트래픽 전환 (무중단)
6. Slot 상태 업데이트: new→active, old→grace (48시간 유지)

### 생성되는 Caddy 설정

```caddy
myapp.codeb.kr, www.myapp.com {
    reverse_proxy localhost:4101 localhost:4100 {
        lb_policy first          # 첫 번째(active)로만 트래픽
        fail_duration 10s
        health_uri /health
        health_interval 10s
    }
    header {
        X-CodeB-Project "myapp"
        X-CodeB-Slot "green"
        -Server
    }
    encode gzip
    tls {
        protocols tls1.2 tls1.3
    }
}
```

---

## 6. Rollback 플로우

```
1. Grace Slot 확인 → graceExpiresAt 미만료 (48시간 이내)
2. Grace Slot 헬스체크 → curl :4100/health → 200 OK
3. Caddy 설정 반전 → grace Slot을 첫 번째로
4. systemctl reload caddy → 즉시 트래픽 전환
5. 상태 전환: grace → active, active → deployed
6. JSONL 롤백 로그 기록

┌──────────────┐           ┌──────────────┐
│  BLUE :4100  │ ← ACTIVE │ GREEN :4101  │ ← DEPLOYED
│  (v1.0.0)    │  복원됨!  │  (v2.0.0)    │  트래픽 없음
└──────────────┘           └──────────────┘
```

> 48시간 내 언제든 롤백 가능. Grace 만료 후에는 rollback 불가.

---

## 7. CI/CD 플로우 (GitHub Actions)

### 핵심 원칙

- **배포 = git push**. `deploy_project` MCP를 직접 호출하지 않음.
- Private Registry (64.176.226.119:5000) 사용 (GHCR 아님)
- 빌드 캐시는 MinIO S3 (64.176.226.119:9000)

### 플로우

```
개발자: git push origin main
         │
         ▼
GitHub Actions (Self-Hosted Runner)
         │
    Phase 1: 헬스체크
         │   GET https://api.codeb.kr/health → 200?
         ▼
    Phase 2: 인프라 점검
         │   POST /api/tool {tool:"scan"} → 배포 준비 OK?
         ▼
    Phase 3: Docker Buildx
         │   docker buildx build
         │     --cache-from type=s3,bucket=docker-cache
         │     --cache-to type=s3,bucket=docker-cache,mode=max
         │     -t 64.176.226.119:5000/{project}:{commitSHA}
         │     --push
         ▼
    Phase 4: Blue-Green 배포
         │   POST /api/tool {tool:"deploy", params:{
         │     projectName, image: "registry:5000/{project}:{sha}"
         │   }}
         ▼
    Phase 5: 검증
         │   POST /api/tool {tool:"slot_status"} → deployed?
         │   curl {previewUrl}/health → 200?
         ▼
    Phase 6: 후처리
         │   task_complete (커밋 메시지에 task ID 있으면)
         ▼
    수동: promote / rollback (workflow_dispatch)
```

### 필수 GitHub Secrets

| Secret | 설명 |
|--------|------|
| `CODEB_API_KEY` | MCP API 인증 키 |
| `MINIO_ACCESS_KEY` | MinIO S3 Access Key |
| `MINIO_SECRET_KEY` | MinIO S3 Secret Key |

---

## 8. 데이터 저장 계층

### PostgreSQL (Storage 서버) — 주 저장소

| 테이블 | 역할 | 비고 |
|--------|------|------|
| `projects` | 프로젝트 레지스트리 | 이름, 포트, DB, Redis 할당 |
| `project_slots` | Blue/Green Slot 상태 (SSOT) | 배포/promote/rollback 시 갱신 |
| `project_envs` | 환경변수 (버전 관리) | 매 upsert마다 version++ |
| `deployments` | 배포 이력 | pending→success/failed |
| `domains` | 도메인 매핑 | custom/preview/production |
| `audit_logs` | API 호출 감사 로그 | tool, params, result, duration |
| `work_tasks` | 작업 관리 + 파일 잠금 | branch별 파일 lock |

### 파일 기반 (App 서버) — 인증 + Fallback

| 경로 | 역할 |
|------|------|
| `/opt/codeb/registry/api-keys.json` | **인증 SSOT** (60개 키, SHA-256) |
| `/opt/codeb/registry/teams.json` | 팀 레지스트리 |
| `/opt/codeb/registry/slots/*.json` | Slot fallback (DB 장애 시) |
| `/opt/codeb/env/{project}/.env.*` | ENV 파일 (DB와 동기화) |
| `/opt/codeb/logs/rollbacks/*.jsonl` | 롤백 이력 |

### Caddy (App 서버)

| 경로 | 역할 |
|------|------|
| `/etc/caddy/Caddyfile` | 메인 설정 (`import sites/*.caddy`) |
| `/etc/caddy/sites/{project}-*.caddy` | 프로젝트별 리버스 프록시 |

### Degraded Mode

DB 장애 시에도 서버 시작 가능. 기존 배포 서비스 유지, 새 배포는 파일 fallback으로 제한적 동작.

---

## 9. 실행 계층 (LocalExec)

MCP API가 App 서버에서 직접 실행되므로 SSH 불필요. `child_process.exec` 기반.

```
┌──────────────────┐     ┌──────────────────────────────┐
│   Tool Handler   │────→│      LocalExec               │
└──────────────────┘     │                              │
                          │  exec(cmd)     → child_process.exec      │
                          │  writeFile()   → fs.writeFile (경로 검증)│
                          │  readFile()    → fs.readFile             │
                          │  fileExists()  → fs.access              │
                          │  mkdir()       → fs.mkdir               │
                          └──────────────────────────────┘
```

### 허용 경로 (Path Validation)

- `/opt/codeb/` — 프로젝트 데이터
- `/etc/caddy/` — 리버스 프록시 설정
- `/etc/containers/` — 컨테이너 설정
- `/var/log/` — 로그
- `/tmp/` — 임시 파일

### Storage DB 접근

SSH 터널 없이 TCP 직접 연결:

```bash
PGPASSWORD={pw} psql -h 64.176.226.119 -p 5432 -U codeb -d postgres -c "..."
```

---

## 10. 모니터링 & 관측성

### Prometheus 메트릭 (`GET /metrics`)

| 메트릭 | 타입 | 설명 |
|--------|------|------|
| `codeb_http_requests_total` | Counter | HTTP 요청 수 |
| `codeb_tool_calls_total` | Counter | Tool 호출 수 (tool, status, role) |
| `codeb_deployments_total` | Counter | 배포 수 (project, env, status) |
| `codeb_slot_status` | Gauge | Slot 상태 (0=empty, 1=deployed, 2=active, 3=grace) |
| `codeb_slot_healthy` | Gauge | Slot 헬스 상태 |
| `codeb_auth_failures_total` | Counter | 인증 실패 수 |
| `codeb_db_query_duration_seconds` | Histogram | DB 쿼리 시간 |

### SSE 실시간 로그 (`GET /api/logs/stream`)

```
event: log
data: {"timestamp":"...","level":"info","source":"container","message":"..."}

event: deployment
data: {"type":"deployment_step","step":{"name":"health-check","status":"running"}}

: ping    ← 30초마다 keep-alive
```

### Audit Log (DB)

모든 API 호출이 `audit_logs` 테이블에 기록:
- tool, params (jsonb), result (jsonb)
- auth_key_id, auth_team_id, auth_role
- ip, duration_ms, created_at

---

## 11. Slot 상태 전이도

```
                    deploy
    ┌──────┐  ──────────────→  ┌──────────┐
    │ empty │                   │ deployed │
    └──────┘                   └────┬─────┘
                                     │
                                     │ promote
                                     ▼
                               ┌──────────┐
                               │  active  │ ← 모든 트래픽
                               └────┬─────┘
                                     │
                                     │ 다른 slot promote
                                     ▼
                               ┌──────────┐
                               │  grace   │ ← 48시간 유지 (롤백 가능)
                               └────┬─────┘
                                     │
                              ┌──────┴──────┐
                              │             │
                         rollback      만료/cleanup
                              │             │
                              ▼             ▼
                         ┌────────┐   ┌──────┐
                         │ active │   │ empty │
                         └────────┘   └──────┘
```

---

## 12. 접근 경로별 요약

| 사용자 | 접근 경로 | 흐름 |
|--------|----------|------|
| **개발자 (Claude Code)** | `/we:deploy` | Skill → MCP Client → POST /api/tool → Docker |
| **개발자 (git push)** | `git push` | GitHub Actions → Docker Buildx → POST /api/tool |
| **개발자 (CLI)** | `we deploy` | CLI → MCP Client → POST /api/tool |
| **운영자** | `/we:promote` / `/we:rollback` | MCP → Caddy 설정 변경 (무중단) |
| **최종 사용자** | `https://myapp.codeb.kr` | Caddy → Docker 컨테이너 |
| **모니터링** | Grafana 대시보드 | Prometheus → GET /metrics |
