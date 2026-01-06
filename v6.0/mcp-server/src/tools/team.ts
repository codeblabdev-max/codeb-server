/**
 * CodeB v6.0 - Team Management Tool
 * Vercel-style team and member management
 */

import { z } from 'zod';
import type {
  Team,
  TeamRole,
  TeamMember,
  TeamSettings,
  AuthContext,
} from '../lib/types.js';
import {
  auth,
  loadTeamsRegistry,
  saveTeamsRegistry,
  createApiKey,
  revokeApiKey,
  listApiKeys,
} from '../lib/auth.js';

// ============================================================================
// Input Schemas
// ============================================================================

export const teamCreateSchema = z.object({
  name: z.string().min(1).max(50).describe('Team display name'),
  slug: z.string().min(3).max(30).regex(/^[a-z0-9-]+$/).optional()
    .describe('Team slug (auto-generated if not provided)'),
});

export const teamInviteSchema = z.object({
  teamId: z.string().describe('Team ID'),
  email: z.string().email().describe('Member email'),
  name: z.string().min(1).describe('Member name'),
  role: z.enum(['admin', 'member', 'viewer']).describe('Member role'),
});

export const teamRemoveMemberSchema = z.object({
  teamId: z.string().describe('Team ID'),
  memberId: z.string().describe('Member ID to remove'),
});

export const teamUpdateSettingsSchema = z.object({
  teamId: z.string().describe('Team ID'),
  settings: z.object({
    defaultEnvironment: z.enum(['staging', 'production', 'preview']).optional(),
    autoPromote: z.boolean().optional(),
    gracePeriodHours: z.number().min(1).max(168).optional(),
    allowedDomains: z.array(z.string()).optional(),
    notificationWebhook: z.string().url().optional(),
  }).describe('Settings to update'),
});

export const tokenCreateSchema = z.object({
  teamId: z.string().describe('Team ID'),
  name: z.string().min(1).max(50).describe('Token name'),
  role: z.enum(['admin', 'member', 'viewer']).describe('Token role'),
  expiresIn: z.number().optional().describe('Expiration in days (optional)'),
  scopes: z.array(z.string()).optional().describe('Permission scopes'),
});

export const tokenRevokeSchema = z.object({
  tokenId: z.string().describe('Token ID to revoke'),
});

// ============================================================================
// Team CRUD
// ============================================================================

export interface TeamCreateResult {
  success: boolean;
  team?: Team;
  ownerKey?: string; // Only returned on creation
  error?: string;
}

export async function executeTeamCreate(
  input: z.infer<typeof teamCreateSchema>,
  authContext: AuthContext
): Promise<TeamCreateResult> {
  const registry = loadTeamsRegistry();

  // Generate slug if not provided
  const slug = input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Check if slug exists
  if (registry.teams[slug]) {
    return { success: false, error: `Team slug '${slug}' already exists` };
  }

  // Create team
  const team: Team = {
    id: slug,
    name: input.name,
    slug,
    createdAt: new Date().toISOString(),
    owner: authContext.keyId, // Creator becomes owner
    plan: 'free',
    projects: [],
    settings: {
      defaultEnvironment: 'staging',
      autoPromote: false,
      gracePeriodHours: 48,
    },
  };

  registry.teams[slug] = team;
  saveTeamsRegistry(registry);

  // Create owner API key
  const { key: ownerKey } = createApiKey(
    {
      name: `${input.name} Owner Key`,
      teamId: slug,
      role: 'owner',
    },
    authContext.keyId
  );

  return {
    success: true,
    team,
    ownerKey,
  };
}

export interface TeamListResult {
  success: boolean;
  teams?: Team[];
  error?: string;
}

export async function executeTeamList(authContext: AuthContext): Promise<TeamListResult> {
  const registry = loadTeamsRegistry();

  // Filter teams by membership (based on API keys)
  const userTeams = Object.values(registry.teams).filter(
    team => team.id === authContext.teamId || authContext.role === 'owner'
  );

  return {
    success: true,
    teams: userTeams,
  };
}

export interface TeamGetResult {
  success: boolean;
  team?: Team;
  members?: TeamMember[];
  error?: string;
}

