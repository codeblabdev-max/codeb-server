/**
 * @codeb/api - HTTP Metrics Middleware
 *
 * Tracks request counts, latency, and active request gauge.
 * Uses @codeb/feature-monitoring MetricsService when available.
 */

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

// ============================================================================
// In-Memory Metrics (Fallback)
// ============================================================================

interface MetricsStore {
  totalRequests: number;
  activeRequests: number;
  requestsByMethod: Record<string, number>;
  requestsByStatus: Record<string, number>;
  totalLatencyMs: number;
}

const metrics: MetricsStore = {
  totalRequests: 0,
  activeRequests: 0,
  requestsByMethod: {},
  requestsByStatus: {},
  totalLatencyMs: 0,
};

export function getMetrics(): Readonly<MetricsStore> {
  return { ...metrics };
}

// ============================================================================
// Correlation ID Generator
// ============================================================================

export function generateCorrelationId(): string {
  return randomUUID().slice(0, 8);
}

// ============================================================================
// Middleware Factory
// ============================================================================

export function createMetricsMiddleware() {
  return function metricsMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();

    // Attach correlation ID
    res.setHeader('X-Correlation-ID', correlationId);
    (req as any).correlationId = correlationId;

    metrics.activeRequests++;
    metrics.totalRequests++;
    metrics.requestsByMethod[req.method] = (metrics.requestsByMethod[req.method] || 0) + 1;

    res.on('finish', () => {
      metrics.activeRequests--;
      const duration = Date.now() - startTime;
      metrics.totalLatencyMs += duration;

      const statusGroup = `${Math.floor(res.statusCode / 100)}xx`;
      metrics.requestsByStatus[statusGroup] = (metrics.requestsByStatus[statusGroup] || 0) + 1;
    });

    next();
  };
}
