/**
 * CodeB ENV Management Command
 *
 * Vercel/Supabase 스타일의 환경 변수 관리
 * - 서버 리소스 스캔 (DB, Redis)
 * - 로컬 .env 파일 분석
 * - 서버 ↔ 로컬 비교 및 동기화
 *
 * @module env
 * @version 3.0.0 (Refactored - split into env-sync.js + env-backup.js)
 */

// ============================================================================
// Re-export from split modules
// ============================================================================

// env-sync.js: 서버 리소스 스캔, 로컬 ENV 파싱, 비교/동기화
export {
  envScan,
  envPull,
  envPush,
  envUpload,
  envList,
  // Helper functions (for other modules)
  scanServerDatabases,
  scanServerRedis,
  getServerProjectInfo,
  scanLocalEnvFiles,
  parseEnvFile,
  parseDatabaseUrl,
  parseRedisUrl,
  compareEnvironments,
} from './env-sync.js';

// env-backup.js: 백업 서버 연동, ENV 복구/수정
export {
  envRestore,
  envBackups,
  envFix,
  // Constants (for other modules)
  BACKUP_SERVER,
  SERVER_CONFIG,
  INVALID_HOSTS,
} from './env-backup.js';

// ============================================================================
// Default Export (backward compatibility)
// ============================================================================

import {
  envScan,
  envPull,
  envPush,
  envUpload,
  envList,
} from './env-sync.js';

import {
  envRestore,
  envBackups,
  envFix,
} from './env-backup.js';

export default {
  envScan,
  envPull,
  envPush,
  envUpload,
  envFix,
  envList,
  envRestore,
  envBackups,
};