export async function executeTeamGet(
  teamId: string,
  _authContext: AuthContext
): Promise<TeamGetResult> {
  const registry = loadTeamsRegistry();
  const team = registry.teams[teamId];

  if (!team) {
    return { success: false, error: `Team '${teamId}' not found` };
  }

  // Get members from API keys
  const keys = listApiKeys(teamId);
  const members: TeamMember[] = keys.map(k => ({
    id: k.id,
    email: k.name, // Using name as identifier
    name: k.name,
    role: k.role,
    joinedAt: k.createdAt,
    invitedBy: k.createdBy,
    lastActiveAt: k.lastUsed,
  }));

  return {
    success: true,
    team,
    members,
  };
}

export interface TeamDeleteResult {
  success: boolean;
  error?: string;
}

export async function executeTeamDelete(
  teamId: string,
  authContext: AuthContext
): Promise<TeamDeleteResult> {
  if (!auth.checkPermission(authContext, 'team.delete')) {
    return { success: false, error: 'Insufficient permissions' };
  }

  const registry = loadTeamsRegistry();

  if (!registry.teams[teamId]) {
    return { success: false, error: `Team '${teamId}' not found` };
  }

  // Check if team has projects
  if (registry.teams[teamId].projects.length > 0) {
    return {
      success: false,
      error: 'Cannot delete team with active projects. Remove projects first.',
    };
  }

  // Revoke all team API keys
  const keys = listApiKeys(teamId);
  for (const key of keys) {
    revokeApiKey(key.id);
  }

  delete registry.teams[teamId];
  saveTeamsRegistry(registry);

  return { success: true };
}

// ============================================================================
// Member Management
// ============================================================================

export interface MemberInviteResult {
  success: boolean;
  member?: TeamMember;
  apiKey?: string; // Only returned on invite
  error?: string;
}

export async function executeMemberInvite(
  input: z.infer<typeof teamInviteSchema>,
  authContext: AuthContext
): Promise<MemberInviteResult> {
  if (!auth.checkPermission(authContext, 'member.invite')) {
    return { success: false, error: 'Insufficient permissions' };
  }

  const registry = loadTeamsRegistry();
  const team = registry.teams[input.teamId];

  if (!team) {
    return { success: false, error: `Team '${input.teamId}' not found` };
  }

  // Cannot invite owner role (schema already prevents this, but double-check)
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
    authContext.keyId
  );

  const member: TeamMember = {
    id,
    email: input.email,
    name: input.name,
    role: input.role,
    joinedAt: new Date().toISOString(),
    invitedBy: authContext.keyId,
  };

  return {
    success: true,
    member,
    apiKey: key,
  };
}

export interface MemberRemoveResult {
  success: boolean;
  error?: string;
}

export async function executeMemberRemove(
  input: z.infer<typeof teamRemoveMemberSchema>,
  authContext: AuthContext
): Promise<MemberRemoveResult> {
  if (!auth.checkPermission(authContext, 'member.remove')) {
    return { success: false, error: 'Insufficient permissions' };
  }

  // Cannot remove owner
  const keys = listApiKeys(input.teamId);
  const targetKey = keys.find(k => k.id === input.memberId);

  if (!targetKey) {
    return { success: false, error: 'Member not found' };
  }

  if (targetKey.role === 'owner') {
    return { success: false, error: 'Cannot remove team owner' };
  }

  revokeApiKey(input.memberId);

  return { success: true };
}

export interface MemberListResult {
  success: boolean;
  members?: TeamMember[];
  error?: string;
}

export async function executeMemberList(
  teamId: string,
  authContext: AuthContext
): Promise<MemberListResult> {
  if (!auth.checkPermission(authContext, 'member.list')) {
    return { success: false, error: 'Insufficient permissions' };
  }

  const keys = listApiKeys(teamId);
  const members: TeamMember[] = keys.map(k => ({
    id: k.id,
    email: k.name,
    name: k.name,
    role: k.role,
    joinedAt: k.createdAt,
    invitedBy: k.createdBy,
    lastActiveAt: k.lastUsed,
  }));

  return {
    success: true,
    members,
  };
}

// ============================================================================
// Settings Management
// ============================================================================

export interface TeamSettingsUpdateResult {
  success: boolean;
  settings?: TeamSettings;
  error?: string;
}

export async function executeTeamSettingsUpdate(
  input: z.infer<typeof teamUpdateSettingsSchema>,
  authContext: AuthContext
): Promise<TeamSettingsUpdateResult> {
  if (!auth.checkPermission(authContext, 'team.settings')) {
    return { success: false, error: 'Insufficient permissions' };
  }

  const registry = loadTeamsRegistry();
  const team = registry.teams[input.teamId];

  if (!team) {
    return { success: false, error: `Team '${input.teamId}' not found` };
  }

  // Merge settings
  team.settings = {
    ...team.settings,
    ...input.settings,
  };

  saveTeamsRegistry(registry);

  return {
    success: true,
    settings: team.settings,
  };
}

