# CodeB Server Quick Start Guide

## Prerequisites

- Node.js 20+
- GitHub account with repository access

> **Note**: SSH 직접 접속은 Admin만 가능합니다. 팀원은 `we` CLI + MCP API를 통해 서버 작업을 수행합니다.

## Installation

### 1. One-Line Install (Recommended)

```bash
npm install -g @codeb/we-cli
```

This automatically:
- Installs the `we` CLI globally
- Registers MCP server in `~/.claude.json`
- Installs slash commands to `~/.claude/commands/we/`
- Sets up security hooks (SSH blocking for team members)

### 2. Manual Installation

```bash
git clone https://github.com/codeblabdev-max/codeb-server.git
cd codeb-server/cli
npm install
npm link  # Makes 'we' command globally available
```

## Server Infrastructure

### 4-Server Architecture

| Role | IP | Domain | Services |
|------|-----|--------|----------|
| **App** | 158.247.203.55 | app.codeb.kr | Next.js apps, Dashboard, PowerDNS |
| **Streaming** | 141.164.42.213 | ws.codeb.kr | Centrifugo (WebSocket) |
| **Storage** | 64.176.226.119 | db.codeb.kr | PostgreSQL, Redis (Shared) |
| **Backup** | 141.164.37.63 | backup.codeb.kr | Backups, Monitoring, ENV Storage |

### Port Allocation

| Service | Port Range | Server |
|---------|------------|--------|
| PostgreSQL | 5432 | Storage |
| Redis | 6379 | Storage |
| Centrifugo | 8000 | Streaming |
| Production Apps | 4000-4499 | App |
| **Preview Apps** | **5000-5999** | **Backup** |
| Development | 5000-5499 | Local |

### Nameservers (PowerDNS)

- n1.codeb.kr → 158.247.203.55 (Primary NS)
- n2.codeb.kr → 158.247.203.55 (Secondary NS)

## Access Control

### Admin vs Team Members

| Role | SSH Access | MCP API | Deploy | ENV Manage | Team Manage |
|------|------------|---------|--------|------------|-------------|
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Developer** | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Viewer** | ❌ | ✅ | ❌ | ❌ | ❌ |

### Team Management

```bash
# List team members
we team list

# Add team member
we team add

# Change role
we team role dev1 admin

# Toggle active status
we team toggle dev5

# Team summary
we team status
```

## Basic Usage (MCP-First Architecture)

### Core Commands: scan → up → deploy

v3.0.0부터 **scan 기반 아키텍처**를 사용합니다. Claude Code에서 이 명령어들의 JSON 출력을 분석하여 다음 액션을 결정합니다.

```bash
# 1. 서버 상태 스캔 (read-only)
we scan                           # 전체 상태 스캔
we scan my-app                    # 특정 프로젝트 스캔
we scan --json                    # JSON 출력 (Claude/MCP용)
we scan --diff                    # 로컬 vs 서버 비교

# 2. 권장 작업 자동 실행
we up                             # 현재 디렉토리 프로젝트
we up my-app                      # 특정 프로젝트
we up --all                       # 선택적 작업도 포함
we up --fix                       # 문제 자동 수정
we up --dry-run                   # 실행 계획만 출력

# 3. 배포
we deploy my-app                  # 배포
```

### Create a New Project

```bash
# Initialize project with database
we workflow init my-nextjs-app --database

# Or with database + redis
we workflow init my-nextjs-app --database --redis

# Quick start (scan → up)
cd my-project
we scan --diff                    # 상태 확인
we up --fix                       # 필요한 작업 자동 실행
```

This automatically:
1. Allocates ports (staging + production)
2. Creates PostgreSQL/Redis databases on Storage server
3. Generates .env files with all connections
4. **Backs up ENV to backup server** (master.env for recovery)
5. Sets up GitHub Actions workflow
6. Registers in SSOT

## Deployment Strategy (Image Promotion)

### 개요

**1번 빌드, 테스트된 이미지 그대로 Production 배포** - 상위 1% 스타트업 방식

```
feature-branch 푸시
    ↓
이미지 빌드 (1번만): ghcr.io/repo:sha-abc1234
    ↓
Preview 배포 (Backup 서버)
https://feature-login.preview.codeb.kr
    ↓
테스트 완료 → PR 생성 → 코드 리뷰
    ↓
PR 머지 (main)
    ↓
같은 이미지를 Production에 배포 (재빌드 X)
    ↓
Preview 환경 자동 삭제
```

### Branch → Preview → Production 흐름

| 단계 | 서버 | 도메인 |
|------|------|--------|
| Preview | Backup (141.164.37.63) | `{branch}.preview.codeb.kr` |
| Production | App (158.247.203.55) | `{app}.codeb.kr` |

### Preview 명령어

```bash
# Preview 목록 확인
we preview list

# Preview 서버 상태
we preview status

# Preview 로그 확인
we preview logs feature-login

# Preview 환경 삭제
we preview delete feature-login

# 오래된 Preview 정리 (7일 이상)
we preview cleanup --days 7
```

