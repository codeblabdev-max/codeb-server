#!/usr/bin/env node

/**
 * CodeB Project Generator API
 *
 * Auto-generates complete project infrastructure:
 * - Quadlet files (Container definitions)
 * - Dockerfile (Multi-stage builds)
 * - GitHub Actions (Hybrid CI/CD)
 * - Environment templates (.env.example)
 * - SSOT Registry (Port/domain allocation)
 *
 * Architecture:
 * - GitHub-hosted runners: Build & push to ghcr.io
 * - Self-hosted runners: Deploy via Quadlet + Podman
 * - SSOT Registry: Single source of truth for ports/domains
 *
 * @version 2.5.4
 */

import express from 'express';
import chalk from 'chalk';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';

// ============================================================================
// API Server Setup
// ============================================================================

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3200;
const SERVER_HOST = process.env.SERVER_HOST || '158.247.203.55';
const SERVER_USER = process.env.SERVER_USER || 'root';

// ============================================================================
// Project Templates
// ============================================================================

const PROJECT_TEMPLATES = {
  nextjs: {
    name: 'Next.js 14+',
    baseImage: 'node:20-alpine',
    buildCommand: 'npm run build',
    startCommand: 'npm start',
    port: 3000,
    healthcheck: '/_next/health',
    dependencies: ['npm install']
  },
  nodejs: {
    name: 'Node.js (Express/Fastify)',
    baseImage: 'node:20-alpine',
    buildCommand: 'npm run build',
    startCommand: 'npm start',
    port: 3000,
    healthcheck: '/health',
    dependencies: ['npm install']
  },
  python: {
    name: 'Python (FastAPI/Flask)',
    baseImage: 'python:3.11-slim',
    buildCommand: 'pip install -r requirements.txt',
    startCommand: 'python main.py',
    port: 8000,
    healthcheck: '/health',
    dependencies: ['pip install -r requirements.txt']
  },
  static: {
    name: 'Static Site (Nginx)',
    baseImage: 'nginx:alpine',
    buildCommand: null,
    startCommand: null,
    port: 80,
    healthcheck: '/',
    dependencies: []
  }
};

// ============================================================================
// Port Allocation Strategy (SSOT Compatible)
// ============================================================================

const PORT_RANGES = {
  staging: {
    app: { start: 3000, end: 3499 },
    db: { start: 15432, end: 15499 },
    redis: { start: 16379, end: 16399 }
  },
  production: {
    app: { start: 4000, end: 4499 },
    db: { start: 25432, end: 25499 },
    redis: { start: 26379, end: 26399 }
  },
  preview: {
    app: { start: 5000, end: 5999 }
  }
};

// ============================================================================
// Template Generators
// ============================================================================

/**
 * Generate Dockerfile based on project type
 */
function generateDockerfile(type, options = {}) {
  const template = PROJECT_TEMPLATES[type];

  if (type === 'nextjs') {
    return `# CodeB Auto-Generated Dockerfile - Next.js 14+ Standalone
# Multi-stage build for minimal production image

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY . .

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
`;
  }

  if (type === 'nodejs') {
    return `# CodeB Auto-Generated Dockerfile - Node.js
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build || true

# Production stage
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

COPY --from=builder /app/package*.json ./
RUN npm ci --only=production

COPY --from=builder --chown=nodejs:nodejs /app .

USER nodejs

EXPOSE ${template.port}

CMD ["npm", "start"]
`;
  }

  if (type === 'python') {
    return `# CodeB Auto-Generated Dockerfile - Python
FROM python:3.11-slim AS builder

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Production stage
FROM python:3.11-slim

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY . .

ENV PYTHONUNBUFFERED=1

EXPOSE ${template.port}

CMD ["python", "main.py"]
`;
  }

  if (type === 'static') {
    return `# CodeB Auto-Generated Dockerfile - Static Site
FROM nginx:alpine

COPY . /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
`;
  }

  throw new Error(`Unknown project type: ${type}`);
}

/**
 * Generate GitHub Actions workflow (Hybrid CI/CD)
 */
