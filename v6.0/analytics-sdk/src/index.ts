/**
 * CodeB Analytics SDK
 * Web Vitals and custom metrics collection
 *
 * @example
 * ```ts
 * import { CodeBAnalytics } from '@codeb/analytics';
 *
 * const analytics = new CodeBAnalytics({
 *   projectId: 'my-app',
 *   environment: 'production',
 * });
 *
 * // Auto-tracks Web Vitals
 * analytics.start();
 *
 * // Track custom events
 * analytics.track('button_click', { buttonId: 'signup' });
 * ```
 */

import { onCLS, onFID, onLCP, onINP, onTTFB, onFCP, type Metric } from 'web-vitals';

// ============================================================================
// Types
// ============================================================================

export interface CodeBAnalyticsConfig {
  /** Project ID (required) */
  projectId: string;
  /** Environment (default: 'production') */
  environment?: 'production' | 'staging' | 'preview';
  /** Analytics endpoint (default: CodeB intake server) */
  endpoint?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Sampling rate 0-1 (default: 1.0 = 100%) */
  sampleRate?: number;
  /** Disable automatic Web Vitals tracking */
  disableWebVitals?: boolean;
  /** Disable automatic page view tracking */
  disablePageViews?: boolean;
  /** Custom headers for requests */
  headers?: Record<string, string>;
}

export interface WebVitalsMetric {
  name: 'CLS' | 'FID' | 'LCP' | 'INP' | 'TTFB' | 'FCP';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
  navigationType: string;
}

export interface PageViewEvent {
  type: 'pageview';
  path: string;
  referrer: string;
  title: string;
  timestamp: string;
}

export interface CustomEvent {
  type: 'event';
  name: string;
  properties?: Record<string, unknown>;
  timestamp: string;
}

export interface AnalyticsPayload {
  projectId: string;
  environment: string;
  sessionId: string;
  userId?: string;
  webVitals?: WebVitalsMetric[];
  pageViews?: PageViewEvent[];
  events?: CustomEvent[];
  meta: {
    url: string;
    userAgent: string;
    viewport: { width: number; height: number };
    connection?: string;
    deviceMemory?: number;
  };
}

// ============================================================================
// Analytics Class
// ============================================================================

export class CodeBAnalytics {
  private config: Required<Omit<CodeBAnalyticsConfig, 'headers'>> & { headers?: Record<string, string> };
  private sessionId: string;
  private userId?: string;
  private buffer: {
    webVitals: WebVitalsMetric[];
    pageViews: PageViewEvent[];
    events: CustomEvent[];
  };
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private isStarted = false;

  constructor(config: CodeBAnalyticsConfig) {
    this.config = {
      projectId: config.projectId,
      environment: config.environment || 'production',
      endpoint: config.endpoint || 'https://analytics.codeb.dev/api/ingest',
      debug: config.debug || false,
      sampleRate: config.sampleRate ?? 1.0,
      disableWebVitals: config.disableWebVitals || false,
      disablePageViews: config.disablePageViews || false,
      headers: config.headers,
    };

    this.sessionId = this.getOrCreateSessionId();
    this.buffer = {
      webVitals: [],
      pageViews: [],
      events: [],
    };

    // Check if this session should be sampled
    if (!this.shouldSample()) {
      this.log('Session not sampled, analytics disabled');
    }
  }

