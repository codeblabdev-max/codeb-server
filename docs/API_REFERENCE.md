# CodeB API Reference

## Overview

CodeB Server는 두 가지 인터페이스를 제공합니다:
1. **Dashboard REST API** - Web UI에서 사용하는 HTTP API
2. **MCP Tools** - Claude Code에서 사용하는 AI 통합 API

---

## Dashboard REST API

### Base URL

```
http://localhost:3000/api  (개발)
https://dashboard.codeb.kr/api  (프로덕션)
```

### Authentication

JWT 토큰 기반 인증:

```http
Authorization: Bearer <token>
```

또는 API Key:

```http
X-API-Key: <api-key>
```

---

## API Endpoints

### Projects API (`/api/projects`)

#### GET /api/projects

프로젝트 목록을 조회합니다.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| preview | boolean | Preview 환경 포함 여부 (default: true) |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "my-app",
      "name": "my-app",
      "type": "nextjs",
      "status": "running",
      "environments": [
        {
          "name": "production",
          "status": "running",
          "container": "my-app-production"
        }
      ]
    }
  ],
  "source": "ssh"
}
```

#### POST /api/projects

새 프로젝트를 등록합니다.

**Request Body:**
```json
{
  "projectId": "my-app",
  "projectType": "nextjs",
  "gitRepo": "https://github.com/org/repo",
  "port": 4001,
  "domain": "my-app.codeb.kr"
}
```

#### DELETE /api/projects?id=my-app

프로젝트를 레지스트리에서 삭제합니다.

---

### Servers API (`/api/servers`)

#### GET /api/servers

모든 서버 상태를 조회합니다.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| name | string | 특정 서버만 조회 (app, streaming, storage, backup) |

**Response:**
```json
{
  "success": true,
  "data": {
    "app": {
      "ip": "158.247.203.55",
      "name": "App Server",
      "status": "online",
      "metrics": {
        "uptime": "up 30 days",
        "memory": "8192/16384",
        "disk": "45%",
        "containers": "5"
      }
    }
  },
  "source": "ssh"
}
```

#### POST /api/servers

서버 스캔을 트리거합니다.

---

### Deploy API (`/api/deploy`)

#### GET /api/deploy

배포 이력을 조회합니다.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| project | string | 프로젝트 필터 |
| env | string | 환경 필터 |
| action | string | history (기본) 또는 status |

#### POST /api/deploy

새 배포를 트리거합니다.

**Request Body:**
```json
{
  "project": "my-app",
  "environment": "production",
  "image": "ghcr.io/org/my-app:sha-abc1234",
  "branch": "main",
  "port": 4001,
  "skipHealthcheck": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Deployment successful",
  "data": {
    "deploymentId": "deploy-1703001234567",
    "project": "my-app",
    "environment": "production",
    "image": "ghcr.io/org/my-app:sha-abc1234",
    "port": 4001,
    "container": "my-app-production",
    "server": "app"
  }
}
```

#### DELETE /api/deploy

배포를 관리합니다 (중지, 삭제, 롤백).

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| project | string | 프로젝트 이름 |
| env | string | 환경 |
| action | string | stop, remove, rollback |

---

### Preview API (`/api/preview`)

#### GET /api/preview

Preview 환경 목록을 조회합니다.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| project | string | 프로젝트 필터 |
| branch | string | 브랜치 필터 |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "project": "my-app",
      "branch": "feature-login",
      "slug": "feature-login",
      "container": "my-app-preview-feature-login",
      "port": 5001,
      "domain": "feature-login.preview.codeb.kr",
      "createdAt": "2024-12-20T10:00:00Z"
    }
  ]
}
```

#### POST /api/preview

Preview 작업을 수행합니다.

**Request Body (status):**
```json
{
  "action": "status"
}
```

**Request Body (deploy):**
```json
{
  "action": "deploy",
  "project": "my-app",
  "branch": "feature-login",
  "image": "ghcr.io/org/my-app:sha-abc1234"
}
```

**Request Body (cleanup):**
```json
{
  "action": "cleanup",
  "days": 7
}
```

#### DELETE /api/preview?branch=feature-login

Preview 환경을 삭제합니다.

---

### ENV API (`/api/env`)

#### GET /api/env

환경 변수를 조회합니다.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| project | string | 프로젝트 이름 |
| env | string | 환경 (default: production) |
| action | string | list, current, backups |

**Response (action=current):**
```json
{
  "success": true,
  "data": [
    { "key": "NODE_ENV", "value": "production", "isSecret": false },
    { "key": "DATABASE_URL", "value": "••••••••", "isSecret": true }
  ],
  "project": "my-app",
  "environment": "production"
}
```

#### POST /api/env

환경 변수를 설정/복원합니다.

**Request Body (set):**
```json
{
  "project": "my-app",
  "environment": "production",
  "action": "set",
  "key": "API_KEY",
  "value": "new-value"
}
```

**Request Body (restore):**
```json
{
  "project": "my-app",
  "environment": "production",
  "action": "restore",
  "version": "master"
}
```

**Request Body (update - bulk):**
```json
{
  "project": "my-app",
  "environment": "production",
  "action": "update",
  "variables": {
    "KEY1": "value1",
    "KEY2": "value2"
  }
}
```

#### DELETE /api/env

