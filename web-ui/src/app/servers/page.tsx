"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Server,
  Cpu,
  HardDrive,
  Activity,
  Container,
  RefreshCw,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

// Mock data - 실제로는 SSOT Registry API에서 가져옴
const servers = [
  {
    id: "1",
    name: "Videopick App",
    ip: "158.247.203.55",
    status: "online" as const,
    cpu: 45,
    memory: 62,
    disk: 48,
    containerCount: 12,
    uptime: 45 * 24 * 60, // 45 days in minutes
    location: "Vultr Seoul",
  },
  {
    id: "2",
    name: "Streaming Server",
    ip: "141.164.42.213",
    status: "online" as const,
    cpu: 32,
    memory: 48,
    disk: 65,
    containerCount: 8,
    uptime: 30 * 24 * 60,
    location: "Vultr Tokyo",
  },
  {
    id: "3",
    name: "Storage Server",
    ip: "64.176.226.119",
    status: "online" as const,
    cpu: 12,
    memory: 78,
    disk: 85,
    containerCount: 4,
    uptime: 60 * 24 * 60,
    location: "Vultr Singapore",
  },
  {
    id: "4",
    name: "Backup Server",
    ip: "141.164.37.63",
    status: "online" as const,
    cpu: 8,
    memory: 23,
    disk: 92,
    containerCount: 2,
    uptime: 90 * 24 * 60,
    location: "Vultr Sydney",
  },
];

const containers = [
  {
    id: "1",
    name: "videopick-web-prod",
    image: "videopick/web:latest",
    status: "running" as const,
    serverId: "1",
    cpu: 25,
    memory: 512,
    uptime: 5 * 24 * 60,
  },
  {
    id: "2",
    name: "videopick-web-staging",
    image: "videopick/web:staging",
    status: "running" as const,
    serverId: "1",
    cpu: 15,
    memory: 384,
    uptime: 3 * 24 * 60,
  },
  {
    id: "3",
    name: "api-gateway-prod",
    image: "api/gateway:latest",
    status: "running" as const,
    serverId: "2",
    cpu: 18,
    memory: 256,
    uptime: 10 * 24 * 60,
  },
  {
    id: "4",
    name: "streaming-service",
    image: "streaming:latest",
    status: "deploying" as const,
    serverId: "2",
    cpu: 0,
    memory: 0,
    uptime: 0,
  },
];

function formatUptime(minutes: number) {
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  return `${days}d ${hours}h`;
}

function getUsageColor(percentage: number) {
  if (percentage < 60) return "bg-green-500";
  if (percentage < 80) return "bg-yellow-500";
  return "bg-red-500";
}

export default function ServersPage() {
  const [selectedServer, setSelectedServer] = useState<string | null>(null);

  const filteredContainers = selectedServer
    ? containers.filter((c) => c.serverId === selectedServer)
    : containers;

  return (
    <div className="flex flex-col h-full">
      <Header
        title="서버"
        description={`${servers.length}개 서버 모니터링`}
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Servers Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {servers.map((server) => (
            <div
              key={server.id}
              className="cursor-pointer"
              onClick={() =>
                setSelectedServer(selectedServer === server.id ? null : server.id)
              }
            >
            <Card
              className={`transition-all ${
                selectedServer === server.id
                  ? "ring-2 ring-blue-500 shadow-md"
                  : "hover:shadow-md"
              }`}
            >
              <CardContent className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                      <Server className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {server.name}
                      </h3>
                      <p className="text-xs text-gray-500 font-mono">
                        {server.ip}
                      </p>
                    </div>
                  </div>
                  <StatusBadge
                    status={server.status === "online" ? "running" : "stopped"}
                  />
                </div>

                {/* Location */}
                <p className="text-xs text-gray-500 mb-4">{server.location}</p>

                {/* Resource Metrics */}
                <div className="space-y-3 mb-4">
                  {/* CPU */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-1">
                        <Cpu className="h-3 w-3 text-gray-500" />
                        <span className="text-gray-600">CPU</span>
                      </div>
                      <span className="font-medium">{server.cpu}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-200">
                      <div
                        className={`h-full rounded-full ${getUsageColor(
                          server.cpu
                        )}`}
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
                      <span className="font-medium">{server.memory}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-200">
                      <div
                        className={`h-full rounded-full ${getUsageColor(
                          server.memory
                        )}`}
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
                      <span className="font-medium">{server.disk}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-200">
                      <div
                        className={`h-full rounded-full ${getUsageColor(
                          server.disk
                        )}`}
                        style={{ width: `${server.disk}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Container className="h-3 w-3" />
                    <span>{server.containerCount}개 컨테이너</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatUptime(server.uptime)}
                  </span>
                </div>
              </CardContent>
            </Card>
            </div>
          ))}
        </div>

        {/* Disk Usage Alert */}
        {servers.some((s) => s.disk > 80) && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-yellow-900">
                    높은 디스크 사용량 경고
                  </h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    {servers.filter((s) => s.disk > 80).length}개 서버의 디스크
                    사용량이 80%를 초과했습니다. 오래된 컨테이너를 정리하거나
                    스토리지를 확장하세요.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Containers Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              전체 컨테이너
              {selectedServer && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  (필터:{" "}
                  {servers.find((s) => s.id === selectedServer)?.name})
                </span>
              )}
            </CardTitle>
            <div className="flex gap-2">
              {selectedServer && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedServer(null)}
                >
                  전체 보기
                </Button>
              )}
              <Button variant="ghost" size="sm">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-sm text-gray-500">
                    <th className="px-6 py-3 font-medium">컨테이너</th>
                    <th className="px-6 py-3 font-medium">이미지</th>
                    <th className="px-6 py-3 font-medium">서버</th>
                    <th className="px-6 py-3 font-medium">상태</th>
                    <th className="px-6 py-3 font-medium">CPU</th>
                    <th className="px-6 py-3 font-medium">메모리</th>
                    <th className="px-6 py-3 font-medium">가동시간</th>
                    <th className="px-6 py-3 font-medium">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContainers.map((container) => {
                    const server = servers.find((s) => s.id === container.serverId);
                    return (
                      <tr
                        key={container.id}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900">
                              {container.name}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600 font-mono">
                            {container.image}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">
                            {server?.name}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={container.status} />
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">
                            {container.cpu}%
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">
                            {container.memory}MB
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">
                            {formatUptime(container.uptime)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm">
                              로그
                            </Button>
                            <Button variant="ghost" size="sm">
                              재시작
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