function generateGitHubActions(projectName, type, ports, options = {}) {
  const { database = true, redis = true } = options;

  return `name: Deploy ${projectName}

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: \${{ github.repository }}

jobs:
  # ============================================================================
  # Build Job (GitHub-hosted runner)
  # ============================================================================
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    outputs:
      image_tag: \${{ steps.meta.outputs.tags }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ============================================================================
  # Deploy Job (Self-hosted runner on server)
  # ============================================================================
  deploy:
    needs: build
    runs-on: self-hosted
    if: github.event_name == 'push'

    steps:
      - name: Determine environment
        id: env
        run: |
          if [[ "\${{ github.ref }}" == "refs/heads/main" ]]; then
            echo "environment=production" >> $GITHUB_OUTPUT
            echo "app_port=${ports.production.app}" >> $GITHUB_OUTPUT
            echo "db_port=${ports.production.db}" >> $GITHUB_OUTPUT
            echo "redis_port=${ports.production.redis}" >> $GITHUB_OUTPUT
            echo "domain=${projectName}.codeb.kr" >> $GITHUB_OUTPUT
          else
            echo "environment=staging" >> $GITHUB_OUTPUT
            echo "app_port=${ports.staging.app}" >> $GITHUB_OUTPUT
            echo "db_port=${ports.staging.db}" >> $GITHUB_OUTPUT
            echo "redis_port=${ports.staging.redis}" >> $GITHUB_OUTPUT
            echo "domain=${projectName}-staging.codeb.kr" >> $GITHUB_OUTPUT
          fi

      - name: Pull Docker image
        run: |
          echo "\${{ secrets.GITHUB_TOKEN }}" | podman login ghcr.io -u \${{ github.actor }} --password-stdin
          podman pull \${{ needs.build.outputs.image_tag }}

      - name: Stop existing container
        continue-on-error: true
        run: |
          podman stop ${projectName}-\${{ steps.env.outputs.environment }} || true
          podman rm ${projectName}-\${{ steps.env.outputs.environment }} || true

${database ? `      - name: Ensure PostgreSQL is running
        run: |
          podman run -d --name ${projectName}-postgres-\${{ steps.env.outputs.environment }} \\
            --pod ${projectName}-pod \\
            -e POSTGRES_USER=${projectName}_user \\
            -e POSTGRES_PASSWORD=\${{ secrets.DB_PASSWORD }} \\
            -e POSTGRES_DB=${projectName}_\${{ steps.env.outputs.environment }} \\
            -v ${projectName}-postgres-data:/var/lib/postgresql/data \\
            --health-cmd "pg_isready -U ${projectName}_user" \\
            --health-interval 10s \\
            postgres:16-alpine || true
` : ''}
${redis ? `      - name: Ensure Redis is running
        run: |
          podman run -d --name ${projectName}-redis-\${{ steps.env.outputs.environment }} \\
            --pod ${projectName}-pod \\
            -v ${projectName}-redis-data:/data \\
            redis:7-alpine || true
` : ''}
      - name: Start application container
        run: |
          podman run -d \\
            --name ${projectName}-\${{ steps.env.outputs.environment }} \\
            --pod ${projectName}-pod \\
            -p \${{ steps.env.outputs.app_port }}:3000 \\
${database ? `            -e DATABASE_URL="postgresql://${projectName}_user:\${{ secrets.DB_PASSWORD }}@localhost:\${{ steps.env.outputs.db_port }}/${projectName}_\${{ steps.env.outputs.environment }}" \\` : ''}
${redis ? `            -e REDIS_URL="redis://localhost:\${{ steps.env.outputs.redis_port }}" \\` : ''}
            -e NODE_ENV=\${{ steps.env.outputs.environment }} \\
            --restart unless-stopped \\
            \${{ needs.build.outputs.image_tag }}

      - name: Health check
        run: |
          sleep 10
          curl -f http://localhost:\${{ steps.env.outputs.app_port }}/health || exit 1

      - name: Update Caddy config
        run: |
          cat > /etc/caddy/sites/${projectName}-\${{ steps.env.outputs.environment }}.caddy << EOF
          \${{ steps.env.outputs.domain }} {
            reverse_proxy localhost:\${{ steps.env.outputs.app_port }}
            encode gzip
            log {
              output file /var/log/caddy/${projectName}-\${{ steps.env.outputs.environment }}.log
            }
          }
          EOF
          systemctl reload caddy
`;
}

