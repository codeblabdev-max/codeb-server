/**
 * CodeB v7.0 - Project Init/Scan Tool
 *
 * Docker 기반 배포 (v7.0.30+)
 *
 * /we:quick 명령어에서 내부적으로 호출됨:
 * - workflow_init (project_init): 프로젝트 초기화
 * - workflow_scan (project_scan): 프로젝트 상태 스캔
 *
 * 프로젝트 초기화 (서버별 리소스 생성):
 *
 * App Server (158.247.203.55):
 * 1. SSOT 등록 (프로젝트, 포트, DB, Redis 정보)
 * 2. 포트 할당 (SSOT와 동기화)
 * 3. ENV 파일 생성 + 백업
 * 4. Caddy 도메인 설정
 *
 * Storage Server (64.176.226.119):
 * 5. PostgreSQL DB/User 생성
 * 6. Redis DB 번호 할당
 *
 * 로컬 (반환값으로 제공):
 * 7. GitHub Actions workflow 템플릿
 * 8. Dockerfile 템플릿
 */

import { z } from 'zod';
import { randomBytes } from 'crypto';
import type { AuthContext } from '../lib/types.js';
import { withSSH } from '../lib/ssh.js';
import { SERVERS, getSlotPorts } from '../lib/servers.js';

// ============================================================================
// Input Schema
// ============================================================================

export const projectInitInputSchema = z.object({
  projectName: z.string().min(1).max(50),
  type: z.enum(['nextjs', 'remix', 'nodejs', 'python', 'go']).default('nextjs'),
  database: z.boolean().default(true),
  redis: z.boolean().default(true),
  domain: z.string().optional(), // 실제 도메인 (없으면 {projectName}.codeb.kr)
  // Production Only - Blue-Green이 staging 역할을 대체
});

export const projectScanInputSchema = z.object({
  projectName: z.string().min(1).max(50),
});

// ============================================================================
// Types
// ============================================================================

interface WorkflowInitResult {
  success: boolean;
  projectName: string;
  files: string[];
  ports: {
    blue: number;
    green: number;
  };
  database?: {
    name: string;
    user: string;
    password: string;
    host: string;
    port: number;
    url: string;
  };
  redis?: {
    db: number;
    host: string;
    port: number;
    url: string;
  };
  domain: string;
  registryPath: string;
  githubActionsWorkflow: string;
  dockerfile: string;
  instructions: string[];
  error?: string;
}

interface WorkflowScanResult {
  success: boolean;
  projectName: string;
  registered: boolean;
  hasDockerfile: boolean;
  hasDockerContainer: boolean;
  hasGitHubActions: boolean;
  hasEnv: boolean;
  ports: {
    blue: number;
    green: number;
  };
  issues: string[];
}

// ============================================================================
// Workflow Init
// ============================================================================

