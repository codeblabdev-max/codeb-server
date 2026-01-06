# CLAUDE.md v5.0 - CodeB Blue-Green Deployment System

## Critical Rules

### 1. NEVER Run Dangerous Commands

```bash
# BLOCKED by hooks
podman rm -f <container>
podman volume rm <volume>
rm -rf /opt/codeb/*
ssh root@*  # Use MCP API instead
```

### 2. ALWAYS Use CLI Commands

```bash
we init <project>        # Initialize project + ENV
we deploy <project>      # Blue-Green deploy
we promote <project>     # Switch traffic
we rollback <project>    # Instant rollback
we env <action>          # ENV management
we status                # System status
```

---

## 4-Server Architecture

| Role | IP | Domain | Services |
|------|-----|--------|----------|
| **App** | 158.247.203.55 | app.codeb.kr | Next.js, MCP API (9101), Caddy |
| **Streaming** | 141.164.42.213 | ws.codeb.kr | Centrifugo (8000) |
| **Storage** | 64.176.226.119 | db.codeb.kr | PostgreSQL (5432), Redis (6379) |
| **Backup** | 141.164.37.63 | backup.codeb.kr | ENV backup, Prometheus, Grafana |

---

## Blue-Green Deployment

### Concept

```
┌─────────────────────────────────────────────────┐
│                Blue-Green Slots                  │
├─────────────────────────────────────────────────┤
│                                                 │
│   ┌─────────┐         ┌─────────┐              │
│   │  Blue   │         │  Green  │              │
│   │  v1.0   │         │  v1.1   │ ← New deploy │
│   │ :3000   │         │ :3001   │              │
│   │ active  │         │ preview │              │
│   └────┬────┘         └────┬────┘              │
│        │                   │                    │
│        └───────┬───────────┘                    │
│                ↓                                │
│          ┌─────────┐                           │
│          │  Caddy  │ ← Config only switch      │
│          └─────────┘                           │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Slot States

| State | Description |
|-------|-------------|
| `empty` | No container |
| `deployed` | Container running, no traffic |
| `active` | Receiving production traffic |
| `grace` | Previous version, 48h before cleanup |

### Commands

```bash
# Deploy to inactive slot
we deploy myapp --env production
# Returns: Preview URL https://myapp-green.preview.codeb.dev

# After testing, switch traffic
we promote myapp --env production

# If issues, instant rollback
we rollback myapp --env production

# Check slot status
we slot status myapp
```

---

## Port Allocation

| Environment | App Port | Blue | Green |
|-------------|----------|------|-------|
| Staging | 3000-3499 | base | base+1 |
| Production | 4000-4499 | base | base+1 |
| Preview | 5000-5999 | base | base+1 |

---

## ENV Management

### Auto-Generation

```bash
we init myapp --type nextjs --database --redis
```

Creates:
```bash
# App Server: /opt/codeb/projects/myapp/.env
NODE_ENV=production
PORT=3000

# Auto-generated credentials
DATABASE_URL=postgresql://myapp_user:xxxxx@db.codeb.kr:5432/myapp_prod
REDIS_URL=redis://:xxxxx@db.codeb.kr:6379/0

# Centrifugo (Streaming server)
CENTRIFUGO_URL=wss://ws.codeb.kr/connection/websocket
CENTRIFUGO_API_KEY=xxxxx
```

### Backup System

```
Backup Server: 141.164.37.63
Path: /opt/codeb/env-backup/{project}/{environment}/

Files:
├── master.env      # Original (never modified)
├── current.env     # Latest version
└── {timestamp}.env # Change history
```

### Commands

```bash
we env list myapp                    # List all ENVs
we env get myapp --key DATABASE_URL  # Get specific key
we env set myapp --key FOO --value bar  # Set key
we env restore myapp --version master   # Restore from master
we env pull myapp                    # Download to local
we env push myapp                    # Upload from local
```

---

## MCP API

### Base URL

```
Primary: https://app.codeb.kr:9101/api
Fallback: http://158.247.203.55:9101/api
```

### Authentication

```bash
X-API-Key: codeb_{role}_{token}

Roles:
- admin: Full access
- dev: Deploy only
- view: Read only
```

### Endpoints

| Tool | Description |
|------|-------------|
| `deploy` | Deploy to inactive slot |
| `promote` | Switch traffic to new slot |
| `rollback` | Switch back to previous slot |
| `slot_status` | Get slot states |
| `env_get` | Get ENV value |
| `env_set` | Set ENV value |
| `health_check` | Full system health |
| `registry_sync` | Sync SSOT registry |

---

## GitHub Actions Integration

### deploy.yml (Auto-generated)

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build & Push
        run: |
          docker build -t ghcr.io/${{ github.repository }}:${{ github.sha }} .
          docker push ghcr.io/${{ github.repository }}:${{ github.sha }}

      - name: Deploy via CodeB API
        run: |
          curl -X POST "${{ secrets.CODEB_API_URL }}/deploy" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -d '{"project": "myapp", "version": "${{ github.sha }}"}'
```

### Required Secrets

| Secret | Description |
|--------|-------------|
| `CODEB_API_URL` | https://app.codeb.kr:9101/api |
| `CODEB_API_KEY` | API key from we init |
| `GHCR_PAT` | GitHub Container Registry token |

---

## Real-time (Centrifugo)

### NEVER Use Socket.IO

```javascript
// FORBIDDEN
import { io } from 'socket.io-client';
```

### ALWAYS Use Centrifugo

```javascript
import { Centrifuge } from 'centrifuge';

const centrifuge = new Centrifuge('wss://ws.codeb.kr/connection/websocket', {
  token: await getToken()
});

const sub = centrifuge.newSubscription('channel:id');
sub.on('publication', (ctx) => console.log(ctx.data));
sub.subscribe();
centrifuge.connect();
```

---

## Quick Reference

```bash
# Initialize
we init myapp --type nextjs --database --redis

# Deploy flow
we deploy myapp --env staging
we promote myapp --env staging

# Status
we status
we slot status myapp

# ENV
we env list myapp
we env restore myapp --version master

# Rollback
we rollback myapp --env staging
```

---

## Version: 5.0.0
