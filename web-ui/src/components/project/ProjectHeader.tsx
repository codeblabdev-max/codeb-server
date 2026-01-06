"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, Rocket, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SlotIndicator } from "@/components/slot/slot-status";
import { SlotRegistry } from "@/lib/api";

interface ProjectHeaderProps {
  projectName: string;
  productionUrl?: string;
  slots?: SlotRegistry[];
  onDeploy?: () => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function ProjectHeader({
  projectName,
  productionUrl,
  slots,
  onDeploy,
  onRefresh,
  isLoading,
}: ProjectHeaderProps) {
  // Get production slot for indicator
  const productionSlot = slots?.find((s) => s.environment === "production");

  return (
    <div className="border-b border-gray-200 bg-white px-6 py-4">
      <div className="flex items-center justify-between">
        {/* 왼쪽: 뒤로가기 + 프로젝트 정보 */}
        <div className="flex items-center gap-4">
          <Link
            href="/projects"
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </Link>

          {/* 프로젝트 아바타 */}
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-white font-bold">
            {projectName.charAt(0).toUpperCase()}
          </div>

          {/* 프로젝트 이름 & URL */}
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{projectName}</h1>
            {productionUrl && (
              <a
                href={productionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <span>{productionUrl.replace("https://", "")}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* 슬롯 표시 */}
          {productionSlot && (
            <div className="ml-4 flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
              <span className="text-xs text-gray-500">프로덕션</span>
              <SlotIndicator
                activeSlot={productionSlot.activeSlot}
                blueState={productionSlot.blue.state}
                greenState={productionSlot.green.state}
              />
            </div>
          )}
        </div>

        {/* 오른쪽: 액션 버튼 */}
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          )}
          {onDeploy && (
            <Button size="sm" onClick={onDeploy}>
              <Rocket className="h-4 w-4 mr-2" />
              배포
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
