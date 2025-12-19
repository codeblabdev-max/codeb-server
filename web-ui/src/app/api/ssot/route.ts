import { NextRequest, NextResponse } from "next/server";
import { sshExec, SERVERS, getAllServersStatus, getContainers } from "@/lib/ssh";

// Types
type PortRange = { start: number; end: number; allocated: number[] };
type PortAllocation = Record<string, Record<string, PortRange>>;

// GET: Get SSOT status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "status";

    // 전체 상태 조회
    if (action === "status" || action === "get") {
      // SSOT 레지스트리 조회
      const registryResult = await sshExec(
        "app",
        `cat /opt/codeb/config/ssot-registry.json 2>/dev/null || echo "{}"`
      );

      // 서버 상태 조회
      const servers = await getAllServersStatus();

      // 포트 할당 현황
      const portsResult = await sshExec(
        "app",
        `cat /opt/codeb/config/port-allocation.json 2>/dev/null || echo "{}"`
      );

      let registry = {};
      let ports = {};

      try {
        registry = JSON.parse(registryResult.output || "{}");
      } catch {}

      try {
        ports = JSON.parse(portsResult.output || "{}");
      } catch {}

      return NextResponse.json({
        success: true,
        data: {
          version: "1.0.0",
          lastUpdated: new Date().toISOString(),
          servers,
          projects: registry,
          portAllocation: ports,
        },
        source: "ssh",
      });
    }

    // 프로젝트 목록
    if (action === "projects") {
      const result = await sshExec(
        "app",
        `cat /opt/codeb/config/ssot-registry.json 2>/dev/null || echo "{}"`
      );

      let projects = {};
      try {
        projects = JSON.parse(result.output || "{}");
      } catch {}

      return NextResponse.json({
        success: true,
        data: projects,
        source: "ssh",
      });
    }

    // 서버 목록
    if (action === "servers") {
      const servers = await getAllServersStatus();
      return NextResponse.json({
        success: true,
        data: servers,
        source: "ssh",
      });
    }

    // 포트 할당 현황
    if (action === "ports") {
      const result = await sshExec(
        "app",
        `cat /opt/codeb/config/port-allocation.json 2>/dev/null || echo "{}"`
      );

      let ports: PortAllocation = {};
      try {
        ports = JSON.parse(result.output || "{}");
      } catch {
        // 기본 포트 구조 반환
        ports = getDefaultPortAllocation();
      }

      return NextResponse.json({
        success: true,
        data: ports,
        source: "ssh",
      });
    }

    // 컨테이너 목록
    if (action === "containers") {
      const appContainers = await getContainers("app");
      const backupContainers = await getContainers("backup");

      return NextResponse.json({
        success: true,
        data: {
          app: appContainers,
          backup: backupContainers,
        },
        source: "ssh",
      });
    }

    // 통계
    if (action === "stats") {
      const registryResult = await sshExec(
        "app",
        `cat /opt/codeb/config/ssot-registry.json 2>/dev/null || echo "{}"`
      );

      const appContainers = await getContainers("app");
      const backupContainers = await getContainers("backup");

      let registry = {};
      try {
        registry = JSON.parse(registryResult.output || "{}");
      } catch {}

      const projectCount = Object.keys(registry).length;
      const runningContainers = [...appContainers, ...backupContainers].filter(
        (c) => c.status?.includes("Up")
      ).length;

      return NextResponse.json({
        success: true,
        data: {
          projects: projectCount,
          containers: {
            total: appContainers.length + backupContainers.length,
            running: runningContainers,
          },
          servers: Object.keys(SERVERS).length,
        },
        source: "ssh",
      });
    }

    return NextResponse.json({
      success: true,
      data: getMockSSOT(),
      source: "mock",
    });
  } catch (error) {
    console.error("Failed to fetch SSOT:", error);
    return NextResponse.json({
      success: true,
      data: getMockSSOT(),
      source: "mock",
    });
  }
}

