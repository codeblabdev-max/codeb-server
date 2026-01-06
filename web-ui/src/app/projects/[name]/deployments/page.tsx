"use client";

import { useState, useEffect, use } from "react";
import { EnvironmentSubTabs } from "@/components/project/EnvironmentSubTabs";
import { SlotStatus } from "@/components/slot/slot-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { slotApi, SlotRegistry, SlotName } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import {
  CheckCircle,
  XCircle,
  Clock,
  GitCommit,
  RefreshCw,
  Loader2,
} from "lucide-react";

type Environment = "production" | "staging" | "preview";

interface DeploymentsPageProps {
  params: Promise<{ name: string }>;
}

interface DeploymentHistoryItem {
  id: string;
  slot: SlotName;
  version: string;
  status: "success" | "failed" | "promoted" | "rolledback";
  duration: number;
  deployedAt: string;
  deployedBy?: string;
}

export default function DeploymentsPage({ params }: DeploymentsPageProps) {
  const { name: projectName } = use(params);
  const [environment, setEnvironment] = useState<Environment>("production");
  const [slots, setSlots] = useState<SlotRegistry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchSlots = async () => {
    try {
      setIsLoading(true);
      const allSlots = await slotApi.list();
      const projectSlots = allSlots.filter((s) => s.projectName === projectName);
      setSlots(projectSlots);
    } catch (error) {
      console.error("Failed to fetch slots:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSlots();
  }, [projectName]);

  // Get current environment slot
  const currentSlot = slots.find((s) => s.environment === environment);

  // Get available environments
  const availableEnvironments = slots.map((s) => s.environment) as Environment[];

  // Generate deployment history from slots
  const deploymentHistory: DeploymentHistoryItem[] = [];
  if (currentSlot) {
    if (currentSlot.blue.deployedAt && currentSlot.blue.state !== "empty") {
      deploymentHistory.push({
        id: `blue-${currentSlot.blue.deployedAt}`,
        slot: "blue",
        version: currentSlot.blue.version || "unknown",
        status: currentSlot.activeSlot === "blue" ? "promoted" :
               currentSlot.blue.state === "grace" ? "rolledback" : "success",
        duration: 45000, // Would come from actual data
        deployedAt: currentSlot.blue.deployedAt,
      });
    }
    if (currentSlot.green.deployedAt && currentSlot.green.state !== "empty") {
      deploymentHistory.push({
        id: `green-${currentSlot.green.deployedAt}`,
        slot: "green",
        version: currentSlot.green.version || "unknown",
        status: currentSlot.activeSlot === "green" ? "promoted" :
               currentSlot.green.state === "grace" ? "rolledback" : "success",
        duration: 38000,
        deployedAt: currentSlot.green.deployedAt,
      });
    }
  }

  // Sort by deployed date descending
  deploymentHistory.sort((a, b) =>
    new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime()
  );

  const handlePromote = async () => {
    if (!currentSlot) return;
    try {
      setActionLoading("promote");
      await slotApi.promote(projectName, environment);
      await fetchSlots();
    } catch (error) {
      console.error("Promote failed:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRollback = async () => {
    if (!currentSlot) return;
    try {
      setActionLoading("rollback");
      await slotApi.rollback(projectName, environment);
      await fetchSlots();
    } catch (error) {
      console.error("Rollback failed:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const statusConfig = {
    success: { label: "배포 완료", color: "bg-green-100 text-green-700", icon: CheckCircle },
    failed: { label: "실패", color: "bg-red-100 text-red-700", icon: XCircle },
    promoted: { label: "운영 중", color: "bg-blue-100 text-blue-700", icon: CheckCircle },
    rolledback: { label: "롤백됨", color: "bg-orange-100 text-orange-700", icon: Clock },
  };

  return (
    <div className="p-6 space-y-6">
      {/* 환경 선택 */}
      <div className="flex items-center justify-between">
        <EnvironmentSubTabs
          selected={environment}
          onChange={setEnvironment}
          availableEnvironments={
            availableEnvironments.length > 0
              ? availableEnvironments
              : ["production", "staging"]
          }
        />
        <button
          onClick={fetchSlots}
          disabled={isLoading}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 text-gray-500 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : currentSlot ? (
        <>
          {/* 슬롯 개요 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Blue-Green 슬롯</CardTitle>
            </CardHeader>
            <CardContent>
              <SlotStatus
                registry={currentSlot}
                onPromote={
                  currentSlot.blue.state === "deployed" || currentSlot.green.state === "deployed"
                    ? handlePromote
                    : undefined
                }
                onRollback={
                  currentSlot.blue.state === "grace" || currentSlot.green.state === "grace"
                    ? handleRollback
                    : undefined
                }
                isLoading={actionLoading !== null}
              />
            </CardContent>
          </Card>

          {/* 배포 이력 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">배포 이력</CardTitle>
            </CardHeader>
            <CardContent>
              {deploymentHistory.length > 0 ? (
                <div className="space-y-3">
                  {deploymentHistory.map((deployment) => {
                    const status = statusConfig[deployment.status];
                    const StatusIcon = status.icon;

                    return (
                      <div
                        key={deployment.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {/* 슬롯 표시 */}
                          <div
                            className={`w-3 h-3 rounded-full ${
                              deployment.slot === "blue" ? "bg-blue-500" : "bg-green-500"
                            }`}
                          />

                          {/* 버전 */}
                          <div className="flex items-center gap-2">
                            <GitCommit className="h-4 w-4 text-gray-400" />
                            <span className="font-mono text-sm">{deployment.version.slice(0, 8)}</span>
                          </div>

                          {/* 상태 뱃지 */}
                          <Badge className={status.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {status.label}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>{Math.round(deployment.duration / 1000)}초</span>
                          <span>{formatRelativeTime(deployment.deployedAt)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  아직 배포 이력이 없습니다
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-gray-500">
              <p>{environment} 환경이 설정되지 않았습니다</p>
              <p className="text-sm mt-1">workflow_init을 실행하여 환경을 설정하세요</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
