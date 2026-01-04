# AI Context - CodeB Server

> This document is optimized for AI assistants (Claude Code, Cursor, etc.)

## System Overview

```yaml
name: CodeB Server
type: Self-hosted Deployment Platform
style: Vercel-like Blue-Green Slot Deployment
api: MCP HTTP API (https://api.codeb.kr)
```

## Architecture Summary

```
4-Server Infrastructure:
├── App (158.247.203.55)      → Containers, Caddy, PowerDNS, MCP API
├── Storage (64.176.226.119)  → PostgreSQL:5432, Redis:6379
├── Streaming (141.164.42.213)→ Centrifugo:8000 (WebSocket)
└── Backup (141.164.37.63)    → ENV backup, Monitoring
```

## Core Concepts

### Blue-Green Slot Deployment

```
Each project has 2 slots (blue/green):

deploy  → Creates container on INACTIVE slot
        → Returns preview URL (direct port access)

promote → Updates Caddy config only
        → Zero-downtime traffic switch
        → Previous slot enters grace-period (48h)

rollback→ Switches Caddy back
        → Instant (no container restart)
```

### Slot States

| State | Description |
|-------|-------------|
| `empty` | No container |
| `deployed` | Container ready, not serving |
| `active` | Serving production traffic |
| `grace-period` | Previous version, 48h rollback window |

### Port Allocation

```javascript
// Hash-based port calculation
const hash = projectName.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
const basePort = environment === 'production' ? 4000 + (hash % 500) : 4500 + (hash % 500);

// Slot ports
blue  = basePort      // e.g., 4050
green = basePort + 1  // e.g., 4051
```

## API Quick Reference

### Base URL
```
https://api.codeb.kr/api
# fallback: http://app.codeb.kr:9101/api
```

### Authentication
```http
X-API-Key: codeb_{role}_{token}
```

Roles: `admin` (full), `dev` (deploy), `view` (read-only)

### Key Endpoints

```javascript
// Deploy to next slot
POST /api/tool
{ "tool": "deploy", "params": { "projectName": "myapp", "environment": "production" }}
// Returns: { slot, port, previewUrl }

// Switch traffic
POST /api/tool
{ "tool": "promote", "params": { "projectName": "myapp" }}
// Returns: { activeSlot, domain, url, gracePeriod }

// Rollback
POST /api/tool
{ "tool": "rollback", "params": { "projectName": "myapp" }}
// Returns: { rolledBackTo, previousActive }

// Check slots
POST /api/tool
{ "tool": "slot_status", "params": { "projectName": "myapp" }}
// Returns: { activeSlot, slots: { blue: {...}, green: {...} }}
```

## File Locations (Server)

```
/opt/codeb/registry/ssot.json    → Project registry (SSOT)
/opt/codeb/registry/slots.json   → Slot states
/opt/codeb/env-backup/{project}/ → ENV files (backup server)
/etc/caddy/sites/{project}.caddy → Reverse proxy configs
```

## Container Naming

```
{project}-{environment}-{slot}

Examples:
- myapp-production-blue
- myapp-production-green
- myapp-staging-blue
```

## ENV Variables

### Protected (Auto-preserved)
```
DATABASE_URL
POSTGRES_USER
POSTGRES_PASSWORD
REDIS_URL
```

### Auto-generated
```bash
DATABASE_URL=postgresql://postgres:xxx@db.codeb.kr:5432/{project}
REDIS_URL=redis://db.codeb.kr:6379/0
CENTRIFUGO_URL=wss://ws.codeb.kr/connection/websocket
```

## Domain Structure

```
Production: {project}.codeb.kr
Staging:    {project}-staging.codeb.kr
Preview:    http://158.247.203.55:{port}
```

## Key Files in Codebase

```
codeb-server/
├── api/mcp-http-api.js     → Main API server (all tools)
├── cli/bin/we.js           → CLI entry point
├── cli/commands/           → CLI command implementations
└── server-scripts/         → Server-side automation
```

## Common Operations

### Deploy Flow
```bash
# Via CLI
we deploy myapp --environment production
we promote myapp

# Via API
curl -X POST http://app.codeb.kr:9100/api/tool \
  -H "X-API-Key: codeb_dev_xxx" \
  -d '{"tool":"deploy","params":{"projectName":"myapp"}}'
```

### Check Status
```bash
we slot status myapp
# or
curl -X POST http://app.codeb.kr:9100/api/tool \
  -d '{"tool":"slot_status","params":{"projectName":"myapp"}}'
```

### ENV Management
```bash
we env scan myapp      # Compare local vs server
we env push myapp      # Upload ENV (protected vars preserved)
we env pull myapp      # Download ENV
```

## Important Constraints

1. **Never delete containers directly** - Use `slot_cleanup` tool
2. **Protected ENV vars** - DATABASE_URL, REDIS_URL always preserved
3. **Grace period** - 48 hours before old slot cleanup
4. **Shared database** - All projects share PostgreSQL, use backward-compatible migrations
5. **Centrifugo for WebSocket** - Never use Socket.IO

## Error Handling

```json
// 401 - Missing/invalid API key
{ "success": false, "error": "Invalid or missing API Key" }

// 403 - Permission denied
{ "success": false, "error": "Permission denied: view cannot use deploy" }

// Tool-specific errors include hints
{ "success": false, "error": "...", "hint": "..." }
```

## Quick Decision Tree

```
Need to deploy?
├── First deploy → deploy (auto-promotes)
├── Update existing → deploy → test preview → promote
└── Problem? → rollback (instant)

Need to check?
├── Project status → slot_status
├── All projects → list_projects
├── Server health → full_health_check
└── Domain status → domain_status

Need ENV?
├── Initialize → env_init
├── Update → env_push (protected vars safe)
├── Compare → env_scan
└── Download → env_pull
```
