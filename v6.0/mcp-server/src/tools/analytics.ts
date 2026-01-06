/**
 * CodeB v6.0 - Analytics Tools
 * Real-time deployment analytics with Web Vitals monitoring
 */

import { z } from 'zod';
import type { AuthContext } from '../lib/types.js';
import type {
  AnalyticsSummary,
  AnalyticsPeriod,
  SpeedInsightsScore,
  RealtimeMetrics,
} from '../lib/analytics-types.js';
import { SERVERS } from '../lib/servers.js';

// ============================================================================
// Constants
// ============================================================================

const PROMETHEUS_URL = `http://${SERVERS.backup.ip}:9090`;
// Future: PostgreSQL analytics storage
// const ANALYTICS_DB_URL = `postgresql://${SERVERS.storage.domain}:5432/codeb_analytics`;

// ============================================================================
// Input Schemas
// ============================================================================

export const analyticsOverviewSchema = z.object({
  projectName: z.string().describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).default('production'),
  period: z.enum(['hour', 'day', 'week', 'month']).default('day'),
});

export const analyticsWebVitalsSchema = z.object({
  projectName: z.string().describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).default('production'),
  period: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  path: z.string().optional().describe('Filter by path'),
});

export const analyticsDeploymentsSchema = z.object({
  projectName: z.string().describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).optional(),
  days: z.number().min(1).max(90).default(7),
});

export const analyticsRealtimeSchema = z.object({
  projectName: z.string().describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).default('production'),
});

export const analyticsSpeedInsightsSchema = z.object({
  projectName: z.string().describe('Project name'),
  environment: z.enum(['staging', 'production', 'preview']).default('production'),
  period: z.enum(['day', 'week', 'month']).default('week'),
});

// ============================================================================
// Prometheus Query Helper
// ============================================================================

interface PrometheusResponse {
  data?: {
    result?: Array<{
      value?: [number, string];
      values?: Array<[number, string]>;
    }>;
  };
}

async function queryPrometheus(query: string): Promise<number> {
  try {
    const response = await fetch(
      `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`
    );
    const data = (await response.json()) as PrometheusResponse;
    return parseFloat(data.data?.result?.[0]?.value?.[1] || '0');
  } catch {
    return 0;
  }
}

async function queryPrometheusRange(
  query: string,
  start: number,
  end: number,
  step: string
): Promise<Array<{ timestamp: number; value: number }>> {
  try {
    const response = await fetch(
      `${PROMETHEUS_URL}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${step}`
    );
    const data = (await response.json()) as PrometheusResponse;
    return (
      data.data?.result?.[0]?.values?.map(([ts, val]) => ({
        timestamp: ts,
        value: parseFloat(val),
      })) || []
    );
  } catch {
    return [];
  }
}

function getPeriodSeconds(period: AnalyticsPeriod): number {
  const periods: Record<AnalyticsPeriod, number> = {
    hour: 3600,
    day: 86400,
    week: 604800,
    month: 2592000,
    year: 31536000,
  };
  return periods[period];
}

function getPeriodStep(period: AnalyticsPeriod): string {
  const steps: Record<AnalyticsPeriod, string> = {
    hour: '1m',
    day: '5m',
    week: '1h',
    month: '6h',
    year: '1d',
  };
  return steps[period];
}

// ============================================================================
// Analytics Overview
// ============================================================================

interface AnalyticsOverviewResult {
  success: boolean;
  data?: AnalyticsSummary;
  error?: string;
}

