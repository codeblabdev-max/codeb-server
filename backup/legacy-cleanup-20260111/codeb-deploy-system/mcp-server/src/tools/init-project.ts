/**
 * CodeB Deploy MCP - 프로젝트 초기화 도구
 * deploy/ 폴더 + .github/workflows 생성
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { portRegistry } from '../lib/port-registry.js';
import { analyzeServer } from './analyze-server.js';
import type {
  ProjectConfig,
  ProjectTemplate,
  DeployFolder,
  GeneratedScript,
  GitHubActionsWorkflow,
  EnvironmentConfig,
} from '../lib/types.js';

interface InitProjectOptions {
  projectPath: string;
  projectName: string;
  template: ProjectTemplate;
  repository: string;
  withDb: boolean;
  withRedis: boolean;
  stagingDomain?: string;
  productionDomain?: string;
  enablePreview?: boolean;
  enableCanary?: boolean;
}

/**
 * 프로젝트 배포 초기화
 */
export async function initProject(options: InitProjectOptions): Promise<DeployFolder> {
  const {
    projectPath,
    projectName,
    template,
    repository,
    withDb,
    withRedis,
    stagingDomain,
    productionDomain,
    enablePreview = true,
    enableCanary = false,
  } = options;

  // 1. 서버 상태 분석 및 포트 할당
  await analyzeServer();
  const portAllocation = portRegistry.allocateProjectPorts(projectName, {
    app: true,
    db: withDb,
    redis: withRedis,
  });

  // 2. 프로젝트 설정 생성
  const config = createProjectConfig({
    projectName,
    template,
    repository,
    portAllocation,
    stagingDomain,
    productionDomain,
    enablePreview,
    enableCanary,
  });

  // 3. 폴더 구조 생성
  const deployPath = join(projectPath, 'deploy');
  const githubPath = join(projectPath, '.github', 'workflows');

  mkdirSync(join(deployPath, 'scripts'), { recursive: true });
  mkdirSync(join(deployPath, 'docker'), { recursive: true });
  mkdirSync(githubPath, { recursive: true });

  // 4. 배포 스크립트 생성
  const scripts = generateDeployScripts(config);

  // 5. GitHub Actions 워크플로우 생성
  const workflows = generateGitHubWorkflows(config);

  // 6. Dockerfile 생성
  const dockerfiles = generateDockerfiles(config);

  // 7. 파일 쓰기
  // config.json
  writeFileSync(
    join(deployPath, 'config.json'),
    JSON.stringify(config, null, 2)
  );

  // 스크립트 파일
  for (const script of scripts) {
    const scriptPath = join(deployPath, script.path);
    writeFileSync(scriptPath, script.content);
    if (script.executable) {
      // chmod +x는 Git에서 관리
    }
  }

  // GitHub Actions
  for (const workflow of workflows) {
    writeFileSync(
      join(githubPath, workflow.filename),
      workflow.content
    );
  }

  // Dockerfiles
  for (const dockerfile of dockerfiles) {
    writeFileSync(
      join(deployPath, dockerfile.path),
      dockerfile.content
    );
  }

  return {
    projectPath,
    config,
    scripts,
    workflows,
    dockerfiles,
  };
}

/**
 * 프로젝트 설정 생성
 */
