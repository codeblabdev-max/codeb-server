/**
 * CodeB v7.0.58 - Project Init/Scan Tool (DB-Primary)
 *
 * v7.0.58 Changes:
 * - DB-Primary: PostgreSQL이 주 데이터 소스
 * - ProjectRepo, SlotRepo 사용
 * - 파일 기반 백업 (secondary)
 *
 * /we:quick 명령어에서 내부적으로 호출됨:
 * - workflow_init (project_init): 프로젝트 초기화
 * - workflow_scan (project_scan): 프로젝트 상태 스캔
 *
 * 프로젝트 초기화 (서버별 리소스 생성):
 *
 * App Server (158.247.203.55):
 * 1. DB에 프로젝트 등록 (SSOT)
 * 2. DB에서 포트 할당
 * 3. DB에 슬롯 레지스트리 생성
 * 4. ENV 파일 생성 + 백업
 * 5. Caddy 도메인 설정
 *
 * Storage Server (64.176.226.119):
 * 6. PostgreSQL DB/User 생성
 * 7. Redis DB 번호 할당
 *
 * 로컬 (반환값으로 제공):
 * 8. GitHub Actions workflow 템플릿
 * 9. Dockerfile 템플릿
 */

import { z } from 'zod';
import { randomBytes } from 'crypto';
import type { AuthContext } from '../lib/types.js';
import { withSSH } from '../lib/ssh.js';
import { SERVERS, getSlotPorts } from '../lib/servers.js';
import { ProjectRepo, SlotRepo, TeamRepo } from '../lib/database.js';
import { initializeSlots, getAvailablePort } from './slot.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// Input Schema
// ============================================================================

export const projectInitInputSchema = z.object({
  projectName: z.string().min(1).max(50),
  type: z.enum(['nextjs', 'remix', 'nodejs', 'python', 'go']).default('nextjs'),
  database: z.boolean().default(true),
  redis: z.boolean().default(true),
  domain: z.string().optional(), // 실제 도메인 (없으면 {projectName}.codeb.kr)
  // Production Only - Blue-Green이 staging 역할을 대체
});

export const projectScanInputSchema = z.object({
  projectName: z.string().min(1).max(50),
});

// ============================================================================
// Types
// ============================================================================

interface WorkflowInitResult {
  success: boolean;
  projectName: string;
  files: string[];
  ports: {
    blue: number;
    green: number;
  };
  database?: {
    name: string;
    user: string;
    password: string;
    host: string;
    port: number;
    url: string;
  };
  redis?: {
    db: number;
    host: string;
    port: number;
    url: string;
  };
  domain: string;
  registryPath: string;
  githubActionsWorkflow: string;
  dockerfile: string;
  instructions: string[];
  error?: string;
}

interface WorkflowScanResult {
  success: boolean;
  projectName: string;
  registered: boolean;
  hasDockerfile: boolean;
  hasDockerContainer: boolean;
  hasGitHubActions: boolean;
  hasEnv: boolean;
  ports: {
    blue: number;
    green: number;
  };
  slotStatus?: {
    activeSlot: string;
    blueState: string;
    greenState: string;
  };
  issues: string[];
  // v7.0.62: 팀 프로젝트 목록 및 추천
  teamProjects?: string[];
  suggestedProject?: string;
}

// ============================================================================
// Workflow Init (DB-Primary)
// ============================================================================

