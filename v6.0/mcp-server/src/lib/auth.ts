/**
 * CodeB v6.0 - Authentication & Authorization
 * Team-based API Key authentication (Vercel style)
 */

import { createHash, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type {
  ApiKey,
  ApiKeyCreateInput,
  AuthContext,
  TeamRole,
  ApiKeysRegistry,
  TeamsRegistry,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

const REGISTRY_PATH = '/opt/codeb/registry';
const API_KEYS_PATH = `${REGISTRY_PATH}/api-keys.json`;
const TEAMS_PATH = `${REGISTRY_PATH}/teams.json`;

// Role hierarchy (higher index = more permissions)
const ROLE_HIERARCHY: TeamRole[] = ['viewer', 'member', 'admin', 'owner'];

// Permission definitions
const PERMISSIONS: Record<string, TeamRole> = {
  // Team management
  'team.create': 'owner',
  'team.delete': 'owner',
  'team.settings': 'admin',
  'team.view': 'viewer',

  // Member management
  'member.invite': 'admin',
  'member.remove': 'admin',
  'member.list': 'viewer',

  // Token management
  'token.create': 'member',
  'token.revoke.own': 'member',
  'token.revoke.any': 'admin',
  'token.list': 'member',

  // Project management
  'project.create': 'member',
  'project.delete': 'admin',
  'project.view': 'viewer',

  // Deployment (Blue-Green)
  'deploy': 'member',
  'deploy.create': 'member',
  'deploy.promote': 'member',
  'deploy.rollback': 'member',
  'promote': 'member',
  'rollback': 'member',
  'slot.view': 'viewer',
  'slot.cleanup': 'admin',

  // ENV management
  'env.get': 'viewer',
  'env.set': 'member',
  'env.restore': 'member',
  'env.history': 'viewer',

  // Domain management
  'domain.setup': 'member',
  'domain.delete': 'admin',
  'domain.view': 'viewer',

  // SSH access (Admin only)
  'ssh.access': 'admin',

  // Monitoring
  'logs.view': 'viewer',
  'health.check': 'viewer',
  'metrics.view': 'viewer',
};

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate a new API key
 * Format: codeb_{teamId}_{role}_{randomToken}
 */
export function generateApiKey(teamId: string, role: TeamRole): string {
  const token = randomBytes(18).toString('base64url'); // 24 chars
  return `codeb_${teamId}_${role}_${token}`;
}

/**
 * Hash an API key for storage
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Parse API key to extract components
 */
export function parseApiKey(key: string): { teamId: string; role: TeamRole; token: string } | null {
  const match = key.match(/^codeb_([a-zA-Z0-9-]+)_(owner|admin|member|viewer)_([a-zA-Z0-9_-]+)$/);
  if (!match) return null;

  return {
    teamId: match[1],
    role: match[2] as TeamRole,
    token: match[3],
  };
}

// ============================================================================
// Registry Management
// ============================================================================

function ensureDirectory(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadApiKeysRegistry(): ApiKeysRegistry {
  try {
    if (existsSync(API_KEYS_PATH)) {
      return JSON.parse(readFileSync(API_KEYS_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load API keys registry:', e);
  }
  return { version: '6.0', updatedAt: new Date().toISOString(), keys: {} };
}

export function saveApiKeysRegistry(registry: ApiKeysRegistry): void {
  ensureDirectory(API_KEYS_PATH);
  registry.updatedAt = new Date().toISOString();
  writeFileSync(API_KEYS_PATH, JSON.stringify(registry, null, 2));
}

export function loadTeamsRegistry(): TeamsRegistry {
  try {
    if (existsSync(TEAMS_PATH)) {
      return JSON.parse(readFileSync(TEAMS_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load teams registry:', e);
  }
  return { version: '6.0', updatedAt: new Date().toISOString(), teams: {} };
}

export function saveTeamsRegistry(registry: TeamsRegistry): void {
  ensureDirectory(TEAMS_PATH);
  registry.updatedAt = new Date().toISOString();
  writeFileSync(TEAMS_PATH, JSON.stringify(registry, null, 2));
}

// ============================================================================
// Authentication
// ============================================================================

/**
 * Verify API key and return auth context
 */
export function verifyApiKey(apiKey: string): AuthContext | null {
  if (!apiKey) return null;

  const parsed = parseApiKey(apiKey);
  if (!parsed) return null;

  const registry = loadApiKeysRegistry();
  const teamsRegistry = loadTeamsRegistry();
  const keyHash = hashApiKey(apiKey);

  // Find key by hash
  const keyEntry = Object.entries(registry.keys).find(
    ([_, v]) => v.keyHash === keyHash
  );

  if (!keyEntry) {
    // Development mode: accept valid format
    if (process.env.NODE_ENV === 'development') {
      return {
        apiKey,
        keyId: 'dev-key',
        teamId: parsed.teamId,
        role: parsed.role,
        scopes: ['*'],
        projects: ['*'], // All projects in dev mode
      };
    }
    return null;
  }

  const [keyId, keyData] = keyEntry;

  // Check expiration
  if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
    return null;
  }

  // Get team projects
  const team = teamsRegistry.teams[keyData.teamId];
  const projects = team?.projects || [];

  // Update last used
  registry.keys[keyId].lastUsed = new Date().toISOString();
  saveApiKeysRegistry(registry);

  return {
    apiKey,
    keyId,
    teamId: keyData.teamId,
    role: keyData.role,
    scopes: keyData.scopes,
    projects,
  };
}

// ============================================================================
// Authorization
// ============================================================================

/**
 * Check if role has permission for action
 */
export function hasPermission(role: TeamRole, action: string): boolean {
  const requiredRole = PERMISSIONS[action];
  if (!requiredRole) return false;

  const roleIndex = ROLE_HIERARCHY.indexOf(role);
  const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole);

  return roleIndex >= requiredIndex;
}

/**
 * Check if auth context has permission
 */
export function checkPermission(auth: AuthContext, action: string): boolean {
  // Check scopes first
  if (!auth.scopes.includes('*') && !auth.scopes.includes(action)) {
    return false;
  }

  return hasPermission(auth.role, action);
}

/**
 * Get all permissions for a role
 */
export function getPermissions(role: TeamRole): string[] {
  const roleIndex = ROLE_HIERARCHY.indexOf(role);

  return Object.entries(PERMISSIONS)
    .filter(([_, requiredRole]) => {
      const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole);
      return roleIndex >= requiredIndex;
    })
    .map(([action]) => action);
}

// ============================================================================
// API Key Management
// ============================================================================

/**
 * Create a new API key
 */
export function createApiKey(input: ApiKeyCreateInput, createdBy: string): { key: string; id: string } {
  const registry = loadApiKeysRegistry();

  // Generate key
  const key = generateApiKey(input.teamId, input.role);
  const keyHash = hashApiKey(key);
  const keyId = `key_${randomBytes(8).toString('hex')}`;

  // Store (without plain key)
  registry.keys[keyId] = {
    id: keyId,
    keyHash,
    name: input.name,
    teamId: input.teamId,
    role: input.role,
    createdAt: new Date().toISOString(),
    createdBy,
    scopes: input.scopes || ['*'],
    expiresAt: input.expiresAt,
  };

  saveApiKeysRegistry(registry);

  return { key, id: keyId };
}

/**
 * Revoke an API key
 */
export function revokeApiKey(keyId: string): boolean {
  const registry = loadApiKeysRegistry();

  if (!registry.keys[keyId]) {
    return false;
  }

  delete registry.keys[keyId];
  saveApiKeysRegistry(registry);

  return true;
}

/**
 * List API keys for a team (without sensitive data)
 */
export function listApiKeys(teamId: string): Array<Omit<ApiKey, 'key'>> {
  const registry = loadApiKeysRegistry();

  return Object.values(registry.keys)
    .filter(k => k.teamId === teamId)
    .map(({ keyHash, ...rest }) => rest as Omit<ApiKey, 'key'>);
}

// ============================================================================
// Rate Limiting
// ============================================================================

const rateLimitStore: Map<string, { count: number; resetAt: number }> = new Map();

const DEFAULT_RATE_LIMIT = {
  requests: 100,
  window: 60, // 1 minute
};

/**
 * Check rate limit for API key
 */
export function checkRateLimit(keyId: string, customLimit?: { requests: number; window: number }): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const limit = customLimit || DEFAULT_RATE_LIMIT;
  const now = Date.now();
  const windowMs = limit.window * 1000;

  let entry = rateLimitStore.get(keyId);

  // Reset if window expired
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowMs };
    rateLimitStore.set(keyId, entry);
  }

  entry.count++;

  return {
    allowed: entry.count <= limit.requests,
    remaining: Math.max(0, limit.requests - entry.count),
    resetAt: entry.resetAt,
  };
}

// ============================================================================
// Exports
// ============================================================================

export const auth = {
  generateApiKey,
  hashApiKey,
  parseApiKey,
  verifyApiKey,
  hasPermission,
  checkPermission,
  getPermissions,
  createApiKey,
  revokeApiKey,
  listApiKeys,
  checkRateLimit,
  loadTeamsRegistry,
  saveTeamsRegistry,
};
