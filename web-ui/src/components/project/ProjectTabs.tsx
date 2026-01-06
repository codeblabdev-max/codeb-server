"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, Settings, Globe } from "lucide-react";
import { clsx } from "clsx";

interface ProjectTabsProps {
  projectName: string;
}

const tabs = [
  {
    name: "배포",
    href: (project: string) => `/projects/${project}/deployments`,
    icon: Layers,
  },
  {
    name: "설정",
    href: (project: string) => `/projects/${project}/settings`,
    icon: Settings,
  },
  {
    name: "도메인",
    href: (project: string) => `/projects/${project}/domains`,
    icon: Globe,
  },
];

export function ProjectTabs({ projectName }: ProjectTabsProps) {
  const pathname = usePathname();

  return (
    <div className="border-b border-gray-200 bg-white px-6">
      <nav className="flex gap-6" aria-label="Tabs">
        {tabs.map((tab) => {
          const href = tab.href(projectName);
          const isActive = pathname === href || pathname.startsWith(href + "/");
          const Icon = tab.icon;

          return (
            <Link
              key={tab.name}
              href={href}
              className={clsx(
                "flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors",
                isActive
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