function createProjectConfig(params: {
  projectName: string;
  template: ProjectTemplate;
  repository: string;
  portAllocation: ReturnType<typeof portRegistry.allocateProjectPorts>;
  stagingDomain?: string;
  productionDomain?: string;
  enablePreview: boolean;
  enableCanary: boolean;
}): ProjectConfig {
  const {
    projectName,
    template,
    repository,
    portAllocation,
    stagingDomain,
    productionDomain,
    enablePreview,
    enableCanary,
  } = params;

  return {
    version: '1.0',
    project: {
      name: projectName,
      template,
      repository,
      createdAt: new Date().toISOString(),
    },
    server: {
      host: process.env.CODEB_SERVER_HOST || '141.164.60.51',
      user: process.env.CODEB_SERVER_USER || 'root',
      basePath: `/opt/codeb-projects/${projectName}`,
    },
    environments: {
      staging: {
        ports: portAllocation.environments.staging,
        domain: stagingDomain,
        envFile: '.env.staging',
        replicas: 1,
        resources: { memory: '512m', cpu: '0.5' },
      },
      production: {
        ports: portAllocation.environments.production,
        domain: productionDomain,
        envFile: '.env.production',
        replicas: 2,
        resources: { memory: '1g', cpu: '1' },
      },
    },
    ci: {
      enabled: true,
      stages: {
        lint: true,
        typecheck: template === 'nextjs' || template === 'remix',
        unitTest: true,
        integrationTest: true,
        e2eTest: true,
        securityScan: true,
        buildVerify: true,
      },
      e2e: {
        browser: 'chromium',
        baseUrl: stagingDomain ? `https://${stagingDomain}` : `http://localhost:${portAllocation.environments.staging.app}`,
      },
    },
    healthCheck: {
      enabled: true,
      endpoint: '/api/health',
      timeout: 30,
      interval: 10,
      retries: 3,
      startPeriod: 40,
    },
    deployment: {
      strategy: enableCanary ? 'canary' : 'blue-green',
      blueGreen: {
        enabled: !enableCanary,
        switchTimeout: 300,
      },
      canary: {
        enabled: enableCanary,
        steps: [10, 30, 50, 100],
        interval: 60,
        thresholds: {
          errorRate: 1,
          latency: 500,
        },
      },
      preview: {
        enabled: enablePreview,
        ttl: 24,
        autoCleanup: true,
      },
    },
    rollback: {
      enabled: true,
      automatic: true,
      keepVersions: 5,
      triggers: {
        healthCheckFail: true,
        errorRateThreshold: 5,
        latencyThreshold: 1000,
      },
    },
    monitoring: {
      enabled: true,
      prometheus: {
        enabled: true,
        scrapeInterval: 15,
        port: 9090,
      },
      grafana: {
        enabled: true,
        dashboards: ['nodejs', 'podman', 'system'],
      },
      sentry: {
        enabled: false,
        dsn: '',
      },
    },
    notifications: {
      channels: [
        {
          type: 'slack',
          enabled: true,
          webhook: process.env.SLACK_WEBHOOK_URL || '',
          severity: 'all',
        },
        {
          type: 'pagerduty',
          enabled: false,
          apiKey: '',
          severity: 'critical',
        },
      ],
      events: {
        deployStart: true,
        deploySuccess: true,
        deployFail: true,
        rollback: true,
        healthCheckFail: true,
        securityAlert: true,
      },
    },
  };
}

/**
 * 배포 스크립트 생성
 */
