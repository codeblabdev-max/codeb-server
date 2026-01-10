/**
 * CodeB v6.0 - Analytics Data Ingestion
 *
 * Analytics SDK에서 전송한 데이터를 수집하여 저장
 * - PostgreSQL에 원시 데이터 저장
 * - Prometheus로 메트릭 노출
 * - 실시간 집계
 */

import { z } from 'zod';
import { Counter, Histogram, Gauge, Registry } from 'prom-client';
import type { AuthContext } from '../lib/types.js';

// ============================================================================
// Input Schemas
// ============================================================================

const webVitalSchema = z.object({
  name: z.enum(['CLS', 'FID', 'LCP', 'INP', 'TTFB', 'FCP']),
  value: z.number(),
  rating: z.enum(['good', 'needs-improvement', 'poor']),
  delta: z.number().optional(),
  id: z.string().optional(),
  navigationType: z.string().optional(),
});

const pageViewSchema = z.object({
  type: z.literal('pageview'),
  path: z.string(),
  referrer: z.string().optional(),
  title: z.string().optional(),
  timestamp: z.string(),
});

const customEventSchema = z.object({
  type: z.literal('event'),
  name: z.string(),
  properties: z.record(z.unknown()).optional(),
  timestamp: z.string(),
});

const metaSchema = z.object({
  url: z.string(),
  userAgent: z.string(),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
  }),
  connection: z.string().optional(),
  deviceMemory: z.number().optional(),
});

export const analyticsIngestSchema = z.object({
  projectId: z.string(),
  environment: z.enum(['production', 'staging', 'preview']).default('production'),
  sessionId: z.string(),
  userId: z.string().optional(),
  webVitals: z.array(webVitalSchema).optional(),
  pageViews: z.array(pageViewSchema).optional(),
  events: z.array(customEventSchema).optional(),
  meta: metaSchema,
});

export type AnalyticsIngestInput = z.infer<typeof analyticsIngestSchema>;

// ============================================================================
// Prometheus Metrics
// ============================================================================

// Create a separate registry for analytics metrics
const analyticsRegistry = new Registry();

// Web Vitals Histogram
const webVitalsHistogram = new Histogram({
  name: 'codeb_analytics_webvitals',
  help: 'Web Vitals metrics',
  labelNames: ['project', 'environment', 'name', 'rating'],
  buckets: [
    // CLS buckets (0-1 range)
    0.01, 0.025, 0.05, 0.1, 0.15, 0.25, 0.5, 1,
    // Time-based buckets (ms converted to seconds)
    0.1, 0.2, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 10,
  ],
  registers: [analyticsRegistry],
});

// Web Vitals Counter by Rating
const webVitalsTotal = new Counter({
  name: 'codeb_analytics_webvitals_total',
  help: 'Total Web Vitals measurements by rating',
  labelNames: ['project', 'environment', 'name', 'rating'],
  registers: [analyticsRegistry],
});

// Page Views Counter
const pageViewsTotal = new Counter({
  name: 'codeb_analytics_pageviews_total',
  help: 'Total page views',
  labelNames: ['project', 'environment', 'path'],
  registers: [analyticsRegistry],
});

// Custom Events Counter
const eventsTotal = new Counter({
  name: 'codeb_analytics_events_total',
  help: 'Total custom events',
  labelNames: ['project', 'environment', 'event_name'],
  registers: [analyticsRegistry],
});

// Active Sessions Gauge
const activeSessions = new Gauge({
  name: 'codeb_analytics_active_sessions',
  help: 'Number of active sessions in the last 5 minutes',
  labelNames: ['project', 'environment'],
  registers: [analyticsRegistry],
});

// Bounce Rate Gauge (calculated)
const bounceRate = new Gauge({
  name: 'codeb_analytics_bounce_rate',
  help: 'Bounce rate percentage',
  labelNames: ['project', 'environment'],
  registers: [analyticsRegistry],
});

// Session Duration Histogram
const sessionDuration = new Histogram({
  name: 'codeb_analytics_session_duration_seconds',
  help: 'Session duration in seconds',
  labelNames: ['project', 'environment'],
  buckets: [10, 30, 60, 120, 300, 600, 1200, 1800, 3600],
  registers: [analyticsRegistry],
});

// ============================================================================
// In-Memory Session Store (for active session tracking)
// ============================================================================

interface SessionData {
  projectId: string;
  environment: string;
  sessionId: string;
  userId?: string;
  startTime: number;
  lastSeen: number;
  pageViews: number;
  events: number;
  webVitals: Map<string, number>;
}

const sessionStore = new Map<string, SessionData>();

// Cleanup old sessions every minute
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes

  for (const [key, session] of sessionStore) {
    if (now - session.lastSeen > timeout) {
      // Record session duration
      const duration = (session.lastSeen - session.startTime) / 1000;
      sessionDuration.observe(
        { project: session.projectId, environment: session.environment },
        duration
      );

      // Calculate bounce (single page view)
      if (session.pageViews === 1) {
        // This is a simplified bounce tracking
      }

      sessionStore.delete(key);
    }
  }

  // Update active sessions gauge
  const projectSessions = new Map<string, number>();
  for (const session of sessionStore.values()) {
    const key = `${session.projectId}:${session.environment}`;
    projectSessions.set(key, (projectSessions.get(key) || 0) + 1);
  }

  for (const [key, count] of projectSessions) {
    const [project, environment] = key.split(':');
    activeSessions.set({ project, environment }, count);
  }
}, 60000);

