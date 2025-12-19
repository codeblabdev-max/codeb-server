"use client";

import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FolderKanban,
  Globe,
  Server,
  Activity,
  ArrowUpRight,
  Rocket,
  HardDrive,
  Cpu,
} from "lucide-react";
import Link from "next/link";

// Mock data - 실제로는 API에서 가져옴
const stats = [
  { name: "Total Projects", value: "12", icon: FolderKanban, change: "+2 this week" },
  { name: "Active Domains", value: "18", icon: Globe, change: "3 pending SSL" },
  { name: "Running Containers", value: "24", icon: Server, change: "98% uptime" },
  { name: "Deployments Today", value: "8", icon: Rocket, change: "+3 from yesterday" },
];

const recentProjects = [
  { name: "videopick-web", type: "nextjs", env: "production", status: "running" as const, domain: "videopick.codeb.kr" },
  { name: "api-gateway", type: "nodejs", env: "staging", status: "deploying" as const, domain: "api-staging.codeb.kr" },
  { name: "admin-panel", type: "nextjs", env: "production", status: "running" as const, domain: "admin.codeb.kr" },
  { name: "landing-page", type: "static", env: "production", status: "running" as const, domain: "landing.codeb.kr" },
];

const serverHealth = {
  disk: { used: 45, total: 100 },
  memory: { used: 62, total: 100 },
  cpu: 28,
};

export default function DashboardPage() {
  return (
    <div className="flex flex-col">
      <Header
        title="Dashboard"
        description="Overview of your deployment infrastructure"
      />

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.name}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                    <p className="mt-1 text-3xl font-semibold text-gray-900">{stat.value}</p>
                    <p className="mt-1 text-xs text-gray-500">{stat.change}</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50">
                    <stat.icon className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Recent Projects */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Projects</CardTitle>
              <Link href="/projects">
                <Button variant="ghost" size="sm">
                  View all <ArrowUpRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-sm text-gray-500">
                    <th className="px-6 py-3 font-medium">Project</th>
                    <th className="px-6 py-3 font-medium">Environment</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Domain</th>
                  </tr>
                </thead>
                <tbody>
                  {recentProjects.map((project) => (
                    <tr key={project.name} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{project.name}</p>
                          <p className="text-sm text-gray-500">{project.type}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">{project.env}</span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={project.status} />
                      </td>
                      <td className="px-6 py-4">
                        <a
                          href={`https://${project.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline"
                        >
                          {project.domain}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Server Health */}
          <Card>
            <CardHeader>
              <CardTitle>Server Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Disk Usage */}
              <div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-600">Disk Usage</span>
                  </div>
                  <span className="font-medium">{serverHealth.disk.used}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${serverHealth.disk.used}%` }}
                  />
                </div>
              </div>

              {/* Memory Usage */}
              <div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-600">Memory Usage</span>
                  </div>
                  <span className="font-medium">{serverHealth.memory.used}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-green-500"
                    style={{ width: `${serverHealth.memory.used}%` }}
                  />
                </div>
              </div>

              {/* CPU Usage */}
              <div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-600">CPU Usage</span>
                  </div>
                  <span className="font-medium">{serverHealth.cpu}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-yellow-500"
                    style={{ width: `${serverHealth.cpu}%` }}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500">Last updated: Just now</p>
                <p className="text-xs text-gray-500">Server: 158.247.203.55</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Link href="/projects/new">
                <Button>
                  <FolderKanban className="mr-2 h-4 w-4" />
                  New Project
                </Button>
              </Link>
              <Link href="/deployments/new">
                <Button variant="secondary">
                  <Rocket className="mr-2 h-4 w-4" />
                  Deploy
                </Button>
              </Link>
              <Link href="/domains/new">
                <Button variant="outline">
                  <Globe className="mr-2 h-4 w-4" />
                  Add Domain
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
