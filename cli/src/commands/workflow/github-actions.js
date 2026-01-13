/**
 * GitHub Actions Workflow Generator (v7.0)
 *
 * Generates CI/CD workflow files for GitHub Actions
 *
 * v7.0 방식:
 * - Self-hosted runner (App Server)에서 빌드 및 배포
 * - Podman을 사용한 컨테이너 빌드/푸시
 * - MCP API를 통한 Blue-Green 배포
 */

import { getServerHost, getServerUser, getCliVersion } from '../../lib/config.js';

/**
 * Generate GitHub Actions CI/CD workflow (v7.0 Self-hosted runner)
 * @param {Object} config - Project configuration
 * @returns {string} GitHub Actions workflow YAML content
 */
export function generateGitHubActionsWorkflow(config) {
  const {
    projectName,
    projectType = 'nextjs',
    nodeVersion = '20',
    environments = ['staging', 'production'],
    registry = 'ghcr.io',
    serverHost = getServerHost(),
    serverUser = getServerUser(),
    ports = { staging: 3001, production: 3000 },
    domains = {},
    includeTests = false,  // Self-hosted에서는 기본 비활성화 (빌드 속도)
    includeLint = false,   // Self-hosted에서는 기본 비활성화 (빌드 속도)
    useQuadlet = true,
    useDatabase = true,
    useRedis = false,
    baseDomain = 'codeb.kr',
    // v7.0: Self-hosted runner 기본 사용
    useSelfHosted = true
  } = config;

  // v7.0 Self-hosted runner build & deploy job
  const selfHostedJob = `  # ============================================
  # Build & Deploy Job (Self-hosted runner)
  # App Server에서 직접 빌드 및 배포
  # 요구사항: runner에 'docker' 라벨이 있어야 함 (Docker 권한 보장)
  # ============================================
  build-and-deploy:
    name: Build & Deploy
    runs-on: [self-hosted, docker]  # Docker 권한이 있는 러너에서만 실행

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Determine environment
        id: env
        run: |
          if [ "\${{ github.event_name }}" = "workflow_dispatch" ]; then
            echo "environment=\${{ github.event.inputs.environment }}" >> \$GITHUB_OUTPUT
          elif [ "\${{ github.ref }}" = "refs/heads/main" ]; then
            echo "environment=production" >> \$GITHUB_OUTPUT
          else
            echo "environment=staging" >> \$GITHUB_OUTPUT
          fi
          echo "image_tag=\${{ github.sha }}" >> \$GITHUB_OUTPUT

      - name: Login to GHCR
        run: |
          echo "\${{ secrets.GHCR_PAT }}" | docker login ghcr.io -u \${{ github.actor }} --password-stdin

      - name: Build and Push with Docker
        run: |
          IMAGE_TAG="\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ github.sha }}"

          echo "Building image: \$IMAGE_TAG"
          docker build --no-cache --build-arg NPM_TOKEN=\${{ secrets.GHCR_PAT }} -t "\$IMAGE_TAG" .

          echo "Pushing image: \$IMAGE_TAG"
          docker push "\$IMAGE_TAG"

          echo "image_url=\$IMAGE_TAG" >> \$GITHUB_OUTPUT

      - name: Deploy via CodeB MCP API v7.0
        id: deploy
        timeout-minutes: 5
        run: |
          echo "Deploying to \${{ steps.env.outputs.environment }}..."

          # API 호출 (최대 3분 대기 - 이미지 pull + health check 시간 포함)
          RESPONSE=\$(curl -sf --max-time 180 -X POST "https://api.codeb.kr/api/tool" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "tool": "deploy",
              "params": {
                "projectName": "${projectName}",
                "environment": "'\${{ steps.env.outputs.environment }}'",
                "version": "'\${{ github.sha }}'",
                "image": "'\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ github.sha }}'"
              }
            }' 2>&1) || true

          echo "API Response: \$RESPONSE"

          # Check success
          SUCCESS=\$(echo "\$RESPONSE" | jq -r '.success // false')
          if [ "\$SUCCESS" = "true" ]; then
            PREVIEW_URL=\$(echo "\$RESPONSE" | jq -r '.result.previewUrl // "N/A"')
            SLOT=\$(echo "\$RESPONSE" | jq -r '.result.slot // "unknown"')
            echo "preview_url=\$PREVIEW_URL" >> \$GITHUB_OUTPUT
            echo "slot=\$SLOT" >> \$GITHUB_OUTPUT
            echo "✅ Deploy success! Slot: \$SLOT"
          else
            ERROR=\$(echo "\$RESPONSE" | jq -r '.error // "Unknown error"')
            echo "❌ Deploy failed: \$ERROR"
            exit 1
          fi

      - name: Cleanup old images
        if: always()
        run: |
          docker image prune -f 2>/dev/null || true

      - name: Deployment Summary
        if: always()
        run: |
          echo ""
          echo "=========================================="
          echo "Deployment Summary"
          echo "=========================================="
          echo "Project: ${projectName}"
          echo "Environment: \${{ steps.env.outputs.environment }}"
          echo "Slot: \${{ steps.deploy.outputs.slot }}"
          echo "Image: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ github.sha }}"
          echo "Preview URL: \${{ steps.deploy.outputs.preview_url }}"
          echo "Commit: \${{ github.sha }}"`;

  // Legacy GitHub-hosted build job (fallback)
  const githubHostedBuildJob = `  # ============================================
  # Build Job (GitHub-hosted) - Legacy fallback
  # ============================================
  build:
    name: Build & Push Image
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    outputs:
      image_tag: \${{ steps.meta.outputs.version }}
      environment: \${{ steps.env.outputs.environment }}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Determine environment
        id: env
        run: |
          if [ "\${{ github.event_name }}" = "workflow_dispatch" ]; then
            echo "environment=\${{ github.event.inputs.environment }}" >> \$GITHUB_OUTPUT
          elif [ "\${{ github.ref }}" = "refs/heads/main" ]; then
            echo "environment=production" >> \$GITHUB_OUTPUT
          else
            echo "environment=staging" >> \$GITHUB_OUTPUT
          fi

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci --legacy-peer-deps

${includeLint ? `      - name: Run linter
        run: npm run lint --if-present
        continue-on-error: true

` : ''}${includeTests ? `      - name: Run tests
        run: npm test --if-present
        continue-on-error: true

` : ''}      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GHCR_PAT }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=sha,prefix=
            type=raw,value=latest,enable=\${{ github.ref == 'refs/heads/main' }}
            type=raw,value=\${{ steps.env.outputs.environment }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            BUILDTIME=\${{ github.event.head_commit.timestamp }}
            VERSION=\${{ github.sha }}
            REVISION=\${{ github.sha }}`;

  // SSH Deploy (Admin용)
  const sshDeployJob = `
  # ============================================
  # Deploy via SSH (Admin)
  # ============================================
  deploy:
    name: Deploy via SSH
    runs-on: ubuntu-latest
    needs: build
    if: |
      always() &&
      needs.build.result == 'success' &&
      (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop' || github.event_name == 'workflow_dispatch')

    env:
      ENVIRONMENT: \${{ needs.build.outputs.environment }}
      IMAGE_TAG: \${{ needs.build.outputs.image_tag }}

    steps:
      - name: Set deployment variables
        id: vars
        run: |
          if [ "\${{ env.ENVIRONMENT }}" = "production" ]; then
            echo "container_name=${projectName}" >> \$GITHUB_OUTPUT
            echo "port=${ports.production}" >> \$GITHUB_OUTPUT
            echo "url=${domains.production || projectName + '.' + baseDomain}" >> \$GITHUB_OUTPUT
          else
            echo "container_name=${projectName}-staging" >> \$GITHUB_OUTPUT
            echo "port=${ports.staging}" >> \$GITHUB_OUTPUT
            echo "url=${domains.staging || projectName + '-staging.' + baseDomain}" >> \$GITHUB_OUTPUT
          fi

      - name: Deploy to server via SSH
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: \${{ secrets.SSH_HOST }}
          username: \${{ secrets.SSH_USER }}
          key: \${{ secrets.SSH_PRIVATE_KEY }}
          port: 22
          script_stop: true
          script: |
            set -e
            CONTAINER_NAME="\${{ steps.vars.outputs.container_name }}"
            IMAGE="\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ env.IMAGE_TAG }}"
            PORT="\${{ steps.vars.outputs.port }}"
            QUADLET_FILE="/etc/containers/systemd/\${CONTAINER_NAME}.container"

            echo "Deploying \${CONTAINER_NAME}..."
            echo "   Image: \${IMAGE}"
            echo "   Port: \${PORT}"

            # Login to ghcr.io
            echo "\${{ secrets.GITHUB_TOKEN }}" | podman login ghcr.io -u \${{ github.actor }} --password-stdin

            # Pull new image
            podman pull \${IMAGE}

            # Update Quadlet file if exists
            if [ -f "\$QUADLET_FILE" ]; then
              sed -i "s|^Image=.*|Image=\${IMAGE}|" "\$QUADLET_FILE"
            fi

            # Restart service
            systemctl daemon-reload
            systemctl stop \${CONTAINER_NAME}.service 2>/dev/null || true
            podman stop \${CONTAINER_NAME} --time 30 2>/dev/null || true
            podman rm \${CONTAINER_NAME} 2>/dev/null || true
            systemctl start \${CONTAINER_NAME}.service

            # Health check
            sleep 10
            MAX_RETRIES=15
            RETRY_COUNT=0
            while [ \$RETRY_COUNT -lt \$MAX_RETRIES ]; do
              response=\$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:\${PORT}/api/health 2>/dev/null || echo "000")
              if [ "\$response" = "200" ]; then
                echo "Health check passed!"
                break
              fi
              RETRY_COUNT=\$((RETRY_COUNT + 1))
              echo "   Attempt \$RETRY_COUNT/\$MAX_RETRIES (status: \$response)"
              sleep 3
            done
            if [ \$RETRY_COUNT -eq \$MAX_RETRIES ]; then
              echo "Health check failed!"
              podman logs \${CONTAINER_NAME} --tail 30
              exit 1
            fi

            # Cleanup
            podman image prune -f 2>/dev/null || true
            echo ""
            echo "=========================================="
            echo "Deployment Complete!"
            echo "=========================================="
            echo "Container: \${CONTAINER_NAME}"
            echo "Port: \${PORT}"
            echo "URL: https://\${{ steps.vars.outputs.url }}"

      - name: Deployment summary
        if: always()
        run: |
          echo ""
          echo "=========================================="
          echo "Deployment Summary"
          echo "=========================================="
          echo "Environment: \${{ env.ENVIRONMENT }}"
          echo "Container: \${{ steps.vars.outputs.container_name }}"
          echo "Image: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ env.IMAGE_TAG }}"
          echo "Port: \${{ steps.vars.outputs.port }}"
          echo "URL: https://\${{ steps.vars.outputs.url }}"
          echo "Commit: \${{ github.sha }}"`;

  // API Deploy (Developer용)
  const apiDeployJob = `
  # ============================================
  # Deploy via MCP API (Developer)
  # Requires: CODEB_API_KEY secret
  # ============================================
  deploy:
    name: Deploy via API
    runs-on: ubuntu-latest
    needs: build
    if: |
      always() &&
      needs.build.result == 'success' &&
      (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop' || github.event_name == 'workflow_dispatch')

    env:
      ENVIRONMENT: \${{ needs.build.outputs.environment }}
      IMAGE_TAG: \${{ needs.build.outputs.image_tag }}

    steps:
      - name: Set deployment variables
        id: vars
        run: |
          if [ "\${{ env.ENVIRONMENT }}" = "production" ]; then
            echo "container_name=${projectName}" >> \$GITHUB_OUTPUT
            echo "port=${ports.production}" >> \$GITHUB_OUTPUT
            echo "url=${domains.production || projectName + '.' + baseDomain}" >> \$GITHUB_OUTPUT
          else
            echo "container_name=${projectName}-staging" >> \$GITHUB_OUTPUT
            echo "port=${ports.staging}" >> \$GITHUB_OUTPUT
            echo "url=${domains.staging || projectName + '-staging.' + baseDomain}" >> \$GITHUB_OUTPUT
          fi

      - name: Deploy via CodeB API
        run: |
          # Call CodeB API for deployment
          response=\$(curl -sf -X POST "https://app.codeb.kr/api/deploy" \\
            -H "Authorization: Bearer \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "project": "${projectName}",
              "environment": "'\${{ env.ENVIRONMENT }}'",
              "image": "'\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ env.IMAGE_TAG }}'",
              "port": '\${{ steps.vars.outputs.port }}'
            }' 2>&1) || true

          echo "API Response: \$response"

          # Check if deployment was successful
          success=\$(echo "\$response" | jq -r '.success // false')
          if [ "\$success" != "true" ]; then
            echo "Deployment failed!"
            error=\$(echo "\$response" | jq -r '.error // "Unknown error"')
            echo "Error: \$error"
            exit 1
          fi

          echo ""
          echo "=========================================="
          echo "Deployment Complete!"
          echo "=========================================="
          echo "Project: ${projectName}"
          echo "Environment: \${{ env.ENVIRONMENT }}"
          echo "URL: https://\${{ steps.vars.outputs.url }}"

      - name: Deployment summary
        if: always()
        run: |
          echo ""
          echo "=========================================="
          echo "Deployment Summary"
          echo "=========================================="
          echo "Method: API (Developer)"
          echo "Environment: \${{ env.ENVIRONMENT }}"
          echo "Container: \${{ steps.vars.outputs.container_name }}"
          echo "Image: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ env.IMAGE_TAG }}"
          echo "Port: \${{ steps.vars.outputs.port }}"
          echo "URL: https://\${{ steps.vars.outputs.url }}"
          echo "Commit: \${{ github.sha }}"`;

  // v7.0: Self-hosted runner가 기본값
  // useSelfHosted가 true면 Self-hosted runner 방식, false면 레거시 GitHub-hosted 방식
  if (useSelfHosted) {
    // v7.0 Self-hosted runner workflow
    const workflow = `# ${projectName} CI/CD Pipeline
# Generated by CodeB CLI v${getCliVersion()}
# Build & Deploy: Self-hosted runner (App Server) + Podman + MCP API v7.0

name: ${projectName} CI/CD

on:
  push:
    branches: [main, develop]
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
  REGISTRY: ${registry}
  IMAGE_NAME: \${{ github.repository }}
  NODE_VERSION: '${nodeVersion}'

# Cancel in-progress runs for the same branch
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
${selfHostedJob}
`;
    return workflow;
  }

  // Legacy GitHub-hosted workflow (fallback)
  const deployJob = sshDeployJob;

  const workflow = `# ${projectName} CI/CD Pipeline
# Generated by CodeB CLI v${getCliVersion()}
# Build: GitHub-hosted runners (ubuntu-latest) - Legacy mode
# Deploy: SSH (Admin - SSH_PRIVATE_KEY)

name: ${projectName} CI/CD

on:
  push:
    branches: [main, develop]
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
  REGISTRY: ${registry}
  IMAGE_NAME: \${{ github.repository }}
  NODE_VERSION: '${nodeVersion}'

# Cancel in-progress runs for the same branch
concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
${githubHostedBuildJob}
${deployJob}
`;

  return workflow;
}
