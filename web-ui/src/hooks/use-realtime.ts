"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Centrifuge, Subscription, PublicationContext } from "centrifuge";
import { CHANNELS, getClientConfig, SlotEvent } from "@/lib/centrifugo";
import { realtimeApi, SlotRegistry } from "@/lib/api";

interface UseRealtimeOptions {
  autoConnect?: boolean;
  onError?: (error: Error) => void;
}

interface RealtimeState {
  connected: boolean;
  connecting: boolean;
  error: Error | null;
}

/**
 * Centrifugo 실시간 연결 훅
 */
export function useRealtime(options: UseRealtimeOptions = {}) {
  const { autoConnect = true, onError } = options;
  const [state, setState] = useState<RealtimeState>({
    connected: false,
    connecting: false,
    error: null,
  });

  const centrifugeRef = useRef<Centrifuge | null>(null);
  const subscriptionsRef = useRef<Map<string, Subscription>>(new Map());

  const connect = useCallback(async () => {
    if (centrifugeRef.current?.state === "connected") return;

    setState((prev) => ({ ...prev, connecting: true, error: null }));

    try {
      const { token, url } = await realtimeApi.getToken();
      const config = getClientConfig();

      const centrifuge = new Centrifuge(url || config.url, {
        token,
      });

      centrifuge.on("connected", () => {
        setState({ connected: true, connecting: false, error: null });
      });

      centrifuge.on("disconnected", () => {
        setState({ connected: false, connecting: false, error: null });
      });

      centrifuge.on("error", (ctx) => {
        const error = new Error(ctx.error?.message || "Connection error");
        setState((prev) => ({ ...prev, error }));
        onError?.(error);
      });

      centrifuge.connect();
      centrifugeRef.current = centrifuge;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Connection failed");
      setState({ connected: false, connecting: false, error: err });
      onError?.(err);
    }
  }, [onError]);

  const disconnect = useCallback(() => {
    if (centrifugeRef.current) {
      // Unsubscribe from all channels
      subscriptionsRef.current.forEach((sub) => sub.unsubscribe());
      subscriptionsRef.current.clear();

      centrifugeRef.current.disconnect();
      centrifugeRef.current = null;
    }
    setState({ connected: false, connecting: false, error: null });
  }, []);

  const subscribe = useCallback(
    <T = unknown>(
      channel: string,
      onMessage: (data: T) => void
    ): (() => void) => {
      if (!centrifugeRef.current) {
        console.warn("Cannot subscribe: not connected");
        return () => {};
      }

      // Reuse existing subscription if available
      let subscription = subscriptionsRef.current.get(channel);
      if (!subscription) {
        subscription = centrifugeRef.current.newSubscription(channel);
        subscriptionsRef.current.set(channel, subscription);
      }

      const handler = (ctx: PublicationContext) => {
        onMessage(ctx.data as T);
      };

      subscription.on("publication", handler);
      subscription.subscribe();

      return () => {
        subscription?.removeListener("publication", handler);
        if (subscription?.listeners("publication").length === 0) {
          subscription.unsubscribe();
          subscriptionsRef.current.delete(channel);
        }
      };
    },
    []
  );

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    subscribe,
    centrifuge: centrifugeRef.current,
  };
}

/**
 * 슬롯 이벤트 구독 훅
 */
export function useSlotEvents(
  project?: string,
  environment?: string,
  onEvent?: (event: SlotEvent) => void
) {
  const [events, setEvents] = useState<SlotEvent[]>([]);
  const [latestEvent, setLatestEvent] = useState<SlotEvent | null>(null);
  const { connected, subscribe } = useRealtime();

  useEffect(() => {
    if (!connected) return;

    const channel = project && environment
      ? CHANNELS.SLOT(project, environment)
      : CHANNELS.SLOT_ALL;

    const unsubscribe = subscribe<SlotEvent>(channel, (event) => {
      setEvents((prev) => [...prev.slice(-99), event]); // Keep last 100 events
      setLatestEvent(event);
      onEvent?.(event);
    });

    return unsubscribe;
  }, [connected, subscribe, project, environment, onEvent]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setLatestEvent(null);
  }, []);

  return {
    events,
    latestEvent,
    clearEvents,
    connected,
  };
}

