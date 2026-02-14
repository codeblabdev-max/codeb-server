/**
 * @codeb/shared - Auth & Team Types
 * Based on mcp-server/src/lib/types.ts
 */

import type { Environment } from './deployment.js';

// ============================================================================
// Team & Auth Types
// ============================================================================

export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Team {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  owner: string;
  plan: 'free' | 'pro' | 'enterprise';
  projects: string[];
  settings: TeamSettings;
}

export interface TeamSettings {
  defaultEnvironment: Environment;
  autoPromote: boolean;
  gracePeriodHours: number;
  allowedDomains?: string[];
  notificationWebhook?: string;
}

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: TeamRole;
  joinedAt: string;
  invitedBy: string;
  lastActiveAt?: string;
}

export interface ApiKey {
  id: string;
  key: string; // hashed, never stored plain
  name: string;
  teamId: string;
  role: TeamRole;
  createdAt: string;
  createdBy: string;
  lastUsed?: string;
  expiresAt?: string;
  scopes: string[];
  rateLimit?: {
    requests: number;
    window: number; // seconds
  };
}

export interface ApiKeyCreateInput {
  name: string;
  teamId: string;
  role: TeamRole;
  expiresAt?: string;
  scopes?: string[];
}

export interface AuthContext {
  apiKey: string;
  keyId: string;
  teamId: string;
  role: TeamRole;
  scopes: string[];
  projects: string[];
}

// ============================================================================
// Registry Types (File-based auth store)
// ============================================================================

export interface TeamsRegistry {
  version: '6.0';
  updatedAt: string;
  teams: Record<string, Team>;
}

export interface ApiKeysRegistry {
  version: '6.0';
  updatedAt: string;
  keys: Record<string, Omit<ApiKey, 'key'> & { keyHash: string }>;
}