/**
 * Generate Quadlet container file
 */
function generateQuadletFile(projectName, environment, ports, options = {}) {
  const { database = true, redis = true, type = 'nextjs' } = options;

  return `[Unit]
Description=${projectName} ${environment} environment
After=network-online.target
Wants=network-online.target
${database ? `After=${projectName}-postgres-${environment}.service\n` : ''}${redis ? `After=${projectName}-redis-${environment}.service\n` : ''}
[Container]
ContainerName=${projectName}-${environment}
Image=ghcr.io/\${GITHUB_ORG}/${projectName}:${environment === 'production' ? 'latest' : 'develop'}
PublishPort=${ports.app}:3000

# Environment Variables
Environment=NODE_ENV=${environment}
${database ? `Environment=DATABASE_URL=postgresql://${projectName}_user:%DB_PASSWORD%@localhost:${ports.db}/${projectName}_${environment}\n` : ''}${redis ? `Environment=REDIS_URL=redis://localhost:${ports.redis}\n` : ''}
# Health Check
HealthCmd=curl -f http://localhost:3000/health || exit 1
HealthInterval=30s
HealthTimeout=10s
HealthRetries=3

# Resource Limits
Memory=1G
MemorySwap=2G
CPUQuota=200%

# Restart Policy
Restart=unless-stopped

# Logging
LogDriver=journald

[Service]
Restart=always
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target default.target
`;
}

/**
 * Generate PostgreSQL Quadlet file
 */
function generatePostgresQuadlet(projectName, environment, dbPort) {
  return `[Unit]
Description=${projectName} PostgreSQL ${environment}
After=network-online.target

[Container]
ContainerName=${projectName}-postgres-${environment}
Image=postgres:16-alpine
PublishPort=${dbPort}:5432

Environment=POSTGRES_USER=${projectName}_user
Environment=POSTGRES_PASSWORD=%DB_PASSWORD%
Environment=POSTGRES_DB=${projectName}_${environment}

Volume=${projectName}-postgres-${environment}-data:/var/lib/postgresql/data

HealthCmd=pg_isready -U ${projectName}_user
HealthInterval=10s

Memory=512M
CPUQuota=100%

[Service]
Restart=always

[Install]
WantedBy=multi-user.target
`;
}

/**
 * Generate Redis Quadlet file
 */
function generateRedisQuadlet(projectName, environment, redisPort) {
  return `[Unit]
Description=${projectName} Redis ${environment}
After=network-online.target

[Container]
ContainerName=${projectName}-redis-${environment}
Image=redis:7-alpine
PublishPort=${redisPort}:6379

Volume=${projectName}-redis-${environment}-data:/data

HealthCmd=redis-cli ping
HealthInterval=10s

Memory=256M
CPUQuota=50%

[Service]
Restart=always

[Install]
WantedBy=multi-user.target
`;
}

/**
 * Generate .env.example template
 */
function generateEnvExample(projectName, options = {}) {
  const { database = true, redis = true, type = 'nextjs' } = options;

  let env = `# ${projectName} Environment Variables
# Auto-generated by CodeB Project Generator

# Application
NODE_ENV=production
PORT=3000

`;

  if (database) {
    env += `# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/${projectName}
POSTGRES_USER=${projectName}_user
POSTGRES_PASSWORD=change_me_in_production
POSTGRES_DB=${projectName}

`;
  }

  if (redis) {
    env += `# Cache (Redis)
REDIS_URL=redis://localhost:6379
REDIS_DB=0

`;
  }

  if (type === 'nextjs') {
    env += `# Next.js Specific
NEXT_PUBLIC_API_URL=https://${projectName}.codeb.kr
NEXTAUTH_SECRET=generate_with_openssl_rand_base64_32
NEXTAUTH_URL=https://${projectName}.codeb.kr

`;
  }

  env += `# Security
JWT_SECRET=generate_strong_secret_here
API_KEY=your_api_key_here

# External Services (Optional)
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# SMTP_HOST=
# SMTP_PORT=
# SMTP_USER=
# SMTP_PASSWORD=
`;

  return env;
}

/**
 * Generate package.json scripts section
 */
function generatePackageScripts(type) {
  if (type === 'nextjs') {
    return {
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "next lint",
      test: "jest",
      "test:e2e": "playwright test"
    };
  }

  if (type === 'nodejs') {
    return {
      dev: "nodemon src/index.js",
      build: "tsc || babel src -d dist",
      start: "node dist/index.js",
      test: "jest",
      lint: "eslint ."
    };
  }

  return {};
}

// ============================================================================
// SSOT Integration (Port Allocation)
// ============================================================================

/**
 * Allocate ports from SSOT registry
 */
async function allocatePorts(projectName) {
  // Call SSOT API to allocate ports
  const ssotUrl = process.env.SSOT_URL || 'http://localhost:3102';

  try {
    const response = await fetch(`${ssotUrl}/api/projects/allocate-ports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName })
    });

    if (!response.ok) {
      throw new Error('SSOT allocation failed');
    }

    return await response.json();
  } catch (error) {
    console.warn(chalk.yellow('SSOT not available, using local allocation'));
    return localPortAllocation(projectName);
  }
}

