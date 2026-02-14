/**
 * @codeb/shared - Version (SSOT from VERSION file + Server Version Check)
 *
 * Single implementation of getVersion() shared across all apps.
 * Reads from the VERSION file at project/monorepo root.
 *
 * checkServerVersion(): API 서버 버전을 기준으로 클라이언트 호환성 체크.
 * - 메이저 버전 불일치 → compatible=false (동작 중단)
 * - 마이너 버전 불일치 → updateRequired=true (경고)
 * - 패치 버전 불일치 → 무시
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// getVersion() - 로컬 VERSION 파일 읽기
// ============================================================================

export function getVersion(): string {
  // Environment variable override (for Docker builds, CI, etc.)
  if (process.env.CODEB_VERSION) {
    return process.env.CODEB_VERSION;
  }

  const candidates = [
    join(process.cwd(), 'VERSION'),
    join(process.cwd(), '..', 'VERSION'),
    join(process.cwd(), '..', '..', 'VERSION'),
  ];

  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        return readFileSync(p, 'utf-8').trim();
      }
    } catch {
      continue;
    }
  }

  return '0.0.0';
}

// ============================================================================
// Server Version Check
// ============================================================================

export interface VersionCheckResult {
  /** 메이저 버전 호환 여부 (false면 동작 중단해야 함) */
  compatible: boolean;
  /** 업데이트 필요 여부 (마이너 버전 차이) */
  updateRequired: boolean;
  /** API 서버 버전 */
  serverVersion: string;
  /** 클라이언트(로컬) 버전 */
  clientVersion: string;
  /** 사용자 안내 메시지 */
  message?: string;
  /** 다운로드 URL */
  downloadUrl?: string;
  /** 서버 연결 실패 여부 */
  serverUnreachable?: boolean;
}

function parseVersion(v: string): [number, number, number] {
  const parts = v.split('.').map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/**
 * API 서버의 /health 엔드포인트를 호출해 버전을 비교한다.
 *
 * - 메이저 불일치: compatible=false → 호출자가 process.exit 해야 함
 * - 마이너 불일치: updateRequired=true → 경고 출력
 * - 패치 불일치: 무시 (호환)
 * - 서버 연결 실패: serverUnreachable=true, compatible=true → 오프라인 동작 허용
 */
export async function checkServerVersion(
  clientVersion: string,
  apiUrl?: string,
): Promise<VersionCheckResult> {
  const baseUrl = apiUrl || process.env.CODEB_API_URL || 'https://api.codeb.kr';
  const downloadUrl = 'https://releases.codeb.kr/cli/install.sh';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${baseUrl}/health`, {
      headers: { 'X-Client-Version': clientVersion },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        compatible: true,
        updateRequired: false,
        serverVersion: 'unknown',
        clientVersion,
        serverUnreachable: true,
        message: `API server returned HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as {
      version?: string;
      status?: string;
    };

    const serverVersion = data.version || 'unknown';
    if (serverVersion === 'unknown') {
      return {
        compatible: true,
        updateRequired: false,
        serverVersion,
        clientVersion,
        message: 'Server version unknown',
      };
    }

    const [sMajor, sMinor] = parseVersion(serverVersion);
    const [cMajor, cMinor] = parseVersion(clientVersion);

    // 메이저 버전 불일치 → 호환 불가
    if (sMajor !== cMajor) {
      return {
        compatible: false,
        updateRequired: true,
        serverVersion,
        clientVersion,
        downloadUrl,
        message: `Major version mismatch: server v${serverVersion} vs local v${clientVersion}\nUpdate: curl -sSL ${downloadUrl} | bash`,
      };
    }

    // 마이너 버전: 서버가 더 높으면 업데이트 권장
    if (sMinor > cMinor) {
      return {
        compatible: true,
        updateRequired: true,
        serverVersion,
        clientVersion,
        downloadUrl,
        message: `Update available: v${clientVersion} -> v${serverVersion}\nUpdate: curl -sSL ${downloadUrl} | bash`,
      };
    }

    // 클라이언트가 더 높거나 동일 → OK
    return {
      compatible: true,
      updateRequired: false,
      serverVersion,
      clientVersion,
    };
  } catch {
    // 네트워크 오류 (서버 다운, 타임아웃 등) → 오프라인 모드 허용
    return {
      compatible: true,
      updateRequired: false,
      serverVersion: 'unreachable',
      clientVersion,
      serverUnreachable: true,
      message: 'API server unreachable - running in offline mode',
    };
  }
}
