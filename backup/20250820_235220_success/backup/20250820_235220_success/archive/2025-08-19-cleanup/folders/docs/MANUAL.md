# CodeB - Complete User Manual

## Table of Contents

1. [Introduction](#introduction)
2. [System Architecture](#system-architecture)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [CLI Reference](#cli-reference)
6. [API Reference](#api-reference)
7. [Project Management](#project-management)
8. [Deployment](#deployment)
9. [Database Management](#database-management)
10. [Environment Variables](#environment-variables)
11. [Security](#security)
12. [Troubleshooting](#troubleshooting)
13. [Best Practices](#best-practices)

---

## 1. Introduction

CodeB is a comprehensive project management system designed to simplify the deployment and management of containerized applications. It provides:

- **Isolated Project Environments**: Each project runs in its own Podman pod with dedicated PostgreSQL and Redis instances
- **Automated Deployment**: Git-based CI/CD pipeline with automatic builds and deployments
- **SSL Management**: Automatic SSL certificate generation and renewal with Caddy
- **Multi-User Support**: API key-based authentication for team collaboration
- **CLI Tool**: Powerful command-line interface for all operations
- **RESTful API**: Complete API for integration with other tools

### Key Features

- 🚀 **Quick Project Setup**: Create new projects in seconds
- 🔒 **Secure by Default**: SSL, isolated environments, encrypted secrets
- 📦 **Container-Based**: Uses Podman for rootless container management
- 🌐 **Domain Management**: Automatic DNS configuration with Caddy
- 💾 **Backup & Restore**: Automated backup of databases and files
- 🔑 **API Key Authentication**: Secure multi-user access
- 📊 **Resource Monitoring**: Track CPU, memory, and disk usage
- 🔄 **Git Integration**: Deploy directly from Git repositories

---

## 2. System Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                     CodeB System                         │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐     ┌──────────────┐                  │
│  │   CLI Tool   │────▶│  Remix API   │                  │
│  └──────────────┘     └──────────────┘                  │
│                              │                           │
│                              ▼                           │
│  ┌──────────────────────────────────────────────┐       │
│  │              Service Layer                    │       │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐      │       │
│  │  │ Project │  │ Podman  │  │  Caddy  │      │       │
│  │  │ Service │  │ Service │  │ Service │      │       │
│  │  └─────────┘  └─────────┘  └─────────┘      │       │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐      │       │
│  │  │   Git   │  │   DB    │  │  Auth   │      │       │
│  │  │ Service │  │ Service │  │ Service │      │       │
│  │  └─────────┘  └─────────┘  └─────────┘      │       │
│  └──────────────────────────────────────────────┘       │
│                              │                           │
│                              ▼                           │
│  ┌──────────────────────────────────────────────┐       │
│  │            Container Runtime (Podman)         │       │
│  │  ┌─────────────────────────────────────┐     │       │
│  │  │         Project Pod                  │     │       │
│  │  │  ┌──────┐ ┌──────────┐ ┌────────┐  │     │       │
│  │  │  │ App  │ │PostgreSQL│ │ Redis  │  │     │       │
│  │  │  └──────┘ └──────────┘ └────────┘  │     │       │
│  │  └─────────────────────────────────────┘     │       │
│  └──────────────────────────────────────────────┘       │
│                                                           │
│  ┌──────────────────────────────────────────────┐       │
│  │           Storage Layer                       │       │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐     │       │
│  │  │ Database │ │  Files   │ │  Backups │     │       │
│  │  └──────────┘ └──────────┘ └──────────┘     │       │
│  └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

### Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Remix (React-based full-stack framework)
- **Database**: JSON file storage (lightweight) or PostgreSQL
- **Cache**: Redis
- **Containers**: Podman (rootless containers)
- **Web Server**: Caddy (automatic HTTPS)
- **Process Manager**: PM2 or systemd
- **Authentication**: JWT with API keys

---

## 3. Installation

### Prerequisites

- Linux server (Ubuntu 20.04+, Debian 11+, RHEL 8+)
- Root or sudo access
- 2GB+ RAM
- 20GB+ disk space
- Domain name (for SSL)

### Quick Install (Server)

```bash
# Download and run installation script
curl -fsSL https://raw.githubusercontent.com/yourusername/codeb/main/install.sh -o install.sh
chmod +x install.sh
sudo ./install.sh
```

### Manual Installation

#### Step 1: Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y \
  curl git build-essential \
  nginx certbot python3-certbot-nginx \
  postgresql postgresql-contrib \
  redis-server podman

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2
```

#### Step 2: Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

#### Step 3: Create System User

```bash
sudo useradd -r -s /bin/bash -m -d /home/codeb codeb
```

#### Step 4: Install CodeB

```bash
# Create directories
sudo mkdir -p /opt/codeb
sudo mkdir -p /var/lib/codeb/{projects,postgres,redis,backups}
sudo mkdir -p /var/log/codeb

# Clone repository
cd /opt
sudo git clone https://github.com/yourusername/codeb-server.git codeb
sudo chown -R codeb:codeb /opt/codeb

# Install dependencies
cd /opt/codeb/codeb-remix
sudo -u codeb npm install
sudo -u codeb npm run build
```

#### Step 5: Configure Environment

```bash
# Create .env file
sudo -u codeb cat > /opt/codeb/codeb-remix/.env << EOF
NODE_ENV=production
PORT=3000
DATABASE_PATH=/var/lib/codeb/database.json
STORAGE_PATH=/var/lib/codeb
JWT_SECRET=$(openssl rand -base64 32)
EOF
```

#### Step 6: Setup Service

```bash
# Create systemd service
sudo cat > /etc/systemd/system/codeb.service << EOF
[Unit]
Description=CodeB Server
After=network.target

[Service]
Type=simple
User=codeb
WorkingDirectory=/opt/codeb/codeb-remix
ExecStart=/usr/bin/node /opt/codeb/codeb-remix/build/server/index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable codeb
sudo systemctl start codeb
```

#### Step 7: Configure Caddy

```bash
# Edit Caddyfile
sudo nano /etc/caddy/Caddyfile

# Add:
your-domain.com {
    reverse_proxy localhost:3000
}

# Restart Caddy
sudo systemctl restart caddy
```

#### Step 8: Initialize Admin Key

```bash
# Create initial admin API key
curl -X POST http://localhost:3000/api/auth/init

# Save the returned API key securely!
```

### Local Development Setup

```bash
# Clone repository
git clone https://github.com/yourusername/codeb-server.git
cd codeb-server

# Run setup script
chmod +x setup-local.sh
./setup-local.sh

# Or manually:
cd codeb-remix && npm install && npm run build
cd ../codeb-cli && npm install && npm link
```

---

## 4. Configuration

### Server Configuration

The server is configured via environment variables in `.env` file:

```env
# Server
NODE_ENV=production
PORT=3000

# Database
DATABASE_PATH=/var/lib/codeb/database.json

# Storage
STORAGE_PATH=/var/lib/codeb
GIT_REPOS_PATH=/var/lib/codeb/repositories

# Security
JWT_SECRET=your-secret-key

# Podman
PODMAN_SOCKET=/run/podman/podman.sock

# Caddy
CADDY_API_URL=http://localhost:2019
```

### CLI Configuration

Configure the CLI tool:

```bash
# Initialize configuration
codeb config init

# Or set individual values
codeb config set server https://your-server.com
codeb config set apiKey cb_your-api-key
```

Configuration file location: `~/.codeb/config.json`

```json
{
  "server": "https://your-server.com",
  "apiKey": "cb_your-api-key",
  "defaultEnvironment": "production",
  "outputFormat": "table"
}
```

### Multi-Server Configuration

```bash
# Add server profiles
codeb config:server:add staging https://staging.example.com cb_staging_key
codeb config:server:add production https://prod.example.com cb_prod_key

# Switch between servers
codeb config:server:use staging
codeb config:server:use production

# List servers
codeb config:server:list
```

---

## 5. CLI Reference

### Global Options

```bash
codeb [command] [options]

Options:
  -h, --help       Show help
  -v, --version    Show version
  --json           Output in JSON format
  --quiet          Suppress output
  --verbose        Verbose output
  --no-color       Disable colored output
```

### Project Commands

```bash
# List projects
codeb project list [options]
  --all            Show all projects including stopped
  --format table   Output format (table|json|yaml)

# Create project
codeb project create <name> [options]
  --git <url>      Git repository URL
  --domain <domain> Domain name
  --template <type> Template (node|remix|next|python|go)
  --db <type>      Database (postgres|mysql|none)
  --cache          Enable Redis cache
  --ssl            Enable SSL

# Delete project
codeb project delete <name> [options]
  --force          Skip confirmation

# Clone project
codeb project clone <source> <target> [options]
  --skip-data      Don't copy data

# Project status
codeb project status <name>

# Start/Stop/Restart
codeb project start <name>
codeb project stop <name> [--graceful]
codeb project restart <name>

# Recreate project
codeb project recreate <name>

# View logs
codeb project logs <name> [options]
  --tail <n>       Number of lines
  --follow         Follow logs
  --container <name> Specific container

# Execute command
codeb project exec <name> <command>
  --container <name> Target container

# Backup project
codeb project backup <name>

# Restore project
codeb project restore <name> <backup-id>
```

### Deploy Commands

```bash
# Deploy from Git
codeb deploy <project> [options]
  --branch <name>  Branch to deploy
  --force          Force deployment

# List deployments
codeb deploy list <project>

# Rollback deployment
codeb deploy rollback <project> [deployment-id]

# View deployment logs
codeb deploy logs <project> <deployment-id>
```

### Database Commands

```bash
# List databases
codeb db list

# Backup database
codeb db backup <project>

# Restore database
codeb db restore <project> <backup-file>

# Execute SQL
codeb db exec <project> <query>
codeb db exec <project> --file <sql-file>

# Database console
codeb db console <project>

# Import/Export
codeb db import <project> <file>
codeb db export <project> [output-file]
```

### Environment Variables

```bash
# List variables
codeb env list <project>

# Set variable
codeb env set <project> <key> <value>

# Get variable
codeb env get <project> <key>

# Delete variable
codeb env delete <project> <key>

# Import from file
codeb env import <project> <env-file>

# Export to file
codeb env export <project> [output-file]
```

### Configuration Commands

```bash
# Initialize config
codeb config init

# Show config
codeb config show [--json]

# Set config value
codeb config set <key> <value>

# Reset config
codeb config reset [--force]

# Test connection
codeb config test
```

### API Key Management

```bash
# Generate API key (requires admin key)
codeb auth:key:create <name> [options]
  --permissions <level>  read|write|admin
  --expires <days>       Expiry in days

# List API keys
codeb auth:key:list

# Revoke API key
codeb auth:key:revoke <key-id>

# View key details
codeb auth:key:info <key-id>
```

---

## 6. API Reference

### Authentication

All API requests require authentication via API key:

```bash
# Header authentication
Authorization: Bearer cb_your-api-key
X-API-Key: cb_your-api-key

# Query parameter
?api_key=cb_your-api-key
```

### Base URL

```
https://your-server.com/api
```

### Endpoints

#### Projects

```http
# List projects
GET /api/projects
Query: ?all=true

# Get project details
GET /api/projects/:name

# Create project
POST /api/projects
Body: {
  "name": "myapp",
  "git": "https://github.com/user/repo.git",
  "domain": "myapp.example.com",
  "template": "remix",
  "database": "postgres",
  "cache": true,
  "ssl": true
}

# Update project
PATCH /api/projects/:name
Body: { "domain": "new-domain.com" }

# Delete project
DELETE /api/projects/:name

# Project actions
POST /api/projects/:name/:action
Actions: start, stop, restart, recreate
```

#### Deployments

```http
# List deployments
GET /api/projects/:name/deployments

# Create deployment
POST /api/projects/:name/deployments
Body: { "branch": "main" }

# Get deployment details
GET /api/projects/:name/deployments/:id

# Rollback deployment
POST /api/projects/:name/deployments/:id/rollback
```

#### Environment Variables

```http
# List variables
GET /api/projects/:name/env

# Set variables
POST /api/projects/:name/env
Body: { "KEY": "value", "KEY2": "value2" }

# Delete variable
DELETE /api/projects/:name/env/:key
```

#### Database

```http
# Backup database
POST /api/projects/:name/database/backup

# List backups
GET /api/projects/:name/database/backups

# Restore backup
POST /api/projects/:name/database/restore
Body: { "backupId": "backup-123" }

# Execute query
POST /api/projects/:name/database/query
Body: { "query": "SELECT * FROM users" }
```

#### Authentication

```http
# Initialize admin key (localhost only)
POST /api/auth/init

# List API keys (admin only)
GET /api/auth/keys

# Create API key (admin only)
POST /api/auth/keys
Body: {
  "name": "Developer Key",
  "permissions": "write",
  "expiresInDays": 30
}

# Revoke API key (admin only)
DELETE /api/auth/keys/:id
```

#### System

```http
# Health check
GET /api/health

# System stats
GET /api/system/stats

# Version info
GET /api/system/version
```

### Response Format

```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

### Error Format

```json
{
  "success": false,
  "error": "Error message",
  "details": { ... }
}
```

### Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

---

## 7. Project Management

### Creating Projects

#### Basic Project

```bash
codeb project create myapp
```

#### With Git Repository

```bash
codeb project create myapp \
  --git https://github.com/user/myapp.git \
  --domain myapp.example.com \
  --template remix
```

#### Complex Project

```bash
codeb project create enterprise-app \
  --git git@github.com:company/app.git \
  --domain app.company.com \
  --template node \
  --db postgres \
  --cache \
  --ssl
```

### Project Templates

Available templates:
- `node` - Basic Node.js application
- `remix` - Remix full-stack application
- `next` - Next.js application
- `python` - Python application
- `go` - Go application

### Project Lifecycle

```bash
# 1. Create project
codeb project create myapp --template remix

# 2. Configure environment
codeb env set myapp DATABASE_URL postgresql://...
codeb env set myapp REDIS_URL redis://...

# 3. Deploy
codeb deploy myapp --branch main

# 4. Monitor
codeb project status myapp
codeb project logs myapp --follow

# 5. Backup
codeb project backup myapp

# 6. Scale/Update
codeb project recreate myapp
```

### Managing Multiple Projects

```bash
# List all projects
codeb project list --all

# Batch operations
for project in $(codeb project list --json | jq -r '.[].name'); do
  codeb project backup $project
done

# Stop all projects
codeb project list --json | jq -r '.[].name' | xargs -I {} codeb project stop {}
```

---

## 8. Deployment

### Git-Based Deployment

#### Setup

1. Add deploy key to your repository
2. Configure webhook (optional)
3. Set repository URL

```bash
codeb project create myapp --git https://github.com/user/repo.git
```

#### Manual Deployment

```bash
# Deploy latest from main branch
codeb deploy myapp

# Deploy specific branch
codeb deploy myapp --branch feature/new-feature

# Force deployment (skip cache)
codeb deploy myapp --force
```

#### Automatic Deployment

Configure webhook in your Git provider:

```
URL: https://your-server.com/api/webhooks/github
Secret: your-webhook-secret
Events: push, pull_request
```

### Deployment Process

1. **Pull**: Fetch latest code from Git
2. **Build**: Install dependencies and build
3. **Test**: Run tests (optional)
4. **Deploy**: Update container
5. **Health Check**: Verify deployment
6. **Rollback**: Automatic on failure

### Rollback

```bash
# List deployments
codeb deploy list myapp

# Rollback to previous
codeb deploy rollback myapp

# Rollback to specific deployment
codeb deploy rollback myapp deployment-123
```

### Zero-Downtime Deployment

CodeB ensures zero-downtime deployments by:
1. Building new container alongside old
2. Health checking new container
3. Switching traffic to new container
4. Removing old container

---

## 9. Database Management

### Backup Strategy

#### Automatic Backups

Configured in project settings:
- Daily backups at 2 AM
- Keep last 7 daily backups
- Keep last 4 weekly backups
- Keep last 3 monthly backups

#### Manual Backups

```bash
# Create backup
codeb db backup myapp

# List backups
codeb db list-backups myapp

# Restore backup
codeb db restore myapp backup-2024-01-15
```

### Database Operations

#### Connect to Database

```bash
# Open database console
codeb db console myapp

# Execute query
codeb db exec myapp "SELECT * FROM users LIMIT 10"

# Execute from file
codeb db exec myapp --file migration.sql
```

#### Import/Export

```bash
# Export database
codeb db export myapp myapp-backup.sql

# Import database
codeb db import myapp data.sql

# Export as CSV
codeb db export myapp --format csv --table users users.csv
```

### Database Migrations

```bash
# Run migrations
codeb db migrate myapp

# Rollback migration
codeb db migrate:rollback myapp

# Create migration
codeb db migrate:create myapp add_users_table
```

---

## 10. Environment Variables

### Managing Variables

#### Set Variables

```bash
# Set single variable
codeb env set myapp NODE_ENV production

# Set multiple variables
codeb env set myapp \
  DATABASE_URL=postgresql://... \
  REDIS_URL=redis://... \
  SECRET_KEY=abc123
```

#### Environment Files

```bash
# Import from .env file
codeb env import myapp .env.production

# Export to file
codeb env export myapp > .env.backup
```

### Variable Encryption

Sensitive variables are encrypted at rest:

```bash
# Mark variable as secret
codeb env set myapp API_KEY abc123 --secret

# Secrets are masked in output
codeb env list myapp
# API_KEY: ********
```

### Environment Templates

Create reusable templates:

```bash
# Save current environment as template
codeb env export myapp --template production

# Apply template to new project
codeb env import newapp --template production
```

---

## 11. Security

### API Key Management

#### Key Permissions

- `read` - View projects and settings
- `write` - Create, update, delete projects
- `admin` - Full access including key management

#### Creating Keys

```bash
# Create read-only key for monitoring
codeb auth:key:create monitoring --permissions read

# Create developer key with 30-day expiry
codeb auth:key:create developer --permissions write --expires 30

# Create admin key
codeb auth:key:create admin --permissions admin
```

#### Key Rotation

```bash
# Regular rotation schedule
codeb auth:key:rotate --all --expires 90

# Rotate specific key
codeb auth:key:rotate key-123 --expires 30
```

### SSL/TLS

#### Automatic SSL with Caddy

SSL certificates are automatically obtained and renewed via Let's Encrypt:

```bash
codeb project create myapp --domain myapp.example.com --ssl
```

#### Custom Certificates

```bash
# Upload custom certificate
codeb ssl upload myapp \
  --cert /path/to/cert.pem \
  --key /path/to/key.pem
```

### Network Security

#### Firewall Rules

```bash
# Default ports
- 22   - SSH
- 80   - HTTP (redirects to HTTPS)
- 443  - HTTPS
- 3000 - API (internal only)
```

#### IP Whitelisting

```bash
# Whitelist IP for API access
codeb security whitelist add 203.0.113.0/24

# List whitelisted IPs
codeb security whitelist list
```

### Container Security

- Rootless Podman containers
- Isolated network per project
- Resource limits enforced
- Security scanning on build

---

## 12. Troubleshooting

### Common Issues

#### Cannot Connect to Server

```bash
# Check service status
systemctl status codeb

# Check logs
journalctl -u codeb -f

# Test API
curl http://localhost:3000/api/health
```

#### Authentication Failed

```bash
# Verify API key
codeb config test

# Check key permissions
codeb auth:key:info <key-id>

# Regenerate key if needed
codeb auth:key:create new-key --permissions admin
```

#### Deployment Failed

```bash
# Check deployment logs
codeb deploy logs myapp

# Check container logs
codeb project logs myapp

# Verify Git access
codeb project exec myapp "git pull"
```

#### Database Connection Issues

```bash
# Check database status
codeb db status myapp

# Test connection
codeb db exec myapp "SELECT 1"

# Restart database
codeb project restart myapp --container postgres
```

### Debug Mode

```bash
# Enable debug logging
export DEBUG=codeb:*
codeb project list

# Verbose output
codeb project create myapp --verbose

# Dry run
codeb deploy myapp --dry-run
```

### Log Locations

- Server logs: `/var/log/codeb/`
- Container logs: `podman logs project-<name>`
- Application logs: `/var/lib/codeb/projects/<name>/logs/`
- Caddy logs: `/var/log/caddy/`

### Health Checks

```bash
# System health
curl http://localhost:3000/api/health

# Project health
codeb project health myapp

# Database health
codeb db health myapp
```

---

## 13. Best Practices

### Project Organization

#### Naming Conventions

- Use lowercase letters and hyphens
- Prefix with environment: `prod-app`, `staging-app`
- Group related projects: `api-users`, `api-orders`

#### Resource Allocation

```bash
# Set resource limits
codeb project create myapp \
  --cpu-limit 2 \
  --memory-limit 2G \
  --disk-limit 10G
```

### Deployment Strategy

#### Blue-Green Deployment

```bash
# Create green environment
codeb project clone prod-app green-app

# Deploy to green
codeb deploy green-app

# Test green environment
# ...

# Switch traffic
codeb project swap prod-app green-app
```

#### Canary Deployment

```bash
# Deploy to canary
codeb deploy prod-app --canary 10%

# Monitor metrics
# ...

# Promote canary
codeb deploy prod-app --promote-canary
```

### Monitoring

#### Setup Monitoring

```bash
# Enable metrics collection
codeb project metrics enable myapp

# Configure alerts
codeb alerts create myapp \
  --metric cpu \
  --threshold 80 \
  --action email:admin@example.com
```

#### Regular Maintenance

```bash
# Weekly backup script
#!/bin/bash
for project in $(codeb project list --json | jq -r '.[].name'); do
  codeb project backup $project
  codeb db optimize $project
done

# Monthly cleanup
codeb system cleanup --older-than 30d
```

### Security Practices

1. **Regular Updates**
   ```bash
   # Update CodeB
   codeb system update
   
   # Update containers
   codeb project update --all
   ```

2. **Key Rotation**
   ```bash
   # Rotate API keys quarterly
   codeb auth:key:rotate --all --expires 90
   ```

3. **Audit Logging**
   ```bash
   # Enable audit logging
   codeb config set audit.enabled true
   
   # Review audit logs
   codeb audit logs --since 7d
   ```

4. **Backup Encryption**
   ```bash
   # Enable backup encryption
   codeb config set backup.encrypt true
   codeb config set backup.key <encryption-key>
   ```

### Performance Optimization

#### Database Optimization

```bash
# Analyze and optimize
codeb db analyze myapp
codeb db optimize myapp

# Configure connection pooling
codeb env set myapp DB_POOL_SIZE 20
```

#### Caching Strategy

```bash
# Enable Redis caching
codeb project create myapp --cache

# Configure cache settings
codeb env set myapp \
  REDIS_MAX_MEMORY=512mb \
  REDIS_EVICTION=allkeys-lru
```

#### CDN Integration

```bash
# Configure CDN
codeb cdn enable myapp \
  --provider cloudflare \
  --zone <zone-id>
```

---

## Appendix A: Environment Variables Reference

### Server Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | `3000` |
| `DATABASE_PATH` | Database file path | `/var/lib/codeb/database.json` |
| `STORAGE_PATH` | Storage directory | `/var/lib/codeb` |
| `JWT_SECRET` | JWT signing secret | (generated) |
| `CADDY_API_URL` | Caddy API endpoint | `http://localhost:2019` |
| `PODMAN_SOCKET` | Podman socket path | `/run/podman/podman.sock` |

### Project Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection | `postgresql://user:pass@localhost/db` |
| `REDIS_URL` | Redis connection | `redis://localhost:6379` |
| `NODE_ENV` | Node environment | `production` |
| `PORT` | Application port | `3000` |
| `SECRET_KEY` | Application secret | (generated) |

---

## Appendix B: CLI Commands Quick Reference

```bash
# Project Management
codeb project list                      # List all projects
codeb project create <name>             # Create new project
codeb project delete <name>             # Delete project
codeb project status <name>             # Project status
codeb project start/stop/restart <name> # Control project

# Deployment
codeb deploy <project>                  # Deploy project
codeb deploy list <project>             # List deployments
codeb deploy rollback <project>         # Rollback deployment

# Database
codeb db backup <project>               # Backup database
codeb db restore <project> <backup>     # Restore database
codeb db console <project>              # Database console

# Environment
codeb env list <project>                # List variables
codeb env set <project> <key> <value>   # Set variable
codeb env import <project> <file>       # Import from file

# Configuration
codeb config init                       # Initialize config
codeb config show                       # Show config
codeb config test                       # Test connection

# Authentication
codeb auth:key:create <name>            # Create API key
codeb auth:key:list                     # List API keys
codeb auth:key:revoke <id>              # Revoke API key
```

---

## Appendix C: API Endpoints Quick Reference

```http
# Projects
GET    /api/projects              # List projects
POST   /api/projects              # Create project
DELETE /api/projects/:name        # Delete project
POST   /api/projects/:name/start  # Start project
POST   /api/projects/:name/stop   # Stop project

# Deployments
GET    /api/projects/:name/deployments     # List deployments
POST   /api/projects/:name/deployments     # Create deployment
POST   /api/deployments/:id/rollback       # Rollback

# Environment
GET    /api/projects/:name/env             # List variables
POST   /api/projects/:name/env             # Set variables
DELETE /api/projects/:name/env/:key        # Delete variable

# Database
POST   /api/projects/:name/database/backup   # Backup
POST   /api/projects/:name/database/restore  # Restore
POST   /api/projects/:name/database/query    # Execute query

# Authentication
POST   /api/auth/init              # Initialize admin key
GET    /api/auth/keys              # List API keys
POST   /api/auth/keys              # Create API key
DELETE /api/auth/keys/:id          # Delete API key
```

---

## Support and Resources

- **Documentation**: https://docs.codeb.io
- **GitHub**: https://github.com/yourusername/codeb
- **Issues**: https://github.com/yourusername/codeb/issues
- **Discord**: https://discord.gg/codeb
- **Email**: support@codeb.io

---

## License

CodeB is open source software licensed under the MIT License.

---

*Last updated: January 2024*
*Version: 1.0.0*