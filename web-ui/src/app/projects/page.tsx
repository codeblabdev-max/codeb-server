"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectCard } from "@/components/project/ProjectCard";
import { slotApi, SlotRegistry } from "@/lib/api";
import {
  Plus,
  Search,
  RefreshCw,
  LayoutGrid,
  List,
  Filter,
  ChevronDown,
} from "lucide-react";

interface ProjectWithSlots {
  id: string;
  name: string;
  type: "nextjs" | "remix" | "nodejs" | "python" | "go" | "static";
  gitRepo?: string;
  slots: SlotRegistry[];
}

const projectTypes: Record<string, { label: string; color: string }> = {
  nextjs: { label: "Next.js", color: "bg-black text-white" },
  nodejs: { label: "Node.js", color: "bg-green-600 text-white" },
  remix: { label: "Remix", color: "bg-purple-600 text-white" },
  python: { label: "Python", color: "bg-blue-600 text-white" },
  go: { label: "Go", color: "bg-cyan-600 text-white" },
  static: { label: "Static", color: "bg-gray-600 text-white" },
};

export default function ProjectsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [projects, setProjects] = useState<ProjectWithSlots[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
        ([name, slots]) => ({
          id: name,
          name,
          type: "nextjs" as const,
          slots,
        })
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

  const filteredProjects = projects.filter((project) => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = !selectedType || project.type === selectedType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header
        title="프로젝트"
        description="Blue-Green 배포 프로젝트 관리"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchProjects} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
            <Link href="/projects/new">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                새 프로젝트
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex-1 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* 도구 모음 */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* 검색 & 필터 */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* 검색 */}
              <div className="relative flex-1 sm:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  type="text"
                  placeholder="프로젝트 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-white"
                />
              </div>

              {/* 타입 필터 드롭다운 */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Filter className="h-4 w-4" />
                    {selectedType ? projectTypes[selectedType]?.label : "전체 타입"}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => setSelectedType(null)}>
                    전체 타입
                  </DropdownMenuItem>
                  {Object.entries(projectTypes).map(([type, { label }]) => (
                    <DropdownMenuItem key={type} onClick={() => setSelectedType(type)}>
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* 보기 모드 전환 */}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "grid" | "list")}>
              <TabsList className="bg-white border">
                <TabsTrigger value="grid" className="gap-2">
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden sm:inline">그리드</span>
                </TabsTrigger>
                <TabsTrigger value="list" className="gap-2">
                  <List className="h-4 w-4" />
                  <span className="hidden sm:inline">목록</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* 프로젝트 목록 */}
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <RefreshCw className="mx-auto h-8 w-8 animate-spin text-gray-400" />
                <p className="mt-4 text-gray-500">프로젝트 로딩 중...</p>
              </div>
            </div>
          ) : filteredProjects.length > 0 ? (
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                  : "space-y-3"
              }
            >
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  name={project.name}
                  type={project.type}
                  slots={project.slots}
                  gitRepo={project.gitRepo}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="rounded-full bg-gray-100 p-4 mb-4">
                <Plus className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">프로젝트가 없습니다</h3>
              <p className="text-gray-500 mb-4">
                {searchQuery || selectedType
                  ? "검색 조건을 변경해 보세요"
                  : "첫 번째 프로젝트를 생성해 보세요"}
              </p>
              <Link href="/projects/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  프로젝트 생성
                </Button>
              </Link>
            </div>
          )}

          {/* 통계 푸터 */}
          {!isLoading && filteredProjects.length > 0 && (
            <div className="flex items-center justify-between text-sm text-gray-500 pt-4 border-t">
              <span>
                {projects.length}개 중 {filteredProjects.length}개 프로젝트 표시
              </span>
              <span>
                총 {projects.reduce((acc, p) => acc + p.slots.length, 0)}개 환경
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