  /**
   * Start tracking analytics
   */
  start(): void {
    if (this.isStarted) return;
    if (typeof window === 'undefined') return;
    if (!this.shouldSample()) return;

    this.isStarted = true;
    this.log('Analytics started');

    // Track Web Vitals
    if (!this.config.disableWebVitals) {
      this.trackWebVitals();
    }

    // Track initial page view
    if (!this.config.disablePageViews) {
      this.trackPageView();
      this.setupPageViewTracking();
    }

    // Start flush interval (every 10 seconds)
    this.flushInterval = setInterval(() => this.flush(), 10000);

    // Flush on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flush(true);
        }
      });

      window.addEventListener('pagehide', () => {
        this.flush(true);
      });
    }
  }

  /**
   * Stop tracking analytics
   */
  stop(): void {
    if (!this.isStarted) return;

    this.isStarted = false;
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    this.flush(true);
    this.log('Analytics stopped');
  }

  /**
   * Track custom event
   */
  track(name: string, properties?: Record<string, unknown>): void {
    if (!this.isStarted || !this.shouldSample()) return;

    this.buffer.events.push({
      type: 'event',
      name,
      properties,
      timestamp: new Date().toISOString(),
    });

    this.log(`Event tracked: ${name}`, properties);
  }

  /**
   * Identify user
   */
  identify(userId: string): void {
    this.userId = userId;
    this.log(`User identified: ${userId}`);
  }

  /**
   * Manually track page view
   */
  trackPageView(path?: string): void {
    if (!this.shouldSample()) return;

    const pageView: PageViewEvent = {
      type: 'pageview',
      path: path || window.location.pathname,
      referrer: document.referrer,
      title: document.title,
      timestamp: new Date().toISOString(),
    };

    this.buffer.pageViews.push(pageView);
    this.log('Page view tracked:', pageView.path);
  }

  /**
   * Flush buffered data to server
   */
  async flush(useBeacon = false): Promise<void> {
    if (
      this.buffer.webVitals.length === 0 &&
      this.buffer.pageViews.length === 0 &&
      this.buffer.events.length === 0
    ) {
      return;
    }

    const payload: AnalyticsPayload = {
      projectId: this.config.projectId,
      environment: this.config.environment,
      sessionId: this.sessionId,
      userId: this.userId,
      webVitals: this.buffer.webVitals,
      pageViews: this.buffer.pageViews,
      events: this.buffer.events,
      meta: this.getMetadata(),
    };

    // Clear buffer
    this.buffer = {
      webVitals: [],
      pageViews: [],
      events: [],
    };

    try {
      if (useBeacon && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon(this.config.endpoint, blob);
        this.log('Flushed via beacon');
      } else {
        await fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.config.headers,
          },
          body: JSON.stringify(payload),
          keepalive: true,
        });
        this.log('Flushed via fetch');
      }
    } catch (error) {
      this.log('Flush error:', error);
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private trackWebVitals(): void {
    const handleMetric = (metric: Metric) => {
      const webVital: WebVitalsMetric = {
        name: metric.name as WebVitalsMetric['name'],
        value: metric.value,
        rating: metric.rating,
        delta: metric.delta,
        id: metric.id,
        navigationType: metric.navigationType,
      };

      this.buffer.webVitals.push(webVital);
      this.log(`Web Vital: ${metric.name} = ${metric.value} (${metric.rating})`);
    };

    onCLS(handleMetric);
    onFID(handleMetric);
    onLCP(handleMetric);
    onINP(handleMetric);
    onTTFB(handleMetric);
    onFCP(handleMetric);
  }

  private setupPageViewTracking(): void {
    // Track SPA navigation
    if (typeof window !== 'undefined') {
      // History API
      const originalPushState = history.pushState;
      history.pushState = (...args) => {
        originalPushState.apply(history, args);
        this.trackPageView();
      };

      const originalReplaceState = history.replaceState;
      history.replaceState = (...args) => {
        originalReplaceState.apply(history, args);
        this.trackPageView();
      };

      // Popstate
      window.addEventListener('popstate', () => {
        this.trackPageView();
      });
    }
  }

  private getOrCreateSessionId(): string {
    if (typeof window === 'undefined') {
      return this.generateId();
    }

    const key = `codeb_session_${this.config.projectId}`;
    let sessionId = sessionStorage.getItem(key);

    if (!sessionId) {
      sessionId = this.generateId();
      sessionStorage.setItem(key, sessionId);
    }

    return sessionId;
  }

  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private shouldSample(): boolean {
    if (typeof window === 'undefined') return false;

    // Use consistent sampling based on session ID
    const hash = this.sessionId.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);

    const sampleValue = (Math.abs(hash) % 100) / 100;
    return sampleValue < this.config.sampleRate;
  }

  private getMetadata(): AnalyticsPayload['meta'] {
    const meta: AnalyticsPayload['meta'] = {
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      viewport: {
        width: typeof window !== 'undefined' ? window.innerWidth : 0,
        height: typeof window !== 'undefined' ? window.innerHeight : 0,
      },
    };

    // Network connection info
    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
      const conn = (navigator as any).connection;
      if (conn?.effectiveType) {
        meta.connection = conn.effectiveType;
      }
    }

    // Device memory
    if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
      meta.deviceMemory = (navigator as any).deviceMemory;
    }

    return meta;
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[CodeB Analytics]', ...args);
    }
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

let defaultInstance: CodeBAnalytics | null = null;

/**
 * Initialize default analytics instance
 */
export function init(config: CodeBAnalyticsConfig): CodeBAnalytics {
  defaultInstance = new CodeBAnalytics(config);
  defaultInstance.start();
  return defaultInstance;
}

/**
 * Track event on default instance
 */
export function track(name: string, properties?: Record<string, unknown>): void {
  defaultInstance?.track(name, properties);
}

/**
 * Identify user on default instance
 */
export function identify(userId: string): void {
  defaultInstance?.identify(userId);
}

/**
 * Get default instance
 */
export function getAnalytics(): CodeBAnalytics | null {
  return defaultInstance;
}

// Default export
export default CodeBAnalytics;
