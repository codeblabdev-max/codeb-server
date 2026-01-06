/**
 * CodeB Analytics - Next.js Integration
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { Analytics } from '@codeb/analytics/next';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         {children}
 *         <Analytics projectId="my-app" />
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */

'use client';

import React, { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation.js';
import { CodeBAnalytics, type CodeBAnalyticsConfig } from './index.js';

// ============================================================================
// Analytics Component (App Router)
// ============================================================================

export interface AnalyticsProps extends Omit<CodeBAnalyticsConfig, 'projectId'> {
  /** Project ID (required) */
  projectId: string;
  /** Only load in production */
  productionOnly?: boolean;
}

/**
 * Analytics component for Next.js App Router
 *
 * Place this in your root layout to automatically track:
 * - Web Vitals (LCP, FID, CLS, INP, TTFB, FCP)
 * - Page views (with route change detection)
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { Analytics } from '@codeb/analytics/next';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         {children}
 *         <Analytics projectId="my-app" />
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function Analytics({
  projectId,
  productionOnly = true,
  ...config
}: AnalyticsProps): JSX.Element | null {
  const analyticsRef = useRef<CodeBAnalytics | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize analytics
  useEffect(() => {
    // Skip in development if productionOnly
    if (productionOnly && process.env.NODE_ENV !== 'production') {
      return;
    }

    const analytics = new CodeBAnalytics({
      projectId,
      environment: getEnvironment(),
      ...config,
    });

    analytics.start();
    analyticsRef.current = analytics;

    return () => {
      analytics.stop();
    };
  }, [projectId]);

  // Track page views on route change
  useEffect(() => {
    if (!analyticsRef.current) return;

    const url = pathname + (searchParams?.toString() ? `?${searchParams}` : '');
    analyticsRef.current.trackPageView(url);
  }, [pathname, searchParams]);

  // This component renders nothing
  return null;
}

// ============================================================================
// Web Vitals Reporter (for Pages Router)
// ============================================================================

/**
 * Web Vitals reporter for Pages Router
 *
 * Use this in _app.tsx:
 *
 * @example
 * ```tsx
 * // pages/_app.tsx
 * import { reportWebVitals } from '@codeb/analytics/next';
 *
 * export { reportWebVitals };
 *
 * export default function App({ Component, pageProps }) {
 *   return <Component {...pageProps} />;
 * }
 * ```
 */
export function reportWebVitals(metric: {
  id: string;
  name: string;
  value: number;
  label: 'web-vital' | 'custom';
  startTime: number;
}): void {
  // Get project ID from environment or window
  const projectId =
    process.env.NEXT_PUBLIC_CODEB_PROJECT_ID ||
    (typeof window !== 'undefined' ? (window as any).__CODEB_PROJECT_ID__ : null);

  if (!projectId) {
    console.warn('[CodeB Analytics] Missing project ID. Set NEXT_PUBLIC_CODEB_PROJECT_ID');
    return;
  }

  // Only report web vitals
  if (metric.label !== 'web-vital') {
    return;
  }

  // Map Next.js metric to our format
  const webVital = {
    name: metric.name,
    value: metric.value,
    id: metric.id,
    // Determine rating based on metric type and value
    rating: getRating(metric.name, metric.value),
  };

  // Send to analytics endpoint
  const endpoint =
    process.env.NEXT_PUBLIC_CODEB_ANALYTICS_ENDPOINT ||
    'https://analytics.codeb.dev/api/ingest';

  const payload = {
    projectId,
    environment: getEnvironment(),
    sessionId: getSessionId(projectId),
    webVitals: [webVital],
    meta: {
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      viewport: {
        width: typeof window !== 'undefined' ? window.innerWidth : 0,
        height: typeof window !== 'undefined' ? window.innerHeight : 0,
      },
    },
  };

  // Use sendBeacon for reliability
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    navigator.sendBeacon(endpoint, blob);
  }
}

// ============================================================================
// Middleware (for Edge Analytics)
// ============================================================================

/**
 * Create analytics middleware for edge tracking
 *
 * @example
 * ```ts
 * // middleware.ts
 * import { createAnalyticsMiddleware } from '@codeb/analytics/next';
 *
 * export const middleware = createAnalyticsMiddleware({
 *   projectId: 'my-app',
 * });
 *
 * export const config = {
 *   matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
 * };
 * ```
 */
