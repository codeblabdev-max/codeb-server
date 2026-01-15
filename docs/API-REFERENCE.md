# MCP HTTP API Reference

> **버전: VERSION 파일 참조** | SSOT 기반 버전 관리

## Overview

CodeB v7.0 MCP Server는 Team-based API Key 인증을 사용하는 HTTP API를 제공합니다.
Claude Code 2.1 통합으로 Skills, Hooks, Agent 기반 배포 자동화를 지원합니다.

**Endpoints:**
- **Primary:** `https://api.codeb.kr/api`
- **Health:** `https://api.codeb.kr/health`
- **Direct:** `http://app.codeb.kr:9101/api`

---

## Authentication (v6.0)

### API Key 형식

```
codeb_{teamId}_{role}_{randomToken}

예시:
- codeb_default_admin_a1b2c3d4e5f6g7h8
- codeb_myteam_member_x9y8z7w6v5u4t3s2
- codeb_default_viewer_abcdefghijklmnop
```

### 역할 계층 (Role Hierarchy)

| 역할 | 설명 | 권한 수준 |
|------|------|----------|
| **owner** | 팀 소유자 | 모든 권한 + 팀 삭제 |
| **admin** | 관리자 | 멤버 관리, 토큰 관리, 슬롯 정리 |
| **member** | 일반 멤버 | 배포, promote, rollback, ENV 설정 |
| **viewer** | 뷰어 | 조회만 (상태, 로그, 메트릭) |

### 요청 헤더

```http
X-API-Key: codeb_default_member_your_token_here
Content-Type: application/json
```

---

## API 엔드포인트

### Health Check

```http
GET /health
```

인증 불필요.

**응답:**
```json
{
  "success": true,
  "status": "healthy",
  "version": "6.0.5",
  "timestamp": "2026-01-11T10:00:00Z",
  "uptime": 86400
}
```

### Tool 실행

```http
POST /api/tool
Content-Type: application/json
X-API-Key: codeb_default_member_xxx

{
  "tool": "tool_name",
  "params": { ... }
}
```

### Tool 목록 조회

```http
GET /api/tools
X-API-Key: codeb_default_viewer_xxx
```

---

## Tool 카테고리 (30개 총)

### 1. Team Management (11개)

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

### 2. Blue-Green Deployment (6개)

| Tool | 설명 | 최소 권한 |
|------|------|----------|
| `deploy` / `deploy_project` | Blue-Green Slot 배포 | member |
| `promote` / `slot_promote` | 트래픽 전환 | member |
| `rollback` | 이전 버전으로 롤백 | member |
| `slot_status` | Slot 상태 조회 | viewer |
| `slot_cleanup` | Grace 만료 Slot 정리 | admin |
| `slot_list` | 전체 Slot 목록 | viewer |

### 3. Edge Functions (6개)

| Tool | 설명 | 최소 권한 |
|------|------|----------|
| `edge_deploy` | Edge 함수 배포 | member |
| `edge_list` | Edge 함수 목록 | viewer |
| `edge_logs` | Edge 함수 로그 | viewer |
| `edge_delete` | Edge 함수 삭제 | member |
| `edge_invoke` | Edge 함수 테스트 호출 | member |
| `edge_metrics` | Edge 함수 메트릭 | viewer |

### 4. Analytics (5개)

| Tool | 설명 | 최소 권한 |
|------|------|----------|
| `analytics_overview` | 트래픽 개요 | viewer |
| `analytics_webvitals` | Web Vitals (LCP, FID, CLS) | viewer |
| `analytics_deployments` | 배포별 성능 | viewer |
| `analytics_realtime` | 실시간 메트릭 | viewer |
| `analytics_speed_insights` | Speed Insights 점수 | viewer |

### 5. Project & ENV Management

| Tool | 설명 | 최소 권한 |
|------|------|----------|
| `workflow_init` | 프로젝트 초기화 | member |
| `workflow_scan` | 프로젝트 스캔 | viewer |
| `env_scan` | ENV 비교 (로컬/서버) | viewer |
| `env_restore` | ENV 백업에서 복구 | member |

### 6. Domain & Health

