/**
 * CodeB v7.0.65 - Blue-Green Deploy Tool
 * PostgreSQL DB 기반 SSOT + Team-based Authentication
 *
 * Docker 기반 배포
 * - docker run / docker stop / docker rm
 * - 포트 범위: DB SSOT와 동기화 (production: 4100-4499)
 *
 * v7.0.65 변경사항:
 * - Private Docker Registry 지원 (64.176.226.119:5000)
 * - GHCR → Private Registry로 기본 이미지 URL 변경
 * - 이미지 URL 우선순위: 사용자 지정 > Private Registry > GHCR (fallback)
 *
 * v7.0.64 변경사항:
 * - ENV 처리 순서 변경: 컨테이너 실행 직전에 DB SSOT에서 최신 ENV 동기화
 * - 배포 흐름: 프로젝트 검증 → 슬롯 확인 → 이미지 Pull → ENV 동기화 → 컨테이너 실행
 *
 * v7.0.63 변경사항:
 * - ENV 자동 백업/복원: 배포 전 DB에 ENV 백업, 필요 시 복원
 * - ENV 파일 누락 시 DB에서 자동 복원
 *
 * v7.0.58 변경사항:
 * - JSON 파일 → PostgreSQL DB Repository 전환
 * - ProjectRepo, SlotRepo, DeploymentRepo 사용
 * - 상세 배포 흐름 (SSOT 검증 → 슬롯 확인 → ENV 검증 → 배포)
 */

import { z } from 'zod';
import { randomBytes } from 'crypto';
import type {
  DeployInput,
  DeployResult,
  DeployStep,
  SlotName,
  Environment,
  AuthContext,
} from '../lib/types.js';
import { getSSHClient, withSSH } from '../lib/ssh.js';
import { getSlotPorts, SERVERS } from '../lib/servers.js';
import { ProjectRepo, SlotRepo, DeploymentRepo, ProjectEnvRepo } from '../lib/database.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// Input Schema
// ============================================================================

// Private Docker Registry 설정
const PRIVATE_REGISTRY = '64.176.226.119:5000';
const GHCR_FALLBACK = 'ghcr.io/codeblabdev-max';

export const deployInputSchema = z.object({
  projectName: z.string().min(1).max(50).describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).default('production').describe('Environment (default: production)'),
  version: z.string().optional().describe('Version/commit SHA (default: latest)'),
  image: z.string().optional().describe('Container image (default: private registry, fallback to GHCR)'),
  useGhcr: z.boolean().optional().describe('Force use GHCR instead of private registry'),
  skipHealthcheck: z.boolean().optional().describe('Skip health check'),
  skipValidation: z.boolean().optional().describe('Skip pre-deploy validation'),
});

// ============================================================================
// Deploy Execution
// ============================================================================

/**
 * Execute Blue-Green Deploy with Docker (DB 기반)
 *
 * Flow:
 * 1. DB에서 프로젝트 검증 (SSOT)
 * 2. DB에서 슬롯 상태 조회
 * 3. ENV 파일 검증 (서버)
 * 4. 비활성 슬롯 선택
 * 5. Docker 이미지 Pull
 * 6. 기존 컨테이너 정리
 * 7. 새 컨테이너 실행
 * 8. 헬스체크
 * 9. DB 슬롯 레지스트리 업데이트
 * 10. 배포 이력 저장
 */
