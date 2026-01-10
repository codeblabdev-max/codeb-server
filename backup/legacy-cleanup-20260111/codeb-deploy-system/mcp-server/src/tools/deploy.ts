/**
 * CodeB Deploy MCP - Deploy Tool
 * 실제 배포 실행 및 관리
 */

import { z } from 'zod';
import { getSSHClient } from '../lib/ssh-client.js';
import { portRegistry } from '../lib/port-registry.js';
import type { DeploymentResult, DeployStrategy, Environment } from '../lib/types.js';

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
  const registryUrl = 'localhost:5000';
  const image = `${registryUrl}/${projectName}:${version}`;

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
  const registryUrl = 'localhost:5000';
  const image = `${registryUrl}/${projectName}:${version}`;

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
  const registryUrl = 'localhost:5000';
  const image = `${registryUrl}/${projectName}:${version}`;

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
  const registryUrl = 'localhost:5000';
  const image = `${registryUrl}/${projectName}:pr-${prNumber}`;
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
  await ssh.connect();

  const startTime = Date.now();
  let steps: DeployStep[] = [];

  try {
    // Preview 환경은 별도 처리
    if (environment === 'preview') {
      if (!prNumber) {
        return {
          success: false,
          environment,
          version,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          error: 'PR number required for preview environment',
        };
      }

      steps = await executePreviewDeploy(projectName, version, prNumber);
    } else {
      // 전략별 배포 실행
      switch (strategy) {
        case 'rolling':
          steps = await executeRollingDeploy(projectName, environment, version, skipHealthcheck);
          break;
        case 'blue-green':
          steps = await executeBlueGreenDeploy(projectName, environment, version, skipHealthcheck);
          break;
        case 'canary':
          steps = await executeCanaryDeploy(projectName, environment, version, canaryWeight, skipHealthcheck);
          break;
        default:
          steps = await executeRollingDeploy(projectName, environment, version, skipHealthcheck);
      }
    }

    const hasFailure = steps.some(s => s.status === 'failed');
    const duration = Date.now() - startTime;

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
