/**
 * @codeb/auth - Authentication & Authorization
 * Based on mcp-server/src/lib/auth.ts
 *
 * Features:
 * - API key generation, hashing, parsing
 * - File-based key/team registry (legacy)
 * - Role-based permission system
 * - Rate limiting
 */

import { createHash, randomBytes } from 'node:crypto';
import type {
  ApiKey,
  ApiKeyCreateInput,
  AuthContext,
  TeamRole,
} from '@codeb/shared';

// Re-export sub-modules
export {
  ROLE_HIERARCHY,
  PERMISSIONS,
  hasPermission,
  checkPermission,
  getPermissions,
} from './permissions.js';

export {
  checkRateLimit,
  rateLimitStore,
  type RateLimitResult,
  type RateLimitConfig,
} from './rate-limiter.js';

export {
  loadApiKeysRegistry,
  saveApiKeysRegistry,
  loadTeamsRegistry,
  saveTeamsRegistry,
} from './file-store.js';

// ============================================================================
// Key Generation & Hashing
// ============================================================================

/**
 * Generate a new API key.
 * Format: codeb_{teamId}_{role}_{randomToken}
 */
export function generateApiKey(teamId: string, role: TeamRole): string {
  const token = randomBytes(18).toString('base64url');
  return `codeb_${teamId}_${role}_${token}`;
}

/** Hash an API key for secure storage */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Parse an API key to extract components */
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
// Authentication
// ============================================================================

import {
  loadApiKeysRegistry as loadKeys,
  saveApiKeysRegistry as saveKeys,
  loadTeamsRegistry as loadTeams,
} from './file-store.js';

/** Verify an API key and return the auth context */
export function verifyApiKey(apiKey: string): AuthContext | null {
  if (!apiKey) return null;

  const parsed = parseApiKey(apiKey);
  if (!parsed) return null;

  const registry = loadKeys();
  const teamsRegistry = loadTeams();
  const keyHash = hashApiKey(apiKey);

  // Find key by hash
  const keyEntry = Object.entries(registry.keys).find(
    ([_, v]) => v.keyHash === keyHash,
  );

  if (!keyEntry) {
    // Development mode: accept valid format keys
    if (process.env.NODE_ENV === 'development') {
      return {
        apiKey,
        keyId: 'dev-key',
        teamId: parsed.teamId,
        role: parsed.role,
        scopes: ['*'],
        projects: ['*'],
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

  // Update last used timestamp
  registry.keys[keyId].lastUsed = new Date().toISOString();
  saveKeys(registry);

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
// API Key Management
// ============================================================================

/** Create a new API key and persist it */
export function createApiKey(
  input: ApiKeyCreateInput,
  createdBy: string,
): { key: string; id: string } {
  const registry = loadKeys();

  const key = generateApiKey(input.teamId, input.role);
  const keyHash = hashApiKey(key);
  const keyId = `key_${randomBytes(8).toString('hex')}`;

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

  saveKeys(registry);

  return { key, id: keyId };
}

/** Revoke an API key by ID */
export function revokeApiKey(keyId: string): boolean {
  const registry = loadKeys();

  if (!registry.keys[keyId]) {
    return false;
  }

  delete registry.keys[keyId];
  saveKeys(registry);

  return true;
}

/** List API keys for a team (without sensitive data) */
export function listApiKeys(teamId: string): Array<Omit<ApiKey, 'key'>> {
  const registry = loadKeys();

  return Object.values(registry.keys)
    .filter(k => k.teamId === teamId)
    .map(({ keyHash: _, ...rest }) => rest as Omit<ApiKey, 'key'>);
}
