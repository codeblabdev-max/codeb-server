/**
 * CodeB v6.0 - Workflow Init Tool
 *
 * 프로젝트 초기화:
 * 1. 서버 Registry(SSOT)에 프로젝트 등록
 * 2. 포트 할당
 * 3. Quadlet 템플릿 생성
 * 4. GitHub Actions workflow 생성
 * 5. Dockerfile 생성 (없으면)
 * 6. ENV 템플릿 생성
 */

import { z } from 'zod';
import type { AuthContext } from '../lib/types.js';
import { withSSH } from '../lib/ssh.js';
import { SERVERS, getSlotPorts } from '../lib/servers.js';

// ============================================================================
// Input Schema
// ============================================================================

export const workflowInitInputSchema = z.object({
  projectName: z.string().min(1).max(50),
  type: z.enum(['nextjs', 'remix', 'nodejs', 'python', 'go']).default('nextjs'),
  database: z.boolean().default(true),
  redis: z.boolean().default(true),
  environment: z.enum(['staging', 'production', 'both']).default('both'),
});

export const workflowScanInputSchema = z.object({
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
    staging?: { blue: number; green: number };
    production?: { blue: number; green: number };
  };
  registryPath: string;
  error?: string;
}

interface WorkflowScanResult {
  success: boolean;
  projectName: string;
  registered: boolean;
  hasDockerfile: boolean;
  hasQuadlet: boolean;
  hasGitHubActions: boolean;
  hasEnv: boolean;
  ports: {
    staging?: { blue: number; green: number };
    production?: { blue: number; green: number };
  };
  issues: string[];
}

// ============================================================================
// Workflow Init
// ============================================================================