### Check Project Status

```bash
we workflow scan my-nextjs-app
we health check my-nextjs-app
```

## ENV Management (Critical)

### ENV Backup System

All ENV files are automatically backed up to the backup server:

```
Backup Server: backup.codeb.kr (141.164.37.63)
Backup Path: /opt/codeb/env-backup/{project}/{environment}/
```

**File Structure:**
- `master.env` - Initial version (never changes, recovery baseline)
- `current.env` - Latest version
- `{timestamp}.env` - Change history

### ENV Commands

```bash
# Compare server vs local ENV
we env scan my-app

# List backups
we env backups my-app

# Restore from master (recommended for recovery)
we env restore my-app --version master

# Restore from latest backup
we env restore my-app --version current

# Pull from server to local
we env pull my-app
```

### Auto-Generated ENV Variables

When you run `we workflow init`, these are automatically configured:

```bash
# Basic
NODE_ENV=production
PORT=3000

# PostgreSQL (Storage server)
DATABASE_URL=postgresql://postgres:password@db.codeb.kr:5432/myapp?schema=public

# Redis (Storage server)
REDIS_URL=redis://db.codeb.kr:6379/0
REDIS_PREFIX=myapp:

# Centrifugo (Streaming server) - NOT Socket.IO!
CENTRIFUGO_URL=wss://ws.codeb.kr/connection/websocket
CENTRIFUGO_API_URL=http://ws.codeb.kr:8000/api
CENTRIFUGO_API_KEY=pRMupNs6HlGp7G6xkPsAFrI8hN4g6U0G
CENTRIFUGO_SECRET=of0KuRFjjzhq5LlBURCuKqzTUAA08hwL
```

## Real-time Communication (WebSocket)

### Use Centrifugo (NOT Socket.IO)

```javascript
// Client connection
import { Centrifuge } from 'centrifuge';

const centrifuge = new Centrifuge('wss://ws.codeb.kr/connection/websocket', {
  token: await getConnectionToken()
});

const sub = centrifuge.newSubscription('chat:room123');
sub.on('publication', (ctx) => {
  console.log('Message:', ctx.data);
});
sub.subscribe();
centrifuge.connect();
```

```javascript
// Server-side publish
const response = await fetch('http://ws.codeb.kr:8000/api/publish', {
  method: 'POST',
  headers: {
    'Authorization': `apikey ${CENTRIFUGO_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    channel: 'chat:room123',
    data: { message: 'Hello!', user: 'john' }
  })
});
```

## Domain Setup

### Auto Domain (codeb.kr)

```bash
# Staging: my-app-staging.codeb.kr
# Production: my-app.codeb.kr
we domain setup my-app --auto
```

### Custom Domain

```bash
we domain setup my-app --domain myapp.com --env production
```

This automatically:
1. Creates PowerDNS A record
2. Configures Caddy reverse proxy
3. Issues SSL certificate (Let's Encrypt)

## Monitoring & Health Checks

### System Health

```bash
# Overall health check
we health

# Specific project health
we health check my-app

# Server status
we ssot status
we ssot projects
```

### MCP Tools for Monitoring

Claude Code can monitor via MCP:

```
User: Check system health
Claude: [Uses mcp__codeb-deploy__healthcheck tool]

User: Show all team members
Claude: [Uses mcp__codeb-deploy__team_list tool]

User: List ENV backups for my-app
Claude: [Uses mcp__codeb-deploy__env_backups tool]
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `deploy` | Deploy project to server |
| `healthcheck` | Check system/project health |
| `setup_domain` | Configure domain and SSL |
| `manage_env` | Manage environment variables |
| `team_list` | List team members |
| `team_status` | Team summary |
| `env_backups` | List ENV backups |
| `env_restore` | Restore ENV from backup |

## Terminal Dashboard (TUI)

터미널에서 바로 서버 상태를 모니터링하고 관리할 수 있습니다.

### Start TUI Dashboard

```bash
we tui                    # 대시보드 시작
we tui --compact          # 컴팩트 모드
we tui --refresh 10       # 10초 새로고침
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **1-5** | View switching (Overview/Servers/Projects/Deploy/Config) |
| **Tab** | Focus next panel |
| **Shift+Tab** | Focus previous panel |
| **r** | Refresh data |
| **s** | SSOT sync |
| **q/Esc** | Quit (or back to Overview) |
| **Enter** | Select item |
| **↑↓** | Navigate lists |

### TUI Views

| View | Key | Description |
|------|-----|-------------|
| **Overview** | 1 | Main dashboard with servers, projects, deployments |
| **Servers** | 2 | Server details, metrics, containers |
| **Projects** | 3 | Project management, ENV, domains, history |
| **Deploy** | 4 | Deployment center with target/environment selection |
| **Config** | 5 | Server configuration and settings |

## Web Dashboard

### Start the Dashboard

```bash
cd web-ui
npm install
npm run dev
```

Visit http://localhost:3000

### Dashboard Pages

| Page | Description |
|------|-------------|
| **/** | Dashboard overview - servers, projects, deployments |
| **/projects** | Project management and deployment |
| **/servers** | 4-server monitoring with real-time metrics |
| **/domains** | Domain and SSL management |
| **/env** | Secure ENV management |
| **/team** | Team member management |
| **/monitoring** | Live server metrics and alerts |
| **/settings** | API keys, notifications, config |

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/projects` | Project CRUD |
| `/api/ssot` | SSOT registry |
| `/api/domains` | Domain management |
| `/api/env` | ENV management |
| `/api/team` | Team management |
| `/api/servers` | Server status |
| `/api/auth/*` | Authentication |