환경 변수 또는 백업을 삭제합니다.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| project | string | 프로젝트 이름 |
| env | string | 환경 |
| key | string | 삭제할 변수 키 |
| filename | string | 삭제할 백업 파일 |

---

### Domains API (`/api/domains`)

#### GET /api/domains

도메인 목록을 조회합니다.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| source | string | dns, caddy, all |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "domain": "my-app.codeb.kr",
      "type": "A",
      "content": "158.247.203.55",
      "source": "powerdns",
      "dnsStatus": "active",
      "sslStatus": "valid"
    }
  ]
}
```

#### POST /api/domains

새 도메인을 생성합니다.

**Request Body:**
```json
{
  "domain": "my-app.codeb.kr",
  "server": "app",
  "targetPort": 4001
}
```

또는:

```json
{
  "subdomain": "my-app",
  "baseDomain": "codeb.kr",
  "server": "app",
  "targetPort": 4001
}
```

#### DELETE /api/domains?domain=my-app.codeb.kr

도메인을 삭제합니다.

---

### SSOT API (`/api/ssot`)

#### GET /api/ssot

SSOT 상태를 조회합니다.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| action | string | status, projects, servers, ports, containers, stats |

**Response (action=status):**
```json
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "lastUpdated": "2024-12-20T10:00:00Z",
    "servers": { ... },
    "projects": { ... },
    "portAllocation": { ... }
  }
}
```

#### POST /api/ssot

SSOT 작업을 수행합니다.

**Request Body (scan):**
```json
{
  "action": "scan"
}
```

**Request Body (allocate-port):**
```json
{
  "action": "allocate-port",
  "environment": "production",
  "type": "app"
}
```

**Request Body (register-project):**
```json
{
  "action": "register-project",
  "name": "my-app",
  "type": "nextjs",
  "gitRepo": "https://github.com/org/repo"
}
```

---

### Realtime API (`/api/realtime`)

#### GET /api/realtime

Centrifugo 연결 설정을 가져옵니다.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| action | string | config, subscribe, presence |
| channel | string | 채널 이름 (subscribe, presence 시 필요) |

**Response (action=config):**
```json
{
  "success": true,
  "data": {
    "url": "wss://ws.codeb.kr/connection/websocket",
    "token": "eyJ...",
    "userId": "user-1",
    "channels": {
      "DEPLOY": "deploy:{project}",
      "LOGS": "logs:{project}:{env}",
      "SYSTEM": "system:alerts"
    }
  }
}
```

#### POST /api/realtime

이벤트를 발행합니다 (Admin only).

**Request Body (deploy event):**
```json
{
  "action": "deploy",
  "type": "start",
  "project": "my-app",
  "environment": "production",
  "branch": "main"
}
```

**Request Body (notification):**
```json
{
  "action": "notify",
  "userId": "user-1",
  "notification": {
    "type": "success",
    "title": "Deployment Complete",
    "message": "my-app deployed to production"
  }
}
```

---

### Authentication API (`/api/auth`)

#### POST /api/auth/login

로그인합니다.

**Request Body:**
```json
{
  "email": "admin@codeb.dev",
  "password": "admin123!"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJ...",
  "user": {
    "id": "user-1",
    "email": "admin@codeb.dev",
    "name": "Admin",
    "role": "admin"
  }
}
```

#### POST /api/auth/logout

로그아웃합니다.

#### GET /api/auth/me

현재 사용자 정보를 조회합니다.

---

## MCP Tools

Claude Code에서 사용할 수 있는 MCP 도구:

| Tool | Description |
|------|-------------|
| `mcp__codeb-deploy__deploy` | 프로젝트 배포 |
| `mcp__codeb-deploy__healthcheck` | 헬스체크 |
| `mcp__codeb-deploy__rollback` | 롤백 |
| `mcp__codeb-deploy__setup_domain` | 도메인 설정 |
| `mcp__codeb-deploy__manage_env` | ENV 관리 |
| `mcp__codeb-deploy__ssot_*` | SSOT 관리 |
| `mcp__codeb-deploy__security_scan` | 보안 스캔 |

---

## Error Response

모든 API는 표준화된 에러 응답을 반환합니다:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

---

## Webhook Events (Centrifugo)

### Deploy Events

```javascript
// Channel: deploy:{project}
{
  "type": "start" | "progress" | "log" | "success" | "error",
  "project": "my-app",
  "environment": "production",
  "message": "...",
  "progress": 50,
  "timestamp": "2024-12-20T10:00:00Z"
}
```

### Server Events

```javascript
// Channel: server:{server}
{
  "type": "status" | "alert" | "metric",
  "server": "app",
  "message": "...",
  "level": "info" | "warning" | "critical",
  "timestamp": "2024-12-20T10:00:00Z"
}
```

### System Events

```javascript
// Channel: system:alerts
{
  "type": "info" | "success" | "warning" | "error",
  "title": "...",
  "message": "...",
  "timestamp": "2024-12-20T10:00:00Z"
}
```

---

## CLI to API Mapping

| CLI Command | API Endpoint |
|-------------|--------------|
| `we workflow init` | POST /api/projects + POST /api/ssot |
| `we deploy` | POST /api/deploy |
| `we preview list` | GET /api/preview |
| `we env scan` | GET /api/env?action=current |
| `we env restore` | POST /api/env (action: restore) |
| `we domain setup` | POST /api/domains |
| `we ssot sync` | POST /api/ssot (action: scan) |
| `we health` | GET /api/servers |