| Tool | 설명 | 최소 권한 |
|------|------|----------|
| `domain_setup` | 도메인 설정 | member |
| `domain_list` | 도메인 목록 | viewer |
| `domain_delete` | 도메인 삭제 | member |
| `health_check` | 시스템 헬스체크 | viewer |
| `scan` | 프로젝트 배포 준비 스캔 | viewer |

---

## Deployment Tools 상세

### deploy / deploy_project

비활성 Slot에 새 버전을 배포하고 Preview URL을 반환합니다.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| projectName | string | Yes | - | 프로젝트명 |
| environment | string | No | staging | staging, production |
| image | string | No | auto | Docker 이미지 |
| version | string | No | - | 버전 태그 |

**요청:**
```json
{
  "tool": "deploy",
  "params": {
    "projectName": "myapp",
    "environment": "staging",
    "version": "v1.2.3"
  }
}
```

**응답:**
```json
{
  "success": true,
  "tool": "deploy",
  "result": {
    "slot": "green",
    "port": 3001,
    "previewUrl": "https://myapp-green.preview.codeb.kr",
    "message": "Deployed to green slot. Run 'promote' to switch traffic.",
    "duration": 45000
  }
}
```

---

### promote / slot_promote

비활성 Slot을 활성화하여 트래픽을 전환합니다 (무중단).

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| projectName | string | Yes | - | 프로젝트명 |
| environment | string | No | staging | 환경 |

**요청:**
```json
{
  "tool": "promote",
  "params": {
    "projectName": "myapp",
    "environment": "staging"
  }
}
```

**응답:**
```json
{
  "success": true,
  "tool": "promote",
  "result": {
    "activeSlot": "green",
    "previousSlot": "blue",
    "domain": "myapp-staging.codeb.kr",
    "url": "https://myapp-staging.codeb.kr",
    "gracePeriod": {
      "slot": "blue",
      "endsAt": "2026-01-13T10:00:00Z",
      "hoursRemaining": 48
    },
    "message": "Traffic switched to green. Previous slot blue in grace period (48h)."
  }
}
```

---

### rollback

이전 버전(Grace 상태 Slot)으로 즉시 롤백합니다.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| projectName | string | Yes | - | 프로젝트명 |
| environment | string | No | staging | 환경 |

**요청:**
```json
{
  "tool": "rollback",
  "params": {
    "projectName": "myapp",
    "environment": "staging"
  }
}
```

**응답:**
```json
{
  "success": true,
  "tool": "rollback",
  "result": {
    "rolledBackTo": "blue",
    "previousActive": "green",
    "domain": "myapp-staging.codeb.kr",
    "url": "https://myapp-staging.codeb.kr",
    "message": "Rolled back to blue. Slot green is now in grace period."
  }
}
```

---

### slot_status

프로젝트의 Blue-Green Slot 상태를 조회합니다.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| projectName | string | Yes | - | 프로젝트명 |
| environment | string | No | staging | 환경 |

**응답:**
```json
{
  "success": true,
  "result": {
    "projectName": "myapp",
    "environment": "staging",
    "activeSlot": "blue",
    "blue": {
      "name": "blue",
      "state": "active",
      "port": 3000,
      "version": "v1.2.3",
      "deployedAt": "2026-01-10T10:00:00Z",
      "healthStatus": "healthy"
    },
    "green": {
      "name": "green",
      "state": "deployed",
      "port": 3001,
      "version": "v1.2.4",
      "deployedAt": "2026-01-11T10:00:00Z",
      "healthStatus": "healthy"
    }
  }
}
```

---

## Edge Functions Tools 상세

### edge_deploy

Edge 함수를 배포합니다.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| projectName | string | Yes | 프로젝트명 |
| environment | string | No | production |
| functions | array | Yes | Edge 함수 배열 |

**함수 타입:**
- `middleware` - 요청 전처리 (인증, 로깅)
- `api` - API 엔드포인트
- `rewrite` - URL 재작성
- `redirect` - 리디렉션

**요청:**
```json
{
  "tool": "edge_deploy",
  "params": {
    "projectName": "myapp",
    "environment": "production",
    "functions": [{
      "name": "auth-middleware",
      "code": "export default function(req) { return req; }",
      "routes": ["/api/*"],
      "type": "middleware"
    }]
  }
}
```

