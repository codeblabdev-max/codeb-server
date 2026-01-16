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
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { AuthContext } from './lib/types.js';
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

// Tools - Blue-Green Deployment
import { deployTool } from './tools/deploy.js';
import { promoteTool } from './tools/promote.js';
import { rollbackTool } from './tools/rollback.js';
import { slotStatusTool, slotCleanupTool, slotListTool } from './tools/slot.js';

// Tools - Domain Management
import {
  domainSetupTool,
  domainListTool,
  domainDeleteTool,
} from './tools/domain.js';

// Tools - Project (Initialization & Scan)
import {
  projectInitTool,
  projectScanTool,
} from './tools/project.js';

// SSH for infrastructure status
import { withSSH } from './lib/ssh.js';
import { SERVERS } from './lib/servers.js';

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
// Helper Functions
// ============================================================================

/**
 * Normalize project name: convert underscores to hyphens
 * Ensures consistency between different naming conventions
 */
function normalizeProjectName(name: string): string {
  return name.replace(/_/g, '-').toLowerCase();
}

/**
 * Normalize params that may contain projectName
 */
function normalizeParams(params: Record<string, any>): Record<string, any> {
  if (params.projectName) {
    return {
      ...params,
      projectName: normalizeProjectName(params.projectName),
    };
  }
  return params;
}

// ============================================================================
// Tool Registry
// ============================================================================

const TOOLS: Record<string, {
  handler: (params: any, auth: AuthContext) => Promise<any>;
  permission: string;
}> = {
  // Blue-Green Deployment (핵심)
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
  domain_list: { handler: (p, a) => domainListTool.execute(p, a), permission: 'domain.view' },
  domain_delete: { handler: (p, a) => domainDeleteTool.execute(p, a), permission: 'domain.manage' },

  // Project (Initialization & Scan) - /we:quick에서 호출
  workflow_init: { handler: (p, a) => projectInitTool.execute(p, a), permission: 'deploy.create' },
  workflow_scan: { handler: (p, a) => projectScanTool.execute(p, a), permission: 'project.view' },

  // Utility
  health_check: { handler: executeInfraStatus, permission: 'project.view' },
  scan: { handler: (p, a) => projectScanTool.execute(p, a), permission: 'project.view' },
};

// ============================================================================
// Infrastructure Status (health_check 대체)
// ============================================================================

interface ContainerInfo {
  name: string;
  image: string;
  status: string;
  ports: string;
}

interface SlotInfo {
  project: string;
  activeSlot: string;
  blue: { state: string; port: number; version: string };
  green: { state: string; port: number; version: string };
}

interface InfraStatusResult {
  success: boolean;
  data: {
    api: {
      status: string;
      version: string;
      uptime: number;
    };
    containers: ContainerInfo[];
    slots: SlotInfo[];
    images: { repository: string; tag: string; size: string; created: string }[];
    ports: { port: string; process: string }[];
  };
  timestamp: string;
}