/**
 * Fallback local port allocation
 */
function localPortAllocation(projectName) {
  // Simple hash-based port allocation
  const hash = projectName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

  return {
    staging: {
      app: 3000 + (hash % 500),
      db: 15432 + (hash % 68),
      redis: 16379 + (hash % 21)
    },
    production: {
      app: 4000 + (hash % 500),
      db: 25432 + (hash % 68),
      redis: 26379 + (hash % 21)
    }
  };
}

// ============================================================================
// API Endpoints
// ============================================================================

/**
 * POST /api/project/create
 *
 * Create a new project with complete infrastructure
 */
app.post('/api/project/create', async (req, res) => {
  try {
    const {
      name,
      type = 'nextjs',
      gitRepo,
      server = 'app',
      database = true,
      redis = true,
      description = ''
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_NAME',
          message: 'Project name is required'
        }
      });
    }

    if (!PROJECT_TEMPLATES[type]) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TYPE',
          message: `Invalid project type. Supported: ${Object.keys(PROJECT_TEMPLATES).join(', ')}`
        }
      });
    }

    console.log(chalk.cyan(`\nCreating project: ${name}`));
    console.log(chalk.gray(`Type: ${type}, Database: ${database}, Redis: ${redis}`));

    // 1. Allocate ports via SSOT
    const ports = await allocatePorts(name);
    console.log(chalk.green('✓ Ports allocated'));

    // 2. Generate Dockerfile
    const dockerfile = generateDockerfile(type, { database, redis });
    console.log(chalk.green('✓ Dockerfile generated'));

    // 3. Generate GitHub Actions workflow
    const workflow = generateGitHubActions(name, type, ports, { database, redis });
    console.log(chalk.green('✓ GitHub Actions workflow generated'));

    // 4. Generate Quadlet files
    const quadletApp = generateQuadletFile(name, 'production', ports.production, { database, redis, type });
    const quadletStaging = generateQuadletFile(name, 'staging', ports.staging, { database, redis, type });

    const quadletPostgresProd = database ? generatePostgresQuadlet(name, 'production', ports.production.db) : null;
    const quadletPostgresStaging = database ? generatePostgresQuadlet(name, 'staging', ports.staging.db) : null;

    const quadletRedisProd = redis ? generateRedisQuadlet(name, 'production', ports.production.redis) : null;
    const quadletRedisStaging = redis ? generateRedisQuadlet(name, 'staging', ports.staging.redis) : null;

    console.log(chalk.green('✓ Quadlet files generated'));

    // 5. Generate .env.example
    const envExample = generateEnvExample(name, { database, redis, type });
    console.log(chalk.green('✓ Environment template generated'));

    // 6. Return all generated files
    const response = {
      success: true,
      data: {
        project: {
          name,
          type,
          gitRepo,
          description,
          createdAt: new Date().toISOString()
        },
        ports,
        files: {
          'Dockerfile': dockerfile,
          '.github/workflows/deploy.yml': workflow,
          '.env.example': envExample,
          'quadlet/production/app.container': quadletApp,
          'quadlet/staging/app.container': quadletStaging,
          ...(database && {
            'quadlet/production/postgres.container': quadletPostgresProd,
            'quadlet/staging/postgres.container': quadletPostgresStaging
          }),
          ...(redis && {
            'quadlet/production/redis.container': quadletRedisProd,
            'quadlet/staging/redis.container': quadletRedisStaging
          })
        },
        deployment: {
          staging: {
            url: `https://${name}-staging.codeb.kr`,
            port: ports.staging.app
          },
          production: {
            url: `https://${name}.codeb.kr`,
            port: ports.production.app
          }
        }
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '2.5.4'
      }
    };

    console.log(chalk.green.bold('\n✓ Project created successfully!\n'));

    res.json(response);

  } catch (error) {
    console.error(chalk.red('Error creating project:'), error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * GET /api/project/types
 *
 * List available project types
 */
app.get('/api/project/types', (req, res) => {
  res.json({
    success: true,
    data: Object.entries(PROJECT_TEMPLATES).map(([key, value]) => ({
      id: key,
      name: value.name,
      port: value.port,
      healthcheck: value.healthcheck
    }))
  });
});

/**
 * GET /api/project/:name
 *
 * Get project details from SSOT
 */
app.get('/api/project/:name', async (req, res) => {
  try {
    const { name } = req.params;

    // Query SSOT for project details
    const ssotUrl = process.env.SSOT_URL || 'http://localhost:3102';
    const response = await fetch(`${ssotUrl}/api/projects/${name}`);

    if (!response.ok) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: `Project '${name}' not found`
        }
      });
    }

    const project = await response.json();

    res.json({
      success: true,
      data: project
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }
});

