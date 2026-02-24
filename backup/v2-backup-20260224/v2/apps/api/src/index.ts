/**
 * @codeb/api - Express HTTP API Server
 *
 * CodeB v8.0 Unified API Server (FSD Monorepo)
 *
 * Features:
 * - Team-based authentication (Vercel style)
 * - Blue-Green deployment with Quadlet + systemd
 * - Rate limiting and audit logging
 * - Prometheus metrics
 * - Real-time log streaming (SSE)
 * - Domain management (PowerDNS + Caddy)
 */

import express, { type Express } from 'express';
import helmet from 'helmet';
import { getVersion } from '@codeb/shared';

import { createCorsMiddleware } from './middleware/cors.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createRateLimitMiddleware } from './middleware/rate-limit.js';
import { createMetricsMiddleware } from './middleware/metrics.js';
import { createToolHandler } from './handlers/tool.handler.js';
import { createHealthHandler } from './handlers/health.handler.js';
import { createAuditHandler } from './handlers/audit.handler.js';
import { createStreamHandler } from './handlers/stream.handler.js';
import { createRouter, TOOL_REGISTRY } from './router.js';

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.PORT || '9101', 10);
const VERSION = getVersion();
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================================
// Express App
// ============================================================================

const app: Express = express();

// Security middleware
app.use(helmet());
app.use(createCorsMiddleware());
app.use(express.json({ limit: '10mb' }));

// Metrics tracking middleware
app.use(createMetricsMiddleware());

// ============================================================================
// Public Routes (no auth)
// ============================================================================

// Health check
app.get('/health', createHealthHandler(VERSION));

// API info
app.get('/api', (_req, res) => {
  res.json({
    name: 'CodeB API',
    version: VERSION,
    tools: Object.keys(TOOL_REGISTRY),
    features: [
      'blue-green-deployment',
      'slot-management',
      'domain-management',
      'project-initialization',
      'environment-management',
      'team-management',
    ],
  });
});

// Prometheus metrics endpoint (lazy-loaded MetricsService singleton)
let metricsService: InstanceType<typeof import('@codeb/feature-monitoring').MetricsService> | null = null;

async function getMetricsService() {
  if (!metricsService) {
    const { MetricsService } = await import('@codeb/feature-monitoring');
    metricsService = new MetricsService();
  }
  return metricsService;
}

app.get('/metrics', async (_req, res) => {
  try {
    const svc = await getMetricsService();
    const { contentType, metrics } = await svc.getMetrics();
    res.set('Content-Type', contentType);
    res.end(metrics);
  } catch {
    res.status(500).end();
  }
});

// ============================================================================
// Protected Routes (auth required)
// ============================================================================

const authMiddleware = createAuthMiddleware();
const rateLimitMiddleware = createRateLimitMiddleware();

// Tool execution endpoint
app.post('/api/tool', authMiddleware, rateLimitMiddleware, createToolHandler(VERSION));

// Log streaming (SSE)
app.get('/api/logs/stream', authMiddleware, createStreamHandler());

// Audit logs
app.get('/api/audit', authMiddleware, createAuditHandler());

// Feature-based routers
app.use('/api', authMiddleware, rateLimitMiddleware, createRouter());

// ============================================================================
// Error Handler
// ============================================================================

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR] Unhandled error:', err.message);
  res.status(500).json({
    success: false,
    error: NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function shutdown(signal: string): Promise<void> {
  console.log(`[SHUTDOWN] Received ${signal}, shutting down gracefully...`);
  try {
    const { closePool } = await import('@codeb/db');
    await closePool();
    console.log('[SHUTDOWN] Database pool closed');
  } catch {
    // DB pool might not be initialized
  }
  try {
    const { SSHConnectionPool } = await import('@codeb/ssh');
    SSHConnectionPool.getInstance().destroy();
    console.log('[SHUTDOWN] SSH connections closed');
  } catch {
    // SSH pool might not be initialized
  }
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// ============================================================================
// Start Server
// ============================================================================

async function start(): Promise<void> {
  try {
    // Run database migrations (degraded mode if DB unavailable)
    try {
      const { runMigrations } = await import('@codeb/db');
      await runMigrations();
      console.log('[DB] Migrations completed');
    } catch (dbError) {
      console.warn('[DB] Migration failed - running in degraded mode:', dbError instanceof Error ? dbError.message : dbError);
    }

    app.listen(PORT, () => {
      console.log(`
+============================================================+
|              CodeB v${VERSION} - Unified API Server               |
+============================================================+
|  Port:       ${String(PORT).padEnd(44)}|
|  Endpoint:   http://localhost:${PORT}/api/tool                 |
|  Health:     http://localhost:${PORT}/health                   |
|  Metrics:    http://localhost:${PORT}/metrics                  |
|  Logs:       http://localhost:${PORT}/api/logs/stream          |
|  Env:        ${NODE_ENV.padEnd(44)}|
+============================================================+
      `);
    });
  } catch (error) {
    console.error('[FATAL] Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;
export { VERSION };
