/**
 * CodeB Deploy MCP - Deploy Tool
 * 실제 배포 실행 및 관리
 *
 * ⚠️ 모든 배포는 PortGuard 검증을 통과해야 함 (강제)
 */

import { z } from 'zod';
import { getSSHClient } from '../lib/ssh-client.js';
import { portRegistry } from '../lib/port-registry.js';
import { portGuard, findNextAvailablePort, type ValidationResult, type PortReservation } from '../lib/port-manifest.js';
import type { DeploymentResult, DeployStrategy, Environment } from '../lib/types.js';

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

// Deploy 입력 스키마
export const deployInputSchema = z.object({
  projectName: z.string().describe('프로젝트 이름'),
  environment: z.enum(['staging', 'production', 'preview']).describe('배포 환경'),
  version: z.string().optional().describe('배포할 버전 태그 (기본: latest)'),
  strategy: z.enum(['rolling', 'blue-green', 'canary']).optional().describe('배포 전략 (기본: rolling)'),
  canaryWeight: z.number().min(0).max(100).optional().describe('Canary 배포 시 트래픽 비율 (%)'),
  skipTests: z.boolean().optional().describe('테스트 스킵 여부'),
  skipHealthcheck: z.boolean().optional().describe('헬스체크 스킵 여부'),
  force: z.boolean().optional().describe('강제 배포 (이전 배포 실패 시)'),
  prNumber: z.string().optional().describe('Preview 환경일 경우 PR 번호'),
});

export type DeployInput = z.infer<typeof deployInputSchema>;

interface DeployStep {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  duration?: number;
  output?: string;
  error?: string;
}

/**
 * Rolling 배포 전략 실행
 */
