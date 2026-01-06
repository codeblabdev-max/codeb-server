/**
 * CodeB v6.0 - Analytics Types
 * Real-time deployment analytics with Web Vitals monitoring
 */

// ============================================================================
// Core Web Vitals Types
// ============================================================================

export type WebVitalsName = 'LCP' | 'FID' | 'CLS' | 'INP' | 'TTFB' | 'FCP';
export type WebVitalsRating = 'good' | 'needs-improvement' | 'poor';

export interface WebVitalsMetric {
  id: string;                          // Unique metric ID
  name: WebVitalsName;
  value: number;                       // Metric value in appropriate unit
  rating: WebVitalsRating;
  delta: number;                       // Change from previous measurement
  navigationType?: 'navigate' | 'reload' | 'back_forward' | 'prerender';
}

export interface WebVitalsThresholds {
  LCP: { good: 2500; poor: 4000 };     // ms
  FID: { good: 100; poor: 300 };       // ms
  CLS: { good: 0.1; poor: 0.25 };      // score
  INP: { good: 200; poor: 500 };       // ms
  TTFB: { good: 800; poor: 1800 };     // ms
  FCP: { good: 1800; poor: 3000 };     // ms
}

// ============================================================================
// Page View Types
// ============================================================================

export interface PageView {
  id: string;
  projectId: string;
  environment: 'staging' | 'production' | 'preview';
  timestamp: string;

  // Page info
  path: string;
  referrer?: string;
  title?: string;
  hash?: string;
  search?: string;

  // Visitor info
  visitorId: string;                   // Anonymous hash (no PII)
  sessionId: string;
  isNewVisitor: boolean;
  isNewSession: boolean;

  // Device info
  device: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  browserVersion?: string;
  os: string;
  osVersion?: string;
  screen?: {
    width: number;
    height: number;
    density?: number;
  };

  // Network info
  connectionType?: 'slow-2g' | '2g' | '3g' | '4g';
  effectiveType?: string;

  // Geo info (from IP, not PII)
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;

  // Performance
  webVitals?: WebVitalsMetric[];
}

// ============================================================================
// Deployment Metrics Types
// ============================================================================

export interface DeploymentMetric {
  id: string;
  projectId: string;
  environment: string;
  deploymentId: string;
  version: string;
  slot: 'blue' | 'green';

  timestamp: string;
  teamId: string;
  triggeredBy: string;                 // API key ID

  // Duration metrics (ms)
  totalDuration: number;
  buildDuration?: number;
  pullDuration?: number;               // Image pull time
  startDuration?: number;              // Container start time
  healthCheckDuration?: number;

  // Build metrics
  imageSize?: number;                  // bytes
  layers?: number;

  // Status
  success: boolean;
  steps: DeploymentStep[];

  // Post-deploy metrics (collected after deploy)
  firstRequestLatency?: number;        // ms to first successful request
  errorRate?: number;                  // % in first 5 minutes
  p50Latency?: number;                 // Median response time
  p95Latency?: number;                 // 95th percentile response time
}

export interface DeploymentStep {
  name: string;
  status: 'success' | 'failed' | 'skipped';
  duration: number;
  output?: string;
  error?: string;
}

// ============================================================================
// Aggregated Analytics Types
// ============================================================================

export type AnalyticsPeriod = 'hour' | 'day' | 'week' | 'month' | 'year';

export interface AnalyticsSummary {
  projectId: string;
  environment: string;
  period: AnalyticsPeriod;
  startTime: string;
  endTime: string;

  // Traffic metrics
  pageViews: number;
  uniqueVisitors: number;
  sessions: number;
  bounceRate: number;                  // %
  avgSessionDuration: number;          // seconds
  pagesPerSession: number;

  // Performance (p75 values - Vercel standard)
  lcp: number;
  fid: number;
  cls: number;
  inp: number;
  ttfb: number;
  fcp: number;

  // Performance distribution
  lcpGood: number;                     // % of good scores
  lcpNeedsImprovement: number;
  lcpPoor: number;

  // Top pages
  topPages: Array<{
    path: string;
    views: number;
    uniqueVisitors: number;
    avgLcp: number;
    avgCls: number;
    bounceRate: number;
  }>;

  // Top referrers
  topReferrers: Array<{
    referrer: string;
    views: number;
    uniqueVisitors: number;
  }>;

  // Device breakdown
  deviceBreakdown: {
    desktop: number;                   // % of traffic
    mobile: number;
    tablet: number;
  };

  // Country breakdown
  topCountries: Array<{
    country: string;
    views: number;
    percentage: number;
  }>;

  // Deployment stats
  deployments: number;
  successfulDeployments: number;
  successRate: number;                 // %
  avgDeployTime: number;               // seconds
  rollbacks: number;
}

// ============================================================================
// Real-time Analytics Types
// ============================================================================

export interface RealtimeMetrics {
  projectId: string;
  environment: string;
  timestamp: string;

  // Current minute stats
  activeVisitors: number;
  pageViewsPerMinute: number;
  errorRate: number;                   // Current error rate %

  // Live Web Vitals (last 5 minutes)
  avgLcp: number;
  avgCls: number;
  avgInp: number;

  // Active pages
  activePages: Array<{
    path: string;
    visitors: number;
  }>;
}

// ============================================================================
// Analytics Event Types (for intake server)
// ============================================================================

export type AnalyticsEvent =
  | PageViewEvent
  | WebVitalsEvent
  | CustomEvent
  | ErrorEvent;

export interface PageViewEvent {
  type: 'pageview';
  projectId: string;
  environment: string;
  timestamp: string;
  visitorId: string;
  sessionId: string;
  path: string;
  referrer?: string;
  title?: string;
  device: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  os?: string;
  country?: string;
}

export interface WebVitalsEvent {
  type: 'webvital';
  projectId: string;
  environment: string;
  timestamp: string;
  visitorId: string;
  sessionId: string;
  path: string;
  name: WebVitalsName;
  value: number;
  rating: WebVitalsRating;
  delta: number;
  id: string;
}

export interface CustomEvent {
  type: 'custom';
  projectId: string;
  environment: string;
  timestamp: string;
  visitorId: string;
  sessionId: string;
  name: string;                        // Custom event name
  properties?: Record<string, unknown>;
}

export interface ErrorEvent {
  type: 'error';
  projectId: string;
  environment: string;
  timestamp: string;
  visitorId: string;
  sessionId: string;
  path: string;
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Speed Insights Types (Vercel-style)
// ============================================================================

export interface SpeedInsightsScore {
  projectId: string;
  environment: string;
  period: AnalyticsPeriod;

  // Overall score (0-100)
  score: number;
  previousScore?: number;
  trend: 'improving' | 'stable' | 'declining';

  // Individual metrics (0-100 each)
  lcpScore: number;
  fidScore: number;
  clsScore: number;
  inpScore: number;
  ttfbScore: number;

  // Recommendations
  recommendations: Array<{
    metric: WebVitalsName;
    impact: 'high' | 'medium' | 'low';
    message: string;
    affectedPaths: string[];
  }>;
}

// ============================================================================
// Analytics API Types
// ============================================================================

export interface AnalyticsQueryParams {
  projectName: string;
  environment?: 'staging' | 'production' | 'preview';
  period?: AnalyticsPeriod;
  startDate?: string;
  endDate?: string;
  path?: string;                       // Filter by path
  device?: 'desktop' | 'mobile' | 'tablet';
  country?: string;
}

export interface AnalyticsAPIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    period: AnalyticsPeriod;
    startTime: string;
    endTime: string;
    timezone: string;
  };
}
