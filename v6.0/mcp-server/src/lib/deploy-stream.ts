/**
 * CodeB v6.0 - Real-time Deploy Streaming
 *
 * SSE 기반 실시간 배포 진행률 스트리밍
 * CLI에서 실제 진행 상황을 실시간으로 수신
 */

import { EventEmitter } from 'events';
import { Response } from 'express';
import type { DeployStep, SlotName, Environment } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface DeploySession {
  id: string;
  projectName: string;
  environment: Environment;
  slot: SlotName;
  startTime: number;
  steps: DeployStep[];
  status: 'pending' | 'in_progress' | 'success' | 'failed';
  clients: Set<Response>;
  previewUrl?: string;
  error?: string;
}

export interface DeployEvent {
  type: 'step' | 'complete' | 'error' | 'log';
  deployId: string;
  timestamp: string;
  data: {
    step?: DeployStep;
    previewUrl?: string;
    error?: string;
    duration?: number;
    slot?: SlotName;
    message?: string;
  };
}

// ============================================================================
// Deploy Stream Manager
// ============================================================================

class DeployStreamManager extends EventEmitter {
  private sessions: Map<string, DeploySession> = new Map();

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  /**
   * 새 배포 세션 생성
   */
  createSession(
    projectName: string,
    environment: Environment,
    slot: SlotName
  ): string {
    const deployId = `deploy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const session: DeploySession = {
      id: deployId,
      projectName,
      environment,
      slot,
      startTime: Date.now(),
      steps: [
        { name: 'get_slot_status', status: 'pending' },
        { name: 'select_slot', status: 'pending' },
        { name: 'generate_quadlet', status: 'pending' },
        { name: 'daemon_reload', status: 'pending' },
        { name: 'start_container', status: 'pending' },
        { name: 'health_check', status: 'pending' },
        { name: 'update_registry', status: 'pending' },
      ],
      status: 'pending',
      clients: new Set(),
    };

    this.sessions.set(deployId, session);
    console.log(`[DeployStream] Session created: ${deployId}`);

    return deployId;
  }

  /**
   * 클라이언트 연결 (SSE)
   */
  addClient(deployId: string, res: Response): boolean {
    const session = this.sessions.get(deployId);
    if (!session) {
      return false;
    }

    // SSE 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 초기 연결 이벤트
    const connectEvent: DeployEvent = {
      type: 'step',
      deployId,
      timestamp: new Date().toISOString(),
      data: {
        message: 'Connected to deploy stream',
        slot: session.slot,
      },
    };
    res.write(`event: connect\ndata: ${JSON.stringify(connectEvent)}\n\n`);

    // 현재까지의 모든 스텝 상태 전송
    for (const step of session.steps) {
      if (step.status !== 'pending') {
        const stepEvent: DeployEvent = {
          type: 'step',
          deployId,
          timestamp: new Date().toISOString(),
          data: { step },
        };
        res.write(`event: step\ndata: ${JSON.stringify(stepEvent)}\n\n`);
      }
    }

    session.clients.add(res);
    console.log(`[DeployStream] Client connected to ${deployId} (total: ${session.clients.size})`);

    // 연결 종료 시 클라이언트 제거
    res.on('close', () => {
      session.clients.delete(res);
      console.log(`[DeployStream] Client disconnected from ${deployId}`);
    });

    // Keep-alive ping
    const pingInterval = setInterval(() => {
      if (session.clients.has(res)) {
        res.write(':ping\n\n');
      } else {
        clearInterval(pingInterval);
      }
    }, 15000);

    return true;
  }

  /**
   * 스텝 상태 업데이트 및 브로드캐스트
   */
  updateStep(
    deployId: string,
    stepName: string,
    status: DeployStep['status'],
    extra?: { output?: string; error?: string; duration?: number }
  ): void {
    const session = this.sessions.get(deployId);
    if (!session) return;

    // 스텝 찾아서 업데이트
    const step = session.steps.find(s => s.name === stepName);
    if (step) {
      step.status = status;
      if (extra?.output) step.output = extra.output;
      if (extra?.error) step.error = extra.error;
      if (extra?.duration) step.duration = extra.duration;
    }

    // 세션 상태 업데이트
    if (status === 'running' && session.status === 'pending') {
      session.status = 'in_progress';
    }

    // 클라이언트에 브로드캐스트
    const event: DeployEvent = {
      type: 'step',
      deployId,
      timestamp: new Date().toISOString(),
      data: { step: step || { name: stepName, status, ...extra } },
    };

    this.broadcast(session, 'step', event);
  }

  /**
   * 배포 완료
   */
  complete(
    deployId: string,
    success: boolean,
    previewUrl?: string,
    error?: string
  ): void {
    const session = this.sessions.get(deployId);
    if (!session) return;

    session.status = success ? 'success' : 'failed';
    session.previewUrl = previewUrl;
    session.error = error;

    const event: DeployEvent = {
      type: 'complete',
      deployId,
      timestamp: new Date().toISOString(),
      data: {
        previewUrl,
        error,
        duration: Date.now() - session.startTime,
        slot: session.slot,
      },
    };

    this.broadcast(session, 'complete', event);

    // 모든 클라이언트 연결 종료
    for (const client of session.clients) {
      try {
        client.end();
      } catch {}
    }

    // 5분 후 세션 정리
    setTimeout(() => {
      this.sessions.delete(deployId);
      console.log(`[DeployStream] Session cleaned up: ${deployId}`);
    }, 5 * 60 * 1000);
  }

  /**
   * 로그 메시지 전송
   */
  sendLog(deployId: string, message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const session = this.sessions.get(deployId);
    if (!session) return;

    const event: DeployEvent = {
      type: 'log',
      deployId,
      timestamp: new Date().toISOString(),
      data: { message },
    };

    this.broadcast(session, 'log', event);
  }

  /**
   * 세션 조회
   */
  getSession(deployId: string): DeploySession | undefined {
    return this.sessions.get(deployId);
  }

  /**
   * 활성 세션 목록
   */
  getActiveSessions(): { id: string; projectName: string; status: string }[] {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      projectName: s.projectName,
      status: s.status,
    }));
  }

  /**
   * 브로드캐스트
   */
  private broadcast(session: DeploySession, eventName: string, event: DeployEvent): void {
    const message = `event: ${eventName}\ndata: ${JSON.stringify(event)}\n\n`;

    for (const client of session.clients) {
      try {
        client.write(message);
      } catch {
        session.clients.delete(client);
      }
    }
  }
}

// Singleton
export const deployStream = new DeployStreamManager();

// ============================================================================
// Streaming Deploy Wrapper
// ============================================================================

/**
 * 스트리밍 가능한 배포 실행 헬퍼
 * 기존 deploy 함수를 감싸서 실시간 스트리밍 지원
 */
export function createStreamingDeployContext(
  projectName: string,
  environment: Environment,
  slot: SlotName
): {
  deployId: string;
  updateStep: (name: string, status: DeployStep['status'], extra?: { output?: string; error?: string; duration?: number }) => void;
  complete: (success: boolean, previewUrl?: string, error?: string) => void;
  sendLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
} {
  const deployId = deployStream.createSession(projectName, environment, slot);

  return {
    deployId,
    updateStep: (name, status, extra) => deployStream.updateStep(deployId, name, status, extra),
    complete: (success, previewUrl, error) => deployStream.complete(deployId, success, previewUrl, error),
    sendLog: (message, level) => deployStream.sendLog(deployId, message, level),
  };
}
