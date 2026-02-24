/**
 * MetricsService - Prometheus metrics wrapper
 *
 * Encapsulates all prom-client metrics in a single service class.
 * Refactored from mcp-server/src/lib/metrics.ts
 */

import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

// ============================================================================
// Slot state mapping
// ============================================================================

const SLOT_STATE_MAP: Record<string, number> = {
  empty: 0,
  deployed: 1,
  active: 2,
  grace: 3,
};

// ============================================================================
// Service
// ============================================================================

export class MetricsService {
  readonly register: Registry;

  // HTTP Metrics
  readonly httpRequestsTotal: Counter;
  readonly httpRequestDuration: Histogram;
  readonly httpActiveRequests: Gauge;

  // Tool Metrics
  readonly toolCallsTotal: Counter;
  readonly toolCallDuration: Histogram;

  // Deployment Metrics
  readonly deploymentsTotal: Counter;
  readonly deploymentDuration: Histogram;
  readonly promotionsTotal: Counter;
  readonly rollbacksTotal: Counter;

  // Slot Metrics
  readonly slotStatus: Gauge;
  readonly slotHealthy: Gauge;
  readonly activeSlots: Gauge;

  // Database Metrics
  readonly dbConnectionsActive: Gauge;
  readonly dbConnectionsIdle: Gauge;
  readonly dbQueryDuration: Histogram;

  // Auth Metrics
  readonly authFailures: Counter;
  readonly rateLimitExceeded: Counter;

  // Business Metrics
  readonly projectsTotal: Gauge;
  readonly teamsTotal: Gauge;
  readonly apiKeysTotal: Gauge;

  // Edge Functions Metrics
  readonly edgeFunctionsTotal: Gauge;
  readonly edgeInvocationsTotal: Counter;
  readonly edgeInvocationDuration: Histogram;

  // Backup Metrics
  readonly lastBackupTimestamp: Gauge;
  readonly backupSize: Gauge;
  readonly walArchiveLag: Gauge;

  constructor(prefix: string = 'codeb_') {
    this.register = new Registry();

    // Collect default Node.js metrics
    collectDefaultMetrics({ register: this.register, prefix });

    // --- HTTP ---
    this.httpRequestsTotal = new Counter({
      name: `${prefix}http_requests_total`,
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.register],
    });

    this.httpRequestDuration = new Histogram({
      name: `${prefix}http_request_duration_seconds`,
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
      registers: [this.register],
    });

    this.httpActiveRequests = new Gauge({
      name: `${prefix}http_active_requests`,
      help: 'Number of active HTTP requests',
      registers: [this.register],
    });

    // --- Tool Calls ---
    this.toolCallsTotal = new Counter({
      name: `${prefix}tool_calls_total`,
      help: 'Total number of tool calls',
      labelNames: ['tool', 'status', 'role'],
      registers: [this.register],
    });

