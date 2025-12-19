import { NextRequest, NextResponse } from "next/server";
import { sshExec, getEnvBackups } from "@/lib/ssh";

// GET: Get ENV backups or current ENV
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const project = searchParams.get("project") || searchParams.get("projectName");
    const environment = searchParams.get("env") || searchParams.get("environment") || "production";
    const action = searchParams.get("action") || "list"; // list | current | backups

    if (!project) {
      return NextResponse.json(
        { success: false, error: "project parameter is required" },
        { status: 400 }
      );
    }

    if (action === "backups") {
      // 백업 목록 조회
      const backups = await getEnvBackups(project);
      return NextResponse.json({
        success: true,
        data: backups,
        project,
      });
    }

    if (action === "current") {
      // 현재 ENV 조회 (키만 반환, 값은 마스킹)
      const result = await sshExec(
        "backup",
        `cat /opt/codeb/env-backup/${project}/${environment}/current.env 2>/dev/null || echo ""`
      );

      if (!result.success || !result.output) {
        return NextResponse.json({
          success: true,
          data: [],
          message: "No ENV file found",
        });
      }

      // ENV 파싱 (값 마스킹)
      const envVars = result.output
        .split("\n")
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const [key, ...valueParts] = line.split("=");
          const value = valueParts.join("=");
          const isSensitive =
            key.includes("SECRET") ||
            key.includes("PASSWORD") ||
            key.includes("KEY") ||
            key.includes("TOKEN");
          return {
            key,
            value: isSensitive ? "••••••••" : value,
            isSecret: isSensitive,
          };
        });

      return NextResponse.json({
        success: true,
        data: envVars,
        project,
        environment,
        source: "ssh",
      });
    }

    // 기본: 프로젝트의 ENV 환경 목록
    const result = await sshExec(
      "backup",
      `ls -d /opt/codeb/env-backup/${project}/*/ 2>/dev/null | xargs -I {} basename {}`
    );

    const environments = result.success
      ? result.output.split("\n").filter(Boolean)
      : [];

    return NextResponse.json({
      success: true,
      data: environments,
      project,
    });
  } catch (error) {
    console.error("Failed to fetch ENV:", error);
    return NextResponse.json({
      success: true,
      data: getMockEnvVars(),
      source: "mock",
    });
  }
}

// POST: Update or restore ENV
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { project, projectName, environment, action, version, key, value, variables } = body;

    const projectId = project || projectName;
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "project is required" },
        { status: 400 }
      );
    }

    const env = environment || "production";

    // 단일 변수 설정
    if (action === "set" && key) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      const result = await sshExec(
        "backup",
        `
        BACKUP_DIR="/opt/codeb/env-backup/${projectId}/${env}"
        mkdir -p "$BACKUP_DIR"

        # 현재 상태 백업
        cp "$BACKUP_DIR/current.env" "$BACKUP_DIR/${timestamp}.env" 2>/dev/null || true

        # 변수 설정 (기존 값 대체 또는 추가)
        if grep -q "^${key}=" "$BACKUP_DIR/current.env" 2>/dev/null; then
          sed -i "s|^${key}=.*|${key}=${value}|" "$BACKUP_DIR/current.env"
        else
          echo "${key}=${value}" >> "$BACKUP_DIR/current.env"
        fi

        echo "set"
        `
      );

      return NextResponse.json({
        success: true,
        message: `Variable ${key} set successfully`,
        project: projectId,
        environment: env,
      });
    }

    // ENV 복원
    if (action === "restore") {
      const source = version === "master" ? "master.env" : version || "current.env";
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      const result = await sshExec(
        "backup",
        `
        BACKUP_DIR="/opt/codeb/env-backup/${projectId}/${env}"
        if [ -f "$BACKUP_DIR/${source}" ]; then
          # 현재 상태 백업
          cp "$BACKUP_DIR/current.env" "$BACKUP_DIR/${timestamp}.env" 2>/dev/null || true
          # 복원
          cp "$BACKUP_DIR/${source}" "$BACKUP_DIR/current.env"
          echo "restored from ${source}"
        else
          echo "source not found"
          exit 1
        fi
        `
      );

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || "Restore failed" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `ENV restored from ${source}`,
        project: projectId,
        environment: env,
      });
    }

    // ENV 변수 일괄 업데이트
    if (action === "update" && variables) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      // 현재 ENV 백업 후 업데이트
      const envContent = Object.entries(variables as Record<string, string>)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");

      const result = await sshExec(
        "backup",
        `
        BACKUP_DIR="/opt/codeb/env-backup/${projectId}/${env}"
        mkdir -p "$BACKUP_DIR"

        # 현재 상태 백업
        cp "$BACKUP_DIR/current.env" "$BACKUP_DIR/${timestamp}.env" 2>/dev/null || true

        # 새 ENV 저장
        cat > "$BACKUP_DIR/current.env" << 'ENVEOF'
${envContent}
ENVEOF

        # master.env가 없으면 생성
        [ ! -f "$BACKUP_DIR/master.env" ] && cp "$BACKUP_DIR/current.env" "$BACKUP_DIR/master.env"

        echo "updated"
        `
      );

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || "Update failed" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "ENV updated successfully",
        project: projectId,
        environment: env,
      });
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to update ENV:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update ENV" },
      { status: 500 }
    );
  }
}

// DELETE: Delete ENV backup or variable
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const project = searchParams.get("project") || searchParams.get("projectName");
    const environment = searchParams.get("env") || searchParams.get("environment");
    const filename = searchParams.get("filename");
    const key = searchParams.get("key");

    if (!project || !environment) {
      return NextResponse.json(
        { success: false, error: "project and env are required" },
        { status: 400 }
      );
    }

    // 백업 파일 삭제
    if (filename) {
      // master.env와 current.env는 삭제 불가
      if (filename === "master.env" || filename === "current.env") {
        return NextResponse.json(
          { success: false, error: "Cannot delete master.env or current.env" },
          { status: 400 }
        );
      }

      await sshExec(
        "backup",
        `rm -f "/opt/codeb/env-backup/${project}/${environment}/${filename}"`
      );

      return NextResponse.json({
        success: true,
        message: `Backup ${filename} deleted`,
      });
    }

    // 변수 삭제
    if (key) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      await sshExec(
        "backup",
        `
        BACKUP_DIR="/opt/codeb/env-backup/${project}/${environment}"
        cp "$BACKUP_DIR/current.env" "$BACKUP_DIR/${timestamp}.env" 2>/dev/null || true
        sed -i "/^${key}=/d" "$BACKUP_DIR/current.env"
        `
      );

      return NextResponse.json({
        success: true,
        message: `Variable ${key} deleted`,
      });
    }

    return NextResponse.json(
      { success: false, error: "filename or key is required" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to delete:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete" },
      { status: 500 }
    );
  }
}

function getMockEnvVars() {
  return [
    { key: "NODE_ENV", value: "production", isSecret: false },
    { key: "PORT", value: "3000", isSecret: false },
    { key: "DATABASE_URL", value: "••••••••", isSecret: true },
  ];
}