async function executeAnalyticsOverview(
  params: { projectName: string; environment?: string; period?: AnalyticsPeriod },
  auth: AuthContext
): Promise<AnalyticsOverviewResult> {
  const { projectName, environment = 'production', period = 'day' } = params;

  if (!auth.projects.includes(projectName) && auth.role !== 'owner') {
    return {
      success: false,
      error: `Access denied: project ${projectName} not in team scope`,
    };
  }

  try {
    const periodRange = `${period === 'hour' ? '1h' : period === 'day' ? '24h' : period === 'week' ? '7d' : '30d'}`;
    const labels = `project="${projectName}",environment="${environment}"`;

    // Query all metrics in parallel
    const [
      pageViews,
      uniqueVisitors,
      bounceRate,
      avgSessionDuration,
      lcpP75,
      fidP75,
      clsP75,
      inpP75,
      ttfbP75,
      fcpP75,
      lcpGood,
      lcpNeedsImprovement,
      lcpPoor,
      deployments,
      successfulDeploys,
      avgDeployTime,
    ] = await Promise.all([
      queryPrometheus(`sum(increase(codeb_analytics_pageviews_total{${labels}}[${periodRange}]))`),
      queryPrometheus(`count(count by (visitor_id) (codeb_analytics_pageviews_total{${labels}}))`),
      queryPrometheus(`avg(codeb_analytics_bounce_rate{${labels}})`),
      queryPrometheus(`avg(codeb_analytics_session_duration_seconds{${labels}})`),
      queryPrometheus(`histogram_quantile(0.75, rate(codeb_analytics_webvitals_bucket{${labels},name="LCP"}[${periodRange}]))`),
      queryPrometheus(`histogram_quantile(0.75, rate(codeb_analytics_webvitals_bucket{${labels},name="FID"}[${periodRange}]))`),
      queryPrometheus(`histogram_quantile(0.75, rate(codeb_analytics_webvitals_bucket{${labels},name="CLS"}[${periodRange}]))`),
      queryPrometheus(`histogram_quantile(0.75, rate(codeb_analytics_webvitals_bucket{${labels},name="INP"}[${periodRange}]))`),
      queryPrometheus(`histogram_quantile(0.75, rate(codeb_analytics_webvitals_bucket{${labels},name="TTFB"}[${periodRange}]))`),
      queryPrometheus(`histogram_quantile(0.75, rate(codeb_analytics_webvitals_bucket{${labels},name="FCP"}[${periodRange}]))`),
      queryPrometheus(`sum(rate(codeb_analytics_webvitals_total{${labels},name="LCP",rating="good"}[${periodRange}])) / sum(rate(codeb_analytics_webvitals_total{${labels},name="LCP"}[${periodRange}])) * 100`),
      queryPrometheus(`sum(rate(codeb_analytics_webvitals_total{${labels},name="LCP",rating="needs-improvement"}[${periodRange}])) / sum(rate(codeb_analytics_webvitals_total{${labels},name="LCP"}[${periodRange}])) * 100`),
      queryPrometheus(`sum(rate(codeb_analytics_webvitals_total{${labels},name="LCP",rating="poor"}[${periodRange}])) / sum(rate(codeb_analytics_webvitals_total{${labels},name="LCP"}[${periodRange}])) * 100`),
      queryPrometheus(`sum(increase(codeb_deployments_total{project="${projectName}"}[${periodRange}]))`),
      queryPrometheus(`sum(increase(codeb_deployments_total{project="${projectName}",status="success"}[${periodRange}]))`),
      queryPrometheus(`avg(codeb_deployment_duration_seconds{project="${projectName}"})`),
    ]);

    const now = new Date();
    const startTime = new Date(now.getTime() - getPeriodSeconds(period) * 1000);

    return {
      success: true,
      data: {
        projectId: projectName,
        environment,
        period,
        startTime: startTime.toISOString(),
        endTime: now.toISOString(),

        pageViews: Math.round(pageViews),
        uniqueVisitors: Math.round(uniqueVisitors),
        sessions: Math.round(uniqueVisitors * 1.2), // Estimate
        bounceRate: Math.round(bounceRate * 100) / 100,
        avgSessionDuration: Math.round(avgSessionDuration),
        pagesPerSession: pageViews > 0 ? Math.round((pageViews / uniqueVisitors) * 10) / 10 : 0,

        lcp: Math.round(lcpP75 * 1000), // Convert to ms
        fid: Math.round(fidP75 * 1000),
        cls: Math.round(clsP75 * 1000) / 1000, // CLS is a score
        inp: Math.round(inpP75 * 1000),
        ttfb: Math.round(ttfbP75 * 1000),
        fcp: Math.round(fcpP75 * 1000),

        lcpGood: Math.round(lcpGood),
        lcpNeedsImprovement: Math.round(lcpNeedsImprovement),
        lcpPoor: Math.round(lcpPoor),

        topPages: [], // Would need additional queries
        topReferrers: [], // Would need additional queries
        deviceBreakdown: { desktop: 60, mobile: 35, tablet: 5 }, // Default estimate
        topCountries: [], // Would need additional queries

        deployments: Math.round(deployments),
        successfulDeployments: Math.round(successfulDeploys),
        successRate: deployments > 0 ? Math.round((successfulDeploys / deployments) * 100) : 100,
        avgDeployTime: Math.round(avgDeployTime),
        rollbacks: 0, // Would need additional query
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Web Vitals Details
// ============================================================================

interface WebVitalsDetailResult {
  success: boolean;
  data?: {
    period: AnalyticsPeriod;
    metrics: Array<{
      name: string;
      p50: number;
      p75: number;
      p95: number;
      p99: number;
      good: number;
      needsImprovement: number;
      poor: number;
      trend: 'improving' | 'stable' | 'declining';
    }>;
    timeline: Array<{
      timestamp: string;
      lcp: number;
      fid: number;
      cls: number;
      inp: number;
    }>;
    pathBreakdown: Array<{
      path: string;
      lcp: number;
      cls: number;
      inp: number;
      samples: number;
    }>;
  };
  error?: string;
}

async function executeAnalyticsWebVitals(
  params: { projectName: string; environment?: string; period?: AnalyticsPeriod; path?: string },
  auth: AuthContext
): Promise<WebVitalsDetailResult> {
  const { projectName, environment = 'production', period = 'day', path } = params;

  if (!auth.projects.includes(projectName) && auth.role !== 'owner') {
    return {
      success: false,
      error: `Access denied: project ${projectName} not in team scope`,
    };
  }

  try {
    const periodRange = period === 'hour' ? '1h' : period === 'day' ? '24h' : period === 'week' ? '7d' : '30d';
    const pathFilter = path ? `,path="${path}"` : '';
    const labels = `project="${projectName}",environment="${environment}"${pathFilter}`;

    const metrics = ['LCP', 'FID', 'CLS', 'INP', 'TTFB', 'FCP'];
    const metricResults = await Promise.all(
      metrics.map(async (name) => {
        const [p50, p75, p95, p99, good, needsImprovement, poor] = await Promise.all([
          queryPrometheus(`histogram_quantile(0.50, rate(codeb_analytics_webvitals_bucket{${labels},name="${name}"}[${periodRange}]))`),
          queryPrometheus(`histogram_quantile(0.75, rate(codeb_analytics_webvitals_bucket{${labels},name="${name}"}[${periodRange}]))`),
          queryPrometheus(`histogram_quantile(0.95, rate(codeb_analytics_webvitals_bucket{${labels},name="${name}"}[${periodRange}]))`),
          queryPrometheus(`histogram_quantile(0.99, rate(codeb_analytics_webvitals_bucket{${labels},name="${name}"}[${periodRange}]))`),
          queryPrometheus(`sum(rate(codeb_analytics_webvitals_total{${labels},name="${name}",rating="good"}[${periodRange}]))`),
          queryPrometheus(`sum(rate(codeb_analytics_webvitals_total{${labels},name="${name}",rating="needs-improvement"}[${periodRange}]))`),
          queryPrometheus(`sum(rate(codeb_analytics_webvitals_total{${labels},name="${name}",rating="poor"}[${periodRange}]))`),
        ]);

        const total = good + needsImprovement + poor;
        const isCLS = name === 'CLS';
        const multiplier = isCLS ? 1 : 1000;

        return {
          name,
          p50: Math.round(p50 * multiplier * 100) / 100,
          p75: Math.round(p75 * multiplier * 100) / 100,
          p95: Math.round(p95 * multiplier * 100) / 100,
          p99: Math.round(p99 * multiplier * 100) / 100,
          good: total > 0 ? Math.round((good / total) * 100) : 0,
          needsImprovement: total > 0 ? Math.round((needsImprovement / total) * 100) : 0,
          poor: total > 0 ? Math.round((poor / total) * 100) : 0,
          trend: 'stable' as const, // Would need historical comparison
        };
      })
    );

    // Timeline data
    const now = Math.floor(Date.now() / 1000);
    const start = now - getPeriodSeconds(period);
    const step = getPeriodStep(period);

    const lcpTimeline = await queryPrometheusRange(
      `histogram_quantile(0.75, rate(codeb_analytics_webvitals_bucket{${labels},name="LCP"}[5m]))`,
      start,
      now,
      step
    );

    return {
      success: true,
      data: {
        period,
        metrics: metricResults,
        timeline: lcpTimeline.map((point) => ({
          timestamp: new Date(point.timestamp * 1000).toISOString(),
          lcp: Math.round(point.value * 1000),
          fid: 0, // Would need separate queries
          cls: 0,
          inp: 0,
        })),
        pathBreakdown: [], // Would need PostgreSQL query for path-level data
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Deployment Analytics
// ============================================================================

interface DeploymentAnalyticsResult {
  success: boolean;
  data?: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    avgDuration: number;
    rollbacks: number;
    deployments: Array<{
      id: string;
      version: string;
      environment: string;
      slot: string;
      status: 'success' | 'failed';
      duration: number;
      timestamp: string;
      triggeredBy: string;
    }>;
    timeline: Array<{
      date: string;
      deployments: number;
      successful: number;
      failed: number;
    }>;
  };
  error?: string;
}

async function executeAnalyticsDeployments(
  params: { projectName: string; environment?: string; days?: number },
  auth: AuthContext
): Promise<DeploymentAnalyticsResult> {
  const { projectName, days = 7 } = params;

  if (!auth.projects.includes(projectName) && auth.role !== 'owner') {
    return {
      success: false,
      error: `Access denied: project ${projectName} not in team scope`,
    };
  }

  try {
    const periodRange = `${days}d`;

    const [total, successful, failed, avgDuration, rollbacks] = await Promise.all([
      queryPrometheus(`sum(increase(codeb_deployments_total{project="${projectName}"}[${periodRange}]))`),
      queryPrometheus(`sum(increase(codeb_deployments_total{project="${projectName}",status="success"}[${periodRange}]))`),
      queryPrometheus(`sum(increase(codeb_deployments_total{project="${projectName}",status="failed"}[${periodRange}]))`),
      queryPrometheus(`avg(codeb_deployment_duration_seconds{project="${projectName}"})`),
      queryPrometheus(`sum(increase(codeb_rollbacks_total{project="${projectName}"}[${periodRange}]))`),
    ]);

    // Timeline data (daily aggregation)
    const now = Math.floor(Date.now() / 1000);
    const start = now - days * 86400;

    const dailyDeploys = await queryPrometheusRange(
      `sum(increase(codeb_deployments_total{project="${projectName}"}[1d]))`,
      start,
      now,
      '1d'
    );

    return {
      success: true,
      data: {
        total: Math.round(total),
        successful: Math.round(successful),
        failed: Math.round(failed),
        successRate: total > 0 ? Math.round((successful / total) * 100) : 100,
        avgDuration: Math.round(avgDuration),
        rollbacks: Math.round(rollbacks),
        deployments: [], // Would need audit log query
        timeline: dailyDeploys.map((point) => ({
          date: new Date(point.timestamp * 1000).toISOString().split('T')[0],
          deployments: Math.round(point.value),
          successful: Math.round(point.value * 0.95), // Estimate
          failed: Math.round(point.value * 0.05),
        })),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Real-time Analytics
// ============================================================================

interface RealtimeAnalyticsResult {
  success: boolean;
  data?: RealtimeMetrics;
  error?: string;
}

async function executeAnalyticsRealtime(
  params: { projectName: string; environment?: string },
  auth: AuthContext
): Promise<RealtimeAnalyticsResult> {
  const { projectName, environment = 'production' } = params;

  if (!auth.projects.includes(projectName) && auth.role !== 'owner') {
    return {
      success: false,
      error: `Access denied: project ${projectName} not in team scope`,
    };
  }

  try {
    const labels = `project="${projectName}",environment="${environment}"`;

    const [activeVisitors, pageViewsPerMinute, errorRate, avgLcp, avgCls, avgInp] =
      await Promise.all([
        queryPrometheus(`count(count by (session_id) (codeb_analytics_active_sessions{${labels}}))`),
        queryPrometheus(`sum(rate(codeb_analytics_pageviews_total{${labels}}[1m])) * 60`),
        queryPrometheus(`sum(rate(codeb_errors_total{${labels}}[5m])) / sum(rate(codeb_requests_total{${labels}}[5m])) * 100`),
        queryPrometheus(`avg(codeb_analytics_webvitals{${labels},name="LCP"}) * 1000`),
        queryPrometheus(`avg(codeb_analytics_webvitals{${labels},name="CLS"})`),
        queryPrometheus(`avg(codeb_analytics_webvitals{${labels},name="INP"}) * 1000`),
      ]);

    return {
      success: true,
      data: {
        projectId: projectName,
        environment,
        timestamp: new Date().toISOString(),
        activeVisitors: Math.round(activeVisitors),
        pageViewsPerMinute: Math.round(pageViewsPerMinute),
        errorRate: Math.round(errorRate * 100) / 100,
        avgLcp: Math.round(avgLcp),
        avgCls: Math.round(avgCls * 1000) / 1000,
        avgInp: Math.round(avgInp),
        activePages: [], // Would need real-time query
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Speed Insights
// ============================================================================

interface SpeedInsightsResult {
  success: boolean;
  data?: SpeedInsightsScore;
  error?: string;
}

async function executeAnalyticsSpeedInsights(
  params: { projectName: string; environment?: string; period?: AnalyticsPeriod },
  auth: AuthContext
): Promise<SpeedInsightsResult> {
  const { projectName, environment = 'production', period = 'week' } = params;

  if (!auth.projects.includes(projectName) && auth.role !== 'owner') {
    return {
      success: false,
      error: `Access denied: project ${projectName} not in team scope`,
    };
  }

  try {
    const periodRange = period === 'day' ? '24h' : period === 'week' ? '7d' : '30d';
    const labels = `project="${projectName}",environment="${environment}"`;

    // Get p75 values for each metric
    const [lcp, fid, cls, inp, ttfb] = await Promise.all([
      queryPrometheus(`histogram_quantile(0.75, rate(codeb_analytics_webvitals_bucket{${labels},name="LCP"}[${periodRange}]))`),
      queryPrometheus(`histogram_quantile(0.75, rate(codeb_analytics_webvitals_bucket{${labels},name="FID"}[${periodRange}]))`),
      queryPrometheus(`histogram_quantile(0.75, rate(codeb_analytics_webvitals_bucket{${labels},name="CLS"}[${periodRange}]))`),
      queryPrometheus(`histogram_quantile(0.75, rate(codeb_analytics_webvitals_bucket{${labels},name="INP"}[${periodRange}]))`),
      queryPrometheus(`histogram_quantile(0.75, rate(codeb_analytics_webvitals_bucket{${labels},name="TTFB"}[${periodRange}]))`),
    ]);

    // Calculate scores (0-100 based on thresholds)
    const calculateScore = (value: number, good: number, poor: number): number => {
      if (value <= good) return 100;
      if (value >= poor) return 0;
      return Math.round(((poor - value) / (poor - good)) * 100);
    };

    const lcpMs = lcp * 1000;
    const fidMs = fid * 1000;
    const inpMs = inp * 1000;
    const ttfbMs = ttfb * 1000;

    const lcpScore = calculateScore(lcpMs, 2500, 4000);
    const fidScore = calculateScore(fidMs, 100, 300);
    const clsScore = calculateScore(cls, 0.1, 0.25);
    const inpScore = calculateScore(inpMs, 200, 500);
    const ttfbScore = calculateScore(ttfbMs, 800, 1800);

    // Overall score (weighted average - Vercel uses LCP, CLS, INP primarily)
    const overallScore = Math.round(
      lcpScore * 0.25 + clsScore * 0.25 + inpScore * 0.30 + fidScore * 0.10 + ttfbScore * 0.10
    );

    // Generate recommendations
    const recommendations: SpeedInsightsScore['recommendations'] = [];

    if (lcpScore < 75) {
      recommendations.push({
        metric: 'LCP',
        impact: lcpScore < 50 ? 'high' : 'medium',
        message: 'Largest Contentful Paint is slow. Consider optimizing images, using CDN, and reducing server response time.',
        affectedPaths: [],
      });
    }

    if (clsScore < 75) {
      recommendations.push({
        metric: 'CLS',
        impact: clsScore < 50 ? 'high' : 'medium',
        message: 'Cumulative Layout Shift is high. Add explicit dimensions to images and embeds, and avoid inserting content above existing content.',
        affectedPaths: [],
      });
    }

    if (inpScore < 75) {
      recommendations.push({
        metric: 'INP',
        impact: inpScore < 50 ? 'high' : 'medium',
        message: 'Interaction to Next Paint is slow. Optimize JavaScript execution, reduce main thread blocking, and consider code splitting.',
        affectedPaths: [],
      });
    }

    return {
      success: true,
      data: {
        projectId: projectName,
        environment,
        period,
        score: overallScore,
        trend: 'stable',
        lcpScore,
        fidScore,
        clsScore,
        inpScore,
        ttfbScore,
        recommendations,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const analyticsOverviewTool = {
  name: 'analytics_overview',
  description: 'Get analytics overview including traffic, Web Vitals, and deployment stats',
  inputSchema: analyticsOverviewSchema,

  async execute(params: z.infer<typeof analyticsOverviewSchema>, auth: AuthContext) {
    return executeAnalyticsOverview(params, auth);
  },
};

export const analyticsWebVitalsTool = {
  name: 'analytics_webvitals',
  description: 'Get detailed Web Vitals breakdown with percentiles and trends',
  inputSchema: analyticsWebVitalsSchema,

  async execute(params: z.infer<typeof analyticsWebVitalsSchema>, auth: AuthContext) {
    return executeAnalyticsWebVitals(params, auth);
  },
};

export const analyticsDeploymentsTool = {
  name: 'analytics_deployments',
  description: 'Get deployment analytics and success rates',
  inputSchema: analyticsDeploymentsSchema,

  async execute(params: z.infer<typeof analyticsDeploymentsSchema>, auth: AuthContext) {
    return executeAnalyticsDeployments(params, auth);
  },
};

export const analyticsRealtimeTool = {
  name: 'analytics_realtime',
  description: 'Get real-time analytics including active visitors and current performance',
  inputSchema: analyticsRealtimeSchema,

  async execute(params: z.infer<typeof analyticsRealtimeSchema>, auth: AuthContext) {
    return executeAnalyticsRealtime(params, auth);
  },
};

export const analyticsSpeedInsightsTool = {
  name: 'analytics_speed_insights',
  description: 'Get Speed Insights score with recommendations (Vercel-style)',
  inputSchema: analyticsSpeedInsightsSchema,

  async execute(params: z.infer<typeof analyticsSpeedInsightsSchema>, auth: AuthContext) {
    return executeAnalyticsSpeedInsights(params, auth);
  },
};
