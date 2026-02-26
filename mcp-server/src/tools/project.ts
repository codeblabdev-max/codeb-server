/**
 * CodeB v9.0 - Project Init/Scan Tool (DB-Primary)
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
import { withLocal, execStorageSQLBatch, httpsHeaderCheck } from '../lib/local-exec.js';
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
    // Storage 서버 PostgreSQL/Redis — SSH 대신 TCP 직접 연결
    const dbPassword = generatePassword();
    const dbName = `${projectName}_db`;
    const dbUser = `${projectName}_user`;

    if (needsDatabase) {
      await execStorageSQLBatch([
        `CREATE DATABASE ${dbName};`,
        `CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}';`,
        `GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser};`,
        `ALTER DATABASE ${dbName} OWNER TO ${dbUser};`,
      ]);

      dbInfo = {
        name: dbName,
        user: dbUser,
        password: dbPassword,
        host: SERVERS.storage.domain,
        port: SERVERS.storage.ports.postgresql,
        url: `postgresql://${dbUser}:${dbPassword}@${SERVERS.storage.domain}:${SERVERS.storage.ports.postgresql}/${dbName}?schema=public`,
      };
    }

    if (needsRedis) {
      const redisDb = await allocateRedisDb(projectName);
      redisInfo = {
        db: redisDb,
        host: SERVERS.storage.domain,
        port: SERVERS.storage.ports.redis,
        url: `redis://${SERVERS.storage.domain}:${SERVERS.storage.ports.redis}/${redisDb}`,
      };
    }

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
    await withLocal(async (local) => {
      // 프로젝트 디렉토리 생성
      await local.mkdir(`/opt/codeb/projects/${projectName}`);
      await local.mkdir(`/opt/codeb/env/${projectName}`);
      await local.mkdir(`/opt/codeb/env-backup/${projectName}`);
      await local.mkdir(`/opt/codeb/registry/slots`);

      // ENV 파일 생성
      const envContent = generateEnvWithCredentials({
        projectName,
        database: dbInfo,
        redis: redisInfo,
        domain,
      });

      const envPath = `/opt/codeb/env/${projectName}/.env`;
      await local.writeFile(envPath, envContent);
      files.push(envPath);

      // ENV 백업
      const backupPath = `/opt/codeb/env-backup/${projectName}/.env.${Date.now()}`;
      await local.exec(`cp ${envPath} ${backupPath}`);

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
      await local.mkdir('/etc/caddy/sites');
      await local.writeFile(caddyPath, caddySnippet);
      await local.exec('systemctl reload caddy || true');
      files.push(caddyPath);

      // Cloudflare DNS A 레코드 추가 (서브도메인인 경우)
      const supportedDomains = ['codeb.kr', 'workb.net', 'wdot.kr', 'w-w-w.kr', 'vsvs.kr', 'workb.xyz'];
      const matchedBase = supportedDomains.find(d => domain.endsWith(`.${d}`));
      if (matchedBase) {
        const subdomain = domain.replace(`.${matchedBase}`, '');
        try {
          const { addDNSRecord: addCfRecord } = await import('./domain.js');
          await addCfRecord(matchedBase, 'A', subdomain, SERVERS.app.ip, true);
          logger.info('Cloudflare DNS record added', { domain, subdomain, base: matchedBase });
        } catch (dnsError) {
          logger.warn('Failed to add Cloudflare DNS record (non-blocking)', { domain, error: String(dnsError) });
        }
      }

      // SSL 인증서 발급 대기 (최대 30초, Node.js native HTTPS — curl 의존성 제거)
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const certResult = await httpsHeaderCheck(domain, 5000);
        if (certResult.includes('HTTP/') || certResult.includes('200')) {
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
      `   1. .github/workflows/deploy.yml (worktree + task 지원)`,
      `   2. Dockerfile (없으면)`,
      ``,
      `🔑 GitHub Secrets 설정:`,
      `   - CODEB_API_KEY: CodeB API 키`,
      `   - MINIO_ACCESS_KEY: Minio S3 캐시 키`,
      `   - MINIO_SECRET_KEY: Minio S3 시크릿 키`,
      ``,
      `🚀 팀 작업 플로우:`,
      `   1. we task create "작업 제목" --files src/... → 파일 잠금`,
      `   2. claude --worktree task-<ID>  → 격리 작업 시작`,
      `   3. git push → 자동 빌드/배포 (worktree-* 브랜치)`,
      `   4. 배포 성공 → task_complete → 파일 잠금 해제`,
      `   5. worktree 브랜치 → main 자동 병합`,
      `   6. we promote ${projectName}  → 트래픽 전환`,
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
    const serverStatus = await withLocal(async (local) => {
      const projectDir = `/opt/codeb/projects/${projectName}`;

      // Dockerfile 확인
      let hasDockerfile = false;
      try {
        hasDockerfile = await local.fileExists(`${projectDir}/Dockerfile`);
      } catch {
        // no dockerfile
      }

      // Docker 컨테이너 확인
      let hasDockerContainer = false;
      try {
        const result = await local.exec(`docker ps -a --format '{{.Names}}' | grep -c "^${projectName}-" || echo "0"`);
        hasDockerContainer = parseInt(result.stdout.trim()) > 0;
      } catch {
        // no docker containers
      }

      // ENV 확인
      let hasEnv = false;
      try {
        hasEnv = await local.fileExists(`/opt/codeb/env/${projectName}/.env`);
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

async function allocateRedisDb(projectName: string): Promise<number> {
  // Redis DB 번호 할당 (0-15, 0은 기본이므로 1부터 시작)
  const ssotPath = '/opt/codeb/registry/redis-db.json';
  let redisDb: any = { used: {}, nextDb: 1 };

  const local = (await import('../lib/local-exec.js')).getLocalExec();

  try {
    const content = await local.readFile(ssotPath);
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
  await local.writeFile(ssotPath, JSON.stringify(redisDb, null, 2));

  return dbNum;
}

function generateEnvWithCredentials(params: {
  projectName: string;
  database?: WorkflowInitResult['database'];
  redis?: WorkflowInitResult['redis'];
  domain: string;
}): string {
  const { projectName, database, redis, domain } = params;

  let content = `# CodeB v9.0 - Environment Variables
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

  // MCP API Blue-Green Deployment Workflow (v8.0 + Worktree + Task)
  return `# ${projectName} CI/CD Pipeline (Minio S3 Cache + Blue-Green + Worktree)
# Generated by CodeB v9.0
# Updated: ${new Date().toISOString().split('T')[0]}
#
# Architecture:
#   GitHub Actions (self-hosted) -> Docker Buildx + Minio S3 Cache
#   -> Private Registry (64.176.226.119:5000) -> MCP API Blue-Green Deploy
#   -> Task Complete (파일 잠금 해제) -> Auto Merge (worktree → main)
#
# Required Secrets: CODEB_API_KEY, MINIO_ACCESS_KEY, MINIO_SECRET_KEY

name: ${projectName} CI/CD

on:
  push:
    branches: [main, 'worktree-*']
  workflow_dispatch:
    inputs:
      action:
        description: 'Action'
        required: true
        default: 'deploy'
        type: choice
        options:
          - deploy
          - promote
          - rollback
      no_cache:
        description: 'Force rebuild without cache'
        required: false
        default: false
        type: boolean

env:
  REGISTRY: 64.176.226.119:5000
  IMAGE_NAME: ${projectName}
  MINIO_ENDPOINT: http://64.176.226.119:9000
  MINIO_BUCKET: docker-cache

concurrency:
  group: ${projectName}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  # ============================================
  # Build & Deploy (push or dispatch deploy)
  # ============================================
  build-and-deploy:
    name: Build & Deploy
    runs-on: [self-hosted, codeb]
    if: github.event_name == 'push' || github.event.inputs.action == 'deploy'

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: "Phase 1: MCP API Health Check"
        id: mcp_health
        timeout-minutes: 1
        run: |
          echo "=== Phase 1: MCP API 생존 확인 ==="

          HEALTH=\$(curl -sf --max-time 10 "https://api.codeb.kr/health") || true

          if [ -z "\$HEALTH" ]; then
            echo "CRITICAL: MCP API (api.codeb.kr) is DOWN"
            echo "Check: systemctl status codeb-mcp-api on 158.247.203.55"
            exit 1
          fi

          API_STATUS=\$(echo "\$HEALTH" | jq -r '.status // "unknown"')
          API_VERSION=\$(echo "\$HEALTH" | jq -r '.version // "unknown"')

          if [ "\$API_STATUS" != "healthy" ]; then
            echo "CRITICAL: MCP API status = \$API_STATUS (expected: healthy)"
            exit 1
          fi

          echo "MCP API: \$API_STATUS (v\$API_VERSION)"

      - name: "Phase 2: Infrastructure Check (SSOT + Slot + Domain)"
        id: infra_check
        timeout-minutes: 2
        run: |
          echo "=== Phase 2: 프로젝트 인프라 확인 ==="

          # 2-1. SSOT 프로젝트 등록 확인
          SCAN=\$(curl -sf --max-time 30 -X POST "https://api.codeb.kr/api/tool" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{"tool": "scan", "params": {"projectName": "${projectName}"}}') || true

          if [ -z "\$SCAN" ] || [ "\$(echo "\$SCAN" | jq -r '.success // false')" != "true" ]; then
            echo "FAILED: Project '${projectName}' not registered in SSOT"
            echo "Fix: /we:init ${projectName}"
            exit 1
          fi

          REGISTERED=\$(echo "\$SCAN" | jq -r '.registered // false')
          if [ "\$REGISTERED" != "true" ]; then
            echo "FAILED: Project not registered."
            echo "Fix: /we:init ${projectName}"
            exit 1
          fi
          echo "SSOT: registered"

          # 2-2. Slot 레지스트리 상태 캡처 (배포 후 비교용)
          SLOT_BEFORE=\$(curl -sf --max-time 30 -X POST "https://api.codeb.kr/api/tool" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{"tool": "slot_status", "params": {"projectName": "${projectName}"}}') || true

          if [ -n "\$SLOT_BEFORE" ] && [ "\$(echo "\$SLOT_BEFORE" | jq -r '.success // false')" = "true" ]; then
            ACTIVE=\$(echo "\$SLOT_BEFORE" | jq -r '.data.activeSlot // "unknown"')
            BLUE_STATE=\$(echo "\$SLOT_BEFORE" | jq -r '.data.blue.state // "unknown"')
            GREEN_STATE=\$(echo "\$SLOT_BEFORE" | jq -r '.data.green.state // "unknown"')
            echo "Slots: active=\$ACTIVE | blue=\$BLUE_STATE | green=\$GREEN_STATE"
            echo "\$SLOT_BEFORE" > /tmp/slot-before.json
          fi

          echo "=== Phase 2 passed ==="

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
        with:
          config-inline: |
            [registry."64.176.226.119:5000"]
              http = true
              insecure = true

      - name: Build and Push (Minio S3 Cache)
        run: |
          IMAGE_TAG="\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ github.sha }}"

          echo "Building: \$IMAGE_TAG"

          if [ "\${{ github.event.inputs.no_cache }}" = "true" ]; then
            docker buildx build \\
              --no-cache \\
              -t "\$IMAGE_TAG" \\
              -t "\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:latest" \\
              --push \\
              .
          else
            docker buildx build \\
              --cache-from "type=s3,region=us-east-1,bucket=\${{ env.MINIO_BUCKET }},name=${projectName},endpoint_url=\${{ env.MINIO_ENDPOINT }},access_key_id=\${{ secrets.MINIO_ACCESS_KEY }},secret_access_key=\${{ secrets.MINIO_SECRET_KEY }}" \\
              --cache-to "type=s3,region=us-east-1,bucket=\${{ env.MINIO_BUCKET }},name=${projectName},mode=max,endpoint_url=\${{ env.MINIO_ENDPOINT }},access_key_id=\${{ secrets.MINIO_ACCESS_KEY }},secret_access_key=\${{ secrets.MINIO_SECRET_KEY }}" \\
              -t "\$IMAGE_TAG" \\
              -t "\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:latest" \\
              --push \\
              .
          fi

          echo "Built and pushed: \$IMAGE_TAG"

      - name: Deploy to inactive slot (Blue-Green via MCP API)
        id: deploy
        timeout-minutes: 8
        run: |
          RESPONSE=\$(curl -sf --max-time 300 -X POST "https://api.codeb.kr/api/tool" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "tool": "deploy",
              "params": {
                "projectName": "${projectName}",
                "environment": "production",
                "image": "'\${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}:\${{ github.sha }}'"
              }
            }')

          echo "Response: \$RESPONSE"
          SUCCESS=\$(echo "\$RESPONSE" | jq -r '.success // false')
          if [ "\$SUCCESS" = "true" ]; then
            PREVIEW=\$(echo "\$RESPONSE" | jq -r '.previewUrl // "N/A"')
            SLOT=\$(echo "\$RESPONSE" | jq -r '.slot // "unknown"')
            PORT=\$(echo "\$RESPONSE" | jq -r '.port // 0')
            echo "Deployed to \$SLOT slot (port \$PORT)"
            echo "Preview: \$PREVIEW"
            echo "\$RESPONSE" > /tmp/deploy-result.json
          else
            ERROR=\$(echo "\$RESPONSE" | jq -r '.error // "Unknown"')
            echo "Deploy failed: \$ERROR"
            exit 1
          fi

      - name: "Phase 3: Post-deploy Verification"
        timeout-minutes: 3
        run: |
          echo "=== Phase 3: 배포 후 검증 ==="

          DEPLOY_RESULT=\$(cat /tmp/deploy-result.json 2>/dev/null)
          DEPLOYED_SLOT=\$(echo "\$DEPLOY_RESULT" | jq -r '.slot // "unknown"')
          PREVIEW_URL=\$(echo "\$DEPLOY_RESULT" | jq -r '.previewUrl // ""')

          # Slot 상태 비교
          SLOT_AFTER=\$(curl -sf --max-time 30 -X POST "https://api.codeb.kr/api/tool" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{"tool": "slot_status", "params": {"projectName": "${projectName}"}}') || true

          if [ -n "\$SLOT_AFTER" ]; then
            AFTER_BLUE=\$(echo "\$SLOT_AFTER" | jq -r '.data.blue.state // "unknown"')
            AFTER_GREEN=\$(echo "\$SLOT_AFTER" | jq -r '.data.green.state // "unknown"')
            echo "Slots after deploy: blue=\$AFTER_BLUE green=\$AFTER_GREEN"
          fi

          # Preview URL 헬스체크
          if [ -n "\$PREVIEW_URL" ] && [ "\$PREVIEW_URL" != "N/A" ]; then
            for i in \$(seq 1 6); do
              HTTP_CODE=\$(curl -sf -o /dev/null -w '%{http_code}' --max-time 10 "\$PREVIEW_URL" 2>/dev/null) || HTTP_CODE="000"
              if echo "\$HTTP_CODE" | grep -q "^[23]"; then
                echo "Preview healthy: HTTP \$HTTP_CODE"
                break
              fi
              [ \$i -lt 6 ] && sleep 10
            done
          fi

          # GitHub Summary
          echo "### Deployed" >> \$GITHUB_STEP_SUMMARY
          echo "| Key | Value |" >> \$GITHUB_STEP_SUMMARY
          echo "|-----|-------|" >> \$GITHUB_STEP_SUMMARY
          echo "| **Slot** | \\\`\$DEPLOYED_SLOT\\\` |" >> \$GITHUB_STEP_SUMMARY
          echo "| **Preview** | \$PREVIEW_URL |" >> \$GITHUB_STEP_SUMMARY
          echo "" >> \$GITHUB_STEP_SUMMARY
          echo "> Run \\\`/we:promote ${projectName}\\\` or dispatch promote to switch traffic" >> \$GITHUB_STEP_SUMMARY

      - name: Complete Work Tasks
        if: success()
        env:
          CODEB_API_KEY: \${{ secrets.CODEB_API_KEY }}
        run: |
          COMMIT_MSG=\$(git log -1 --pretty=%s)
          TASK_IDS=\$(echo "\$COMMIT_MSG" | grep -oP '#\\K[0-9]+' || true)

          if [ -z "\$TASK_IDS" ]; then
            echo "No task IDs found in commit message"
            exit 0
          fi

          for TASK_ID in \$TASK_IDS; do
            echo "Completing task #\$TASK_ID..."
            RESULT=\$(curl -sf --max-time 30 -X POST "https://api.codeb.kr/api/tool" \\
              -H "X-API-Key: \${CODEB_API_KEY}" \\
              -H "Content-Type: application/json" \\
              -d "{\\"tool\\":\\"task_complete\\",\\"params\\":{\\"taskId\\":\${TASK_ID},\\"deployId\\":\\"deploy-\${GITHUB_SHA:0:7}\\"}}" || true)
            echo "Task #\$TASK_ID: \$RESULT"
          done

      - name: Auto Merge Worktree Branch
        if: success() && startsWith(github.ref_name, 'worktree-')
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          BRANCH="\${{ github.ref_name }}"
          echo "Worktree auto merge: \$BRANCH -> main"

          git fetch origin main
          git checkout main
          git pull origin main

          if git merge --squash "origin/\$BRANCH"; then
            COMMIT_MSG=\$(git log "origin/\$BRANCH" -1 --pretty=%s)
            git commit -m "auto-merge: \$BRANCH - \$COMMIT_MSG
          Deployed via GitHub Actions (\${GITHUB_SHA:0:7})
          Co-Authored-By: CodeB CI <ci@codeb.kr>"
            git push origin main
            git push origin --delete "\$BRANCH" 2>/dev/null || true
            echo "Merged \$BRANCH -> main"
          else
            echo "Merge conflict! Manual resolution needed."
            git merge --abort
            exit 1
          fi

      - name: Cleanup
        if: always()
        run: |
          docker image prune -f 2>/dev/null || true
          rm -f /tmp/slot-before.json /tmp/deploy-result.json 2>/dev/null || true

  # ============================================
  # Promote (switch traffic via MCP API)
  # ============================================
  promote:
    name: Promote (Switch Traffic)
    runs-on: [self-hosted, codeb]
    if: github.event.inputs.action == 'promote'

    steps:
      - name: Promote via MCP API
        timeout-minutes: 2
        run: |
          RESPONSE=\$(curl -sf --max-time 60 -X POST "https://api.codeb.kr/api/tool" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "tool": "slot_promote",
              "params": {
                "projectName": "${projectName}",
                "environment": "production"
              }
            }')

          echo "Response: \$RESPONSE"
          SUCCESS=\$(echo "\$RESPONSE" | jq -r '.success // false')
          if [ "\$SUCCESS" = "true" ]; then
            echo "Traffic switched!"
            echo "### Promoted" >> \$GITHUB_STEP_SUMMARY
            echo "Production URL: https://${projectName}.${baseDomain}" >> \$GITHUB_STEP_SUMMARY
          else
            echo "Promote failed"
            exit 1
          fi

  # ============================================
  # Rollback (instant via MCP API)
  # ============================================
  rollback:
    name: Rollback
    runs-on: [self-hosted, codeb]
    if: github.event.inputs.action == 'rollback'

    steps:
      - name: Rollback via MCP API
        timeout-minutes: 2
        run: |
          RESPONSE=\$(curl -sf --max-time 60 -X POST "https://api.codeb.kr/api/tool" \\
            -H "X-API-Key: \${{ secrets.CODEB_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{
              "tool": "rollback",
              "params": {
                "projectName": "${projectName}",
                "environment": "production"
              }
            }')

          echo "Response: \$RESPONSE"
          SUCCESS=\$(echo "\$RESPONSE" | jq -r '.success // false')
          if [ "\$SUCCESS" = "true" ]; then
            echo "Rolled back!"
            echo "### Rolled Back" >> \$GITHUB_STEP_SUMMARY
            echo "Production URL: https://${projectName}.${baseDomain}" >> \$GITHUB_STEP_SUMMARY
          else
            echo "Rollback failed"
            exit 1
          fi
`;
}

function generateDockerfile(type: string): string {
  const templates: Record<string, string> = {
    nextjs: `# CodeB v9.0 - Next.js Dockerfile
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
    remix: `# CodeB v9.0 - Remix Dockerfile
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
    nodejs: `# CodeB v9.0 - Node.js Dockerfile
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
    python: `# CodeB v9.0 - Python Dockerfile
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
    go: `# CodeB v9.0 - Go Dockerfile
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
        `✅ 워크플로우 생성 완료! (worktree + task 지원)`,
        ``,
        `📁 로컬에 생성할 파일:`,
        `   1. .github/workflows/deploy.yml`,
        `   2. Dockerfile (없으면)`,
        ``,
        `🔑 GitHub Secrets 설정:`,
        `   - CODEB_API_KEY: CodeB API 키`,
        `   - MINIO_ACCESS_KEY: Minio S3 캐시 키`,
        `   - MINIO_SECRET_KEY: Minio S3 시크릿 키`,
        ``,
        `📋 기존 GHCR 워크플로우가 있다면 삭제하세요.`,
        ``,
        `🚀 배포:`,
        `   git push origin main  # → Private Registry로 빌드 & 배포`,
        `   worktree-* 브랜치도 자동 트리거 (팀 작업 시)`,
        `   배포 성공 → task_complete → auto merge → main`,
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
