/**
 * InitService - Project initialization (DB-Primary)
 *
 * Flow: DB project register -> port allocate -> slot init -> ENV create -> Caddy -> DB create -> workflow
 * Refactored from mcp-server/src/tools/project.ts (executeWorkflowInit)
 */

import { randomBytes } from 'crypto';
import type { ProjectRepo, SlotRepo, TeamRepo } from '@codeb/db';
import type { SSHClientWrapper } from '@codeb/ssh';
import type { AuthContext } from '@codeb/shared';

interface LoggerLike {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  log(level: string, message: string, meta?: Record<string, unknown>): void;
}
import { WorkflowService } from './workflow.service.js';

const SERVERS = {
  app: { ip: '158.247.203.55', domain: 'app.codeb.kr' },
  storage: { ip: '64.176.226.119', domain: 'db.codeb.kr', ports: { postgresql: 5432, redis: 6379 } },
  streaming: { domain: 'ws.codeb.kr' },
};

export interface InitParams {
  projectName: string;
  type?: 'nextjs' | 'remix' | 'nodejs' | 'python' | 'go';
  database?: boolean;
  redis?: boolean;
  domain?: string;
}

export interface InitResult {
  success: boolean;
  projectName: string;
  files: string[];
  ports: { blue: number; green: number };
  database?: {
    name: string;
    user: string;
    password: string;
    host: string;
    port: number;
    url: string;
  };
  redis?: { db: number; host: string; port: number; url: string };
  domain: string;
  registryPath: string;
  githubActionsWorkflow: string;
  dockerfile: string;
  instructions: string[];
  error?: string;
}

export class InitService {
  private readonly workflowService: WorkflowService;

  constructor(
    private readonly projectRepo: typeof ProjectRepo,
    private readonly slotRepo: typeof SlotRepo,
    private readonly teamRepo: typeof TeamRepo,
    private readonly appSSH: SSHClientWrapper,
    private readonly storageSSH: SSHClientWrapper,
    private readonly logger: LoggerLike,
  ) {
    this.workflowService = new WorkflowService(projectRepo, logger);
  }

