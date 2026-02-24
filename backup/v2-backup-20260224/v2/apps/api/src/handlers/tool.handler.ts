/**
 * @codeb/api - Tool Execution Handler
 *
 * POST /api/tool - Universal tool dispatch endpoint.
 * Extracts { tool, params } from body, resolves handler from TOOL_REGISTRY,
 * checks permissions, executes, logs audit trail, and returns JSON.
 *
 * Refactored from mcp-server/src/index.ts POST /api/tool route.
 */

import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { TOOL_REGISTRY } from '../router.js';
import { checkPermission } from '../middleware/auth.js';

// ============================================================================
// Helper: Normalize Project Name
// ============================================================================

function normalizeProjectName(name: string): string {
  return name.replace(/_/g, '-').toLowerCase();
}

function normalizeParams(params: Record<string, unknown>): Record<string, unknown> {
  if (typeof params.projectName === 'string') {
    return {
      ...params,
      projectName: normalizeProjectName(params.projectName),
    };
  }
  return params;
}

// ============================================================================
// Handler Factory
// ============================================================================

export function createToolHandler(version: string) {
  return async function toolHandler(
    req: AuthenticatedRequest,
    res: Response,
    _next: NextFunction,
  ): Promise<void> {
    const startTime = Date.now();
    const { tool, params = {} } = req.body as {
      tool?: string;
      params?: Record<string, unknown>;
    };
    const authContext = req.auth!;
    const correlationId = (req as any).correlationId as string | undefined;

    // Validate tool name
    if (!tool) {
      res.status(400).json({
        success: false,
        error: 'Tool name required. Send { "tool": "deploy_project", "params": {...} }',
      });
      return;
    }

    const toolDef = TOOL_REGISTRY[tool];

    if (!toolDef) {
      res.status(404).json({
        success: false,
        error: `Unknown tool: ${tool}`,
        availableTools: Object.keys(TOOL_REGISTRY),
      });
      return;
    }

    // Permission check
    const hasPermission = await checkPermission(authContext, toolDef.permission);

    if (!hasPermission) {
      res.status(403).json({
        success: false,
        error: `Permission denied: ${toolDef.permission} required`,
      });
      return;
    }

    try {
      // Normalize project name (convert underscores to hyphens)
      const normalizedParams = normalizeParams(params);

      // Execute tool handler
      const result = await toolDef.handler(normalizedParams, authContext);
      const duration = Date.now() - startTime;

      // Audit logging (fire-and-forget)
      logAudit({
        tool,
        params: normalizedParams,
        auth: authContext,
        result,
        duration,
        ip: req.ip || req.socket.remoteAddress || 'unknown',
        userAgent: req.get('user-agent') || '',
      }).catch(() => { /* ignore audit log failures */ });

      // Log stream broadcast (fire-and-forget)
      broadcastToolResult(tool, normalizedParams, result, duration)
        .catch(() => { /* ignore broadcast failures */ });

      // Metrics recording (fire-and-forget)
      recordToolMetrics(tool, result.success ? 'success' : 'failed', authContext.role, duration / 1000)
        .catch(() => { /* ignore metrics failures */ });

      // Version check for CLI clients
      const clientVersion = req.headers['x-client-version'] as string | undefined;
      let versionWarning: string | undefined;

      if (clientVersion && clientVersion !== version) {
        const [cMajor = 0, cMinor = 0, cPatch = 0] = clientVersion.split('.').map(Number);
        const [sMajor = 0, sMinor = 0, sPatch = 0] = version.split('.').map(Number);

        if (
          sMajor > cMajor ||
          (sMajor === cMajor && sMinor > cMinor) ||
          (sMajor === cMajor && sMinor === cMinor && sPatch > cPatch)
        ) {
          versionWarning = `CLI update available: ${clientVersion} -> ${version}\ncurl -sSL https://releases.codeb.kr/cli/install.sh | bash`;
        }
      }

      res.json({
        ...result,
        duration,
        timestamp: new Date().toISOString(),
        correlationId,
        ...(versionWarning ? { versionWarning, latestVersion: version } : {}),
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error(`[TOOL] ${tool} failed after ${duration}ms:`, errorMessage);

      res.status(500).json({
        success: false,
        error: errorMessage,
        duration,
        timestamp: new Date().toISOString(),
        correlationId,
      });
    }
  };
}

// ============================================================================
// Audit Logger (async, non-blocking)
// ============================================================================

interface AuditEntry {
  tool: string;
  params: Record<string, unknown>;
  auth: { teamId: string; keyId: string; role: string };
  result: { success: boolean; error?: string };
  duration: number;
  ip: string;
  userAgent: string;
}

async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    // Try to use @codeb/db AuditLogRepo
    const db = await import('@codeb/db');
    await db.AuditLogRepo.create({
      timestamp: new Date().toISOString(),
      teamId: entry.auth.teamId,
      userId: entry.auth.keyId,
      action: entry.tool,
      resource: 'tool',
      resourceId: entry.tool,
      details: entry.params,
      ip: entry.ip,
      userAgent: entry.userAgent,
      duration: entry.duration,
      success: entry.result.success,
      error: entry.result.error,
    });
  } catch {
    // DB not available, log to console
    console.log(`[AUDIT] ${entry.tool} by ${entry.auth.teamId}/${entry.auth.role} success=${entry.result.success} ${entry.duration}ms`);
  }
}

// ============================================================================
// Log Stream Broadcast (async, non-blocking)
// ============================================================================

let logStreamInstance: InstanceType<typeof import('@codeb/feature-monitoring').LogStreamService> | null = null;

async function getLogStream() {
  if (!logStreamInstance) {
    const { LogStreamService } = await import('@codeb/feature-monitoring');
    const ssh = await import('@codeb/ssh');
    const logMod = await import('@codeb/logger');
    logStreamInstance = new LogStreamService(ssh.getSSHClient(), logMod.logger);
  }
  return logStreamInstance;
}

async function broadcastToolResult(
  tool: string,
  params: Record<string, unknown>,
  result: { success: boolean; error?: string },
  durationMs: number,
): Promise<void> {
  const logStream = await getLogStream();
  const { LogStreamService } = await import('@codeb/feature-monitoring');
  logStream.broadcast(LogStreamService.createLogEntry(
    result.success ? 'info' : 'error',
    'api',
    `Tool ${tool} ${result.success ? 'succeeded' : 'failed'} (${durationMs}ms)`,
    {
      projectName: params.projectName as string | undefined,
      environment: params.environment as string | undefined,
      metadata: { tool, duration: durationMs, success: result.success },
    },
  ));
}

// ============================================================================
// Metrics Recording (async, non-blocking)
// ============================================================================

let metricsInstance: InstanceType<typeof import('@codeb/feature-monitoring').MetricsService> | null = null;

async function getMetrics() {
  if (!metricsInstance) {
    const { MetricsService } = await import('@codeb/feature-monitoring');
    metricsInstance = new MetricsService();
  }
  return metricsInstance;
}

async function recordToolMetrics(
  tool: string,
  status: 'success' | 'failed',
  role: string,
  durationSeconds: number,
): Promise<void> {
  const metrics = await getMetrics();
  metrics.recordToolCall(tool, status, role, durationSeconds);
}