function generateDeployScripts(config: ProjectConfig): GeneratedScript[] {
  const scripts: GeneratedScript[] = [];
  const { project, server, environments, healthCheck } = config;

  // setup.sh - 초기 설정
  scripts.push({
    name: 'setup.sh',
    path: 'scripts/setup.sh',
    executable: true,
    content: `#!/bin/bash
# CodeB Deploy - 초기 설정 스크립트
# Project: ${project.name}
# Generated: ${new Date().toISOString()}

set -euo pipefail

PROJECT_NAME="${project.name}"
SERVER_HOST="${server.host}"
SERVER_USER="${server.user}"
BASE_PATH="${server.basePath}"

# 색상 정의
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m'

log_info() { echo -e "\${GREEN}[INFO]\${NC} $1"; }
log_warn() { echo -e "\${YELLOW}[WARN]\${NC} $1"; }
log_error() { echo -e "\${RED}[ERROR]\${NC} $1"; }

log_info "🚀 Setting up $PROJECT_NAME..."

# 서버 디렉토리 생성
ssh $SERVER_USER@$SERVER_HOST << 'REMOTE_SCRIPT'
set -e

# 프로젝트 디렉토리 구조
mkdir -p ${BASE_PATH}/{staging,production,shared,backups,logs}
mkdir -p ${BASE_PATH}/shared/{uploads,cache}

# Podman 네트워크 생성
podman network exists codeb-network 2>/dev/null || podman network create codeb-network

# 환경별 PostgreSQL 컨테이너
${environments.staging.ports.db ? `
podman run -d \\
  --name codeb-db-${project.name}-staging \\
  --network codeb-network \\
  -e POSTGRES_DB=${project.name}_staging \\
  -e POSTGRES_USER=codeb \\
  -e POSTGRES_PASSWORD=$(openssl rand -base64 32) \\
  -p ${environments.staging.ports.db}:5432 \\
  -v ${server.basePath}/staging/postgres:/var/lib/postgresql/data \\
  --restart unless-stopped \\
  postgres:15-alpine || true
` : ''}

${environments.production.ports.db ? `
podman run -d \\
  --name codeb-db-${project.name}-prod \\
  --network codeb-network \\
  -e POSTGRES_DB=${project.name}_prod \\
  -e POSTGRES_USER=codeb \\
  -e POSTGRES_PASSWORD=$(openssl rand -base64 32) \\
  -p ${environments.production.ports.db}:5432 \\
  -v ${server.basePath}/production/postgres:/var/lib/postgresql/data \\
  --restart unless-stopped \\
  postgres:15-alpine || true
` : ''}

# 환경별 Redis 컨테이너
${environments.staging.ports.redis ? `
podman run -d \\
  --name codeb-redis-${project.name}-staging \\
  --network codeb-network \\
  -p ${environments.staging.ports.redis}:6379 \\
  --restart unless-stopped \\
  redis:7-alpine --requirepass $(openssl rand -base64 16) || true
` : ''}

${environments.production.ports.redis ? `
podman run -d \\
  --name codeb-redis-${project.name}-prod \\
  --network codeb-network \\
  -p ${environments.production.ports.redis}:6379 \\
  --restart unless-stopped \\
  redis:7-alpine --requirepass $(openssl rand -base64 16) || true
` : ''}

echo "✅ Server setup complete!"
REMOTE_SCRIPT

log_info "✅ Setup complete for $PROJECT_NAME"
`,
  });

  // deploy.sh - 배포 스크립트
  scripts.push({
    name: 'deploy.sh',
    path: 'scripts/deploy.sh',
    executable: true,
    content: `#!/bin/bash
# CodeB Deploy - 배포 스크립트
# Project: ${project.name}

set -euo pipefail

ENVIRONMENT=\${1:-staging}
VERSION=\${2:-latest}
PROJECT_NAME="${project.name}"
SERVER_HOST="${server.host}"
SERVER_USER="${server.user}"
BASE_PATH="${server.basePath}"

# 환경별 포트
if [ "$ENVIRONMENT" = "production" ]; then
  APP_PORT=${environments.production.ports.app}
else
  APP_PORT=${environments.staging.ports.app}
fi

log_info() { echo -e "\\033[0;32m[INFO]\\033[0m $1"; }
log_error() { echo -e "\\033[0;31m[ERROR]\\033[0m $1"; }

log_info "🚀 Deploying $PROJECT_NAME to $ENVIRONMENT (version: $VERSION)"

# 1. 이미지 빌드 및 푸시 (GitHub Actions에서 수행)
# 여기서는 이미지가 레지스트리에 있다고 가정

# 2. 배포 실행
ssh $SERVER_USER@$SERVER_HOST << REMOTE_SCRIPT
set -e

cd $BASE_PATH/$ENVIRONMENT

# 이전 버전 백업
PREV_VERSION=\$(cat .current-version 2>/dev/null || echo "none")
echo "\$PREV_VERSION" > .previous-version

# 새 컨테이너 시작 (Blue-Green)
CONTAINER_NAME="codeb-app-${project.name}-\${ENVIRONMENT}"
NEW_CONTAINER="\${CONTAINER_NAME}-\$(date +%s)"

podman run -d \\
  --name \$NEW_CONTAINER \\
  --network codeb-network \\
  -p $APP_PORT:3000 \\
  --env-file $BASE_PATH/\$ENVIRONMENT/.env \\
  --health-cmd="curl -f http://localhost:3000${healthCheck.endpoint} || exit 1" \\
  --health-interval=${healthCheck.interval}s \\
  --health-timeout=${healthCheck.timeout}s \\
  --health-retries=${healthCheck.retries} \\
  --health-start-period=${healthCheck.startPeriod}s \\
  localhost:5000/${project.name}:$VERSION

# 헬스체크 대기
log_info "⏳ Waiting for health check..."
for i in {1..${healthCheck.retries * 2}}; do
  if podman healthcheck run \$NEW_CONTAINER 2>/dev/null; then
    log_info "✅ Health check passed!"
    break
  fi
  sleep 5
done

# 이전 컨테이너 정리
podman stop \$CONTAINER_NAME 2>/dev/null || true
podman rm \$CONTAINER_NAME 2>/dev/null || true
podman rename \$NEW_CONTAINER \$CONTAINER_NAME

# 버전 기록
echo "$VERSION" > .current-version

log_info "✅ Deployment complete!"
REMOTE_SCRIPT

# 3. 헬스체크 검증
./scripts/healthcheck.sh $ENVIRONMENT
`,
  });

  // healthcheck.sh
  scripts.push({
    name: 'healthcheck.sh',
    path: 'scripts/healthcheck.sh',
    executable: true,
    content: `#!/bin/bash
# CodeB Deploy - 헬스체크 스크립트

set -euo pipefail

ENVIRONMENT=\${1:-staging}
PROJECT_NAME="${project.name}"
SERVER_HOST="${server.host}"

if [ "$ENVIRONMENT" = "production" ]; then
  APP_PORT=${environments.production.ports.app}
  DOMAIN="${environments.production.domain || ''}"
else
  APP_PORT=${environments.staging.ports.app}
  DOMAIN="${environments.staging.domain || ''}"
fi

ENDPOINT="${healthCheck.endpoint}"
TIMEOUT=${healthCheck.timeout}
RETRIES=${healthCheck.retries}

log_info() { echo -e "\\033[0;32m[INFO]\\033[0m $1"; }
log_error() { echo -e "\\033[0;31m[ERROR]\\033[0m $1"; }

log_info "🏥 Running health check for $PROJECT_NAME ($ENVIRONMENT)"

# URL 결정
if [ -n "$DOMAIN" ]; then
  URL="https://$DOMAIN$ENDPOINT"
else
  URL="http://$SERVER_HOST:$APP_PORT$ENDPOINT"
fi

# 헬스체크 실행
for i in $(seq 1 $RETRIES); do
  log_info "Attempt $i/$RETRIES: $URL"

  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "$URL" 2>/dev/null || echo "000")

  if [ "$RESPONSE" = "200" ]; then
    log_info "✅ Health check passed! (HTTP $RESPONSE)"
    exit 0
  fi

  log_info "❌ Health check failed (HTTP $RESPONSE), retrying..."
  sleep 5
done

log_error "❌ Health check failed after $RETRIES attempts"
exit 1
`,
  });

  // rollback.sh
  scripts.push({
    name: 'rollback.sh',
    path: 'scripts/rollback.sh',
    executable: true,
    content: `#!/bin/bash
# CodeB Deploy - 롤백 스크립트

set -euo pipefail

ENVIRONMENT=\${1:-staging}
TARGET_VERSION=\${2:-previous}
PROJECT_NAME="${project.name}"
SERVER_HOST="${server.host}"
SERVER_USER="${server.user}"
BASE_PATH="${server.basePath}"

log_info() { echo -e "\\033[0;32m[INFO]\\033[0m $1"; }
log_error() { echo -e "\\033[0;31m[ERROR]\\033[0m $1"; }
log_warn() { echo -e "\\033[1;33m[WARN]\\033[0m $1"; }

log_warn "⚠️ Rolling back $PROJECT_NAME ($ENVIRONMENT) to $TARGET_VERSION"

ssh $SERVER_USER@$SERVER_HOST << REMOTE_SCRIPT
set -e

cd $BASE_PATH/$ENVIRONMENT

# 롤백 버전 결정
if [ "$TARGET_VERSION" = "previous" ]; then
  ROLLBACK_VERSION=\$(cat .previous-version 2>/dev/null)
  if [ -z "\$ROLLBACK_VERSION" ] || [ "\$ROLLBACK_VERSION" = "none" ]; then
    echo "❌ No previous version found!"
    exit 1
  fi
else
  ROLLBACK_VERSION="$TARGET_VERSION"
fi

CURRENT_VERSION=\$(cat .current-version 2>/dev/null || echo "unknown")
echo "Rolling back from \$CURRENT_VERSION to \$ROLLBACK_VERSION"

# 롤백 실행 (기존 배포 스크립트 재사용)
REMOTE_SCRIPT

./scripts/deploy.sh $ENVIRONMENT \$ROLLBACK_VERSION

log_info "✅ Rollback complete!"
`,
  });

  return scripts;
}

