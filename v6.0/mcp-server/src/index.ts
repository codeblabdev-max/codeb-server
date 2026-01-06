/**
 * CodeB v6.0 - Unified HTTP API Server
 * Combines v3.x HTTP API + v5.0 MCP features
 *
 * - Team-based authentication (Vercel style)
 * - Blue-Green deployment with Quadlet + systemd
 * - SSH Connection Pool (Admin only)
 * - Rate limiting and audit logging
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomBytes } from 'crypto';
import type { AuthContext, TeamRole } from './lib/types.js';
import { auth, checkRateLimit } from './lib/auth.js';

// Tools - Team Management
import {
  teamCreateTool,
  teamListTool,
  teamGetTool,
  teamDeleteTool,
  memberInviteTool,
  memberRemoveTool,
  memberListTool,
  teamSettingsTool,
  tokenCreateTool,
  tokenRevokeTool,
  tokenListTool,
} from './tools/team.js';

// Tools - Blue-Green Deployment
import { deployTool } from './tools/deploy.js';
import { promoteTool } from './tools/promote.js';
import { rollbackTool } from './tools/rollback.js';
import { slotStatusTool, slotCleanupTool, slotListTool } from './tools/slot.js';

// Tools - Edge Functions
import {
  edgeDeployTool,
  edgeListTool,
  edgeLogsTool,
  edgeDeleteTool,
  edgeInvokeTool,
  edgeMetricsTool,
} from './tools/edge.js';

// Tools - Analytics
import {
  analyticsOverviewTool,
  analyticsWebVitalsTool,
  analyticsDeploymentsTool,
  analyticsRealtimeTool,
  analyticsSpeedInsightsTool,
} from './tools/analytics.js';

// Tools - Migration (Legacy -> v6.0)
import {
  migrateDetectTool,
  migratePlanTool,
  migrateExecuteTool,
  migrateRollbackTool,
} from './tools/migrate.js';

// Tools - ENV Migration
import {
  envMigrateTool,
  envScanTool,
  envRestoreTool,
  envBackupListTool,
} from './tools/env-migrate.js';

// Tools - Safe Zero-Downtime Migration
import {
  safeMigrateTool,
  safeMigrateRollbackTool,
  generateWorkflowTool,
} from './tools/migrate-safe.js';

// ============================================================================
// Configuration
// ============================================================================

const PORT = process.env.PORT || 9101;
const VERSION = '6.0.0';

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// ============================================================================
// Types
// ============================================================================

interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

// ============================================================================
// Authentication Middleware
// ============================================================================

function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({
      success: false,
      error: 'API key required. Use X-API-Key header.',
    });
    return;
  }

  const authContext = auth.verifyApiKey(apiKey);

  if (!authContext) {
    res.status(401).json({
      success: false,
      error: 'Invalid API key',
    });
    return;
  }

  // Rate limiting
  const rateLimit = checkRateLimit(authContext.keyId);
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
  res.setHeader('X-RateLimit-Reset', rateLimit.resetAt.toString());

  if (!rateLimit.allowed) {
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
    });
    return;
  }

  req.auth = authContext;
  next();
}

// ============================================================================
// Audit Logging
// ============================================================================

interface AuditLog {
  id: string;
  timestamp: string;
  teamId: string;
  keyId: string;
  role: TeamRole;
  action: string;
  params: Record<string, unknown>;
  success: boolean;
  duration: number;
  ip: string;
  error?: string;
}

const auditLogs: AuditLog[] = [];
const MAX_AUDIT_LOGS = 10000;

function logAudit(
  auth: AuthContext,
  action: string,
  params: Record<string, unknown>,
  success: boolean,
  duration: number,
  ip: string,
  error?: string
): void {
  const log: AuditLog = {
    id: randomBytes(8).toString('hex'),
    timestamp: new Date().toISOString(),
    teamId: auth.teamId,
    keyId: auth.keyId,
    role: auth.role,
    action,
    params,
    success,
    duration,
    ip,
    error,
  };

  auditLogs.unshift(log);

  // Trim old logs
  if (auditLogs.length > MAX_AUDIT_LOGS) {
    auditLogs.length = MAX_AUDIT_LOGS;
  }
}

// ============================================================================
// Tool Registry
// ============================================================================

const TOOLS: Record<string, {
  handler: (params: any, auth: AuthContext) => Promise<any>;
  permission: string;
}> = {
  // Team management
  team_create: {
    handler: (p, a) => teamCreateTool.execute(p, a),
    permission: 'team.create',
  },
  team_list: {
    handler: (_p, a) => teamListTool.execute(a),
    permission: 'team.view',
  },
  team_get: {
    handler: (p, a) => teamGetTool.execute(p.teamId, a),
    permission: 'team.view',
  },
  team_delete: {
    handler: (p, a) => teamDeleteTool.execute(p.teamId, a),
    permission: 'team.delete',
  },
  team_settings: {
    handler: (p, a) => teamSettingsTool.execute(p, a),
    permission: 'team.settings',
  },

  // Member management
  member_invite: {
    handler: (p, a) => memberInviteTool.execute(p, a),
    permission: 'member.invite',
  },
  member_remove: {
    handler: (p, a) => memberRemoveTool.execute(p, a),
    permission: 'member.remove',
  },
  member_list: {
    handler: (p, a) => memberListTool.execute(p.teamId, a),
    permission: 'member.list',
  },

  // Token management
  token_create: {
    handler: (p, a) => tokenCreateTool.execute(p, a),
    permission: 'token.create',
  },
  token_revoke: {
    handler: (p, a) => tokenRevokeTool.execute(p, a),
    permission: 'token.revoke.own',
  },
  token_list: {
    handler: (p, a) => tokenListTool.execute(p.teamId, a),
    permission: 'token.list',
  },

  // Blue-Green Deployment
  deploy: {
    handler: (p, a) => deployTool.execute(p, a),
    permission: 'deploy.create',
  },
  deploy_project: {
    handler: (p, a) => deployTool.execute(p, a),
    permission: 'deploy.create',
  },
  promote: {
    handler: (p, a) => promoteTool.execute(p, a),
    permission: 'deploy.promote',
  },
  slot_promote: {
    handler: (p, a) => promoteTool.execute(p, a),
    permission: 'deploy.promote',
  },
  rollback: {
    handler: (p, a) => rollbackTool.execute(p, a),
    permission: 'deploy.rollback',
  },

  // Slot Management
  slot_status: {
    handler: (p, a) => slotStatusTool.execute(p, a),
    permission: 'slot.view',
  },
  slot_cleanup: {
    handler: (p, a) => slotCleanupTool.execute(p, a),
    permission: 'slot.cleanup',
  },
  slot_list: {
    handler: (p, a) => slotListTool.execute(p, a),
    permission: 'slot.view',
  },

  // Edge Functions
  edge_deploy: {
    handler: (p, a) => edgeDeployTool.execute(p, a),
    permission: 'deploy.create',
  },
  edge_list: {
    handler: (p, a) => edgeListTool.execute(p, a),
    permission: 'project.view',
  },
  edge_logs: {
    handler: (p, a) => edgeLogsTool.execute(p, a),
    permission: 'logs.view',
  },
  edge_delete: {
    handler: (p, a) => edgeDeleteTool.execute(p, a),
    permission: 'deploy.create',
  },
  edge_invoke: {
    handler: (p, a) => edgeInvokeTool.execute(p, a),
    permission: 'deploy.create',
  },
  edge_metrics: {
    handler: (p, a) => edgeMetricsTool.execute(p, a),
    permission: 'metrics.view',
  },

  // Analytics
  analytics_overview: {
    handler: (p, a) => analyticsOverviewTool.execute(p, a),
    permission: 'metrics.view',
  },
  analytics_webvitals: {
    handler: (p, a) => analyticsWebVitalsTool.execute(p, a),
    permission: 'metrics.view',
  },
  analytics_deployments: {
    handler: (p, a) => analyticsDeploymentsTool.execute(p, a),
    permission: 'metrics.view',
  },
  analytics_realtime: {
    handler: (p, a) => analyticsRealtimeTool.execute(p, a),
    permission: 'metrics.view',
  },
  analytics_speed_insights: {
    handler: (p, a) => analyticsSpeedInsightsTool.execute(p, a),
    permission: 'metrics.view',
  },

  // Migration (Legacy -> v6.0)
  migrate_detect: {
    handler: (_p, a) => migrateDetectTool.execute(_p, a),
    permission: 'deploy.create',
  },
  migrate_plan: {
    handler: (p, a) => migratePlanTool.execute(p, a),
    permission: 'deploy.create',
  },
  migrate_execute: {
    handler: (p, a) => migrateExecuteTool.execute(p, a),
    permission: 'deploy.create',
  },
  migrate_rollback: {
    handler: (p, a) => migrateRollbackTool.execute(p, a),
    permission: 'deploy.create',
  },

  // ENV Management
  env_migrate: {
    handler: (p, a) => envMigrateTool.execute(p, a),
    permission: 'deploy.create',
  },
  env_scan: {
    handler: (_p, a) => envScanTool.execute(a),
    permission: 'project.view',
  },
  env_restore: {
    handler: (p, a) => envRestoreTool.execute(p, a),
    permission: 'deploy.create',
  },
  env_backup_list: {
    handler: (p, a) => envBackupListTool.execute(p.projectName, p.environment, a),
    permission: 'project.view',
  },

  // Safe Zero-Downtime Migration (Recommended)
  migrate_safe: {
    handler: (p, a) => safeMigrateTool.execute(p, a),
    permission: 'deploy.create',
  },
  migrate_safe_rollback: {
    handler: (p, a) => safeMigrateRollbackTool.execute(p, a),
    permission: 'deploy.create',
  },
  migrate_generate_workflow: {
    handler: (p, _a) => generateWorkflowTool.execute(p),
    permission: 'project.view',
  },

  // TODO: Add domain tools
};

// ============================================================================
// Routes
// ============================================================================

// Health check (no auth required)
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    version: VERSION,
    timestamp: new Date().toISOString(),
  });
});

// API info (no auth required)
app.get('/api', (_req, res) => {
  res.json({
    name: 'CodeB API',
    version: VERSION,
    tools: Object.keys(TOOLS),
  });
});

// Tool execution endpoint
app.post('/api/tool', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const startTime = Date.now();
  const { tool, params = {} } = req.body;
  const authContext = req.auth!;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  if (!tool) {
    res.status(400).json({
      success: false,
      error: 'Tool name required',
    });
    return;
  }

  const toolDef = TOOLS[tool];

  if (!toolDef) {
    res.status(404).json({
      success: false,
      error: `Unknown tool: ${tool}`,
      availableTools: Object.keys(TOOLS),
    });
    return;
  }

  // Check permission
  if (!auth.checkPermission(authContext, toolDef.permission)) {
    const duration = Date.now() - startTime;
    logAudit(authContext, tool, params, false, duration, ip, 'Permission denied');

    res.status(403).json({
      success: false,
      error: `Permission denied: ${toolDef.permission} required`,
    });
    return;
  }

  try {
    const result = await toolDef.handler(params, authContext);
    const duration = Date.now() - startTime;

    logAudit(authContext, tool, params, result.success, duration, ip, result.error);

    res.json({
      ...result,
      duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logAudit(authContext, tool, params, false, duration, ip, errorMessage);

    res.status(500).json({
      success: false,
      error: errorMessage,
      duration,
      timestamp: new Date().toISOString(),
    });
  }
});

// Audit logs endpoint (admin only)
app.get('/api/audit', authMiddleware, (req: AuthenticatedRequest, res) => {
  const authContext = req.auth!;

  if (!auth.checkPermission(authContext, 'logs.view')) {
    res.status(403).json({
      success: false,
      error: 'Permission denied',
    });
    return;
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
  const teamOnly = req.query.teamOnly !== 'false';

  let logs = auditLogs;

  // Filter by team if not admin
  if (teamOnly && authContext.role !== 'owner') {
    logs = logs.filter(l => l.teamId === authContext.teamId);
  }

  res.json({
    success: true,
    data: logs.slice(0, limit),
    total: logs.length,
  });
});

// ============================================================================
// Error Handler
// ============================================================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║              CodeB v${VERSION} - Unified API Server              ║
╠════════════════════════════════════════════════════════════╣
║  Port:     ${PORT}                                            ║
║  Endpoint: http://localhost:${PORT}/api/tool                  ║
║  Health:   http://localhost:${PORT}/health                    ║
╚════════════════════════════════════════════════════════════╝
  `);
});

export default app;
