/**
 * CodeB v6.0 - Safe Zero-Downtime Migration
 *
 * 핵심 원칙:
 * 1. 기존 서비스 절대 중단 금지 - 기존 컨테이너 유지하면서 병렬 구조 생성
 * 2. DB/볼륨 삭제 금지 - 기존 마운트 그대로 유지
 * 3. 다음 배포부터 새 구조 - 레지스트리만 생성하고 기존 포트 그대로 사용
 */

import { randomBytes } from 'crypto';
import type { AuthContext } from '../lib/types.js';
import { withSSH } from '../lib/ssh.js';
import { SERVERS } from '../lib/servers.js';
import type {
  LegacyDetectionResult,
  MigrationPlan,
  MigrationResult,
} from '../lib/legacy-types.js';

// ============================================================================
// Constants
// ============================================================================

const LEGACY_SSOT_PATH = '/opt/codeb/registry/ssot.json';
const V6_REGISTRY_PATH = '/opt/codeb/registry/slots';
const MIGRATION_LOG_PATH = '/opt/codeb/logs/migrations';
const ENV_BACKUP_PATH = '/opt/codeb/env-backup';

// Port ranges (Blue-Green)
const PORT_RANGES = {
  staging: { blue: { start: 3000, end: 3249 }, green: { start: 3250, end: 3499 } },
  production: { blue: { start: 4000, end: 4249 }, green: { start: 4250, end: 4499 } },
};

// ============================================================================
// Safe Migration Strategy
// ============================================================================

/**
 * 안전한 마이그레이션 전략:
 *
 * Phase 1: 준비 (서비스 영향 없음)
 *   - 레거시 시스템 감지
 *   - v6.0 디렉토리 구조 생성
 *   - 슬롯 레지스트리 파일 생성 (기존 포트 그대로)
 *   - ENV 백업 생성
 *
 * Phase 2: 래퍼 (서비스 영향 없음)
 *   - 기존 컨테이너를 Blue 슬롯으로 "등록만" (재시작 없음)
 *   - Green 슬롯은 비어있는 상태로 준비
 *   - Caddy는 기존 포트 그대로 (변경 없음)
 *
 * Phase 3: 다음 배포 (자동)
 *   - GitHub Actions에서 `we deploy` 호출
 *   - Green 슬롯에 새 버전 배포
 *   - `we promote`로 트래픽 전환
 *   - 이전 Blue 슬롯 grace 상태로 전환
 */

export interface SafeMigrationOptions {
  /** 특정 프로젝트만 마이그레이션 */
  projects?: string[];
  /** 환경 필터 */
  environments?: ('staging' | 'production')[];
  /** dry-run 모드 */
  dryRun?: boolean;
  /** 강제 실행 (경고 무시) */
  force?: boolean;
}

export interface SafeMigrationResult {
  success: boolean;
  migrationId: string;
  phase: 'prepare' | 'wrap' | 'complete';
  registeredProjects: RegisteredProject[];
  warnings: string[];
  errors: string[];
  nextSteps: string[];
}

export interface RegisteredProject {
  name: string;
  environment: 'staging' | 'production';
  currentPort: number;
  bluePort: number;
  greenPort: number;
  status: 'registered' | 'ready' | 'failed';
  containerName: string;
  volumes: string[];
  envPath: string;
}

// ============================================================================
// Safe Migration Implementation
// ============================================================================

/**
 * 안전한 무중단 마이그레이션 실행
 */