// ============================================================================
// Token Management
// ============================================================================

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

export async function executeTokenCreate(
  input: z.infer<typeof tokenCreateSchema>,
  authContext: AuthContext
): Promise<TokenCreateResult> {
  if (!auth.checkPermission(authContext, 'token.create')) {
    return { success: false, error: 'Insufficient permissions' };
  }

  // Cannot create token with higher role
  const roleHierarchy: TeamRole[] = ['viewer', 'member', 'admin', 'owner'];
  const myRoleIndex = roleHierarchy.indexOf(authContext.role);
  const requestedRoleIndex = roleHierarchy.indexOf(input.role);

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
    authContext.keyId
  );

  return {
    success: true,
    token: {
      id,
      key,
      name: input.name,
      role: input.role,
      expiresAt,
    },
  };
}

export interface TokenRevokeResult {
  success: boolean;
  error?: string;
}

export async function executeTokenRevoke(
  input: z.infer<typeof tokenRevokeSchema>,
  authContext: AuthContext
): Promise<TokenRevokeResult> {
  const keys = listApiKeys(authContext.teamId);
  const targetKey = keys.find(k => k.id === input.tokenId);

  if (!targetKey) {
    return { success: false, error: 'Token not found' };
  }

  // Check permission
  const isOwnToken = targetKey.createdBy === authContext.keyId;
  if (isOwnToken) {
    if (!auth.checkPermission(authContext, 'token.revoke.own')) {
      return { success: false, error: 'Insufficient permissions' };
    }
  } else {
    if (!auth.checkPermission(authContext, 'token.revoke.any')) {
      return { success: false, error: 'Insufficient permissions' };
    }
  }

  revokeApiKey(input.tokenId);

  return { success: true };
}

export interface TokenListResult {
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
}

export async function executeTokenList(
  teamId: string,
  authContext: AuthContext
): Promise<TokenListResult> {
  if (!auth.checkPermission(authContext, 'token.list')) {
    return { success: false, error: 'Insufficient permissions' };
  }

  const keys = listApiKeys(teamId);
  const tokens = keys.map(k => ({
    id: k.id,
    name: k.name,
    role: k.role,
    createdAt: k.createdAt,
    lastUsed: k.lastUsed,
    expiresAt: k.expiresAt,
  }));

  return {
    success: true,
    tokens,
  };
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const teamCreateTool = {
  name: 'team_create',
  description: 'Create a new team',
  inputSchema: teamCreateSchema,
  execute: executeTeamCreate,
};

export const teamListTool = {
  name: 'team_list',
  description: 'List teams',
  inputSchema: z.object({}),
  execute: executeTeamList,
};

export const teamGetTool = {
  name: 'team_get',
  description: 'Get team details',
  inputSchema: z.object({ teamId: z.string() }),
  execute: executeTeamGet,
};

export const teamDeleteTool = {
  name: 'team_delete',
  description: 'Delete a team',
  inputSchema: z.object({ teamId: z.string() }),
  execute: executeTeamDelete,
};

export const memberInviteTool = {
  name: 'member_invite',
  description: 'Invite a member to team',
  inputSchema: teamInviteSchema,
  execute: executeMemberInvite,
};

export const memberRemoveTool = {
  name: 'member_remove',
  description: 'Remove a member from team',
  inputSchema: teamRemoveMemberSchema,
  execute: executeMemberRemove,
};

export const memberListTool = {
  name: 'member_list',
  description: 'List team members',
  inputSchema: z.object({ teamId: z.string() }),
  execute: executeMemberList,
};

export const teamSettingsTool = {
  name: 'team_settings',
  description: 'Update team settings',
  inputSchema: teamUpdateSettingsSchema,
  execute: executeTeamSettingsUpdate,
};

export const tokenCreateTool = {
  name: 'token_create',
  description: 'Create a new API token',
  inputSchema: tokenCreateSchema,
  execute: executeTokenCreate,
};

export const tokenRevokeTool = {
  name: 'token_revoke',
  description: 'Revoke an API token',
  inputSchema: tokenRevokeSchema,
  execute: executeTokenRevoke,
};

export const tokenListTool = {
  name: 'token_list',
  description: 'List API tokens',
  inputSchema: z.object({ teamId: z.string() }),
  execute: executeTokenList,
};
