// wdot Control - Type Definitions

export interface Project {
  id: string;
  name: string;
  type: 'nextjs' | 'remix' | 'nodejs' | 'static';
  git_repo?: string;
  created_at: string;
  updated_at: string;
  status: 'active' | 'inactive' | 'deploying';
}

export interface Environment {
  id: string;
  project_id: string;
  name: 'staging' | 'production' | 'preview';
  server_id: string;
  app_port: number;
  db_port?: number;
  redis_port?: number;
  domain?: string;
  status: 'running' | 'stopped' | 'error';
  created_at: string;
}

export interface Server {
  id: string;
  name: string;
  ip: string;
  role: 'app' | 'db' | 'redis' | 'storage' | 'all';
  vultr_id?: string;
  ssh_key_path: string;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface PortAllocation {
  id: string;
  project_id: string;
  environment: string;
  server_id: string;
  service: 'app' | 'db' | 'redis' | 'socket';
  port: number;
  allocated_at: string;
}

export interface EnvBackup {
  id: string;
  project_id: string;
  environment: string;
  encrypted_content: string;
  checksum: string;
  created_at: string;
}

// Port ranges by environment
export const PORT_RANGES = {
  staging: {
    app: { min: 3000, max: 3499 },
    db: { min: 15432, max: 15499 },
    redis: { min: 16379, max: 16399 },
  },
  production: {
    app: { min: 4000, max: 4499 },
    db: { min: 25432, max: 25499 },
    redis: { min: 26379, max: 26399 },
  },
  preview: {
    app: { min: 5000, max: 5999 },
    db: { min: 35432, max: 35499 },
    redis: { min: 36379, max: 36399 },
  },
} as const;

// Protected commands that require special handling
export const PROTECTED_COMMANDS = [
  'rm -rf',
  'DROP DATABASE',
  'DROP TABLE',
  'TRUNCATE',
  'podman volume rm',
  'podman system prune',
  'systemctl stop',
  'systemctl disable',
] as const;

// Protected paths that cannot be deleted
export const PROTECTED_PATHS = [
  '/opt/wdot',
  '/var/lib/postgresql',
  '/var/lib/redis',
  '/data',
] as const;

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface DeployRequest {
  project_name: string;
  project_type: 'nextjs' | 'remix' | 'nodejs' | 'static';
  git_repo?: string;
  environment: 'staging' | 'production' | 'preview';
  services: {
    database?: boolean;
    redis?: boolean;
  };
  domain?: string;
}

export interface AnalyzeResult {
  project_type: 'nextjs' | 'remix' | 'nodejs' | 'static' | 'unknown';
  has_database: boolean;
  has_redis: boolean;
  framework_version?: string;
  node_version?: string;
  existing_env: Record<string, string>;
  recommended_services: string[];
}