export async function executeSafeMigration(
  detection: LegacyDetectionResult,
  options: SafeMigrationOptions,
  auth: AuthContext
): Promise<SafeMigrationResult> {
  const migrationId = `safe_mig_${randomBytes(8).toString('hex')}`;
  const result: SafeMigrationResult = {
    success: false,
    migrationId,
    phase: 'prepare',
    registeredProjects: [],
    warnings: [],
    errors: [],
    nextSteps: [],
  };

  if (options.dryRun) {
    return executeDryRun(detection, options, result);
  }

  return withSSH(SERVERS.app.ip, async (ssh) => {
    try {
      // ============================================================
      // Phase 1: 준비 (서비스 영향 없음)
      // ============================================================
      result.phase = 'prepare';

      // v6.0 디렉토리 구조 생성
      await ssh.exec(`mkdir -p ${V6_REGISTRY_PATH}`);
      await ssh.exec(`mkdir -p ${MIGRATION_LOG_PATH}`);
      await ssh.exec(`mkdir -p ${ENV_BACKUP_PATH}`);

      // 사용 중인 포트 수집
      const usedPorts = new Set<number>();
      for (const mapping of detection.portMappings) {
        usedPorts.add(mapping.port);
      }

      // 프로젝트 필터링
      let projects = detection.projects.filter((p) => p.canMigrate);
      if (options.projects && options.projects.length > 0) {
        projects = projects.filter((p) => options.projects!.includes(p.name));
      }

      // ============================================================
      // Phase 2: 래퍼 (서비스 영향 없음)
      // ============================================================
      result.phase = 'wrap';

      for (const project of projects) {
        for (const env of project.environments) {
          if (env.name === 'preview') continue;
          if (options.environments && !options.environments.includes(env.name as 'staging' | 'production')) {
            continue;
          }

          const environment = env.name as 'staging' | 'production';
          const currentPort = env.port || 0;

          // 기존 포트가 Blue 범위 내인지 확인
          const blueRange = PORT_RANGES[environment].blue;
          const greenRange = PORT_RANGES[environment].green;

          let bluePort: number;
          let greenPort: number;

          // 핵심: 기존 포트를 Blue로 사용 (재시작 없음!)
          if (currentPort >= blueRange.start && currentPort <= blueRange.end) {
            // 이미 Blue 범위 내 - 그대로 사용
            bluePort = currentPort;
          } else if (currentPort >= greenRange.start && currentPort <= greenRange.end) {
            // Green 범위 내 - 그대로 사용하되 Blue로 등록
            bluePort = currentPort;
            result.warnings.push(
              `${project.name}/${environment}: Port ${currentPort} is in green range but will be registered as blue slot`
            );
          } else {
            // 범위 외 - 그대로 사용 (재할당 없음!)
            bluePort = currentPort;
            result.warnings.push(
              `${project.name}/${environment}: Port ${currentPort} is outside slot ranges. ` +
              `Next deploy will use proper slot ports.`
            );
          }

          // Green 포트 할당 (새 배포용)
          greenPort = findAvailablePort(greenRange, usedPorts);
          usedPorts.add(greenPort);

          // 기존 컨테이너 정보 확인 (재시작 없음!)
          const containerName = env.containerName || `${project.name}-${environment}`;

          // 볼륨 정보 확인
          const volumeResult = await ssh.exec(
            `podman inspect ${containerName} --format '{{range .Mounts}}{{.Source}}:{{.Destination}} {{end}}' 2>/dev/null || echo ""`
          );
          const volumes = volumeResult.stdout.trim().split(' ').filter(Boolean);

          // ENV 파일 백업 (삭제 없이 복사만)
          const envPath = `/opt/codeb/projects/${project.name}/.env.${environment}`;
          const envBackupDir = `${ENV_BACKUP_PATH}/${project.name}/${environment}`;
          await ssh.exec(`mkdir -p ${envBackupDir}`);

          // master.env가 없으면 현재 파일을 master로 저장
          const masterExists = await ssh.exec(`test -f ${envBackupDir}/master.env && echo "yes" || echo "no"`);
          if (masterExists.stdout.trim() === 'no') {
            await ssh.exec(`cp ${envPath} ${envBackupDir}/master.env 2>/dev/null || true`);
          }
          // current.env 업데이트
          await ssh.exec(`cp ${envPath} ${envBackupDir}/current.env 2>/dev/null || true`);

          // 슬롯 레지스트리 생성 (기존 컨테이너 그대로!)
          const slotRegistry = {
            projectName: project.name,
            environment,
            activeSlot: 'blue',
            blue: {
              name: 'blue',
              state: 'active',
              port: bluePort,
              version: env.version || 'legacy',
              containerName: containerName,  // 기존 컨테이너 이름 그대로!
              deployedAt: new Date().toISOString(),
              deployedBy: 'migration',
              healthStatus: 'unknown',
              // 기존 정보 보존
              _legacy: {
                originalPort: currentPort,
                originalContainer: containerName,
                volumes,
                migratedAt: new Date().toISOString(),
              },
            },
            green: {
              name: 'green',
              state: 'empty',
              port: greenPort,
              // Green은 다음 배포에서 사용
            },
            lastUpdated: new Date().toISOString(),
            _migration: {
              id: migrationId,
              from: detection.systemType,
              preservedVolumes: volumes,
              preservedEnv: envPath,
            },
          };

          const registryPath = `${V6_REGISTRY_PATH}/${project.name}-${environment}.json`;
          await ssh.exec(`cat > ${registryPath} << 'EOF'
${JSON.stringify(slotRegistry, null, 2)}
EOF`);

          result.registeredProjects.push({
            name: project.name,
            environment,
            currentPort,
            bluePort,
            greenPort,
            status: 'registered',
            containerName,
            volumes,
            envPath,
          });
        }
      }

      // ============================================================
      // Phase 3: 검증 (서비스 영향 없음)
      // ============================================================
      result.phase = 'complete';

      // 기존 서비스 헬스체크 (변경 없이 확인만)
      for (const project of result.registeredProjects) {
        const healthResult = await ssh.exec(
          `curl -sf -o /dev/null -w '%{http_code}' http://localhost:${project.currentPort}/health 2>/dev/null || echo "000"`
        );

        if (healthResult.stdout.trim().startsWith('2')) {
          project.status = 'ready';
        } else {
          result.warnings.push(
            `${project.name}/${project.environment}: Health check returned ${healthResult.stdout.trim()} ` +
            `(service may still be working, just no /health endpoint)`
          );
          project.status = 'ready'; // 여전히 ready - 서비스는 변경 안됨
        }
      }

      // 마이그레이션 로그 저장
      const logData = {
        id: migrationId,
        timestamp: new Date().toISOString(),
        detection: {
          systemType: detection.systemType,
          projectCount: detection.projects.length,
        },
        result,
      };
      await ssh.exec(`cat > ${MIGRATION_LOG_PATH}/${migrationId}.json << 'EOF'
${JSON.stringify(logData, null, 2)}
EOF`);

      // SSOT에 마이그레이션 마커 추가 (삭제 없음!)
      const ssotExists = await ssh.exec(`test -f ${LEGACY_SSOT_PATH} && echo "yes" || echo "no"`);
      if (ssotExists.stdout.trim() === 'yes') {
        const ssotContent = await ssh.exec(`cat ${LEGACY_SSOT_PATH}`);
        try {
          const ssot = JSON.parse(ssotContent.stdout);
          ssot._v6Migration = {
            migratedAt: new Date().toISOString(),
            migrationId,
            projectsRegistered: result.registeredProjects.map((p) => p.name),
            // SSOT는 그대로 유지 - 롤백용
          };
          await ssh.exec(`cat > ${LEGACY_SSOT_PATH} << 'EOF'
${JSON.stringify(ssot, null, 2)}
EOF`);
        } catch {
          result.warnings.push('Failed to update SSOT with migration marker');
        }
      }

      result.success = true;
      result.nextSteps = [
        '1. 기존 서비스는 그대로 운영 중입니다 (중단 없음)',
        '2. GitHub Actions에서 다음 배포 시:',
        '   - `we deploy <project>` 호출하면 Green 슬롯에 새 버전 배포',
        '   - `we promote <project>` 호출하면 트래픽 전환',
        '3. 문제 발생 시:',
        `   - \`we migrate rollback --id ${migrationId}\` 로 롤백`,
        '4. 확인 명령어:',
        '   - `we slot status <project>` - 슬롯 상태 확인',
        '   - `we migrate status` - 마이그레이션 상태',
      ];

    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : String(error));
      result.nextSteps = [
        '마이그레이션 중 오류가 발생했습니다.',
        '기존 서비스는 영향받지 않습니다.',
        '오류를 확인하고 다시 시도하세요.',
      ];
    }

    return result;
  });
}

