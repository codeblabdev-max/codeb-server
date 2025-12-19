import { NextRequest, NextResponse } from "next/server";
import { sshExec, getPreviewList } from "@/lib/ssh";

// GET: Get all preview environments
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const project = searchParams.get("project");
    const branch = searchParams.get("branch");

    // Preview 목록 조회
    const previews = await getPreviewList();

    // 필터링
    let filtered = previews;
    if (project) {
      filtered = filtered.filter((p: { project?: string }) => p.project === project);
    }
    if (branch) {
      filtered = filtered.filter((p: { branch?: string }) => p.branch === branch);
    }

    return NextResponse.json({
      success: true,
      data: filtered,
      count: filtered.length,
      source: "ssh",
    });
  } catch (error) {
    console.error("Failed to fetch previews:", error);
    return NextResponse.json({
      success: true,
      data: [],
      source: "mock",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// POST: Create or manage preview
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, project, branch, image, port } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, error: "action is required" },
        { status: 400 }
      );
    }

    // Preview 서버 상태 조회
    if (action === "status") {
      const result = await sshExec(
        "backup",
        `cat /opt/codeb/config/server-status.json 2>/dev/null || echo "{}"`
      );

      const containerCount = await sshExec(
        "backup",
        `podman ps --filter network=codeb-preview --format "{{.Names}}" 2>/dev/null | wc -l`
      );

      const diskUsage = await sshExec("backup", `df -h / | tail -1 | awk '{print $5}'`);
      const memory = await sshExec("backup", `free -h | grep Mem | awk '{print $3 "/" $2}'`);

      let status = {};
      try {
        status = JSON.parse(result.output || "{}");
      } catch {}

      return NextResponse.json({
        success: true,
        data: {
          server: "141.164.37.63",
          domain: "*.preview.codeb.kr",
          portRange: "5000-5999",
          containers: containerCount.success ? containerCount.output.trim() : "0",
          diskUsage: diskUsage.success ? diskUsage.output : "N/A",
          memory: memory.success ? memory.output : "N/A",
          ...status,
        },
      });
    }

    // Preview 로그 조회
    if (action === "logs") {
      if (!branch) {
        return NextResponse.json(
          { success: false, error: "branch is required for logs" },
          { status: 400 }
        );
      }

      const slug = slugify(branch);
      const result = await sshExec(
        "backup",
        `podman logs --tail 200 $(ls /opt/codeb/preview/*-${slug}.json 2>/dev/null | head -1 | xargs -I {} basename {} .json) 2>&1`
      );

      return NextResponse.json({
        success: result.success,
        data: result.output || "",
        branch,
      });
    }

    // Preview 수동 배포 (보통 GitHub Actions로 자동화됨)
    if (action === "deploy") {
      if (!project || !branch || !image) {
        return NextResponse.json(
          { success: false, error: "project, branch, and image are required" },
          { status: 400 }
        );
      }

      const slug = slugify(branch);
      const containerName = `${project}-preview-${slug}`;
      const previewPort = port || 5000 + Math.floor(Math.random() * 999);
      const domain = `${slug}.preview.codeb.kr`;

      // 배포 명령
      const deployCmd = `
        # 기존 컨테이너 정리
        podman stop ${containerName} 2>/dev/null || true
        podman rm ${containerName} 2>/dev/null || true

        # 이미지 풀
        podman pull ${image}

        # 컨테이너 실행
        podman run -d \
          --name ${containerName} \
          --network codeb-preview \
          -p ${previewPort}:3000 \
          --env-file /opt/codeb/env-backup/${project}/preview.env \
          ${image}

        # 레지스트리 등록
        cat > /opt/codeb/preview/${containerName}.json << EOF
{
  "project": "${project}",
  "branch": "${branch}",
  "slug": "${slug}",
  "container": "${containerName}",
  "image": "${image}",
  "port": ${previewPort},
  "domain": "${domain}",
  "createdAt": "$(date -Iseconds)"
}
EOF

        # Caddy 설정
        cat > /etc/caddy/preview.d/${containerName}.caddy << EOF
${domain} {
  reverse_proxy localhost:${previewPort}
}
EOF
        systemctl reload caddy

        echo "deployed"
      `;

      const result = await sshExec("backup", deployCmd, 120000);

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || "Deploy failed" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Preview deployed",
        data: {
          container: containerName,
          domain,
          port: previewPort,
          url: `https://${domain}`,
        },
      });
    }

    // 오래된 Preview 정리
    if (action === "cleanup") {
      const days = body.days || 7;

      const result = await sshExec(
        "backup",
        `
        CLEANED=0
        for f in $(find /opt/codeb/preview -name "*.json" -mtime +${days}); do
          CONTAINER=$(basename $f .json)
          podman stop $CONTAINER 2>/dev/null || true
          podman rm $CONTAINER 2>/dev/null || true
          rm -f $f
          rm -f /etc/caddy/preview.d/$CONTAINER.caddy
          CLEANED=$((CLEANED + 1))
        done
        systemctl reload caddy
        podman image prune -f
        echo $CLEANED
        `,
        120000
      );

      return NextResponse.json({
        success: true,
        message: `Cleaned ${result.output?.trim() || 0} old previews`,
      });
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to manage preview:", error);
    return NextResponse.json(
      { success: false, error: "Failed to manage preview" },
      { status: 500 }
    );
  }
}

// DELETE: Delete preview environment
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const branch = searchParams.get("branch");

    if (!branch) {
      return NextResponse.json(
        { success: false, error: "branch is required" },
        { status: 400 }
      );
    }

    const slug = slugify(branch);

    const result = await sshExec(
      "backup",
      `
      CONTAINER=$(ls /opt/codeb/preview/*-${slug}.json 2>/dev/null | head -1 | xargs -I {} basename {} .json)
      if [ -n "$CONTAINER" ]; then
        podman stop $CONTAINER 2>/dev/null || true
        podman rm $CONTAINER 2>/dev/null || true
        rm -f /opt/codeb/preview/$CONTAINER.json
        rm -f /etc/caddy/preview.d/$CONTAINER.caddy
        systemctl reload caddy
        echo "deleted"
      else
        echo "not_found"
      fi
      `
    );

    if (result.output?.includes("not_found")) {
      return NextResponse.json(
        { success: false, error: `Preview '${branch}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Preview '${branch}' deleted`,
    });
  } catch (error) {
    console.error("Failed to delete preview:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete preview" },
      { status: 500 }
    );
  }
}

function slugify(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);
}