async function executeWorkflowInit(
  input: z.infer<typeof projectInitInputSchema>,
  auth: AuthContext
): Promise<WorkflowInitResult> {
  const { projectName, type, database: needsDatabase, redis: needsRedis, domain: inputDomain } = input;

  const files: string[] = [];
  let ports: WorkflowInitResult['ports'] = { blue: 0, green: 0 };
  let dbInfo: WorkflowInitResult['database'];
  let redisInfo: WorkflowInitResult['redis'];
  // 도메인: 입력값 또는 기본 테스트 도메인
  const domain = inputDomain || `${projectName}.codeb.kr`;

  try {
    // ============================================================
    // Phase 1: App Server (SSOT, 포트, 슬롯 레지스트리)
    // ============================================================
    await withSSH(SERVERS.app.ip, async (appSSH) => {
      // 1. 프로젝트 디렉토리 생성
      const projectDir = `/opt/codeb/projects/${projectName}`;
      await appSSH.exec(`mkdir -p ${projectDir}`);
      await appSSH.exec(`mkdir -p /opt/codeb/env/${projectName}`);
      await appSSH.exec(`mkdir -p /opt/codeb/env-backup/${projectName}`);

      // 2. 포트 할당 및 Registry 등록
      const registryDir = '/opt/codeb/registry/slots';
      await appSSH.exec(`mkdir -p ${registryDir}`);

      const basePort = await allocatePort(appSSH, projectName);
      ports = getSlotPorts(basePort);

      const registry = {
        projectName,
        teamId: auth.teamId,
        environment: 'production',
        activeSlot: 'blue',
        blue: { name: 'blue', state: 'empty', port: ports.blue },
        green: { name: 'green', state: 'empty', port: ports.green },
        lastUpdated: new Date().toISOString(),
      };

      await appSSH.writeFile(
        `${registryDir}/${projectName}-production.json`,
        JSON.stringify(registry, null, 2)
      );
      files.push(`${registryDir}/${projectName}-production.json`);
    });

    // ============================================================
    // Phase 2: Storage Server (PostgreSQL, Redis)
    // ============================================================
    await withSSH(SERVERS.storage.ip, async (storageSSH) => {
      const dbPassword = generatePassword();
      const dbName = `${projectName}_db`;
      const dbUser = `${projectName}_user`;

      // PostgreSQL DB/User 생성
      if (needsDatabase) {
        await storageSSH.exec(`sudo -u postgres psql -c "CREATE DATABASE ${dbName};" || true`);
        await storageSSH.exec(`sudo -u postgres psql -c "CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}';" || true`);
        await storageSSH.exec(`sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser};"`);
        await storageSSH.exec(`sudo -u postgres psql -c "ALTER DATABASE ${dbName} OWNER TO ${dbUser};"`);

        dbInfo = {
          name: dbName,
          user: dbUser,
          password: dbPassword,
          host: SERVERS.storage.domain,
          port: SERVERS.storage.ports.postgresql,
          url: `postgresql://${dbUser}:${dbPassword}@${SERVERS.storage.domain}:${SERVERS.storage.ports.postgresql}/${dbName}?schema=public`,
        };
      }

      // Redis DB 번호 할당 (SSOT에서 관리)
      if (needsRedis) {
        // Redis DB 번호는 SSOT에서 자동 할당 (0-15)
        const redisDb = await allocateRedisDb(storageSSH, projectName);
        redisInfo = {
          db: redisDb,
          host: SERVERS.storage.domain,
          port: SERVERS.storage.ports.redis,
          url: `redis://${SERVERS.storage.domain}:${SERVERS.storage.ports.redis}/${redisDb}`,
        };
      }
    });

    // ============================================================
    // Phase 3: App Server (ENV 생성, SSOT 업데이트, Caddy 도메인)
    // ============================================================
    await withSSH(SERVERS.app.ip, async (appSSH) => {
      // ENV 파일 생성
      const envContent = generateEnvWithCredentials({
        projectName,
        database: dbInfo,
        redis: redisInfo,
        domain,
      });

      const envPath = `/opt/codeb/env/${projectName}/.env`;
      await appSSH.writeFile(envPath, envContent);
      files.push(envPath);

      // ENV 백업
      const backupPath = `/opt/codeb/env-backup/${projectName}/.env.${Date.now()}`;
      await appSSH.exec(`cp ${envPath} ${backupPath}`);

      // SSOT 업데이트
      const ssotPath = '/opt/codeb/registry/ssot.json';
      let ssot: any = { version: '7.0', projects: {}, ports: { used: [] }, redis: { used: [] } };

      try {
        const ssotContent = await appSSH.readFile(ssotPath);
        ssot = JSON.parse(ssotContent);
      } catch {
        // 파일 없으면 새로 생성
      }

      ssot.projects[projectName] = {
        teamId: auth.teamId,
        type,
        ports: { blue: ports.blue, green: ports.green },
        database: dbInfo ? { name: dbInfo.name, user: dbInfo.user } : null,
        redis: redisInfo ? { db: redisInfo.db } : null,
        domain,
        createdAt: new Date().toISOString(),
        createdBy: auth.keyId,
      };

      await appSSH.writeFile(ssotPath, JSON.stringify(ssot, null, 2));
      files.push(ssotPath);

      // Caddy 도메인 설정
      const caddySnippet = `
${domain} {
  reverse_proxy localhost:${ports.blue} localhost:${ports.green} {
    lb_policy first
    fail_duration 10s
  }
  encode gzip
  log {
    output file /var/log/caddy/${projectName}.log
  }
}
`;
      const caddyPath = `/etc/caddy/sites/${projectName}.caddy`;
      await appSSH.exec(`sudo mkdir -p /etc/caddy/sites`);
      await appSSH.exec(`echo '${caddySnippet}' | sudo tee ${caddyPath}`);
      await appSSH.exec(`sudo systemctl reload caddy || true`);
      files.push(caddyPath);

      // PowerDNS A 레코드 추가 (codeb.kr 서브도메인인 경우만)
      if (domain.endsWith('.codeb.kr')) {
        const subdomain = domain.replace('.codeb.kr', '');
        await appSSH.exec(`pdnsutil add-record codeb.kr ${subdomain} A 300 ${SERVERS.app.ip} 2>/dev/null || true`);
        await appSSH.exec(`pdnsutil rectify-zone codeb.kr 2>/dev/null || true`);
      }

      // SSL 인증서 발급 대기 (최대 30초)
      // Caddy가 자동으로 Let's Encrypt 인증서를 발급함
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3초 대기
        const certCheck = await appSSH.exec(
          `curl -sI https://${domain} --connect-timeout 5 2>&1 | head -1 || echo "pending"`
        );
        if (certCheck.stdout.includes('HTTP/') || certCheck.stdout.includes('200')) {
          break; // 인증서 발급 완료
        }
      }
    });

    // ============================================================
    // Phase 4: 결과 반환
    // ============================================================
    const githubActionsWorkflow = generateGitHubActionsWorkflow({ projectName, type });
    const dockerfile = generateDockerfile(type);

    const instructions = [
      `✅ 프로젝트 초기화 완료!`,
      ``,
      `📊 할당된 리소스:`,
      `   포트: Blue=${ports.blue}, Green=${ports.green}`,
      dbInfo ? `   DB: ${dbInfo.name} (${dbInfo.user}@${dbInfo.host})` : '',
      redisInfo ? `   Redis: DB ${redisInfo.db}` : '',
      `   도메인: ${domain}`,
      ``,
      `📁 로컬에 생성할 파일:`,
      `   1. .github/workflows/deploy.yml`,
      `   2. Dockerfile (없으면)`,
      ``,
      `🔑 GitHub Secrets 설정:`,
      `   - CODEB_API_KEY: CodeB API 키`,
      ``,
      `🚀 배포:`,
      `   git push origin main  # → 비활성 슬롯에 배포`,
      `   we promote ${projectName}  # → 트래픽 전환`,
    ].filter(Boolean);

    return {
      success: true,
      projectName,
      files,
      ports,
      database: dbInfo,
      redis: redisInfo,
      domain,
      registryPath: `/opt/codeb/registry/slots/${projectName}-production.json`,
      githubActionsWorkflow,
      dockerfile,
      instructions,
    };
  } catch (error) {
    return {
      success: false,
      projectName,
      files,
      ports,
      domain,
      registryPath: '',
      githubActionsWorkflow: '',
      dockerfile: '',
      instructions: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Workflow Scan
// ============================================================================

async function executeWorkflowScan(
  input: z.infer<typeof projectScanInputSchema>,
  auth: AuthContext
): Promise<WorkflowScanResult> {
  const { projectName } = input;

  return withSSH(SERVERS.app.ip, async (ssh) => {
    const issues: string[] = [];
    let ports: WorkflowScanResult['ports'] = { blue: 0, green: 0 };

    try {
      const projectDir = `/opt/codeb/projects/${projectName}`;
      const registryDir = '/opt/codeb/registry/slots';

      // Registry 확인 (Production Only)
      let registered = false;
      try {
        const prodReg = await ssh.readFile(`${registryDir}/${projectName}-production.json`);
        const prodData = JSON.parse(prodReg);
        ports = { blue: prodData.blue.port, green: prodData.green.port };
        registered = true;
      } catch {
        // production 없음
      }

      if (!registered) {
        issues.push('프로젝트가 Registry에 등록되지 않음. /we:quick 실행 필요');
      }

      // Dockerfile 확인
      let hasDockerfile = false;
      try {
        await ssh.exec(`test -f ${projectDir}/Dockerfile`);
        hasDockerfile = true;
      } catch {
        issues.push('Dockerfile이 없음');
      }

      // Docker 컨테이너 확인
      let hasDockerContainer = false;
      try {
        const result = await ssh.exec(`docker ps -a --format '{{.Names}}' | grep -c "^${projectName}-" || echo "0"`);
        hasDockerContainer = parseInt(result.stdout.trim()) > 0;
      } catch {
        // no docker containers
      }
      if (!hasDockerContainer) {
        issues.push('Docker 컨테이너가 없음 (첫 배포 필요)');
      }

      // GitHub Actions 확인 (로컬에서 확인해야 함 - 여기선 skip)
      const hasGitHubActions = false; // 서버에서 확인 불가

      // ENV 확인
      let hasEnv = false;
      try {
        await ssh.exec(`test -f ${projectDir}/.env`);
        hasEnv = true;
      } catch {
        issues.push('ENV 파일이 없음');
      }

      return {
        success: true,
        projectName,
        registered,
        hasDockerfile,
        hasDockerContainer,
        hasGitHubActions,
        hasEnv,
        ports,
        issues,
      };
    } catch (error) {
      return {
        success: false,
        projectName,
        registered: false,
        hasDockerfile: false,
        hasDockerContainer: false,
        hasGitHubActions: false,
        hasEnv: false,
        ports,
        issues: [error instanceof Error ? error.message : String(error)],
      };
    }
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function generatePassword(length: number = 32): string {
  return randomBytes(length).toString('base64url').slice(0, length);
}

async function allocateRedisDb(ssh: any, projectName: string): Promise<number> {
  // Redis DB 번호 할당 (0-15, 0은 기본이므로 1부터 시작)
  const ssotPath = '/opt/codeb/registry/redis-db.json';
  let redisDb: any = { used: {}, nextDb: 1 };

  try {
    const content = await ssh.readFile(ssotPath);
    redisDb = JSON.parse(content);
  } catch {
    // 파일 없으면 새로 생성
  }

  // 이미 할당된 프로젝트면 기존 번호 반환
  if (redisDb.used[projectName]) {
    return redisDb.used[projectName];
  }

  // 새 DB 번호 할당
  const dbNum = redisDb.nextDb;
  if (dbNum > 15) {
    throw new Error('No available Redis DB numbers (max 15)');
  }

  redisDb.used[projectName] = dbNum;
  redisDb.nextDb = dbNum + 1;
  await ssh.writeFile(ssotPath, JSON.stringify(redisDb, null, 2));

  return dbNum;
}

function generateEnvWithCredentials(params: {
  projectName: string;
  database?: WorkflowInitResult['database'];
  redis?: WorkflowInitResult['redis'];
  domain: string;
}): string {
  const { projectName, database, redis, domain } = params;

  let content = `# CodeB v7.0 - Environment Variables
# Project: ${projectName}
# Domain: ${domain}
# Generated: ${new Date().toISOString()}

NODE_ENV=production
PORT=3000

`;

  if (database) {
    content += `# PostgreSQL (Storage Server: ${SERVERS.storage.domain})
DATABASE_URL=${database.url}

`;
  }

  if (redis) {
    content += `# Redis (Storage Server: ${SERVERS.storage.domain})
REDIS_URL=${redis.url}

`;
  }

  content += `# Centrifugo (WebSocket - Streaming Server: ${SERVERS.streaming.domain})
NEXT_PUBLIC_WS_URL=wss://${SERVERS.streaming.domain}/connection/websocket
`;

  return content;
}

async function allocatePort(ssh: any, projectName: string): Promise<number> {
  const ssotPath = '/opt/codeb/registry/ssot.json';
  let ssot: any = { version: '7.0', projects: {}, ports: { allocated: {}, reserved: [] } };

  try {
    const content = await ssh.readFile(ssotPath);
    ssot = JSON.parse(content);
  } catch {
    // 파일 없으면 새로 생성
  }

  // SSOT 구조 보장
  if (!ssot.ports) ssot.ports = { allocated: {}, reserved: [] };
  if (!ssot.ports.allocated) ssot.ports.allocated = {};

  // 포트 범위 (Production Only): 4100-4998 (짝수=blue, 홀수=green)
  const baseRange = 4100;
  const maxRange = 4998;

  // allocated 객체에서 사용 중인 포트 추출
  const usedPorts = new Set(Object.keys(ssot.ports.allocated).map(Number));

  // 사용 가능한 첫 번째 짝수 포트 찾기 (blue용, green은 +1)
  for (let port = baseRange; port < maxRange; port += 2) {
    if (!usedPorts.has(port) && !usedPorts.has(port + 1)) {
      // 포트 예약 (allocated 객체 형식)
      ssot.ports.allocated[port] = { project: projectName, slot: 'blue' };
      ssot.ports.allocated[port + 1] = { project: projectName, slot: 'green' };
      await ssh.writeFile(ssotPath, JSON.stringify(ssot, null, 2));
      return port;
    }
  }

  throw new Error('No available ports in production range (4100-4998)');
}

function generateGitHubActionsWorkflow(params: {
  projectName: string;
  type: string;
}): string {
  const { projectName, type } = params;

  // 프로젝트 타입별 빌드 설정
  const buildConfigs: Record<string, { buildCommand: string; nodeVersion: string }> = {
    nextjs: { buildCommand: 'npm run build', nodeVersion: '20' },
    remix: { buildCommand: 'npm run build', nodeVersion: '20' },
    nodejs: { buildCommand: 'npm run build || true', nodeVersion: '20' },
    python: { buildCommand: 'echo "Python project"', nodeVersion: '20' },
    go: { buildCommand: 'go build -o app .', nodeVersion: '20' },
  };

  const config = buildConfigs[type] || buildConfigs.nextjs;

  return `# CodeB v7.0 - Blue-Green Deployment Workflow (Production Only)
# Generated: ${new Date().toISOString()}
#
# Blue-Green 배포: Staging 없이 Production에서 Blue/Green 슬롯으로 무중단 배포
# - main push → 비활성 슬롯에 배포 (Preview URL 제공)
# - 수동 promote → 트래픽 전환

name: Deploy ${projectName}

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      action:
        description: 'Action to perform'
        required: true
        default: 'deploy'
        type: choice
        options:
          - deploy
          - promote
          - rollback

env:
  PROJECT_NAME: ${projectName}
  REGISTRY: ghcr.io
  IMAGE_NAME: \${{ github.repository }}

jobs:
  build-and-deploy:
    runs-on: [self-hosted, docker]  # Docker 권한이 있는 러너에서만 실행
    if: github.event_name == 'push' || github.event.inputs.action == 'deploy'
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '${config.nodeVersion}'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: ${config.buildCommand}

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Docker image
        run: |
          docker build -t \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ github.sha }} .
          docker push \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ github.sha }}
          docker tag \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ github.sha }} \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:latest
          docker push \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:latest

      - name: Deploy to inactive slot (Blue-Green)
        timeout-minutes: 5
        run: |
          RESPONSE=\$(curl -sf --max-time 180 -X POST "https://api.codeb.kr/api/tool" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "tool": "deploy",
              "params": {
                "projectName": "${projectName}",
                "image": "'\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ github.sha }}'"
              }
            }')

          echo "Deploy Response: \$RESPONSE"
          PREVIEW_URL=\$(echo "\$RESPONSE" | jq -r '.previewUrl // empty')
          echo "## 🚀 Deployed to inactive slot" >> \$GITHUB_STEP_SUMMARY
          echo "Preview URL: \$PREVIEW_URL" >> \$GITHUB_STEP_SUMMARY
          echo "Run 'we promote ${projectName}' to switch traffic" >> \$GITHUB_STEP_SUMMARY

  promote:
    runs-on: [self-hosted, docker]
    if: github.event.inputs.action == 'promote'

    steps:
      - name: Promote (switch traffic)
        run: |
          RESPONSE=\$(curl -sf --max-time 60 -X POST "https://api.codeb.kr/api/tool" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{"tool": "slot_promote", "params": {"projectName": "${projectName}"}}')
          echo "## 🎉 Traffic switched!" >> \$GITHUB_STEP_SUMMARY

  rollback:
    runs-on: [self-hosted, docker]
    if: github.event.inputs.action == 'rollback'

    steps:
      - name: Rollback to previous version
        run: |
          RESPONSE=\$(curl -sf --max-time 60 -X POST "https://api.codeb.kr/api/tool" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{"tool": "rollback", "params": {"projectName": "${projectName}"}}')
          echo "## ⏪ Rolled back!" >> \$GITHUB_STEP_SUMMARY
`;
}

function generateDockerfile(type: string): string {
  const templates: Record<string, string> = {
    nextjs: `# CodeB v7.0 - Next.js Dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
`,
    remix: `# CodeB v7.0 - Remix Dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public
COPY package*.json ./

EXPOSE 3000
CMD ["npm", "start"]
`,
    nodejs: `# CodeB v7.0 - Node.js Dockerfile
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
`,
    python: `# CodeB v7.0 - Python Dockerfile
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=3000

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 3000
CMD ["python", "app.py"]
`,
    go: `# CodeB v7.0 - Go Dockerfile
FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o app .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/app .

ENV PORT=3000
EXPOSE 3000
CMD ["./app"]
`,
  };

  return templates[type] || templates.nodejs;
}

// ============================================================================
// Export Tools
// ============================================================================

export const projectInitTool = {
  name: 'workflow_init',
  description: 'Initialize project with Registry, Docker, ENV templates',

  async execute(
    params: z.infer<typeof projectInitInputSchema>,
    auth: AuthContext
  ): Promise<WorkflowInitResult> {
    const validated = projectInitInputSchema.parse(params);
    return executeWorkflowInit(validated, auth);
  },
};

export const projectScanTool = {
  name: 'workflow_scan',
  description: 'Scan project for workflow configuration status',

  async execute(
    params: z.infer<typeof projectScanInputSchema>,
    auth: AuthContext
  ): Promise<WorkflowScanResult> {
    const validated = projectScanInputSchema.parse(params);
    return executeWorkflowScan(validated, auth);
  },
};
