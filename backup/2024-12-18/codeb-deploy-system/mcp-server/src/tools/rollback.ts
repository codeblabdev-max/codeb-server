/**
 * CodeB Deploy MCP - Rollback Tool
 * 배포 롤백 관리 및 실행
 */

import { z } from 'zod';
import { getSSHClient } from '../lib/ssh-client.js';
import type { Environment } from '../lib/types.js';

// 기본 레지스트리 설정 (ghcr.io 사용)
const DEFAULT_REGISTRY = 'ghcr.io';

/**
 * 프로젝트 config에서 레지스트리 정보 가져오기
 */
async function getRegistryConfig(projectName: string): Promise<{
  registry: string;
  owner: string;
  imageName: string;
}> {
  const ssh = getSSHClient();
  try {
    const configResult = await ssh.exec(
      `cat /home/codeb/projects/${projectName}/deploy/config.json 2>/dev/null`
    );

    if (configResult.code === 0 && configResult.stdout.trim()) {
      const config = JSON.parse(configResult.stdout);
      return {
        registry: config.registry?.url || DEFAULT_REGISTRY,
        owner: config.registry?.owner || config.project?.owner || 'codeb-deploy',
        imageName: config.registry?.imageName || projectName,
      };
    }
  } catch {
    // 기본값 사용
  }

  return {
    registry: DEFAULT_REGISTRY,
    owner: 'codeb-deploy',
    imageName: projectName,
  };
}

/**
 * 이미지 전체 경로 생성
 */
function getImagePath(registry: string, owner: string, imageName: string, tag: string): string {
  return `${registry}/${owner}/${imageName}:${tag}`;
}

// Rollback 입력 스키마
export const rollbackInputSchema = z.object({
  projectName: z.string().describe('프로젝트 이름'),
  environment: z.enum(['staging', 'production', 'preview']).describe('환경'),
  targetVersion: z.string().optional().describe('롤백할 특정 버전 (기본: 이전 버전)'),
  reason: z.string().optional().describe('롤백 사유'),
  notify: z.boolean().optional().describe('롤백 완료 후 알림 발송 (기본: true)'),
  dryRun: z.boolean().optional().describe('실제 실행 없이 시뮬레이션 (기본: false)'),
});

export type RollbackInput = z.infer<typeof rollbackInputSchema>;

interface DeploymentVersion {
  version: string;
  image: string;
  deployedAt: string;
  commitSha?: string;
  status: 'active' | 'previous' | 'archived';
}

interface RollbackResult {
  success: boolean;
  fromVersion: string;
  toVersion: string;
  environment: string;
  duration: number;
  steps: RollbackStep[];
  error?: string;
}

interface RollbackStep {
  name: string;
  status: 'success' | 'failed' | 'skipped';
  duration: number;
  output?: string;
  error?: string;
}

/**
 * 배포 히스토리 조회
 */
async function getDeploymentHistory(
  projectName: string,
  environment: Environment,
  limit: number = 10
): Promise<DeploymentVersion[]> {
  const ssh = getSSHClient();

  // 배포 히스토리 파일 확인
  const historyPath = `/home/codeb/projects/${projectName}/deploy/history/${environment}.json`;

  try {
    const result = await ssh.exec(`cat ${historyPath} 2>/dev/null || echo "[]"`);
    const history = JSON.parse(result.stdout) as DeploymentVersion[];
    return history.slice(0, limit);
  } catch {
    // 히스토리가 없으면 이미지 태그에서 추출
    const imagesResult = await ssh.exec(
      `podman images --format '{{.Repository}}:{{.Tag}} {{.Created}}' | grep "${projectName}" | head -${limit}`
    );

    const versions: DeploymentVersion[] = [];
    const lines = imagesResult.stdout.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      const [imageTag, ...createdParts] = line.split(' ');
      const [, tag] = imageTag.split(':');

      versions.push({
        version: tag || 'latest',
        image: imageTag,
        deployedAt: createdParts.join(' '),
        status: versions.length === 0 ? 'active' : 'previous',
      });
    }

    return versions;
  }
}

/**
 * 현재 실행 중인 버전 확인
 */
async function getCurrentVersion(
  projectName: string,
  environment: Environment
): Promise<string> {
  const ssh = getSSHClient();
  const containerName = `${projectName}-${environment}`;

  const result = await ssh.exec(
    `podman inspect ${containerName} --format '{{.Config.Image}}' 2>/dev/null || echo "unknown"`
  );

  const image = result.stdout.trim();
  const tag = image.split(':')[1] || 'unknown';
  return tag;
}

/**
 * 롤백 실행
 */
