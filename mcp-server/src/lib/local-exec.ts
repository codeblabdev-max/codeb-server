/**
 * CodeB v9.0 - Local Execution (SSH-free)
 *
 * SSH를 대체하는 로컬 실행 모듈
 * MCP API 서버가 App 서버에서 직접 실행되므로 SSH 불필요
 *
 * 동일한 인터페이스:
 * - exec(command) → child_process.exec
 * - writeFile(path, content) → fs.writeFile
 * - readFile(path) → fs.readFile
 * - fileExists(path) → fs.access
 * - mkdir(path) → fs.mkdir
 */

import { exec as cpExec } from 'child_process';
import { readFile, writeFile, mkdir, access, constants } from 'fs/promises';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import type { SSHResult } from './types.js';
import { logger } from './logger.js';

// ============================================================================
// Path Validation (기존 SSH와 동일한 보안 규칙)
// ============================================================================

const ALLOWED_PATHS = [
  '/opt/codeb/',
  '/etc/caddy/',
  '/etc/containers/',
  '/var/log/',
  '/tmp/',
];

function validatePath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (path.includes('..')) return false;
  return ALLOWED_PATHS.some(base => path.startsWith(base));
}

// ============================================================================
// Local Execution Client (SSHClientWrapper 호환 인터페이스)
// ============================================================================

export class LocalExec {
  /**
   * 로컬 명령 실행 (child_process.exec)
   * SSHClientWrapper.exec()과 동일한 반환 형식
   */
  async exec(command: string, options: { timeout?: number } = {}): Promise<SSHResult> {
    const { timeout = 60000 } = options;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      cpExec(command, {
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        shell: '/bin/bash',
      }, (error, stdout, stderr) => {
        if (error && error.killed) {
          reject(new Error(`Command timed out after ${timeout}ms`));
          return;
        }

        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          code: error ? (error.code ?? 1) : 0,
          duration: Date.now() - startTime,
        });
      });
    });
  }

  /**
   * 로컬 파일 쓰기 (fs.writeFile)
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    if (!validatePath(filePath)) {
      throw new Error(`Invalid path: ${filePath}`);
    }

    await writeFile(filePath, content, 'utf-8');
  }

  /**
   * 로컬 파일 읽기 (fs.readFile)
   */
  async readFile(filePath: string): Promise<string> {
    if (!validatePath(filePath)) {
      throw new Error(`Invalid path: ${filePath}`);
    }

    return readFile(filePath, 'utf-8');
  }

  /**
   * 파일 존재 여부 확인
   */
  async fileExists(filePath: string): Promise<boolean> {
    if (!validatePath(filePath)) {
      return false;
    }

    try {
      await access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 디렉토리 생성
   */
  async mkdir(dirPath: string): Promise<void> {
    if (!validatePath(dirPath)) {
      throw new Error(`Invalid path: ${dirPath}`);
    }

    await mkdir(dirPath, { recursive: true });
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let instance: LocalExec | null = null;

export function getLocalExec(): LocalExec {
  if (!instance) {
    instance = new LocalExec();
  }
  return instance;
}

/**
 * withSSH 대체 — 동일한 시그니처
 * 기존: withSSH(host, async (ssh) => { ... })
 * 신규: withLocal(async (local) => { ... })
 */
export async function withLocal<T>(
  fn: (local: LocalExec) => Promise<T>
): Promise<T> {
  const local = getLocalExec();
  return fn(local);
}

/**
 * 하위 호환용 — withSSH 시그니처와 동일 (host 파라미터 무시)
 * 마이그레이션 중 drop-in 교체 가능
 */
export async function withLocalCompat<T>(
  _host: string,
  fn: (local: LocalExec) => Promise<T>
): Promise<T> {
  return withLocal(fn);
}

// ============================================================================
// Storage 서버 DB 직접 연결 (SSH 대체)
// ============================================================================

/**
 * PostgreSQL superuser 연결로 DB/User 생성
 * 기존: SSH → Storage 서버 → psql 명령
 * 신규: pg 클라이언트로 직접 TCP 연결
 */
export async function execStorageSQL(sql: string): Promise<string> {
  const pgHost = process.env.STORAGE_DB_HOST || '64.176.226.119';
  const pgPort = process.env.STORAGE_DB_PORT || '5432';
  const pgUser = process.env.STORAGE_DB_SUPERUSER || 'postgres';
  const pgPassword = process.env.STORAGE_DB_SUPERPASS || '';

  // PGPASSWORD를 환경변수로 전달하여 psql 호출
  // MCP 서버에서 Storage 서버의 PostgreSQL에 TCP 연결
  const local = getLocalExec();
  const result = await local.exec(
    `PGPASSWORD='${pgPassword}' psql -h ${pgHost} -p ${pgPort} -U ${pgUser} -d postgres -t -A -c "${sql.replace(/"/g, '\\"')}"`,
    { timeout: 30000 }
  );

  if (result.code !== 0 && result.stderr && !result.stderr.includes('already exists')) {
    throw new Error(`SQL execution failed: ${result.stderr}`);
  }

  return result.stdout.trim();
}

/**
 * 여러 SQL 문 순차 실행
 */
export async function execStorageSQLBatch(statements: string[]): Promise<void> {
  for (const sql of statements) {
    try {
      await execStorageSQL(sql);
    } catch (error) {
      // "already exists" 에러는 무시
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes('already exists')) {
        logger.warn('SQL batch statement failed (continuing)', { sql: sql.substring(0, 100), error: msg });
      }
    }
  }
}

// ============================================================================
// HTTP Health Check (Node.js native — curl/wget 의존성 제거)
// ============================================================================

/**
 * Node.js native HTTP 헬스체크
 * curl 대신 http.request 사용 — Alpine 컨테이너에서도 동작
 *
 * @returns HTTP 상태코드 문자열 (예: "200", "404") 또는 실패 시 "000"
 */
export function httpHealthCheck(
  port: number,
  paths: string[] = ['/health', '/api/health'],
  timeoutMs: number = 5000
): Promise<string> {
  return new Promise((resolve) => {
    let resolved = false;
    let attempted = 0;

    function tryPath(path: string) {
      const req = httpRequest(
        { hostname: 'localhost', port, path, method: 'GET', timeout: timeoutMs },
        (res) => {
          // 응답 데이터 소비 (메모리 누수 방지)
          res.resume();
          if (!resolved) {
            resolved = true;
            resolve(String(res.statusCode));
          }
        }
      );

      req.on('error', () => {
        attempted++;
        if (attempted >= paths.length && !resolved) {
          resolved = true;
          resolve('000');
        }
      });

      req.on('timeout', () => {
        req.destroy();
        attempted++;
        if (attempted >= paths.length && !resolved) {
          resolved = true;
          resolve('000');
        }
      });

      req.end();
    }

    // 모든 경로를 병렬로 시도, 첫 번째 성공 응답 반환
    for (const path of paths) {
      tryPath(path);
    }
  });
}

/**
 * HTTPS 헤더 체크 (SSL 인증서 확인용)
 * curl -sI 대체
 *
 * @returns 첫 번째 응답 라인 (예: "HTTP/1.1 200 OK") 또는 에러 메시지
 */
export function httpsHeaderCheck(
  domain: string,
  timeoutMs: number = 5000
): Promise<string> {
  return new Promise((resolve) => {
    const req = httpsRequest(
      { hostname: domain, port: 443, path: '/', method: 'HEAD', timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(`HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage}`);
      }
    );

    req.on('error', (err) => {
      resolve(`error: ${err.message}`);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve('pending');
    });

    req.end();
  });
}
