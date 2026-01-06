"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search,
  Rocket,
  GitBranch,
  GitCommit,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  RotateCcw,
  ExternalLink,
  MoreVertical,
  Filter,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

// Mock data
const deployments = [
  {
    id: "1",
    projectName: "videopick-web",
    environment: "production" as const,
    status: "success" as const,
    version: "v1.2.3",
    gitBranch: "main",
    gitCommit: "a1b2c3d",
    commitMessage: "feat: add video player component",
    deployedBy: "GitHub Actions",
    startedAt: "2024-12-17T10:30:00Z",
    finishedAt: "2024-12-17T10:35:00Z",
    duration: 300,
  },
  {
    id: "2",
    projectName: "api-gateway",
    environment: "staging" as const,
    status: "deploying" as const,
    version: "v2.0.0-beta",
    gitBranch: "develop",
    gitCommit: "e4f5g6h",
    commitMessage: "refactor: update authentication flow",
    deployedBy: "GitHub Actions",
    startedAt: "2024-12-17T10:45:00Z",
    finishedAt: null,
    duration: null,
  },
  {
    id: "3",
    projectName: "admin-panel",
    environment: "staging" as const,
    status: "failed" as const,
    version: "v1.0.5",
    gitBranch: "feature/dashboard",
    gitCommit: "i7j8k9l",
    commitMessage: "fix: dashboard layout issues",
    deployedBy: "manual",
    startedAt: "2024-12-17T09:00:00Z",
    finishedAt: "2024-12-17T09:05:00Z",
    duration: 300,
    error: "Build failed: TypeScript compilation error",
  },
  {
    id: "4",
    projectName: "videopick-web",
    environment: "staging" as const,
    status: "success" as const,
    version: "v1.2.3-rc1",
    gitBranch: "develop",
    gitCommit: "m1n2o3p",
    commitMessage: "test: add unit tests for video player",
    deployedBy: "GitHub Actions",
    startedAt: "2024-12-17T08:00:00Z",
    finishedAt: "2024-12-17T08:04:30Z",
    duration: 270,
  },
  {
    id: "5",
    projectName: "api-gateway",
    environment: "production" as const,
    status: "success" as const,
    version: "v1.9.0",
    gitBranch: "main",
    gitCommit: "q4r5s6t",
    commitMessage: "perf: optimize database queries",
    deployedBy: "GitHub Actions",
    startedAt: "2024-12-16T14:00:00Z",
    finishedAt: "2024-12-16T14:06:00Z",
    duration: 360,
  },
  {
    id: "6",
    projectName: "landing-page",
    environment: "production" as const,
    status: "success" as const,
    version: "v3.0.0",
    gitBranch: "main",
    gitCommit: "u7v8w9x",
    commitMessage: "feat: new hero section design",
    deployedBy: "manual",
    startedAt: "2024-12-15T16:00:00Z",
    finishedAt: "2024-12-15T16:02:00Z",
    duration: 120,
  },
];

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle; bg: string }> = {
  success: { label: "성공", color: "text-green-600", icon: CheckCircle, bg: "bg-green-100" },
  failed: { label: "실패", color: "text-red-600", icon: XCircle, bg: "bg-red-100" },
  deploying: { label: "배포 중", color: "text-blue-600", icon: Loader2, bg: "bg-blue-100" },
  cancelled: { label: "취소됨", color: "text-gray-600", icon: XCircle, bg: "bg-gray-100" },
  rollback: { label: "롤백됨", color: "text-yellow-600", icon: RotateCcw, bg: "bg-yellow-100" },
};

export default function DeploymentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedEnv, setSelectedEnv] = useState<string | null>(null);

  const filteredDeployments = deployments.filter((deployment) => {
    const matchesSearch =
      deployment.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      deployment.commitMessage.toLowerCase().includes(searchQuery.toLowerCase()) ||
      deployment.gitCommit.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = !selectedStatus || deployment.status === selectedStatus;
    const matchesEnv = !selectedEnv || deployment.environment === selectedEnv;
    return matchesSearch && matchesStatus && matchesEnv;
  });

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Stats
  const totalDeployments = deployments.length;
  const successRate = Math.round(
    (deployments.filter((d) => d.status === "success").length / totalDeployments) * 100
  );
  const avgDuration = Math.round(
    deployments
      .filter((d) => d.duration !== null)
      .reduce((acc, d) => acc + (d.duration || 0), 0) /
      deployments.filter((d) => d.duration !== null).length
  );

  return (
    <div className="flex flex-col">
      <Header
        title="배포"
        description="배포 이력 조회 및 관리"
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <Rocket className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalDeployments}</p>
                  <p className="text-sm text-gray-500">전체 배포</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{successRate}%</p>
                  <p className="text-sm text-gray-500">성공률</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                  <Clock className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatDuration(avgDuration)}</p>
                  <p className="text-sm text-gray-500">평균 소요시간</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-100">
                  <Loader2 className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {deployments.filter((d) => d.status === "deploying").length}
                  </p>
                  <p className="text-sm text-gray-500">진행 중</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-1">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="배포 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Status Filter */}
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedStatus(null)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  !selectedStatus ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                전체
              </button>
              <button
                onClick={() => setSelectedStatus("success")}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  selectedStatus === "success" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                성공
              </button>
              <button
                onClick={() => setSelectedStatus("failed")}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  selectedStatus === "failed" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                실패
              </button>
              <button
                onClick={() => setSelectedStatus("deploying")}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  selectedStatus === "deploying" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                진행 중
              </button>
            </div>

            {/* Environment Filter */}
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedEnv(null)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  !selectedEnv ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Filter className="h-3 w-3 inline mr-1" />
                전체 환경
              </button>
              <button
                onClick={() => setSelectedEnv("production")}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  selectedEnv === "production" ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                프로덕션
              </button>
              <button
                onClick={() => setSelectedEnv("staging")}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  selectedEnv === "staging" ? "border-gray-600 bg-gray-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                스테이징
              </button>
            </div>
          </div>
        </div>

        {/* Deployments List */}
        <div className="space-y-4">
          {filteredDeployments.map((deployment) => {
            const config = statusConfig[deployment.status];
            const StatusIcon = config.icon;

            return (
              <Card key={deployment.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    {/* Left: Status & Project Info */}
                    <div className="flex items-center gap-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${config.bg}`}>
                        <StatusIcon className={`h-5 w-5 ${config.color} ${deployment.status === "deploying" ? "animate-spin" : ""}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">{deployment.projectName}</h3>
                          <Badge variant={deployment.environment === "production" ? "info" : "default"}>
                            {deployment.environment}
                          </Badge>
                          <span className="text-sm text-gray-500">{deployment.version}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            {deployment.gitBranch}
                          </span>
                          <span className="flex items-center gap-1">
                            <GitCommit className="h-3 w-3" />
                            {deployment.gitCommit}
                          </span>
                          <span className="truncate max-w-xs">{deployment.commitMessage}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Time & Actions */}
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm text-gray-900">{formatRelativeTime(deployment.startedAt)}</p>
                        <p className="text-xs text-gray-500">
                          소요시간: {formatDuration(deployment.duration)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {deployment.status === "failed" && (
                          <Button variant="outline" size="sm">
                            <RotateCcw className="h-4 w-4 mr-1" />
                            재시도
                          </Button>
                        )}
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Error message for failed deployments */}
                  {deployment.status === "failed" && deployment.error && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700">{deployment.error}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredDeployments.length === 0 && (
          <div className="text-center py-12">
            <Rocket className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-4 text-gray-500">배포 내역이 없습니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
