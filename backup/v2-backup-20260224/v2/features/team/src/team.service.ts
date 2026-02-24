/**
 * TeamService - Team CRUD & settings management
 *
 * Refactored from mcp-server/src/tools/team.ts
 * (executeTeamCreate, executeTeamList, executeTeamGet, executeTeamDelete, executeTeamSettingsUpdate)
 */

import type { AuthContext, TeamRole, TeamSettings } from '@codeb/shared';
import {
  checkPermission,
  loadTeamsRegistry,
  saveTeamsRegistry,
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

export interface TeamCreateInput {
  name: string;
  slug?: string;
}

export interface TeamGetResult {
  success: boolean;
  team?: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    owner: string;
    plan: string;
    projects: string[];
    settings: TeamSettings;
  };
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
}

export interface TeamDeleteResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// Service
// ============================================================================

export class TeamService {
  constructor(private readonly logger: LoggerLike) {}

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  async create(
    input: TeamCreateInput,
    auth: AuthContext,
  ): Promise<{ success: boolean; team?: TeamGetResult['team']; ownerKey?: string; error?: string }> {
    const registry = loadTeamsRegistry();

    // Generate slug if not provided
    const slug = input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Check if slug exists
    if (registry.teams[slug]) {
      return { success: false, error: `Team slug '${slug}' already exists` };
    }

    // Create team
    const team = {
      id: slug,
      name: input.name,
      slug,
      createdAt: new Date().toISOString(),
      owner: auth.keyId,
      plan: 'free' as const,
      projects: [] as string[],
      settings: {
        defaultEnvironment: 'staging' as const,
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
      auth.keyId,
    );

    this.logger.info('Team created', { teamId: slug, owner: auth.keyId });

    return { success: true, team, ownerKey };
  }

  // ---------------------------------------------------------------------------
  // Get
  // ---------------------------------------------------------------------------

  async get(teamId: string, _auth: AuthContext): Promise<TeamGetResult> {
    const registry = loadTeamsRegistry();
    const team = registry.teams[teamId];

    if (!team) {
      return { success: false, error: `Team '${teamId}' not found` };
    }

    // Get members from API keys
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

    return { success: true, team, members };
  }

  // ---------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------

  async list(auth: AuthContext): Promise<{ success: boolean; teams?: TeamGetResult['team'][]; error?: string }> {
    const registry = loadTeamsRegistry();

    // Filter teams by membership (based on API keys)
    const userTeams = Object.values(registry.teams).filter(
      (team) => team.id === auth.teamId || auth.role === 'owner',
    );

    return { success: true, teams: userTeams };
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async delete(teamId: string, auth: AuthContext): Promise<TeamDeleteResult> {
    if (!checkPermission(auth, 'team.delete')) {
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

    this.logger.info('Team deleted', { teamId, deletedBy: auth.keyId });

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Update Settings
  // ---------------------------------------------------------------------------

  async updateSettings(
    teamId: string,
    settings: Partial<TeamSettings>,
    auth: AuthContext,
  ): Promise<{ success: boolean; settings?: TeamSettings; error?: string }> {
    if (!checkPermission(auth, 'team.settings')) {
      return { success: false, error: 'Insufficient permissions' };
    }

    const registry = loadTeamsRegistry();
    const team = registry.teams[teamId];

    if (!team) {
      return { success: false, error: `Team '${teamId}' not found` };
    }

    // Merge settings
    team.settings = {
      ...team.settings,
      ...settings,
    };

    saveTeamsRegistry(registry);

    this.logger.info('Team settings updated', { teamId, updatedBy: auth.keyId });

    return { success: true, settings: team.settings };
  }
}
