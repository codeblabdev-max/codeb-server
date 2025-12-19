/**
 * CodeB Deploy MCP - Compose 스타일 프로젝트 배포
 *
 * CI/CD 플로우:
 * 1. Developer → GitHub commit
 * 2. GitHub Actions → Build + Test + Push to ghcr.io
 * 3. This tool → Pull from ghcr.io → Deploy with Podman
 *
 * 실제 프로젝트 구조: app + postgres + redis
 * 해결하는 문제들:
 * 1. ghcr.io에서 빌드된 이미지 Pull (CI/CD 통과된 이미지만)
 * 2. PostgreSQL pg_hba.conf 자동 설정
 * 3. 컨테이너 IP 발견 및 DATABASE_URL 주입
 * 4. 서비스 의존성 순서 (db → redis → app)
 * 5. 볼륨 관리 및 충돌 해결
 */

import { z } from 'zod';
import { getSSHClient } from '../lib/ssh-client.js';
import {
  configurePgHba,
  getContainerIP,
  ensureNetwork,
  initVolume,
  getProjectNetworkName,
  createProjectNetwork,
  getNetworkContainers,
} from './podman-helpers.js';

// ============================================================================
// 타입 정의
// ============================================================================

/**
 * ghcr.io 인증 설정
 */
export interface GHCRAuthConfig {
  username: string;    // GitHub username
  token: string;       // GitHub Personal Access Token (PAT) with packages:read
}

export interface ComposeProjectConfig {
  projectName: string;
  projectPath?: string;  // 서버 내 프로젝트 경로 (환경변수 파일용, 옵션)
  services: {
    app: {
      image: string;        // ghcr.io/org/repo:tag 형식
      port: number;
      envFile?: string;
      healthEndpoint?: string;
      envVars?: Record<string, string>;  // 추가 환경변수
    };
    postgres?: {
      enabled: boolean;
      port: number;
      database: string;
      user: string;
      password: string;
      version?: string;
    };
    redis?: {
      enabled: boolean;
      port: number;
      password?: string;
      version?: string;
    };
  };
  domain?: string;
  networkName?: string;
  ghcrAuth?: GHCRAuthConfig;  // ghcr.io 인증 (private repo용)
  environment?: 'staging' | 'production' | 'preview';  // 배포 환경
  useProjectIsolatedNetwork?: boolean;  // 프로젝트별 격리 네트워크 사용 (기본: true)
}

export interface DeployResult {
  success: boolean;
  projectName: string;
  services: {
    name: string;
    status: 'running' | 'failed' | 'skipped';
    containerId?: string;
    containerIP?: string;
    port?: number;
    error?: string;
  }[];
  databaseUrl?: string;
  redisUrl?: string;
  appUrl?: string;
  duration: number;
  timestamp: string;
  // CI/CD 워크플로우 (첫 배포 시 자동 생성)
  githubActionsWorkflow?: {
    filename: string;
    content: string;
    instructions: string;
  };
}

// ============================================================================
// 프로젝트 설정 자동 감지
// ============================================================================

/**
 * 프로젝트 경로에서 설정 자동 감지
 * docker-compose.yml, package.json, Dockerfile 등을 분석
 */
