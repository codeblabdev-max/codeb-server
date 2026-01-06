/**
 * GitHub Actions Workflow Generator
 *
 * Generates CI/CD workflow files for GitHub Actions
 * Deploy method:
 * - API: MCP API (기본값, 권장) - CODEB_API_KEY 사용
 * - SSH: Admin 전용 (비권장) - SSH_PRIVATE_KEY 사용
 */

import { getServerHost, getServerUser, getCliVersion } from '../../lib/config.js';

/**
 * Generate GitHub Actions CI/CD workflow
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
    includeTests = true,
    includeLint = true,
    useQuadlet = true,
    useDatabase = true,
    useRedis = false,
    baseDomain = 'codeb.kr',
    // Deploy method: 'api' (기본값, MCP API) or 'ssh' (Admin 전용)
    deployMethod = 'api'
  } = config;

  // Common build job
  const buildJob = `  # ============================================
  # Build Job (GitHub-hosted)
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
        run: npm ci

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

  // Select deploy method
  const deployJob = deployMethod === 'api' ? apiDeployJob : sshDeployJob;
  const deployMethodComment = deployMethod === 'api'
    ? '# Deploy: API (Developer - CODEB_API_KEY)'
    : '# Deploy: SSH (Admin - SSH_PRIVATE_KEY)';

  const workflow = `# ${projectName} CI/CD Pipeline
# Generated by CodeB CLI v${getCliVersion()}
# Build: GitHub-hosted runners (ubuntu-latest)
${deployMethodComment}

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
${buildJob}
${deployJob}
`;

  return workflow;
}