async function executeInfraStatus(): Promise<InfraStatusResult> {
  try {
    const result = await withSSH(SERVERS.app.ip, async (ssh) => {
      // 1. Docker 컨테이너 목록
      const containersResult = await ssh.exec(
        `docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}' 2>/dev/null | head -30`
      );
      const containers: ContainerInfo[] = containersResult.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [name, image, status, ports] = line.split('|');
          return { name, image: image?.split(':')[0] || image, status: status?.split(' ')[0] || status, ports: ports || '' };
        });

      // 2. SSOT Slot Registry
      const slotsResult = await ssh.exec(`
        for f in /opt/codeb/registry/slots/*.json; do
          if [ -f "$f" ]; then
            PROJECT=$(basename $f .json)
            ACTIVE=$(jq -r '.activeSlot' $f 2>/dev/null)
            BLUE_STATE=$(jq -r '.blue.state' $f 2>/dev/null)
            BLUE_PORT=$(jq -r '.blue.port' $f 2>/dev/null)
            BLUE_VER=$(jq -r '.blue.version // "N/A"' $f 2>/dev/null)
            GREEN_STATE=$(jq -r '.green.state' $f 2>/dev/null)
            GREEN_PORT=$(jq -r '.green.port' $f 2>/dev/null)
            GREEN_VER=$(jq -r '.green.version // "N/A"' $f 2>/dev/null)
            echo "$PROJECT|$ACTIVE|$BLUE_STATE|$BLUE_PORT|$BLUE_VER|$GREEN_STATE|$GREEN_PORT|$GREEN_VER"
          fi
        done
      `);
      const slots: SlotInfo[] = slotsResult.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [project, activeSlot, blueState, bluePort, blueVer, greenState, greenPort, greenVer] = line.split('|');
          return {
            project,
            activeSlot,
            blue: { state: blueState, port: parseInt(bluePort) || 0, version: blueVer },
            green: { state: greenState, port: parseInt(greenPort) || 0, version: greenVer },
          };
        });

      // 3. Docker Images (프로젝트 관련)
      const imagesResult = await ssh.exec(
        `docker images --format '{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedSince}}' | grep -E '(codeb|project|ghcr)' | head -15`
      );
      const images = imagesResult.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [repository, tag, size, created] = line.split('|');
          return { repository: repository?.split('/').pop() || repository, tag, size, created };
        });

      // 4. 포트 사용 현황 (4000-4200, 9101)
      const portsResult = await ssh.exec(
        `ss -tlnp 2>/dev/null | grep -E ':(4[0-1][0-9]{2}|9101) ' | awk '{print $4 "|" $6}' | head -20`
      );
      const ports = portsResult.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [port, proc] = line.split('|');
          return { port: port?.replace('0.0.0.0:', '').replace('[::]:', '') || port, process: proc?.match(/\("([^"]+)"/)?.[1] || 'unknown' };
        });

      return { containers, slots, images, ports };
    });

    return {
      success: true,
      data: {
        api: {
          status: 'healthy',
          version: VERSION,
          uptime: process.uptime(),
        },
        containers: result.containers,
        slots: result.slots,
        images: result.images,
        ports: result.ports,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      data: {
        api: { status: 'healthy', version: VERSION, uptime: process.uptime() },
        containers: [],
        slots: [],
        images: [],
        ports: [],
      },
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================================================
// Routes
// ============================================================================

// Health check (no auth required)
// 클라이언트 버전 체크 포함 - 낮으면 업데이트 알림
app.get('/health', (req, res) => {
  const clientVersion = req.headers['x-client-version'] as string || req.query.v as string;

  let updateRequired = false;
  let updateMessage = '';

  if (clientVersion && clientVersion !== VERSION) {
    // 버전 비교 (semver 간단 비교)
    const [cMajor, cMinor, cPatch] = clientVersion.split('.').map(Number);
    const [sMajor, sMinor, sPatch] = VERSION.split('.').map(Number);

    if (sMajor > cMajor ||
        (sMajor === cMajor && sMinor > cMinor) ||
        (sMajor === cMajor && sMinor === cMinor && sPatch > cPatch)) {
      updateRequired = true;
      updateMessage = `CLI 업데이트 필요: ${clientVersion} → ${VERSION}\ncurl -sSL https://releases.codeb.kr/cli/install.sh | bash`;
    }
  }

  res.json({
    status: 'healthy',
    version: VERSION,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    ...(updateRequired && {
      updateRequired,
      updateMessage,
      latestVersion: VERSION,
      downloadUrl: 'https://releases.codeb.kr/cli/install.sh'
    })
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
      'slot-management',
      'domain-management',
      'project-initialization',
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
    // Normalize project name (convert underscores to hyphens)
    const normalizedParams = normalizeParams(params);

    log.info(`Executing tool: ${tool}`, { params: Object.keys(normalizedParams) });

    const result = await toolDef.handler(normalizedParams, authContext);
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

    // 클라이언트 버전 체크
    const clientVersion = req.headers['x-client-version'] as string;
    let versionWarning: string | undefined;

    if (clientVersion && clientVersion !== VERSION) {
      const [cMajor, cMinor, cPatch] = clientVersion.split('.').map(Number);
      const [sMajor, sMinor, sPatch] = VERSION.split('.').map(Number);

      if (sMajor > cMajor ||
          (sMajor === cMajor && sMinor > cMinor) ||
          (sMajor === cMajor && sMinor === cMinor && sPatch > cPatch)) {
        versionWarning = `⚠️ CLI 업데이트 필요: ${clientVersion} → ${VERSION}\n   curl -sSL https://releases.codeb.kr/cli/install.sh | bash`;
      }
    }

    res.json({
      ...result,
      duration,
      timestamp: new Date().toISOString(),
      correlationId,
      ...(versionWarning && { versionWarning, latestVersion: VERSION })
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
