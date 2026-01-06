"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderKanban,
  Globe,
  Server,
  Settings,
  Rocket,
  Activity,
  Key,
} from "lucide-react";

const navigation = [
  { name: "대시보드", href: "/", icon: LayoutDashboard },
  { name: "프로젝트", href: "/projects", icon: FolderKanban },
  { name: "배포", href: "/deployments", icon: Rocket },
  { name: "도메인", href: "/domains", icon: Globe },
  { name: "서버", href: "/servers", icon: Server },
  { name: "모니터링", href: "/monitoring", icon: Activity },
  { name: "환경변수", href: "/env", icon: Key },
  { name: "설정", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col bg-gray-900">
      {/* 로고 */}
      <div className="flex h-16 items-center px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <span className="text-lg font-bold text-white">C</span>
          </div>
          <span className="text-xl font-bold text-white">CodeB</span>
        </Link>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* 서버 상태 */}
      <div className="border-t border-gray-800 p-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-sm text-gray-400">앱 서버 온라인</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">158.247.203.55</p>
      </div>
    </div>
  );
}
