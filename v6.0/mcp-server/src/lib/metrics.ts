/**
 * CodeB v6.0 - Prometheus Metrics
 *
 * Features:
 * - HTTP request metrics
 * - Deployment metrics
 * - Slot status metrics
 * - Database connection metrics
 * - Custom business metrics
 */

import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

// ============================================================================
// Registry
// ============================================================================

export const register = new Registry();

// Collect default Node.js metrics
collectDefaultMetrics({ register, prefix: 'codeb_' });

// ============================================================================
// HTTP Metrics
// ============================================================================

export const httpRequestsTotal = new Counter({
  name: 'codeb_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'codeb_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const httpActiveRequests = new Gauge({
  name: 'codeb_http_active_requests',
  help: 'Number of active HTTP requests',
  registers: [register],
});

// ============================================================================
// API Tool Metrics
// ============================================================================

export const toolCallsTotal = new Counter({
  name: 'codeb_tool_calls_total',
  help: 'Total number of tool calls',
  labelNames: ['tool', 'status', 'role'],
  registers: [register],
});

export const toolCallDuration = new Histogram({
  name: 'codeb_tool_call_duration_seconds',
  help: 'Tool call duration in seconds',
  labelNames: ['tool'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [register],
});

// ============================================================================
// Deployment Metrics
// ============================================================================

export const deploymentsTotal = new Counter({
  name: 'codeb_deployments_total',
  help: 'Total number of deployments',
  labelNames: ['project', 'environment', 'status'],
  registers: [register],
});

export const deploymentDuration = new Histogram({
  name: 'codeb_deployment_duration_seconds',
  help: 'Deployment duration in seconds',
  labelNames: ['project', 'environment'],
  buckets: [10, 30, 60, 120, 300, 600],
  registers: [register],
});

export const promotionsTotal = new Counter({
  name: 'codeb_promotions_total',
  help: 'Total number of slot promotions',
  labelNames: ['project', 'environment'],
  registers: [register],
});

export const rollbacksTotal = new Counter({
  name: 'codeb_rollbacks_total',
  help: 'Total number of rollbacks',
  labelNames: ['project', 'environment'],
  registers: [register],
});

// ============================================================================
// Slot Status Metrics
// ============================================================================

export const slotStatus = new Gauge({
  name: 'codeb_slot_status',
  help: 'Slot status (0=empty, 1=deployed, 2=active, 3=grace)',
  labelNames: ['project', 'environment', 'slot'],
  registers: [register],
});

export const slotHealthy = new Gauge({
  name: 'codeb_slot_healthy',
  help: 'Slot health status (0=unhealthy, 1=healthy)',
  labelNames: ['project', 'environment', 'slot'],
  registers: [register],
});

export const activeSlots = new Gauge({
  name: 'codeb_active_slots_total',
  help: 'Number of active slots',
  registers: [register],
});

// ============================================================================
// Database Metrics
// ============================================================================

export const dbConnectionsActive = new Gauge({
  name: 'codeb_db_connections_active',
  help: 'Number of active database connections',
  registers: [register],
});

export const dbConnectionsIdle = new Gauge({
  name: 'codeb_db_connections_idle',
  help: 'Number of idle database connections',
  registers: [register],
});

export const dbQueryDuration = new Histogram({
  name: 'codeb_db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

// ============================================================================
// Authentication Metrics
// ============================================================================

export const authFailures = new Counter({
  name: 'codeb_auth_failures_total',
  help: 'Total number of authentication failures',
  labelNames: ['reason'],
  registers: [register],
});

export const rateLimitExceeded = new Counter({
  name: 'codeb_rate_limit_exceeded_total',
  help: 'Total number of rate limit exceeded events',
  labelNames: ['key_id'],
  registers: [register],
});

// ============================================================================
// Business Metrics
// ============================================================================

export const projectsTotal = new Gauge({
  name: 'codeb_projects_total',
  help: 'Total number of projects',
  registers: [register],
});

export const teamsTotal = new Gauge({
  name: 'codeb_teams_total',
  help: 'Total number of teams',
  registers: [register],
});

export const apiKeysTotal = new Gauge({
  name: 'codeb_api_keys_total',
  help: 'Total number of API keys',
  labelNames: ['role'],
  registers: [register],
});

// ============================================================================
// Edge Functions Metrics
// ============================================================================

export const edgeFunctionsTotal = new Gauge({
  name: 'codeb_edge_functions_total',
  help: 'Total number of edge functions',
  labelNames: ['project', 'type'],
  registers: [register],
});

export const edgeInvocationsTotal = new Counter({
  name: 'codeb_edge_invocations_total',
  help: 'Total number of edge function invocations',
  labelNames: ['project', 'function', 'status'],
  registers: [register],
});

export const edgeInvocationDuration = new Histogram({
  name: 'codeb_edge_invocation_duration_ms',
  help: 'Edge function invocation duration in milliseconds',
  labelNames: ['project', 'function'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
  registers: [register],
});

// ============================================================================
// Backup Metrics
// ============================================================================

export const lastBackupTimestamp = new Gauge({
  name: 'codeb_last_backup_timestamp',
  help: 'Timestamp of last successful backup',
  labelNames: ['type', 'database'],
  registers: [register],
});

export const backupSize = new Gauge({
  name: 'codeb_backup_size_bytes',
  help: 'Size of last backup in bytes',
  labelNames: ['type', 'database'],
  registers: [register],
});

export const walArchiveLag = new Gauge({
  name: 'codeb_wal_archive_lag_bytes',
  help: 'PostgreSQL WAL archive lag in bytes',
  registers: [register],
});

// ============================================================================
// Helper Functions
// ============================================================================

const SLOT_STATE_MAP: Record<string, number> = {
  empty: 0,
  deployed: 1,
  active: 2,
  grace: 3,
};

export function updateSlotMetrics(
  project: string,
  environment: string,
  slot: 'blue' | 'green',
  state: string,
  healthy: boolean
) {
  slotStatus.set({ project, environment, slot }, SLOT_STATE_MAP[state] ?? 0);
  slotHealthy.set({ project, environment, slot }, healthy ? 1 : 0);
}

export function recordDeployment(
  project: string,
  environment: string,
  status: 'success' | 'failed',
  durationSeconds: number
) {
  deploymentsTotal.inc({ project, environment, status });
  if (status === 'success') {
    deploymentDuration.observe({ project, environment }, durationSeconds);
  }
}

export function recordToolCall(
  tool: string,
  status: 'success' | 'failed',
  role: string,
  durationSeconds: number
) {
  toolCallsTotal.inc({ tool, status, role });
  toolCallDuration.observe({ tool }, durationSeconds);
}

// ============================================================================
// Metrics Endpoint Handler
// ============================================================================

export async function getMetricsHandler(): Promise<{ contentType: string; metrics: string }> {
  return {
    contentType: register.contentType,
    metrics: await register.metrics(),
  };
}
