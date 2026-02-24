/**
 * @codeb/auth - File-based Auth Store (Legacy)
 * Reads/writes API keys and teams from JSON files on disk.
 * Based on mcp-server/src/lib/auth.ts registry functions
 *
 * This is the legacy file-based authentication store.
 * See db-store.ts for the planned DB-based replacement.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ApiKeysRegistry, TeamsRegistry } from '@codeb/shared';

// ============================================================================
// Constants
// ============================================================================

const REGISTRY_PATH = '/opt/codeb/registry';
const API_KEYS_PATH = `${REGISTRY_PATH}/api-keys.json`;
const TEAMS_PATH = `${REGISTRY_PATH}/teams.json`;

// ============================================================================
// Helpers
// ============================================================================

function ensureDirectory(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ============================================================================
// API Keys Registry
// ============================================================================

/** Load API keys registry from disk */
export function loadApiKeysRegistry(): ApiKeysRegistry {
  try {
    if (existsSync(API_KEYS_PATH)) {
      return JSON.parse(readFileSync(API_KEYS_PATH, 'utf-8')) as ApiKeysRegistry;
    }
  } catch (e) {
    console.error('Failed to load API keys registry:', e);
  }
  return { version: '6.0', updatedAt: new Date().toISOString(), keys: {} };
}

/** Save API keys registry to disk */
export function saveApiKeysRegistry(registry: ApiKeysRegistry): void {
  ensureDirectory(API_KEYS_PATH);
  registry.updatedAt = new Date().toISOString();
  writeFileSync(API_KEYS_PATH, JSON.stringify(registry, null, 2));
}

// ============================================================================
// Teams Registry
// ============================================================================

/** Load teams registry from disk */
export function loadTeamsRegistry(): TeamsRegistry {
  try {
    if (existsSync(TEAMS_PATH)) {
      return JSON.parse(readFileSync(TEAMS_PATH, 'utf-8')) as TeamsRegistry;
    }
  } catch (e) {
    console.error('Failed to load teams registry:', e);
  }
  return { version: '6.0', updatedAt: new Date().toISOString(), teams: {} };
}

/** Save teams registry to disk */
export function saveTeamsRegistry(registry: TeamsRegistry): void {
  ensureDirectory(TEAMS_PATH);
  registry.updatedAt = new Date().toISOString();
  writeFileSync(TEAMS_PATH, JSON.stringify(registry, null, 2));
}
