/**
 * @codeb/api - Audit Log Handler
 *
 * GET /api/audit - Query audit logs with pagination.
 * Supports teamId filtering and role-based access.
 *
 * Refactored from mcp-server/src/index.ts GET /api/audit route.
 */

import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { checkPermission } from '../middleware/auth.js';

// ============================================================================
// Handler Factory
// ============================================================================

export function createAuditHandler() {
  return async function auditHandler(
    req: AuthenticatedRequest,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const authContext = req.auth!;

    // Check permission
    const hasPermission = await checkPermission(authContext, 'logs.view');

    if (!hasPermission) {
      res.status(403).json({
        success: false,
        error: 'Permission denied: logs.view required',
      });
      return;
    }

    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
      const offset = parseInt(req.query.offset as string) || 0;
      const teamOnly = req.query.teamOnly !== 'false' && authContext.role !== 'owner';

      try {
        const db = await import('@codeb/db');
        const { logs, total } = await db.AuditLogRepo.findByTeam(
          teamOnly ? authContext.teamId : '*',
          { limit, offset },
        );

        res.json({
          success: true,
          data: logs,
          total,
          limit,
          offset,
        });
      } catch {
        // DB not available - return empty
        res.json({
          success: true,
          data: [],
          total: 0,
          limit,
          offset,
          message: 'Audit log database not available',
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
