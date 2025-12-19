"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Search,
  MoreVertical,
  ExternalLink,
  GitBranch,
  Globe,
  Settings,
  Trash2,
  Rocket,
} from "lucide-react";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/utils";

// Mock data
const projects = [
  {
    id: "1",
    name: "videopick-web",
    type: "nextjs",
    gitRepo: "https://github.com/videopick/web",
    status: "active" as const,
    environments: [
      { name: "staging", status: "running" as const, domain: "videopick-staging.codeb.kr", port: 3001 },
      { name: "production", status: "running" as const, domain: "videopick.codeb.kr", port: 4001 },
    ],
    lastDeployed: "2024-12-17T10:30:00Z",
  },
  {
    id: "2",
    name: "api-gateway",
    type: "nodejs",
    gitRepo: "https://github.com/videopick/api",
    status: "active" as const,
    environments: [
      { name: "staging", status: "deploying" as const, domain: "api-staging.codeb.kr", port: 3002 },
      { name: "production", status: "running" as const, domain: "api.codeb.kr", port: 4002 },
    ],
    lastDeployed: "2024-12-17T09:15:00Z",
  },
  {
    id: "3",
    name: "admin-panel",
    type: "nextjs",
    gitRepo: "https://github.com/videopick/admin",
    status: "active" as const,
    environments: [
      { name: "staging", status: "stopped" as const, domain: "admin-staging.codeb.kr", port: 3003 },
      { name: "production", status: "running" as const, domain: "admin.codeb.kr", port: 4003 },
    ],
    lastDeployed: "2024-12-16T14:20:00Z",
  },
  {
    id: "4",
    name: "landing-page",
    type: "static",
    gitRepo: "https://github.com/videopick/landing",
    status: "active" as const,
    environments: [
      { name: "production", status: "running" as const, domain: "landing.codeb.kr", port: 4004 },
    ],
    lastDeployed: "2024-12-15T08:00:00Z",
  },
];

const projectTypes: Record<string, { label: string; color: string }> = {
  nextjs: { label: "Next.js", color: "bg-black text-white" },
  nodejs: { label: "Node.js", color: "bg-green-600 text-white" },
  remix: { label: "Remix", color: "bg-purple-600 text-white" },
  static: { label: "Static", color: "bg-gray-600 text-white" },
};

export default function ProjectsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const filteredProjects = projects.filter((project) => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = !selectedType || project.type === selectedType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="flex flex-col">
      <Header
        title="Projects"
        description="Manage your deployment projects"
      />

      <div className="p-6 space-y-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Type Filter */}
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedType(null)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  !selectedType ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                All
              </button>
              {Object.entries(projectTypes).map(([type, { label }]) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    selectedType === type ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <Link href="/projects/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </Link>
        </div>

        {/* Projects Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <Card key={project.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                      <span className="text-lg font-bold text-gray-600">
                        {project.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{project.name}</h3>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${projectTypes[project.type].color}`}>
                        {projectTypes[project.type].label}
                      </span>
                    </div>
                  </div>
                  <button className="p-1 rounded hover:bg-gray-100">
                    <MoreVertical className="h-4 w-4 text-gray-500" />
                  </button>
                </div>

                {/* Git Repo */}
                {project.gitRepo && (
                  <a
                    href={project.gitRepo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4"
                  >
                    <GitBranch className="h-4 w-4" />
                    <span className="truncate">{project.gitRepo.replace("https://github.com/", "")}</span>
                  </a>
                )}

                {/* Environments */}
                <div className="space-y-2 mb-4">
                  {project.environments.map((env) => (
                    <div key={env.name} className="flex items-center justify-between py-2 border-t border-gray-100">
                      <div className="flex items-center gap-2">
                        <Badge variant={env.name === "production" ? "info" : "default"}>
                          {env.name}
                        </Badge>
                        <StatusBadge status={env.status} />
                      </div>
                      <a
                        href={`https://${env.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <Globe className="h-3 w-3" />
                        {env.domain}
                      </a>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <span className="text-xs text-gray-500">
                    Deployed {formatRelativeTime(project.lastDeployed)}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm">
                      <Rocket className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {filteredProjects.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No projects found</p>
            <Link href="/projects/new">
              <Button className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Create your first project
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
