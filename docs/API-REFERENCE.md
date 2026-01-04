# MCP HTTP API Reference

## Overview

CodeB Server provides an HTTP API for deployment and server management.

**Base URL:** `https://api.codeb.kr/api` (or `http://app.codeb.kr:9101/api`)

**Authentication:**
```http
X-API-Key: codeb_{role}_{token}
```

Roles: `admin`, `dev`, `view`

---

## Endpoints

### Health Check

```http
GET /api/health
```

No authentication required.

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "version": "2.0.0",
  "timestamp": "2025-01-05T10:00:00Z"
}
```

### Tool Execution

```http
POST /api/tool
Content-Type: application/json
X-API-Key: codeb_dev_xxx

{
  "tool": "tool_name",
  "params": { ... }
}
```

### List Available Tools

```http
GET /api/tools
X-API-Key: codeb_dev_xxx
```

---

## Deployment Tools

### deploy

Deploy a new container to the next available slot.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| projectName | string | Yes | - | Project name |
| environment | string | No | production | production, staging, preview |
| image | string | No | ghcr.io/.../project:latest | Container image |
| skipHealthcheck | boolean | No | false | Skip health check |
| autoPromote | boolean | No | false | Auto-promote after deploy |

**Request:**
```json
{
  "tool": "deploy",
  "params": {
    "projectName": "myapp",
    "environment": "production",
    "autoPromote": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "tool": "deploy",
  "result": {
    "success": true,
    "project": "myapp",
    "environment": "production",
    "slot": "green",
    "port": 4001,
    "container": "myapp-production-green",
    "previewUrl": "http://158.247.203.55:4001",
    "isFirstDeploy": false,
    "activeSlot": "blue",
    "message": "Deployed to slot green. Run 'promote' to switch traffic."
  }
}
```

---

### promote

Switch traffic to a new slot (Caddy reload only).

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| projectName | string | Yes | - | Project name |
| environment | string | No | production | Environment |
| targetSlot | string | No | auto | blue or green |

**Request:**
```json
{
  "tool": "promote",
  "params": {
    "projectName": "myapp",
    "environment": "production"
  }
}
```

**Response:**
```json
{
  "success": true,
  "tool": "promote",
  "result": {
    "success": true,
    "project": "myapp",
    "environment": "production",
    "activeSlot": "green",
    "previousSlot": "blue",
    "domain": "myapp.codeb.kr",
    "url": "https://myapp.codeb.kr",
    "port": 4001,
    "gracePeriod": {
      "slot": "blue",
      "endsAt": "2025-01-07T10:00:00Z",
      "hoursRemaining": 48
    },
    "message": "Traffic switched to slot green. Previous slot blue will be cleaned up after 48h."
  }
}
```

---

### rollback

Switch traffic back to the previous slot.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| projectName | string | Yes | - | Project name |
| environment | string | No | production | Environment |

**Request:**
```json
{
  "tool": "rollback",
  "params": {
    "projectName": "myapp",
    "environment": "production"
  }
}
```

**Response:**
```json
{
  "success": true,
  "tool": "rollback",
  "result": {
    "success": true,
    "project": "myapp",
    "environment": "production",
    "rolledBackTo": "blue",
    "previousActive": "green",
    "domain": "myapp.codeb.kr",
    "url": "https://myapp.codeb.kr",
    "message": "Rolled back to slot blue. Slot green is now in grace period."
  }
}
```

---

## Slot Management Tools

### slot_list

List all slots for a project.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| projectName | string | No | - | Filter by project |
| environment | string | No | - | Filter by environment |

**Response:**
```json
{
  "success": true,
  "project": "myapp",
  "environments": {
    "production": {
      "activeSlot": "green",
      "slots": {
        "blue": {
          "container": "myapp-production-blue",
          "port": 4000,
          "status": "grace-period",
          "containerStatus": "running"
        },
        "green": {
          "container": "myapp-production-green",
          "port": 4001,
          "status": "active",
          "containerStatus": "running"
        }
      }
    }
  }
}
```

---

### slot_status

Get detailed slot status.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| projectName | string | Yes | - | Project name |
| environment | string | No | production | Environment |

**Response:**
```json
{
  "success": true,
  "project": "myapp",
  "environment": "production",
  "activeSlot": "green",
  "slots": {
    "blue": {
      "container": "myapp-production-blue",
      "port": 4000,
      "image": "ghcr.io/org/myapp:abc123",
      "deployedAt": "2025-01-03T10:00:00Z",
      "status": "grace-period",
      "containerStatus": "running",
      "isActive": false,
      "gracePeriodRemaining": {
        "hours": 45,
        "minutes": 30
      }
    },
    "green": {
      "container": "myapp-production-green",
      "port": 4001,
      "image": "ghcr.io/org/myapp:def456",
      "deployedAt": "2025-01-05T10:00:00Z",
      "status": "active",
      "containerStatus": "running",
      "isActive": true
    }
  }
}
```

---

### slot_cleanup

Clean up grace-period expired slots.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| projectName | string | No | - | Filter by project |
| environment | string | No | - | Filter by environment |
| force | boolean | No | false | Ignore grace period |

**Response:**
```json
{
  "success": true,
  "cleanedUp": [
    { "slotKey": "myapp:production", "slot": "blue", "container": "myapp-production-blue" }
  ],
  "skipped": [
    { "slotKey": "myapp:staging", "slot": "blue", "reason": "grace-period", "hoursRemaining": 20 }
  ],
  "message": "Cleaned up 1 slot(s)"
}
```

---

## Project Management Tools

### create_project

Create a new project with SSOT registration.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| name | string | Yes | - | Project name (lowercase, alphanumeric, hyphens) |
| type | string | No | nextjs | nextjs, nodejs, python, static |
| description | string | No | "" | Project description |
| database | boolean | No | true | Enable PostgreSQL |
| redis | boolean | No | true | Enable Redis |
| gitRepo | string | No | "" | Git repository URL |

**Response:**
```json
{
  "success": true,
  "project": {
    "name": "myapp",
    "type": "nextjs",
    "database": true,
    "redis": true,
    "ports": {
      "production": { "app": 4050 },
      "staging": { "app": 4550 }
    }
  },
  "files": {
    "Dockerfile": "...",
    ".github/workflows/deploy.yml": "..."
  },
  "nextSteps": [
    "1. ENV 초기화: we env init myapp",
    "2. 배포: we deploy myapp --environment staging"
  ]
}
```

---

### get_project

Get project details and container status.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| projectName | string | Yes | Project name |

---

### list_projects

List all registered projects.

---

## ENV Management Tools

### env_init

Initialize ENV files for a project.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| projectName | string | Yes | Project name |
| environment | string | No | production |
| envContent | string | Yes | ENV file content |

**Protected Variables (auto-preserved):**
- `DATABASE_URL`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `REDIS_URL`

---

### env_push

Update ENV files (preserves protected variables).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| projectName | string | Yes | Project name |
| environment | string | No | production |
| envContent | string | Yes | New ENV content |

---

### env_scan

Compare local vs server ENV.

---

### env_pull

Pull ENV from server.

---

### env_backups

List ENV backup files.

---

## Domain Management Tools

### domain_setup

Setup domain with DNS + Caddy + SSL.

**Parameters:**
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| projectName | string | Yes | - | Project name |
| environment | string | No | production | Environment |
| customDomain | string | No | - | External domain |
| targetPort | number | No | auto | Target port |

---

### domain_status

Check domain status (DNS, Caddy, SSL).

---

### domain_list

List all configured domains.

---

### domain_connect

Connect custom external domain.

---

## Monitoring Tools

### full_health_check

Get server resources and service status.

**Response:**
```json
{
  "timestamp": "2025-01-05T10:00:00Z",
  "server": "app",
  "resources": {
    "cpu": { "usage": 25 },
    "memory": { "usage": 60.5, "used": "4.8G", "total": "8G" },
    "disk": { "usage": 45, "used": "50G", "total": "100G" }
  },
  "services": {
    "caddy": { "running": true, "status": "active" }
  }
}
```

---

### analyze_server

Analyze server with container list.

---

### check_domain_status

Check specific domain status.

---

## Permission Matrix

| Tool | Admin | Dev | View |
|------|-------|-----|------|
| deploy | Yes | Yes | No |
| promote | Yes | Yes | No |
| rollback | Yes | Yes | No |
| slot_list | Yes | Yes | Yes |
| slot_status | Yes | Yes | Yes |
| slot_cleanup | Yes | Yes | No |
| create_project | Yes | Yes | No |
| list_projects | Yes | Yes | Yes |
| get_project | Yes | Yes | Yes |
| env_init | Yes | Yes | No |
| env_push | Yes | Yes | No |
| env_scan | Yes | Yes | Yes |
| env_pull | Yes | Yes | No |
| env_backups | Yes | Yes | Yes |
| domain_setup | Yes | Yes | No |
| domain_status | Yes | Yes | Yes |
| domain_list | Yes | Yes | Yes |
| domain_connect | Yes | Yes | No |
| full_health_check | Yes | Yes | Yes |
| analyze_server | Yes | Yes | No |

---

## Error Responses

### 401 Unauthorized

```json
{
  "success": false,
  "error": "Invalid or missing API Key",
  "hint": "Set X-API-Key header with codeb_{role}_{token} format"
}
```

### 403 Forbidden

```json
{
  "success": false,
  "error": "Permission denied: view cannot use deploy"
}
```

### 404 Not Found

```json
{
  "success": false,
  "error": "Unknown tool: invalid_tool",
  "available": ["deploy", "promote", ...]
}
```