export function createAnalyticsMiddleware(options: {
  projectId: string;
  sampleRate?: number;
}) {
  return async function analyticsMiddleware(request: Request): Promise<Response | void> {
    const { projectId, sampleRate = 1.0 } = options;

    // Sample check
    if (Math.random() > sampleRate) {
      return;
    }

    // Track page view at edge
    const url = new URL(request.url);
    const pageView = {
      projectId,
      environment: getEnvironment(),
      type: 'pageview',
      path: url.pathname,
      timestamp: new Date().toISOString(),
      meta: {
        url: request.url,
        userAgent: request.headers.get('user-agent') || '',
        ip: request.headers.get('x-forwarded-for') || '',
        country: request.headers.get('x-vercel-ip-country') || '',
        city: request.headers.get('x-vercel-ip-city') || '',
      },
    };

    // Fire and forget
    const endpoint =
      process.env.CODEB_ANALYTICS_ENDPOINT || 'https://analytics.codeb.dev/api/edge-ingest';

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pageView),
    }).catch(() => {});

    return;
  };
}

// ============================================================================
// Speed Insights Component
// ============================================================================

export interface SpeedInsightsProps {
  /** Project ID */
  projectId: string;
  /** Only show in production */
  productionOnly?: boolean;
}

/**
 * Speed Insights overlay (development mode)
 *
 * Shows real-time Web Vitals in a non-intrusive overlay.
 * Only visible in development mode.
 */
export function SpeedInsights({
  projectId,
  productionOnly = false,
}: SpeedInsightsProps): JSX.Element | null {
  const [metrics, setMetrics] = React.useState<Record<string, number>>({});
  const [visible, setVisible] = React.useState(false);

  useEffect(() => {
    // Only show in development unless specified
    if (productionOnly && process.env.NODE_ENV === 'production') {
      return;
    }

    // Import web-vitals dynamically
    import('web-vitals').then(({ onCLS, onFID, onLCP, onINP, onTTFB, onFCP }) => {
      const update = (name: string) => (metric: { value: number }) => {
        setMetrics((prev) => ({ ...prev, [name]: metric.value }));
      };

      onCLS(update('CLS'));
      onFID(update('FID'));
      onLCP(update('LCP'));
      onINP(update('INP'));
      onTTFB(update('TTFB'));
      onFCP(update('FCP'));
    });

    setVisible(true);
  }, []);

  if (!visible || Object.keys(metrics).length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        background: 'rgba(0, 0, 0, 0.85)',
        color: 'white',
        padding: '12px 16px',
        borderRadius: '8px',
        fontSize: '12px',
        fontFamily: 'monospace',
        zIndex: 99999,
        backdropFilter: 'blur(8px)',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>⚡ Speed Insights</div>
      {Object.entries(metrics).map(([name, value]) => (
        <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
          <span style={{ color: '#888' }}>{name}</span>
          <span style={{ color: getRatingColor(name, value) }}>
            {formatMetricValue(name, value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getEnvironment(): 'production' | 'staging' | 'preview' {
  if (typeof process !== 'undefined') {
    if (process.env.VERCEL_ENV === 'production') return 'production';
    if (process.env.VERCEL_ENV === 'preview') return 'preview';
    if (process.env.NODE_ENV === 'production') return 'production';
  }
  return 'staging';
}

function getSessionId(projectId: string): string {
  if (typeof window === 'undefined') {
    return 'server-' + Math.random().toString(36).substring(2);
  }

  const key = `codeb_session_${projectId}`;
  let sessionId = sessionStorage.getItem(key);

  if (!sessionId) {
    sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    sessionStorage.setItem(key, sessionId);
  }

  return sessionId;
}

function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  // Thresholds based on Web Vitals guidelines
  const thresholds: Record<string, [number, number]> = {
    LCP: [2500, 4000],
    FID: [100, 300],
    CLS: [0.1, 0.25],
    INP: [200, 500],
    TTFB: [800, 1800],
    FCP: [1800, 3000],
  };

  const [good, poor] = thresholds[name] || [100, 300];

  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

function getRatingColor(name: string, value: number): string {
  const rating = getRating(name, value);
  switch (rating) {
    case 'good':
      return '#0CCE6B';
    case 'needs-improvement':
      return '#FFA400';
    case 'poor':
      return '#FF4E42';
  }
}

function formatMetricValue(name: string, value: number): string {
  if (name === 'CLS') {
    return value.toFixed(3);
  }
  return `${Math.round(value)}ms`;
}

// Re-export types
export type { CodeBAnalyticsConfig, WebVitalsMetric } from './index.js';
