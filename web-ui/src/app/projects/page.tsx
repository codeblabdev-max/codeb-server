"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SlotStatus, SlotIndicator } from "@/components/slot/slot-status";
import {
  Plus,
  Search,
  MoreVertical,
  ExternalLink,
  GitBranch,
  Globe,
  Settings,
  Rocket,
  ArrowRightLeft,
  RotateCcw,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/utils";
import { slotApi, SlotRegistry, SlotName } from "@/lib/api";

interface ProjectWithSlots {
  id: string;
  name: string;
  type: "nextjs" | "remix" | "nodejs" | "static";
  gitRepo?: string;
  slots: SlotRegistry[];
  lastDeployed?: string;
}

const projectTypes: Record<string, { label: string; color: string }> = {
  nextjs: { label: "Next.js", color: "bg-black text-white" },
  nodejs: { label: "Node.js", color: "bg-green-600 text-white" },
  remix: { label: "Remix", color: "bg-purple-600 text-white" },
  static: { label: "Static", color: "bg-gray-600 text-white" },
};

export default function ProjectsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectWithSlots[]>([]);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchProjects = async () => {
    try {
      setIsLoading(true);
      const slotsData = await slotApi.list();

      // Group slots by project
      const projectMap = new Map<string, SlotRegistry[]>();
      slotsData.forEach((slot) => {
        const existing = projectMap.get(slot.projectName) || [];
        existing.push(slot);
        projectMap.set(slot.projectName, existing);
      });

      // Convert to project list
      const projectList: ProjectWithSlots[] = Array.from(projectMap.entries()).map(
        ([name, slots]) => {
          // Find latest deployment
          let lastDeployed: string | undefined;
          slots.forEach((s) => {
            const blueDate = s.blue.deployedAt;
            const greenDate = s.green.deployedAt;
            const latest = blueDate && greenDate
              ? (new Date(blueDate) > new Date(greenDate) ? blueDate : greenDate)
              : blueDate || greenDate;
            if (latest && (!lastDeployed || new Date(latest) > new Date(lastDeployed))) {
              lastDeployed = latest;
            }
          });

          return {
            id: name,
            name,
            type: "nextjs" as const, // Would come from registry
            slots,
            lastDeployed,
          };
        }
      );

      setProjects(projectList);
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handlePromote = async (projectName: string, environment: string) => {
    try {
      setActionLoading(`${projectName}-${environment}-promote`);
      await slotApi.promote(projectName, environment);
      await fetchProjects();
    } catch (error) {
      console.error("Promote failed:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRollback = async (projectName: string, environment: string) => {
    try {
      setActionLoading(`${projectName}-${environment}-rollback`);
      await slotApi.rollback(projectName, environment);
      await fetchProjects();
    } catch (error) {
      console.error("Rollback failed:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredProjects = projects.filter((project) => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = !selectedType || project.type === selectedType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="flex flex-col">
      <Header
        title="Projects"
        description="Manage your Blue-Green deployment projects"
        action={
          <Button variant="outline" size="sm" onClick={fetchProjects} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
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

        {/* Projects List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-12">
              <RefreshCw className="mx-auto h-8 w-8 animate-spin text-gray-400" />
              <p className="mt-2 text-gray-500">Loading projects...</p>
            </div>
          ) : filteredProjects.length > 0 ? (
            filteredProjects.map((project) => (
              <Card key={project.id} className="overflow-hidden">
                <CardContent className="p-0">
                  {/* Project Header */}
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedProject(
                      expandedProject === project.id ? null : project.id
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
                        <span className="text-xl font-bold text-gray-600">
                          {project.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">{project.name}</h3>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${projectTypes[project.type].color}`}>
                            {projectTypes[project.type].label}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                          <span>{project.slots.length} environment(s)</span>
                          {project.lastDeployed && (
                            <span>Last deployed {formatRelativeTime(project.lastDeployed)}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Slot Indicators for each environment */}
                      <div className="flex gap-3">
                        {project.slots.map((slot) => (
                          <div key={slot.environment} className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{slot.environment}</span>
                            <SlotIndicator
                              activeSlot={slot.activeSlot}
                              blueState={slot.blue.state}
                              greenState={slot.green.state}
                            />
                          </div>
                        ))}
                      </div>

                      {/* Expand/Collapse */}
                      {expandedProject === project.id ? (
                        <ChevronUp className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Slot Details */}
                  {expandedProject === project.id && (
                    <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
                      {project.slots.map((slot) => (
                        <div key={slot.environment} className="bg-white rounded-lg border border-gray-200 p-4">
                          <SlotStatus
                            registry={slot}
                            onPromote={
                              slot.blue.state === "deployed" || slot.green.state === "deployed"
                                ? () => handlePromote(slot.projectName, slot.environment)
                                : undefined
                            }
                            onRollback={
                              slot.blue.state === "grace" || slot.green.state === "grace"
                                ? () => handleRollback(slot.projectName, slot.environment)
                                : undefined
                            }
                            isLoading={
                              actionLoading === `${slot.projectName}-${slot.environment}-promote` ||
                              actionLoading === `${slot.projectName}-${slot.environment}-rollback`
                            }
                          />
                        </div>
                      ))}

                      {/* Project Actions */}
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" size="sm">
                          <Settings className="h-4 w-4 mr-1" />
                          Settings
                        </Button>
                        <Button variant="outline" size="sm">
                          <Globe className="h-4 w-4 mr-1" />
                          Domains
                        </Button>
                        <Link href={`/deployments/new?project=${project.name}`}>
                          <Button size="sm">
                            <Rocket className="h-4 w-4 mr-1" />
                            Deploy
                          </Button>
                        </Link>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
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
    </div>
  );
}