/**
 * GET /api/health
 *
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: '2.5.4'
    }
  });
});

/**
 * OpenAPI Documentation Endpoint
 */
app.get('/api/docs', (req, res) => {
  const openapi = {
    openapi: '3.0.0',
    info: {
      title: 'CodeB Project Generator API',
      version: '2.5.4',
      description: 'Auto-generate complete project infrastructure with Quadlet, GitHub Actions, and SSOT integration'
    },
    servers: [
      { url: `http://localhost:${PORT}`, description: 'Local development' },
      { url: 'https://codeb.codeb.kr', description: 'Production' }
    ],
    paths: {
      '/api/project/create': {
        post: {
          summary: 'Create new project',
          operationId: 'createProject',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', example: 'my-app' },
                    type: { type: 'string', enum: ['nextjs', 'nodejs', 'python', 'static'], default: 'nextjs' },
                    gitRepo: { type: 'string', example: 'https://github.com/user/repo' },
                    server: { type: 'string', default: 'app' },
                    database: { type: 'boolean', default: true },
                    redis: { type: 'boolean', default: true },
                    description: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Project created successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          project: { type: 'object' },
                          ports: { type: 'object' },
                          files: { type: 'object' },
                          deployment: { type: 'object' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/api/project/types': {
        get: {
          summary: 'List project types',
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            port: { type: 'number' },
                            healthcheck: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  res.json(openapi);
});

// ============================================================================
// Server Start
// ============================================================================

app.listen(PORT, () => {
  console.log(chalk.cyan.bold('\n╔═══════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║   CodeB Project Generator API v2.5.4         ║'));
  console.log(chalk.cyan.bold('╚═══════════════════════════════════════════════╝\n'));
  console.log(chalk.green(`✓ Server running on http://localhost:${PORT}`));
  console.log(chalk.gray(`  OpenAPI docs: http://localhost:${PORT}/api/docs`));
  console.log(chalk.gray(`  Health check: http://localhost:${PORT}/api/health\n`));
});

export default app;
