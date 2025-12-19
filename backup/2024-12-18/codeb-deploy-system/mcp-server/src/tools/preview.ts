/**
 * CodeB Deploy MCP - Preview Environment Tool
 * PR 기반 Preview 환경 관리
 */

import { z } from 'zod';
import { getSSHClient } from '../lib/ssh-client.js';
import { portRegistry } from '../lib/port-registry.js';

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

// Preview 입력 스키마
export const previewInputSchema = z.object({
  action: z.enum(['create', 'update', 'delete', 'list', 'get']).describe('액션'),
  projectName: z.string().describe('프로젝트 이름'),
  prNumber: z.string().optional().describe('PR 번호'),
  gitRef: z.string().optional().describe('Git 참조 (브랜치 또는 커밋)'),
  ttlHours: z.number().optional().describe('자동 삭제까지 시간 (기본: 72)'),
});

export type PreviewInput = z.infer<typeof previewInputSchema>;

interface PreviewEnvironment {
  projectName: string;
  prNumber: string;
  url: string;
  port: number;
  status: 'running' | 'stopped' | 'failed' | 'building';
  createdAt: string;
  expiresAt: string;
  gitRef?: string;
  commitSha?: string;
  containerName: string;
}

interface PreviewResult {
  success: boolean;
  action: string;
  environment?: PreviewEnvironment;
  environments?: PreviewEnvironment[];
  message?: string;
  error?: string;
}

/**
 * Preview 환경 생성
 */
