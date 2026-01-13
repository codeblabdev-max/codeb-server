/**
 * CodeB v7.0 - Unified HTTP API Server
 *
 * Features:
 * - Team-based authentication (Vercel style)
 * - Blue-Green deployment with Quadlet + systemd
 * - SSH Connection Pool (Admin only)
 * - Rate limiting and audit logging
 * - PostgreSQL data persistence
 * - Prometheus metrics
 * - Real-time log streaming (SSE)
 * - Domain management (PowerDNS + Caddy)
 * - Claude Code 2.1 Integration (Skills, Hooks, Agent)
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { AuthContext, TeamRole } from './lib/types.js';
import { auth, checkRateLimit } from './lib/auth.js';
import { runMigrations, AuditLogRepo, getPool, closePool } from './lib/database.js';
import { logger, createContextualLogger, generateCorrelationId, logHttpRequest } from './lib/logger.js';
import {
  register as metricsRegistry,
  httpRequestsTotal,
  httpRequestDuration,
  httpActiveRequests,
  recordToolCall,
  authFailures,
  rateLimitExceeded,
} from './lib/metrics.js';
import { logStream, createLogEntry } from './lib/log-stream.js';

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

// Tools - Domain Management
import {
  domainSetupTool,
  domainVerifyTool,
  domainListTool,
  domainDeleteTool,
  sslStatusTool,
} from './tools/domain.js';

// Tools - Workflow (Project Initialization)
import {
  workflowInitTool,
  workflowScanTool,
} from './tools/workflow.js';

// ============================================================================
// Configuration
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// VERSION 파일에서 동적 로딩 (SSOT - Single Source of Truth)
function getVersion(): string {
  try {
    // 빌드 후: dist/index.js → ../VERSION
    // 개발 중: src/index.ts → ../../VERSION
    const paths = [
      join(__dirname, '..', 'VERSION'),
      join(__dirname, '..', '..', 'VERSION'),
      join(process.cwd(), 'VERSION'),
    ];

    for (const p of paths) {
      try {
        return readFileSync(p, 'utf-8').trim();
      } catch {
        continue;
      }
    }
    return '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const PORT = process.env.PORT || 9101;
const VERSION = getVersion();
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============================================================================
// Request Logging Middleware
// ============================================================================

app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const correlationId = generateCorrelationId();

  // Add correlation ID to response headers
  res.setHeader('X-Correlation-ID', correlationId);
  (req as any).correlationId = correlationId;

  httpActiveRequests.inc();

  res.on('finish', () => {
    httpActiveRequests.dec();
    const duration = Date.now() - startTime;

    // Log HTTP request
    logHttpRequest({
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      correlationId,
    });

    // Prometheus metrics
    const route = req.route?.path || req.url.split('?')[0];
    httpRequestsTotal.inc({ method: req.method, route, status_code: res.statusCode.toString() });
    httpRequestDuration.observe(
      { method: req.method, route, status_code: res.statusCode.toString() },
      duration / 1000
    );
  });

  next();
});

// ============================================================================
// Types
// ============================================================================

interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
  correlationId?: string;
}

// ============================================================================
// Authentication Middleware
// ============================================================================

function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    authFailures.inc({ reason: 'missing_key' });
    res.status(401).json({
      success: false,
      error: 'API key required. Use X-API-Key header.',
    });
    return;
  }

  const authContext = auth.verifyApiKey(apiKey);

  if (!authContext) {
    authFailures.inc({ reason: 'invalid_key' });
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
    rateLimitExceeded.inc({ key_id: authContext.keyId.slice(0, 8) });
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
// Tool Registry
// ============================================================================

const TOOLS: Record<string, {
  handler: (params: any, auth: AuthContext) => Promise<any>;
  permission: string;
}> = {
  // Team management
  team_create: { handler: (p, a) => teamCreateTool.execute(p, a), permission: 'team.create' },
  team_list: { handler: (_p, a) => teamListTool.execute(a), permission: 'team.view' },
  team_get: { handler: (p, a) => teamGetTool.execute(p.teamId, a), permission: 'team.view' },
  team_delete: { handler: (p, a) => teamDeleteTool.execute(p.teamId, a), permission: 'team.delete' },
  team_settings: { handler: (p, a) => teamSettingsTool.execute(p, a), permission: 'team.settings' },

  // Member management
  member_invite: { handler: (p, a) => memberInviteTool.execute(p, a), permission: 'member.invite' },
  member_remove: { handler: (p, a) => memberRemoveTool.execute(p, a), permission: 'member.remove' },
  member_list: { handler: (p, a) => memberListTool.execute(p.teamId, a), permission: 'member.list' },

  // Token management
  token_create: { handler: (p, a) => tokenCreateTool.execute(p, a), permission: 'token.create' },
  token_revoke: { handler: (p, a) => tokenRevokeTool.execute(p, a), permission: 'token.revoke.own' },
  token_list: { handler: (p, a) => tokenListTool.execute(p.teamId, a), permission: 'token.list' },

  // Blue-Green Deployment
  deploy: { handler: (p, a) => deployTool.execute(p, a), permission: 'deploy.create' },
  deploy_project: { handler: (p, a) => deployTool.execute(p, a), permission: 'deploy.create' },
  promote: { handler: (p, a) => promoteTool.execute(p, a), permission: 'deploy.promote' },
  slot_promote: { handler: (p, a) => promoteTool.execute(p, a), permission: 'deploy.promote' },
  rollback: { handler: (p, a) => rollbackTool.execute(p, a), permission: 'deploy.rollback' },

  // Slot Management
  slot_status: { handler: (p, a) => slotStatusTool.execute(p, a), permission: 'slot.view' },
  slot_cleanup: { handler: (p, a) => slotCleanupTool.execute(p, a), permission: 'slot.cleanup' },
  slot_list: { handler: (p, a) => slotListTool.execute(p, a), permission: 'slot.view' },

  // Domain Management
  domain_setup: { handler: (p, a) => domainSetupTool.execute(p, a), permission: 'domain.manage' },
  domain_verify: { handler: (p, a) => domainVerifyTool.execute(p, a), permission: 'domain.view' },
  domain_list: { handler: (p, a) => domainListTool.execute(p, a), permission: 'domain.view' },
  domain_delete: { handler: (p, a) => domainDeleteTool.execute(p, a), permission: 'domain.manage' },
  ssl_status: { handler: (p, a) => sslStatusTool.execute(p, a), permission: 'domain.view' },

  // Workflow (Project Initialization)
  workflow_init: { handler: (p, a) => workflowInitTool.execute(p, a), permission: 'deploy.create' },
  workflow_scan: { handler: (p, a) => workflowScanTool.execute(p, a), permission: 'project.view' },
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
    uptime: process.uptime(),
  });
});

// API info (no auth required)
app.get('/api', (_req, res) => {
  res.json({
    name: 'CodeB API',
    version: VERSION,
    tools: Object.keys(TOOLS),
    features: [
      'blue-green-deployment',
      'team-management',
      'edge-functions',
      'analytics',
      'domain-management',
      'log-streaming',
    ],
  });
});

// Prometheus metrics (no auth required, but should be protected in production)
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', metricsRegistry.contentType);
    const coreMetrics = await metricsRegistry.metrics();
    res.end(coreMetrics);
  } catch (error) {
    res.status(500).end();
  }
});

// Log streaming endpoint (SSE)
app.get('/api/logs/stream', authMiddleware, (req: AuthenticatedRequest, res) => {
  if (!auth.checkPermission(req.auth!, 'logs.view')) {
    res.status(403).json({ success: false, error: 'Permission denied' });
    return;
  }

  const clientId = generateCorrelationId();
  const filters = {
    projectName: req.query.project as string,
    environment: req.query.environment as string,
    slot: req.query.slot as string,
    level: req.query.level as string,
  };

  logStream.addClient(clientId, res, filters);
});

// Tool execution endpoint
app.post('/api/tool', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const startTime = Date.now();
  const { tool, params = {} } = req.body;
  const authContext = req.auth!;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const correlationId = (req as any).correlationId;

  const log = createContextualLogger({
    correlationId,
    teamId: authContext.teamId,
    keyId: authContext.keyId,
    role: authContext.role,
    ip,
  });

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
    log.audit(tool, {
      resource: 'tool',
      resourceId: tool,
      success: false,
      duration,
      params,
      error: 'Permission denied',
    });

    res.status(403).json({
      success: false,
      error: `Permission denied: ${toolDef.permission} required`,
    });
    return;
  }

  try {
    log.info(`Executing tool: ${tool}`, { params: Object.keys(params) });

    const result = await toolDef.handler(params, authContext);
    const duration = Date.now() - startTime;

    // Record metrics
    recordToolCall(tool, result.success ? 'success' : 'failed', authContext.role, duration / 1000);

    // Audit log to database
    try {
      await AuditLogRepo.create({
        timestamp: new Date().toISOString(),
        teamId: authContext.teamId,
        userId: authContext.keyId,
        action: tool,
        resource: 'tool',
        resourceId: tool,
        details: params,
        ip,
        userAgent: req.get('user-agent') || '',
        duration,
        success: result.success,
        error: result.error,
      });
    } catch (dbError) {
      log.error('Failed to write audit log to database', { error: String(dbError) });
    }

    log.audit(tool, {
      resource: 'tool',
      resourceId: tool,
      success: result.success,
      duration,
      params,
      error: result.error,
    });

    // Broadcast to log stream
    logStream.broadcast(
      createLogEntry(
        result.success ? 'info' : 'error',
        'api',
        `Tool ${tool} ${result.success ? 'succeeded' : 'failed'}`,
        {
          projectName: params.projectName,
          environment: params.environment,
          metadata: { tool, duration, success: result.success },
        }
      )
    );

    res.json({
      ...result,
      duration,
      timestamp: new Date().toISOString(),
      correlationId,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    recordToolCall(tool, 'failed', authContext.role, duration / 1000);

    log.error(`Tool execution failed: ${tool}`, { error: errorMessage, duration });

    res.status(500).json({
      success: false,
      error: errorMessage,
      duration,
      timestamp: new Date().toISOString(),
      correlationId,
    });
  }
});

// Audit logs endpoint
app.get('/api/audit', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const authContext = req.auth!;

  if (!auth.checkPermission(authContext, 'logs.view')) {
    res.status(403).json({ success: false, error: 'Permission denied' });
    return;
  }

  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;
    const teamOnly = req.query.teamOnly !== 'false' && authContext.role !== 'owner';

    const { logs, total } = await AuditLogRepo.find({
      teamId: teamOnly ? authContext.teamId : undefined,
      limit,
      offset,
    });

    res.json({
      success: true,
      data: logs,
      total,
      limit,
      offset,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// Error Handler
// ============================================================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Close database pool
  await closePool();

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ============================================================================
// Start Server
// ============================================================================

async function start() {
  try {
    // Run database migrations (optional - server starts even if DB is unavailable)
    logger.info('Running database migrations...');
    try {
      await runMigrations();
      logger.info('Database migrations completed');
    } catch (dbError) {
      logger.warn('Database connection failed - running in degraded mode', {
        error: String(dbError),
        note: 'Team/token features disabled until DB is available'
      });
      // Server continues without DB - deploy/slot features still work via SSH
    }

    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`Server started`, { port: PORT, version: VERSION, env: NODE_ENV });

      console.log(`
╔════════════════════════════════════════════════════════════╗
║              CodeB v${VERSION} - Unified API Server              ║
╠════════════════════════════════════════════════════════════╣
║  Port:       ${PORT}                                           ║
║  Endpoint:   http://localhost:${PORT}/api/tool                 ║
║  Health:     http://localhost:${PORT}/health                   ║
║  Metrics:    http://localhost:${PORT}/metrics                  ║
║  Logs:       http://localhost:${PORT}/api/logs/stream          ║
╚════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: String(error) });
    process.exit(1);
  }
}

start();

export default app;
