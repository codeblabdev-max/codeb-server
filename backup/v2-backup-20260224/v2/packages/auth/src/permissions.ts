/**
 * @codeb/auth - Permission Definitions & Role Hierarchy
 * Based on mcp-server/src/lib/auth.ts
 */

import type { TeamRole, AuthContext } from '@codeb/shared';

// ============================================================================
// Role Hierarchy (higher index = more permissions)
// ============================================================================

export const ROLE_HIERARCHY: TeamRole[] = ['viewer', 'member', 'admin', 'owner'];

// ============================================================================
// Permission Definitions
// ============================================================================

export const PERMISSIONS: Record<string, TeamRole> = {
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
  'env.read': 'viewer',
  'env.write': 'member',
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
// Permission Checks
// ============================================================================

/** Check if a role has permission for an action */
export function hasPermission(role: TeamRole, action: string): boolean {
  const requiredRole = PERMISSIONS[action];
  if (!requiredRole) return false;

  const roleIndex = ROLE_HIERARCHY.indexOf(role);
  const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole);

  return roleIndex >= requiredIndex;
}

/** Check if auth context has permission (respects scopes) */
export function checkPermission(auth: AuthContext, action: string): boolean {
  // Check scopes first
  if (!auth.scopes.includes('*') && !auth.scopes.includes(action)) {
    return false;
  }

  return hasPermission(auth.role, action);
}

/** Get all permissions for a given role */
export function getPermissions(role: TeamRole): string[] {
  const roleIndex = ROLE_HIERARCHY.indexOf(role);

  return Object.entries(PERMISSIONS)
    .filter(([_, requiredRole]) => {
      const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole);
      return roleIndex >= requiredIndex;
    })
    .map(([action]) => action);
}
