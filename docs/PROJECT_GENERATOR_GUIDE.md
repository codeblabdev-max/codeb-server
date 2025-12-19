# CodeB Project Generator - Complete Guide

## Overview

CodeB Project Generator는 **단 하나의 API 호출**로 완전한 프로젝트 인프라를 자동 생성하는 시스템입니다.

### What Gets Generated?

```
my-app/
├── Dockerfile                        # Multi-stage production build
├── .github/workflows/deploy.yml      # Hybrid CI/CD workflow
├── .env.example                      # Environment variables template
├── quadlet/
│   ├── production/
│   │   ├── app.container             # App container
│   │   ├── postgres.container        # PostgreSQL (optional)
│   │   └── redis.container           # Redis (optional)
│   └── staging/
│       ├── app.container
│       ├── postgres.container
│       └── redis.container
└── README.md                         # Deployment instructions
```

## Quick Start

### 1. Start the API Server

```bash
# Navigate to API directory
cd /Users/admin/new_project/codeb-server/api

# Install dependencies
npm install

# Start server
npm start
```

Server runs on **http://localhost:3200**

### 2. Create Your First Project

#### Using CLI (Recommended)

```bash
# Interactive mode
we project create

# Non-interactive mode
we project create my-app \
  --type nextjs \
  --database \
  --redis \
  --git-repo https://github.com/user/my-app
```

#### Using cURL

```bash
curl -X POST http://localhost:3200/api/project/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-app",
    "type": "nextjs",
    "database": true,
    "redis": true
  }'
```

### 3. Deploy Your Project

Generated files are automatically saved to your current directory. Simply:

```bash
# Add to git
git add .

# Commit
git commit -m "Add CodeB infrastructure"

# Push to trigger deployment
git push origin main
```

GitHub Actions will:
1. **Build** on GitHub-hosted runner
2. **Push** to ghcr.io (GitHub Container Registry)
3. **Deploy** via self-hosted runner on your server

## Architecture

### Hybrid CI/CD Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  Developer                                                   │
│  git push origin main                                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub Actions (GitHub-hosted runner)                       │
│  - Checkout code                                             │
│  - Build Docker image                                        │
│  - Push to ghcr.io                                           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Self-hosted Runner (on your server)                         │
│  - Pull image from ghcr.io                                   │
│  - Stop old containers                                       │
│  - Start new containers (Quadlet)                            │
│  - Update Caddy reverse proxy                                │
│  - Health check                                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Production                                                  │
│  https://my-app.codeb.kr                                     │
└─────────────────────────────────────────────────────────────┘
```

### Benefits

| Aspect | GitHub-hosted | Self-hosted |
|--------|---------------|-------------|
| **Build** | Free Actions minutes | - |
| **Resources** | Fast build servers | - |
| **Deploy** | - | Direct server access |
| **Security** | - | No SSH key management |
| **Speed** | - | Zero-downtime deployment |

## Project Types

### Next.js 14+ (`nextjs`)

Perfect for modern web applications with SSR/SSG.

**Features:**
- Standalone output (minimal Docker image)
- Automatic static optimization
- Image optimization built-in
- API routes support

**Example:**
```bash
we project create blog --type nextjs --database
```

**Generated Dockerfile:**
```dockerfile
# Multi-stage build
FROM node:20-alpine AS deps
# ... dependencies

FROM node:20-alpine AS builder
# ... build