/**
 * Dry-run 모드 - 실제 변경 없이 계획만 출력
 */
function executeDryRun(
  detection: LegacyDetectionResult,
  options: SafeMigrationOptions,
  result: SafeMigrationResult
): SafeMigrationResult {
  const usedPorts = new Set<number>();
  for (const mapping of detection.portMappings) {
    usedPorts.add(mapping.port);
  }

  let projects = detection.projects.filter((p) => p.canMigrate);
  if (options.projects && options.projects.length > 0) {
    projects = projects.filter((p) => options.projects!.includes(p.name));
  }

  for (const project of projects) {
    for (const env of project.environments) {
      if (env.name === 'preview') continue;
      if (options.environments && !options.environments.includes(env.name as 'staging' | 'production')) {
        continue;
      }

      const environment = env.name as 'staging' | 'production';
      const currentPort = env.port || 0;
      const greenRange = PORT_RANGES[environment].green;
      const greenPort = findAvailablePort(greenRange, usedPorts);
      usedPorts.add(greenPort);

      result.registeredProjects.push({
        name: project.name,
        environment,
        currentPort,
        bluePort: currentPort, // 기존 포트 유지
        greenPort,
        status: 'registered',
        containerName: env.containerName || `${project.name}-${environment}`,
        volumes: [], // dry-run에서는 볼륨 조회 안함
        envPath: `/opt/codeb/projects/${project.name}/.env.${environment}`,
      });
    }
  }

  result.success = true;
  result.phase = 'complete';
  result.warnings.push('DRY-RUN: No actual changes were made');
  result.nextSteps = [
    'This is a dry-run. Review the plan above.',
    'Run without --dry-run to execute the migration.',
    'Your existing services will NOT be affected.',
  ];

  return result;
}