async function executeWorkflowInit(
  input: z.infer<typeof workflowInitInputSchema>,
  auth: AuthContext
): Promise<WorkflowInitResult> {
  const { projectName, type, database, redis, environment } = input;

  return withSSH(SERVERS.app.ip, async (ssh) => {
    const files: string[] = [];
    const ports: WorkflowInitResult['ports'] = {};

    try {
      // 1. 프로젝트 디렉토리 생성
      const projectDir = `/opt/codeb/projects/${projectName}`;
      await ssh.exec(`mkdir -p ${projectDir}/.config/containers/systemd`);
      await ssh.exec(`mkdir -p ${projectDir}/quadlet`);

      // 2. 포트 할당 및 Registry 등록
      const registryDir = '/opt/codeb/registry/slots';
      await ssh.exec(`mkdir -p ${registryDir}`);

      // Staging 포트 할당
      if (environment === 'staging' || environment === 'both') {
        const stagingBasePort = await allocatePort(ssh, 'staging');
        ports.staging = getSlotPorts(stagingBasePort);

        const stagingRegistry = {
          projectName,
          teamId: auth.teamId,
          environment: 'staging',
          activeSlot: 'blue',
          blue: { name: 'blue', state: 'empty', port: ports.staging.blue },
          green: { name: 'green', state: 'empty', port: ports.staging.green },
          lastUpdated: new Date().toISOString(),
        };

        await ssh.writeFile(
          `${registryDir}/${projectName}-staging.json`,
          JSON.stringify(stagingRegistry, null, 2)
        );
        files.push(`${registryDir}/${projectName}-staging.json`);
      }

      // Production 포트 할당
      if (environment === 'production' || environment === 'both') {
        const prodBasePort = await allocatePort(ssh, 'production');
        ports.production = getSlotPorts(prodBasePort);

        const prodRegistry = {
          projectName,
          teamId: auth.teamId,
          environment: 'production',
          activeSlot: 'blue',
          blue: { name: 'blue', state: 'empty', port: ports.production.blue },
          green: { name: 'green', state: 'empty', port: ports.production.green },
          lastUpdated: new Date().toISOString(),
        };

        await ssh.writeFile(
          `${registryDir}/${projectName}-production.json`,
          JSON.stringify(prodRegistry, null, 2)
        );
        files.push(`${registryDir}/${projectName}-production.json`);
      }

      // 3. Quadlet 템플릿 생성
      for (const env of ['staging', 'production']) {
        if (environment === 'both' || environment === env) {
          for (const slot of ['blue', 'green']) {
            const quadletPath = `${projectDir}/quadlet/${projectName}-${env}-${slot}.container`;
            const port = env === 'staging' ? ports.staging![slot as 'blue' | 'green'] : ports.production![slot as 'blue' | 'green'];

            const quadletContent = generateQuadletTemplate({
              projectName,
              environment: env,
              slot,
              port,
              type,
            });

            await ssh.writeFile(quadletPath, quadletContent);
            files.push(quadletPath);
          }
        }
      }

      // 4. ENV 템플릿 생성
      const envContent = generateEnvTemplate({ projectName, database, redis });

      if (environment === 'staging' || environment === 'both') {
        await ssh.writeFile(`${projectDir}/.env.staging`, envContent);
        files.push(`${projectDir}/.env.staging`);
      }
      if (environment === 'production' || environment === 'both') {
        await ssh.writeFile(`${projectDir}/.env.production`, envContent);
        files.push(`${projectDir}/.env.production`);
      }

      // 5. SSOT에 프로젝트 등록
      const ssotPath = '/opt/codeb/registry/ssot.json';
      let ssot: any = { version: '6.0', projects: {}, ports: { used: [], reserved: [] } };

      try {
        const ssotContent = await ssh.readFile(ssotPath);
        ssot = JSON.parse(ssotContent);
      } catch {
        // 파일 없으면 새로 생성
      }

      ssot.projects[projectName] = {
        teamId: auth.teamId,
        type,
        database,
        redis,
        environments: environment === 'both' ? ['staging', 'production'] : [environment],
        createdAt: new Date().toISOString(),
        createdBy: auth.keyId,
      };

      await ssh.writeFile(ssotPath, JSON.stringify(ssot, null, 2));
      files.push(ssotPath);

      return {
        success: true,
        projectName,
        files,
        ports,
        registryPath: `/opt/codeb/registry/slots/${projectName}-*.json`,
      };
    } catch (error) {
      return {
        success: false,
        projectName,
        files,
        ports,
        registryPath: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

// ============================================================================
// Workflow Scan
// ============================================================================

async function executeWorkflowScan(
  input: z.infer<typeof workflowScanInputSchema>,
  auth: AuthContext
): Promise<WorkflowScanResult> {
  const { projectName } = input;

  return withSSH(SERVERS.app.ip, async (ssh) => {
    const issues: string[] = [];
    const ports: WorkflowScanResult['ports'] = {};

    try {
      const projectDir = `/opt/codeb/projects/${projectName}`;
      const registryDir = '/opt/codeb/registry/slots';

      // Registry 확인
      let registered = false;
      try {
        const stagingReg = await ssh.readFile(`${registryDir}/${projectName}-staging.json`);
        const stagingData = JSON.parse(stagingReg);
        ports.staging = { blue: stagingData.blue.port, green: stagingData.green.port };
        registered = true;
      } catch {
        // staging 없음
      }

      try {
        const prodReg = await ssh.readFile(`${registryDir}/${projectName}-production.json`);
        const prodData = JSON.parse(prodReg);
        ports.production = { blue: prodData.blue.port, green: prodData.green.port };
        registered = true;
      } catch {
        // production 없음
      }

      if (!registered) {
        issues.push('프로젝트가 Registry에 등록되지 않음. /we:workflow init 실행 필요');
      }

      // Dockerfile 확인
      let hasDockerfile = false;
      try {
        await ssh.exec(`test -f ${projectDir}/Dockerfile`);
        hasDockerfile = true;
      } catch {
        issues.push('Dockerfile이 없음');
      }

      // Quadlet 확인
      let hasQuadlet = false;
      try {
        const result = await ssh.exec(`ls ${projectDir}/quadlet/*.container 2>/dev/null | wc -l`);
        hasQuadlet = parseInt(result.stdout.trim()) > 0;
      } catch {
        // no quadlet files
      }
      if (!hasQuadlet) {
        issues.push('Quadlet 컨테이너 파일이 없음');
      }

      // GitHub Actions 확인 (로컬에서 확인해야 함 - 여기선 skip)
      const hasGitHubActions = false; // 서버에서 확인 불가

      // ENV 확인
      let hasEnv = false;
      try {
        await ssh.exec(`test -f ${projectDir}/.env.staging || test -f ${projectDir}/.env.production`);
        hasEnv = true;
      } catch {
        issues.push('ENV 파일이 없음');
      }

      return {
        success: true,
        projectName,
        registered,
        hasDockerfile,
        hasQuadlet,
        hasGitHubActions,
        hasEnv,
        ports,
        issues,
      };
    } catch (error) {
      return {
        success: false,
        projectName,
        registered: false,
        hasDockerfile: false,
        hasQuadlet: false,
        hasGitHubActions: false,
        hasEnv: false,
        ports,
        issues: [error instanceof Error ? error.message : String(error)],
      };
    }
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

async function allocatePort(ssh: any, environment: string): Promise<number> {
  const ssotPath = '/opt/codeb/registry/ssot.json';
  let ssot: any = { version: '6.0', projects: {}, ports: { used: [], reserved: [] } };

  try {
    const content = await ssh.readFile(ssotPath);
    ssot = JSON.parse(content);
  } catch {
    // 파일 없으면 새로 생성
  }

  // 포트 범위: staging 3000-3499, production 4000-4499
  const baseRange = environment === 'staging' ? 3000 : 4000;
  const maxRange = environment === 'staging' ? 3498 : 4498;

  const usedPorts = new Set(ssot.ports?.used || []);

  // 사용 가능한 첫 번째 짝수 포트 찾기 (blue용, green은 +1)
  for (let port = baseRange; port < maxRange; port += 2) {
    if (!usedPorts.has(port) && !usedPorts.has(port + 1)) {
      // 포트 예약
      if (!ssot.ports) ssot.ports = { used: [], reserved: [] };
      ssot.ports.used.push(port, port + 1);
      await ssh.writeFile(ssotPath, JSON.stringify(ssot, null, 2));
      return port;
    }
  }

  throw new Error(`No available ports in ${environment} range`);
}

function generateQuadletTemplate(params: {
  projectName: string;
  environment: string;
  slot: string;
  port: number;
  type: string;
}): string {
  const { projectName, environment, slot, port, type } = params;
  const containerName = `${projectName}-${environment}-${slot}`;

  return `# CodeB v6.0 - Quadlet Container
# Generated: ${new Date().toISOString()}

[Unit]
Description=${projectName} (${environment} - ${slot})
After=network-online.target

[Container]
ContainerName=${containerName}
Image=ghcr.io/codeb/${projectName}:latest
PublishPort=${port}:3000
EnvironmentFile=/opt/codeb/projects/${projectName}/.env.${environment}
AutoUpdate=registry

# Resource limits
Memory=512M
CPUQuota=100%

# Labels
Label=codeb.project=${projectName}
Label=codeb.environment=${environment}
Label=codeb.slot=${slot}
Label=codeb.type=${type}

[Service]
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
`;
}

function generateEnvTemplate(params: {
  projectName: string;
  database: boolean;
  redis: boolean;
}): string {
  const { projectName, database, redis } = params;

  let content = `# CodeB v6.0 - Environment Variables
# Project: ${projectName}
# Generated: ${new Date().toISOString()}

NODE_ENV=production
PORT=3000

`;

  if (database) {
    content += `# PostgreSQL (Storage Server)
DATABASE_URL=postgresql://postgres:password@db.codeb.kr:5432/${projectName}?schema=public

`;
  }

  if (redis) {
    content += `# Redis (Storage Server)
REDIS_URL=redis://db.codeb.kr:6379/0
REDIS_PREFIX=${projectName}:

`;
  }

  content += `# Centrifugo (WebSocket - Streaming Server)
CENTRIFUGO_URL=wss://ws.codeb.kr/connection/websocket
CENTRIFUGO_API_URL=http://ws.codeb.kr:8000/api
`;

  return content;
}

// ============================================================================
// Export Tools
// ============================================================================

export const workflowInitTool = {
  name: 'workflow_init',
  description: 'Initialize project with Registry, Quadlet, ENV templates',

  async execute(
    params: z.infer<typeof workflowInitInputSchema>,
    auth: AuthContext
  ): Promise<WorkflowInitResult> {
    const validated = workflowInitInputSchema.parse(params);
    return executeWorkflowInit(validated, auth);
  },
};

export const workflowScanTool = {
  name: 'workflow_scan',
  description: 'Scan project for workflow configuration status',

  async execute(
    params: z.infer<typeof workflowScanInputSchema>,
    auth: AuthContext
  ): Promise<WorkflowScanResult> {
    const validated = workflowScanInputSchema.parse(params);
    return executeWorkflowScan(validated, auth);
  },
};