async function executeRollingDeploy(
  projectName: string,
  environment: Environment,
  version: string,
  skipHealthcheck: boolean
): Promise<DeployStep[]> {
  const ssh = getSSHClient();
  const steps: DeployStep[] = [];
  const containerName = `${projectName}-${environment}`;

  // ghcr.io 레지스트리 설정
  const regConfig = await getRegistryConfig(projectName);
  const image = getImagePath(regConfig.registry, regConfig.owner, regConfig.imageName, version);

  // Step 1: 이미지 Pull
  const step1Start = Date.now();
  try {
    await ssh.exec(`podman pull ${image}`, { timeout: 300000 });
    steps.push({
      name: 'pull_image',
      status: 'success',
      duration: Date.now() - step1Start,
      output: `Pulled ${image}`,
    });
  } catch (error) {
    steps.push({
      name: 'pull_image',
      status: 'failed',
      duration: Date.now() - step1Start,
      error: error instanceof Error ? error.message : String(error),
    });
    return steps;
  }

  // Step 2: 현재 컨테이너 백업
  const step2Start = Date.now();
  try {
    const existsResult = await ssh.exec(
      `podman container exists ${containerName} && echo "exists" || echo "not_found"`
    );

    if (existsResult.stdout.trim() === 'exists') {
      // 현재 이미지 태그 저장
      const currentImage = await ssh.exec(
        `podman inspect ${containerName} --format '{{.Config.Image}}'`
      );
      await ssh.exec(`echo "${currentImage.stdout.trim()}" > /tmp/${containerName}-previous-image`);
    }

    steps.push({
      name: 'backup_current',
      status: 'success',
      duration: Date.now() - step2Start,
      output: 'Current state backed up',
    });
  } catch (error) {
    steps.push({
      name: 'backup_current',
      status: 'success', // 백업 실패는 non-blocking
      duration: Date.now() - step2Start,
      output: 'No existing container to backup',
    });
  }

  // Step 3: 환경 설정 확인
  const step3Start = Date.now();
  try {
    const envFile = `/home/codeb/projects/${projectName}/deploy/.env.${environment}`;
    const configFile = `/home/codeb/projects/${projectName}/deploy/config.json`;

    const envExists = await ssh.exec(`test -f ${envFile} && echo "yes" || echo "no"`);
    const configExists = await ssh.exec(`test -f ${configFile} && echo "yes" || echo "no"`);

    if (envExists.stdout.trim() !== 'yes') {
      throw new Error(`Environment file not found: ${envFile}`);
    }

    if (configExists.stdout.trim() !== 'yes') {
      throw new Error(`Config file not found: ${configFile}`);
    }

    // config에서 포트 정보 로드
    const configContent = await ssh.exec(`cat ${configFile}`);
    const config = JSON.parse(configContent.stdout);

    steps.push({
      name: 'verify_config',
      status: 'success',
      duration: Date.now() - step3Start,
      output: `Config verified: ${environment} environment`,
    });
  } catch (error) {
    steps.push({
      name: 'verify_config',
      status: 'failed',
      duration: Date.now() - step3Start,
      error: error instanceof Error ? error.message : String(error),
    });
    return steps;
  }

  // Step 4: 기존 컨테이너 중지 및 제거
  const step4Start = Date.now();
  try {
    await ssh.exec(`podman stop ${containerName} --time 30 2>/dev/null || true`);
    await ssh.exec(`podman rm ${containerName} 2>/dev/null || true`);

    steps.push({
      name: 'stop_old_container',
      status: 'success',
      duration: Date.now() - step4Start,
      output: 'Old container stopped and removed',
    });
  } catch (error) {
    steps.push({
      name: 'stop_old_container',
      status: 'success', // 이전 컨테이너 없을 수 있음
      duration: Date.now() - step4Start,
      output: 'No previous container to stop',
    });
  }

  // Step 5: 새 컨테이너 시작
  const step5Start = Date.now();
  try {
    // config에서 포트 정보 가져오기
    const configContent = await ssh.exec(
      `cat /home/codeb/projects/${projectName}/deploy/config.json`
    );
    const config = JSON.parse(configContent.stdout);
    const port = config.environments?.[environment]?.port || 3000;
    const envFile = `/home/codeb/projects/${projectName}/deploy/.env.${environment}`;

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
        --label "project=${projectName}" \
        --label "environment=${environment}" \
        --label "version=${version}" \
        --label "deployed_at=$(date -Iseconds)" \
        ${image}
    `, { timeout: 120000 });

    steps.push({
      name: 'start_new_container',
      status: 'success',
      duration: Date.now() - step5Start,
      output: `Started ${containerName} on port ${port}`,
    });
  } catch (error) {
    steps.push({
      name: 'start_new_container',
      status: 'failed',
      duration: Date.now() - step5Start,
      error: error instanceof Error ? error.message : String(error),
    });
    return steps;
  }

  // Step 6: 헬스체크
  const step6Start = Date.now();
  if (!skipHealthcheck) {
    try {
      // 시작 대기
      await new Promise(resolve => setTimeout(resolve, 5000));

      let healthy = false;
      for (let i = 0; i < 12; i++) {
        const healthResult = await ssh.exec(
          `podman inspect ${containerName} --format '{{.State.Health.Status}}' 2>/dev/null || echo "none"`
        );

        const status = healthResult.stdout.trim();
        if (status === 'healthy') {
          healthy = true;
          break;
        }

        // 컨테이너 실행 상태 확인
        const runningResult = await ssh.exec(
          `podman inspect ${containerName} --format '{{.State.Running}}' 2>/dev/null || echo "false"`
        );

        if (runningResult.stdout.trim() !== 'true') {
          // 컨테이너 로그 확인
          const logsResult = await ssh.exec(
            `podman logs ${containerName} --tail 20 2>&1`
          );
          throw new Error(`Container crashed: ${logsResult.stdout}`);
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      if (!healthy) {
        // HTTP 직접 체크 시도
        const configContent = await ssh.exec(
          `cat /home/codeb/projects/${projectName}/deploy/config.json`
        );
        const config = JSON.parse(configContent.stdout);
        const port = config.environments?.[environment]?.port || 3000;

        const httpCheck = await ssh.exec(
          `curl -sf -o /dev/null -w '%{http_code}' http://localhost:${port}/health 2>/dev/null || echo "failed"`
        );

        if (httpCheck.stdout.trim().startsWith('2')) {
          healthy = true;
        }
      }

      if (healthy) {
        steps.push({
          name: 'healthcheck',
          status: 'success',
          duration: Date.now() - step6Start,
          output: 'Container is healthy',
        });
      } else {
        throw new Error('Container failed health checks after 60 seconds');
      }
    } catch (error) {
      steps.push({
        name: 'healthcheck',
        status: 'failed',
        duration: Date.now() - step6Start,
        error: error instanceof Error ? error.message : String(error),
      });
      return steps;
    }
  } else {
    steps.push({
      name: 'healthcheck',
      status: 'skipped',
      duration: 0,
      output: 'Healthcheck skipped',
    });
  }

  // Step 7: 히스토리 기록
  const step7Start = Date.now();
  try {
    const historyDir = `/home/codeb/projects/${projectName}/deploy/history`;
    await ssh.exec(`mkdir -p ${historyDir}`);

    const historyFile = `${historyDir}/${environment}.json`;
    const historyResult = await ssh.exec(`cat ${historyFile} 2>/dev/null || echo "[]"`);
    const history = JSON.parse(historyResult.stdout);

    // 현재 버전을 active로, 이전 active를 previous로
    for (const entry of history) {
      if (entry.status === 'active') {
        entry.status = 'previous';
      }
    }

    history.unshift({
      version,
      image,
      deployedAt: new Date().toISOString(),
      status: 'active',
    });

    // 최대 20개 유지
    const trimmedHistory = history.slice(0, 20);
    await ssh.writeFile(historyFile, JSON.stringify(trimmedHistory, null, 2));

    steps.push({
      name: 'update_history',
      status: 'success',
      duration: Date.now() - step7Start,
      output: 'Deployment history updated',
    });
  } catch (error) {
    steps.push({
      name: 'update_history',
      status: 'failed', // non-blocking
      duration: Date.now() - step7Start,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return steps;
}

/**
 * Blue-Green 배포 전략 실행
 */
async function executeBlueGreenDeploy(
  projectName: string,
  environment: Environment,
  version: string,
  skipHealthcheck: boolean
): Promise<DeployStep[]> {
  const ssh = getSSHClient();
  const steps: DeployStep[] = [];

  // ghcr.io 레지스트리 설정
  const regConfig = await getRegistryConfig(projectName);
  const image = getImagePath(regConfig.registry, regConfig.owner, regConfig.imageName, version);

  // 현재 활성 슬롯 확인 (blue 또는 green)
  const currentSlotResult = await ssh.exec(
    `cat /home/codeb/projects/${projectName}/deploy/current-slot-${environment} 2>/dev/null || echo "blue"`
  );
  const currentSlot = currentSlotResult.stdout.trim();
  const newSlot = currentSlot === 'blue' ? 'green' : 'blue';

  const newContainerName = `${projectName}-${environment}-${newSlot}`;
  const oldContainerName = `${projectName}-${environment}-${currentSlot}`;

  // config에서 포트 정보
  const configContent = await ssh.exec(
    `cat /home/codeb/projects/${projectName}/deploy/config.json`
  );
  const config = JSON.parse(configContent.stdout);
  const basePort = config.environments?.[environment]?.port || 3000;

  // Blue-Green 포트 할당 (blue: basePort, green: basePort+1)
  const newPort = newSlot === 'blue' ? basePort : basePort + 1;

  // Step 1: 새 슬롯에 배포
  const step1Start = Date.now();
  try {
    await ssh.exec(`podman pull ${image}`, { timeout: 300000 });
    await ssh.exec(`podman stop ${newContainerName} --time 10 2>/dev/null || true`);
    await ssh.exec(`podman rm ${newContainerName} 2>/dev/null || true`);

    const envFile = `/home/codeb/projects/${projectName}/deploy/.env.${environment}`;
    await ssh.exec(`
      podman run -d \
        --name ${newContainerName} \
        --restart unless-stopped \
        --env-file ${envFile} \
        -p ${newPort}:3000 \
        --health-cmd="curl -f http://localhost:3000/health || exit 1" \
        --health-interval=10s \
        --health-timeout=5s \
        --health-retries=3 \
        --label "project=${projectName}" \
        --label "environment=${environment}" \
        --label "slot=${newSlot}" \
        --label "version=${version}" \
        ${image}
    `, { timeout: 120000 });

    steps.push({
      name: `deploy_${newSlot}_slot`,
      status: 'success',
      duration: Date.now() - step1Start,
      output: `Deployed to ${newSlot} slot on port ${newPort}`,
    });
  } catch (error) {
    steps.push({
      name: `deploy_${newSlot}_slot`,
      status: 'failed',
      duration: Date.now() - step1Start,
      error: error instanceof Error ? error.message : String(error),
    });
    return steps;
  }

  // Step 2: 새 슬롯 헬스체크
  const step2Start = Date.now();
  if (!skipHealthcheck) {
    try {
      await new Promise(resolve => setTimeout(resolve, 5000));

      let healthy = false;
      for (let i = 0; i < 12; i++) {
        const httpCheck = await ssh.exec(
          `curl -sf -o /dev/null -w '%{http_code}' http://localhost:${newPort}/health 2>/dev/null || echo "failed"`
        );

        if (httpCheck.stdout.trim().startsWith('2')) {
          healthy = true;
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      if (!healthy) {
        throw new Error('New slot failed health checks');
      }

      steps.push({
        name: 'healthcheck_new_slot',
        status: 'success',
        duration: Date.now() - step2Start,
        output: `${newSlot} slot is healthy`,
      });
    } catch (error) {
      // 롤백: 새 슬롯 제거
      await ssh.exec(`podman stop ${newContainerName} --time 5 2>/dev/null || true`);
      await ssh.exec(`podman rm ${newContainerName} 2>/dev/null || true`);

      steps.push({
        name: 'healthcheck_new_slot',
        status: 'failed',
        duration: Date.now() - step2Start,
        error: error instanceof Error ? error.message : String(error),
      });
      return steps;
    }
  }

  // Step 3: 트래픽 전환 (Caddy 설정 업데이트)
  const step3Start = Date.now();
  try {
    // Caddy upstream 업데이트
    const domain = config.environments?.[environment]?.domain || `${projectName}-${environment}.codeb.dev`;
    const caddyConfig = `
${domain} {
    reverse_proxy localhost:${newPort} {
        health_uri /health
        health_interval 10s
    }
    encode gzip
    log {
        output file /var/log/caddy/${projectName}-${environment}.log
    }
}`;

    await ssh.writeFile(`/etc/caddy/sites/${projectName}-${environment}.caddy`, caddyConfig);
    await ssh.exec('systemctl reload caddy');

    steps.push({
      name: 'switch_traffic',
      status: 'success',
      duration: Date.now() - step3Start,
      output: `Traffic switched to ${newSlot} slot`,
    });
  } catch (error) {
    steps.push({
      name: 'switch_traffic',
      status: 'failed',
      duration: Date.now() - step3Start,
      error: error instanceof Error ? error.message : String(error),
    });
    return steps;
  }

  // Step 4: 슬롯 상태 저장
  const step4Start = Date.now();
  try {
    await ssh.exec(
      `echo "${newSlot}" > /home/codeb/projects/${projectName}/deploy/current-slot-${environment}`
    );

    steps.push({
      name: 'update_slot_state',
      status: 'success',
      duration: Date.now() - step4Start,
      output: `Current slot: ${newSlot}`,
    });
  } catch (error) {
    steps.push({
      name: 'update_slot_state',
      status: 'failed',
      duration: Date.now() - step4Start,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Step 5: 이전 슬롯 유지 (롤백용)
  steps.push({
    name: 'keep_old_slot',
    status: 'success',
    duration: 0,
    output: `${currentSlot} slot kept for rollback`,
  });

  return steps;
}

/**
 * Canary 배포 전략 실행
 */
async function executeCanaryDeploy(
  projectName: string,
  environment: Environment,
  version: string,
  canaryWeight: number,
  skipHealthcheck: boolean
): Promise<DeployStep[]> {
  const ssh = getSSHClient();
  const steps: DeployStep[] = [];

  // ghcr.io 레지스트리 설정
  const regConfig = await getRegistryConfig(projectName);
  const image = getImagePath(regConfig.registry, regConfig.owner, regConfig.imageName, version);

  const stableContainerName = `${projectName}-${environment}-stable`;
  const canaryContainerName = `${projectName}-${environment}-canary`;

  // config 로드
  const configContent = await ssh.exec(
    `cat /home/codeb/projects/${projectName}/deploy/config.json`
  );
  const config = JSON.parse(configContent.stdout);
  const basePort = config.environments?.[environment]?.port || 3000;
  const canaryPort = basePort + 10;

  // Step 1: Canary 컨테이너 배포
  const step1Start = Date.now();
  try {
    await ssh.exec(`podman pull ${image}`, { timeout: 300000 });
    await ssh.exec(`podman stop ${canaryContainerName} --time 10 2>/dev/null || true`);
    await ssh.exec(`podman rm ${canaryContainerName} 2>/dev/null || true`);

    const envFile = `/home/codeb/projects/${projectName}/deploy/.env.${environment}`;
    await ssh.exec(`
      podman run -d \
        --name ${canaryContainerName} \
        --restart unless-stopped \
        --env-file ${envFile} \
        -p ${canaryPort}:3000 \
        --health-cmd="curl -f http://localhost:3000/health || exit 1" \
        --health-interval=10s \
        --health-timeout=5s \
        --health-retries=3 \
        --label "project=${projectName}" \
        --label "environment=${environment}" \
        --label "deployment=canary" \
        --label "version=${version}" \
        ${image}
    `, { timeout: 120000 });

    steps.push({
      name: 'deploy_canary',
      status: 'success',
      duration: Date.now() - step1Start,
      output: `Canary deployed on port ${canaryPort}`,
    });
  } catch (error) {
    steps.push({
      name: 'deploy_canary',
      status: 'failed',
      duration: Date.now() - step1Start,
      error: error instanceof Error ? error.message : String(error),
    });
    return steps;
  }

  // Step 2: Canary 헬스체크
  const step2Start = Date.now();
  if (!skipHealthcheck) {
    try {
      await new Promise(resolve => setTimeout(resolve, 5000));

      let healthy = false;
      for (let i = 0; i < 6; i++) {
        const httpCheck = await ssh.exec(
          `curl -sf -o /dev/null -w '%{http_code}' http://localhost:${canaryPort}/health 2>/dev/null || echo "failed"`
        );

        if (httpCheck.stdout.trim().startsWith('2')) {
          healthy = true;
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      if (!healthy) {
        throw new Error('Canary failed health checks');
      }

      steps.push({
        name: 'healthcheck_canary',
        status: 'success',
        duration: Date.now() - step2Start,
        output: 'Canary is healthy',
      });
    } catch (error) {
      await ssh.exec(`podman stop ${canaryContainerName} --time 5 2>/dev/null || true`);
      await ssh.exec(`podman rm ${canaryContainerName} 2>/dev/null || true`);

      steps.push({
        name: 'healthcheck_canary',
        status: 'failed',
        duration: Date.now() - step2Start,
        error: error instanceof Error ? error.message : String(error),
      });
      return steps;
    }
  }

  // Step 3: 트래픽 분배 설정 (Caddy)
  const step3Start = Date.now();
  try {
    const domain = config.environments?.[environment]?.domain || `${projectName}-${environment}.codeb.dev`;
    const stableWeight = 100 - canaryWeight;

    // Caddy weighted load balancing
    const caddyConfig = `
${domain} {
    reverse_proxy {
        to localhost:${basePort} localhost:${canaryPort}
        lb_policy weighted_round_robin ${stableWeight} ${canaryWeight}
        health_uri /health
        health_interval 10s
        health_timeout 5s
        fail_duration 30s
    }
    encode gzip
    log {
        output file /var/log/caddy/${projectName}-${environment}.log
    }
}`;

    await ssh.writeFile(`/etc/caddy/sites/${projectName}-${environment}.caddy`, caddyConfig);
    await ssh.exec('systemctl reload caddy');

    steps.push({
      name: 'configure_traffic_split',
      status: 'success',
      duration: Date.now() - step3Start,
      output: `Traffic split: stable ${stableWeight}%, canary ${canaryWeight}%`,
    });
  } catch (error) {
    steps.push({
      name: 'configure_traffic_split',
      status: 'failed',
      duration: Date.now() - step3Start,
      error: error instanceof Error ? error.message : String(error),
    });
    return steps;
  }

  // Step 4: Canary 상태 저장
  const step4Start = Date.now();
  try {
    const canaryState = {
      version,
      weight: canaryWeight,
      startedAt: new Date().toISOString(),
      port: canaryPort,
    };

    await ssh.writeFile(
      `/home/codeb/projects/${projectName}/deploy/canary-${environment}.json`,
      JSON.stringify(canaryState, null, 2)
    );

    steps.push({
      name: 'save_canary_state',
      status: 'success',
      duration: Date.now() - step4Start,
      output: 'Canary state saved',
    });
  } catch (error) {
    steps.push({
      name: 'save_canary_state',
      status: 'failed',
      duration: Date.now() - step4Start,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return steps;
}

/**
 * Preview 환경 배포
 */
async function executePreviewDeploy(
  projectName: string,
  version: string,
  prNumber: string
): Promise<DeployStep[]> {
  const ssh = getSSHClient();
  const steps: DeployStep[] = [];

  // ghcr.io 레지스트리 설정
  const regConfig = await getRegistryConfig(projectName);
  const image = getImagePath(regConfig.registry, regConfig.owner, regConfig.imageName, `pr-${prNumber}`);
  const containerName = `${projectName}-preview-${prNumber}`;

  // Preview 포트 할당
  const port = portRegistry.allocatePreviewPort(prNumber);

  // Step 1: 이미지 Pull 및 컨테이너 시작
  const step1Start = Date.now();
  try {
    await ssh.exec(`podman pull ${image}`, { timeout: 300000 });
    await ssh.exec(`podman stop ${containerName} --time 10 2>/dev/null || true`);
    await ssh.exec(`podman rm ${containerName} 2>/dev/null || true`);

    const envFile = `/home/codeb/projects/${projectName}/deploy/.env.staging`; // Preview는 staging 환경 사용

    await ssh.exec(`
      podman run -d \
        --name ${containerName} \
        --restart unless-stopped \
        --env-file ${envFile} \
        -e PREVIEW_PR=${prNumber} \
        -p ${port}:3000 \
        --health-cmd="curl -f http://localhost:3000/health || exit 1" \
        --health-interval=30s \
        --health-timeout=10s \
        --health-retries=3 \
        --label "project=${projectName}" \
        --label "environment=preview" \
        --label "pr=${prNumber}" \
        ${image}
    `, { timeout: 120000 });

    steps.push({
      name: 'deploy_preview',
      status: 'success',
      duration: Date.now() - step1Start,
      output: `Preview deployed on port ${port}`,
    });
  } catch (error) {
    portRegistry.deallocatePreviewPort(prNumber);
    steps.push({
      name: 'deploy_preview',
      status: 'failed',
      duration: Date.now() - step1Start,
      error: error instanceof Error ? error.message : String(error),
    });
    return steps;
  }

  // Step 2: Caddy 설정
  const step2Start = Date.now();
  try {
    const domain = `${projectName}-pr-${prNumber}.preview.codeb.dev`;
    const caddyConfig = `
${domain} {
    reverse_proxy localhost:${port}
    encode gzip
}`;

    await ssh.writeFile(`/etc/caddy/sites/preview-${projectName}-${prNumber}.caddy`, caddyConfig);
    await ssh.exec('systemctl reload caddy');

    steps.push({
      name: 'configure_domain',
      status: 'success',
      duration: Date.now() - step2Start,
      output: `Domain configured: ${domain}`,
    });
  } catch (error) {
    steps.push({
      name: 'configure_domain',
      status: 'failed',
      duration: Date.now() - step2Start,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return steps;
}

/**
 * Deploy 도구 실행
 *
 * ⚠️ 핵심 규칙: 모든 배포는 PortGuard 검증을 통과해야 함
 *
 * 흐름:
 * 1. 포트 결정 (config에서 로드 또는 자동 할당)
 * 2. PortGuard.validateBeforeDeploy() → 실패 시 즉시 거부
 * 3. 실제 배포 수행
 * 4. 성공: portGuard.commitReservation() → 실패: portGuard.releaseReservation()
 */
export async function executeDeploy(input: DeployInput): Promise<DeploymentResult> {
  const {
    projectName,
    environment,
    version = 'latest',
    strategy = 'rolling',
    canaryWeight = 10,
    skipTests = false,
    skipHealthcheck = false,
    force = false,
    prNumber,
  } = input;

  const ssh = getSSHClient();
  const startTime = Date.now();
  let steps: DeployStep[] = [];
  let portValidation: ValidationResult | null = null;

  try {
    await ssh.connect();

    // ============================================================
    // Step 0: 포트 결정 및 PortGuard 검증 (필수 - 스킵 불가)
    // ============================================================
    const step0Start = Date.now();
    let targetPort: number = 0; // 초기값 설정 (catch 블록에서 사용 가능하도록)

    try {
      // config에서 포트 정보 로드
      const configResult = await ssh.exec(
        `cat /home/codeb/projects/${projectName}/deploy/config.json 2>/dev/null`
      );

      if (configResult.code === 0 && configResult.stdout.trim()) {
        const config = JSON.parse(configResult.stdout);
        targetPort = config.environments?.[environment]?.port;

        if (!targetPort) {
          // config에 포트가 없으면 자동 할당
          targetPort = await findNextAvailablePort(environment as 'staging' | 'production' | 'preview');
          console.error(`[Deploy] Auto-allocated port ${targetPort} for ${projectName}/${environment}`);
        }
      } else {
        // config 파일 없음 - 자동 할당
        targetPort = await findNextAvailablePort(environment as 'staging' | 'production' | 'preview');
        console.error(`[Deploy] No config found, auto-allocated port ${targetPort}`);
      }

      // PortGuard 검증 (MCP 실패 대비 옵션 포함)
      portValidation = await portGuard.validateBeforeDeploy(
        projectName,
        targetPort,
        environment as 'staging' | 'production' | 'preview',
        {
          service: 'app',
          skipServerCheck: false,
          mcpAvailable: true, // MCP 사용 가능 상태 (실패 시 false로 재시도)
        }
      );

      // 검증 실패 시 즉시 거부 (force 옵션도 무시)
      if (!portValidation.valid) {
        const errorMessages = portValidation.errors.map(e => `[${e.code}] ${e.message}`).join('; ');

        steps.push({
          name: 'port_validation',
          status: 'failed',
          duration: Date.now() - step0Start,
          error: `Port validation failed: ${errorMessages}`,
        });

        return {
          success: false,
          environment,
          version,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          error: `⚠️ PORT GUARD REJECTED: ${errorMessages}`,
          steps: steps.map(s => ({
            name: s.name,
            status: s.status,
            duration: s.duration,
            message: s.output || s.error,
          })),
        };
      }

      // 경고가 있으면 로그
      if (portValidation.warnings.length > 0) {
        console.error(`[Deploy] Warnings: ${portValidation.warnings.map(w => w.message).join('; ')}`);
      }

      steps.push({
        name: 'port_validation',
        status: 'success',
        duration: Date.now() - step0Start,
        output: `Port ${targetPort} validated and reserved (token: ${portValidation.reservation?.token.substring(0, 16)}...)`,
      });

    } catch (error) {
      // PortGuard 자체 실패 - MCP 불가 시 SSH 폴백으로 재시도
      console.error('[Deploy] PortGuard validation failed, attempting SSH fallback:', error);

      try {
        // targetPort가 아직 할당되지 않았으면 환경별 기본 포트 사용
        if (targetPort === 0) {
          const defaultPorts = { staging: 3000, production: 4000, preview: 5000 };
          targetPort = defaultPorts[environment as keyof typeof defaultPorts] || 3000;
          console.error(`[Deploy] Using default port ${targetPort} for ${environment}`);
        }

        // SSH 직접 검증 (폴백)
        const sshPortCheck = await ssh.exec(
          `ss -tlnp | grep ":${targetPort} " && echo "IN_USE" || echo "AVAILABLE"`
        );

        if (sshPortCheck.stdout.includes('IN_USE')) {
          steps.push({
            name: 'port_validation',
            status: 'failed',
            duration: Date.now() - step0Start,
            error: `Port ${targetPort} is in use (SSH fallback check)`,
          });

          return {
            success: false,
            environment,
            version,
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
            error: `⚠️ PORT CONFLICT: Port ${targetPort} is already in use`,
            steps: steps.map(s => ({
              name: s.name,
              status: s.status,
              duration: s.duration,
              message: s.output || s.error,
            })),
          };
        }

        steps.push({
          name: 'port_validation',
          status: 'success',
          duration: Date.now() - step0Start,
          output: `Port ${targetPort} validated via SSH fallback (MCP unavailable)`,
        });

      } catch (sshError) {
        // SSH 폴백도 실패 - 배포 거부
        steps.push({
          name: 'port_validation',
          status: 'failed',
          duration: Date.now() - step0Start,
          error: `Port validation failed (both MCP and SSH): ${error instanceof Error ? error.message : String(error)}`,
        });

        return {
          success: false,
          environment,
          version,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          error: '⚠️ PORT VALIDATION UNAVAILABLE: Cannot verify port availability',
          steps: steps.map(s => ({
            name: s.name,
            status: s.status,
            duration: s.duration,
            message: s.output || s.error,
          })),
        };
      }
    }

    // ============================================================
    // 실제 배포 수행
    // ============================================================

    // Preview 환경은 별도 처리
    if (environment === 'preview') {
      if (!prNumber) {
        if (portValidation?.reservation) {
          portGuard.releaseReservation(portValidation.reservation.token);
        }
        return {
          success: false,
          environment,
          version,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          error: 'PR number required for preview environment',
        };
      }

      steps = [...steps, ...(await executePreviewDeploy(projectName, version, prNumber))];
    } else {
      // 전략별 배포 실행
      let deploySteps: DeployStep[];
      switch (strategy) {
        case 'rolling':
          deploySteps = await executeRollingDeploy(projectName, environment, version, skipHealthcheck);
          break;
        case 'blue-green':
          deploySteps = await executeBlueGreenDeploy(projectName, environment, version, skipHealthcheck);
          break;
        case 'canary':
          deploySteps = await executeCanaryDeploy(projectName, environment, version, canaryWeight, skipHealthcheck);
          break;
        default:
          deploySteps = await executeRollingDeploy(projectName, environment, version, skipHealthcheck);
      }
      steps = [...steps, ...deploySteps];
    }

    const hasFailure = steps.some(s => s.status === 'failed');
    const duration = Date.now() - startTime;

    // ============================================================
    // 배포 결과에 따른 PortGuard 처리
    // ============================================================
    if (portValidation?.reservation) {
      if (hasFailure) {
        // 배포 실패 - 예약 해제
        portGuard.releaseReservation(portValidation.reservation.token);
        console.error(`[Deploy] Released port reservation due to deployment failure`);
      } else {
        // 배포 성공 - 예약 확정 (매니페스트에 영구 등록)
        const committed = await portGuard.commitReservation(portValidation.reservation.token);
        if (committed) {
          console.error(`[Deploy] Port reservation committed to manifest`);
        } else {
          console.error(`[Deploy] Warning: Failed to commit port reservation to manifest`);
        }
      }
    }

    const result: DeploymentResult = {
      success: !hasFailure,
      environment,
      version,
      duration,
      timestamp: new Date().toISOString(),
      steps: steps.map(s => ({
        name: s.name,
        status: s.status,
        duration: s.duration,
        message: s.output || s.error,
      })),
    };

    if (hasFailure) {
      const failedStep = steps.find(s => s.status === 'failed');
      result.error = `Deployment failed at: ${failedStep?.name}`;
    }

    return result;

  } catch (error) {
    // 전체 실패 시 예약 해제
    if (portValidation?.reservation) {
      portGuard.releaseReservation(portValidation.reservation.token);
    }

    return {
      success: false,
      environment,
      version,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      error: `Deployment error: ${error instanceof Error ? error.message : String(error)}`,
      steps: steps.map(s => ({
        name: s.name,
        status: s.status,
        duration: s.duration,
        message: s.output || s.error,
      })),
    };
  } finally {
    ssh.disconnect();
  }
}

/**
 * Deploy 도구 정의
 */
export const deployTool = {
  name: 'deploy',
  description: '프로젝트를 지정된 환경에 배포합니다. Rolling, Blue-Green, Canary 전략을 지원합니다.',
  inputSchema: deployInputSchema,
  execute: executeDeploy,
};