/**
 * 안전한 롤백 - 레지스트리만 삭제 (서비스 영향 없음)
 */
export async function rollbackSafeMigration(
  migrationId: string,
  auth: AuthContext
): Promise<{ success: boolean; message: string }> {
  return withSSH(SERVERS.app.ip, async (ssh) => {
    // 마이그레이션 로그 로드
    const logFile = `${MIGRATION_LOG_PATH}/${migrationId}.json`;
    const logExists = await ssh.exec(`test -f ${logFile} && echo "yes" || echo "no"`);

    if (logExists.stdout.trim() !== 'yes') {
      return {
        success: false,
        message: `Migration ${migrationId} not found`,
      };
    }

    const logContent = await ssh.exec(`cat ${logFile}`);
    const log = JSON.parse(logContent.stdout);

    // 슬롯 레지스트리 파일만 삭제 (컨테이너는 그대로!)
    for (const project of log.result.registeredProjects) {
      const registryPath = `${V6_REGISTRY_PATH}/${project.name}-${project.environment}.json`;
      await ssh.exec(`rm -f ${registryPath}`);
    }

    // SSOT 마이그레이션 마커 제거
    const ssotExists = await ssh.exec(`test -f ${LEGACY_SSOT_PATH} && echo "yes" || echo "no"`);
    if (ssotExists.stdout.trim() === 'yes') {
      const ssotContent = await ssh.exec(`cat ${LEGACY_SSOT_PATH}`);
      try {
        const ssot = JSON.parse(ssotContent.stdout);
        delete ssot._v6Migration;
        await ssh.exec(`cat > ${LEGACY_SSOT_PATH} << 'EOF'
${JSON.stringify(ssot, null, 2)}
EOF`);
      } catch {
        // 무시
      }
    }

    // 마이그레이션 로그 업데이트
    log.rolledBackAt = new Date().toISOString();
    log.result.phase = 'rolled_back';
    await ssh.exec(`cat > ${logFile} << 'EOF'
${JSON.stringify(log, null, 2)}
EOF`);

    return {
      success: true,
      message: `Migration ${migrationId} rolled back. Existing services were not affected.`,
    };
  });
}

// ============================================================================
// GitHub Actions Integration
// ============================================================================

/**
 * GitHub Actions workflow 파일 생성
 * 다음 배포부터 v6.0 API 사용하도록
 */
