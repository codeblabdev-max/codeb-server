/**
 * Config Loader
 *
 * 환경변수 또는 설정 파일에서 설정을 읽어옵니다.
 * 우선순위: 환경변수 > ~/.codeb/config.json > .env
 */

import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// CLI 패키지 디렉토리 (cli/.env 로드용)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_ROOT = join(__dirname, '..', '..');

// CLI 버전 (cli/package.json에서 읽음 - Single Source of Truth)
// npm 설치 시에도 올바르게 작동하도록 CLI_ROOT의 package.json 사용
let _cliVersion = null;
function loadCliVersion() {
  if (_cliVersion) return _cliVersion;
  try {
    // CLI 패키지의 package.json (cli/package.json)
    const pkgPath = join(CLI_ROOT, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    _cliVersion = pkg.version || '0.0.0';
  } catch (e) {
    _cliVersion = '0.0.0';
  }
  return _cliVersion;
}

/**
 * CLI 버전 가져오기 (package.json에서 읽음)
 * @returns {string} CLI 버전 (e.g., "3.0.14")
 */
export function getCliVersion() {
  return loadCliVersion();
}

// .env 파일 로드 순서: 현재 디렉토리 → CLI 패키지 디렉토리
dotenv.config(); // 현재 디렉토리 .env
dotenv.config({ path: join(CLI_ROOT, '.env') }); // CLI 패키지 .env

const CONFIG_DIR = join(homedir(), '.codeb');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// 기본값 (placeholder - 실제 값 없음)
const DEFAULTS = {
  CODEB_SERVER_HOST: '',
  CODEB_SERVER_USER: 'root',
  CODEB_DB_PASSWORD: '',
  VULTR_API_KEY: '',
  GITHUB_TOKEN: '',
  CODEB_DOMAIN: 'codeb.kr',
  CODEB_API_KEY: '',  // Developer용 HTTP API 키
};

// ============================================================================
// 서버 인프라 설정 (Single Source of Truth)
// ============================================================================

/**
 * 허용된 서버 목록 (신규 인프라)
 */
export const ALLOWED_SERVERS = {
  app: {
    ip: '158.247.203.55',
    domain: 'app.codeb.kr',
    role: 'App Server',
    services: ['Next.js', 'Dashboard', 'PowerDNS', 'GitHub Actions Runner']
  },
  streaming: {
    ip: '141.164.42.213',
    domain: 'ws.codeb.kr',
    alias: 'streaming.codeb.kr',
    role: 'Streaming Server',
    services: ['Centrifugo']
  },
  storage: {
    ip: '64.176.226.119',
    domain: 'db.codeb.kr',
    alias: 'storage.codeb.kr',
    role: 'Storage Server',
    services: ['PostgreSQL', 'Redis']
  },
  backup: {
    ip: '141.164.37.63',
    domain: 'backup.codeb.kr',
    role: 'Backup Server',
    services: ['Backup', 'Monitoring', 'ENV Backup']
  }
};

/**
 * 차단된 서버 목록 (구버전/삭제 예정)
 * 이 서버들에 대한 연결은 거부됨
 */
export const BLOCKED_SERVERS = [
  {
    ip: '141.164.60.51',
    reason: '삭제 예정 서버 (다른 Vultr 계정)',
    alternative: 'app.codeb.kr (158.247.203.55)'
  }
];

/**
 * 서버 IP가 차단되었는지 확인
 * @param {string} serverHost - 서버 IP 또는 도메인
 * @returns {{ blocked: boolean, reason?: string, alternative?: string }}
 */
export function isBlockedServer(serverHost) {
  if (!serverHost) return { blocked: false };

  const blocked = BLOCKED_SERVERS.find(s =>
    serverHost === s.ip || serverHost.includes(s.ip)
  );

  if (blocked) {
    return {
      blocked: true,
      reason: blocked.reason,
      alternative: blocked.alternative
    };
  }

  return { blocked: false };
}

/**
 * 서버 IP가 허용된 서버인지 확인
 * @param {string} serverHost - 서버 IP 또는 도메인
 * @returns {{ allowed: boolean, server?: object, role?: string }}
 */
export function isAllowedServer(serverHost) {
  if (!serverHost) return { allowed: false };

  for (const [role, server] of Object.entries(ALLOWED_SERVERS)) {
    if (serverHost === server.ip ||
        serverHost === server.domain ||
        serverHost === server.alias) {
      return { allowed: true, server, role };
    }
  }

  return { allowed: false };
}

/**
 * 서버 호스트 검증 (차단 + 허용 체크)
 * @param {string} serverHost - 서버 IP 또는 도메인
 * @throws {Error} 차단된 서버일 경우 에러 발생
 */
export function validateServerHost(serverHost) {
  const blockCheck = isBlockedServer(serverHost);
  if (blockCheck.blocked) {
    throw new Error(
      `🚫 차단된 서버: ${serverHost}\n` +
      `   이유: ${blockCheck.reason}\n` +
      `   대안: ${blockCheck.alternative}`
    );
  }

  const allowCheck = isAllowedServer(serverHost);
  if (!allowCheck.allowed) {
    console.warn(
      `⚠️  알 수 없는 서버: ${serverHost}\n` +
      `   허용된 서버: ${Object.values(ALLOWED_SERVERS).map(s => s.domain).join(', ')}`
    );
  }

  return allowCheck;
}

/**
 * 설정 파일에서 값 읽기
 */
function loadConfigFile() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    // 파일 읽기 실패 시 무시
  }
  return {};
}

