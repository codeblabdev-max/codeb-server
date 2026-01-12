/**
 * CodeB v7.0 - Workflow Init Tool
 *
 * Docker 기반 배포 (v7.0.30+)
 *
 * 프로젝트 초기화:
 * 1. 서버 Registry(SSOT)에 프로젝트 등록
 * 2. 포트 할당 (SSOT와 동기화)
 * 3. GitHub Actions workflow 생성
 * 4. Dockerfile 생성 (없으면)
 * 5. ENV 템플릿 생성
 */

import { z } from 'zod';
import type { AuthContext } from '../lib/types.js';
import { withSSH } from '../lib/ssh.js';
import { SERVERS, getSlotPorts } from '../lib/servers.js';

// ============================================================================
// Input Schema
// ============================================================================

export const workflowInitInputSchema = z.object({
  projectName: z.string().min(1).max(50),
  type: z.enum(['nextjs', 'remix', 'nodejs', 'python', 'go']).default('nextjs'),
  database: z.boolean().default(true),
  redis: z.boolean().default(true),
  environment: z.enum(['staging', 'production', 'both']).default('both'),
});

export const workflowScanInputSchema = z.object({
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
    staging?: { blue: number; green: number };
    production?: { blue: number; green: number };
  };
  registryPath: string;
  githubActionsWorkflow: string;   // GitHub Actions 워크플로우 YAML 내용
  dockerfile: string;              // Dockerfile 내용
  instructions: string[];          // 사용자 안내 메시지
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
    staging?: { blue: number; green: number };
    production?: { blue: number; green: number };
  };
  issues: string[];
}

// ============================================================================
// Workflow Init
// ============================================================================

