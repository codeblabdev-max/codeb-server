"use client";

import Link from "next/link";
import { ExternalLink, GitBranch } from "lucide-react";
import { SlotIndicator } from "@/components/slot/slot-status";
import { SlotRegistry } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";

interface ProjectCardProps {
  name: string;
  type?: string;
  slots: SlotRegistry[];
  gitRepo?: string;
}

const projectTypes: Record<string, { label: string; color: string }> = {
  nextjs: { label: "Next.js", color: "bg-black text-white" },
  nodejs: { label: "Node.js", color: "bg-green-600 text-white" },
  remix: { label: "Remix", color: "bg-purple-600 text-white" },
  python: { label: "Python", color: "bg-blue-600 text-white" },
  go: { label: "Go", color: "bg-cyan-600 text-white" },
  static: { label: "Static", color: "bg-gray-600 text-white" },
};

export function ProjectCard({ name, type = "nextjs", slots, gitRepo }: ProjectCardProps) {
  // Find production slot
  const productionSlot = slots.find((s) => s.environment === "production");
  const stagingSlot = slots.find((s) => s.environment === "staging");

  // Get latest deployment time
  let lastDeployed: string | undefined;
  slots.forEach((slot) => {
    const blueDate = slot.blue.deployedAt;
    const greenDate = slot.green.deployedAt;
    const latest =
      blueDate && greenDate
        ? new Date(blueDate) > new Date(greenDate)
          ? blueDate
          : greenDate
        : blueDate || greenDate;
    if (latest && (!lastDeployed || new Date(latest) > new Date(lastDeployed))) {
      lastDeployed = latest;
    }
  });

  // Production URL
  const productionUrl = `https://${name}.codeb.kr`;

  const typeInfo = projectTypes[type] || projectTypes.nextjs;

  return (
    <Link href={`/projects/${name}`}>
      <div className="group h-full bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-lg transition-all cursor-pointer">
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* 아바타 */}
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-white font-bold text-lg">
              {name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                {name}
              </h3>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeInfo.color}`}
              >
                {typeInfo.label}
              </span>
            </div>
          </div>
        </div>

        {/* 프로덕션 URL */}
        <a
          href={productionUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 mb-4 truncate"
        >
          <span className="truncate">{productionUrl.replace("https://", "")}</span>
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
        </a>

        {/* 슬롯 상태 */}
        <div className="flex items-center gap-4 mb-4">
          {productionSlot && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">프로덕션</span>
              <SlotIndicator
                activeSlot={productionSlot.activeSlot}
                blueState={productionSlot.blue.state}
                greenState={productionSlot.green.state}
              />
            </div>
          )}
          {stagingSlot && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">스테이징</span>
              <SlotIndicator
                activeSlot={stagingSlot.activeSlot}
                blueState={stagingSlot.blue.state}
                greenState={stagingSlot.green.state}
              />
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1">
            <span>{slots.length}개 환경</span>
          </div>
          {lastDeployed && <span>{formatRelativeTime(lastDeployed)}</span>}
        </div>
      </div>
    </Link>
  );
}