export async function executeDeploy(
  input: DeployInput,
  auth: AuthContext
): Promise<DeployResult> {
  const {
    projectName,
    environment = 'production',
    version = 'latest',
    skipHealthcheck = false,
    skipValidation = false,
  } = input;

  const steps: DeployStep[] = [];
  const startTime = Date.now();
  const deploymentId = randomBytes(16).toString('hex');

  // Validate team has access to project
  if (!auth.projects.includes(projectName) && auth.role !== 'owner') {
    return {
      success: false,
      slot: 'blue',
      port: 0,
      previewUrl: '',
      steps: [],
      duration: 0,
      error: `Access denied: project ${projectName} not in team scope`,
    };
  }

  try {
    // ================================================================
    // Step 1: DB에서 프로젝트 검증 (SSOT)
    // ================================================================
    const step1Start = Date.now();
    const project = await ProjectRepo.findByName(projectName);

    if (!project) {
      steps.push({
        name: 'verify_project',
        status: 'failed',
        duration: Date.now() - step1Start,
        error: `Project "${projectName}" not found in SSOT. Run /we:quick first.`,
      });
      return buildResult(false, steps, startTime, 'blue', 0, projectName, environment);
    }

    // 팀 소속 확인
    if (project.teamId !== auth.teamId && auth.role !== 'owner') {
      steps.push({
        name: 'verify_project',
        status: 'failed',
        duration: Date.now() - step1Start,
        error: `Project "${projectName}" belongs to different team`,
      });
      return buildResult(false, steps, startTime, 'blue', 0, projectName, environment);
    }

    steps.push({
      name: 'verify_project',
      status: 'success',
      duration: Date.now() - step1Start,
      output: `Project verified: ${projectName} (type: ${project.type})`,
    });

    // ================================================================
    // Step 2: DB에서 슬롯 상태 조회
    // ================================================================
    const step2Start = Date.now();
    let slots = await SlotRepo.findByProject(projectName, environment);

    if (!slots) {
      // 첫 배포 - 슬롯 초기화 필요
      const basePort = await allocatePortFromDB(projectName, environment);
      const slotPorts = getSlotPorts(basePort);

      slots = {
        projectName,
        environment,
        activeSlot: 'blue',
        lastUpdated: new Date().toISOString(),
        blue: { name: 'blue', state: 'empty', port: slotPorts.blue },
        green: { name: 'green', state: 'empty', port: slotPorts.green },
      };

      await SlotRepo.upsert(slots);

      steps.push({
        name: 'get_slot_status',
        status: 'success',
        duration: Date.now() - step2Start,
        output: `First deploy - initialized slots (blue: ${slotPorts.blue}, green: ${slotPorts.green})`,
      });
    } else {
      steps.push({
        name: 'get_slot_status',
        status: 'success',
        duration: Date.now() - step2Start,
        output: `Active slot: ${slots.activeSlot}, Blue: ${slots.blue.state}, Green: ${slots.green.state}`,
      });
    }

    // ================================================================
    // Step 3: 비활성 슬롯 선택
    // ================================================================
    const step3Start = Date.now();
    const targetSlot: SlotName = slots.activeSlot === 'blue' ? 'green' : 'blue';
    const targetPort = slots[targetSlot].port;

    if (!targetPort) {
      steps.push({
        name: 'select_slot',
        status: 'failed',
        duration: Date.now() - step3Start,
        error: `No port assigned to ${targetSlot} slot. Re-initialize project.`,
      });
      return buildResult(false, steps, startTime, targetSlot, 0, projectName, environment);
    }

    steps.push({
      name: 'select_slot',
      status: 'success',
      duration: Date.now() - step3Start,
      output: `Target slot: ${targetSlot} (port ${targetPort})`,
    });

    // ================================================================
    // Step 4: 배포 이력 생성 (pending)
    // ================================================================
    await DeploymentRepo.create({
      id: deploymentId,
      projectName,
      environment,
      slot: targetSlot,
      version,
      image: input.image,
      deployedBy: auth.keyId,
    });

    // ================================================================
    // Step 5-10: SSH로 실제 배포 수행
    // v7.0.64: ENV 처리는 컨테이너 실행 직전으로 이동
    // ================================================================
    return await withSSH(SERVERS.app.ip, async (ssh) => {
      const envFile = `/opt/codeb/env/${projectName}/.env`;
      const envAltFile = `/opt/codeb/projects/${projectName}/.env.${environment}`;
      const envBackupDir = `/opt/codeb/env-backup/${projectName}`;

      // Step 5: Docker 이미지 Pull
      // 이미지 URL 우선순위: 사용자 지정 > Private Registry > GHCR (fallback)
      const step5Start = Date.now();
      const containerName = `${projectName}-${environment}-${targetSlot}`;
      const imageUrl = input.image
        ? input.image
        : input.useGhcr
          ? `${GHCR_FALLBACK}/${projectName}:${version}`
          : `${PRIVATE_REGISTRY}/${projectName}:${version}`;

      try {
        await ssh.exec(`docker pull ${imageUrl}`, { timeout: 180000 });
        steps.push({
          name: 'pull_image',
          status: 'success',
          duration: Date.now() - step5Start,
          output: `Pulled ${imageUrl}`,
        });
      } catch (error) {
        steps.push({
          name: 'pull_image',
          status: 'failed',
          duration: Date.now() - step5Start,
          error: error instanceof Error ? error.message : String(error),
        });
        await DeploymentRepo.updateStatus(deploymentId, 'failed', { steps, error: 'Image pull failed' });
        return buildResult(false, steps, startTime, targetSlot, targetPort, projectName, environment);
      }

      // Step 6: 기존 컨테이너 정리
      const step6Start = Date.now();
      try {
        await ssh.exec(`docker stop ${containerName} 2>/dev/null || true`);
        await ssh.exec(`docker rm ${containerName} 2>/dev/null || true`);
        steps.push({
          name: 'cleanup_container',
          status: 'success',
          duration: Date.now() - step6Start,
          output: 'Previous container cleaned up',
        });
      } catch (error) {
        steps.push({
          name: 'cleanup_container',
          status: 'failed',
          duration: Date.now() - step6Start,
          error: error instanceof Error ? error.message : String(error),
        });
        await DeploymentRepo.updateStatus(deploymentId, 'failed', { steps, error: 'Cleanup failed' });
        return buildResult(false, steps, startTime, targetSlot, targetPort, projectName, environment);
      }

      // ================================================================
      // Step 7: ENV 동기화 (v7.0.64 - 컨테이너 실행 직전에 처리)
      // DB SSOT에서 최신 ENV를 서버 파일로 동기화
      // ================================================================
      const step7Start = Date.now();
      try {
        // DB에서 최신 ENV 조회
        const dbEnv = await ProjectEnvRepo.findByProject(projectName, environment);

        if (dbEnv && Object.keys(dbEnv.env_data).length > 0) {
          // DB SSOT에서 ENV 파일 생성 (항상 최신 상태 유지)
          const envContent = Object.entries(dbEnv.env_data)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

          await ssh.exec(`mkdir -p /opt/codeb/env/${projectName}`);
          const base64Content = Buffer.from(envContent).toString('base64');
          await ssh.exec(`echo "${base64Content}" | base64 -d > ${envFile}`);
          await ssh.exec(`chmod 600 ${envFile}`);

          // 백업 생성
          await ssh.exec(`mkdir -p ${envBackupDir}`);
          await ssh.exec(`cp ${envFile} ${envBackupDir}/.env.${Date.now()}`);

          logger.info('ENV synced from DB SSOT', { projectName, environment, keys: Object.keys(dbEnv.env_data).length });

          steps.push({
            name: 'sync_env',
            status: 'success',
            duration: Date.now() - step7Start,
            output: `ENV synced from DB SSOT (${Object.keys(dbEnv.env_data).length} keys)`,
          });
        } else {
          // DB에 ENV가 없으면 서버 파일 확인
          const envCheck = await ssh.exec(`test -f ${envFile} && echo "OK" || test -f ${envAltFile} && echo "OK" || echo "MISSING"`);

          if (envCheck.stdout.trim() === 'MISSING') {
            steps.push({
              name: 'sync_env',
              status: 'failed',
              duration: Date.now() - step7Start,
              error: `No ENV in DB SSOT and no file on server. Use env_sync to upload.`,
            });
            await DeploymentRepo.updateStatus(deploymentId, 'failed', { error: 'ENV missing' });
            return buildResult(false, steps, startTime, targetSlot, targetPort, projectName, environment);
          }

          // 서버 파일을 DB에 백업
          const serverEnvContent = await ssh.exec(`cat ${envFile} 2>/dev/null || cat ${envAltFile} 2>/dev/null`);
          if (serverEnvContent.stdout.trim()) {
            const envData = parseEnvContent(serverEnvContent.stdout);
            if (Object.keys(envData).length > 0) {
              await ProjectEnvRepo.upsert({
                projectName,
                environment,
                envData,
                createdBy: auth.teamId,
              });
              logger.info('Server ENV backed up to DB', { projectName, environment, keys: Object.keys(envData).length });
            }
          }

          steps.push({
            name: 'sync_env',
            status: 'success',
            duration: Date.now() - step7Start,
            output: 'Using existing server ENV (backed up to DB)',
          });
        }
      } catch (error) {
        steps.push({
          name: 'sync_env',
          status: 'failed',
          duration: Date.now() - step7Start,
          error: error instanceof Error ? error.message : String(error),
        });
        await DeploymentRepo.updateStatus(deploymentId, 'failed', { error: 'ENV sync failed' });
        return buildResult(false, steps, startTime, targetSlot, targetPort, projectName, environment);
      }

      // Step 8: 새 컨테이너 실행
      const step8Start = Date.now();
      const dockerLabels = [
        `codeb.project=${projectName}`,
        `codeb.environment=${environment}`,
        `codeb.slot=${targetSlot}`,
        `codeb.version=${version}`,
        `codeb.team=${auth.teamId}`,
        `codeb.deployment_id=${deploymentId}`,
        `codeb.deployed_at=${new Date().toISOString()}`,
      ].map(l => `-l ${l}`).join(' ');

      // ENV 파일 경로 결정 (DB에서 동기화한 파일 우선)
      const envFileToUse = await ssh.exec(`test -f ${envFile} && echo "${envFile}" || echo "${envAltFile}"`);
      const actualEnvFile = envFileToUse.stdout.trim();

      try {
        const dockerCmd = `docker run -d \\
          --name ${containerName} \\
          --restart always \\
          --env-file ${actualEnvFile} \\
          -p ${targetPort}:3000 \\
          --health-cmd="curl -sf http://localhost:3000/health || curl -sf http://localhost:3000/api/health || exit 1" \\
          --health-interval=10s \\
          --health-timeout=5s \\
          --health-retries=3 \\
          --health-start-period=30s \\
          --memory=512m \\
          --cpus=1 \\
          ${dockerLabels} \\
          ${imageUrl}`;

        await ssh.exec(dockerCmd, { timeout: 60000 });
        steps.push({
          name: 'start_container',
          status: 'success',
          duration: Date.now() - step8Start,
          output: `Started ${containerName} on port ${targetPort}`,
        });
      } catch (error) {
        steps.push({
          name: 'start_container',
          status: 'failed',
          duration: Date.now() - step8Start,
          error: error instanceof Error ? error.message : String(error),
        });
        await DeploymentRepo.updateStatus(deploymentId, 'failed', { steps, error: 'Container start failed' });
        return buildResult(false, steps, startTime, targetSlot, targetPort, projectName, environment);
      }

      // Step 9: 헬스체크
      const step9Start = Date.now();
      if (!skipHealthcheck) {
        try {
          await waitForHealthy(ssh, targetPort, 60, containerName);
          steps.push({
            name: 'health_check',
            status: 'success',
            duration: Date.now() - step9Start,
            output: 'Container is healthy',
          });
        } catch (error) {
          // 롤백: 실패한 컨테이너 제거
          await ssh.exec(`docker stop ${containerName} 2>/dev/null || true`);
          await ssh.exec(`docker rm ${containerName} 2>/dev/null || true`);

          steps.push({
            name: 'health_check',
            status: 'failed',
            duration: Date.now() - step9Start,
            error: error instanceof Error ? error.message : String(error),
          });
          await DeploymentRepo.updateStatus(deploymentId, 'failed', { steps, error: 'Health check failed' });
          return buildResult(false, steps, startTime, targetSlot, targetPort, projectName, environment);
        }
      } else {
        steps.push({
          name: 'health_check',
          status: 'skipped',
          duration: 0,
          output: 'Skipped by user request',
        });
      }

      // Step 10: DB 슬롯 레지스트리 업데이트
      const step10Start = Date.now();
      try {
        slots[targetSlot] = {
          name: targetSlot,
          state: 'deployed',
          port: targetPort,
          version,
          image: imageUrl,
          deployedAt: new Date().toISOString(),
          deployedBy: auth.keyId,
          healthStatus: 'healthy',
        };
        slots.lastUpdated = new Date().toISOString();

        await SlotRepo.upsert(slots);

        steps.push({
          name: 'update_registry',
          status: 'success',
          duration: Date.now() - step10Start,
          output: 'DB slot registry updated',
        });
      } catch (error) {
        steps.push({
          name: 'update_registry',
          status: 'failed',
          duration: Date.now() - step10Start,
          error: error instanceof Error ? error.message : String(error),
        });
        // 레지스트리 업데이트 실패해도 배포 자체는 성공
      }

      // 배포 이력 업데이트 (success)
      const duration = Date.now() - startTime;
      await DeploymentRepo.updateStatus(deploymentId, 'success', { steps, duration });

      return buildResult(true, steps, startTime, targetSlot, targetPort, projectName, environment, version);
    });

  } catch (error) {
    // 전역 에러 핸들링
    await DeploymentRepo.updateStatus(deploymentId, 'failed', {
      steps,
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => {}); // 무시

    return {
      success: false,
      slot: 'blue',
      port: 0,
      previewUrl: '',
      steps,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse .env file content to key-value object
 */
function parseEnvContent(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1).trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      env[key] = value;
    }
  }

  return env;
}

/**
 * Wait for container to become healthy (Docker)
 */
async function waitForHealthy(
  ssh: ReturnType<typeof getSSHClient>,
  port: number,
  timeoutSeconds: number,
  containerName?: string
): Promise<void> {
  const maxAttempts = Math.ceil(timeoutSeconds / 5);

  // 컨테이너 시작 대기
  await new Promise(resolve => setTimeout(resolve, 3000));

  for (let i = 0; i < maxAttempts; i++) {
    // 1차: Docker healthcheck 상태 확인 (가장 신뢰성 있음)
    if (containerName) {
      const healthResult = await ssh.exec(
        `docker inspect ${containerName} --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown"`
      );
      const healthStatus = healthResult.stdout.trim();
      if (healthStatus === 'healthy') {
        return;
      }
    }

    // 2차: 컨테이너 내부에서 직접 curl
    if (containerName) {
      const execResult = await ssh.exec(
        `docker exec ${containerName} sh -c 'curl -sf http://localhost:3000/health 2>/dev/null || curl -sf http://localhost:3000/api/health 2>/dev/null' && echo "OK" || echo "FAIL"`
      );
      if (execResult.stdout.includes('OK')) {
        return;
      }
    }

    // 3차: 호스트에서 직접 curl (fallback)
    const result = await ssh.exec(
      `curl -sf -o /dev/null -w '%{http_code}' http://localhost:${port}/health 2>/dev/null || curl -sf -o /dev/null -w '%{http_code}' http://localhost:${port}/api/health 2>/dev/null || echo "000"`
    );
    const statusCode = result.stdout.trim();
    if (statusCode.startsWith('2')) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  throw new Error(`Health check failed after ${timeoutSeconds}s`);
}

/**
 * DB에서 포트 할당 (SSOT)
 */
async function allocatePortFromDB(
  _projectName: string,
  environment: Environment
): Promise<number> {
  // 포트 범위
  const ranges: Record<Environment, { start: number; end: number }> = {
    staging: { start: 4500, end: 4999 },
    production: { start: 4100, end: 4499 },
    preview: { start: 5000, end: 5499 },
  };

  const range = ranges[environment];

  // DB에서 사용 중인 포트 조회
  const allSlots = await SlotRepo.listAll();
  const usedPorts = new Set<number>();

  for (const slot of allSlots) {
    if (slot.blue.port) usedPorts.add(slot.blue.port);
    if (slot.green.port) usedPorts.add(slot.green.port);
  }

  // 사용 가능한 짝수 포트 찾기 (blue=짝수, green=홀수)
  for (let port = range.start; port <= range.end; port += 2) {
    if (!usedPorts.has(port) && !usedPorts.has(port + 1)) {
      return port;
    }
  }

  throw new Error(`No available ports in ${environment} range (${range.start}-${range.end})`);
}

/**
 * Build result object
 */
function buildResult(
  success: boolean,
  steps: DeployStep[],
  startTime: number,
  slot: SlotName,
  port: number,
  projectName: string,
  _environment: Environment,
  _version?: string
): DeployResult {
  const previewUrl = success
    ? `https://${projectName}-${slot}.preview.codeb.kr`
    : '';

  return {
    success,
    slot,
    port,
    previewUrl,
    steps,
    duration: Date.now() - startTime,
    error: success ? undefined : steps.find(s => s.status === 'failed')?.error,
  };
}

// ============================================================================
// Tool Definition
// ============================================================================

export const deployTool = {
  name: 'deploy',
  description: 'Deploy to inactive Blue-Green slot using Docker. DB-based SSOT. Returns preview URL for testing.',
  inputSchema: deployInputSchema,

  async execute(params: DeployInput, auth: AuthContext): Promise<DeployResult> {
    return executeDeploy(params, auth);
  },
};
