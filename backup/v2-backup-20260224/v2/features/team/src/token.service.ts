/**
 * TokenService - API token create, revoke, list
 *
 * Refactored from mcp-server/src/tools/team.ts
 * (executeTokenCreate, executeTokenRevoke, executeTokenList)
 */

import type { AuthContext, TeamRole } from '@codeb/shared';
import {
  checkPermission,
  createApiKey,
  revokeApiKey,
  listApiKeys,
} from '@codeb/auth';
interface LoggerLike {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  log(level: string, message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Constants
// ============================================================================

const ROLE_HIERARCHY: TeamRole[] = ['viewer', 'member', 'admin', 'owner'];

// ============================================================================
// Types
// ============================================================================

export interface TokenCreateInput {
  teamId: string;
  name: string;
  role: 'admin' | 'member' | 'viewer';
  expiresIn?: number; // days
  scopes?: string[];
}

export interface TokenCreateResult {
  success: boolean;
  token?: {
    id: string;
    key: string;
    name: string;
    role: TeamRole;
    expiresAt?: string;
  };
  error?: string;
}

export interface TokenRevokeResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// Service
// ============================================================================

export class TokenService {
  constructor(private readonly logger: LoggerLike) {}

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  async create(input: TokenCreateInput, auth: AuthContext): Promise<TokenCreateResult> {
    if (!checkPermission(auth, 'token.create')) {
      return { success: false, error: 'Insufficient permissions' };
    }

    // Cannot create token with higher role
    const myRoleIndex = ROLE_HIERARCHY.indexOf(auth.role);
    const requestedRoleIndex = ROLE_HIERARCHY.indexOf(input.role);

    if (requestedRoleIndex > myRoleIndex) {
      return { success: false, error: 'Cannot create token with higher role than your own' };
    }

    // Calculate expiration
    let expiresAt: string | undefined;
    if (input.expiresIn) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + input.expiresIn);
      expiresAt = expDate.toISOString();
    }

    const { key, id } = createApiKey(
      {
        name: input.name,
        teamId: input.teamId,
        role: input.role,
        expiresAt,
        scopes: input.scopes,
      },
      auth.keyId,
    );

    this.logger.info('Token created', {
      tokenId: id,
      teamId: input.teamId,
      role: input.role,
      createdBy: auth.keyId,
    });

    return {
      success: true,
      token: { id, key, name: input.name, role: input.role, expiresAt },
    };
  }

  // ---------------------------------------------------------------------------
  // Revoke
  // ---------------------------------------------------------------------------

  async revoke(
    tokenId: string,
    auth: AuthContext,
  ): Promise<TokenRevokeResult> {
    const keys = listApiKeys(auth.teamId);
    const targetKey = keys.find((k) => k.id === tokenId);

    if (!targetKey) {
      return { success: false, error: 'Token not found' };
    }

    // Check permission: own vs any
    const isOwnToken = targetKey.createdBy === auth.keyId;
    if (isOwnToken) {
      if (!checkPermission(auth, 'token.revoke.own')) {
        return { success: false, error: 'Insufficient permissions' };
      }
    } else {
      if (!checkPermission(auth, 'token.revoke.any')) {
        return { success: false, error: 'Insufficient permissions' };
      }
    }

    revokeApiKey(tokenId);

    this.logger.info('Token revoked', { tokenId, revokedBy: auth.keyId });

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------

  async list(
    teamId: string,
    auth: AuthContext,
  ): Promise<{
    success: boolean;
    tokens?: Array<{
      id: string;
      name: string;
      role: TeamRole;
      createdAt: string;
      lastUsed?: string;
      expiresAt?: string;
    }>;
    error?: string;
  }> {
    if (!checkPermission(auth, 'token.list')) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const keys = listApiKeys(teamId);
    const tokens = keys.map((k) => ({
      id: k.id,
      name: k.name,
      role: k.role,
      createdAt: k.createdAt,
      lastUsed: k.lastUsed,
      expiresAt: k.expiresAt,
    }));

    return { success: true, tokens };
  }
}