// ============================================================================
// Data Storage Interface
// ============================================================================

interface AnalyticsStore {
  saveWebVitals(data: {
    projectId: string;
    environment: string;
    sessionId: string;
    webVitals: z.infer<typeof webVitalSchema>[];
    meta: z.infer<typeof metaSchema>;
    timestamp: string;
  }): Promise<void>;

  savePageViews(data: {
    projectId: string;
    environment: string;
    sessionId: string;
    pageViews: z.infer<typeof pageViewSchema>[];
    meta: z.infer<typeof metaSchema>;
  }): Promise<void>;

  saveEvents(data: {
    projectId: string;
    environment: string;
    sessionId: string;
    events: z.infer<typeof customEventSchema>[];
    meta: z.infer<typeof metaSchema>;
  }): Promise<void>;
}

// PostgreSQL Store Implementation
class PostgresAnalyticsStore implements AnalyticsStore {
  private pool: any; // pg.Pool

  constructor(pool?: any) {
    this.pool = pool;
  }

  async saveWebVitals(data: Parameters<AnalyticsStore['saveWebVitals']>[0]): Promise<void> {
    if (!this.pool) return;

    const query = `
      INSERT INTO analytics_webvitals (
        project_id, environment, session_id,
        metric_name, metric_value, rating,
        url, user_agent, viewport_width, viewport_height,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    for (const vital of data.webVitals) {
      await this.pool.query(query, [
        data.projectId,
        data.environment,
        data.sessionId,
        vital.name,
        vital.value,
        vital.rating,
        data.meta.url,
        data.meta.userAgent,
        data.meta.viewport.width,
        data.meta.viewport.height,
        data.timestamp,
      ]);
    }
  }

  async savePageViews(data: Parameters<AnalyticsStore['savePageViews']>[0]): Promise<void> {
    if (!this.pool) return;

    const query = `
      INSERT INTO analytics_pageviews (
        project_id, environment, session_id,
        path, referrer, title,
        url, user_agent, viewport_width, viewport_height,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    for (const pv of data.pageViews) {
      await this.pool.query(query, [
        data.projectId,
        data.environment,
        data.sessionId,
        pv.path,
        pv.referrer,
        pv.title,
        data.meta.url,
        data.meta.userAgent,
        data.meta.viewport.width,
        data.meta.viewport.height,
        pv.timestamp,
      ]);
    }
  }

  async saveEvents(data: Parameters<AnalyticsStore['saveEvents']>[0]): Promise<void> {
    if (!this.pool) return;

    const query = `
      INSERT INTO analytics_events (
        project_id, environment, session_id,
        event_name, properties,
        url, user_agent,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    for (const event of data.events) {
      await this.pool.query(query, [
        data.projectId,
        data.environment,
        data.sessionId,
        event.name,
        JSON.stringify(event.properties || {}),
        data.meta.url,
        data.meta.userAgent,
        event.timestamp,
      ]);
    }
  }
}

// Global store instance
let analyticsStore: AnalyticsStore = new PostgresAnalyticsStore();

export function setAnalyticsStore(store: AnalyticsStore): void {
  analyticsStore = store;
}

// ============================================================================
// Ingest Handler
// ============================================================================

interface IngestResult {
  success: boolean;
  processed: {
    webVitals: number;
    pageViews: number;
    events: number;
  };
  error?: string;
}

export async function executeAnalyticsIngest(
  input: AnalyticsIngestInput,
  _auth?: AuthContext
): Promise<IngestResult> {
  const {
    projectId,
    environment,
    sessionId,
    userId,
    webVitals,
    pageViews,
    events,
    meta,
  } = input;

  const timestamp = new Date().toISOString();

  try {
    // Update session tracking
    const sessionKey = `${projectId}:${sessionId}`;
    let session = sessionStore.get(sessionKey);

    if (!session) {
      session = {
        projectId,
        environment,
        sessionId,
        userId,
        startTime: Date.now(),
        lastSeen: Date.now(),
        pageViews: 0,
        events: 0,
        webVitals: new Map(),
      };
      sessionStore.set(sessionKey, session);
    }

    session.lastSeen = Date.now();

    // Process Web Vitals
    if (webVitals && webVitals.length > 0) {
      for (const vital of webVitals) {
        // Record to Prometheus
        const value = vital.name === 'CLS' ? vital.value : vital.value / 1000; // Convert ms to seconds
        webVitalsHistogram.observe(
          { project: projectId, environment, name: vital.name, rating: vital.rating },
          value
        );
        webVitalsTotal.inc(
          { project: projectId, environment, name: vital.name, rating: vital.rating }
        );

        // Update session
        session.webVitals.set(vital.name, vital.value);
      }

      // Save to database
      await analyticsStore.saveWebVitals({
        projectId,
        environment,
        sessionId,
        webVitals,
        meta,
        timestamp,
      });
    }

    // Process Page Views
    if (pageViews && pageViews.length > 0) {
      for (const pv of pageViews) {
        // Normalize path (remove query strings for aggregation)
        const normalizedPath = pv.path.split('?')[0] || '/';
        pageViewsTotal.inc({ project: projectId, environment, path: normalizedPath });

        session.pageViews++;
      }

      await analyticsStore.savePageViews({
        projectId,
        environment,
        sessionId,
        pageViews,
        meta,
      });
    }

    // Process Events
    if (events && events.length > 0) {
      for (const event of events) {
        eventsTotal.inc({ project: projectId, environment, event_name: event.name });
        session.events++;
      }

      await analyticsStore.saveEvents({
        projectId,
        environment,
        sessionId,
        events,
        meta,
      });
    }

    return {
      success: true,
      processed: {
        webVitals: webVitals?.length || 0,
        pageViews: pageViews?.length || 0,
        events: events?.length || 0,
      },
    };

  } catch (error) {
    console.error('[Analytics Ingest] Error:', error);
    return {
      success: false,
      processed: { webVitals: 0, pageViews: 0, events: 0 },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Edge Ingest (Simplified for middleware)
// ============================================================================

export const edgeIngestSchema = z.object({
  projectId: z.string(),
  environment: z.enum(['production', 'staging', 'preview']).default('production'),
  type: z.literal('pageview'),
  path: z.string(),
  timestamp: z.string(),
  meta: z.object({
    url: z.string(),
    userAgent: z.string(),
    ip: z.string().optional(),
    country: z.string().optional(),
    city: z.string().optional(),
  }),
});

export async function executeEdgeIngest(
  input: z.infer<typeof edgeIngestSchema>
): Promise<{ success: boolean }> {
  const { projectId, environment, path } = input;

  try {
    const normalizedPath = path.split('?')[0] || '/';
    pageViewsTotal.inc({ project: projectId, environment, path: normalizedPath });

    return { success: true };
  } catch {
    return { success: false };
  }
}

// ============================================================================
// Get Metrics
// ============================================================================

export async function getAnalyticsMetrics(): Promise<string> {
  return analyticsRegistry.metrics();
}

export function getAnalyticsRegistry(): Registry {
  return analyticsRegistry;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const analyticsIngestTool = {
  name: 'analytics_ingest',
  description: 'Ingest analytics data from SDK (Web Vitals, page views, events)',
  inputSchema: analyticsIngestSchema,
  requiresAuth: false, // Public endpoint for SDK

  async execute(params: AnalyticsIngestInput): Promise<IngestResult> {
    return executeAnalyticsIngest(params);
  },
};

export const edgeIngestTool = {
  name: 'edge_ingest',
  description: 'Ingest edge analytics (simplified page view tracking)',
  inputSchema: edgeIngestSchema,
  requiresAuth: false,

  async execute(params: z.infer<typeof edgeIngestSchema>): Promise<{ success: boolean }> {
    return executeEdgeIngest(params);
  },
};

// ============================================================================
// Database Schema (for reference)
// ============================================================================

export const ANALYTICS_SCHEMA = `
-- Web Vitals table
CREATE TABLE IF NOT EXISTS analytics_webvitals (
  id BIGSERIAL PRIMARY KEY,
  project_id VARCHAR(50) NOT NULL,
  environment VARCHAR(20) NOT NULL,
  session_id VARCHAR(100) NOT NULL,
  metric_name VARCHAR(10) NOT NULL,
  metric_value DECIMAL(10, 4) NOT NULL,
  rating VARCHAR(20) NOT NULL,
  url TEXT,
  user_agent TEXT,
  viewport_width INT,
  viewport_height INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webvitals_project ON analytics_webvitals(project_id, environment, created_at);
CREATE INDEX IF NOT EXISTS idx_webvitals_metric ON analytics_webvitals(metric_name, rating);

-- Page Views table
CREATE TABLE IF NOT EXISTS analytics_pageviews (
  id BIGSERIAL PRIMARY KEY,
  project_id VARCHAR(50) NOT NULL,
  environment VARCHAR(20) NOT NULL,
  session_id VARCHAR(100) NOT NULL,
  path VARCHAR(500) NOT NULL,
  referrer TEXT,
  title TEXT,
  url TEXT,
  user_agent TEXT,
  viewport_width INT,
  viewport_height INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pageviews_project ON analytics_pageviews(project_id, environment, created_at);
CREATE INDEX IF NOT EXISTS idx_pageviews_path ON analytics_pageviews(path);

-- Events table
CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  project_id VARCHAR(50) NOT NULL,
  environment VARCHAR(20) NOT NULL,
  session_id VARCHAR(100) NOT NULL,
  event_name VARCHAR(100) NOT NULL,
  properties JSONB,
  url TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_project ON analytics_events(project_id, environment, created_at);
CREATE INDEX IF NOT EXISTS idx_events_name ON analytics_events(event_name);
`;