FROM node:20-alpine AS runner
# ... minimal runtime
```

### Node.js (`nodejs`)

For backend APIs with Express, Fastify, or NestJS.

**Supported Frameworks:**
- Express
- Fastify
- Koa
- NestJS

**Example:**
```bash
we project create api --type nodejs --database --redis
```

### Python (`python`)

For Python backends with FastAPI or Flask.

**Supported Frameworks:**
- FastAPI
- Flask
- Django

**Example:**
```bash
we project create ml-api --type python --database
```

### Static Site (`static`)

For pre-built static sites served via Nginx.

**Use Cases:**
- Documentation sites
- Landing pages
- Pre-built SPAs

**Example:**
```bash
we project create docs --type static --no-database --no-redis
```

## Port Allocation

Ports are automatically allocated by SSOT registry to avoid conflicts.

### Port Ranges

| Environment | App Ports | PostgreSQL | Redis |
|-------------|-----------|------------|-------|
| **Staging** | 3000-3499 | 15432-15499 | 16379-16399 |
| **Production** | 4000-4499 | 25432-25499 | 26379-26399 |
| **Preview** | 5000-5999 | - | - |

### Example Allocation

```json
{
  "staging": {
    "app": 3001,
    "db": 15433,
    "redis": 16380
  },
  "production": {
    "app": 4001,
    "db": 25433,
    "redis": 26380
  }
}
```

## Environment Variables

Each project gets a `.env.example` with all necessary variables.

### Common Variables

```bash
NODE_ENV=production
PORT=3000
```

### Database Variables

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/myapp
POSTGRES_USER=myapp_user
POSTGRES_PASSWORD=change_me_in_production
POSTGRES_DB=myapp
```

### Redis Variables

```bash
REDIS_URL=redis://localhost:6379
REDIS_DB=0
```

### Next.js Specific

```bash
NEXT_PUBLIC_API_URL=https://myapp.codeb.kr
NEXTAUTH_SECRET=generate_with_openssl_rand_base64_32
NEXTAUTH_URL=https://myapp.codeb.kr
```

## CLI Commands

### `we project create`

Create a new project with auto-generated infrastructure.

**Interactive Mode:**
```bash
we project create
```

**Non-interactive Mode:**
```bash
we project create my-app \
  --type nextjs \
  --git-repo https://github.com/user/my-app \
  --database \
  --redis \
  --description "My awesome app" \
  --output ./my-app
```

**Options:**
- `-t, --type <type>`: Project type (nextjs|nodejs|python|static)
- `-g, --git-repo <url>`: Git repository URL
- `--database`: Include PostgreSQL (default: true)
- `--no-database`: Exclude PostgreSQL
- `--redis`: Include Redis (default: true)
- `--no-redis`: Exclude Redis
- `-d, --description <text>`: Project description
- `-o, --output <path>`: Output directory (default: current directory)
- `--no-save`: Don't save files to disk (API response only)

### `we project list`

List all registered projects.

```bash
we project list
```

**Output:**
```
Projects:
────────────────────────────────────────────────────────────────────────────────
1. my-app
   Type: nextjs
   Status: active
   Created: 12/19/2025
   Staging: https://my-app-staging.codeb.kr
   Production: https://my-app.codeb.kr

2. api-server
   Type: nodejs
   Status: active
   Created: 12/18/2025
   Production: https://api.codeb.kr
```

### `we project info <name>`

Get detailed project information.

```bash
we project info my-app
```

**Output:**
```
Project: my-app
════════════════════════════════════════════════════════════════════════════════

General:
  Type:       nextjs
  Status:     active
  Created:    12/19/2025, 10:00:00 AM
  Description: My awesome app

Environments:

  STAGING:
    URL:    https://my-app-staging.codeb.kr
    Status: running
    Ports:
      App:  3001
      DB:   15433
      Redis: 16380

  PRODUCTION:
    URL:    https://my-app.codeb.kr
    Status: running
    Ports:
      App:  4001
      DB:   25433
      Redis: 26380

Resources:
  ✓ PostgreSQL
  ✓ Redis
  ✓ Storage
```

### `we project types`

List available project types.

```bash
we project types
```

**Output:**
```
Available Project Types:
────────────────────────────────────────────────────────────────────────────────

1. Next.js 14+
   ID:          nextjs
   Default Port: 3000
   Health Check: /_next/health

2. Node.js (Express/Fastify)
   ID:          nodejs
   Default Port: 3000
   Health Check: /health

3. Python (FastAPI/Flask)
   ID:          python
   Default Port: 8000
   Health Check: /health

4. Static Site (Nginx)
   ID:          static
   Default Port: 80
   Health Check: /
```

### `we project delete <name>`

Delete a project (with confirmation).