async function createPreviewEnvironment(
  projectName: string,
  prNumber: string,
  gitRef: string,
  ttlHours: number
): Promise<PreviewResult> {
  const ssh = getSSHClient();
  const containerName = `${projectName}-preview-${prNumber}`;

  // ghcr.io 레지스트리 설정
  const regConfig = await getRegistryConfig(projectName);
  const image = getImagePath(regConfig.registry, regConfig.owner, regConfig.imageName, `pr-${prNumber}`);

  try {
    // 포트 할당
    const port = portRegistry.allocatePreviewPort(prNumber);

    // 기존 컨테이너 정리
    await ssh.exec(`podman stop ${containerName} --time 10 2>/dev/null || true`);
    await ssh.exec(`podman rm ${containerName} 2>/dev/null || true`);

    // 이미지 Pull
    const pullResult = await ssh.exec(`podman pull ${image} 2>&1`, { timeout: 300000 });

    if (pullResult.code !== 0 && !pullResult.stdout.includes('already present')) {
      // 이미지가 없으면 빌드 필요
      console.log(`[Preview] Image ${image} not found, needs to be built first`);
      throw new Error(`Image ${image} not found. Build the PR first.`);
    }

    // 환경 파일 (staging 기반)
    const envFile = `/home/codeb/projects/${projectName}/deploy/.env.staging`;

    // 컨테이너 시작
    await ssh.exec(`
      podman run -d \
        --name ${containerName} \
        --restart unless-stopped \
        --env-file ${envFile} \
        -e PREVIEW_MODE=true \
        -e PREVIEW_PR=${prNumber} \
        -e NODE_ENV=preview \
        -p ${port}:3000 \
        --health-cmd="curl -f http://localhost:3000/health || exit 1" \
        --health-interval=30s \
        --health-timeout=10s \
        --health-retries=3 \
        --label "project=${projectName}" \
        --label "environment=preview" \
        --label "pr=${prNumber}" \
        --label "expires_at=$(date -d '+${ttlHours} hours' -Iseconds)" \
        ${image}
    `, { timeout: 120000 });

    // Caddy 설정
    const domain = `${projectName}-pr-${prNumber}.preview.codeb.dev`;
    const caddyConfig = `
${domain} {
    reverse_proxy localhost:${port} {
        health_uri /health
        health_interval 30s
    }
    encode gzip
    header {
        X-Preview-PR ${prNumber}
        X-Preview-Project ${projectName}
    }
}`;

    await ssh.writeFile(`/etc/caddy/sites/preview-${projectName}-${prNumber}.caddy`, caddyConfig);
    await ssh.exec('systemctl reload caddy');

    // 만료 시간 계산
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

    // Preview 상태 저장
    const previewState: PreviewEnvironment = {
      projectName,
      prNumber,
      url: `https://${domain}`,
      port,
      status: 'running',
      createdAt: new Date().toISOString(),
      expiresAt,
      gitRef,
      containerName,
    };

    const previewDir = `/home/codeb/projects/${projectName}/deploy/previews`;
    await ssh.exec(`mkdir -p ${previewDir}`);
    await ssh.writeFile(`${previewDir}/${prNumber}.json`, JSON.stringify(previewState, null, 2));

    return {
      success: true,
      action: 'create',
      environment: previewState,
      message: `Preview environment created: ${domain}`,
    };

  } catch (error) {
    portRegistry.deallocatePreviewPort(prNumber);
    return {
      success: false,
      action: 'create',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Preview 환경 업데이트
 */
async function updatePreviewEnvironment(
  projectName: string,
  prNumber: string,
  gitRef?: string
): Promise<PreviewResult> {
  const ssh = getSSHClient();
  const containerName = `${projectName}-preview-${prNumber}`;

  // ghcr.io 레지스트리 설정
  const regConfig = await getRegistryConfig(projectName);
  const image = getImagePath(regConfig.registry, regConfig.owner, regConfig.imageName, `pr-${prNumber}`);

  try {
    // 현재 상태 확인
    const previewFile = `/home/codeb/projects/${projectName}/deploy/previews/${prNumber}.json`;
    const stateResult = await ssh.exec(`cat ${previewFile} 2>/dev/null || echo "{}"`);
    const currentState = JSON.parse(stateResult.stdout) as Partial<PreviewEnvironment>;

    if (!currentState.port) {
      return {
        success: false,
        action: 'update',
        error: 'Preview environment not found',
      };
    }

    // 새 이미지 Pull
    await ssh.exec(`podman pull ${image}`, { timeout: 300000 });

    // 컨테이너 재시작
    await ssh.exec(`podman stop ${containerName} --time 30 2>/dev/null || true`);
    await ssh.exec(`podman rm ${containerName} 2>/dev/null || true`);

    const envFile = `/home/codeb/projects/${projectName}/deploy/.env.staging`;
    await ssh.exec(`
      podman run -d \
        --name ${containerName} \
        --restart unless-stopped \
        --env-file ${envFile} \
        -e PREVIEW_MODE=true \
        -e PREVIEW_PR=${prNumber} \
        -e NODE_ENV=preview \
        -p ${currentState.port}:3000 \
        --health-cmd="curl -f http://localhost:3000/health || exit 1" \
        --health-interval=30s \
        --health-timeout=10s \
        --health-retries=3 \
        --label "project=${projectName}" \
        --label "environment=preview" \
        --label "pr=${prNumber}" \
        ${image}
    `, { timeout: 120000 });

    // 상태 업데이트
    const updatedState: PreviewEnvironment = {
      ...currentState as PreviewEnvironment,
      status: 'running',
      gitRef: gitRef || currentState.gitRef,
    };

    await ssh.writeFile(previewFile, JSON.stringify(updatedState, null, 2));

    return {
      success: true,
      action: 'update',
      environment: updatedState,
      message: 'Preview environment updated',
    };

  } catch (error) {
    return {
      success: false,
      action: 'update',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Preview 환경 삭제
 */
async function deletePreviewEnvironment(
  projectName: string,
  prNumber: string
): Promise<PreviewResult> {
  const ssh = getSSHClient();
  const containerName = `${projectName}-preview-${prNumber}`;

  try {
    // 컨테이너 중지 및 삭제
    await ssh.exec(`podman stop ${containerName} --time 10 2>/dev/null || true`);
    await ssh.exec(`podman rm ${containerName} 2>/dev/null || true`);

    // Caddy 설정 삭제
    await ssh.exec(`rm -f /etc/caddy/sites/preview-${projectName}-${prNumber}.caddy`);
    await ssh.exec('systemctl reload caddy');

    // 상태 파일 삭제
    await ssh.exec(`rm -f /home/codeb/projects/${projectName}/deploy/previews/${prNumber}.json`);

    // 포트 해제
    portRegistry.deallocatePreviewPort(prNumber);

    // 이미지 정리 (선택적)
    const regConfig = await getRegistryConfig(projectName);
    const oldImage = getImagePath(regConfig.registry, regConfig.owner, regConfig.imageName, `pr-${prNumber}`);
    await ssh.exec(`podman rmi ${oldImage} 2>/dev/null || true`);

    return {
      success: true,
      action: 'delete',
      message: `Preview environment for PR #${prNumber} deleted`,
    };

  } catch (error) {
    return {
      success: false,
      action: 'delete',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Preview 환경 목록 조회
 */
async function listPreviewEnvironments(
  projectName: string
): Promise<PreviewResult> {
  const ssh = getSSHClient();

  try {
    const previewDir = `/home/codeb/projects/${projectName}/deploy/previews`;

    // Preview 파일 목록
    const filesResult = await ssh.exec(`ls ${previewDir}/*.json 2>/dev/null || echo ""`);
    const files = filesResult.stdout.trim().split('\n').filter(Boolean);

    const environments: PreviewEnvironment[] = [];

    for (const file of files) {
      try {
        const content = await ssh.exec(`cat ${file}`);
        const env = JSON.parse(content.stdout) as PreviewEnvironment;

        // 실제 컨테이너 상태 확인
        const statusResult = await ssh.exec(
          `podman inspect ${env.containerName} --format '{{.State.Status}}' 2>/dev/null || echo "not_found"`
        );
        const containerStatus = statusResult.stdout.trim();

        if (containerStatus === 'not_found') {
          env.status = 'stopped';
        } else if (containerStatus === 'running') {
          env.status = 'running';
        } else {
          env.status = 'failed';
        }

        // 만료 확인
        if (new Date(env.expiresAt) < new Date()) {
          // 만료된 환경 정리
          await deletePreviewEnvironment(projectName, env.prNumber);
          continue;
        }

        environments.push(env);
      } catch {
        // 파일 파싱 오류 무시
      }
    }

    return {
      success: true,
      action: 'list',
      environments,
      message: `Found ${environments.length} preview environments`,
    };

  } catch (error) {
    return {
      success: false,
      action: 'list',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Preview 환경 상세 조회
 */
async function getPreviewEnvironment(
  projectName: string,
  prNumber: string
): Promise<PreviewResult> {
  const ssh = getSSHClient();

  try {
    const previewFile = `/home/codeb/projects/${projectName}/deploy/previews/${prNumber}.json`;
    const content = await ssh.exec(`cat ${previewFile} 2>/dev/null || echo "{}"`);
    const env = JSON.parse(content.stdout) as PreviewEnvironment;

    if (!env.prNumber) {
      return {
        success: false,
        action: 'get',
        error: `Preview environment for PR #${prNumber} not found`,
      };
    }

    // 실제 상태 확인
    const statusResult = await ssh.exec(
      `podman inspect ${env.containerName} --format '{{.State.Status}}:{{.State.Health.Status}}' 2>/dev/null || echo "not_found:none"`
    );
    const [containerStatus, healthStatus] = statusResult.stdout.trim().split(':');

    if (containerStatus === 'not_found') {
      env.status = 'stopped';
    } else if (containerStatus === 'running' && healthStatus === 'healthy') {
      env.status = 'running';
    } else if (containerStatus === 'running') {
      env.status = 'running';
    } else {
      env.status = 'failed';
    }

    // 로그 가져오기
    const logsResult = await ssh.exec(
      `podman logs ${env.containerName} --tail 20 2>&1`
    );

    return {
      success: true,
      action: 'get',
      environment: {
        ...env,
        logs: logsResult.stdout,
      } as PreviewEnvironment & { logs: string },
    };

  } catch (error) {
    return {
      success: false,
      action: 'get',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 만료된 Preview 환경 정리
 */
export async function cleanupExpiredPreviews(projectName: string): Promise<{
  cleaned: number;
  remaining: number;
}> {
  const ssh = getSSHClient();
  await ssh.connect();

  try {
    const listResult = await listPreviewEnvironments(projectName);
    const environments = listResult.environments || [];

    let cleaned = 0;
    const now = new Date();

    for (const env of environments) {
      if (new Date(env.expiresAt) < now) {
        await deletePreviewEnvironment(projectName, env.prNumber);
        cleaned++;
      }
    }

    return {
      cleaned,
      remaining: environments.length - cleaned,
    };

  } finally {
    ssh.disconnect();
  }
}

/**
 * Preview 도구 실행
 */
export async function executePreview(input: PreviewInput): Promise<PreviewResult> {
  const {
    action,
    projectName,
    prNumber,
    gitRef,
    ttlHours = 72,
  } = input;

  const ssh = getSSHClient();
  await ssh.connect();

  try {
    switch (action) {
      case 'create':
        if (!prNumber) {
          return { success: false, action, error: 'PR number required' };
        }
        return await createPreviewEnvironment(
          projectName,
          prNumber,
          gitRef || `pr-${prNumber}`,
          ttlHours
        );

      case 'update':
        if (!prNumber) {
          return { success: false, action, error: 'PR number required' };
        }
        return await updatePreviewEnvironment(projectName, prNumber, gitRef);

      case 'delete':
        if (!prNumber) {
          return { success: false, action, error: 'PR number required' };
        }
        return await deletePreviewEnvironment(projectName, prNumber);

      case 'list':
        return await listPreviewEnvironments(projectName);

      case 'get':
        if (!prNumber) {
          return { success: false, action, error: 'PR number required' };
        }
        return await getPreviewEnvironment(projectName, prNumber);

      default:
        return { success: false, action, error: `Unknown action: ${action}` };
    }

  } finally {
    ssh.disconnect();
  }
}

/**
 * Preview 도구 정의
 */
export const previewTool = {
  name: 'preview',
  description: 'PR 기반 Preview 환경을 생성, 업데이트, 삭제, 조회합니다',
  inputSchema: previewInputSchema,
  execute: executePreview,
};