/**
 * GitHub Actions 워크플로우 생성
 */
function generateGitHubWorkflows(config: ProjectConfig): GitHubActionsWorkflow[] {
  const workflows: GitHubActionsWorkflow[] = [];
  const { project, ci, deployment } = config;

  // CI 워크플로우
  workflows.push({
    name: 'CI Pipeline',
    filename: 'ci.yml',
    content: `name: CI Pipeline

on:
  push:
    branches: [main, develop, staging]
  pull_request:
    branches: [main, develop]

env:
  NODE_VERSION: '20'

jobs:
  lint:
    name: Lint & Format
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check

${ci.stages.typecheck ? `
  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
` : ''}

  test-unit:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

${ci.stages.e2eTest ? `
  test-e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
` : ''}

${ci.stages.securityScan ? `
  security-scan:
    name: Security Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'
      - name: Run gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
` : ''}

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint${ci.stages.typecheck ? ', typecheck' : ''}, test-unit]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: build
          path: .next/
          retention-days: 1
`,
  });

  // Staging 배포 워크플로우
  workflows.push({
    name: 'Deploy Staging',
    filename: 'deploy-staging.yml',
    content: `name: Deploy to Staging

on:
  push:
    branches: [develop, staging]
  workflow_dispatch:

env:
  REGISTRY: localhost:5000
  IMAGE_NAME: ${project.name}

jobs:
  deploy:
    name: Deploy to Staging
    runs-on: self-hosted
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - name: Set version
        id: version
        run: echo "VERSION=\${{ github.sha }}-\$(date +%Y%m%d%H%M%S)" >> $GITHUB_OUTPUT

      - name: Build image
        run: |
          podman build -t \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ steps.version.outputs.VERSION }} .
          podman tag \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ steps.version.outputs.VERSION }} \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:staging

      - name: Push to registry
        run: |
          podman push \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ steps.version.outputs.VERSION }}
          podman push \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:staging

      - name: Deploy
        run: ./deploy/scripts/deploy.sh staging \${{ steps.version.outputs.VERSION }}

      - name: Health check
        run: ./deploy/scripts/healthcheck.sh staging

      - name: Notify Slack
        if: always()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "\${{ job.status == 'success' && '✅' || '❌' }} Staging deployment \${{ job.status }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*${project.name}* staging deployment \${{ job.status }}\\nVersion: \${{ steps.version.outputs.VERSION }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: \${{ secrets.SLACK_WEBHOOK_URL }}
`,
  });

  // Production 배포 워크플로우 (Blue-Green/Canary)
  workflows.push({
    name: 'Deploy Production',
    filename: 'deploy-production.yml',
    content: `name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to deploy'
        required: false
      strategy:
        description: 'Deployment strategy'
        required: false
        default: '${deployment.strategy}'
        type: choice
        options:
          - blue-green
          - canary
          - rolling

env:
  REGISTRY: localhost:5000
  IMAGE_NAME: ${project.name}

jobs:
  deploy:
    name: Deploy to Production
    runs-on: self-hosted
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Set version
        id: version
        run: |
          if [ -n "\${{ github.event.inputs.version }}" ]; then
            echo "VERSION=\${{ github.event.inputs.version }}" >> $GITHUB_OUTPUT
          else
            echo "VERSION=\${{ github.sha }}-\$(date +%Y%m%d%H%M%S)" >> $GITHUB_OUTPUT
          fi

      - name: Build image
        run: |
          podman build -t \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ steps.version.outputs.VERSION }} .
          podman tag \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ steps.version.outputs.VERSION }} \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:production

      - name: Push to registry
        run: |
          podman push \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ steps.version.outputs.VERSION }}
          podman push \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:production

${deployment.canary?.enabled ? `
      - name: Canary deployment (10%)
        run: ./deploy/scripts/canary.sh production \${{ steps.version.outputs.VERSION }} 10

      - name: Wait and verify (10%)
        run: sleep 60 && ./deploy/scripts/verify-canary.sh production

      - name: Canary deployment (50%)
        run: ./deploy/scripts/canary.sh production \${{ steps.version.outputs.VERSION }} 50

      - name: Wait and verify (50%)
        run: sleep 60 && ./deploy/scripts/verify-canary.sh production

      - name: Full deployment (100%)
        run: ./deploy/scripts/deploy.sh production \${{ steps.version.outputs.VERSION }}
` : `
      - name: Blue-Green deployment
        run: ./deploy/scripts/deploy.sh production \${{ steps.version.outputs.VERSION }}
`}

      - name: Health check
        run: ./deploy/scripts/healthcheck.sh production

      - name: Rollback on failure
        if: failure()
        run: ./deploy/scripts/rollback.sh production previous

      - name: Notify
        if: always()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "\${{ job.status == 'success' && '🚀' || '🔥' }} Production deployment \${{ job.status }}"
            }
        env:
          SLACK_WEBHOOK_URL: \${{ secrets.SLACK_WEBHOOK_URL }}
`,
  });

  // Preview 환경 워크플로우
  if (deployment.preview?.enabled) {
    workflows.push({
      name: 'Preview Environment',
      filename: 'preview.yml',
      content: `name: Preview Environment

on:
  pull_request:
    types: [opened, synchronize, reopened]

env:
  REGISTRY: localhost:5000
  IMAGE_NAME: ${project.name}

jobs:
  preview:
    name: Deploy Preview
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4

      - name: Set preview info
        id: preview
        run: |
          echo "PR_NUMBER=\${{ github.event.pull_request.number }}" >> $GITHUB_OUTPUT
          echo "VERSION=pr-\${{ github.event.pull_request.number }}-\${{ github.sha }}" >> $GITHUB_OUTPUT

      - name: Build preview image
        run: |
          podman build -t \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ steps.preview.outputs.VERSION }} .

      - name: Deploy preview
        run: ./deploy/scripts/preview.sh \${{ steps.preview.outputs.PR_NUMBER }} \${{ steps.preview.outputs.VERSION }}

      - name: Comment PR
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: \${{ steps.preview.outputs.PR_NUMBER }},
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '🔍 Preview deployed: http://preview-\${{ steps.preview.outputs.PR_NUMBER }}.${config.server.host}'
            })

  cleanup:
    name: Cleanup Preview
    runs-on: self-hosted
    if: github.event.action == 'closed'
    steps:
      - uses: actions/checkout@v4
      - name: Remove preview
        run: ./deploy/scripts/preview-cleanup.sh \${{ github.event.pull_request.number }}
`,
    });
  }

  return workflows;
}