```bash
# With confirmation
we project delete my-app

# Force delete (no confirmation)
we project delete my-app --force
```

## API Reference

### POST /api/project/create

Create a new project.

**Request:**
```json
{
  "name": "my-app",
  "type": "nextjs",
  "gitRepo": "https://github.com/user/my-app",
  "database": true,
  "redis": true,
  "description": "My awesome app"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "project": {
      "name": "my-app",
      "type": "nextjs",
      "createdAt": "2025-12-19T10:00:00.000Z"
    },
    "ports": {
      "staging": { "app": 3001, "db": 15433, "redis": 16380 },
      "production": { "app": 4001, "db": 25433, "redis": 26380 }
    },
    "files": {
      "Dockerfile": "...",
      ".github/workflows/deploy.yml": "...",
      "quadlet/production/app.container": "..."
    },
    "deployment": {
      "staging": {
        "url": "https://my-app-staging.codeb.kr",
        "port": 3001
      },
      "production": {
        "url": "https://my-app.codeb.kr",
        "port": 4001
      }
    }
  }
}
```

### GET /api/project/types

List available project types.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "nextjs",
      "name": "Next.js 14+",
      "port": 3000,
      "healthcheck": "/_next/health"
    }
  ]
}
```

### GET /api/project/:name

Get project details from SSOT.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "my-app",
    "type": "nextjs",
    "status": "active",
    "environments": {
      "staging": {
        "ports": { "app": 3001 },
        "domain": "my-app-staging.codeb.kr",
        "status": "running"
      }
    }
  }
}
```

### GET /api/health

Health check endpoint.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 12345.67,
    "version": "2.5.4"
  }
}
```

## Generated Files Explained

### Dockerfile

Multi-stage build for minimal production image:

```dockerfile
# Stage 1: Dependencies (cached)
FROM node:20-alpine AS deps
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Build
FROM node:20-alpine AS builder
RUN npm ci
RUN npm run build

# Stage 3: Runtime (minimal)
FROM node:20-alpine AS runner
COPY --from=builder /app/.next/standalone ./
CMD ["node", "server.js"]
```

**Benefits:**
- Layer caching for faster builds
- Minimal final image size
- Security (no build tools in production)

### GitHub Actions Workflow

Hybrid CI/CD with two jobs:

**Build Job (GitHub-hosted):**
```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:latest
```

**Deploy Job (Self-hosted):**
```yaml
  deploy:
    needs: build
    runs-on: self-hosted
    steps:
      - name: Pull image
        run: podman pull ghcr.io/${{ github.repository }}:latest

      - name: Deploy
        run: podman run -d ...
```

### Quadlet Files

Systemd-managed containers:

```ini
[Container]
ContainerName=my-app-production
Image=ghcr.io/user/my-app:latest
PublishPort=4001:3000

[Service]
Restart=always

[Install]
WantedBy=multi-user.target
```

**Managed by systemd:**
```bash
# Status
systemctl status my-app-production

# Logs
journalctl -u my-app-production -f

# Restart
systemctl restart my-app-production
```

## SSOT Integration

The Project Generator integrates with SSOT (Single Source of Truth) registry for:

### 1. Port Allocation

```javascript
// Automatic conflict detection
const ports = await ssotClient.allocatePorts('my-app');
// Returns: { staging: { app: 3001, db: 15433 }, ... }
```

### 2. Domain Management

```bash
# Auto-generated domains
Staging:    my-app-staging.codeb.kr
Production: my-app.codeb.kr
```

### 3. Resource Tracking

SSOT tracks:
- PostgreSQL databases per project
- Redis instances
- Storage volumes
- Environment variables

## Advanced Usage

### Custom Port Ranges

Override default port allocation:

```bash
we project create my-app \
  --staging-port 3100 \
  --production-port 4100 \
  --staging-db-port 15500 \
  --production-db-port 25500
```

### Multi-Environment Setup

Create separate environments:

```bash
# Development
we project create my-app-dev --type nextjs

# Staging
we project create my-app-staging --type nextjs