/**
 * 설정값 가져오기
 * 우선순위: 환경변수 > 설정파일 > 기본값
 */
export function getConfig(key) {
  // 1. 환경변수 체크
  if (process.env[key]) {
    return process.env[key];
  }

  // 2. 설정 파일 체크
  const fileConfig = loadConfigFile();
  if (fileConfig[key]) {
    return fileConfig[key];
  }

  // 3. 기본값 반환 (빈 문자열일 수 있음)
  return DEFAULTS[key] || '';
}

/**
 * 필수 설정 검증
 */
export function validateConfig(requiredKeys) {
  const missing = [];

  for (const key of requiredKeys) {
    if (!getConfig(key)) {
      missing.push(key);
    }
  }

  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * 서버 호스트 가져오기
 */
export function getServerHost() {
  return getConfig('CODEB_SERVER_HOST');
}

/**
 * 서버 사용자 가져오기
 */
export function getServerUser() {
  return getConfig('CODEB_SERVER_USER') || 'root';
}

/**
 * DB 비밀번호 가져오기
 */
export function getDbPassword() {
  return getConfig('CODEB_DB_PASSWORD');
}

/**
 * Vultr API 키 가져오기
 */
export function getVultrApiKey() {
  return getConfig('VULTR_API_KEY');
}

/**
 * GitHub 토큰 가져오기
 */
export function getGithubToken() {
  return getConfig('GITHUB_TOKEN');
}

/**
 * 기본 도메인 가져오기
 */
export function getBaseDomain() {
  return getConfig('CODEB_DOMAIN') || 'codeb.kr';
}

/**
 * API 키 가져오기 (Developer용 HTTP API 인증)
 */
export function getApiKey() {
  return getConfig('CODEB_API_KEY');
}

/**
 * 설정 디렉토리 경로
 */
export function getConfigDir() {
  return CONFIG_DIR;
}

/**
 * 설정 파일 경로
 */
export function getConfigFile() {
  return CONFIG_FILE;
}

/**
 * 전체 설정 가져오기
 */
export function getAllConfig() {
  const fileConfig = loadConfigFile();

  return {
    CODEB_SERVER_HOST: getConfig('CODEB_SERVER_HOST'),
    CODEB_SERVER_USER: getConfig('CODEB_SERVER_USER'),
    CODEB_DB_PASSWORD: getConfig('CODEB_DB_PASSWORD') ? '***' : '',
    VULTR_API_KEY: getConfig('VULTR_API_KEY') ? '***' : '',
    GITHUB_TOKEN: getConfig('GITHUB_TOKEN') ? '***' : '',
    CODEB_DOMAIN: getConfig('CODEB_DOMAIN'),
    CODEB_API_KEY: getConfig('CODEB_API_KEY') ? '***' : '',
  };
}

export default {
  getConfig,
  validateConfig,
  getServerHost,
  getServerUser,
  getDbPassword,
  getVultrApiKey,
  getGithubToken,
  getBaseDomain,
  getApiKey,
  getConfigDir,
  getConfigFile,
  getAllConfig,
  getCliVersion,
  // 서버 인프라 관련
  ALLOWED_SERVERS,
  BLOCKED_SERVERS,
  isBlockedServer,
  isAllowedServer,
  validateServerHost
};
