"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ProjectHeader } from "@/components/project/ProjectHeader";
import { ProjectTabs } from "@/components/project/ProjectTabs";
import { slotApi, SlotRegistry } from "@/lib/api";

interface ProjectLayoutProps {
  children: React.ReactNode;
  params: Promise<{ name: string }>;
}

export default function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const { name: projectName } = use(params);
  const [slots, setSlots] = useState<SlotRegistry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

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

  // Get production domain
  const productionSlot = slots.find((s) => s.environment === "production");
  const productionUrl = productionSlot
    ? `https://${projectName}.codeb.kr`
    : undefined;

  const handleDeploy = () => {
    router.push(`/deployments/new?project=${projectName}`);
  };

  return (
    <div className="flex flex-col h-full">
      <ProjectHeader
        projectName={projectName}
        productionUrl={productionUrl}
        slots={slots}
        onDeploy={handleDeploy}
        onRefresh={fetchSlots}
        isLoading={isLoading}
      />
      <ProjectTabs projectName={projectName} />
      <div className="flex-1 overflow-auto bg-gray-50">
        {children}
      </div>
    </div>
  );
}
