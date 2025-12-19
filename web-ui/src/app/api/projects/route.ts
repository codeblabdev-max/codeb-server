import { NextRequest, NextResponse } from "next/server";
import { getProjects, getContainers, sshExec } from "@/lib/ssh";

// GET: Get all projects
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includePreview = searchParams.get("preview") !== "false";

    const projects = await getProjects();

    // Preview 환경 필터링 옵션
    const filteredProjects = includePreview
      ? projects
      : projects.map((p: { environments?: unknown[] }) => ({
          ...p,
          environments: (p.environments || []).filter(
            (e: { name?: string }) => e.name !== "preview"
          ),
        }));

    return NextResponse.json({
      success: true,
      data: filteredProjects,
      source: "ssh",
      count: filteredProjects.length,
    });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json({
      success: true,
      data: getMockProjects(),
      source: "mock",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// POST: Register new project
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, projectType, gitRepo, description, port, domain } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "projectId is required" },
        { status: 400 }
      );
    }

    // SSOT 레지스트리에 등록
    const registryEntry = {
      name: projectId,
      type: projectType || "nodejs",
      gitRepo: gitRepo || "",
      description: description || "",
      port: port,
      domain: domain || `${projectId}.codeb.kr`,
      status: "registered",
      registeredAt: new Date().toISOString(),
    };

    const result = await sshExec(
      "app",
      `mkdir -p /opt/codeb/config && cat > /tmp/project-${projectId}.json << 'EOF'
${JSON.stringify(registryEntry, null, 2)}
EOF
jq -s '.[0] * {"${projectId}": .[1]}' /opt/codeb/config/ssot-registry.json /tmp/project-${projectId}.json > /tmp/ssot-new.json 2>/dev/null || echo '{"${projectId}": ${JSON.stringify(registryEntry)}}' > /tmp/ssot-new.json
mv /tmp/ssot-new.json /opt/codeb/config/ssot-registry.json
rm /tmp/project-${projectId}.json
echo "registered"`
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to register project" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: registryEntry,
      message: `Project ${projectId} registered successfully`,
    });
  } catch (error) {
    console.error("Failed to register project:", error);
    return NextResponse.json(
      { success: false, error: "Failed to register project" },
      { status: 500 }
    );
  }
}

// DELETE: Remove project
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("id");

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "Project ID is required" },
        { status: 400 }
      );
    }

    // SSOT에서 제거 (실제 컨테이너는 we workflow stop 사용)
    const result = await sshExec(
      "app",
      `jq 'del(.${projectId})' /opt/codeb/config/ssot-registry.json > /tmp/ssot-new.json && mv /tmp/ssot-new.json /opt/codeb/config/ssot-registry.json`
    );

    return NextResponse.json({
      success: true,
      message: `Project ${projectId} removed from registry`,
    });
  } catch (error) {
    console.error("Failed to delete project:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete project" },
      { status: 500 }
    );
  }
}

function getMockProjects() {
  return [
    {
      id: "1",
      name: "videopick-web",
      type: "nextjs",
      gitRepo: "https://github.com/videopick/web",
      status: "active",
      environments: [
        { name: "staging", status: "running", domain: "videopick-staging.codeb.kr", port: 3001 },
        { name: "production", status: "running", domain: "videopick.codeb.kr", port: 4001 },
      ],
      lastDeployed: "2024-12-17T10:30:00Z",
    },
    {
      id: "2",
      name: "api-gateway",
      type: "nodejs",
      gitRepo: "https://github.com/videopick/api",
      status: "active",
      environments: [
        { name: "staging", status: "deploying", domain: "api-staging.codeb.kr", port: 3002 },
        { name: "production", status: "running", domain: "api.codeb.kr", port: 4002 },
      ],
      lastDeployed: "2024-12-17T09:15:00Z",
    },
  ];
}
