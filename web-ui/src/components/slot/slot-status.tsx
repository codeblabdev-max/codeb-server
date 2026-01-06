"use client";

import { SlotRegistry, SlotInfo, SlotName, SlotState } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Circle,
  ArrowRightLeft,
  RotateCcw,
  ExternalLink,
  Activity,
  Clock,
  Server,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

interface SlotStatusProps {
  registry: SlotRegistry;
  onPromote?: () => void;
  onRollback?: () => void;
  onDeploy?: () => void;
  isLoading?: boolean;
  compact?: boolean;
}

const slotStateConfig: Record<SlotState, { label: string; color: string; bgColor: string }> = {
  empty: { label: "비어있음", color: "text-gray-500", bgColor: "bg-gray-100" },
  deploying: { label: "배포 중", color: "text-blue-600", bgColor: "bg-blue-100" },
  deployed: { label: "배포됨", color: "text-yellow-600", bgColor: "bg-yellow-100" },
  active: { label: "활성", color: "text-green-600", bgColor: "bg-green-100" },
  grace: { label: "대기", color: "text-orange-600", bgColor: "bg-orange-100" },
  draining: { label: "종료 중", color: "text-purple-600", bgColor: "bg-purple-100" },
};

const healthConfig = {
  healthy: { icon: CheckCircle, color: "text-green-500", label: "정상" },
  unhealthy: { icon: XCircle, color: "text-red-500", label: "비정상" },
  degraded: { icon: AlertCircle, color: "text-yellow-500", label: "저하됨" },
  unknown: { icon: Circle, color: "text-gray-400", label: "알 수 없음" },
};

function SlotCard({
  slot,
  isActive,
  slotName,
  previewUrl,
}: {
  slot: SlotInfo;
  isActive: boolean;
  slotName: SlotName;
  previewUrl?: string;
}) {
  const stateConfig = slotStateConfig[slot.state];
  const health = healthConfig[slot.healthStatus];
  const HealthIcon = health.icon;

  return (
    <div
      className={`relative rounded-lg border-2 p-4 transition-all ${
        isActive
          ? "border-green-500 bg-green-50"
          : slot.state === "deployed"
          ? "border-yellow-400 bg-yellow-50"
          : "border-gray-200 bg-white"
      }`}
    >
      {/* 슬롯 라벨 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${
              slotName === "blue" ? "bg-blue-500" : "bg-green-500"
            }`}
          />
          <span className="font-semibold capitalize">{slotName}</span>
          {isActive && (
            <Badge variant="success" className="text-xs">
              활성
            </Badge>
          )}
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${stateConfig.bgColor} ${stateConfig.color}`}>
          {stateConfig.label}
        </span>
      </div>

      {/* 슬롯 내용 */}
      {slot.state !== "empty" ? (
        <div className="space-y-2">
          {/* 버전 */}
          <div className="flex items-center gap-2 text-sm">
            <Server className="h-4 w-4 text-gray-400" />
            <span className="text-gray-600">버전:</span>
            <span className="font-mono text-gray-900">{slot.version || "N/A"}</span>
          </div>

          {/* 포트 */}
          <div className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4 text-gray-400" />
            <span className="text-gray-600">포트:</span>
            <span className="font-mono text-gray-900">{slot.port}</span>
          </div>

          {/* 상태 */}
          <div className="flex items-center gap-2 text-sm">
            <HealthIcon className={`h-4 w-4 ${health.color}`} />
            <span className="text-gray-600">상태:</span>
            <span className={`font-medium ${health.color}`}>{health.label}</span>
          </div>

          {/* 배포 시간 */}
          {slot.deployedAt && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600">배포:</span>
              <span className="text-gray-900">{formatRelativeTime(slot.deployedAt)}</span>
            </div>
          )}

          {/* 프리뷰 URL (배포됨 상태) */}
          {slot.state === "deployed" && previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-blue-600 hover:underline mt-2"
            >
              <ExternalLink className="h-3 w-3" />
              프리뷰 URL
            </a>
          )}

          {/* 에러 */}
          {slot.error && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {slot.error}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center h-24 text-gray-400">
          <span className="text-sm">배포 없음</span>
        </div>
      )}
    </div>
  );
}

