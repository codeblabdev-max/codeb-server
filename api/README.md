# CodeB Project Generator API

Auto-generate complete project infrastructure with a single API call.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CodeB Project Generator API (Port 3200)                     │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────┐
        │  SSOT Registry (Port 3102)      │
        │  - Port Allocation              │
        │  - Domain Management            │
        │  - Resource Tracking            │
        └─────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────┐
        │  Generated Files                │
        │  - Dockerfile                   │
        │  - GitHub Actions Workflow      │
        │  - Quadlet Files                │
        │  - .env.example                 │
        └─────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────┐
        │  Deployment Targets             │
        │  - Staging: app-staging.one-q.xyz│
        │  - Production: app.one-q.xyz    │
        └─────────────────────────────────┘
```

## Quick Start

### 1. Start the API Server

```bash
cd /Users/admin/new_project/codeb-server/api
npm install
node project-generator.js
```

### 2. Create a Project

```bash
curl -X POST http://localhost:3200/api/project/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-app",
    "type": "nextjs",
    "gitRepo": "https://github.com/user/my-app",
    "database": true,
    "redis": true
  }'
```

### 3. Deploy Using Generated Files

```bash
# Copy generated files to your repository
# Push to GitHub
git add .
git commit -m "Add CodeB infrastructure"
git push origin main

# GitHub Actions will automatically:
# 1. Build on GitHub-hosted runner
# 2. Push to ghcr.io
# 3. Deploy to server using self-hosted runner
```

## API Reference

### POST /api/project/create

Create a new project with complete infrastructure.

**Request Body:**

```json
{
  "name": "my-app",               // Required: Project name
  "type": "nextjs",               // Optional: nextjs|nodejs|python|static
  "gitRepo": "https://...",       // Optional: Git repository URL
  "server": "app",                // Optional: Target server
  "database": true,               // Optional: Include PostgreSQL
  "redis": true,                  // Optional: Include Redis
  "description": "My awesome app" // Optional: Project description
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
      "gitRepo": "https://...",
      "description": "My awesome app",
      "createdAt": "2025-12-19T10:00:00.000Z"
    },
    "ports": {
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
    },
    "files": {
      "Dockerfile": "...",
      ".github/workflows/deploy.yml": "...",
      ".env.example": "...",
      "quadlet/production/app.container": "...",
      "quadlet/staging/app.container": "...",
      "quadlet/production/postgres.container": "...",
      "quadlet/staging/postgres.container": "...",
      "quadlet/production/redis.container": "...",
      "quadlet/staging/redis.container": "..."
    },
    "deployment": {
      "staging": {
        "url": "https://my-app-staging.one-q.xyz",
        "port": 3001
      },
      "production": {
        "url": "https://my-app.one-q.xyz",
        "port": 4001
      }
    }
  },
  "meta": {
    "timestamp": "2025-12-19T10:00:00.000Z",
    "version": "2.5.4"
  }
}
```

### GET /api/project/types

List all available project types.

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
    },
    {
      "id": "nodejs",
      "name": "Node.js (Express/Fastify)",
      "port": 3000,
      "healthcheck": "/health"
    },
    {
      "id": "python",
      "name": "Python (FastAPI/Flask)",
      "port": 8000,
      "healthcheck": "/health"
    },
    {
      "id": "static",
      "name": "Static Site (Nginx)",
      "port": 80,
      "healthcheck": "/"
    }
  ]
}
```

### GET /api/project/:name

Get project details from SSOT registry.

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "my-app",
    "type": "nextjs",
    "status": "active",
    "createdAt": "2025-12-19T10:00:00.000Z",
    "environments": {
      "staging": {
        "ports": { "app": 3001, "db": 15433, "redis": 16380 },
        "domain": "my-app-staging.one-q.xyz",
        "status": "running"
      },
      "production": {
        "ports": { "app": 4001, "db": 25433, "redis": 26380 },
        "domain": "my-app.one-q.xyz",
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
    "timestamp": "2025-12-19T10:00:00.000Z",
    "version": "2.5.4"
  }
}
```

### GET /api/docs

OpenAPI 3.0 specification.

## Project Types

### Next.js 14+ (`nextjs`)

- **Base Image:** node:20-alpine
- **Build:** Multi-stage with standalone output
- **Port:** 3000
- **Health Check:** `/_next/health`
- **Features:**
  - Automatic static optimization
  - Image optimization
  - API routes support
  - ISR/SSG/SSR support

**Generated Dockerfile:**
- Stage 1: Install dependencies
- Stage 2: Build application
- Stage 3: Run standalone output (minimal size)

### Node.js (`nodejs`)

- **Base Image:** node:20-alpine
- **Port:** 3000
- **Health Check:** `/health`
- **Supported Frameworks:**
  - Express
  - Fastify
  - Koa
  - NestJS

### Python (`python`)

- **Base Image:** python:3.11-slim
- **Port:** 8000
- **Health Check:** `/health`
- **Supported Frameworks:**
  - FastAPI
  - Flask
  - Django

### Static Site (`static`)

- **Base Image:** nginx:alpine
- **Port:** 80
- **Health Check:** `/`
- **Use Cases:**
  - HTML/CSS/JS sites
  - Pre-built SPAs
  - Documentation sites

## Port Allocation Strategy

Ports are automatically allocated by SSOT registry:

| Environment | App Ports | PostgreSQL Ports | Redis Ports |
|-------------|-----------|------------------|-------------|
| Staging     | 3000-3499 | 15432-15499      | 16379-16399 |
| Production  | 4000-4499 | 25432-25499      | 26379-26399 |
| Preview     | 5000-5999 | -                | -           |

## Generated Files Structure

```
project/
├── Dockerfile                        # Multi-stage build
├── .github/
│   └── workflows/
│       └── deploy.yml                # Hybrid CI/CD workflow
├── .env.example                      # Environment template
├── quadlet/
│   ├── production/
│   │   ├── app.container             # App container
│   │   ├── postgres.container        # PostgreSQL (if enabled)
│   │   └── redis.container           # Redis (if enabled)
│   └── staging/
│       ├── app.container
│       ├── postgres.container
│       └── redis.container
└── README.md                         # Deployment instructions
```

## Hybrid CI/CD Workflow

### Build Phase (GitHub-hosted)

1. Checkout code
2. Build Docker image
3. Push to ghcr.io (GitHub Container Registry)

**Advantages:**
- Free GitHub Actions minutes
- Fast build servers
- No local resource usage

### Deploy Phase (Self-hosted)

1. Pull image from ghcr.io
2. Stop old containers
3. Start new containers via Quadlet
4. Update Caddy reverse proxy
5. Health check

**Advantages:**
- Direct server access
- No SSH key management
- Zero-downtime deployment

## CLI Integration

Use with CodeB CLI:

```bash
# Initialize project using API
we workflow init my-app --type nextjs --database --redis

