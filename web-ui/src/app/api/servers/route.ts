import { NextRequest, NextResponse } from "next/server";
import { getAllServersStatus, getServerMetrics, SERVERS, ServerName } from "@/lib/ssh";

// GET: Get all servers status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const serverName = searchParams.get("name") as ServerName | null;

    // 단일 서버 조회
    if (serverName) {
      if (!SERVERS[serverName]) {
        return NextResponse.json(
          { success: false, error: `Unknown server: ${serverName}` },
          { status: 400 }
        );
      }

      const data = await getServerMetrics(serverName);
      return NextResponse.json({
        success: true,
        data,
        source: "ssh",
      });
    }

    // 모든 서버 조회
    const data = await getAllServersStatus();
    return NextResponse.json({
      success: true,
      data,
      source: "ssh",
    });
  } catch (error) {
    console.error("Failed to fetch servers:", error);
    return NextResponse.json({
      success: true,
      data: getStaticServers(),
      source: "static",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// POST: Trigger server scan (refresh)
export async function POST(request: NextRequest) {
  try {
    const data = await getAllServersStatus();
    return NextResponse.json({
      success: true,
      data,
      source: "ssh",
      message: "Server scan completed",
    });
  } catch (error) {
    console.error("Failed to scan servers:", error);
    return NextResponse.json(
      { success: false, error: "Failed to scan servers" },
      { status: 500 }
    );
  }
}

// Static server info (fallback)
function getStaticServers() {
  return {
    app: {
      ...SERVERS.app,
      status: "unknown",
      metrics: {},
    },
    streaming: {
      ...SERVERS.streaming,
      status: "unknown",
      metrics: {},
    },
    storage: {
      ...SERVERS.storage,
      status: "unknown",
      metrics: {},
    },
    backup: {
      ...SERVERS.backup,
      status: "unknown",
      metrics: {},
    },
  };
}