/**
 * 배포 실시간 로그 훅
 */
export function useDeploymentLogs(project: string, environment: string) {
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "deploying" | "success" | "error">("idle");
  const { connected, subscribe } = useRealtime();

  useEffect(() => {
    if (!connected) return;

    const unsubscribeDeploy = subscribe<SlotEvent>(
      CHANNELS.DEPLOY(project),
      (event) => {
        if (event.environment !== environment) return;

        setLogs((prev) => [...prev, `[${event.type}] ${event.message}`]);
        if (event.progress !== undefined) {
          setProgress(event.progress);
        }

        if (event.type === "deploy_start") {
          setStatus("deploying");
        } else if (event.type === "deploy_complete") {
          setStatus("success");
        }
      }
    );

    const unsubscribeLogs = subscribe<{ message: string }>(
      CHANNELS.LOGS(project, environment),
      (event) => {
        setLogs((prev) => [...prev, event.message]);
      }
    );

    return () => {
      unsubscribeDeploy();
      unsubscribeLogs();
    };
  }, [connected, subscribe, project, environment]);

  const clearLogs = useCallback(() => {
    setLogs([]);
    setProgress(0);
    setStatus("idle");
  }, []);

  return {
    logs,
    progress,
    status,
    clearLogs,
    connected,
  };
}

/**
 * 시스템 알림 훅
 */
export function useSystemAlerts() {
  const [alerts, setAlerts] = useState<Array<{
    id: string;
    type: "info" | "success" | "warning" | "error";
    title: string;
    message: string;
    timestamp: string;
  }>>([]);
  const { connected, subscribe } = useRealtime();

  useEffect(() => {
    if (!connected) return;

    const unsubscribe = subscribe(CHANNELS.SYSTEM, (event: any) => {
      const alert = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: event.type || "info",
        title: event.title || "System Alert",
        message: event.message,
        timestamp: event.timestamp || new Date().toISOString(),
      };
      setAlerts((prev) => [...prev.slice(-49), alert]); // Keep last 50 alerts
    });

    return unsubscribe;
  }, [connected, subscribe]);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  return {
    alerts,
    dismissAlert,
    clearAlerts,
    connected,
  };
}

/**
 * 슬롯 상태 실시간 업데이트 훅
 */
export function useSlotRegistry(
  initialRegistry: SlotRegistry | null,
  project?: string,
  environment?: string
) {
  const [registry, setRegistry] = useState<SlotRegistry | null>(initialRegistry);
  const { connected, subscribe } = useRealtime();

  useEffect(() => {
    if (!connected || !project || !environment) return;

    const unsubscribe = subscribe<SlotEvent>(
      CHANNELS.SLOT(project, environment),
      (event) => {
        setRegistry((prev) => {
          if (!prev) return prev;

          const slot = event.slot;
          const updates: Partial<SlotRegistry> = {
            lastUpdated: event.timestamp,
          };

          // Update slot state based on event
          if (slot === "blue" || slot === "green") {
            updates[slot] = {
              ...prev[slot],
              state: event.state,
              version: event.version || prev[slot].version,
              healthStatus: event.healthStatus || prev[slot].healthStatus,
            };
          }

          // Update active slot on promote
          if (event.type === "promote") {
            updates.activeSlot = event.slot;
          }

          // Update active slot on rollback
          if (event.type === "rollback" && event.previousSlot) {
            updates.activeSlot = event.slot;
          }

          return { ...prev, ...updates };
        });
      }
    );

    return unsubscribe;
  }, [connected, subscribe, project, environment]);

  return registry;
}