    this.toolCallDuration = new Histogram({
      name: `${prefix}tool_call_duration_seconds`,
      help: 'Tool call duration in seconds',
      labelNames: ['tool'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
      registers: [this.register],
    });

    // --- Deployments ---
    this.deploymentsTotal = new Counter({
      name: `${prefix}deployments_total`,
      help: 'Total number of deployments',
      labelNames: ['project', 'environment', 'status'],
      registers: [this.register],
    });

    this.deploymentDuration = new Histogram({
      name: `${prefix}deployment_duration_seconds`,
      help: 'Deployment duration in seconds',
      labelNames: ['project', 'environment'],
      buckets: [10, 30, 60, 120, 300, 600],
      registers: [this.register],
    });

    this.promotionsTotal = new Counter({
      name: `${prefix}promotions_total`,
      help: 'Total number of slot promotions',
      labelNames: ['project', 'environment'],
      registers: [this.register],
    });

    this.rollbacksTotal = new Counter({
      name: `${prefix}rollbacks_total`,
      help: 'Total number of rollbacks',
      labelNames: ['project', 'environment'],
      registers: [this.register],
    });

    // --- Slots ---
    this.slotStatus = new Gauge({
      name: `${prefix}slot_status`,
      help: 'Slot status (0=empty, 1=deployed, 2=active, 3=grace)',
      labelNames: ['project', 'environment', 'slot'],
      registers: [this.register],
    });

    this.slotHealthy = new Gauge({
      name: `${prefix}slot_healthy`,
      help: 'Slot health status (0=unhealthy, 1=healthy)',
      labelNames: ['project', 'environment', 'slot'],
      registers: [this.register],
    });

    this.activeSlots = new Gauge({
      name: `${prefix}active_slots_total`,
      help: 'Number of active slots',
      registers: [this.register],
    });

    // --- Database ---
    this.dbConnectionsActive = new Gauge({
      name: `${prefix}db_connections_active`,
      help: 'Number of active database connections',
      registers: [this.register],
    });

    this.dbConnectionsIdle = new Gauge({
      name: `${prefix}db_connections_idle`,
      help: 'Number of idle database connections',
      registers: [this.register],
    });

    this.dbQueryDuration = new Histogram({
      name: `${prefix}db_query_duration_seconds`,
      help: 'Database query duration in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.register],
    });

    // --- Auth ---
    this.authFailures = new Counter({
      name: `${prefix}auth_failures_total`,
      help: 'Total number of authentication failures',
      labelNames: ['reason'],
      registers: [this.register],
    });

    this.rateLimitExceeded = new Counter({
      name: `${prefix}rate_limit_exceeded_total`,
      help: 'Total number of rate limit exceeded events',
      labelNames: ['key_id'],
      registers: [this.register],
    });

    // --- Business ---
    this.projectsTotal = new Gauge({
      name: `${prefix}projects_total`,
      help: 'Total number of projects',
      registers: [this.register],
    });

    this.teamsTotal = new Gauge({
      name: `${prefix}teams_total`,
      help: 'Total number of teams',
      registers: [this.register],
    });

    this.apiKeysTotal = new Gauge({
      name: `${prefix}api_keys_total`,
      help: 'Total number of API keys',
      labelNames: ['role'],
      registers: [this.register],
    });

    // --- Edge Functions ---
    this.edgeFunctionsTotal = new Gauge({
      name: `${prefix}edge_functions_total`,
      help: 'Total number of edge functions',
      labelNames: ['project', 'type'],
      registers: [this.register],
    });

    this.edgeInvocationsTotal = new Counter({
      name: `${prefix}edge_invocations_total`,
      help: 'Total number of edge function invocations',
      labelNames: ['project', 'function', 'status'],
      registers: [this.register],
    });

    this.edgeInvocationDuration = new Histogram({
      name: `${prefix}edge_invocation_duration_ms`,
      help: 'Edge function invocation duration in milliseconds',
      labelNames: ['project', 'function'],
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
      registers: [this.register],
    });

    // --- Backup ---
    this.lastBackupTimestamp = new Gauge({
      name: `${prefix}last_backup_timestamp`,
      help: 'Timestamp of last successful backup',
      labelNames: ['type', 'database'],
      registers: [this.register],
    });

    this.backupSize = new Gauge({
      name: `${prefix}backup_size_bytes`,
      help: 'Size of last backup in bytes',
      labelNames: ['type', 'database'],
      registers: [this.register],
    });

    this.walArchiveLag = new Gauge({
      name: `${prefix}wal_archive_lag_bytes`,
      help: 'PostgreSQL WAL archive lag in bytes',
      registers: [this.register],
    });
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  updateSlotMetrics(
    project: string,
    environment: string,
    slot: 'blue' | 'green',
    state: string,
    healthy: boolean,
  ): void {
    this.slotStatus.set({ project, environment, slot }, SLOT_STATE_MAP[state] ?? 0);
    this.slotHealthy.set({ project, environment, slot }, healthy ? 1 : 0);
  }

  recordDeployment(
    project: string,
    environment: string,
    status: 'success' | 'failed',
    durationSeconds: number,
  ): void {
    this.deploymentsTotal.inc({ project, environment, status });
    if (status === 'success') {
      this.deploymentDuration.observe({ project, environment }, durationSeconds);
    }
  }

  recordToolCall(
    tool: string,
    status: 'success' | 'failed',
    role: string,
    durationSeconds: number,
  ): void {
    this.toolCallsTotal.inc({ tool, status, role });
    this.toolCallDuration.observe({ tool }, durationSeconds);
  }

  // ===========================================================================
  // Metrics Endpoint
  // ===========================================================================

  async getMetrics(): Promise<{ contentType: string; metrics: string }> {
    return {
      contentType: this.register.contentType,
      metrics: await this.register.metrics(),
    };
  }
}
