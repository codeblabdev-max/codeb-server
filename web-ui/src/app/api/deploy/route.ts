import { NextRequest, NextResponse } from "next/server";
import { sshExec } from "@/lib/ssh";
import {
  deployStart,
  deployProgress,
  deployLog,
  deploySuccess,
  deployError,
} from "@/lib/centrifugo";

// GET: Fetch deployment history or status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const project = searchParams.get("project") || searchParams.get("projectName");
    const environment = searchParams.get("env") || searchParams.get("environment");
    const action = searchParams.get("action") || "history";

    // 배포 이력 조회
    if (action === "history") {
      const result = await sshExec(
        "app",
        `cat /opt/codeb/logs/deployments.json 2>/dev/null || echo "[]"`
      );

      let deployments = [];
      try {
        deployments = JSON.parse(result.output || "[]");
      } catch {
        deployments = [];
      }

      // 필터링
      if (project) {
        deployments = deployments.filter((d: { project?: string; projectName?: string }) =>
          d.project === project || d.projectName === project
        );
      }
      if (environment) {
        deployments = deployments.filter((d: { environment?: string }) =>
          d.environment === environment
        );
      }

      return NextResponse.json({
        success: true,
        data: deployments.length > 0 ? deployments : getMockDeployments(),
        source: deployments.length > 0 ? "ssh" : "mock",
      });
    }

    // 현재 배포 상태 조회
    if (action === "status" && project) {
      const containerName = `${project}-${environment || "production"}`;

      const containerStatus = await sshExec(
        "app",
        `podman ps -a --filter name=${containerName} --format "{{.Status}}" 2>/dev/null`
      );

      const containerImage = await sshExec(
        "app",
        `podman ps -a --filter name=${containerName} --format "{{.Image}}" 2>/dev/null`
      );

      return NextResponse.json({
        success: true,
        data: {
          project,
          environment: environment || "production",
          container: containerName,
          status: containerStatus.output?.includes("Up") ? "running" : "stopped",
          image: containerImage.output?.trim() || "unknown",
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: getMockDeployments(),
      source: "mock",
    });
  } catch (error) {
    console.error("Failed to fetch deployments:", error);
    return NextResponse.json({
      success: true,
      data: getMockDeployments(),
      source: "mock",
    });
  }
}

// POST: Trigger new deployment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      project,
      projectName,
      environment = "production",
      image,
      branch,
      port,
      skipHealthcheck = false,
    } = body;

    const projectId = project || projectName;
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "project is required" },
        { status: 400 }
      );
    }

    const deploymentId = `deploy-${Date.now()}`;
    const containerName = `${projectId}-${environment}`;
    const server = environment === "preview" ? "backup" : "app";

    // 배포 시작 이벤트
    try {
      await deployStart(projectId, environment, branch);
    } catch (e) {
      // Centrifugo 실패해도 배포는 계속
      console.log("Centrifugo not available:", e);
    }

    // 이미지 결정
    const deployImage = image || `ghcr.io/codeblabdev-max/${projectId}:latest`;

    // 포트 결정
    let targetPort = port;
    if (!targetPort) {
      // SSOT에서 포트 조회
      const ssotResult = await sshExec(
        "app",
        `jq -r '.${projectId}.port // empty' /opt/codeb/config/ssot-registry.json 2>/dev/null`
      );
      targetPort = ssotResult.output?.trim() || (environment === "production" ? 4000 : 4500);
    }

    try {
      await deployProgress(projectId, environment, "Pulling image...", 10);
    } catch {}

    // 배포 명령
    const deployCmd = `
      set -e

      # 이미지 풀
      echo "[$(date)] Pulling image: ${deployImage}"
      podman pull ${deployImage}

      # 기존 컨테이너 중지
      echo "[$(date)] Stopping existing container..."
      podman stop ${containerName} 2>/dev/null || true
      podman rm ${containerName} 2>/dev/null || true

      # ENV 파일 확인
      ENV_FILE="/opt/codeb/env-backup/${projectId}/${environment}/current.env"
      if [ ! -f "$ENV_FILE" ]; then
        echo "[$(date)] Warning: ENV file not found at $ENV_FILE"
        ENV_FILE=""
      fi

      # 컨테이너 실행
      echo "[$(date)] Starting container..."
      if [ -n "$ENV_FILE" ]; then
        podman run -d \\
          --name ${containerName} \\
          --network codeb-main \\
          -p ${targetPort}:3000 \\
          --restart always \\
          --env-file "$ENV_FILE" \\
          ${deployImage}
      else
        podman run -d \\
          --name ${containerName} \\
          --network codeb-main \\
          -p ${targetPort}:3000 \\
          --restart always \\
          -e NODE_ENV=${environment} \\
          -e PORT=3000 \\
          ${deployImage}
      fi

      # 헬스체크
      ${skipHealthcheck ? "echo 'Skipping healthcheck'" : `
      echo "[$(date)] Running healthcheck..."
      sleep 5
      HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:${targetPort}/api/health || echo "000")
      if [ "$HEALTH" != "200" ] && [ "$HEALTH" != "404" ]; then
        echo "[$(date)] Warning: Healthcheck returned $HEALTH"
      else
        echo "[$(date)] Healthcheck passed: $HEALTH"
      fi
      `}

      # 배포 이력 기록
      mkdir -p /opt/codeb/logs
      cat >> /opt/codeb/logs/deployments.json << EOF
{
  "id": "${deploymentId}",
  "project": "${projectId}",
  "environment": "${environment}",
  "image": "${deployImage}",
  "port": ${targetPort},
  "status": "success",
  "deployedAt": "$(date -Iseconds)",
  "branch": "${branch || "main"}"
}
EOF

      echo "SUCCESS"
    `;

    try {
      await deployProgress(projectId, environment, "Deploying...", 30);
    } catch {}

    const result = await sshExec(server, deployCmd, 180000);

    if (!result.success || !result.output?.includes("SUCCESS")) {
      try {
        await deployError(projectId, environment, result.error || "Deployment failed");
      } catch {}

      return NextResponse.json(
        {
          success: false,
          error: result.error || "Deployment failed",
          output: result.output,
        },
        { status: 500 }
      );
    }

    try {
      await deploySuccess(projectId, environment, {
        image: deployImage,
        port: targetPort,
        container: containerName,
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `Deployment successful`,
      data: {
        deploymentId,
        project: projectId,
        environment,
        image: deployImage,
        port: targetPort,
        container: containerName,
        server,
      },
    });
  } catch (error) {
    console.error("Failed to deploy:", error);
    return NextResponse.json(
      { success: false, error: "Failed to deploy" },
      { status: 500 }
    );
  }
}

