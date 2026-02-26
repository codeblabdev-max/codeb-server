/**
 * CodeB v9.0 - Blue-Green Deploy Tool
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
import { withLocal, type LocalExec } from '../lib/local-exec.js';
import { getSlotPorts } from '../lib/servers.js';
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
  healthcheckTimeout: z.number().min(30).max(600).optional().describe('Health check timeout in seconds (default: 120)'),
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
    healthcheckTimeout = 120,
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
    return await withLocal(async (local) => {
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
        await local.exec(`docker pull ${imageUrl}`, { timeout: 180000 });
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
        await local.exec(`docker stop ${containerName} 2>/dev/null || true`);
        await local.exec(`docker rm ${containerName} 2>/dev/null || true`);
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

          await local.exec(`mkdir -p /opt/codeb/env/${projectName}`);
          const base64Content = Buffer.from(envContent).toString('base64');
          await local.exec(`echo "${base64Content}" | base64 -d > ${envFile}`);
          await local.exec(`chmod 600 ${envFile}`);

          // 백업 생성
          await local.exec(`mkdir -p ${envBackupDir}`);
          await local.exec(`cp ${envFile} ${envBackupDir}/.env.${Date.now()}`);

          logger.info('ENV synced from DB SSOT', { projectName, environment, keys: Object.keys(dbEnv.env_data).length });

          steps.push({
            name: 'sync_env',
            status: 'success',
            duration: Date.now() - step7Start,
            output: `ENV synced from DB SSOT (${Object.keys(dbEnv.env_data).length} keys)`,
          });
        } else {
          // DB에 ENV가 없으면 서버 파일 확인
          const envCheck = await local.exec(`test -f ${envFile} && echo "OK" || test -f ${envAltFile} && echo "OK" || echo "MISSING"`);

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
          const serverEnvContent = await local.exec(`cat ${envFile} 2>/dev/null || cat ${envAltFile} 2>/dev/null`);
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
      const envFileToUse = await local.exec(`test -f ${envFile} && echo "${envFile}" || echo "${envAltFile}"`);
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
          --health-retries=5 \\
          --health-start-period=60s \\
          --memory=512m \\
          --cpus=1 \\
          ${dockerLabels} \\
          ${imageUrl}`;

        await local.exec(dockerCmd, { timeout: 60000 });
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
          await waitForHealthy(local, targetPort, healthcheckTimeout, containerName);
          steps.push({
            name: 'health_check',
            status: 'success',
            duration: Date.now() - step9Start,
            output: 'Container is healthy',
          });
        } catch (error) {
          // 진단: 컨테이너 삭제 전에 상태/로그 수집
          let diagnosis = '';
          try {
            const containerState = await local.exec(
              `docker inspect ${containerName} --format '{{.State.Status}} (health: {{.State.Health.Status}})' 2>/dev/null || echo "removed"`
            );
            const containerLogs = await local.exec(
              `docker logs ${containerName} --tail 40 2>&1 || echo "no logs"`
            );
            diagnosis = `[Container: ${containerState.stdout.trim()}]\n${containerLogs.stdout.slice(0, 1000)}`;
          } catch {
            // 진단 실패해도 계속 진행
          }

          // 롤백: 실패한 컨테이너 제거
          await local.exec(`docker stop ${containerName} 2>/dev/null || true`);
          await local.exec(`docker rm ${containerName} 2>/dev/null || true`);

          const errorMsg = error instanceof Error ? error.message : String(error);
          steps.push({
            name: 'health_check',
            status: 'failed',
            duration: Date.now() - step9Start,
            error: errorMsg,
            output: diagnosis || undefined,
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
 *
 * 전략:
 * 1단계 (0-15초): 컨테이너 running 상태 확인 (crash 조기 감지)
 * 2단계 (15초-timeout): Docker healthcheck + HTTP 직접 폴링
 *
 * Docker --health-start-period=60s 동안 Docker inspect는 "starting" 반환하므로
 * HTTP 직접 체크를 병행하여 조기 성공 감지
 */
async function waitForHealthy(
  local: LocalExec,
  port: number,
  timeoutSeconds: number,
  containerName?: string
): Promise<void> {
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;
  const pollInterval = 5000; // 5초 간격 폴링

  // Phase 1: 컨테이너가 실제로 running 상태인지 확인 (crash 조기 감지)
  await new Promise(resolve => setTimeout(resolve, 3000));

  if (containerName) {
    const stateResult = await local.exec(
      `docker inspect ${containerName} --format '{{.State.Status}}' 2>/dev/null || echo "missing"`
    );
    const state = stateResult.stdout.trim();
    if (state === 'exited' || state === 'dead' || state === 'missing') {
      // 컨테이너가 즉시 죽은 경우 - 로그 수집 후 빠른 실패
      const logs = await local.exec(
        `docker logs ${containerName} --tail 30 2>&1 || echo "no logs"`
      );
      throw new Error(
        `Container crashed immediately (state: ${state}). Last logs:\n${logs.stdout.slice(0, 500)}`
      );
    }
  }

  // Phase 2: 헬스체크 폴링 (Docker inspect + HTTP 직접 체크 병행)
  // Docker start-period(60초) 동안은 inspect가 "starting"이므로 HTTP 직접 체크도 함께 수행
  logger.info('Health check started', { containerName, port, timeoutSeconds });

  while (Date.now() - startTime < timeoutMs) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    // 1차: Docker healthcheck 상태 확인
    if (containerName) {
      const healthResult = await local.exec(
        `docker inspect ${containerName} --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown"`
      );
      const healthStatus = healthResult.stdout.trim();

      if (healthStatus === 'healthy') {
        logger.info('Health check passed (docker)', { containerName, elapsed });
        return;
      }

      // 컨테이너가 죽었으면 빠른 실패
      if (healthStatus === 'unhealthy') {
        const logs = await local.exec(
          `docker logs ${containerName} --tail 30 2>&1 || echo "no logs"`
        );
        throw new Error(
          `Container unhealthy after ${elapsed}s. Last logs:\n${logs.stdout.slice(0, 500)}`
        );
      }

      // "starting" 상태일 때 — Docker는 아직 판단 안 했지만 HTTP로 직접 확인
    }

    // 2차: 호스트에서 직접 HTTP 체크 (Docker start-period 중에도 조기 성공 감지 가능)
    try {
      const result = await local.exec(
        `curl -sf -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:${port}/health 2>/dev/null || curl -sf -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:${port}/api/health 2>/dev/null || echo "000"`,
        { timeout: 15000 }
      );
      const statusCode = result.stdout.trim();
      if (statusCode.startsWith('2')) {
        logger.info('Health check passed (http)', { containerName, port, elapsed, statusCode });
        return;
      }
    } catch {
      // curl 실패 — 다음 폴링으로
    }

    // 10회(50초)마다 진행 상황 로깅
    if (elapsed % 30 === 0 && elapsed > 0) {
      logger.info('Health check still waiting...', { containerName, elapsed, timeoutSeconds });
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // 타임아웃 — 컨테이너 로그 수집하여 디버깅 정보 제공
  let debugInfo = '';
  if (containerName) {
    const logs = await local.exec(
      `docker logs ${containerName} --tail 50 2>&1 || echo "no logs"`
    );
    debugInfo = `\nContainer logs:\n${logs.stdout.slice(0, 800)}`;
  }

  throw new Error(`Health check timed out after ${timeoutSeconds}s (port ${port})${debugInfo}`);
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