# Behind the scenes:
# 1. Calls POST /api/project/create
# 2. Saves generated files to disk
# 3. Registers in SSOT
# 4. Sets up GitHub repository
```

## Environment Variables

Each generated project includes `.env.example` with:

### Common Variables

```bash
NODE_ENV=production
PORT=3000
```

### Database Variables (if enabled)

```bash
DATABASE_URL=postgresql://user:pass@host:port/db
POSTGRES_USER=myapp_user
POSTGRES_PASSWORD=change_me
POSTGRES_DB=myapp
```

### Redis Variables (if enabled)

```bash
REDIS_URL=redis://localhost:6379
REDIS_DB=0
```

### Next.js Specific

```bash
NEXT_PUBLIC_API_URL=https://myapp.one-q.xyz
NEXTAUTH_SECRET=generate_with_openssl
NEXTAUTH_URL=https://myapp.one-q.xyz
```

## SSOT Integration

The API integrates with SSOT Registry for:

1. **Port Allocation:**
   - Automatic conflict detection
   - Sequential allocation
   - Range enforcement

2. **Domain Management:**
   - Auto-generate subdomains
   - SSL certificate automation
   - Caddy configuration

3. **Resource Tracking:**
   - PostgreSQL databases
   - Redis instances
   - Storage volumes

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "timestamp": "2025-12-19T10:00:00.000Z"
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `MISSING_NAME` | Project name not provided |
| `INVALID_TYPE` | Unsupported project type |
| `PORT_CONFLICT` | Port already allocated |
| `PROJECT_EXISTS` | Project name already in use |
| `SSOT_ERROR` | SSOT registry error |
| `INTERNAL_ERROR` | Unexpected server error |

## Examples

### Create Next.js App with Database

```bash
curl -X POST http://localhost:3200/api/project/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "blog",
    "type": "nextjs",
    "gitRepo": "https://github.com/user/blog",
    "database": true,
    "redis": false
  }'
```

### Create Python API

```bash
curl -X POST http://localhost:3200/api/project/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "api-server",
    "type": "python",
    "database": true,
    "redis": true
  }'
```

### Create Static Site

```bash
curl -X POST http://localhost:3200/api/project/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "docs",
    "type": "static",
    "database": false,
    "redis": false
  }'
```

## Development

### Run Locally

```bash
cd /Users/admin/new_project/codeb-server/api
node project-generator.js
```

### Environment Variables

```bash
PORT=3200                          # API server port
SSOT_URL=http://localhost:3102     # SSOT registry URL
SERVER_HOST=158.247.203.55         # Deployment server
SERVER_USER=root                   # SSH user
```

### Testing

```bash
# Health check
curl http://localhost:3200/api/health

# List project types
curl http://localhost:3200/api/project/types

# Create test project
curl -X POST http://localhost:3200/api/project/create \
  -H "Content-Type: application/json" \
  -d '{"name":"test-app","type":"nextjs"}'
```

## Deployment

### Systemd Service

```ini
[Unit]
Description=CodeB Project Generator API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/codeb/api
ExecStart=/usr/bin/node project-generator.js
Restart=always
Environment=PORT=3200
Environment=SSOT_URL=http://localhost:3102

[Install]
WantedBy=multi-user.target
```

### Docker/Podman

```bash
podman run -d \
  --name codeb-project-api \
  -p 3200:3200 \
  -e SSOT_URL=http://localhost:3102 \
  -v /opt/codeb:/opt/codeb \
  node:20-alpine \
  node /app/project-generator.js
```

## Security

- **API Key Authentication:** Coming in v2.6
- **Rate Limiting:** 100 requests/minute per IP
- **Input Validation:** All inputs sanitized
- **CORS:** Configured for CodeB domains only

## Roadmap

- [ ] v2.6: API key authentication
- [ ] v2.7: Webhook support for deployment events
- [ ] v2.8: Template customization
- [ ] v2.9: Multi-server deployment
- [ ] v3.0: GraphQL API

## Support

- **Documentation:** https://codeb.io/docs/api
- **Issues:** https://github.com/codeblabdev-max/codeb-server/issues
- **Discord:** https://discord.gg/codeb