/**
 * Dockerfile 생성
 */
function generateDockerfiles(config: ProjectConfig): GeneratedScript[] {
  const { project } = config;
  const dockerfiles: GeneratedScript[] = [];

  // 템플릿별 Dockerfile
  const dockerfileContent = getDockerfileTemplate(project.template);

  dockerfiles.push({
    name: 'Dockerfile',
    path: 'docker/Dockerfile',
    executable: false,
    content: dockerfileContent,
  });

  // .dockerignore
  dockerfiles.push({
    name: '.dockerignore',
    path: 'docker/.dockerignore',
    executable: false,
    content: `node_modules
.git
.gitignore
*.md
.env*
.next
dist
coverage
playwright-report
test-results
`,
  });

  return dockerfiles;
}

/**
 * 템플릿별 Dockerfile
 */
function getDockerfileTemplate(template: ProjectTemplate): string {
  switch (template) {
    case 'nextjs':
      return `# Next.js Production Dockerfile
FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \\
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
`;

    case 'remix':
      return `# Remix Production Dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS production
WORKDIR /app
ENV NODE_ENV production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/public ./public
COPY package*.json ./

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \\
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["npm", "start"]
`;

    case 'nodejs':
    default:
      return `# Node.js Production Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV NODE_ENV production
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \\
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
`;
  }
}
