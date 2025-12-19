# CodeB Server Architecture v2.0

## Overview

CodeB Server는 **MCP(Model Context Protocol) 기반의 Thin Client 아키텍처**를 채택한 배포 자동화 시스템입니다.

## Core Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CodeB Server v2.0 Architecture                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │                          CLIENT LAYER                                  ││
│  │                                                                        ││
│  │   ┌──────────────────┐     ┌──────────────────┐                      ││
│  │   │   we CLI v2.5    │     │   Claude Code    │                      ││
│  │   │  (Thin Client)   │     │  (MCP Client)    │                      ││
│  │   │                  │     │                  │                      ││
│  │   │ - ssotClient     │     │ - MCP Protocol   │                      ││
│  │   │ - mcpClient      │     │ - Tool Calling   │                      ││
│  │   │ - No SSH Logic   │     │                  │                      ││
│  │   └────────┬─────────┘     └────────┬─────────┘                      ││
│  │            │                        │                                 ││
│  └────────────┼────────────────────────┼─────────────────────────────────┘│
│               │                        │                                   │
│               │    MCP Protocol        │                                   │
│               │    (JSON-RPC 2.0)      │                                   │
│               ▼                        ▼                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │                        MCP SERVER LAYER                                ││
│  │                                                                        ││
│  │   ┌─────────────────────────────────────────────────────────────────┐ ││
│  │   │                   codeb-deploy MCP Server                       │ ││
│  │   │                                                                 │ ││
│  │   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │ ││
│  │   │  │  SSOT Tools  │  │ Deploy Tools │  │ Server Tools │         │ ││
│  │   │  │              │  │              │  │              │         │ ││
│  │   │  │ - ssot_get   │  │ - deploy     │  │- analyze_svr │         │ ││
│  │   │  │ - ssot_sync  │  │ - rollback   │  │- healthcheck │         │ ││
│  │   │  │ - allocate   │  │ - preview    │  │- monitoring  │         │ ││
│  │   │  │ - set_domain │  │ - compose    │  │- security    │         │ ││
│  │   │  └──────────────┘  └──────────────┘  └──────────────┘         │ ││
│  │   │                                                                 │ ││
│  │   │  ┌─────────────────────────────────────────────────────────┐   │ ││
│  │   │  │               SSOT Manager (ssot.json)                  │   │ ││
│  │   │  │                                                         │   │ ││
│  │   │  │  - Port Assignments (staging/production/preview)        │   │ ││
│  │   │  │  - Domain Configurations                                │   │ ││
│  │   │  │  - Project Registry                                     │   │ ││
│  │   │  │  - Change History                                       │   │ ││
│  │   │  └─────────────────────────────────────────────────────────┘   │ ││
│  │   │                                                                 │ ││
│  │   │  ┌─────────────────────────────────────────────────────────┐   │ ││
│  │   │  │                    SSH Client                           │   │ ││
│  │   │  │           (Server Communication Layer)                  │   │ ││
│  │   │  └─────────────────────────────────────────────────────────┘   │ ││
│  │   │                                                                 │ ││
│  │   └─────────────────────────────────────────────────────────────────┘ ││
│  │                                                                        ││
│  └────────────────────────────────────────────────────────────────────────┘│
│               │                                                             │
│               │    SSH Connection                                           │
│               ▼                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │                      DEPLOYMENT SERVER                                 ││
│  │                                                                        ││
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               ││
│  │   │    Podman    │  │    Caddy     │  │   PowerDNS   │               ││
│  │   │  Containers  │  │  (Reverse    │  │    (DNS)     │               ││
│  │   │              │  │   Proxy)     │  │              │               ││
│  │   │ - Apps       │  │              │  │ - A Records  │               ││
│  │   │ - PostgreSQL │  │ - HTTPS      │  │ - Auto-Gen   │               ││
│  │   │ - Redis      │  │ - Routing    │  │              │               ││
│  │   └──────────────┘  └──────────────┘  └──────────────┘               ││
│  │                                                                        ││
│  │   ┌─────────────────────────────────────────────────────────────────┐ ││
│  │   │                   Quadlet (systemd)                             │ ││
│  │   │                                                                 │ ││
│  │   │  /etc/containers/systemd/*.container                           │ ││
│  │   │  - Auto-start on boot                                          │ ││
│  │   │  - Auto-restart on crash                                       │ ││
│  │   │  - journalctl integration                                      │ ││
│  │   └─────────────────────────────────────────────────────────────────┘ ││
│  │                                                                        ││
│  └────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. CLI (Thin Client) - we v2.5

CLI는 **순수 MCP 클라이언트**로 동작합니다:

- **ssotClient**: SSOT 관련 모든 작업을 MCP로 위임
- **mcpClient**: MCP 서버와 통신하는 저수준 클라이언트
- **SSH 로직 없음**: 모든 서버 통신은 MCP 서버를 통해 수행

```javascript
// CLI는 MCP 도구만 호출
const result = await mcpClient.callTool('ssot_allocate_port', {
  projectId: 'myapp',
  environment: 'staging',
  service: 'app'
});
```

### 2. MCP Server (codeb-deploy)

**70개 이상의 MCP 도구**를 제공하는 스마트 백엔드:

| Category | Tools |
|----------|-------|
| **SSOT** | ssot_initialize, ssot_get, ssot_validate, ssot_sync, ssot_allocate_port, ssot_set_domain, etc. |
| **Deploy** | deploy, deploy_compose_project, rollback, preview |
| **Server** | analyze_server, healthcheck, full_health_check |
| **Domain** | setup_domain, remove_domain, check_domain_status |
| **Port** | port_summary, port_validate, port_drift, sync_port_registry |
| **CI/CD** | get_workflow_errors, analyze_build_error, trigger_build_and_monitor |
| **Security** | security_scan, generate_sbom |

### 3. SSOT (Single Source of Truth)

**ssot.json**은 모든 인프라 구성의 단일 진실 소스:

```json
{
  "version": "2.0",
  "server": {
    "ip": "149.28.xxx.xxx",
    "provider": "vultr"
  },
  "projects": {
    "myapp": {
      "type": "nextjs",
      "status": "active",
      "environments": {
        "staging": {
          "ports": { "app": 3001, "db": 15432, "redis": 16379 },
          "domain": "myapp-staging.codeb.dev"
        },
        "production": {
          "ports": { "app": 4001, "db": 25432, "redis": 26379 },
          "domain": "myapp.codeb.dev"
        }
      }
    }
  },
  "portIndex": {
    "3001": { "projectId": "myapp", "environment": "staging", "service": "app" }
  },
  "domainIndex": {
    "myapp-staging.codeb.dev": { "projectId": "myapp", "environment": "staging" }
  }
}
```

### 4. Quadlet (systemd Integration)

컨테이너 관리를 systemd와 통합:

```ini
# /etc/containers/systemd/myapp-production.container
[Unit]
Description=MyApp Production Container
After=myapp-production-postgres.service myapp-production-redis.service
Requires=myapp-production-postgres.service myapp-production-redis.service

[Container]
Image=ghcr.io/org/myapp:latest
ContainerName=myapp-production
PublishPort=4001:3000
EnvironmentFile=/opt/codeb/config/myapp-production.env
Network=codeb-network

[Service]
Restart=always
RestartSec=10s

[Install]
WantedBy=multi-user.target
```

## Data Flow

### 1. Project Initialization

```
User                 CLI              MCP Server           Server
 │                    │                   │                  │
 │ we workflow init   │                   │                  │
 │───────────────────▶│                   │                  │
 │                    │ ssot_register     │                  │
 │                    │──────────────────▶│                  │
 │                    │                   │ SSH: Create dirs │
 │                    │                   │─────────────────▶│
 │                    │                   │                  │
 │                    │ ssot_allocate_port│                  │
 │                    │──────────────────▶│                  │
 │                    │                   │ Update ssot.json │
 │                    │                   │─────────────────▶│
 │                    │                   │                  │
 │                    │ setup_domain      │                  │
 │                    │──────────────────▶│                  │
 │                    │                   │ SSH: Caddy+DNS   │
 │                    │                   │─────────────────▶│
 │                    │◀──────────────────│                  │
 │◀───────────────────│                   │                  │
```

### 2. Deployment

```
GitHub Actions       MCP Server           Server
     │                   │                  │
     │ Push to ghcr.io   │                  │
     │══════════════════▶│                  │
     │                   │                  │
     │                   │ deploy           │
     │                   │──────────────────│
     │                   │                  │
     │                   │ 1. Port validate │
     │                   │─────────────────▶│
     │                   │                  │
     │                   │ 2. Pull image    │
     │                   │─────────────────▶│
     │                   │                  │
     │                   │ 3. Start container
     │                   │─────────────────▶│
     │                   │                  │
     │                   │ 4. Health check  │
     │                   │─────────────────▶│
     │                   │                  │
     │                   │ 5. Commit SSOT   │
     │                   │─────────────────▶│
```

## Port Allocation Strategy

### GitOps Port Ranges

| Environment | App Ports | DB Ports | Redis Ports |
|-------------|-----------|----------|-------------|
| Staging | 3000-3499 | 15432-15499 | 16379-16399 |
| Production | 4000-4499 | 25432-25499 | 26379-26399 |
| Preview | 5000-5999 | (shared) | (shared) |

### Port Guard Validation

모든 배포 전에 PortGuard 검증 수행:

1. **Conflict Check**: 다른 프로젝트와 충돌 여부
2. **Range Check**: 환경별 허용 범위 내인지
3. **Server Check**: 실제 서버에서 포트 사용 여부 (SSH)
4. **Reservation**: 배포 완료까지 포트 예약

## 7-Agent System

복잡한 작업을 전문 에이전트에게 위임:

| Agent | Role |
|-------|------|
| **master-orchestrator** | 전체 프로젝트 조율 |
| **api-contract-guardian** | API 설계 및 계약 정의 |
| **frontend-specialist** | UI/UX 개발 |
| **db-schema-architect** | 데이터베이스 설계 |
| **e2e-test-strategist** | E2E 테스트 전략 |
| **admin-panel-builder** | 관리자 대시보드 |
| **project-initializer** | 프로젝트 초기화 |

## CLI Commands

### Core Commands

```bash
# 프로젝트 초기화 (인프라 + 워크플로우)
we workflow init myapp --type nextjs --database --redis

# SSOT 상태 확인
we ssot status
we ssot projects
we ssot validate --fix

# 배포
we deploy myapp --environment staging
we deploy myapp --environment production --strategy blue-green

# 헬스체크
we health --verbose

# 도메인 관리
we domain setup myapp.codeb.dev --project myapp
we domain list
```

### Workflow Commands

```bash
# Quadlet 파일 생성
we workflow quadlet myapp

# GitHub Actions 워크플로우 생성
we workflow github-actions myapp

# 서버 동기화
we workflow sync myapp

# 리소스 스캔
we workflow scan myapp
```

## File Structure

```
codeb-server/
├── cli/                          # we CLI (Thin Client)
│   ├── bin/we.js                 # Entry point
│   └── src/
│       ├── commands/             # Command handlers
│       │   ├── workflow.js       # Workflow commands
│       │   ├── ssot.js           # SSOT commands
│       │   ├── deploy.js         # Deploy commands
│       │   └── ...
│       └── lib/
│           ├── mcp-client.js     # MCP communication
│           └── ssot-client.js    # SSOT operations
│
├── codeb-deploy-system/          # MCP Server
│   └── mcp-server/
│       └── src/
│           ├── index.ts          # Server entry (70+ tools)
│           ├── lib/
│           │   ├── ssh-client.ts # SSH communication
│           │   ├── ssot-manager.ts # SSOT management
│           │   └── port-manifest.ts # Port management
│           └── tools/
│               ├── ssot.ts       # SSOT tools
│               ├── deploy.ts     # Deploy tools
│               └── ...
│
├── infrastructure/               # Infrastructure configs
│   ├── quadlet/                  # Quadlet templates
│   └── terraform/                # Terraform configs
│
└── docs/                         # Documentation
```

## Version History

- **v2.0.0** (2024-12): MCP Thin Client 아키텍처 완성
  - CLI에서 SSH 로직 제거
  - SSOT 중앙화 완성
  - 7-Agent 시스템 통합
  - Quadlet 100% 지원