// POST: Perform SSOT actions
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, error: "action is required" },
        { status: 400 }
      );
    }

    // 서버 스캔 (데이터 동기화)
    if (action === "scan" || action === "sync") {
      // App 서버 컨테이너 스캔
      const appContainers = await getContainers("app");
      const backupContainers = await getContainers("backup");

      // 현재 SSOT 레지스트리 조회
      const registryResult = await sshExec(
        "app",
        `cat /opt/codeb/config/ssot-registry.json 2>/dev/null || echo "{}"`
      );

      let registry: Record<string, unknown> = {};
      try {
        registry = JSON.parse(registryResult.output || "{}");
      } catch {}

      // 컨테이너에서 프로젝트 정보 추출 및 업데이트
      for (const container of appContainers) {
        if (container.name.startsWith("codeb-")) continue; // 시스템 컨테이너 제외

        const projectName = container.name.replace(/-staging|-production/, "");
        const environment = container.name.includes("-staging")
          ? "staging"
          : "production";

        if (!registry[projectName]) {
          registry[projectName] = {
            name: projectName,
            type: "unknown",
            status: "active",
            environments: {},
          };
        }

        const project = registry[projectName] as {
          environments?: Record<string, unknown>;
        };
        if (!project.environments) {
          project.environments = {};
        }

        project.environments[environment] = {
          status: container.status?.includes("Up") ? "running" : "stopped",
          container: container.name,
          image: container.image,
          scannedAt: new Date().toISOString(),
        };
      }

      // 레지스트리 저장
      await sshExec(
        "app",
        `mkdir -p /opt/codeb/config && cat > /opt/codeb/config/ssot-registry.json << 'EOF'
${JSON.stringify(registry, null, 2)}
EOF`
      );

      return NextResponse.json({
        success: true,
        data: {
          scanned: {
            app: appContainers.length,
            backup: backupContainers.length,
          },
          projects: Object.keys(registry).length,
          updatedAt: new Date().toISOString(),
        },
        message: "Scan completed",
      });
    }

    // 포트 할당
    if (action === "allocate-port") {
      const { environment = "production", type = "app" } = params;

      // 현재 포트 할당 조회
      const portsResult = await sshExec(
        "app",
        `cat /opt/codeb/config/port-allocation.json 2>/dev/null || echo "{}"`
      );

      let ports: PortAllocation = {};
      try {
        ports = JSON.parse(portsResult.output || "{}");
      } catch {
        ports = getDefaultPortAllocation();
      }

      const defaultPorts = getDefaultPortAllocation();
      if (!ports[environment]) {
        ports[environment] = defaultPorts[environment] || defaultPorts["production"];
      }

      const range = ports[environment]?.[type];
      if (!range) {
        return NextResponse.json(
          { success: false, error: `Unknown port type: ${type}` },
          { status: 400 }
        );
      }

      // 사용 가능한 포트 찾기
      const allocated = range.allocated || [];
      let newPort = range.start;
      while (allocated.includes(newPort) && newPort <= range.end) {
        newPort++;
      }

      if (newPort > range.end) {
        return NextResponse.json(
          { success: false, error: "No available ports in range" },
          { status: 400 }
        );
      }

      // 포트 할당
      allocated.push(newPort);
      range.allocated = allocated;

      // 저장
      await sshExec(
        "app",
        `cat > /opt/codeb/config/port-allocation.json << 'EOF'
${JSON.stringify(ports, null, 2)}
EOF`
      );

      return NextResponse.json({
        success: true,
        data: {
          port: newPort,
          environment,
          type,
        },
      });
    }

    // 포트 해제
    if (action === "release-port") {
      const { port, environment = "production", type = "app" } = params;

      if (!port) {
        return NextResponse.json(
          { success: false, error: "port is required" },
          { status: 400 }
        );
      }

      const portsResult = await sshExec(
        "app",
        `cat /opt/codeb/config/port-allocation.json 2>/dev/null || echo "{}"`
      );

      let ports: Record<string, Record<string, { allocated: number[] }>> = {};
      try {
        ports = JSON.parse(portsResult.output || "{}");
      } catch {}

      if (ports[environment]?.[type]?.allocated) {
        ports[environment][type].allocated = ports[environment][type].allocated.filter(
          (p: number) => p !== parseInt(port)
        );

        await sshExec(
          "app",
          `cat > /opt/codeb/config/port-allocation.json << 'EOF'
${JSON.stringify(ports, null, 2)}
EOF`
        );
      }

      return NextResponse.json({
        success: true,
        message: `Port ${port} released`,
      });
    }

    // 프로젝트 등록
    if (action === "register-project") {
      const { name, type, gitRepo, domain, port } = params;

      if (!name) {
        return NextResponse.json(
          { success: false, error: "name is required" },
          { status: 400 }
        );
      }

      const registryResult = await sshExec(
        "app",
        `cat /opt/codeb/config/ssot-registry.json 2>/dev/null || echo "{}"`
      );

      let registry: Record<string, unknown> = {};
      try {
        registry = JSON.parse(registryResult.output || "{}");
      } catch {}

      registry[name] = {
        name,
        type: type || "nodejs",
        gitRepo: gitRepo || "",
        domain: domain || `${name}.codeb.kr`,
        port,
        status: "registered",
        registeredAt: new Date().toISOString(),
      };

      await sshExec(
        "app",
        `cat > /opt/codeb/config/ssot-registry.json << 'EOF'
${JSON.stringify(registry, null, 2)}
EOF`
      );

      return NextResponse.json({
        success: true,
        data: registry[name],
        message: `Project ${name} registered`,
      });
    }

    return NextResponse.json(
      { success: false, error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to perform SSOT action:", error);
    return NextResponse.json(
      { success: false, error: "Failed to perform SSOT action" },
      { status: 500 }
    );
  }
}

function getDefaultPortAllocation(): PortAllocation {
  return {
    production: {
      app: { start: 4000, end: 4499, allocated: [] },
      db: { start: 5432, end: 5432, allocated: [] },
    },
    staging: {
      app: { start: 4500, end: 4999, allocated: [] },
    },
    preview: {
      app: { start: 5000, end: 5999, allocated: [] },
    },
  };
}

function getMockSSOT() {
  return {
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    servers: SERVERS,
    projects: {},
    portAllocation: getDefaultPortAllocation(),
  };
}