**응답:**
```json
{
  "success": true,
  "result": {
    "deployed": ["auth-middleware"],
    "region": "ap-northeast-2",
    "url": "https://myapp.codeb.kr/api/*"
  }
}
```

---

## Analytics Tools 상세

### analytics_webvitals

Web Vitals 메트릭을 조회합니다.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| projectName | string | Yes | - | 프로젝트명 |
| period | string | No | week | day, week, month |

**응답:**
```json
{
  "success": true,
  "result": {
    "projectName": "myapp",
    "period": "week",
    "metrics": {
      "LCP": { "value": 2.1, "rating": "good", "target": 2.5 },
      "FID": { "value": 45, "rating": "good", "target": 100 },
      "CLS": { "value": 0.05, "rating": "good", "target": 0.1 },
      "TTFB": { "value": 650, "rating": "good", "target": 800 },
      "FCP": { "value": 1.5, "rating": "good", "target": 1.8 },
      "INP": { "value": 150, "rating": "good", "target": 200 }
    },
    "overallScore": 92
  }
}
```

### analytics_speed_insights

Speed Insights 점수를 조회합니다.

**응답:**
```json
{
  "success": true,
  "result": {
    "projectName": "myapp",
    "score": 92,
    "grade": "Good",
    "recommendations": [
      "이미지 최적화로 LCP 개선 가능",
      "불필요한 JavaScript 제거 권장"
    ]
  }
}
```

---

## Domain Tools 상세

### domain_setup

프로젝트에 도메인을 설정합니다 (DNS + SSL 자동).

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| projectName | string | Yes | - | 프로젝트명 |
| domain | string | Yes | - | 도메인 (예: myapp.codeb.kr) |
| environment | string | No | production | 환경 |

**요청:**
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

**응답:**
```json
{
  "success": true,
  "result": {
    "domain": "myapp.codeb.kr",
    "ssl": true,
    "dns": {
      "type": "A",
      "value": "158.247.203.55"
    },
    "url": "https://myapp.codeb.kr"
  }
}
```

---

## Health & Scan Tools

### health_check

CodeB 인프라 상태를 확인합니다.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| server | string | No | all | app, streaming, storage, backup, all |

**응답:**
```json
{
  "success": true,
  "result": {
    "status": "healthy",
    "servers": {
      "app": {
        "ip": "158.247.203.55",
        "status": "healthy",
        "services": ["caddy", "docker", "mcp-api"]
      },
      "streaming": {
        "ip": "141.164.42.213",
        "status": "healthy",
        "services": ["centrifugo"]
      },
      "storage": {
        "ip": "64.176.226.119",
        "status": "healthy",
        "services": ["postgresql", "redis"]
      },
      "backup": {
        "ip": "141.164.37.63",
        "status": "healthy",
        "services": ["prometheus", "grafana"]
      }
    }
  }
}
```

### scan

프로젝트 배포 준비 상태를 스캔합니다.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| projectName | string | Yes | 프로젝트명 |

**응답:**
```json
{
  "success": true,
  "result": {
    "projectName": "myapp",
    "ready": true,
    "checks": {
      "dockerfile": true,
      "envFile": true,
      "healthEndpoint": true,
      "registry": true
    },
    "warnings": [],
    "errors": []
  }
}
```

---

## Workflow Tools

### workflow_init

새 프로젝트를 초기화합니다.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| projectName | string | Yes | - | 프로젝트명 |
| type | string | No | nextjs | nextjs, remix, nodejs, python, go |
| database | boolean | No | true | PostgreSQL 포함 |
| redis | boolean | No | true | Redis 포함 |

**응답:**
```json
{
  "success": true,
  "result": {
    "projectName": "myapp",
    "type": "nextjs",
    "files": [
      ".github/workflows/deploy.yml",
      "Dockerfile",
      ".env.example"
    ],
    "database": {
      "name": "myapp",
      "host": "db.codeb.kr",
      "port": 5432
    },
    "redis": {
      "host": "db.codeb.kr",
      "port": 6379,
      "prefix": "myapp:"
    },
    "nextSteps": [
      "1. .env 파일 설정",
      "2. GitHub Secrets 설정 (CODEB_API_KEY, GHCR_PAT)",
      "3. git push로 자동 배포"
    ]
  }
}
```

