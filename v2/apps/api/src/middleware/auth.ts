/**
 * @codeb/api - Authentication Middleware
 *
 * Extracts X-API-Key header, verifies via @codeb/auth,
 * and attaches AuthContext to the request object.
 *
 * Public routes (/health, /metrics) skip authentication.
 */

import type { Request, Response, NextFunction } from 'express';
import type { AuthContext } from '@codeb/shared';

// ============================================================================
// Types
// ============================================================================

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
  correlationId?: string;
}

// ============================================================================
// Auth Middleware Factory
// ============================================================================

export function createAuthMiddleware() {
  return async function authMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const apiKey = req.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      res.status(401).json({
        success: false,
        error: 'API key required. Use X-API-Key header.',
      });
      return;
    }

    try {
      // Lazy import to avoid circular dependencies during init
      const authModule = await import('@codeb/auth');
      const authContext = authModule.verifyApiKey(apiKey);

      if (!authContext) {
        res.status(401).json({
          success: false,
          error: 'Invalid API key',
        });
        return;
      }

      req.auth = authContext;
      next();
    } catch (error) {
      // If @codeb/auth is not yet available, fall back to a basic check
      console.warn('[AUTH] Auth module not available, using degraded mode');
      res.status(503).json({
        success: false,
        error: 'Authentication service unavailable',
      });
    }
  };
}

// ============================================================================
// Permission Check Helper
// ============================================================================

/**
 * Check if the authenticated user has the required permission.
 * Owner role has all permissions.
 */
export async function checkPermission(
  auth: AuthContext,
  permission: string,
): Promise<boolean> {
  try {
    const authModule = await import('@codeb/auth');
    return authModule.checkPermission(auth, permission);
  } catch {
    // Fallback: owner and admin have all permissions
    if (auth.role === 'owner' || auth.role === 'admin') {
      return true;
    }

    // Basic role-based check
    const rolePermissions: Record<string, string[]> = {
      member: [
        'deploy.create', 'deploy.promote', 'deploy.rollback',
        'slot.view', 'domain.view', 'project.view',
        'env.read', 'env.write',
      ],
      viewer: ['slot.view', 'domain.view', 'project.view', 'env.read'],
    };

    const allowed = rolePermissions[auth.role] || [];
    return allowed.includes(permission);
  }
}

export type { AuthContext };
