import { NextRequest, NextResponse } from "next/server";
import {
  generateConnectionToken,
  generateSubscriptionToken,
  publish,
  broadcast,
  getChannelPresence,
  getClientConfig,
  deployStart,
  deployProgress,
  deployLog,
  deploySuccess,
  deployError,
  serverAlert,
  sendNotification,
  sendSystemAlert,
  CHANNELS,
} from "@/lib/centrifugo";
import { verifyToken } from "@/lib/auth";

// GET: Get Centrifugo connection config and token
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "config";

    // 토큰 검증
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    let userId = "anonymous";
    if (token) {
      const payload = await verifyToken(token);
      if (payload) {
        userId = payload.userId;
      }
    }

    // 클라이언트 설정 반환
    if (action === "config") {
      const config = getClientConfig();
      const connectionToken = await generateConnectionToken(userId);

      return NextResponse.json({
        success: true,
        data: {
          ...config,
          token: connectionToken,
          userId,
        },
      });
    }

    // 채널 구독 토큰 발급
    if (action === "subscribe") {
      const channel = searchParams.get("channel");
      if (!channel) {
        return NextResponse.json(
          { success: false, error: "channel is required" },
          { status: 400 }
        );
      }

      const subscriptionToken = await generateSubscriptionToken(userId, channel);

      return NextResponse.json({
        success: true,
        data: {
          channel,
          token: subscriptionToken,
        },
      });
    }

    // 채널 정보 조회
    if (action === "presence") {
      const channel = searchParams.get("channel");
      if (!channel) {
        return NextResponse.json(
          { success: false, error: "channel is required" },
          { status: 400 }
        );
      }

      try {
        const presence = await getChannelPresence(channel);
        return NextResponse.json({
          success: true,
          data: presence,
        });
      } catch (error) {
        return NextResponse.json({
          success: true,
          data: { clients: [] },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: getClientConfig(),
    });
  } catch (error) {
    console.error("Failed to get realtime config:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get realtime config" },
      { status: 500 }
    );
  }
}

// POST: Publish events to Centrifugo
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, channel, data, project, environment, message, level, userId, notification } = body;

    // 권한 검증 (API Key 또는 JWT)
    const authHeader = request.headers.get("authorization");
    const apiKey = request.headers.get("x-api-key");

    if (!apiKey && !authHeader) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    if (apiKey) {
      const validKeys = (process.env.API_KEYS || "codeb-api-key-1,codeb-api-key-2").split(",");
      if (!validKeys.includes(apiKey)) {
        return NextResponse.json(
          { success: false, error: "Invalid API key" },
          { status: 401 }
        );
      }
    } else {
      const token = authHeader?.replace("Bearer ", "");
      const payload = token ? await verifyToken(token) : null;
      if (!payload || payload.role !== "admin") {
        return NextResponse.json(
          { success: false, error: "Admin access required for publishing" },
          { status: 403 }
        );
      }
    }

    // 직접 채널에 발행
    if (action === "publish" && channel && data) {
      await publish(channel, data);
      return NextResponse.json({
        success: true,
        message: `Published to ${channel}`,
      });
    }

    // 여러 채널에 브로드캐스트
    if (action === "broadcast" && body.channels && data) {
      await broadcast(body.channels, data);
      return NextResponse.json({
        success: true,
        message: `Broadcasted to ${body.channels.length} channels`,
      });
    }

    // 배포 이벤트
    if (action === "deploy") {
      const eventType = body.type || "log";

      switch (eventType) {
        case "start":
          await deployStart(project, environment, body.branch);
          break;
        case "progress":
          await deployProgress(project, environment, message, body.progress || 0);
          break;
        case "log":
          await deployLog(project, environment, message);
          break;
        case "success":
          await deploySuccess(project, environment, body.metadata);
          break;
        case "error":
          await deployError(project, environment, message);
          break;
        default:
          return NextResponse.json(
            { success: false, error: "Unknown deploy event type" },
            { status: 400 }
          );
      }

      return NextResponse.json({
        success: true,
        message: `Deploy ${eventType} event published`,
      });
    }

    // 서버 알림
    if (action === "server-alert") {
      const server = body.server;
      if (!server || !message || !level) {
        return NextResponse.json(
          { success: false, error: "server, message, and level are required" },
          { status: 400 }
        );
      }

      await serverAlert(server, message, level);
      return NextResponse.json({
        success: true,
        message: "Server alert published",
      });
    }

    // 사용자 알림
    if (action === "notify") {
      if (userId && notification) {
        await sendNotification(userId, notification);
        return NextResponse.json({
          success: true,
          message: `Notification sent to ${userId}`,
        });
      }

      if (notification) {
        await sendSystemAlert(notification);
        return NextResponse.json({
          success: true,
          message: "System alert sent",
        });
      }

      return NextResponse.json(
        { success: false, error: "notification is required" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to publish event:", error);
    return NextResponse.json(
      { success: false, error: "Failed to publish event" },
      { status: 500 }
    );
  }
}