async function executeWorkflowInit(
  input: z.infer<typeof projectInitInputSchema>,
  auth: AuthContext
): Promise<WorkflowInitResult> {
  const { projectName, type, database: needsDatabase, redis: needsRedis, domain: inputDomain } = input;

  const files: string[] = [];
  let ports: WorkflowInitResult['ports'] = { blue: 0, green: 0 };
  let dbInfo: WorkflowInitResult['database'];
  let redisInfo: WorkflowInitResult['redis'];
  // 도메인: 입력값 또는 기본 테스트 도메인
  const domain = inputDomain || `${projectName}.codeb.kr`;

  try {
    // ============================================================
    // Step 1: 기존 프로젝트 체크 (DB)
    // ============================================================
    const existingProject = await ProjectRepo.findByName(projectName);
    if (existingProject) {
      logger.warn('Project already exists', { projectName });
      return {
        success: false,
        projectName,
        files: [],
        ports: { blue: 0, green: 0 },
        domain,
        registryPath: '',
        githubActionsWorkflow: '',
        dockerfile: '',
        instructions: [],
        error: `Project ${projectName} already exists. Use /we:deploy to deploy.`,
      };
    }

    // ============================================================
    // Step 2: DB에서 포트 할당
    // ============================================================
    const basePort = await getAvailablePort('production');
    ports = getSlotPorts(basePort);
    logger.info('Ports allocated from DB', { projectName, ports });

    // ============================================================
    // Step 3: Storage Server (PostgreSQL, Redis)
    // ============================================================
    await withSSH(SERVERS.storage.ip, async (storageSSH) => {
      const dbPassword = generatePassword();
      const dbName = `${projectName}_db`;
      const dbUser = `${projectName}_user`;

      // PostgreSQL DB/User 생성
      if (needsDatabase) {
        await storageSSH.exec(`sudo -u postgres psql -c "CREATE DATABASE ${dbName};" || true`);
        await storageSSH.exec(`sudo -u postgres psql -c "CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}';" || true`);
        await storageSSH.exec(`sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser};"`);
        await storageSSH.exec(`sudo -u postgres psql -c "ALTER DATABASE ${dbName} OWNER TO ${dbUser};"`);

        dbInfo = {
          name: dbName,
          user: dbUser,
          password: dbPassword,
          host: SERVERS.storage.domain,
          port: SERVERS.storage.ports.postgresql,
          url: `postgresql://${dbUser}:${dbPassword}@${SERVERS.storage.domain}:${SERVERS.storage.ports.postgresql}/${dbName}?schema=public`,
        };
      }

      // Redis DB 번호 할당
      if (needsRedis) {
        const redisDb = await allocateRedisDb(storageSSH, projectName);
        redisInfo = {
          db: redisDb,
          host: SERVERS.storage.domain,
          port: SERVERS.storage.ports.redis,
          url: `redis://${SERVERS.storage.domain}:${SERVERS.storage.ports.redis}/${redisDb}`,
        };
      }
    });

    // ============================================================
    // Step 4: 팀 찾기 또는 자동 생성 (Foreign Key 해결)
    // ============================================================
    let existingTeam = await TeamRepo.findById(auth.teamId);

    // ID로 못 찾으면 slug로도 확인 (API Key의 teamId가 slug인 경우)
    if (!existingTeam) {
      const teamSlug = auth.teamId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      existingTeam = await TeamRepo.findBySlug(teamSlug);
      if (existingTeam) {
        logger.info('Team found by slug', { requestedId: auth.teamId, actualId: existingTeam.id, slug: teamSlug });
      }
    }

    // 실제 사용할 팀 ID (DB의 팀 ID 또는 새로 생성할 ID)
    let actualTeamId = existingTeam?.id || auth.teamId;

    if (!existingTeam) {
      logger.info('Team not found, creating automatically', { teamId: auth.teamId });
      try {
        await TeamRepo.create({
          id: auth.teamId,
          name: auth.teamId,
          slug: auth.teamId.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          owner: auth.keyId || 'system',
          plan: 'free',
          projects: [],
          settings: {
            defaultEnvironment: 'production',
            autoPromote: false,
            gracePeriodHours: 48,
          },
        });
        actualTeamId = auth.teamId;
        logger.info('Team created', { teamId: auth.teamId });
      } catch (teamError: any) {
        // 이미 존재하는 경우 (slug 중복 등) slug로 다시 찾기
        if (teamError?.message?.includes('duplicate key') || teamError?.message?.includes('unique constraint')) {
          logger.info('Team already exists (concurrent creation), finding by slug', { teamId: auth.teamId });
          const teamBySlug = await TeamRepo.findBySlug(auth.teamId.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
          if (teamBySlug) {
            actualTeamId = teamBySlug.id;
          }
        } else {
          throw teamError;
        }
      }
    }

    logger.info('Using team ID for project', { requestedTeamId: auth.teamId, actualTeamId });

    // ============================================================
    // Step 5: DB에 프로젝트 등록 (SSOT)
    // ============================================================
    await ProjectRepo.create({
      name: projectName,
      teamId: actualTeamId,  // 실제 DB 팀 ID 사용
      type,
      databaseName: dbInfo?.name,
      databasePort: dbInfo ? SERVERS.storage.ports.postgresql : undefined,
      redisDb: redisInfo?.db,
      redisPort: redisInfo ? SERVERS.storage.ports.redis : undefined,
    });
    logger.info('Project registered in database', { projectName, teamId: actualTeamId });

    // ============================================================
    // Step 6: DB에 슬롯 레지스트리 생성
    // ============================================================
    await initializeSlots(projectName, 'production', basePort, actualTeamId);
    logger.info('Slot registry initialized', { projectName });

    // ============================================================
    // Step 7: App Server (디렉토리, ENV, Caddy)
    // ============================================================
    await withSSH(SERVERS.app.ip, async (appSSH) => {
      // 프로젝트 디렉토리 생성
      const projectDir = `/opt/codeb/projects/${projectName}`;
      await appSSH.exec(`mkdir -p ${projectDir}`);
      await appSSH.exec(`mkdir -p /opt/codeb/env/${projectName}`);
      await appSSH.exec(`mkdir -p /opt/codeb/env-backup/${projectName}`);

      // 슬롯 레지스트리 디렉토리 (파일 백업용)
      await appSSH.exec(`mkdir -p /opt/codeb/registry/slots`);

      // ENV 파일 생성
      const envContent = generateEnvWithCredentials({
        projectName,
        database: dbInfo,
        redis: redisInfo,
        domain,
      });

      const envPath = `/opt/codeb/env/${projectName}/.env`;
      await appSSH.writeFile(envPath, envContent);
      files.push(envPath);

      // ENV 백업
      const backupPath = `/opt/codeb/env-backup/${projectName}/.env.${Date.now()}`;
      await appSSH.exec(`cp ${envPath} ${backupPath}`);

      // Caddy 도메인 설정
      const caddySnippet = `
${domain} {
  reverse_proxy localhost:${ports.blue} localhost:${ports.green} {
    lb_policy first
    fail_duration 10s
  }
  encode gzip
  log {
    output file /var/log/caddy/${projectName}.log
  }
}
`;
      const caddyPath = `/etc/caddy/sites/${projectName}.caddy`;
      await appSSH.exec(`sudo mkdir -p /etc/caddy/sites`);
      await appSSH.exec(`echo '${caddySnippet}' | sudo tee ${caddyPath}`);
      await appSSH.exec(`sudo systemctl reload caddy || true`);
      files.push(caddyPath);

      // PowerDNS A 레코드 추가 (codeb.kr 서브도메인인 경우만)
      if (domain.endsWith('.codeb.kr')) {
        const subdomain = domain.replace('.codeb.kr', '');
        await appSSH.exec(`pdnsutil add-record codeb.kr ${subdomain} A 300 ${SERVERS.app.ip} 2>/dev/null || true`);
        await appSSH.exec(`pdnsutil rectify-zone codeb.kr 2>/dev/null || true`);
      }

      // SSL 인증서 발급 대기 (최대 30초)
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const certCheck = await appSSH.exec(
          `curl -sI https://${domain} --connect-timeout 5 2>&1 | head -1 || echo "pending"`
        );
        if (certCheck.stdout.includes('HTTP/') || certCheck.stdout.includes('200')) {
          break;
        }
      }
    });

    // ============================================================
    // Step 8: 결과 반환
    // ============================================================
    const githubActionsWorkflow = generateGitHubActionsWorkflow({ projectName, type });
    const dockerfile = generateDockerfile(type);

    const instructions = [
      `✅ 프로젝트 초기화 완료!`,
      ``,
      `📊 할당된 리소스:`,
      `   포트: Blue=${ports.blue}, Green=${ports.green}`,
      dbInfo ? `   DB: ${dbInfo.name} (${dbInfo.user}@${dbInfo.host})` : '',
      redisInfo ? `   Redis: DB ${redisInfo.db}` : '',
      `   도메인: ${domain}`,
      ``,
      `📁 로컬에 생성할 파일:`,
      `   1. .github/workflows/deploy.yml`,
      `   2. Dockerfile (없으면)`,
      ``,
      `🔑 GitHub Secrets 설정:`,
      `   - CODEB_API_KEY: CodeB API 키`,
      ``,
      `🚀 배포:`,
      `   git push origin main  # → 비활성 슬롯에 배포`,
      `   we promote ${projectName}  # → 트래픽 전환`,
    ].filter(Boolean);

    logger.info('Workflow init completed', { projectName, domain, ports });

    return {
      success: true,
      projectName,
      files,
      ports,
      database: dbInfo,
      redis: redisInfo,
      domain,
      registryPath: `DB: projects/${projectName}`,
      githubActionsWorkflow,
      dockerfile,
      instructions,
    };
  } catch (error) {
    logger.error('Workflow init failed', {
      projectName,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      projectName,
      files,
      ports,
      domain,
      registryPath: '',
      githubActionsWorkflow: '',
      dockerfile: '',
      instructions: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Workflow Scan (DB-Primary)
// ============================================================================

async function executeWorkflowScan(
  input: z.infer<typeof projectScanInputSchema>,
  auth: AuthContext
): Promise<WorkflowScanResult> {
  const { projectName } = input;

  const issues: string[] = [];
  let ports: WorkflowScanResult['ports'] = { blue: 0, green: 0 };
  let slotStatus: WorkflowScanResult['slotStatus'];
  let teamProjects: string[] = [];
  let suggestedProject: string | undefined;

  try {
    // ============================================================
    // Step 1: DB에서 프로젝트 조회
    // ============================================================
    const project = await ProjectRepo.findByName(projectName);
    const registered = !!project;

    // ============================================================
    // Step 1.5: 팀 프로젝트 목록 조회 및 유사 프로젝트 추천 (v7.0.62)
    // ============================================================
    try {
      const allTeamProjects = await ProjectRepo.findByTeam(auth.teamId);
      teamProjects = allTeamProjects.map(p => p.name);

      if (!registered && teamProjects.length > 0) {
        // 유사 프로젝트 찾기 (Levenshtein distance 기반)
        const similar = findSimilarProject(projectName, teamProjects);
        if (similar) {
          suggestedProject = similar;
          issues.push(`프로젝트 '${projectName}'가 없습니다. '${similar}'를 의미하셨나요?`);
        }
      }
    } catch (teamError) {
      logger.warn('Failed to fetch team projects', { teamId: auth.teamId, error: String(teamError) });
    }

    if (!registered) {
      issues.push('프로젝트가 DB에 등록되지 않음. /we:quick 실행 필요');
      if (teamProjects.length > 0) {
        issues.push(`팀의 등록된 프로젝트: ${teamProjects.join(', ')}`);
      }
    }

    // ============================================================
    // Step 2: DB에서 슬롯 조회
    // ============================================================
    const slots = await SlotRepo.findByProject(projectName, 'production');
    if (slots) {
      ports = { blue: slots.blue.port, green: slots.green.port };
      slotStatus = {
        activeSlot: slots.activeSlot,
        blueState: slots.blue.state,
        greenState: slots.green.state,
      };
    } else if (registered) {
      issues.push('슬롯 레지스트리가 없음');
    }

    // ============================================================
    // Step 3: App Server에서 상태 확인
    // ============================================================
    const serverStatus = await withSSH(SERVERS.app.ip, async (ssh) => {
      const projectDir = `/opt/codeb/projects/${projectName}`;

      // Dockerfile 확인
      let hasDockerfile = false;
      try {
        await ssh.exec(`test -f ${projectDir}/Dockerfile`);
        hasDockerfile = true;
      } catch {
        // no dockerfile
      }

      // Docker 컨테이너 확인
      let hasDockerContainer = false;
      try {
        const result = await ssh.exec(`docker ps -a --format '{{.Names}}' | grep -c "^${projectName}-" || echo "0"`);
        hasDockerContainer = parseInt(result.stdout.trim()) > 0;
      } catch {
        // no docker containers
      }

      // ENV 확인
      let hasEnv = false;
      try {
        await ssh.exec(`test -f /opt/codeb/env/${projectName}/.env`);
        hasEnv = true;
      } catch {
        // no env
      }

      return { hasDockerfile, hasDockerContainer, hasEnv };
    });

    if (!serverStatus.hasDockerContainer) {
      issues.push('Docker 컨테이너가 없음 (첫 배포 필요)');
    }
    if (!serverStatus.hasEnv) {
      issues.push('ENV 파일이 없음');
    }

    logger.debug('Workflow scan completed', { projectName, registered, issues });

    return {
      success: true,
      projectName,
      registered,
      hasDockerfile: serverStatus.hasDockerfile,
      hasDockerContainer: serverStatus.hasDockerContainer,
      hasGitHubActions: false, // 서버에서 확인 불가
      hasEnv: serverStatus.hasEnv,
      ports,
      slotStatus,
      issues,
      // v7.0.62: 팀 프로젝트 목록 및 추천
      teamProjects: teamProjects.length > 0 ? teamProjects : undefined,
      suggestedProject,
    };
  } catch (error) {
    logger.error('Workflow scan failed', {
      projectName,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      projectName,
      registered: false,
      hasDockerfile: false,
      hasDockerContainer: false,
      hasGitHubActions: false,
      hasEnv: false,
      ports,
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function generatePassword(length: number = 32): string {
  return randomBytes(length).toString('base64url').slice(0, length);
}

/**
 * Find similar project name using Levenshtein distance (v7.0.62)
 * Returns the most similar project name if distance <= 3
 */
function findSimilarProject(input: string, projects: string[]): string | undefined {
  const inputLower = input.toLowerCase();
  let bestMatch: string | undefined;
  let bestDistance = Infinity;

  for (const proj of projects) {
    const projLower = proj.toLowerCase();

    // Exact substring match
    if (projLower.includes(inputLower) || inputLower.includes(projLower)) {
      return proj;
    }

    // Levenshtein distance
    const distance = levenshteinDistance(inputLower, projLower);
    if (distance < bestDistance && distance <= 3) {
      bestDistance = distance;
      bestMatch = proj;
    }
  }

  return bestMatch;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

async function allocateRedisDb(ssh: any, projectName: string): Promise<number> {
  // Redis DB 번호 할당 (0-15, 0은 기본이므로 1부터 시작)
  const ssotPath = '/opt/codeb/registry/redis-db.json';
  let redisDb: any = { used: {}, nextDb: 1 };

  try {
    const content = await ssh.readFile(ssotPath);
    redisDb = JSON.parse(content);
  } catch {
    // 파일 없으면 새로 생성
  }

  // 이미 할당된 프로젝트면 기존 번호 반환
  if (redisDb.used[projectName]) {
    return redisDb.used[projectName];
  }

  // 새 DB 번호 할당
  const dbNum = redisDb.nextDb;
  if (dbNum > 15) {
    throw new Error('No available Redis DB numbers (max 15)');
  }

  redisDb.used[projectName] = dbNum;
  redisDb.nextDb = dbNum + 1;
  await ssh.writeFile(ssotPath, JSON.stringify(redisDb, null, 2));

  return dbNum;
}

function generateEnvWithCredentials(params: {
  projectName: string;
  database?: WorkflowInitResult['database'];
  redis?: WorkflowInitResult['redis'];
  domain: string;
}): string {
  const { projectName, database, redis, domain } = params;

  let content = `# CodeB v7.0.58 - Environment Variables
# Project: ${projectName}
# Domain: ${domain}
# Generated: ${new Date().toISOString()}

NODE_ENV=production
PORT=3000

`;

  if (database) {
    content += `# PostgreSQL (Storage Server: ${SERVERS.storage.domain})
DATABASE_URL=${database.url}

`;
  }

  if (redis) {
    content += `# Redis (Storage Server: ${SERVERS.storage.domain})
REDIS_URL=${redis.url}

`;
  }

  content += `# Centrifugo (WebSocket - Streaming Server: ${SERVERS.streaming.domain})
NEXT_PUBLIC_WS_URL=wss://${SERVERS.streaming.domain}/connection/websocket
`;

  return content;
}

function generateGitHubActionsWorkflow(params: {
  projectName: string;
  type: string;
  baseDomain?: string;
}): string {
  const { projectName, baseDomain = 'codeb.kr' } = params;

  // Private Registry + Blue-Green Deployment Workflow (v7.0.65)
  return `# CodeB CI/CD Pipeline - Private Docker Registry
# Generated by CodeB CLI v7.0.65
#
# 전략: Private Registry + Blue-Green Deployment
#
# 아키텍처:
# ┌─────────────────────────────────────────────────────────────────┐
# │  [GitHub Actions] → [Private Registry] → [App Server]          │
# │       │                  (Storage)           (Docker)           │
# │       │             64.176.226.119:5000    158.247.203.55       │
# │       ▼                     ▲                   │               │
# │  docker build & push ───────┘                   │               │
# │                     docker pull ◄───────────────┘               │
# └─────────────────────────────────────────────────────────────────┘
#
# 장점:
# - 내부 네트워크로 빠른 push/pull
# - GHCR 의존성 제거
# - GitHub 장애 시에도 배포 가능
# - 비용 절감 (GitHub Storage 미사용)

name: ${projectName} CI/CD

on:
  push:
    branches:
      - main
      - 'feature/**'
      - 'fix/**'
      - 'hotfix/**'
  pull_request:
    types: [opened, synchronize, reopened, closed]
  workflow_dispatch:
    inputs:
      force_build:
        description: 'Force rebuild (skip cache)'
        type: boolean
        default: false

env:
  # Private Registry (Storage Server)
  REGISTRY: 64.176.226.119:5000
  IMAGE_NAME: ${projectName}
  APP_NAME: ${projectName}
  NODE_VERSION: '20'

  # Server IPs (CodeB 4-Server Architecture)
  APP_SERVER: 158.247.203.55
  STORAGE_SERVER: 64.176.226.119
  PREVIEW_SERVER: 141.164.37.63

  BASE_DOMAIN: ${baseDomain}

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  # ============================================
  # Build & Push to Private Registry
  # ============================================
  build:
    name: Build & Push
    runs-on: self-hosted
    if: |
      github.event_name == 'push' ||
      (github.event_name == 'pull_request' && github.event.action != 'closed') ||
      github.event_name == 'workflow_dispatch'

    outputs:
      image_tag: \${{ steps.vars.outputs.image_tag }}
      image_sha: \${{ steps.vars.outputs.image_sha }}
      branch_slug: \${{ steps.vars.outputs.branch_slug }}
      is_main: \${{ steps.vars.outputs.is_main }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Generate variables
        id: vars
        run: |
          # SHA 기반 이미지 태그
          SHA_SHORT=\$(echo "\${{ github.sha }}" | cut -c1-7)
          echo "image_sha=sha-\${SHA_SHORT}" >> \$GITHUB_OUTPUT

          # 브랜치 slug 생성
          if [ "\${{ github.event_name }}" = "pull_request" ]; then
            BRANCH="\${{ github.head_ref }}"
          else
            BRANCH="\${{ github.ref_name }}"
          fi
          SLUG=\$(echo "\$BRANCH" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-\$//' | cut -c1-20)
          echo "branch_slug=\$SLUG" >> \$GITHUB_OUTPUT

          # main 브랜치 여부
          if [ "\${{ github.ref }}" = "refs/heads/main" ]; then
            echo "is_main=true" >> \$GITHUB_OUTPUT
            echo "image_tag=latest" >> \$GITHUB_OUTPUT
          else
            echo "is_main=false" >> \$GITHUB_OUTPUT
            echo "image_tag=sha-\${SHA_SHORT}" >> \$GITHUB_OUTPUT
          fi

      - name: Check cache (Incremental Build)
        id: cache
        if: github.event.inputs.force_build != 'true'
        run: |
          # NPM 해시 (package-lock.json)
          NPM_HASH=\$(sha256sum package-lock.json 2>/dev/null | head -c 16 || echo "no-lock")

          # SRC 해시 (src/**/*.ts, src/**/*.tsx)
          SRC_HASH=\$(find src -type f \\( -name "*.ts" -o -name "*.tsx" \\) 2>/dev/null | sort | xargs cat 2>/dev/null | sha256sum | head -c 16 || echo "no-src")

          CACHE_KEY="\${NPM_HASH}-\${SRC_HASH}"
          echo "cache_key=\$CACHE_KEY" >> \$GITHUB_OUTPUT

          # Private Registry에서 캐시 확인
          CACHED_IMAGE="\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:cache-\${CACHE_KEY}"
          if docker manifest inspect "\$CACHED_IMAGE" > /dev/null 2>&1; then
            echo "cache_hit=true" >> \$GITHUB_OUTPUT
            echo "cached_image=\$CACHED_IMAGE" >> \$GITHUB_OUTPUT
            echo "✅ Cache hit: \$CACHED_IMAGE"
          else
            echo "cache_hit=false" >> \$GITHUB_OUTPUT
            echo "📦 Cache miss, will build"
          fi

      - name: Use cached image (skip build)
        if: steps.cache.outputs.cache_hit == 'true'
        run: |
          CACHED="\${{ steps.cache.outputs.cached_image }}"
          TARGET="\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ steps.vars.outputs.image_tag }}"

          docker pull "\$CACHED"
          docker tag "\$CACHED" "\$TARGET"
          docker push "\$TARGET"

          echo "✅ Reused cached image: \$TARGET"

      - name: Build Docker image
        if: steps.cache.outputs.cache_hit != 'true'
        run: |
          IMAGE="\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ steps.vars.outputs.image_tag }}"

          docker build \\
            --build-arg NODE_ENV=production \\
            --cache-from "\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:latest" \\
            -t "\$IMAGE" \\
            .

          echo "✅ Built: \$IMAGE"

      - name: Push to Private Registry
        if: steps.cache.outputs.cache_hit != 'true'
        run: |
          IMAGE="\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ steps.vars.outputs.image_tag }}"
          CACHE_IMAGE="\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:cache-\${{ steps.cache.outputs.cache_key }}"

          # Push main image
          docker push "\$IMAGE"

          # Push cache image (for incremental build)
          docker tag "\$IMAGE" "\$CACHE_IMAGE"
          docker push "\$CACHE_IMAGE"

          echo "✅ Pushed: \$IMAGE"
          echo "✅ Cached: \$CACHE_IMAGE"

      - name: Summary
        run: |
          echo "### 📦 Image Built" >> \$GITHUB_STEP_SUMMARY
          echo "" >> \$GITHUB_STEP_SUMMARY
          echo "| Key | Value |" >> \$GITHUB_STEP_SUMMARY
          echo "|-----|-------|" >> \$GITHUB_STEP_SUMMARY
          echo "| **Registry** | Private (\\\`\${{ env.REGISTRY }}\\\`) |" >> \$GITHUB_STEP_SUMMARY
          echo "| **Image** | \\\`\${{ env.IMAGE_NAME }}:\${{ steps.vars.outputs.image_tag }}\\\` |" >> \$GITHUB_STEP_SUMMARY
          echo "| **Cache** | \${{ steps.cache.outputs.cache_hit == 'true' && '✅ Hit' || '📦 Miss' }} |" >> \$GITHUB_STEP_SUMMARY

  # ============================================
  # Deploy to Production (main branch)
  # ============================================
  deploy-production:
    name: Deploy Production
    runs-on: self-hosted
    needs: build
    if: needs.build.outputs.is_main == 'true'
    environment:
      name: production
      url: https://\${{ env.APP_NAME }}.\${{ env.BASE_DOMAIN }}

    steps:
      - name: Deploy via MCP API
        run: |
          # MCP API를 통한 Blue-Green 배포
          IMAGE="\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ needs.build.outputs.image_tag }}"

          RESPONSE=\$(curl -sf -X POST "https://api.codeb.kr/api/deploy" \\
            -H "Content-Type: application/json" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -d '{
              "projectName": "\${{ env.APP_NAME }}",
              "environment": "production",
              "image": "'"\$IMAGE"'",
              "version": "\${{ needs.build.outputs.image_sha }}"
            }')

          echo "\$RESPONSE" | jq .

          SUCCESS=\$(echo "\$RESPONSE" | jq -r '.success')
          if [ "\$SUCCESS" != "true" ]; then
            echo "❌ Deploy failed"
            exit 1
          fi

          PREVIEW_URL=\$(echo "\$RESPONSE" | jq -r '.previewUrl')
          SLOT=\$(echo "\$RESPONSE" | jq -r '.slot')

          echo "✅ Deployed to \$SLOT slot"
          echo "🔗 Preview: \$PREVIEW_URL"

          # GitHub Summary
          echo "### 🚀 Production Deployed" >> \$GITHUB_STEP_SUMMARY
          echo "" >> \$GITHUB_STEP_SUMMARY
          echo "| Key | Value |" >> \$GITHUB_STEP_SUMMARY
          echo "|-----|-------|" >> \$GITHUB_STEP_SUMMARY
          echo "| **Slot** | \\\`\$SLOT\\\` |" >> \$GITHUB_STEP_SUMMARY
          echo "| **Preview** | \$PREVIEW_URL |" >> \$GITHUB_STEP_SUMMARY
          echo "| **Image** | \\\`\$IMAGE\\\` |" >> \$GITHUB_STEP_SUMMARY
          echo "" >> \$GITHUB_STEP_SUMMARY
          echo "> Run \\\`/we:promote \${{ env.APP_NAME }}\\\` to switch traffic" >> \$GITHUB_STEP_SUMMARY

  # ============================================
  # Deploy Preview (feature branches)
  # ============================================
  deploy-preview:
    name: Deploy Preview
    runs-on: self-hosted
    needs: build
    if: |
      needs.build.outputs.is_main == 'false' &&
      github.event.action != 'closed'
    environment:
      name: preview
      url: https://\${{ needs.build.outputs.branch_slug }}.preview.\${{ env.BASE_DOMAIN }}

    steps:
      - name: Deploy Preview via SSH
        uses: appleboy/ssh-action@v1.0.3
        env:
          IMAGE: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ needs.build.outputs.image_tag }}
          CONTAINER: \${{ env.APP_NAME }}-preview-\${{ needs.build.outputs.branch_slug }}
          BRANCH_SLUG: \${{ needs.build.outputs.branch_slug }}
        with:
          host: \${{ env.PREVIEW_SERVER }}
          username: root
          key: \${{ secrets.SSH_PRIVATE_KEY }}
          envs: IMAGE,CONTAINER,BRANCH_SLUG,APP_NAME,REGISTRY
          script: |
            set -e
            echo "🚀 Deploying Preview: \$CONTAINER"

            # Pull from Private Registry
            docker pull \$IMAGE

            # Stop existing
            docker stop \$CONTAINER 2>/dev/null || true
            docker rm \$CONTAINER 2>/dev/null || true

            # Calculate port (5000-5999)
            HASH=\$(echo -n "\$BRANCH_SLUG" | md5sum | cut -c1-4)
            PORT=\$((16#\$HASH % 1000 + 5000))

            # Run preview container
            docker run -d \\
              --name \$CONTAINER \\
              -p \$PORT:3000 \\
              --env-file /opt/codeb/env-backup/\${APP_NAME}/preview.env \\
              -e PREVIEW_BRANCH=\$BRANCH_SLUG \\
              --restart unless-stopped \\
              \$IMAGE

            echo "✅ Preview deployed on port \$PORT"

      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const body = \`## 🚀 Preview Deployed

            | Key | Value |
            |-----|-------|
            | **URL** | https://\${{ needs.build.outputs.branch_slug }}.preview.\${{ env.BASE_DOMAIN }} |
            | **Image** | \\\`\${{ needs.build.outputs.image_tag }}\\\` |
            | **Registry** | Private (\\\`\${{ env.REGISTRY }}\\\`) |

            > PR 머지 시 같은 이미지가 Production에 배포됩니다.\`;

            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number
            });

            const existing = comments.find(c => c.body.includes('Preview Deployed'));
            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existing.id,
                body
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body
              });
            }

  # ============================================
  # Cleanup Preview (PR closed/merged)
  # ============================================
  cleanup-preview:
    name: Cleanup Preview
    runs-on: self-hosted
    if: github.event_name == 'pull_request' && github.event.action == 'closed'

    steps:
      - name: Generate branch slug
        id: vars
        run: |
          BRANCH="\${{ github.head_ref }}"
          SLUG=\$(echo "\$BRANCH" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-\$//' | cut -c1-20)
          echo "branch_slug=\$SLUG" >> \$GITHUB_OUTPUT
          echo "container=\${{ env.APP_NAME }}-preview-\${SLUG}" >> \$GITHUB_OUTPUT

      - name: Cleanup Preview Server
        uses: appleboy/ssh-action@v1.0.3
        env:
          CONTAINER: \${{ steps.vars.outputs.container }}
        with:
          host: \${{ env.PREVIEW_SERVER }}
          username: root
          key: \${{ secrets.SSH_PRIVATE_KEY }}
          envs: CONTAINER
          script: |
            echo "🧹 Cleaning: \$CONTAINER"
            docker stop \$CONTAINER 2>/dev/null || true
            docker rm \$CONTAINER 2>/dev/null || true
            docker image prune -f
            echo "✅ Cleanup complete"

      - name: Comment on PR
        uses: actions/github-script@v7
        with:
          script: |
            const merged = '\${{ github.event.pull_request.merged }}' === 'true';
            const body = merged
              ? \`## 🎉 Merged & Deployed\\n\\nPreview 환경이 삭제되었고, 같은 이미지가 Production에 배포되었습니다.\`
              : \`## 🧹 Preview Cleaned\\n\\nPR이 닫혀서 Preview 환경이 삭제되었습니다.\`;

            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body
            });
`;
}

function generateDockerfile(type: string): string {
  const templates: Record<string, string> = {
    nextjs: `# CodeB v7.0.58 - Next.js Dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
`,
    remix: `# CodeB v7.0.58 - Remix Dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public
COPY package*.json ./

EXPOSE 3000
CMD ["npm", "start"]
`,
    nodejs: `# CodeB v7.0.58 - Node.js Dockerfile
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
`,
    python: `# CodeB v7.0.58 - Python Dockerfile
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=3000

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 3000
CMD ["python", "app.py"]
`,
    go: `# CodeB v7.0.58 - Go Dockerfile
FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o app .

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/app .

ENV PORT=3000
EXPOSE 3000
CMD ["./app"]
`,
  };

  return templates[type] || templates.nodejs;
}

// ============================================================================
// Export Tools
// ============================================================================

export const projectInitTool = {
  name: 'workflow_init',
  description: 'Initialize project with Registry, Docker, ENV templates (DB-based)',

  async execute(
    params: z.infer<typeof projectInitInputSchema>,
    auth: AuthContext
  ): Promise<WorkflowInitResult> {
    const validated = projectInitInputSchema.parse(params);
    return executeWorkflowInit(validated, auth);
  },
};

export const projectScanTool = {
  name: 'workflow_scan',
  description: 'Scan project for workflow configuration status (DB-based)',

  async execute(
    params: z.infer<typeof projectScanInputSchema>,
    auth: AuthContext
  ): Promise<WorkflowScanResult> {
    const validated = projectScanInputSchema.parse(params);
    return executeWorkflowScan(validated, auth);
  },
};

// ============================================================================
// Workflow Generate Tool (기존 프로젝트용 워크플로우 생성)
// ============================================================================

export const workflowGenerateInputSchema = z.object({
  projectName: z.string().min(1).max(50),
  baseDomain: z.string().optional().default('codeb.kr'),
  type: z.enum(['nextjs', 'remix', 'nodejs', 'python', 'go']).default('nextjs'),
});

interface WorkflowGenerateResult {
  success: boolean;
  projectName: string;
  workflow: string;
  dockerfile: string;
  instructions: string[];
  error?: string;
}

export const workflowGenerateTool = {
  name: 'workflow_generate',
  description: 'Generate GitHub Actions workflow for existing project (Private Registry)',

  async execute(
    params: z.infer<typeof workflowGenerateInputSchema>,
    auth: AuthContext
  ): Promise<WorkflowGenerateResult> {
    const { projectName, baseDomain, type } = workflowGenerateInputSchema.parse(params);

    try {
      // DB에서 프로젝트 존재 확인
      const project = await ProjectRepo.findByName(projectName);
      if (!project) {
        return {
          success: false,
          projectName,
          workflow: '',
          dockerfile: '',
          instructions: [],
          error: `Project ${projectName} not found. Run /we:quick first.`,
        };
      }

      const workflow = generateGitHubActionsWorkflow({
        projectName,
        type,
        baseDomain,
      });

      const dockerfile = generateDockerfile(type);

      const instructions = [
        `✅ 워크플로우 생성 완료!`,
        ``,
        `📁 로컬에 생성할 파일:`,
        `   1. .github/workflows/deploy.yml`,
        `   2. Dockerfile (없으면)`,
        ``,
        `🔑 GitHub Secrets 설정:`,
        `   - CODEB_API_KEY: CodeB API 키`,
        `   - SSH_PRIVATE_KEY: 서버 접근용 SSH 키 (Preview 배포 시 필요)`,
        ``,
        `📋 기존 GHCR 워크플로우가 있다면 삭제하세요.`,
        ``,
        `🚀 배포:`,
        `   git push origin main  # → Private Registry로 빌드 & 배포`,
      ];

      logger.info('Workflow generated', { projectName, type, baseDomain });

      return {
        success: true,
        projectName,
        workflow,
        dockerfile,
        instructions,
      };
    } catch (error) {
      logger.error('Workflow generate failed', {
        projectName,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        projectName,
        workflow: '',
        dockerfile: '',
        instructions: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