---

## ENV Tools

### env_scan

로컬과 서버의 ENV 파일을 비교합니다.

**응답:**
```json
{
  "success": true,
  "result": {
    "projectName": "myapp",
    "environment": "staging",
    "comparison": {
      "matching": ["DATABASE_URL", "REDIS_URL"],
      "localOnly": ["DEBUG"],
      "serverOnly": ["CODEB_VERSION"],
      "different": [
        { "key": "PORT", "local": "3000", "server": "3001" }
      ]
    }
  }
}
```

### env_restore

백업에서 ENV를 복구합니다.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| projectName | string | Yes | - | 프로젝트명 |
| environment | string | No | production | 환경 |
| version | string | No | master | master, current, 또는 타임스탬프 |

**응답:**
```json
{
  "success": true,
  "result": {
    "restoredFrom": "/opt/codeb/env-backup/myapp/production/master.env",
    "variables": 15,
    "message": "ENV restored from master"
  }
}
```

---

## Permission Matrix

| Tool | owner | admin | member | viewer |
|------|:-----:|:-----:|:------:|:------:|
| team_create | O | X | X | X |
| team_delete | O | X | X | X |
| team_settings | O | O | X | X |
| member_invite | O | O | X | X |
| member_remove | O | O | X | X |
| token_create | O | O | X | X |
| token_revoke | O | O | O | X |
| deploy | O | O | O | X |
| promote | O | O | O | X |
| rollback | O | O | O | X |
| slot_cleanup | O | O | X | X |
| edge_deploy | O | O | O | X |
| edge_delete | O | O | O | X |
| domain_setup | O | O | O | X |
| domain_delete | O | O | O | X |
| env_restore | O | O | O | X |
| workflow_init | O | O | O | X |
| slot_status | O | O | O | O |
| slot_list | O | O | O | O |
| team_list | O | O | O | O |
| member_list | O | O | O | O |
| token_list | O | O | O | X |
| edge_list | O | O | O | O |
| edge_logs | O | O | O | O |
| analytics_* | O | O | O | O |
| domain_list | O | O | O | O |
| health_check | O | O | O | O |
| scan | O | O | O | O |
| env_scan | O | O | O | O |

---

## Error Responses

### 401 Unauthorized

```json
{
  "success": false,
  "error": "Invalid or missing API Key",
  "hint": "Set X-API-Key header with codeb_{teamId}_{role}_{token} format"
}
```

### 403 Forbidden

```json
{
  "success": false,
  "error": "Permission denied: viewer cannot use deploy",
  "requiredRole": "member"
}
```

### 404 Not Found

```json
{
  "success": false,
  "error": "Unknown tool: invalid_tool",
  "available": ["deploy", "promote", "rollback", "..."]
}
```

### 429 Too Many Requests

```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "retryAfter": 60
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "error": "Internal server error",
  "requestId": "req_abc123"
}
```

---

## Rate Limits

| Role | Requests/min | Burst |
|------|-------------|-------|
| owner | 1000 | 100 |
| admin | 500 | 50 |
| member | 200 | 20 |
| viewer | 100 | 10 |

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
      "environment": "staging"
    }
  }'
```

### Promote

```bash
curl -X POST "https://api.codeb.kr/api/tool" \
  -H "X-API-Key: codeb_default_member_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "promote",
    "params": {
      "projectName": "myapp",
      "environment": "staging"
    }
  }'
```

### 헬스체크

```bash
curl https://api.codeb.kr/health
```

### Slot 상태 확인

```bash
curl -X POST "https://api.codeb.kr/api/tool" \
  -H "X-API-Key: codeb_default_viewer_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "slot_status",
    "params": {
      "projectName": "myapp",
      "environment": "staging"
    }
  }'
```

---

## 다음 단계

- [QUICK_START.md](./QUICK_START.md) - 빠른 시작 가이드
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Blue-Green 배포 상세 가이드
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 시스템 아키텍처
