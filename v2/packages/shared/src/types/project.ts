/**
 * @codeb/shared - Project & Registry Types
 * Based on mcp-server/src/lib/types.ts
 */

import type { Environment, ProjectSlots } from './deployment.js';

export interface ProjectRegistry {
  projectName: string;
  teamId: string;
  type: 'nextjs' | 'remix' | 'nodejs' | 'python' | 'go';
  createdAt: string;
  environments: {
    staging?: EnvironmentRegistry;
    production?: EnvironmentRegistry;
    preview?: EnvironmentRegistry;
  };
  database?: {
    name: string;
    port: number;
  };
  redis?: {
    db: number;
    port: number;
  };
}

export interface EnvironmentRegistry {
  domain: string;
  basePort: number;
  slots: ProjectSlots;
  lastDeployedAt?: string;
  lastDeployedVersion?: string;
}

export interface SSOTRegistry {
  version: '6.0';
  updatedAt: string;
  projects: Record<string, ProjectRegistry>;
  ports: {
    used: number[];
    reserved: number[];
  };
}