// DELETE: Rollback or stop deployment
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const project = searchParams.get("project");
    const environment = searchParams.get("env") || "production";
    const action = searchParams.get("action") || "stop";

    if (!project) {
      return NextResponse.json(
        { success: false, error: "project is required" },
        { status: 400 }
      );
    }

    const containerName = `${project}-${environment}`;
    const server = environment === "preview" ? "backup" : "app";

    if (action === "stop") {
      await sshExec(server, `podman stop ${containerName} 2>/dev/null || true`);
      return NextResponse.json({
        success: true,
        message: `Container ${containerName} stopped`,
      });
    }

    if (action === "remove") {
      await sshExec(
        server,
        `podman stop ${containerName} 2>/dev/null || true && podman rm ${containerName} 2>/dev/null || true`
      );
      return NextResponse.json({
        success: true,
        message: `Container ${containerName} removed`,
      });
    }

    if (action === "rollback") {
      // 이전 이미지로 롤백
      const historyResult = await sshExec(
        server,
        `podman history ${containerName} --format "{{.ID}}" | head -2 | tail -1`
      );

      if (!historyResult.success || !historyResult.output) {
        return NextResponse.json(
          { success: false, error: "No previous image found for rollback" },
          { status: 400 }
        );
      }

      // 현재 상태 저장 후 이전 이미지로 재시작
      const portResult = await sshExec(
        server,
        `podman port ${containerName} 3000 | cut -d: -f2`
      );
      const port = portResult.output?.trim() || "3000";

      await sshExec(
        server,
        `
        podman stop ${containerName}
        podman rm ${containerName}
        podman run -d --name ${containerName} --network codeb-main -p ${port}:3000 --restart always ${historyResult.output.trim()}
        `
      );

      return NextResponse.json({
        success: true,
        message: `Rolled back to previous image`,
      });
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to manage deployment:", error);
    return NextResponse.json(
      { success: false, error: "Failed to manage deployment" },
      { status: 500 }
    );
  }
}

function getMockDeployments() {
  return [
    {
      id: "1",
      project: "videopick-web",
      environment: "production",
      status: "success",
      image: "ghcr.io/videopick/web:latest",
      branch: "main",
      deployedAt: "2024-12-17T10:30:00Z",
      deployedBy: "GitHub Actions",
    },
    {
      id: "2",
      project: "api-gateway",
      environment: "staging",
      status: "deploying",
      image: "ghcr.io/videopick/api:develop",
      branch: "develop",
      deployedAt: "2024-12-17T10:45:00Z",
      deployedBy: "GitHub Actions",
    },
  ];
}