export async function detectProjectConfig(
  projectPath: string
): Promise<Partial<ComposeProjectConfig> | null> {
  const ssh = getSSHClient();
  await ssh.connect();

  try {
    // 1. docker-compose.yml 확인
    const composeCheck = await ssh.exec(
      `cat ${projectPath}/docker-compose.yml 2>/dev/null || cat ${projectPath}/docker-compose.yaml 2>/dev/null || echo ""`
    );

    if (composeCheck.stdout.trim()) {
      // docker-compose 파싱 (간단한 YAML 파싱)
      const compose = composeCheck.stdout;
      const services: string[] = [];

      // 서비스 이름 추출
      const serviceMatches = compose.matchAll(/^\s{2}(\w+):\s*$/gm);
      for (const match of serviceMatches) {
        services.push(match[1]);
      }

      // 포트 추출
      const portMatches = compose.matchAll(/ports:\s*\n\s+-\s*["']?(\d+):(\d+)/g);
      const ports: Record<string, { host: number; container: number }> = {};
      for (const match of portMatches) {
        ports[match[0]] = { host: parseInt(match[1]), container: parseInt(match[2]) };
      }

      return {
        projectPath,
        services: {
          app: {
            image: '',
            port: 3000,
          },
          postgres: services.includes('postgres') || services.includes('db')
            ? { enabled: true, port: 5432, database: '', user: '', password: '' }
            : undefined,
          redis: services.includes('redis')
            ? { enabled: true, port: 6379 }
            : undefined,
        },
      };
    }

    // 2. package.json 확인
    const packageCheck = await ssh.exec(
      `cat ${projectPath}/package.json 2>/dev/null || echo ""`
    );

    if (packageCheck.stdout.trim()) {
      try {
        const pkg = JSON.parse(packageCheck.stdout);
        return {
          projectPath,
          projectName: pkg.name,
          services: {
            app: {
              image: `localhost/${pkg.name}`,
              port: 3000,
            },
          },
        };
      } catch {
        // JSON 파싱 실패
      }
    }

    return null;

  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// Compose 스타일 배포
// ============================================================================

/**
 * Compose 스타일 프로젝트 배포
 * 순서: network → postgres → redis → app
 */
export async function deployComposeProject(
  config: ComposeProjectConfig
): Promise<DeployResult> {
  const ssh = getSSHClient();
  await ssh.connect();

  const startTime = Date.now();
  const results: DeployResult['services'] = [];
  let databaseUrl: string | undefined;
  let redisUrl: string | undefined;

  const {
    projectName,
    projectPath,
    services,
    networkName,
    environment = 'production',
    useProjectIsolatedNetwork = true,  // 기본적으로 프로젝트별 격리 네트워크 사용
  } = config;

  try {
    // =========================================================================
    // 1. 네트워크 확보 (프로젝트 격리 또는 공유 네트워크)
    // =========================================================================
    let actualNetwork: string;

    if (useProjectIsolatedNetwork) {
      // 프로젝트별 격리 네트워크 사용 (권장)
      const projectNetwork = getProjectNetworkName(projectName, environment);

      console.error(`[Deploy] Using isolated network: ${projectNetwork}`);

      const networkResult = await createProjectNetwork(projectName, environment);

      if (!networkResult.success) {
        return {
          success: false,
          projectName,
          services: [{
            name: 'network',
            status: 'failed',
            error: networkResult.message,
          }],
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        };
      }

      actualNetwork = networkResult.networkName || projectNetwork;
    } else {
      // 레거시: 공유 네트워크 사용 (networkName이 지정된 경우)
      const networkResult = await ensureNetwork({
        preferredNetwork: networkName || 'podman',
        fallbackToDefault: true,
        createIfMissing: true,
        // 안전 검사: 다른 프로젝트 컨테이너가 있으면 삭제하지 않음
        projectName,
      });

      if (!networkResult.success) {
        return {
          success: false,
          projectName,
          services: [{
            name: 'network',
            status: 'failed',
            error: networkResult.message,
          }],
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        };
      }

      actualNetwork = networkResult.networkName;
    }

    // =========================================================================
    // 2. PostgreSQL 배포
    // =========================================================================
    if (services.postgres?.enabled) {
      const pg = services.postgres;
      const pgContainerName = `${projectName}-postgres`;
      const pgVolumeName = `${projectName}-postgres-data`;

      try {
        // 볼륨 초기화 (기존 데이터 유지)
        await initVolume({
          projectName,
          environment: 'production',
          volumeType: 'postgres',
          mode: 'create-if-not-exists',
        });

        // 기존 컨테이너 정리
        await ssh.exec(`podman stop ${pgContainerName} 2>/dev/null || true`);
        await ssh.exec(`podman rm ${pgContainerName} 2>/dev/null || true`);

        // PostgreSQL 컨테이너 시작
        const pgVersion = pg.version || '15-alpine';
        const pgStartResult = await ssh.exec(`
          podman run -d \\
            --name ${pgContainerName} \\
            --network ${actualNetwork} \\
            -e POSTGRES_DB=${pg.database} \\
            -e POSTGRES_USER=${pg.user} \\
            -e POSTGRES_PASSWORD=${pg.password} \\
            -p ${pg.port}:5432 \\
            -v ${pgVolumeName}:/var/lib/postgresql/data \\
            --restart unless-stopped \\
            --health-cmd="pg_isready -U ${pg.user} -d ${pg.database}" \\
            --health-interval=10s \\
            --health-timeout=5s \\
            --health-retries=5 \\
            postgres:${pgVersion}
        `, { timeout: 60000 });

        if (pgStartResult.code !== 0) {
          throw new Error(pgStartResult.stderr);
        }

        // PostgreSQL 시작 대기
        await waitForContainer(ssh, pgContainerName, 30);

        // pg_hba.conf 설정 (컨테이너 네트워크 접근 허용)
        await configurePgHba({
          containerName: pgContainerName,
          trustedNetworks: ['10.88.0.0/16', '172.16.0.0/12'],
          defaultAuthMethod: 'trust',
        });

        // 컨테이너 IP 확인
        const pgIPResult = await getContainerIP(pgContainerName);

        results.push({
          name: 'postgres',
          status: 'running',
          containerId: pgStartResult.stdout.trim().substring(0, 12),
          containerIP: pgIPResult.ipAddress || undefined,
          port: pg.port,
        });

        // DATABASE_URL 생성 (컨테이너 IP 사용)
        if (pgIPResult.ipAddress) {
          databaseUrl = `postgresql://${pg.user}:${pg.password}@${pgIPResult.ipAddress}:5432/${pg.database}`;
        } else {
          // 폴백: 외부 IP 사용
          const serverHost = ssh.getConfig().host;
          databaseUrl = `postgresql://${pg.user}:${pg.password}@${serverHost}:${pg.port}/${pg.database}`;
        }

      } catch (error) {
        results.push({
          name: 'postgres',
          status: 'failed',
          port: pg.port,
          error: error instanceof Error ? error.message : String(error),
        });

        // PostgreSQL 실패 시 전체 배포 중단
        return {
          success: false,
          projectName,
          services: results,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        };
      }
    }

    // =========================================================================
    // 3. Redis 배포
    // =========================================================================
    if (services.redis?.enabled) {
      const redis = services.redis;
      const redisContainerName = `${projectName}-redis`;

      try {
        // 기존 컨테이너 정리
        await ssh.exec(`podman stop ${redisContainerName} 2>/dev/null || true`);
        await ssh.exec(`podman rm ${redisContainerName} 2>/dev/null || true`);

        // Redis 컨테이너 시작
        const redisVersion = redis.version || '7-alpine';
        const redisCmd = redis.password
          ? `--requirepass ${redis.password}`
          : '';

        const redisStartResult = await ssh.exec(`
          podman run -d \\
            --name ${redisContainerName} \\
            --network ${actualNetwork} \\
            -p ${redis.port}:6379 \\
            --restart unless-stopped \\
            --health-cmd="redis-cli ping" \\
            --health-interval=10s \\
            --health-timeout=5s \\
            --health-retries=3 \\
            redis:${redisVersion} ${redisCmd}
        `, { timeout: 60000 });

        if (redisStartResult.code !== 0) {
          throw new Error(redisStartResult.stderr);
        }

        // Redis 시작 대기
        await waitForContainer(ssh, redisContainerName, 15);

        // 컨테이너 IP 확인
        const redisIPResult = await getContainerIP(redisContainerName);

        results.push({
          name: 'redis',
          status: 'running',
          containerId: redisStartResult.stdout.trim().substring(0, 12),
          containerIP: redisIPResult.ipAddress || undefined,
          port: redis.port,
        });

        // REDIS_URL 생성
        if (redisIPResult.ipAddress) {
          redisUrl = redis.password
            ? `redis://:${redis.password}@${redisIPResult.ipAddress}:6379`
            : `redis://${redisIPResult.ipAddress}:6379`;
        }

      } catch (error) {
        results.push({
          name: 'redis',
          status: 'failed',
          port: redis.port,
          error: error instanceof Error ? error.message : String(error),
        });
        // Redis 실패는 경고만 (계속 진행)
      }
    }

    // =========================================================================
    // 4. App 배포 (ghcr.io 이미지 Pull)
    // =========================================================================
    const app = services.app;
    const appContainerName = `${projectName}-app`;

    try {
      // ghcr.io 인증 (private registry용)
      if (config.ghcrAuth) {
        const loginResult = await ssh.exec(
          `echo "${config.ghcrAuth.token}" | podman login ghcr.io -u ${config.ghcrAuth.username} --password-stdin`,
          { timeout: 30000 }
        );

        if (loginResult.code !== 0) {
          throw new Error(`GHCR login failed: ${loginResult.stderr}`);
        }
        console.error(`[Deploy] GHCR login successful for ${config.ghcrAuth.username}`);
      }

      // CI/CD에서 빌드된 이미지 Pull (로컬 빌드 금지)
      if (app.image.startsWith('localhost/')) {
        throw new Error(
          `Local image not allowed: ${app.image}. ` +
          `Use ghcr.io images from CI/CD pipeline (e.g., ghcr.io/org/repo:tag)`
        );
      }

      console.error(`[Deploy] Pulling image: ${app.image}`);
      const pullResult = await ssh.exec(`podman pull ${app.image}`, { timeout: 300000 });

      if (pullResult.code !== 0) {
        throw new Error(`Image pull failed: ${pullResult.stderr}`);
      }
      console.error(`[Deploy] Image pulled successfully: ${app.image}`);

      // 기존 컨테이너 정리
      await ssh.exec(`podman stop ${appContainerName} 2>/dev/null || true`);
      await ssh.exec(`podman rm ${appContainerName} 2>/dev/null || true`);

      // 환경 변수 준비
      const envVars: string[] = [];

      if (databaseUrl) {
        envVars.push(`-e DATABASE_URL="${databaseUrl}"`);
        envVars.push(`-e DIRECT_URL="${databaseUrl}"`);
      }

      if (redisUrl) {
        envVars.push(`-e REDIS_URL="${redisUrl}"`);
      }

      // 추가 환경변수 (config에서 전달된)
      if (app.envVars) {
        for (const [key, value] of Object.entries(app.envVars)) {
          envVars.push(`-e ${key}="${value}"`);
        }
      }

      // 환경 파일이 있으면 사용 (서버에 미리 배포된 .env 파일)
      if (app.envFile && projectPath) {
        const envFilePath = app.envFile.startsWith('/')
          ? app.envFile
          : `${projectPath}/${app.envFile}`;
        const envFileExists = await ssh.exec(`test -f ${envFilePath} && echo "yes" || echo "no"`);
        if (envFileExists.stdout.trim() === 'yes') {
          envVars.push(`--env-file ${envFilePath}`);
        }
      }

      // App 컨테이너 시작
      const healthEndpoint = app.healthEndpoint || '/api/health';
      const appStartResult = await ssh.exec(`
        podman run -d \\
          --name ${appContainerName} \\
          --network ${actualNetwork} \\
          -p ${app.port}:3000 \\
          ${envVars.join(' ')} \\
          --restart unless-stopped \\
          --health-cmd="curl -f http://localhost:3000${healthEndpoint} || exit 1" \\
          --health-interval=30s \\
          --health-timeout=10s \\
          --health-retries=3 \\
          --health-start-period=40s \\
          ${app.image}
      `, { timeout: 120000 });

      if (appStartResult.code !== 0) {
        throw new Error(appStartResult.stderr);
      }

      // App 시작 대기
      await waitForContainer(ssh, appContainerName, 60);

      // 컨테이너 IP 확인
      const appIPResult = await getContainerIP(appContainerName);

      results.push({
        name: 'app',
        status: 'running',
        containerId: appStartResult.stdout.trim().substring(0, 12),
        containerIP: appIPResult.ipAddress || undefined,
        port: app.port,
      });

    } catch (error) {
      results.push({
        name: 'app',
        status: 'failed',
        port: app.port,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        projectName,
        services: results,
        databaseUrl,
        redisUrl,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // =========================================================================
    // 5. 결과 반환 + GitHub Actions 워크플로우 자동 생성
    // =========================================================================
    const serverHost = ssh.getConfig().host;
    const appUrl = config.domain
      ? `https://${config.domain}`
      : `http://${serverHost}:${app.port}`;

    // ghcr.io 이미지에서 레지스트리/이미지 정보 추출하여 워크플로우 생성
    let githubActionsWorkflow: DeployResult['githubActionsWorkflow'];

    if (app.image.startsWith('ghcr.io/')) {
      // ghcr.io/owner/repo:tag 형식 파싱
      const imageParts = app.image.replace('ghcr.io/', '').split(':')[0].split('/');
      const owner = imageParts[0];
      const imageName = imageParts.slice(1).join('/') || projectName;

      const workflowContent = generateGitHubActionsWorkflow({
        projectName,
        registry: `ghcr.io/${owner}`,
        imageName,
      });

      githubActionsWorkflow = {
        filename: '.github/workflows/deploy.yml',
        content: workflowContent,
        instructions: `
프로젝트에 CI/CD를 설정하려면:
1. 이 워크플로우를 프로젝트 루트의 .github/workflows/deploy.yml에 저장
2. GitHub에 push하면 자동으로:
   - 테스트 실행
   - Docker 이미지 빌드
   - ghcr.io/${owner}/${imageName}:latest 로 푸시
3. 이후 deploy_compose_project로 배포 시 최신 이미지가 자동으로 pull됨
`.trim(),
      };
    }

    return {
      success: true,
      projectName,
      services: results,
      databaseUrl,
      redisUrl,
      appUrl,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      githubActionsWorkflow,
    };

  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// 헬퍼 함수
// ============================================================================

/**
 * 컨테이너 시작 대기
 */
async function waitForContainer(
  ssh: ReturnType<typeof getSSHClient>,
  containerName: string,
  timeoutSeconds: number
): Promise<void> {
  const startTime = Date.now();
  const timeout = timeoutSeconds * 1000;

  while (Date.now() - startTime < timeout) {
    const result = await ssh.exec(
      `podman inspect ${containerName} --format '{{.State.Running}}' 2>/dev/null || echo "false"`
    );

    if (result.stdout.trim() === 'true') {
      // 추가로 헬스 상태 확인
      const healthResult = await ssh.exec(
        `podman inspect ${containerName} --format '{{.State.Health.Status}}' 2>/dev/null || echo "none"`
      );

      const health = healthResult.stdout.trim();
      if (health === 'healthy' || health === 'none') {
        return;
      }
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error(`Container ${containerName} failed to start within ${timeoutSeconds} seconds`);
}

/**
 * 프로젝트 중지
 */
export async function stopComposeProject(projectName: string): Promise<{
  success: boolean;
  stoppedContainers: string[];
}> {
  const ssh = getSSHClient();
  await ssh.connect();

  const stoppedContainers: string[] = [];

  try {
    const containerPatterns = [
      `${projectName}-app`,
      `${projectName}-postgres`,
      `${projectName}-redis`,
      `${projectName}-web`,  // 일부 프로젝트는 web 사용
    ];

    for (const pattern of containerPatterns) {
      const result = await ssh.exec(`podman stop ${pattern} 2>/dev/null && echo "stopped" || echo "not_found"`);
      if (result.stdout.trim() === 'stopped') {
        stoppedContainers.push(pattern);
      }
    }

    return {
      success: true,
      stoppedContainers,
    };

  } finally {
    ssh.disconnect();
  }
}

/**
 * 프로젝트 제거 (볼륨 제외)
 */
export async function removeComposeProject(
  projectName: string,
  removeVolumes: boolean = false
): Promise<{
  success: boolean;
  removedContainers: string[];
  removedVolumes: string[];
}> {
  const ssh = getSSHClient();
  await ssh.connect();

  const removedContainers: string[] = [];
  const removedVolumes: string[] = [];

  try {
    // 컨테이너 제거
    const containerPatterns = [
      `${projectName}-app`,
      `${projectName}-postgres`,
      `${projectName}-redis`,
      `${projectName}-web`,
    ];

    for (const pattern of containerPatterns) {
      await ssh.exec(`podman stop ${pattern} 2>/dev/null || true`);
      const result = await ssh.exec(`podman rm ${pattern} 2>/dev/null && echo "removed" || echo "not_found"`);
      if (result.stdout.trim() === 'removed') {
        removedContainers.push(pattern);
      }
    }

    // 볼륨 제거 (옵션)
    if (removeVolumes) {
      const volumePatterns = [
        `${projectName}-postgres-data`,
        `${projectName}-redis-data`,
        `${projectName}-app-data`,
      ];

      for (const pattern of volumePatterns) {
        const result = await ssh.exec(`podman volume rm ${pattern} 2>/dev/null && echo "removed" || echo "not_found"`);
        if (result.stdout.trim() === 'removed') {
          removedVolumes.push(pattern);
        }
      }
    }

    return {
      success: true,
      removedContainers,
      removedVolumes,
    };

  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// MCP 도구 정의
// ============================================================================

export const deployComposeProjectTool = {
  name: 'deploy_compose_project',
  description: `CI/CD 파이프라인 통합 배포 도구.
GitHub Actions에서 빌드된 ghcr.io 이미지를 Pull하여 배포합니다.

플로우:
1. Developer → GitHub commit
2. GitHub Actions → Build + Test + Push to ghcr.io
3. 이 도구 → ghcr.io에서 Pull → Podman으로 배포

중요: localhost/ 이미지는 허용되지 않습니다. 반드시 ghcr.io 이미지를 사용하세요.`,
  inputSchema: z.object({
    projectName: z.string().describe('프로젝트 이름'),
    projectPath: z.string().optional().describe('서버 내 프로젝트 경로 (환경 파일용, 옵션)'),
    app: z.object({
      image: z.string().describe('ghcr.io 이미지 (예: ghcr.io/org/repo:tag)'),
      port: z.number().describe('앱 외부 포트'),
      envFile: z.string().optional().describe('서버에 있는 환경 파일 경로'),
      healthEndpoint: z.string().optional().describe('헬스체크 엔드포인트 (기본: /api/health)'),
      envVars: z.record(z.string()).optional().describe('추가 환경변수 (key-value)'),
    }),
    postgres: z.object({
      enabled: z.boolean(),
      port: z.number(),
      database: z.string(),
      user: z.string(),
      password: z.string(),
      version: z.string().optional(),
    }).optional(),
    redis: z.object({
      enabled: z.boolean(),
      port: z.number(),
      password: z.string().optional(),
      version: z.string().optional(),
    }).optional(),
    domain: z.string().optional().describe('도메인 (옵션)'),
    networkName: z.string().optional().describe('Podman 네트워크 (레거시 - 공유 네트워크 사용 시)'),
    environment: z.enum(['staging', 'production', 'preview']).optional().describe('배포 환경 (기본: production)'),
    useProjectIsolatedNetwork: z.boolean().optional().describe('프로젝트별 격리 네트워크 사용 (기본: true, 권장)'),
    ghcrAuth: z.object({
      username: z.string().describe('GitHub 사용자명'),
      token: z.string().describe('GitHub PAT (packages:read 권한)'),
    }).optional().describe('ghcr.io 인증 (private repo용)'),
  }),
  execute: async (input: {
    projectName: string;
    projectPath?: string;
    app: { image: string; port: number; envFile?: string; healthEndpoint?: string; envVars?: Record<string, string> };
    postgres?: { enabled: boolean; port: number; database: string; user: string; password: string; version?: string };
    redis?: { enabled: boolean; port: number; password?: string; version?: string };
    domain?: string;
    networkName?: string;
    environment?: 'staging' | 'production' | 'preview';
    useProjectIsolatedNetwork?: boolean;
    ghcrAuth?: { username: string; token: string };
  }) => {
    return deployComposeProject({
      projectName: input.projectName,
      projectPath: input.projectPath,
      services: {
        app: input.app,
        postgres: input.postgres,
        redis: input.redis,
      },
      domain: input.domain,
      networkName: input.networkName,
      environment: input.environment,
      useProjectIsolatedNetwork: input.useProjectIsolatedNetwork,
      ghcrAuth: input.ghcrAuth,
    });
  },
};

export const stopComposeProjectTool = {
  name: 'stop_compose_project',
  description: 'Compose 스타일 프로젝트의 모든 컨테이너 중지',
  inputSchema: z.object({
    projectName: z.string().describe('프로젝트 이름'),
  }),
  execute: async (input: { projectName: string }) => {
    return stopComposeProject(input.projectName);
  },
};

export const removeComposeProjectTool = {
  name: 'remove_compose_project',
  description: 'Compose 스타일 프로젝트의 모든 컨테이너 및 볼륨 제거',
  inputSchema: z.object({
    projectName: z.string().describe('프로젝트 이름'),
    removeVolumes: z.boolean().optional().describe('볼륨도 제거할지 여부 (기본: false)'),
  }),
  execute: async (input: { projectName: string; removeVolumes?: boolean }) => {
    return removeComposeProject(input.projectName, input.removeVolumes);
  },
};

export const detectProjectConfigTool = {
  name: 'detect_project_config',
  description: '프로젝트 경로에서 배포 설정 자동 감지',
  inputSchema: z.object({
    projectPath: z.string().describe('서버 내 프로젝트 경로'),
  }),
  execute: async (input: { projectPath: string }) => {
    return detectProjectConfig(input.projectPath);
  },
};

// ============================================================================
// GitHub Actions 워크플로우 생성
// ============================================================================

/**
 * GitHub Actions CI/CD 워크플로우 생성
 * ghcr.io에 이미지를 빌드하고 푸시하는 워크플로우
 */
export function generateGitHubActionsWorkflow(config: {
  projectName: string;
  registry: string;  // ghcr.io/username 또는 ghcr.io/org
  imageName: string;
  dockerfile?: string;
  buildArgs?: Record<string, string>;
  testCommand?: string;
  nodeVersion?: string;
}): string {
  const {
    projectName,
    registry,
    imageName,
    dockerfile = 'Dockerfile',
    buildArgs = {},
    testCommand = 'npm run test --if-present',
    nodeVersion = '20',
  } = config;

  const buildArgsYaml = Object.entries(buildArgs)
    .map(([key, value]) => `            ${key}=\${${value}}`)
    .join('\n');

  return `# CodeB Deploy - GitHub Actions CI/CD Workflow
# Generated for: ${projectName}
#
# 플로우:
# 1. Push to main/develop → Trigger workflow
# 2. Run tests → Build Docker image → Push to ghcr.io
# 3. Deploy to server using CodeB MCP (deploy_compose_project)

name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${registry}/${imageName}

jobs:
  test:
    name: Run Tests
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '${nodeVersion}'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint --if-present

      - name: Run type check
        run: npm run typecheck --if-present

      - name: Run tests
        run: ${testCommand}

  build-and-push:
    name: Build and Push Docker Image
    needs: test
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    permissions:
      contents: read
      packages: write

    outputs:
      image_tag: \${{ steps.meta.outputs.tags }}
      image_digest: \${{ steps.build.outputs.digest }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: \${{ env.REGISTRY }}
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: \${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=sha,prefix=
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        id: build
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./${dockerfile}
          push: true
          tags: \${{ steps.meta.outputs.tags }}
          labels: \${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
${buildArgsYaml ? `          build-args: |\n${buildArgsYaml}` : ''}

      - name: Output image info
        run: |
          echo "Image pushed: \${{ env.IMAGE_NAME }}"
          echo "Tags: \${{ steps.meta.outputs.tags }}"
          echo "Digest: \${{ steps.build.outputs.digest }}"

  # 선택적: 자동 배포 (수동 트리거도 가능)
  # deploy:
  #   name: Deploy to Server
  #   needs: build-and-push
  #   runs-on: ubuntu-latest
  #   if: github.ref == 'refs/heads/main'
  #   steps:
  #     - name: Deploy via SSH
  #       uses: appleboy/ssh-action@v1.0.0
  #       with:
  #         host: \${{ secrets.SERVER_HOST }}
  #         username: \${{ secrets.SERVER_USER }}
  #         key: \${{ secrets.SSH_PRIVATE_KEY }}
  #         script: |
  #           podman pull \${{ env.IMAGE_NAME }}:latest
  #           # CodeB MCP deploy_compose_project 호출 또는 직접 podman run
`;
}

export const generateWorkflowTool = {
  name: 'generate_github_actions_workflow',
  description: `GitHub Actions CI/CD 워크플로우 YAML 생성.

이 워크플로우는:
1. 테스트 실행 (lint, typecheck, test)
2. Docker 이미지 빌드
3. ghcr.io에 푸시

생성된 파일을 .github/workflows/deploy.yml로 저장하세요.`,
  inputSchema: z.object({
    projectName: z.string().describe('프로젝트 이름'),
    registry: z.string().describe('ghcr.io 레지스트리 (예: ghcr.io/username)'),
    imageName: z.string().describe('이미지 이름 (예: my-app)'),
    dockerfile: z.string().optional().describe('Dockerfile 경로 (기본: Dockerfile)'),
    buildArgs: z.record(z.string()).optional().describe('빌드 인자'),
    testCommand: z.string().optional().describe('테스트 명령어 (기본: npm run test)'),
    nodeVersion: z.string().optional().describe('Node.js 버전 (기본: 20)'),
  }),
  execute: async (input: {
    projectName: string;
    registry: string;
    imageName: string;
    dockerfile?: string;
    buildArgs?: Record<string, string>;
    testCommand?: string;
    nodeVersion?: string;
  }) => {
    const workflow = generateGitHubActionsWorkflow(input);
    return {
      success: true,
      workflow,
      filename: '.github/workflows/deploy.yml',
      instructions: `
1. 이 워크플로우를 프로젝트의 .github/workflows/deploy.yml에 저장
2. GitHub repo Settings → Secrets에서 필요한 시크릿 설정
3. push 하면 자동으로 ghcr.io에 이미지 빌드 및 푸시
4. deploy_compose_project 도구로 서버에 배포:
   - image: ${input.registry}/${input.imageName}:latest
`,
    };
  },
};