async function executeWorkflowInit(
  input: z.infer<typeof workflowInitInputSchema>,
  auth: AuthContext
): Promise<WorkflowInitResult> {
  const { projectName, type, database, redis, environment } = input;

  return withSSH(SERVERS.app.ip, async (ssh) => {
    const files: string[] = [];
    const ports: WorkflowInitResult['ports'] = {};

    try {
      // 1. 프로젝트 디렉토리 생성
      const projectDir = `/opt/codeb/projects/${projectName}`;
      await ssh.exec(`mkdir -p ${projectDir}`);

      // 2. 포트 할당 및 Registry 등록
      const registryDir = '/opt/codeb/registry/slots';
      await ssh.exec(`mkdir -p ${registryDir}`);

      // Staging 포트 할당
      if (environment === 'staging' || environment === 'both') {
        const stagingBasePort = await allocatePort(ssh, 'staging');
        ports.staging = getSlotPorts(stagingBasePort);

        const stagingRegistry = {
          projectName,
          teamId: auth.teamId,
          environment: 'staging',
          activeSlot: 'blue',
          blue: { name: 'blue', state: 'empty', port: ports.staging.blue },
          green: { name: 'green', state: 'empty', port: ports.staging.green },
          lastUpdated: new Date().toISOString(),
        };

        await ssh.writeFile(
          `${registryDir}/${projectName}-staging.json`,
          JSON.stringify(stagingRegistry, null, 2)
        );
        files.push(`${registryDir}/${projectName}-staging.json`);
      }

      // Production 포트 할당
      if (environment === 'production' || environment === 'both') {
        const prodBasePort = await allocatePort(ssh, 'production');
        ports.production = getSlotPorts(prodBasePort);

        const prodRegistry = {
          projectName,
          teamId: auth.teamId,
          environment: 'production',
          activeSlot: 'blue',
          blue: { name: 'blue', state: 'empty', port: ports.production.blue },
          green: { name: 'green', state: 'empty', port: ports.production.green },
          lastUpdated: new Date().toISOString(),
        };

        await ssh.writeFile(
          `${registryDir}/${projectName}-production.json`,
          JSON.stringify(prodRegistry, null, 2)
        );
        files.push(`${registryDir}/${projectName}-production.json`);
      }

      // 3. ENV 템플릿 생성
      const envContent = generateEnvTemplate({ projectName, database, redis });

      if (environment === 'staging' || environment === 'both') {
        await ssh.writeFile(`${projectDir}/.env.staging`, envContent);
        files.push(`${projectDir}/.env.staging`);
      }
      if (environment === 'production' || environment === 'both') {
        await ssh.writeFile(`${projectDir}/.env.production`, envContent);
        files.push(`${projectDir}/.env.production`);
      }

      // 4. SSOT에 프로젝트 등록
      const ssotPath = '/opt/codeb/registry/ssot.json';
      let ssot: any = { version: '7.0', projects: {}, ports: { used: [], reserved: [] } };

      try {
        const ssotContent = await ssh.readFile(ssotPath);
        ssot = JSON.parse(ssotContent);
      } catch {
        // 파일 없으면 새로 생성
      }

      ssot.projects[projectName] = {
        teamId: auth.teamId,
        type,
        database,
        redis,
        environments: environment === 'both' ? ['staging', 'production'] : [environment],
        createdAt: new Date().toISOString(),
        createdBy: auth.keyId,
      };

      await ssh.writeFile(ssotPath, JSON.stringify(ssot, null, 2));
      files.push(ssotPath);

      // 5. GitHub Actions 워크플로우 및 Dockerfile 생성
      const githubActionsWorkflow = generateGitHubActionsWorkflow({ projectName, type });
      const dockerfile = generateDockerfile(type);

      // 6. 사용자 안내 메시지
      const instructions = [
        `📁 다음 파일을 프로젝트에 생성하세요:`,
        `   1. .github/workflows/deploy.yml (아래 워크플로우 내용 복사)`,
        `   2. Dockerfile (아래 내용 복사, 이미 있으면 스킵)`,
        ``,
        `🔑 GitHub Secrets 설정:`,
        `   Settings > Secrets > Actions에서 다음 설정:`,
        `   - CODEB_API_KEY: CodeB API 키 (we login으로 확인)`,
        ``,
        `🚀 배포 테스트:`,
        `   git push origin main  # → 자동으로 staging 배포`,
        `   we promote ${projectName}  # → production 전환`,
        ``,
        `📊 할당된 포트:`,
        ports.staging ? `   Staging: Blue=${ports.staging.blue}, Green=${ports.staging.green}` : '',
        ports.production ? `   Production: Blue=${ports.production.blue}, Green=${ports.production.green}` : '',
      ].filter(Boolean);

      return {
        success: true,
        projectName,
        files,
        ports,
        registryPath: `/opt/codeb/registry/slots/${projectName}-*.json`,
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
        registryPath: '',
        githubActionsWorkflow: '',
        dockerfile: '',
        instructions: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

// ============================================================================
// Workflow Scan
// ============================================================================

async function executeWorkflowScan(
  input: z.infer<typeof workflowScanInputSchema>,
  auth: AuthContext
): Promise<WorkflowScanResult> {
  const { projectName } = input;

  return withSSH(SERVERS.app.ip, async (ssh) => {
    const issues: string[] = [];
    const ports: WorkflowScanResult['ports'] = {};

    try {
      const projectDir = `/opt/codeb/projects/${projectName}`;
      const registryDir = '/opt/codeb/registry/slots';

      // Registry 확인
      let registered = false;
      try {
        const stagingReg = await ssh.readFile(`${registryDir}/${projectName}-staging.json`);
        const stagingData = JSON.parse(stagingReg);
        ports.staging = { blue: stagingData.blue.port, green: stagingData.green.port };
        registered = true;
      } catch {
        // staging 없음
      }

      try {
        const prodReg = await ssh.readFile(`${registryDir}/${projectName}-production.json`);
        const prodData = JSON.parse(prodReg);
        ports.production = { blue: prodData.blue.port, green: prodData.green.port };
        registered = true;
      } catch {
        // production 없음
      }

      if (!registered) {
        issues.push('프로젝트가 Registry에 등록되지 않음. /we:workflow init 실행 필요');
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
        await ssh.exec(`test -f ${projectDir}/.env.staging || test -f ${projectDir}/.env.production`);
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

async function allocatePort(ssh: any, environment: string): Promise<number> {
  const ssotPath = '/opt/codeb/registry/ssot.json';
  let ssot: any = { version: '7.0', projects: {}, ports: { used: [], reserved: [] } };

  try {
    const content = await ssh.readFile(ssotPath);
    ssot = JSON.parse(content);
  } catch {
    // 파일 없으면 새로 생성
  }

  // 포트 범위 (SSOT와 동기화): staging 4500-4999, production 4100-4499
  const baseRange = environment === 'staging' ? 4500 : 4100;
  const maxRange = environment === 'staging' ? 4998 : 4498;

  const usedPorts = new Set(ssot.ports?.used || []);

  // 사용 가능한 첫 번째 짝수 포트 찾기 (blue용, green은 +1)
  for (let port = baseRange; port < maxRange; port += 2) {
    if (!usedPorts.has(port) && !usedPorts.has(port + 1)) {
      // 포트 예약
      if (!ssot.ports) ssot.ports = { used: [], reserved: [] };
      ssot.ports.used.push(port, port + 1);
      await ssh.writeFile(ssotPath, JSON.stringify(ssot, null, 2));
      return port;
    }
  }

  throw new Error(`No available ports in ${environment} range`);
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

  return `# CodeB v7.0 - GitHub Actions Self-Hosted Runner Workflow
# Generated: ${new Date().toISOString()}
#
# 이 워크플로우는 App 서버(158.247.203.55)의 self-hosted runner에서 실행됩니다.
# Runner 경로: /opt/actions-runner
# 라벨: self-hosted, Linux, X64, codeb, app-server

name: Deploy ${projectName}

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production

env:
  PROJECT_NAME: ${projectName}
  REGISTRY: ghcr.io
  IMAGE_NAME: \${{ github.repository }}

jobs:
  build:
    runs-on: self-hosted
    permissions:
      contents: read
      packages: write

    outputs:
      image_tag: \${{ steps.meta.outputs.tags }}

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

      - name: Login to GitHub Container Registry
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
            type=sha,prefix=
            type=ref,event=branch
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push Docker image
        run: |
          # Docker로 빌드 (self-hosted runner에서 실행)
          # 요구사항: runner 사용자가 docker 그룹에 포함되어야 함
          docker build --build-arg NPM_TOKEN=\${{ secrets.GHCR_PAT }} -t \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ github.sha }} .
          docker push \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ github.sha }}

          # latest 태그도 푸시 (main 브랜치인 경우)
          if [ "\${{ github.ref }}" = "refs/heads/main" ]; then
            docker tag \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ github.sha }} \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:latest
            docker push \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:latest
          fi

  deploy-staging:
    needs: build
    runs-on: self-hosted
    if: github.ref == 'refs/heads/main' || github.event.inputs.environment == 'staging'
    environment: staging

    steps:
      - name: Deploy to Staging via CodeB API
        timeout-minutes: 5
        run: |
          # API 호출 (최대 3분 대기 - 이미지 pull + health check 시간 포함)
          RESPONSE=\$(curl -sf --max-time 180 -X POST "https://api.codeb.kr/api/tool" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "tool": "deploy",
              "params": {
                "projectName": "${projectName}",
                "environment": "staging",
                "image": "'\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ github.sha }}'"
              }
            }')

          echo "Deploy Response: \$RESPONSE"

          # Preview URL 추출
          PREVIEW_URL=\$(echo "\$RESPONSE" | jq -r '.previewUrl // empty')
          if [ -n "\$PREVIEW_URL" ]; then
            echo "## 🚀 Staging Deploy Success" >> \$GITHUB_STEP_SUMMARY
            echo "Preview URL: \$PREVIEW_URL" >> \$GITHUB_STEP_SUMMARY
          fi

  deploy-production:
    needs: build
    runs-on: self-hosted
    if: github.event.inputs.environment == 'production'
    environment: production

    steps:
      - name: Deploy to Production via CodeB API
        timeout-minutes: 5
        run: |
          # API 호출 (최대 3분 대기 - 이미지 pull + health check 시간 포함)
          RESPONSE=\$(curl -sf --max-time 180 -X POST "https://api.codeb.kr/api/tool" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "tool": "deploy",
              "params": {
                "projectName": "${projectName}",
                "environment": "production",
                "image": "'\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ github.sha }}'"
              }
            }')

          echo "Deploy Response: \$RESPONSE"

      - name: Promote to Production
        timeout-minutes: 2
        run: |
          RESPONSE=\$(curl -sf --max-time 60 -X POST "https://api.codeb.kr/api/tool" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "tool": "slot_promote",
              "params": {
                "projectName": "${projectName}",
                "environment": "production"
              }
            }')

          echo "Promote Response: \$RESPONSE"
          echo "## 🎉 Production Deploy & Promote Success" >> \$GITHUB_STEP_SUMMARY
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

function generateEnvTemplate(params: {
  projectName: string;
  database: boolean;
  redis: boolean;
}): string {
  const { projectName, database, redis } = params;

  let content = `# CodeB v7.0 - Environment Variables
# Project: ${projectName}
# Generated: ${new Date().toISOString()}

NODE_ENV=production
PORT=3000

`;

  if (database) {
    content += `# PostgreSQL (Storage Server)
DATABASE_URL=postgresql://postgres:password@db.codeb.kr:5432/${projectName}?schema=public

`;
  }

  if (redis) {
    content += `# Redis (Storage Server)
REDIS_URL=redis://db.codeb.kr:6379/0
REDIS_PREFIX=${projectName}:

`;
  }

  content += `# Centrifugo (WebSocket - Streaming Server)
CENTRIFUGO_URL=wss://ws.codeb.kr/connection/websocket
CENTRIFUGO_API_URL=http://ws.codeb.kr:8000/api
`;

  return content;
}

// ============================================================================
// Export Tools
// ============================================================================

export const workflowInitTool = {
  name: 'workflow_init',
  description: 'Initialize project with Registry, Quadlet, ENV templates',

  async execute(
    params: z.infer<typeof workflowInitInputSchema>,
    auth: AuthContext
  ): Promise<WorkflowInitResult> {
    const validated = workflowInitInputSchema.parse(params);
    return executeWorkflowInit(validated, auth);
  },
};

export const workflowScanTool = {
  name: 'workflow_scan',
  description: 'Scan project for workflow configuration status',

  async execute(
    params: z.infer<typeof workflowScanInputSchema>,
    auth: AuthContext
  ): Promise<WorkflowScanResult> {
    const validated = workflowScanInputSchema.parse(params);
    return executeWorkflowScan(validated, auth);
  },
};