export function generateGitHubActionsWorkflow(projectName: string): string {
  return `# CodeB v6.0 - Auto-generated GitHub Actions Workflow
# This workflow uses the new Blue-Green deployment system
#
# Environment Variables Required:
#   CODEB_API_KEY - API key for CodeB MCP server
#   GHCR_PAT - GitHub Container Registry Personal Access Token

name: Deploy

on:
  push:
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
      promote:
        description: 'Auto-promote after deploy'
        required: false
        default: 'false'
        type: boolean

env:
  PROJECT_NAME: ${projectName}
  REGISTRY: ghcr.io
  API_ENDPOINT: https://api.codeb.kr/api/tool

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      image_tag: \${{ steps.meta.outputs.tags }}
      version: \${{ steps.version.outputs.version }}
    steps:
      - uses: actions/checkout@v4

      - name: Set version
        id: version
        run: echo "version=\${{ github.sha }}" >> $GITHUB_OUTPUT

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GHCR_PAT }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: \${{ env.REGISTRY }}/\${{ github.repository }}
          tags: |
            type=sha
            type=ref,event=branch

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: \${{ github.event.inputs.environment || 'staging' }}
    steps:
      - name: Deploy to Blue-Green Slot
        id: deploy
        run: |
          ENVIRONMENT="\${{ github.event.inputs.environment || 'staging' }}"

          RESPONSE=$(curl -sf -X POST "\${{ env.API_ENDPOINT }}" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "tool": "deploy",
              "params": {
                "projectName": "'\${{ env.PROJECT_NAME }}'",
                "environment": "'\$ENVIRONMENT'",
                "image": "'\${{ needs.build.outputs.image_tag }}'",
                "version": "'\${{ needs.build.outputs.version }}'"
              }
            }')

          echo "Deploy Response: $RESPONSE"

          # Extract preview URL
          PREVIEW_URL=$(echo $RESPONSE | jq -r '.data.previewUrl // empty')
          SLOT=$(echo $RESPONSE | jq -r '.data.slot // empty')

          echo "preview_url=$PREVIEW_URL" >> $GITHUB_OUTPUT
          echo "slot=$SLOT" >> $GITHUB_OUTPUT

          # Check success
          SUCCESS=$(echo $RESPONSE | jq -r '.success')
          if [ "$SUCCESS" != "true" ]; then
            echo "Deployment failed!"
            echo $RESPONSE | jq -r '.error // "Unknown error"'
            exit 1
          fi

      - name: Wait for Health Check
        run: |
          echo "Waiting for health check..."
          sleep 30

          # Health check via API
          RESPONSE=$(curl -sf -X POST "\${{ env.API_ENDPOINT }}" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "tool": "slot_status",
              "params": {
                "projectName": "'\${{ env.PROJECT_NAME }}'",
                "environment": "'\${{ github.event.inputs.environment || 'staging' }}'"
              }
            }')

          echo "Health Status: $RESPONSE"

      - name: Create Deployment Summary
        run: |
          echo "## Deployment Summary" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "- **Project:** \${{ env.PROJECT_NAME }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Environment:** \${{ github.event.inputs.environment || 'staging' }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Slot:** \${{ steps.deploy.outputs.slot }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Version:** \${{ needs.build.outputs.version }}" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "### Preview URL" >> $GITHUB_STEP_SUMMARY
          echo "\${{ steps.deploy.outputs.preview_url }}" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "### Next Steps" >> $GITHUB_STEP_SUMMARY
          echo "- Test the preview URL" >> $GITHUB_STEP_SUMMARY
          echo "- Run \\\`we promote \${{ env.PROJECT_NAME }}\\\` to switch traffic" >> $GITHUB_STEP_SUMMARY

  promote:
    needs: deploy
    if: \${{ github.event.inputs.promote == 'true' || github.event.inputs.environment == 'production' }}
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Promote to Production
        run: |
          ENVIRONMENT="\${{ github.event.inputs.environment || 'staging' }}"

          RESPONSE=$(curl -sf -X POST "\${{ env.API_ENDPOINT }}" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "tool": "promote",
              "params": {
                "projectName": "'\${{ env.PROJECT_NAME }}'",
                "environment": "'\$ENVIRONMENT'"
              }
            }')

          echo "Promote Response: $RESPONSE"

          SUCCESS=$(echo $RESPONSE | jq -r '.success')
          if [ "$SUCCESS" != "true" ]; then
            echo "Promotion failed!"
            echo $RESPONSE | jq -r '.error // "Unknown error"'
            exit 1
          fi

          echo "Traffic switched to new version!"
`;
}

// ============================================================================
// Helper Functions
// ============================================================================

function findAvailablePort(
  range: { start: number; end: number },
  usedPorts: Set<number>
): number {
  for (let port = range.start; port <= range.end; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }
  throw new Error(`No available port in range ${range.start}-${range.end}`);
}

// ============================================================================
// Tool Definition
// ============================================================================

export const safeMigrateTool = {
  name: 'migrate_safe',
  description: 'Zero-downtime migration from legacy to v6.0 (no service interruption)',

  async execute(
    params: SafeMigrationOptions & { detection?: LegacyDetectionResult },
    auth: AuthContext
  ): Promise<SafeMigrationResult> {
    // Detection이 제공되지 않으면 실행
    let detection = params.detection;
    if (!detection) {
      const { detectLegacySystem } = await import('./migrate.js');
      detection = await detectLegacySystem(auth);
    }

    return executeSafeMigration(detection, params, auth);
  },
};

export const safeMigrateRollbackTool = {
  name: 'migrate_safe_rollback',
  description: 'Rollback safe migration (removes registry only, no service impact)',

  async execute(
    params: { migrationId: string },
    auth: AuthContext
  ): Promise<{ success: boolean; message: string }> {
    return rollbackSafeMigration(params.migrationId, auth);
  },
};

export const generateWorkflowTool = {
  name: 'migrate_generate_workflow',
  description: 'Generate GitHub Actions workflow for v6.0 deployment',

  async execute(params: { projectName: string }): Promise<{ success: boolean; workflow: string }> {
    return {
      success: true,
      workflow: generateGitHubActionsWorkflow(params.projectName),
    };
  },
};
