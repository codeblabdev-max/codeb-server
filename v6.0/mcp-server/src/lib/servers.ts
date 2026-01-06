/**
 * CodeB v6.0 - 4-Server Configuration
 * Single Source of Truth for server infrastructure
 */

export interface ServerConfig {
  name: string;
  ip: string;
  domain: string;
  role: 'app' | 'streaming' | 'storage' | 'backup';
  services: string[];
  ports: Record<string, number>;
}

export const SERVERS: Record<string, ServerConfig> = {
  app: {
    name: 'App Server',
    ip: '158.247.203.55',
    domain: 'app.codeb.kr',
    role: 'app',
    services: ['nextjs', 'mcp-api', 'caddy', 'podman', 'runner'],
    ports: {
      http: 80,
      https: 443,
      mcpApi: 9101,
      stagingStart: 3000,
      stagingEnd: 3499,
      productionStart: 4000,
      productionEnd: 4499,
      previewStart: 5000,
      previewEnd: 5999,
    },
  },
  streaming: {
    name: 'Streaming Server',
    ip: '141.164.42.213',
    domain: 'ws.codeb.kr',
    role: 'streaming',
    services: ['centrifugo'],
    ports: {
      centrifugo: 8000,
      centrifugoApi: 8000,
    },
  },
  storage: {
    name: 'Storage Server',
    ip: '64.176.226.119',
    domain: 'db.codeb.kr',
    role: 'storage',
    services: ['postgresql', 'redis'],
    ports: {
      postgresql: 5432,
      redis: 6379,
    },
  },
  backup: {
    name: 'Backup Server',
    ip: '141.164.37.63',
    domain: 'backup.codeb.kr',
    role: 'backup',
    services: ['env-backup', 'prometheus', 'grafana'],
    ports: {
      prometheus: 9090,
      grafana: 3000,
      nodeExporter: 9100,
    },
  },
};

// Port ranges for Blue-Green slots
export const PORT_RANGES = {
  staging: {
    app: { start: 3000, end: 3499 },
    db: { start: 5432, end: 5449 },
    redis: { start: 6379, end: 6399 },
  },
  production: {
    app: { start: 4000, end: 4499 },
    db: { start: 5450, end: 5469 },
    redis: { start: 6400, end: 6419 },
  },
  preview: {
    app: { start: 5000, end: 5999 },
  },
};

// Get Blue/Green ports for a project
export function getSlotPorts(basePort: number): { blue: number; green: number } {
  return {
    blue: basePort,
    green: basePort + 1,
  };
}

// Get server by role
export function getServer(role: ServerConfig['role']): ServerConfig {
  const server = Object.values(SERVERS).find(s => s.role === role);
  if (!server) throw new Error(`Server not found for role: ${role}`);
  return server;
}

// Generate secure password using crypto
import { randomBytes } from 'crypto';

export function generateSecurePassword(length: number = 32): string {
  return randomBytes(length).toString('base64url').slice(0, length);
}

// Generate connection strings
export function generateConnectionStrings(projectName: string, environment: string) {
  const storage = SERVERS.storage;
  const streaming = SERVERS.streaming;
  const dbName = `${projectName}_${environment}`;
  const dbUser = `${projectName}_user`;
  const dbPassword = generateSecurePassword();
  const redisPassword = generateSecurePassword();

  return {
    DATABASE_URL: `postgresql://${dbUser}:${dbPassword}@${storage.domain}:${storage.ports.postgresql}/${dbName}?schema=public`,
    REDIS_URL: `redis://:${redisPassword}@${storage.domain}:${storage.ports.redis}/0`,
    CENTRIFUGO_URL: `wss://${streaming.domain}/connection/websocket`,
    CENTRIFUGO_API_URL: `http://${streaming.domain}:${streaming.ports.centrifugoApi}/api`,
    CENTRIFUGO_API_KEY: generateSecurePassword(32),
    CENTRIFUGO_SECRET: generateSecurePassword(32),
  };
}
