/**
 * @codeb/api - Log Stream Handler (SSE)
 *
 * GET /api/logs/stream - Server-Sent Events endpoint for real-time log streaming.
 * Supports filtering by project, environment, slot, and log level.
 *
 * Refactored from mcp-server/src/index.ts GET /api/logs/stream route.
 */

import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { checkPermission } from '../middleware/auth.js';
import { generateCorrelationId } from '../middleware/metrics.js';

// ============================================================================
// SSE Client Manager
// ============================================================================

interface SSEClient {
  id: string;
  res: Response;
  filters: SSEFilters;
}

interface SSEFilters {
  projectName?: string;
  environment?: string;
  slot?: string;
  level?: string;
}

interface LogEntry {
  timestamp: string;
  level: string;
  source: string;
  message: string;
  projectName?: string;
  environment?: string;
  metadata?: Record<string, unknown>;
}

const clients = new Map<string, SSEClient>();

/**
 * Broadcast a log entry to all connected SSE clients.
 * Respects per-client filters.
 */
export function broadcastLog(entry: LogEntry): void {
  const data = JSON.stringify(entry);

  for (const client of clients.values()) {
    // Apply filters
    if (client.filters.projectName && entry.projectName !== client.filters.projectName) continue;
    if (client.filters.environment && entry.environment !== client.filters.environment) continue;
    if (client.filters.level && entry.level !== client.filters.level) continue;

    try {
      client.res.write(`data: ${data}\n\n`);
    } catch {
      clients.delete(client.id);
    }
  }
}

// ============================================================================
// Handler Factory
// ============================================================================

export function createStreamHandler() {
  return async function streamHandler(
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

    // Setup SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

    // Register client
    const clientId = generateCorrelationId();
    const filters: SSEFilters = {
      projectName: req.query.project as string,
      environment: req.query.environment as string,
      slot: req.query.slot as string,
      level: req.query.level as string,
    };

    clients.set(clientId, { id: clientId, res, filters });

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
        clients.delete(clientId);
      }
    }, 30_000);

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(clientId);
    });
  };
}
