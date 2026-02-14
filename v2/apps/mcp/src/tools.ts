/**
 * @codeb/mcp - MCP Tool Definitions
 *
 * 27 tools matching the CodeB HTTP API (삭제 기능 제외).
 *
 * Categories:
 * - Core Deployment (4): deploy, promote, rollback, slot_status
 * - Slot Management (2): slot_cleanup, slot_list
 * - Workflow/CI-CD (3): workflow_init, workflow_scan, workflow_generate
 * - Domain Management (2): domain_setup, domain_list
 * - ENV Management (4): env_sync, env_get, env_scan, env_restore
 * - Team Management (4): team_create, team_list, team_get, team_settings
 * - Member Management (3): member_invite, member_remove, member_list
 * - Token Management (3): token_create, token_revoke, token_list
 * - Health & Monitoring (2): health_check, scan
 */

// ============================================================================
// Tool Schema Type (MCP SDK compatible)
// ============================================================================

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const TOOLS: McpToolDefinition[] = [
  // ── Core Deployment ──────────────────────────────────────────────────────
  {
    name: 'deploy_project',
    description: 'Deploy a project to staging or production environment using Blue-Green deployment',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        environment: { type: 'string', enum: ['staging', 'production'], description: 'Target environment' },
        version: { type: 'string', description: 'Version tag (optional)' },
        image: { type: 'string', description: 'Docker image to deploy (optional)' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'slot_promote',
    description: 'Promote the inactive slot to active (switch traffic)',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        environment: { type: 'string', enum: ['staging', 'production'], description: 'Target environment' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'rollback',
    description: 'Rollback to the previous version (switch back to grace slot)',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        environment: { type: 'string', enum: ['staging', 'production'], description: 'Target environment' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'slot_status',
    description: 'Get the current status of Blue-Green deployment slots',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        environment: { type: 'string', enum: ['staging', 'production'], description: 'Target environment' },
      },
      required: ['projectName'],
    },
  },

  // ── Slot Management ────────────────────────────────────────────────────
  {
    name: 'slot_cleanup',
    description: 'Cleanup grace-period expired slots to free resources',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        environment: { type: 'string', enum: ['staging', 'production'], description: 'Target environment' },
        force: { type: 'boolean', description: 'Force cleanup even if grace period has not expired' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'slot_list',
    description: 'List all project slots across all environments',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ── Workflow Tools (CI/CD) ───────────────────────────────────────────────
  {
    name: 'workflow_init',
    description: 'Initialize project with Quadlet containers, Dockerfile, and GitHub Actions workflow',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        type: { type: 'string', enum: ['nextjs', 'remix', 'nodejs', 'python', 'go'], default: 'nextjs' },
        database: { type: 'boolean', default: true, description: 'Include PostgreSQL database' },
        redis: { type: 'boolean', default: true, description: 'Include Redis cache' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'workflow_scan',
    description: 'Scan project for existing workflow configuration and resources',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'workflow_generate',
    description: 'Generate CI/CD workflow files (GitHub Actions + Dockerfile) for a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        type: { type: 'string', enum: ['nextjs', 'remix', 'nodejs', 'python', 'go'], default: 'nextjs' },
      },
      required: ['projectName'],
    },
  },

  // ── Domain Management ────────────────────────────────────────────────────
  {
    name: 'domain_setup',
    description: 'Setup domain with DNS and SSL certificate',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        domain: { type: 'string', description: 'Domain name (e.g., myapp.codeb.kr)' },
        environment: { type: 'string', enum: ['staging', 'production'], default: 'production' },
      },
      required: ['projectName', 'domain'],
    },
  },
  {
    name: 'domain_list',
    description: 'List all domains for a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name (optional, lists all if not specified)' },
      },
    },
  },

  // ── ENV Management ───────────────────────────────────────────────────────
  {
    name: 'env_sync',
    description: 'Push/sync environment variables from local to server',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        environment: { type: 'string', enum: ['staging', 'production'], default: 'production' },
        content: { type: 'string', description: 'ENV file content (KEY=VALUE format, one per line)' },
        merge: { type: 'boolean', default: true, description: 'Merge with existing variables (true) or overwrite (false)' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'env_get',
    description: 'Get environment variables from server for a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        environment: { type: 'string', enum: ['staging', 'production'], default: 'production' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'env_scan',
    description: 'Compare local and server environment variables',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name (optional)' },
      },
    },
  },
  {
    name: 'env_restore',
    description: 'Restore environment variables from backup',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
        environment: { type: 'string', enum: ['staging', 'production'], default: 'production' },
        version: { type: 'string', enum: ['master', 'current'], default: 'master' },
      },
      required: ['projectName'],
    },
  },

  // ── Team Management ──────────────────────────────────────────────────────
  {
    name: 'team_create',
    description: 'Create a new team with owner API key',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Team name (used as team slug/ID)' },
        description: { type: 'string', description: 'Team description' },
      },
      required: ['name'],
    },
  },
  {
    name: 'team_list',
    description: 'List all teams accessible to current user',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'team_get',
    description: 'Get detailed team information including members',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: { type: 'string', description: 'Team ID to retrieve' },
      },
      required: ['teamId'],
    },
  },
  {
    name: 'team_settings',
    description: 'Update team settings (default environment, auto-promote, grace period)',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: { type: 'string', description: 'Team ID' },
        settings: {
          type: 'object',
          description: 'Settings to update',
          properties: {
            defaultEnvironment: { type: 'string', enum: ['staging', 'production'] },
            autoPromote: { type: 'boolean', description: 'Auto-promote after deploy' },
            gracePeriodHours: { type: 'number', description: 'Grace period in hours (default: 48)' },
          },
        },
      },
      required: ['teamId', 'settings'],
    },
  },

  // ── Member Management ────────────────────────────────────────────────────
  {
    name: 'member_invite',
    description: 'Invite a member to a team with a specific role',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: { type: 'string', description: 'Team ID' },
        email: { type: 'string', description: 'Member email address' },
        role: { type: 'string', enum: ['admin', 'member', 'viewer'], description: 'Role to assign' },
      },
      required: ['teamId', 'email', 'role'],
    },
  },
  {
    name: 'member_remove',
    description: 'Remove a member from a team (revokes their API key)',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: { type: 'string', description: 'Team ID' },
        memberId: { type: 'string', description: 'Member ID or email to remove' },
      },
      required: ['teamId', 'memberId'],
    },
  },
  {
    name: 'member_list',
    description: 'List all members in a team with their roles',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: { type: 'string', description: 'Team ID' },
      },
      required: ['teamId'],
    },
  },

  // ── Token Management ─────────────────────────────────────────────────────
  {
    name: 'token_create',
    description: 'Create a new API token for a team (key shown only once)',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: { type: 'string', description: 'Team ID' },
        name: { type: 'string', description: 'Token name/description' },
        role: { type: 'string', enum: ['admin', 'member', 'viewer'], description: 'Token role' },
        expiresAt: { type: 'string', description: 'Expiration date (ISO 8601 format, optional)' },
      },
      required: ['teamId', 'name', 'role'],
    },
  },
  {
    name: 'token_revoke',
    description: 'Revoke an API token (permanently disable it)',
    inputSchema: {
      type: 'object',
      properties: {
        tokenId: { type: 'string', description: 'Token ID to revoke' },
      },
      required: ['tokenId'],
    },
  },
  {
    name: 'token_list',
    description: 'List all API tokens for a team (keys are masked)',
    inputSchema: {
      type: 'object',
      properties: {
        teamId: { type: 'string', description: 'Team ID' },
      },
      required: ['teamId'],
    },
  },

  // ── Health & Monitoring ──────────────────────────────────────────────────
  {
    name: 'health_check',
    description: 'Check health status of the CodeB infrastructure',
    inputSchema: {
      type: 'object',
      properties: {
        server: { type: 'string', enum: ['app', 'streaming', 'storage', 'backup', 'all'], default: 'all' },
      },
    },
  },
  {
    name: 'scan',
    description: 'Scan project for configuration issues and deployment readiness',
    inputSchema: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: 'Project name' },
      },
      required: ['projectName'],
    },
  },
];

// ============================================================================
// MCP Tool Name → API Tool Name Mapping
// ============================================================================

export const API_TOOL_MAP: Record<string, string> = {
  deploy_project: 'deploy',
  slot_promote: 'promote',
  scan: 'workflow_scan',
};