export function SlotStatus({
  registry,
  onPromote,
  onRollback,
  onDeploy,
  isLoading,
  compact = false,
}: SlotStatusProps) {
  const hasDeployedSlot = registry.blue.state === "deployed" || registry.green.state === "deployed";
  const hasGraceSlot = registry.blue.state === "grace" || registry.green.state === "grace";
  const deployedSlot = registry.blue.state === "deployed" ? "blue" : registry.green.state === "deployed" ? "green" : null;

  // 배포된 슬롯의 프리뷰 URL 생성
  const previewUrl = deployedSlot
    ? `https://${registry.projectName}-${deployedSlot}.preview.codeb.kr`
    : undefined;

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        {/* Blue 슬롯 표시 */}
        <div className="flex items-center gap-1">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              registry.activeSlot === "blue"
                ? "bg-blue-500 ring-2 ring-blue-200"
                : registry.blue.state === "empty"
                ? "bg-gray-300"
                : "bg-blue-400"
            }`}
          />
          <span className="text-xs text-gray-500">B</span>
        </div>

        {/* 화살표 */}
        <ArrowRightLeft className="h-3 w-3 text-gray-400" />

        {/* Green 슬롯 표시 */}
        <div className="flex items-center gap-1">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              registry.activeSlot === "green"
                ? "bg-green-500 ring-2 ring-green-200"
                : registry.green.state === "empty"
                ? "bg-gray-300"
                : "bg-green-400"
            }`}
          />
          <span className="text-xs text-gray-500">G</span>
        </div>

        {/* 활성 버전 */}
        {registry.activeSlot && (
          <span className="text-xs font-mono text-gray-600">
            v{registry[registry.activeSlot].version}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">
            {registry.projectName} / {registry.environment === "production" ? "프로덕션" : registry.environment === "staging" ? "스테이징" : registry.environment}
          </h3>
          <p className="text-sm text-gray-500">
            마지막 업데이트: {formatRelativeTime(registry.lastUpdated)}
          </p>
        </div>

        {/* 액션 */}
        <div className="flex gap-2">
          {hasDeployedSlot && onPromote && (
            <Button
              onClick={onPromote}
              disabled={isLoading}
              size="sm"
              className="bg-green-600 hover:bg-green-700"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <ArrowRightLeft className="h-4 w-4 mr-1" />
              )}
              전환
            </Button>
          )}

          {hasGraceSlot && onRollback && (
            <Button onClick={onRollback} disabled={isLoading} size="sm" variant="outline">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-1" />
              )}
              롤백
            </Button>
          )}

          {onDeploy && (
            <Button onClick={onDeploy} disabled={isLoading} size="sm" variant="secondary">
              배포
            </Button>
          )}
        </div>
      </div>

      {/* 슬롯 카드 */}
      <div className="grid grid-cols-2 gap-4">
        <SlotCard
          slot={registry.blue}
          isActive={registry.activeSlot === "blue"}
          slotName="blue"
          previewUrl={registry.blue.state === "deployed" ? previewUrl : undefined}
        />
        <SlotCard
          slot={registry.green}
          isActive={registry.activeSlot === "green"}
          slotName="green"
          previewUrl={registry.green.state === "deployed" ? previewUrl : undefined}
        />
      </div>

      {/* 트래픽 흐름 표시 */}
      <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
        <span>트래픽 흐름:</span>
        {registry.activeSlot ? (
          <span className="flex items-center gap-1">
            <span className="font-medium capitalize">{registry.activeSlot}</span>
            <span className="text-gray-400">(포트 {registry[registry.activeSlot].port})</span>
          </span>
        ) : (
          <span className="text-gray-400">활성 슬롯 없음</span>
        )}
      </div>
    </div>
  );
}

// 테이블/리스트용 미니 슬롯 표시
export function SlotIndicator({
  activeSlot,
  blueState,
  greenState,
}: {
  activeSlot: SlotName | null;
  blueState: SlotState;
  greenState: SlotState;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-2 h-2 rounded-full ${
          activeSlot === "blue"
            ? "bg-blue-500 ring-2 ring-blue-200"
            : blueState === "empty"
            ? "bg-gray-200"
            : blueState === "deploying"
            ? "bg-blue-400 animate-pulse"
            : "bg-blue-300"
        }`}
        title={`Blue: ${blueState}`}
      />
      <div
        className={`w-2 h-2 rounded-full ${
          activeSlot === "green"
            ? "bg-green-500 ring-2 ring-green-200"
            : greenState === "empty"
            ? "bg-gray-200"
            : greenState === "deploying"
            ? "bg-green-400 animate-pulse"
            : "bg-green-300"
        }`}
        title={`Green: ${greenState}`}
      />
    </div>
  );
}