## CLI Command Reference (v3.0.0)

### Core Commands (MCP-First)

```bash
# Scan - 서버 상태 수집 (read-only)
we scan                                             # 전체 스캔
we scan <project>                                   # 프로젝트 스캔
we scan --json                                      # JSON 출력 (Claude/MCP용)
we scan --diff                                      # 로컬 vs 서버 비교
we scan --server                                    # 서버 상태만
we scan --ports                                     # 포트 현황만

# Up - 권장 작업 실행
we up                                               # 현재 디렉토리
we up <project>                                     # 특정 프로젝트
we up --all                                         # 선택적 작업 포함
we up --fix                                         # 문제 자동 수정
we up --sync                                        # 서버 동기화
we up --dry-run                                     # 실행 계획만

# Deploy - 배포
we deploy <project> [--env staging|production]      # Deploy project
```

### Workflow Commands

```bash
we workflow init <project> [--database] [--redis]  # Initialize project
we workflow scan <project>                          # Scan project status
we workflow stop <project>                          # Stop services
we workflow start <project>                         # Start services
```

### ENV Commands

```bash
we env scan <project>                               # Compare server/local ENV
we env pull <project>                               # Pull from server
we env push <project>                               # Push to server
we env list <project>                               # List ENV vars
we env backups <project>                            # List backups
we env restore <project> --version <version>        # Restore from backup
```

### Team Commands

```bash
we team list                                        # List members
we team add                                         # Add member (interactive)
we team remove <id>                                 # Remove member
we team role <id> <role>                            # Change role
we team toggle <id>                                 # Toggle active status
we team status                                      # Team summary
```

### Domain Commands

```bash
we domain setup <project> [--auto] [--domain <domain>]
we domain list
we domain delete <domain>
```

### SSOT Commands

```bash
we ssot status                                      # System status
we ssot projects                                    # List projects
we ssot sync                                        # Sync server data
```

### Health Commands

```bash
we health                                           # Overall health
we health check <project>                           # Project health
```

### MCP Commands

```bash
we mcp serve                                        # Start MCP server
we mcp status                                       # MCP status
```

## Slash Commands (Claude Code)

After installation, these slash commands are available:

| Command | Description |
|---------|-------------|
| `/we:init` | Initialize new project |
| `/we:deploy` | Deploy project |
| `/we:analyze` | Analyze project |
| `/we:health` | Health check |
| `/we:workflow` | Workflow management |
| `/we:domain` | Domain management |
| `/we:monitor` | Real-time monitoring |
| `/we:registry` | Server registry |

## Troubleshooting

### MCP Connection Issues

```bash
# Check MCP status
we mcp status

# Verify ~/.claude.json has codeb-deploy server
cat ~/.claude.json
```

### Container Issues

```bash
# Via CLI (recommended)
we workflow scan my-app

# For Admin only - direct SSH
ssh root@app.codeb.kr "podman ps -a"
ssh root@app.codeb.kr "podman logs my-app-staging"
```

### ENV Recovery

```bash
# If ENV is corrupted or lost, restore from master
we env restore my-app --version master

# Or check available backups
we env backups my-app
```

### Port Conflicts

```bash
# Scan and sync ports
we ssot sync

# Check port allocation
we ssot status
```

### Domain Not Working

```bash
# Check DNS
dig my-app.codeb.kr

# Via CLI
we domain list
```

## Security Notes

1. **SSH Access**: Only Admin can SSH directly. Team members use `we` CLI only.
2. **ENV Files**: Never edit directly. Always use `we env` commands.
3. **Master ENV**: `master.env` on backup server is the recovery baseline - never modified.
4. **Hooks**: Pre-bash hook blocks dangerous commands (podman rm, volume rm, etc.)

## Next Steps

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for system overview
2. Check [INFRASTRUCTURE_MANUAL.md](./INFRASTRUCTURE_MANUAL.md) for server details
3. Review [NOTIFICATION_GUIDE.md](./NOTIFICATION_GUIDE.md) for alerts setup
4. Explore [frontend-ui.md](./frontend-ui.md) for dashboard documentation