# Production
we project create my-app-prod --type nextjs
```

### Custom Domains

After project creation, set up custom domains:

```bash
# Setup domain
we domain setup myapp.com --project my-app --env production --ssl

# Setup with www
we domain setup myapp.com --www --ssl
```

## Troubleshooting

### Port Conflicts

If you get port allocation errors:

```bash
# Validate SSOT integrity
we ssot validate --fix

# Scan for port drift
we workflow port-drift --fix

# Manual port allocation
we project create my-app --staging-port 3200
```

### Build Failures

Check GitHub Actions logs:

```bash
# View workflow runs
gh run list

# View logs for specific run
gh run view <run-id> --log
```

### Container Issues

Check container status on server:

```bash
# SSH to server
ssh root@158.247.203.55

# Check containers
podman ps -a | grep my-app

# View logs
podman logs my-app-production

# Restart
systemctl restart my-app-production
```

### SSOT Sync Issues

Resync SSOT with server state:

```bash
# Sync SSOT
we ssot sync

# Validate
we ssot validate --fix
```

## Best Practices

### 1. Use Semantic Versioning

Tag your releases:

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions will build with tag:

```
ghcr.io/user/my-app:v1.0.0
ghcr.io/user/my-app:latest
```

### 2. Environment-Specific Configs

Use different configs per environment:

```
.env.staging      # Staging config
.env.production   # Production config
```

### 3. Health Checks

Always implement health checks:

**Next.js:**
```javascript
// pages/api/health.js
export default function handler(req, res) {
  res.status(200).json({ status: 'ok' });
}
```

**Express:**
```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
```

### 4. Database Migrations

Run migrations before deployment:

```yaml
# .github/workflows/deploy.yml
- name: Run migrations
  run: |
    podman exec my-app-production npm run migrate
```

### 5. Secrets Management

Use GitHub Secrets for sensitive data:

```bash
# Set secrets
gh secret set DATABASE_PASSWORD --body "secret123"
gh secret set API_KEY --body "key123"
```

Reference in workflow:

```yaml
Environment=DATABASE_PASSWORD=${{ secrets.DATABASE_PASSWORD }}
```

## Migration Guide

### From Docker Compose

If you're using Docker Compose:

**Before:**
```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
  db:
    image: postgres:16
```

**After (Generated Quadlet):**
```ini
[Container]
ContainerName=my-app
Image=ghcr.io/user/my-app:latest
PublishPort=4001:3000

[Service]
Restart=always
```

**Benefits:**
- Systemd integration
- Better logging (journald)
- Automatic restarts
- Resource limits

### From Manual Deployment

If you're deploying manually:

**Before:**
```bash
# SSH to server
ssh root@server

# Pull code
cd /opt/myapp && git pull

# Build
docker build -t myapp .

# Run
docker run -d -p 3000:3000 myapp
```

**After:**
```bash
# Just push to GitHub
git push origin main

# GitHub Actions handles everything
```

## Roadmap

### v2.6 (Next Release)
- [ ] API key authentication
- [ ] Rate limiting
- [ ] Webhook support for deployment events
- [ ] Custom template support

### v2.7
- [ ] Multi-server deployment
- [ ] Blue-green deployments
- [ ] Canary deployments
- [ ] A/B testing support

### v2.8
- [ ] GraphQL API
- [ ] WebSocket support
- [ ] Custom build commands
- [ ] Docker BuildKit cache mounts

### v3.0
- [ ] Kubernetes support
- [ ] Terraform provider
- [ ] CLI plugins system
- [ ] Visual project builder

## Support

### Documentation
- **API Reference:** `/api/openapi.yaml`
- **CLI Reference:** `we help project`
- **Architecture:** `/docs/ARCHITECTURE.md`

### Getting Help
- **GitHub Issues:** https://github.com/codeblabdev-max/codeb-server/issues
- **Discord:** https://discord.gg/codeb
- **Email:** support@codeb.kr

### Contributing
See `CONTRIBUTING.md` for development setup and guidelines.

---

**Built with ❤️ by CodeB Team**
