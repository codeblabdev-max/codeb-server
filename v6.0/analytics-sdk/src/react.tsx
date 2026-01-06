/**
 * CodeB Analytics - React Integration
 *
 * @example
 * ```tsx
 * import { AnalyticsProvider, useAnalytics } from '@codeb/analytics/react';
 *
 * function App() {
 *   return (
 *     <AnalyticsProvider projectId="my-app">
 *       <MyComponent />
 *     </AnalyticsProvider>
 *   );
 * }
 *
 * function MyComponent() {
 *   const { track } = useAnalytics();
 *
 *   return (
 *     <button onClick={() => track('button_clicked')}>
 *       Click me
 *     </button>
 *   );
 * }
 * ```
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { CodeBAnalytics, type CodeBAnalyticsConfig } from './index.js';

// ============================================================================
// Context
// ============================================================================

interface AnalyticsContextValue {
  analytics: CodeBAnalytics | null;
  track: (name: string, properties?: Record<string, unknown>) => void;
  identify: (userId: string) => void;
  trackPageView: (path?: string) => void;
}

const AnalyticsContext = createContext<AnalyticsContextValue>({
  analytics: null,
  track: () => {},
  identify: () => {},
  trackPageView: () => {},
});

// ============================================================================
// Provider
// ============================================================================

export interface AnalyticsProviderProps extends Omit<CodeBAnalyticsConfig, 'projectId'> {
  /** Project ID (required) */
  projectId: string;
  /** React children */
  children: ReactNode;
}

export function AnalyticsProvider({
  children,
  projectId,
  ...config
}: AnalyticsProviderProps): JSX.Element {
  const analyticsRef = useRef<CodeBAnalytics | null>(null);

  useEffect(() => {
    // Only initialize on client side
    if (typeof window === 'undefined') return;

    const analytics = new CodeBAnalytics({
      projectId,
      ...config,
    });

    analytics.start();
    analyticsRef.current = analytics;

    return () => {
      analytics.stop();
    };
  }, [projectId]);

  const value: AnalyticsContextValue = {
    analytics: analyticsRef.current,
    track: (name, properties) => {
      analyticsRef.current?.track(name, properties);
    },
    identify: (userId) => {
      analyticsRef.current?.identify(userId);
    },
    trackPageView: (path) => {
      analyticsRef.current?.trackPageView(path);
    },
  };

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to access analytics methods
 */
export function useAnalytics(): AnalyticsContextValue {
  const context = useContext(AnalyticsContext);

  if (!context) {
    console.warn('[CodeB Analytics] useAnalytics must be used within AnalyticsProvider');
  }

  return context;
}

/**
 * Hook to track events with automatic cleanup
 */
export function useTrackEvent(
  name: string,
  properties?: Record<string, unknown>,
  options?: { trackOnMount?: boolean }
): () => void {
  const { track } = useAnalytics();

  useEffect(() => {
    if (options?.trackOnMount) {
      track(name, properties);
    }
  }, []);

  return () => track(name, properties);
}

/**
 * Hook to track page views on route change
 */
export function useTrackPageView(path?: string): void {
  const { trackPageView } = useAnalytics();

  useEffect(() => {
    trackPageView(path);
  }, [path]);
}

/**
 * Hook to identify user
 */
export function useIdentify(userId: string | null | undefined): void {
  const { identify } = useAnalytics();

  useEffect(() => {
    if (userId) {
      identify(userId);
    }
  }, [userId]);
}

// ============================================================================
// Components
// ============================================================================

interface TrackClickProps {
  /** Event name */
  event: string;
  /** Event properties */
  properties?: Record<string, unknown>;
  /** Children (must accept onClick) */
  children: React.ReactElement;
}

/**
 * Component to track clicks
 *
 * @example
 * ```tsx
 * <TrackClick event="signup_clicked" properties={{ source: 'header' }}>
 *   <button>Sign Up</button>
 * </TrackClick>
 * ```
 */
export function TrackClick({
  event,
  properties,
  children,
}: TrackClickProps): JSX.Element {
  const { track } = useAnalytics();

  return React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      track(event, properties);
      children.props.onClick?.(e);
    },
  });
}

interface TrackViewProps {
  /** Event name */
  event: string;
  /** Event properties */
  properties?: Record<string, unknown>;
  /** Threshold for intersection observer (0-1) */
  threshold?: number;
  /** Only track once */
  once?: boolean;
  /** Children to wrap */
  children: ReactNode;
}

/**
 * Component to track element visibility
 *
 * @example
 * ```tsx
 * <TrackView event="pricing_viewed" once>
 *   <PricingSection />
 * </TrackView>
 * ```
 */
export function TrackView({
  event,
  properties,
  threshold = 0.5,
  once = true,
  children,
}: TrackViewProps): JSX.Element {
  const { track } = useAnalytics();
  const ref = useRef<HTMLDivElement>(null);
  const trackedRef = useRef(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (once && trackedRef.current) return;

            track(event, properties);
            trackedRef.current = true;

            if (once) {
              observer.disconnect();
            }
          }
        });
      },
      { threshold }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [event, properties, threshold, once]);

  return <div ref={ref}>{children}</div>;
}

// Re-export main types
export type { CodeBAnalyticsConfig, WebVitalsMetric } from './index.js';
