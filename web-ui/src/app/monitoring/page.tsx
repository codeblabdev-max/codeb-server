"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  AlertCircle,
  CheckCircle,
  Clock,
  Server,
  RefreshCw,
} from "lucide-react";

// Mock real-time data (실제로는 WebSocket이나 Server-Sent Events 사용)
function useRealtimeMetrics() {
  const [metrics, setMetrics] = useState({
    timestamp: new Date().toISOString(),
    servers: [
      {
        id: "1",
        name: "Videopick App",
        cpu: 45,
        memory: 62,
        disk: 48,
        network: { in: 125, out: 89 },
      },
      {
        id: "2",
        name: "Streaming Server",
        cpu: 32,
        memory: 48,
        disk: 65,
        network: { in: 98, out: 142 },
      },
      {
        id: "3",
        name: "Storage Server",
        cpu: 12,
        memory: 78,
        disk: 85,
        network: { in: 45, out: 67 },
      },
      {
        id: "4",
        name: "Backup Server",
        cpu: 8,
        memory: 23,
        disk: 92,
        network: { in: 12, out: 8 },
      },
    ],
    alerts: [
      {
        id: "1",
        level: "warning" as const,
        server: "Storage Server",
        message: "Disk usage above 80% (85%)",
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
      {
        id: "2",
        level: "warning" as const,
        server: "Backup Server",
        message: "Disk usage above 90% (92%)",
        timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      },
    ],
    events: [
      {
        id: "1",
        type: "container",
        message: "Container 'videopick-web-prod' started",
        timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      },
      {
        id: "2",
        type: "deployment",
        message: "Deployment completed: api-gateway (production)",
        timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      },
      {
        id: "3",
        type: "system",
        message: "Backup completed successfully",
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
    ],
  });

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics((prev) => ({
        ...prev,
        timestamp: new Date().toISOString(),
        servers: prev.servers.map((server) => ({
          ...server,
          cpu: Math.max(
            0,
            Math.min(100, server.cpu + (Math.random() - 0.5) * 10)
          ),
          memory: Math.max(
            0,
            Math.min(100, server.memory + (Math.random() - 0.5) * 5)
          ),
          network: {
            in: Math.max(0, server.network.in + (Math.random() - 0.5) * 20),
            out: Math.max(0, server.network.out + (Math.random() - 0.5) * 20),
          },
        })),
      }));
    }, 3000); // Update every 3 seconds

    return () => clearInterval(interval);
  }, []);

  return metrics;
}

export default function MonitoringPage() {
  const metrics = useRealtimeMetrics();
  const [autoRefresh, setAutoRefresh] = useState(true);

  const getAlertIcon = (level: string) => {
    switch (level) {
      case "critical":
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case "warning":
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
      default:
        return <CheckCircle className="h-5 w-5 text-blue-600" />;
    }
  };

  const getAlertBg = (level: string) => {
    switch (level) {
      case "critical":
        return "bg-red-50 border-red-200";
      case "warning":
        return "bg-yellow-50 border-yellow-200";
      default:
        return "bg-blue-50 border-blue-200";
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="실시간 모니터링"
        description="서버 메트릭 및 알림 실시간 현황"
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Control Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm text-gray-600">
                실시간 - {new Date(metrics.timestamp).toLocaleTimeString()} 업데이트
              </span>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">자동 새로고침</span>
            </label>
          </div>
          <Button variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            지금 새로고침
          </Button>
        </div>

        {/* Server Metrics Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.servers.map((server) => (
            <Card key={server.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-gray-500" />
                    <h3 className="text-sm font-medium text-gray-900">
                      {server.name}
                    </h3>
                  </div>
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* CPU */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-1">
                      <Cpu className="h-3 w-3 text-gray-500" />
                      <span className="text-gray-600">CPU</span>
                    </div>
                    <span className="font-medium">{Math.round(server.cpu)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-200">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        server.cpu > 80
                          ? "bg-red-500"
                          : server.cpu > 60
                          ? "bg-yellow-500"
                          : "bg-green-500"
                      }`}
                      style={{ width: `${server.cpu}%` }}
                    />
                  </div>
                </div>

                {/* Memory */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-1">
                      <Activity className="h-3 w-3 text-gray-500" />
                      <span className="text-gray-600">메모리</span>
                    </div>
                    <span className="font-medium">{Math.round(server.memory)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-200">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        server.memory > 80
                          ? "bg-red-500"
                          : server.memory > 60
                          ? "bg-yellow-500"
                          : "bg-green-500"
                      }`}
                      style={{ width: `${server.memory}%` }}
                    />
                  </div>
                </div>

                {/* Disk */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-1">
                      <HardDrive className="h-3 w-3 text-gray-500" />
                      <span className="text-gray-600">디스크</span>
                    </div>
                    <span className="font-medium">{Math.round(server.disk)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-200">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        server.disk > 80
                          ? "bg-red-500"
                          : server.disk > 60
                          ? "bg-yellow-500"
                          : "bg-green-500"
                      }`}
                      style={{ width: `${server.disk}%` }}
                    />
                  </div>
                </div>

                {/* Network */}
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                    <Wifi className="h-3 w-3" />
                    <span>네트워크</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">
                      ↓ {Math.round(server.network.in)} KB/s
                    </span>
                    <span className="text-gray-600">
                      ↑ {Math.round(server.network.out)} KB/s
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Active Alerts */}
        {metrics.alerts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                활성 알림 ({metrics.alerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {metrics.alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border ${getAlertBg(alert.level)}`}
                >
                  <div className="flex items-start gap-3">
                    {getAlertIcon(alert.level)}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-medium text-gray-900">
                          {alert.server}
                        </h4>
                        <span className="text-xs text-gray-500">
                          {new Date(alert.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{alert.message}</p>
                    </div>
                    <Button variant="outline" size="sm">
                      확인
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Recent Events Log */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-gray-600" />
              최근 이벤트
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics.events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0"
                >
                  <div className="mt-1">
                    {event.type === "container" && (
                      <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Server className="h-4 w-4 text-blue-600" />
                      </div>
                    )}
                    {event.type === "deployment" && (
                      <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </div>
                    )}
                    {event.type === "system" && (
                      <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center">
                        <Activity className="h-4 w-4 text-purple-600" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">{event.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(event.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant="default" className="capitalize">
                    {event.type}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Performance Summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {metrics.servers.filter((s) => s.cpu < 60).length}/
                    {metrics.servers.length}
                  </p>
                  <p className="text-sm text-gray-500">정상 서버</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{metrics.alerts.length}</p>
                  <p className="text-sm text-gray-500">활성 알림</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <Activity className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {Math.round(
                      metrics.servers.reduce((acc, s) => acc + s.cpu, 0) /
                        metrics.servers.length
                    )}
                    %
                  </p>
                  <p className="text-sm text-gray-500">평균 CPU 사용량</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