  async execute(params: InitParams, auth: AuthContext): Promise<InitResult> {
    const {
      projectName,
      type = 'nextjs',
      database: needsDatabase = true,
      redis: needsRedis = true,
      domain: inputDomain,
    } = params;

    const files: string[] = [];
    let ports = { blue: 0, green: 0 };
    let dbInfo: InitResult['database'];
    let redisInfo: InitResult['redis'];
    const domain = inputDomain || `${projectName}.codeb.kr`;

    try {
      // Step 1: Check existing
      const existingProject = await this.projectRepo.findByName(projectName);
      if (existingProject) {
        return {
          success: false, projectName, files: [], ports: { blue: 0, green: 0 },
          domain, registryPath: '', githubActionsWorkflow: '', dockerfile: '',
          instructions: [],
          error: `Project ${projectName} already exists. Use deploy to deploy.`,
        };
      }

      // Step 2: Allocate ports
      const basePort = await this.getAvailablePort();
      ports = { blue: basePort, green: basePort + 1 };
      this.logger.info('Ports allocated', { projectName, ports });

      // Step 3: Storage server (PostgreSQL, Redis)
      if (needsDatabase) {
        const dbPassword = this.generatePassword();
        const dbName = `${projectName}_db`;
        const dbUser = `${projectName}_user`;

        await this.storageSSH.exec(`sudo -u postgres psql -c "CREATE DATABASE ${dbName};" || true`);
        await this.storageSSH.exec(`sudo -u postgres psql -c "CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}';" || true`);
        await this.storageSSH.exec(`sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser};"`);
        await this.storageSSH.exec(`sudo -u postgres psql -c "ALTER DATABASE ${dbName} OWNER TO ${dbUser};"`);

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
        const redisDb = await this.allocateRedisDb(projectName);
        redisInfo = {
          db: redisDb,
          host: SERVERS.storage.domain,
          port: SERVERS.storage.ports.redis,
          url: `redis://${SERVERS.storage.domain}:${SERVERS.storage.ports.redis}/${redisDb}`,
        };
      }

      // Step 4: Team resolution
      const actualTeamId = await this.resolveTeamId(auth);

      // Step 5: Register project in DB
      await this.projectRepo.upsert({
        name: projectName,
        teamId: actualTeamId,
        type,
        databaseName: dbInfo?.name,
        databasePort: dbInfo ? SERVERS.storage.ports.postgresql : undefined,
        redisDb: redisInfo?.db,
        redisPort: redisInfo ? SERVERS.storage.ports.redis : undefined,
      });
      this.logger.info('Project registered in database', { projectName, teamId: actualTeamId });

      // Step 6: Initialize slots
      await this.slotRepo.upsert({
        projectName,
        teamId: actualTeamId,
        environment: 'production',
        activeSlot: 'blue',
        blue: { name: 'blue', state: 'empty', port: basePort },
        green: { name: 'green', state: 'empty', port: basePort + 1 },
        lastUpdated: new Date().toISOString(),
      });
      this.logger.info('Slot registry initialized', { projectName });

      // Step 7: App server setup (directories, ENV, Caddy)
      const envContent = this.generateEnvWithCredentials({ projectName, database: dbInfo, redis: redisInfo, domain });
      const envPath = `/opt/codeb/env/${projectName}/.env`;

      await this.appSSH.exec(`mkdir -p /opt/codeb/projects/${projectName}`);
      await this.appSSH.exec(`mkdir -p /opt/codeb/env/${projectName}`);
      await this.appSSH.exec(`mkdir -p /opt/codeb/env-backup/${projectName}`);
      await this.appSSH.exec(`mkdir -p /opt/codeb/registry/slots`);

      const base64Env = Buffer.from(envContent).toString('base64');
      await this.appSSH.exec(`echo "${base64Env}" | base64 -d > ${envPath}`);
      await this.appSSH.exec(`chmod 600 ${envPath}`);
      files.push(envPath);

      const backupPath = `/opt/codeb/env-backup/${projectName}/.env.${Date.now()}`;
      await this.appSSH.exec(`cp ${envPath} ${backupPath}`);

      // Caddy config
      const caddySnippet = `${domain} {\n  reverse_proxy localhost:${ports.blue} localhost:${ports.green} {\n    lb_policy first\n    fail_duration 10s\n  }\n  encode gzip\n  log {\n    output file /var/log/caddy/${projectName}.log\n  }\n}`;
      const caddyPath = `/etc/caddy/sites/${projectName}.caddy`;
      const base64Caddy = Buffer.from(caddySnippet).toString('base64');
      await this.appSSH.exec(`sudo mkdir -p /etc/caddy/sites`);
      await this.appSSH.exec(`echo "${base64Caddy}" | base64 -d | sudo tee ${caddyPath}`);
      await this.appSSH.exec('sudo systemctl reload caddy || true');
      files.push(caddyPath);

      // PowerDNS A record
      if (domain.endsWith('.codeb.kr')) {
        const subdomain = domain.replace('.codeb.kr', '');
        await this.appSSH.exec(
          `pdnsutil add-record codeb.kr ${subdomain} A 300 ${SERVERS.app.ip} 2>/dev/null || true`,
        );
        await this.appSSH.exec('pdnsutil rectify-zone codeb.kr 2>/dev/null || true');
      }

      // Step 8: Generate templates
      const githubActionsWorkflow = this.workflowService.generateGitHubActionsWorkflow(projectName, type);
      const dockerfile = this.workflowService.generateDockerfile(type);

      const instructions = [
        'Project initialization complete!',
        '',
        `Allocated resources:`,
        `   Ports: Blue=${ports.blue}, Green=${ports.green}`,
        dbInfo ? `   DB: ${dbInfo.name} (${dbInfo.user}@${dbInfo.host})` : '',
        redisInfo ? `   Redis: DB ${redisInfo.db}` : '',
        `   Domain: ${domain}`,
        '',
        'Local files to create:',
        '   1. .github/workflows/deploy.yml',
        '   2. Dockerfile (if missing)',
        '',
        'GitHub Secrets (Required):',
        '   - CODEB_API_KEY: CodeB MCP API key',
        '   - MINIO_ACCESS_KEY: Minio S3 access key (build cache)',
        '   - MINIO_SECRET_KEY: Minio S3 secret key (build cache)',
        '',
        'Deploy:',
        `   git push origin main  # -> Minio S3 cache build & Blue-Green deploy`,
        '',
        'Manual Actions:',
        `   promote:  gh workflow run deploy.yml -f action=promote`,
        `   rollback: gh workflow run deploy.yml -f action=rollback`,
      ].filter(Boolean);

      this.logger.info('Project init completed', { projectName, domain, ports });

      return {
        success: true, projectName, files, ports,
        database: dbInfo, redis: redisInfo, domain,
        registryPath: `DB: projects/${projectName}`,
        githubActionsWorkflow, dockerfile, instructions,
      };
    } catch (error) {
      this.logger.error('Project init failed', {
        projectName,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false, projectName, files, ports, domain,
        registryPath: '', githubActionsWorkflow: '', dockerfile: '',
        instructions: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private generatePassword(length: number = 32): string {
    return randomBytes(length).toString('base64url').slice(0, length);
  }

  private async getAvailablePort(): Promise<number> {
    const allSlots = await this.slotRepo.listAll();
    const usedPorts = new Set<number>();
    for (const slots of allSlots) {
      usedPorts.add(slots.blue.port);
      usedPorts.add(slots.green.port);
    }
    for (let port = 4100; port <= 4499; port += 2) {
      if (!usedPorts.has(port) && !usedPorts.has(port + 1)) return port;
    }
    throw new Error('No available ports in production range (4100-4499)');
  }

  private async resolveTeamId(auth: AuthContext): Promise<string> {
    let existingTeam = await this.teamRepo.findById(auth.teamId);
    if (!existingTeam) {
      const teamSlug = auth.teamId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      existingTeam = await this.teamRepo.findBySlug(teamSlug);
    }
    if (existingTeam) return existingTeam.id;

    // Auto-create team
    try {
      await this.teamRepo.create({
        id: auth.teamId,
        name: auth.teamId,
        slug: auth.teamId.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        owner: auth.keyId || 'system',
        plan: 'free',
        projects: [],
        settings: { defaultEnvironment: 'production', autoPromote: false, gracePeriodHours: 48 },
      });
      return auth.teamId;
    } catch (teamError: unknown) {
      const msg = teamError instanceof Error ? teamError.message : '';
      if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
        const teamBySlug = await this.teamRepo.findBySlug(
          auth.teamId.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        );
        if (teamBySlug) return teamBySlug.id;
      }
      throw teamError;
    }
  }

  private async allocateRedisDb(projectName: string): Promise<number> {
    const ssotPath = '/opt/codeb/registry/redis-db.json';
    let redisDb: { used: Record<string, number>; nextDb: number } = { used: {}, nextDb: 1 };

    try {
      const result = await this.storageSSH.exec(`cat ${ssotPath} 2>/dev/null || echo ""`);
      if (result.stdout.trim()) {
        redisDb = JSON.parse(result.stdout);
      }
    } catch {
      // File doesn't exist
    }

    if (redisDb.used[projectName]) return redisDb.used[projectName];

    const dbNum = redisDb.nextDb;
    if (dbNum > 15) throw new Error('No available Redis DB numbers (max 15)');

    redisDb.used[projectName] = dbNum;
    redisDb.nextDb = dbNum + 1;
    const base64 = Buffer.from(JSON.stringify(redisDb, null, 2)).toString('base64');
    await this.storageSSH.exec(`echo "${base64}" | base64 -d > ${ssotPath}`);

    return dbNum;
  }

  private generateEnvWithCredentials(params: {
    projectName: string;
    database?: InitResult['database'];
    redis?: InitResult['redis'];
    domain: string;
  }): string {
    const { projectName, database, redis, domain } = params;

    let content = `# CodeB v8.0 - Environment Variables
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
}
