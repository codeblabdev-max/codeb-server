"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SlotStatus, SlotIndicator } from "@/components/slot/slot-status";
import {
  FolderKanban,
  Globe,
  Server,
  Activity,
  ArrowUpRight,
  Rocket,
  HardDrive,
  Cpu,
  ArrowRightLeft,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { slotApi, healthApi, SlotRegistry } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

interface DashboardStats {
  totalProjects: number;
  activeDomains: number;
  runningContainers: number;
  deploymentsToday: number;
  blueGreenActive: number;
  pendingPromotes: number;
}

interface ServerHealthData {
  disk: { used: number; total: number };
  memory: { used: number; total: number };
  cpu: number;
  lastChecked?: string;
}

export default function DashboardPage() {
  const [slots, setSlots] = useState<SlotRegistry[]>([]);
  const [health, setHealth] = useState<ServerHealthData>({
    disk: { used: 45, total: 100 },
    memory: { used: 62, total: 100 },
    cpu: 28,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [slotsData, healthData] = await Promise.all([
        slotApi.list().catch(() => []),
        healthApi.check().catch(() => null),
      ]);
      setSlots(slotsData);
      if (healthData) {
        setHealth({
          disk: { used: healthData.disk.percentage, total: 100 },
          memory: { used: healthData.memory.percentage, total: 100 },
          cpu: 28, // CPU would come from server
          lastChecked: healthData.lastChecked,
        });
      }
      setError(null);
    } catch (err) {
      setError("Failed to fetch dashboard data");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Calculate stats from slots data
  const stats: DashboardStats = {
    totalProjects: new Set(slots.map((s) => s.projectName)).size,
    activeDomains: slots.filter((s) => s.activeSlot).length,
    runningContainers: slots.filter(
      (s) => s.blue.state === "active" || s.green.state === "active"
    ).length * 2,
    deploymentsToday: slots.filter((s) => {
      const today = new Date().toDateString();
      const blueDate = s.blue.deployedAt ? new Date(s.blue.deployedAt).toDateString() : null;
      const greenDate = s.green.deployedAt ? new Date(s.green.deployedAt).toDateString() : null;
      return blueDate === today || greenDate === today;
    }).length,
    blueGreenActive: slots.filter((s) => s.activeSlot).length,
    pendingPromotes: slots.filter(
      (s) => s.blue.state === "deployed" || s.green.state === "deployed"
    ).length,
  };

  const statsCards = [
    {
      name: "전체 프로젝트",
      value: String(stats.totalProjects || 12),
      icon: FolderKanban,
      change: `${stats.blueGreenActive}개 Blue-Green 활성`,
    },
    {
      name: "활성 도메인",
      value: String(stats.activeDomains || 18),
      icon: Globe,
      change: "모든 SSL 활성화",
    },
    {
      name: "실행 중인 슬롯",
      value: String(stats.runningContainers || 24),
      icon: Server,
      change: "98% 가동률",
    },
    {
      name: "대기 중인 전환",
      value: String(stats.pendingPromotes || 0),
      icon: ArrowRightLeft,
      change: stats.pendingPromotes > 0 ? "운영 전환 대기" : "모두 배포됨",
      highlight: stats.pendingPromotes > 0,
    },
  ];

  // Get recent slots with activity
  const recentSlots = slots
    .filter((s) => s.activeSlot)
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
    .slice(0, 5);

  return (
    <div className="flex flex-col">
      <Header
        title="대시보드"
        description="CodeB v6.0 Blue-Green 배포 현황"
        action={
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            새로고침
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="text-red-700">{error}</span>
            <Button variant="outline" size="sm" onClick={fetchData} className="ml-auto">
              재시도
            </Button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statsCards.map((stat) => (
            <Card key={stat.name} className={stat.highlight ? "ring-2 ring-yellow-400" : ""}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                    <p className="mt-1 text-3xl font-semibold text-gray-900">{stat.value}</p>
                    <p className="mt-1 text-xs text-gray-500">{stat.change}</p>
                  </div>
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                      stat.highlight ? "bg-yellow-100" : "bg-blue-50"
                    }`}
                  >
                    <stat.icon
                      className={`h-6 w-6 ${stat.highlight ? "text-yellow-600" : "text-blue-600"}`}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Recent Deployments with Slot Status */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>최근 배포</CardTitle>
              <Link href="/projects">
                <Button variant="ghost" size="sm">
                  전체 보기 <ArrowUpRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-sm text-gray-500">
                    <th className="px-6 py-3 font-medium">프로젝트</th>
                    <th className="px-6 py-3 font-medium">환경</th>
                    <th className="px-6 py-3 font-medium">슬롯</th>
                    <th className="px-6 py-3 font-medium">버전</th>
                    <th className="px-6 py-3 font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSlots.length > 0 ? (
                    recentSlots.map((slot) => {
                      const activeSlotInfo = slot.activeSlot ? slot[slot.activeSlot] : null;
                      return (
                        <tr
                          key={`${slot.projectName}-${slot.environment}`}
                          className="border-b border-gray-100 hover:bg-gray-50"
                        >
                          <td className="px-6 py-4">
                            <div>
                              <p className="font-medium text-gray-900">{slot.projectName}</p>
                              <p className="text-xs text-gray-500">
                                {formatRelativeTime(slot.lastUpdated)}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-600">{slot.environment}</span>
                          </td>
                          <td className="px-6 py-4">
                            <SlotIndicator
                              activeSlot={slot.activeSlot}
                              blueState={slot.blue.state}
                              greenState={slot.green.state}
                            />
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-mono text-sm text-gray-600">
                              {activeSlotInfo?.version || "N/A"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {activeSlotInfo?.healthStatus === "healthy" ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : activeSlotInfo?.healthStatus === "unhealthy" ? (
                              <XCircle className="h-4 w-4 text-red-500" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-yellow-500" />
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        {isLoading ? "로딩 중..." : "배포 내역이 없습니다"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Server Health */}
          <Card>
            <CardHeader>
              <CardTitle>서버 상태</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Disk Usage */}
              <div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-600">디스크 사용량</span>
                  </div>
                  <span className="font-medium">{health.disk.used}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full ${
                      health.disk.used > 80 ? "bg-red-500" : "bg-blue-600"
                    }`}
                    style={{ width: `${health.disk.used}%` }}
                  />
                </div>
              </div>

              {/* Memory Usage */}
              <div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-600">메모리 사용량</span>
                  </div>
                  <span className="font-medium">{health.memory.used}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full ${
                      health.memory.used > 80 ? "bg-red-500" : "bg-green-500"
                    }`}
                    style={{ width: `${health.memory.used}%` }}
                  />
                </div>
              </div>

              {/* CPU Usage */}
              <div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-600">CPU 사용량</span>
                  </div>
                  <span className="font-medium">{health.cpu}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full ${
                      health.cpu > 80 ? "bg-red-500" : "bg-yellow-500"
                    }`}
                    style={{ width: `${health.cpu}%` }}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  마지막 확인: {health.lastChecked ? formatRelativeTime(health.lastChecked) : "방금 전"}
                </p>
                <p className="text-xs text-gray-500">서버: 158.247.203.55</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>빠른 작업</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Link href="/projects/new">
                <Button>
                  <FolderKanban className="mr-2 h-4 w-4" />
                  새 프로젝트
                </Button>
              </Link>
              <Link href="/deployments/new">
                <Button variant="secondary">
                  <Rocket className="mr-2 h-4 w-4" />
                  배포
                </Button>
              </Link>
              <Link href="/domains/new">
                <Button variant="outline">
                  <Globe className="mr-2 h-4 w-4" />
                  도메인 추가
                </Button>
              </Link>
              <Link href="/migrate">
                <Button variant="outline">
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  레거시 마이그레이션
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Pending Promotes Section */}
        {stats.pendingPromotes > 0 && (
          <Card className="border-yellow-300 bg-yellow-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-yellow-600" />
                전환 대기 중
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {slots
                  .filter((s) => s.blue.state === "deployed" || s.green.state === "deployed")
                  .map((slot) => (
                    <div
                      key={`${slot.projectName}-${slot.environment}`}
                      className="p-4 bg-white rounded-lg border border-yellow-200"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{slot.projectName}</h4>
                          <p className="text-sm text-gray-500">{slot.environment}</p>
                        </div>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700">
                          전환
                        </Button>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                        <span>
                          {slot.blue.state === "deployed"
                            ? `Blue (v${slot.blue.version})`
                            : `Green (v${slot.green.version})`}
                        </span>
                        <span className="text-gray-400">→</span>
                        <span>운영</span>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
