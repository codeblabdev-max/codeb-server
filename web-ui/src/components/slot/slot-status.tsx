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
  empty: { label: "Empty", color: "text-gray-500", bgColor: "bg-gray-100" },
  deploying: { label: "Deploying", color: "text-blue-600", bgColor: "bg-blue-100" },
  deployed: { label: "Deployed", color: "text-yellow-600", bgColor: "bg-yellow-100" },
  active: { label: "Active", color: "text-green-600", bgColor: "bg-green-100" },
  grace: { label: "Grace", color: "text-orange-600", bgColor: "bg-orange-100" },
  draining: { label: "Draining", color: "text-purple-600", bgColor: "bg-purple-100" },
};

const healthConfig = {
  healthy: { icon: CheckCircle, color: "text-green-500" },
  unhealthy: { icon: XCircle, color: "text-red-500" },
  degraded: { icon: AlertCircle, color: "text-yellow-500" },
  unknown: { icon: Circle, color: "text-gray-400" },
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
      {/* Slot Label */}
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
              Active
            </Badge>
          )}
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${stateConfig.bgColor} ${stateConfig.color}`}>
          {stateConfig.label}
        </span>
      </div>

      {/* Slot Content */}
      {slot.state !== "empty" ? (
        <div className="space-y-2">
          {/* Version */}
          <div className="flex items-center gap-2 text-sm">
            <Server className="h-4 w-4 text-gray-400" />
            <span className="text-gray-600">Version:</span>
            <span className="font-mono text-gray-900">{slot.version || "N/A"}</span>
          </div>

          {/* Port */}
          <div className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4 text-gray-400" />
            <span className="text-gray-600">Port:</span>
            <span className="font-mono text-gray-900">{slot.port}</span>
          </div>

          {/* Health */}
          <div className="flex items-center gap-2 text-sm">
            <HealthIcon className={`h-4 w-4 ${health.color}`} />
            <span className="text-gray-600">Health:</span>
            <span className={`font-medium ${health.color}`}>{slot.healthStatus}</span>
          </div>

          {/* Deployed At */}
          {slot.deployedAt && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600">Deployed:</span>
              <span className="text-gray-900">{formatRelativeTime(slot.deployedAt)}</span>
            </div>
          )}

          {/* Preview URL (for deployed but not active) */}
          {slot.state === "deployed" && previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-blue-600 hover:underline mt-2"
            >
              <ExternalLink className="h-3 w-3" />
              Preview URL
            </a>
          )}

          {/* Error */}
          {slot.error && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {slot.error}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center h-24 text-gray-400">
          <span className="text-sm">No deployment</span>
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

  // Generate preview URL for deployed slot
  const previewUrl = deployedSlot
    ? `https://${registry.projectName}-${deployedSlot}.preview.codeb.dev`
    : undefined;

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        {/* Blue Slot Indicator */}
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

        {/* Arrow */}
        <ArrowRightLeft className="h-3 w-3 text-gray-400" />

        {/* Green Slot Indicator */}
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

        {/* Active Version */}
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">
            {registry.projectName} / {registry.environment}
          </h3>
          <p className="text-sm text-gray-500">
            Last updated: {formatRelativeTime(registry.lastUpdated)}
          </p>
        </div>

        {/* Actions */}
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
              Promote
            </Button>
          )}

          {hasGraceSlot && onRollback && (
            <Button onClick={onRollback} disabled={isLoading} size="sm" variant="outline">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-1" />
              )}
              Rollback
            </Button>
          )}

          {onDeploy && (
            <Button onClick={onDeploy} disabled={isLoading} size="sm" variant="secondary">
              Deploy
            </Button>
          )}
        </div>
      </div>

      {/* Slot Cards */}
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

      {/* Flow Indicator */}
      <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
        <span>Traffic Flow:</span>
        {registry.activeSlot ? (
          <span className="flex items-center gap-1">
            <span className="font-medium capitalize">{registry.activeSlot}</span>
            <span className="text-gray-400">(Port {registry[registry.activeSlot].port})</span>
          </span>
        ) : (
          <span className="text-gray-400">No active slot</span>
        )}
      </div>
    </div>
  );
}

// Mini slot indicator for tables/lists
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
