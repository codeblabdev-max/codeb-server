/**
 * CodeB Centrifugo Integration
 * 실시간 배포 로그 스트리밍 및 알림
 */

import { SignJWT } from 'jose';

// Centrifugo 설정
const CENTRIFUGO_URL = process.env.CENTRIFUGO_URL || 'wss://ws.codeb.kr/connection/websocket';
const CENTRIFUGO_API_URL = process.env.CENTRIFUGO_API_URL || 'http://ws.codeb.kr:8000/api';
const CENTRIFUGO_API_KEY = process.env.CENTRIFUGO_API_KEY || 'pRMupNs6HlGp7G6xkPsAFrI8hN4g6U0G';
const CENTRIFUGO_SECRET = process.env.CENTRIFUGO_SECRET || 'of0KuRFjjzhq5LlBURCuKqzTUAA08hwL';

// 채널 타입
export const CHANNELS = {
  DEPLOY: (project: string) => `deploy:${project}`,
  LOGS: (project: string, env: string) => `logs:${project}:${env}`,
  SERVER: (server: string) => `server:${server}`,
  NOTIFICATIONS: (userId: string) => `user:${userId}:notifications`,
  SYSTEM: 'system:alerts',
} as const;

/**
 * 클라이언트용 연결 토큰 생성
 */
export async function generateConnectionToken(userId: string, expireMinutes = 60): Promise<string> {
  const secret = new TextEncoder().encode(CENTRIFUGO_SECRET);

  const token = await new SignJWT({
    sub: userId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expireMinutes}m`)
    .sign(secret);

  return token;
}

/**
 * 채널 구독 토큰 생성
 */
export async function generateSubscriptionToken(
  userId: string,
  channel: string,
  expireMinutes = 60
): Promise<string> {
  const secret = new TextEncoder().encode(CENTRIFUGO_SECRET);

  const token = await new SignJWT({
    sub: userId,
    channel,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${expireMinutes}m`)
    .sign(secret);

  return token;
}

/**
 * Centrifugo API 호출
 */
async function centrifugoApi(method: string, params: Record<string, unknown> = {}) {
  const response = await fetch(`${CENTRIFUGO_API_URL}/${method}`, {
    method: 'POST',
    headers: {
      'Authorization': `apikey ${CENTRIFUGO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Centrifugo API error: ${error}`);
  }

  return response.json();
}

/**
 * 채널에 메시지 발행
 */
export async function publish(channel: string, data: unknown): Promise<void> {
  await centrifugoApi('publish', { channel, data });
}

/**
 * 여러 채널에 메시지 브로드캐스트
 */
export async function broadcast(channels: string[], data: unknown): Promise<void> {
  await centrifugoApi('broadcast', { channels, data });
}

/**
 * 채널 구독자 수 조회
 */
export async function getChannelPresence(channel: string) {
  return centrifugoApi('presence', { channel });
}

/**
 * 채널 구독자 정보 조회
 */
export async function getChannelInfo(channel: string) {
  return centrifugoApi('info', { channel });
}

// ============================================================================
// 배포 이벤트 헬퍼
// ============================================================================

export interface DeployEvent {
  type: 'start' | 'progress' | 'log' | 'success' | 'error';
  project: string;
  environment: string;
  branch?: string;
  message: string;
  progress?: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * 배포 시작 이벤트 발행
 */
export async function deployStart(project: string, environment: string, branch?: string): Promise<void> {
  const event: DeployEvent = {
    type: 'start',
    project,
    environment,
    branch,
    message: `Deployment started for ${project} (${environment})`,
    progress: 0,
    timestamp: new Date().toISOString(),
  };

  await publish(CHANNELS.DEPLOY(project), event);
  await publish(CHANNELS.SYSTEM, event);
}

/**
 * 배포 진행 이벤트 발행
 */
export async function deployProgress(
  project: string,
  environment: string,
  message: string,
  progress: number
): Promise<void> {
  const event: DeployEvent = {
    type: 'progress',
    project,
    environment,
    message,
    progress,
    timestamp: new Date().toISOString(),
  };

  await publish(CHANNELS.DEPLOY(project), event);
}

/**
 * 배포 로그 이벤트 발행
 */
export async function deployLog(
  project: string,
  environment: string,
  log: string
): Promise<void> {
  const event: DeployEvent = {
    type: 'log',
    project,
    environment,
    message: log,
    timestamp: new Date().toISOString(),
  };

  await publish(CHANNELS.LOGS(project, environment), event);
}

/**
 * 배포 성공 이벤트 발행
 */
export async function deploySuccess(
  project: string,
  environment: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const event: DeployEvent = {
    type: 'success',
    project,
    environment,
    message: `Deployment successful for ${project} (${environment})`,
    progress: 100,
    timestamp: new Date().toISOString(),
    metadata,
  };

  await publish(CHANNELS.DEPLOY(project), event);
  await publish(CHANNELS.SYSTEM, event);
}

/**
 * 배포 실패 이벤트 발행
 */
export async function deployError(
  project: string,
  environment: string,
  error: string
): Promise<void> {
  const event: DeployEvent = {
    type: 'error',
    project,
    environment,
    message: error,
    timestamp: new Date().toISOString(),
  };

  await publish(CHANNELS.DEPLOY(project), event);
  await publish(CHANNELS.SYSTEM, event);
}

// ============================================================================
// 서버 모니터링 이벤트
// ============================================================================

export interface ServerEvent {
  type: 'status' | 'alert' | 'metric';
  server: string;
  message: string;
  level?: 'info' | 'warning' | 'critical';
  metrics?: Record<string, unknown>;
  timestamp: string;
}

/**
 * 서버 상태 이벤트 발행
 */
export async function serverStatus(server: string, message: string, metrics?: Record<string, unknown>): Promise<void> {
  const event: ServerEvent = {
    type: 'status',
    server,
    message,
    metrics,
    timestamp: new Date().toISOString(),
  };

  await publish(CHANNELS.SERVER(server), event);
}

/**
 * 서버 알림 이벤트 발행
 */
export async function serverAlert(
  server: string,
  message: string,
  level: 'info' | 'warning' | 'critical'
): Promise<void> {
  const event: ServerEvent = {
    type: 'alert',
    server,
    message,
    level,
    timestamp: new Date().toISOString(),
  };

  await publish(CHANNELS.SERVER(server), event);
  await publish(CHANNELS.SYSTEM, event);
}

// ============================================================================
// 사용자 알림
// ============================================================================

export interface NotificationEvent {
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  link?: string;
  timestamp: string;
}

/**
 * 사용자에게 알림 전송
 */
export async function sendNotification(
  userId: string,
  notification: Omit<NotificationEvent, 'timestamp'>
): Promise<void> {
  const event: NotificationEvent = {
    ...notification,
    timestamp: new Date().toISOString(),
  };

  await publish(CHANNELS.NOTIFICATIONS(userId), event);
}

/**
 * 모든 사용자에게 시스템 알림 전송
 */
export async function sendSystemAlert(
  notification: Omit<NotificationEvent, 'timestamp'>
): Promise<void> {
  const event: NotificationEvent = {
    ...notification,
    timestamp: new Date().toISOString(),
  };

  await publish(CHANNELS.SYSTEM, event);
}

// ============================================================================
// 클라이언트 설정 반환
// ============================================================================

/**
 * 클라이언트용 Centrifugo 설정 반환
 */
export function getClientConfig() {
  return {
    url: CENTRIFUGO_URL,
    channels: CHANNELS,
  };
}
