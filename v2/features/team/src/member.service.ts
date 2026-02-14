/**
 * MemberService - Team member invitation, removal, and listing
 *
 * Refactored from mcp-server/src/tools/team.ts
 * (executeMemberInvite, executeMemberRemove, executeMemberList)
 */

import type { AuthContext, TeamRole } from '@codeb/shared';
import {
  checkPermission,
  loadTeamsRegistry,
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
// Types
// ============================================================================

export interface MemberInviteInput {
  teamId: string;
  email: string;
  name: string;
  role: 'admin' | 'member' | 'viewer';
}

export interface MemberInviteResult {
  success: boolean;
  member?: {
    id: string;
    email: string;
    name: string;
    role: TeamRole;
    joinedAt: string;
    invitedBy: string;
  };
  apiKey?: string;
  error?: string;
}

export interface MemberRemoveInput {
  teamId: string;
  memberId: string;
}

// ============================================================================
// Service
// ============================================================================

export class MemberService {
  constructor(private readonly logger: LoggerLike) {}

  // ---------------------------------------------------------------------------
  // Invite
  // ---------------------------------------------------------------------------

  async invite(input: MemberInviteInput, auth: AuthContext): Promise<MemberInviteResult> {
    if (!checkPermission(auth, 'member.invite')) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const registry = loadTeamsRegistry();
    const team = registry.teams[input.teamId];

    if (!team) {
      return { success: false, error: `Team '${input.teamId}' not found` };
    }

    // Cannot invite owner role
    if ((input.role as string) === 'owner') {
      return { success: false, error: 'Cannot invite with owner role' };
    }

    // Create API key for new member
    const { key, id } = createApiKey(
      {
        name: input.name,
        teamId: input.teamId,
        role: input.role,
      },
      auth.keyId,
    );

    const member = {
      id,
      email: input.email,
      name: input.name,
      role: input.role as TeamRole,
      joinedAt: new Date().toISOString(),
      invitedBy: auth.keyId,
    };

    this.logger.info('Member invited', {
      teamId: input.teamId,
      memberId: id,
      role: input.role,
      invitedBy: auth.keyId,
    });

    return { success: true, member, apiKey: key };
  }

  // ---------------------------------------------------------------------------
  // Remove
  // ---------------------------------------------------------------------------

  async remove(
    input: MemberRemoveInput,
    auth: AuthContext,
  ): Promise<{ success: boolean; error?: string }> {
    if (!checkPermission(auth, 'member.remove')) {
      return { success: false, error: 'Insufficient permissions' };
    }

    // Cannot remove owner
    const keys = listApiKeys(input.teamId);
    const targetKey = keys.find((k) => k.id === input.memberId);

    if (!targetKey) {
      return { success: false, error: 'Member not found' };
    }

    if (targetKey.role === 'owner') {
      return { success: false, error: 'Cannot remove team owner' };
    }

    revokeApiKey(input.memberId);

    this.logger.info('Member removed', {
      teamId: input.teamId,
      memberId: input.memberId,
      removedBy: auth.keyId,
    });

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
    members?: Array<{
      id: string;
      email: string;
      name: string;
      role: TeamRole;
      joinedAt: string;
      invitedBy: string;
      lastActiveAt?: string;
    }>;
    error?: string;
  }> {
    if (!checkPermission(auth, 'member.list')) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const keys = listApiKeys(teamId);
    const members = keys.map((k) => ({
      id: k.id,
      email: k.name,
      name: k.name,
      role: k.role,
      joinedAt: k.createdAt,
      invitedBy: k.createdBy,
      lastActiveAt: k.lastUsed,
    }));

    return { success: true, members };
  }
}
