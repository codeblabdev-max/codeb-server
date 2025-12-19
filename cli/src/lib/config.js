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
  getAllConfig
};
