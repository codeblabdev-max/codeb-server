# CodeB MCP API Reference

> **버전**: VERSION 파일 참조 (SSOT)
> **최종 업데이트**: 2026-02-25

---

## 목차

1. [개요](#1-개요)
2. [인증](#2-인증)
3. [엔드포인트](#3-엔드포인트)
4. [도구 목록](#4-도구-목록)
5. [도구 상세](#5-도구-상세)
6. [에러 처리](#6-에러-처리)

---

## 1. 개요

### 1.1 API 정보

| 항목 | 값 |
|------|-----|
| Base URL | `https://api.codeb.kr` |
| Tool Endpoint | `POST /api/tool` |
| Health Check | `GET /health` |
| Metrics | `GET /metrics` |
| Log Stream | `GET /api/logs/stream` (SSE) |
| Audit Logs | `GET /api/audit` |

### 1.2 특징

- Team 기반 인증 (Vercel 스타일)
- Blue-Green 무중단 배포
- Rate Limiting (분당 100회)
- Audit Logging (PostgreSQL)
- Prometheus 메트릭
- 클라이언트 버전 자동 체크

---

## 2. 인증

### 2.1 API Key 형식

```
X-API-Key: codeb_{teamId}_{role}_{randomToken}

예시:
- codeb_default_admin_a1b2c3d4e5f6g7h8
- codeb_myteam_member_x9y8z7w6v5u4t3s2
```

### 2.2 역할 권한

| 역할 | 권한 |
|------|------|
| `owner` | 팀 삭제, 모든 작업 |
| `admin` | 멤버 관리, 토큰 관리, 슬롯 정리 |
| `member` | 배포, promote, rollback, ENV 설정 |
| `viewer` | 조회만 (상태, 로그, 메트릭) |

### 2.3 요청 예시

```bash
curl -X POST "https://api.codeb.kr/api/tool" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: codeb_team1_admin_xxxxx" \
  -H "X-Client-Version: 9.0.0" \
  -d '{"tool": "health_check", "params": {}}'
```

---

## 3. 엔드포인트

### 3.1 Health Check (인증 불필요)

```bash
GET /health
GET /health?v=9.0.0   # 버전 체크 포함
```

**응답:**
```json
{
  "status": "healthy",
  "version": "9.0.0",
  "timestamp": "2026-02-25T12:00:00.000Z",
  "uptime": 123456.789
}
```

**클라이언트 버전이 낮은 경우:**
```json
{
  "status": "healthy",
  "version": "9.0.0",
  "updateRequired": true,
  "updateMessage": "CLI 업데이트 필요: npm i -g @codeblabdev-max/we-cli",
  "latestVersion": "9.0.0",
  "downloadUrl": "https://releases.codeb.kr/cli/install.sh"
}
```

### 3.2 API Info (인증 불필요)

```bash
GET /api
```

**응답:**
```json
{
  "name": "CodeB API",
  "version": "9.0.0",
  "tools": ["deploy", "promote", "rollback", ...],
  "features": ["blue-green-deployment", "slot-management", "domain-management", "project-initialization"]
}
```

### 3.3 Tool Execution (인증 필요)

```bash
POST /api/tool
Content-Type: application/json
X-API-Key: {api_key}

{
  "tool": "도구명",
  "params": { ... }
}
```

---

## 4. 도구 목록

### 4.1 전체 도구 (38개)

| 카테고리 | 도구 | 최소 역할 | 설명 |
|---------|------|----------|------|
| **배포** | `deploy` / `deploy_project` | member | 비활성 슬롯에 배포 |
| **배포** | `promote` / `slot_promote` | member | 트래픽 전환 (무중단) |
| **배포** | `rollback` | member | 즉시 롤백 |
| **슬롯** | `slot_status` | viewer | 슬롯 상태 조회 |
| **슬롯** | `slot_cleanup` | admin | 만료 슬롯 정리 |
| **슬롯** | `slot_list` | viewer | 전체 슬롯 목록 |
| **도메인** | `domain_setup` | member | DNS + Caddy + SSL 자동 설정 |
| **도메인** | `domain_list` | viewer | 도메인 목록 |
| **도메인** | `domain_delete` | admin | 도메인 삭제 |
| **프로젝트** | `workflow_init` | member | 인프라 초기화 (DB/Redis/포트/ENV) |
| **프로젝트** | `workflow_scan` | viewer | 프로젝트 구성 스캔 |
| **프로젝트** | `workflow_generate` | member | GitHub Actions deploy.yml 생성 |
| **프로젝트** | `scan` | viewer | 배포 준비 상태 점검 |
| **환경변수** | `env_sync` | member | ENV 동기화 (DB ↔ 파일) |
| **환경변수** | `env_get` | viewer | ENV 조회 (민감값 마스킹) |
| **환경변수** | `env_scan` | viewer | 로컬 vs 서버 ENV 비교 |
| **환경변수** | `env_restore` | member | 백업에서 ENV 복원 |
| **Git/PR** | `pr_list` | viewer | PR 목록 조회 |
| **Git/PR** | `pr_review` | member | PR 리뷰 |
| **Git/PR** | `pr_merge` | member | PR 머지 |
| **Git/PR** | `pr_create` | member | PR 생성 |
| **Git/PR** | `git_sync` | viewer | Git 동기화 상태 |
| **작업** | `task_create` | member | 작업 생성 |
| **작업** | `task_list` | viewer | 작업 목록 |
| **작업** | `task_get` | viewer | 작업 상세 |
| **작업** | `task_update` | member | 작업 업데이트 |
| **작업** | `task_check` | viewer | 파일 잠금 충돌 확인 |
| **작업** | `task_complete` | member | 작업 완료 |
| **팀** | `team_create` | owner | 팀 생성 |
| **팀** | `team_list` | viewer | 팀 목록 |
| **팀** | `team_get` | viewer | 팀 상세 |
| **팀** | `team_settings` | admin | 팀 설정 변경 |
| **멤버** | `member_invite` | admin | 멤버 초대 |
| **멤버** | `member_remove` | admin | 멤버 제거 |
| **멤버** | `member_list` | viewer | 멤버 목록 |
| **토큰** | `token_create` | member | API 토큰 생성 |
| **토큰** | `token_revoke` | member | API 토큰 폐기 |
| **토큰** | `token_list` | member | 토큰 목록 |
| **유틸리티** | `health_check` | viewer | 인프라 상태 점검 |

---

## 5. 도구 상세

### 5.1 Blue-Green 배포

#### deploy / deploy_project

비활성 슬롯에 Docker 컨테이너 배포.

```json
{
  "tool": "deploy",
  "params": {
    "projectName": "myapp",
    "environment": "production",
    "image": "64.176.226.119:5000/myapp:latest"
  }
}
```

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| projectName | string | O | 프로젝트명 |
| environment | string | X | staging / production (기본: staging) |
| image | string | X | Docker 이미지 URL |
| version | string | X | 버전 태그 |

**응답:**
```json
{
  "success": true,
  "slot": "blue",
  "port": 4001,
  "previewUrl": "https://blue-myapp.codeb.kr",
  "message": "Deployed to blue slot"
}
```

#### promote / slot_promote

트래픽을 새 슬롯으로 전환 (무중단).

```json
{
  "tool": "slot_promote",
  "params": {
    "projectName": "myapp",
    "environment": "production"
  }
}
```

**응답:**
```json
{
  "success": true,
  "activeSlot": "blue",
  "previousSlot": "green",
  "domain": "myapp.codeb.kr",
  "gracePeriod": {
    "slot": "green",
    "endsAt": "2026-02-08T12:00:00Z",
    "hoursRemaining": 48
  }
}
```

#### rollback

이전 버전(grace 슬롯)으로 즉시 롤백.

```json
{
  "tool": "rollback",
  "params": {
    "projectName": "myapp",
    "environment": "production"
  }
}
```

---

### 5.2 슬롯 관리

#### slot_status

```json
{
  "tool": "slot_status",
  "params": {
    "projectName": "myapp",
    "environment": "production"
  }
}
```

**응답:**
```json
{
  "success": true,
  "data": {
    "activeSlot": "blue",
    "blue": {
      "state": "active",
      "port": 4001,
      "version": "9.0.0",
      "deployedAt": "2026-02-25T10:00:00Z"
    },
    "green": {
      "state": "grace",
      "port": 4002,
      "version": "8.0.0",
      "graceEndsAt": "2026-02-27T10:00:00Z"
    }
  }
}
```

#### slot_list

```json
{
  "tool": "slot_list",
  "params": {}
}
```

#### slot_cleanup

```json
{
  "tool": "slot_cleanup",
  "params": {
    "projectName": "myapp",
    "environment": "production"
  }
}
```

---

### 5.3 도메인 관리

#### domain_setup

```json
{
  "tool": "domain_setup",
  "params": {
    "projectName": "myapp",
    "domain": "myapp.codeb.kr",
    "environment": "production"
  }
}
```

**지원 도메인:**
- `*.codeb.kr`, `*.workb.net` - 자동 DNS (Cloudflare) + SSL (Caddy)
- 커스텀 도메인 - 수동 DNS 설정 필요 (A: 158.247.203.55)

#### domain_list

```json
{
  "tool": "domain_list",
  "params": {
    "projectName": "myapp"
  }
}
```

#### domain_delete

```json
{
  "tool": "domain_delete",
  "params": {
    "projectName": "myapp",
    "domain": "old.myapp.com"
  }
}
```

---

### 5.4 프로젝트 초기화

#### workflow_init

새 프로젝트 인프라 초기화.

```json
{
  "tool": "workflow_init",
  "params": {
    "projectName": "newapp",
    "type": "nextjs",
    "database": true,
    "redis": true
  }
}
```

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| projectName | string | O | 프로젝트명 |
| type | string | X | nextjs / remix / nodejs / python / go |
| database | boolean | X | PostgreSQL 포함 (기본: true) |
| redis | boolean | X | Redis 포함 (기본: true) |

**생성되는 리소스:**
- DB SSOT 등록 (projects 테이블)
- Blue-Green 슬롯 (포트 자동 할당 3001~9999)
- PostgreSQL DB/User
- Redis DB 번호
- ENV 파일 (/opt/codeb/env/{project})
- Caddy 리버스 프록시
- PowerDNS A 레코드 (*.codeb.kr)

#### workflow_scan

```json
{
  "tool": "workflow_scan",
  "params": {
    "projectName": "myapp"
  }
}
```

#### workflow_generate

```json
{
  "tool": "workflow_generate",
  "params": {
    "projectName": "myapp",
    "type": "nextjs"
  }
}
```

---

### 5.5 환경변수 관리

#### env_sync

```json
{
  "tool": "env_sync",
  "params": {
    "projectName": "myapp",
    "environment": "production",
    "envContent": "KEY=value\nOTHER=value2"
  }
}
```

#### env_get

```json
{
  "tool": "env_get",
  "params": {
    "projectName": "myapp",
    "environment": "production"
  }
}
```

#### env_scan

```json
{
  "tool": "env_scan",
  "params": {
    "projectName": "myapp"
  }
}
```

#### env_restore

```json
{
  "tool": "env_restore",
  "params": {
    "projectName": "myapp",
    "environment": "production",
    "version": "master"
  }
}
```

---

### 5.6 유틸리티

#### health_check

전체 인프라 상태 확인.

```json
{
  "tool": "health_check",
  "params": {}
}
```

**응답:**
```json
{
  "success": true,
  "data": {
    "api": {
      "status": "healthy",
      "version": "9.0.0",
      "uptime": 123456
    },
    "containers": [
      {"name": "workb-blue", "image": "workb", "status": "Up", "ports": "4001"}
    ],
    "slots": [
      {"project": "workb", "activeSlot": "blue", "blue": {...}, "green": {...}}
    ],
    "images": [...],
    "ports": [...]
  }
}
```

---

## 6. 에러 처리

### 6.1 에러 응답 형식

```json
{
  "success": false,
  "error": "에러 메시지",
  "duration": 123,
  "timestamp": "2026-02-06T12:00:00.000Z",
  "correlationId": "abc-123-def"
}
```

### 6.2 HTTP 상태 코드

| 코드 | 의미 |
|------|------|
| 200 | 성공 |
| 400 | 잘못된 요청 (도구명 누락 등) |
| 401 | 인증 실패 (API 키 없음/유효하지 않음) |
| 403 | 권한 없음 |
| 404 | 도구 없음 |
| 429 | Rate Limit 초과 |
| 500 | 서버 에러 |

### 6.3 Rate Limit

- 분당 100회 제한 (keyId 기준)
- 헤더로 확인: `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## cURL 예시

### 배포

```bash
curl -X POST "https://api.codeb.kr/api/tool" \
  -H "X-API-Key: codeb_default_member_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "deploy",
    "params": {
      "projectName": "myapp",
      "environment": "production",
      "image": "64.176.226.119:5000/myapp:latest"
    }
  }'
```

### Promote

```bash
curl -X POST "https://api.codeb.kr/api/tool" \
  -H "X-API-Key: codeb_default_member_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool": "promote", "params": {"projectName": "myapp"}}'
```

### 헬스체크

```bash
curl https://api.codeb.kr/health
```

---

## 관련 문서

- [SKILLS-GUIDE.md](./SKILLS-GUIDE.md) - Skills 사용 가이드
- [deployment-guide.md](./deployment-guide.md) - 배포 가이드
- [VERSION-MANAGEMENT.md](./VERSION-MANAGEMENT.md) - 버전 관리 가이드
- [../CLAUDE.md](../CLAUDE.md) - Claude Code 규칙