async function executeRollbackSteps(
  projectName: string,
  environment: Environment,
  targetVersion: string,
  dryRun: boolean
): Promise<RollbackStep[]> {
  const ssh = getSSHClient();
  const steps: RollbackStep[] = [];
  const containerName = `${projectName}-${environment}`;

  // ghcr.io 레지스트리 설정
  const regConfig = await getRegistryConfig(projectName);
  const targetImage = getImagePath(regConfig.registry, regConfig.owner, regConfig.imageName, targetVersion);

  // Step 1: 타겟 이미지 확인
  const step1Start = Date.now();
  try {
    const imageCheck = await ssh.exec(
      `podman image exists ${targetImage} && echo "exists" || echo "not_found"`
    );

    if (imageCheck.stdout.trim() !== 'exists') {
      // 레지스트리에서 pull 시도
      if (!dryRun) {
        await ssh.exec(`podman pull ${targetImage}`, { timeout: 120000 });
      }
    }

    steps.push({
      name: 'verify_target_image',
      status: 'success',
      duration: Date.now() - step1Start,
      output: `Target image ${targetImage} verified`,
    });
  } catch (error) {
    steps.push({
      name: 'verify_target_image',
      status: 'failed',
      duration: Date.now() - step1Start,
      error: error instanceof Error ? error.message : String(error),
    });
    return steps;
  }

  // Step 2: 현재 상태 백업
  const step2Start = Date.now();
  try {
    if (!dryRun) {
      // 현재 컨테이너 상태 저장
      await ssh.exec(`
        podman inspect ${containerName} > /tmp/${containerName}-backup.json 2>/dev/null || true
      `);
    }

    steps.push({
      name: 'backup_current_state',
      status: 'success',
      duration: Date.now() - step2Start,
      output: 'Current container state backed up',
    });
  } catch (error) {
    steps.push({
      name: 'backup_current_state',
      status: 'failed',
      duration: Date.now() - step2Start,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Step 3: 현재 컨테이너 중지
  const step3Start = Date.now();
  try {
    if (!dryRun) {
      await ssh.exec(`podman stop ${containerName} --time 30 2>/dev/null || true`);
    }

    steps.push({
      name: 'stop_current_container',
      status: 'success',
      duration: Date.now() - step3Start,
      output: dryRun ? '[DRY RUN] Would stop container' : 'Container stopped',
    });
  } catch (error) {
    steps.push({
      name: 'stop_current_container',
      status: 'failed',
      duration: Date.now() - step3Start,
      error: error instanceof Error ? error.message : String(error),
    });
    return steps;
  }

  // Step 4: 이전 버전 컨테이너 시작
  const step4Start = Date.now();
  try {
    if (!dryRun) {
      // 기존 컨테이너 삭제
      await ssh.exec(`podman rm ${containerName} 2>/dev/null || true`);

      // 환경 설정 로드
      const envFile = `/home/codeb/projects/${projectName}/deploy/.env.${environment}`;

      // 포트 설정 조회
      const configResult = await ssh.exec(
        `cat /home/codeb/projects/${projectName}/deploy/config.json 2>/dev/null || echo "{}"`
      );
      const config = JSON.parse(configResult.stdout);
      const port = config.environments?.[environment]?.port || 3000;

      // 새 컨테이너 시작
      await ssh.exec(`
        podman run -d \
          --name ${containerName} \
          --restart unless-stopped \
          --env-file ${envFile} \
          -p ${port}:3000 \
          --health-cmd="curl -f http://localhost:3000/health || exit 1" \
          --health-interval=30s \
          --health-timeout=10s \
          --health-retries=3 \
          ${targetImage}
      `, { timeout: 120000 });
    }

    steps.push({
      name: 'start_rollback_container',
      status: 'success',
      duration: Date.now() - step4Start,
      output: dryRun ? `[DRY RUN] Would start ${targetImage}` : `Started ${targetImage}`,
    });
  } catch (error) {
    steps.push({
      name: 'start_rollback_container',
      status: 'failed',
      duration: Date.now() - step4Start,
      error: error instanceof Error ? error.message : String(error),
    });
    return steps;
  }

  // Step 5: 헬스체크
  const step5Start = Date.now();
  if (!dryRun) {
    // 시작 대기
    await new Promise(resolve => setTimeout(resolve, 5000));

    let healthy = false;
    for (let i = 0; i < 6; i++) {
      const healthResult = await ssh.exec(
        `podman inspect ${containerName} --format '{{.State.Health.Status}}' 2>/dev/null || echo "none"`
      );

      const status = healthResult.stdout.trim();
      if (status === 'healthy') {
        healthy = true;
        break;
      }

      // 컨테이너가 실행 중인지 확인
      const runningResult = await ssh.exec(
        `podman inspect ${containerName} --format '{{.State.Running}}' 2>/dev/null || echo "false"`
      );

      if (runningResult.stdout.trim() !== 'true') {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    if (healthy) {
      steps.push({
        name: 'healthcheck',
        status: 'success',
        duration: Date.now() - step5Start,
        output: 'Container is healthy',
      });
    } else {
      steps.push({
        name: 'healthcheck',
        status: 'failed',
        duration: Date.now() - step5Start,
        error: 'Container failed health checks',
      });
    }
  } else {
    steps.push({
      name: 'healthcheck',
      status: 'skipped',
      duration: 0,
      output: '[DRY RUN] Would perform health check',
    });
  }

  // Step 6: 히스토리 업데이트
  const step6Start = Date.now();
  try {
    if (!dryRun) {
      const historyPath = `/home/codeb/projects/${projectName}/deploy/history`;
      await ssh.exec(`mkdir -p ${historyPath}`);

      const historyFile = `${historyPath}/${environment}.json`;
      const historyResult = await ssh.exec(`cat ${historyFile} 2>/dev/null || echo "[]"`);
      const history = JSON.parse(historyResult.stdout) as DeploymentVersion[];

      // 현재 버전을 히스토리에 추가
      history.unshift({
        version: targetVersion,
        image: targetImage,
        deployedAt: new Date().toISOString(),
        status: 'active',
      });

      // 이전 active를 previous로 변경
      for (let i = 1; i < history.length; i++) {
        if (history[i].status === 'active') {
          history[i].status = 'previous';
        }
      }

      // 최대 20개까지만 유지
      const trimmedHistory = history.slice(0, 20);

      await ssh.writeFile(historyFile, JSON.stringify(trimmedHistory, null, 2));
    }

    steps.push({
      name: 'update_history',
      status: 'success',
      duration: Date.now() - step6Start,
      output: 'Deployment history updated',
    });
  } catch (error) {
    steps.push({
      name: 'update_history',
      status: 'failed',
      duration: Date.now() - step6Start,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return steps;
}

/**
 * Rollback 도구 실행
 */
export async function executeRollback(input: RollbackInput): Promise<RollbackResult> {
  const {
    projectName,
    environment,
    targetVersion,
    reason,
    notify = true,
    dryRun = false,
  } = input;

  const ssh = getSSHClient();
  await ssh.connect();

  const startTime = Date.now();

  try {
    // 현재 버전 확인
    const currentVersion = await getCurrentVersion(projectName, environment);

    // 롤백 대상 버전 결정
    let rollbackVersion = targetVersion;

    if (!rollbackVersion) {
      // 이전 버전 찾기
      const history = await getDeploymentHistory(projectName, environment);
      const previousVersion = history.find(v => v.status === 'previous' || v.version !== currentVersion);

      if (!previousVersion) {
        return {
          success: false,
          fromVersion: currentVersion,
          toVersion: 'unknown',
          environment,
          duration: Date.now() - startTime,
          steps: [],
          error: 'No previous version available for rollback',
        };
      }

      rollbackVersion = previousVersion.version;
    }

    // 롤백 실행
    console.log(`[Rollback] ${dryRun ? '[DRY RUN] ' : ''}Rolling back ${projectName}-${environment}`);
    console.log(`[Rollback] From: ${currentVersion} -> To: ${rollbackVersion}`);
    if (reason) {
      console.log(`[Rollback] Reason: ${reason}`);
    }

    const steps = await executeRollbackSteps(projectName, environment, rollbackVersion, dryRun);

    const hasFailure = steps.some(s => s.status === 'failed');

    const result: RollbackResult = {
      success: !hasFailure,
      fromVersion: currentVersion,
      toVersion: rollbackVersion,
      environment,
      duration: Date.now() - startTime,
      steps,
    };

    if (hasFailure) {
      const failedStep = steps.find(s => s.status === 'failed');
      result.error = `Rollback failed at step: ${failedStep?.name}`;
    }

    // 알림 발송 (notify 도구 호출 대신 로그)
    if (notify && !dryRun) {
      console.log(`[Rollback] Notification: Rollback ${result.success ? 'succeeded' : 'failed'}`);
      // TODO: notify 도구 연동
    }

    return result;

  } finally {
    ssh.disconnect();
  }
}

/**
 * 배포 히스토리 조회 도구
 */
export async function getVersionHistory(input: {
  projectName: string;
  environment: Environment;
  limit?: number;
}): Promise<DeploymentVersion[]> {
  const ssh = getSSHClient();
  await ssh.connect();

  try {
    return await getDeploymentHistory(input.projectName, input.environment, input.limit);
  } finally {
    ssh.disconnect();
  }
}

/**
 * Rollback 도구 정의
 */
export const rollbackTool = {
  name: 'rollback',
  description: '배포를 이전 버전으로 롤백합니다. 특정 버전을 지정하거나 자동으로 이전 버전으로 롤백합니다.',
  inputSchema: rollbackInputSchema,
  execute: executeRollback,
};

/**
 * 버전 히스토리 조회 도구 정의
 */
export const versionHistoryTool = {
  name: 'get_version_history',
  description: '배포 버전 히스토리를 조회합니다',
  inputSchema: z.object({
    projectName: z.string().describe('프로젝트 이름'),
    environment: z.enum(['staging', 'production', 'preview']).describe('환경'),
    limit: z.number().optional().describe('조회할 버전 수 (기본: 10)'),
  }),
  execute: getVersionHistory,
};
