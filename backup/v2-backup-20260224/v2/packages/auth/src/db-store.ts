/**
 * @codeb/auth - Database-based Auth Store (Placeholder)
 *
 * TODO: Migrate from file-based (file-store.ts) to DB-based auth.
 * This will use @codeb/db's TeamRepo and ApiKeyRepo for persistence,
 * replacing the JSON file reads/writes with proper PostgreSQL queries.
 *
 * Migration steps:
 * 1. Implement verifyApiKeyFromDB using ApiKeyRepo.findByHash
 * 2. Implement createApiKeyInDB using ApiKeyRepo.create
 * 3. Add a feature flag to switch between file-store and db-store
 * 4. Run parallel validation to ensure parity
 * 5. Remove file-store once DB is validated
 */

import type { AuthContext, TeamRole } from '@codeb/shared';

/**
 * Verify API key from database.
 * @placeholder - Not yet implemented
 */
export async function verifyApiKeyFromDB(_apiKey: string): Promise<AuthContext | null> {
  // TODO: Implement using @codeb/db ApiKeyRepo
  // const keyHash = hashApiKey(apiKey);
  // const keyRecord = await ApiKeyRepo.findByHash(keyHash);
  // if (!keyRecord) return null;
  // ...
  return null;
}

/**
 * Create API key in database.
 * @placeholder - Not yet implemented
 */
export async function createApiKeyInDB(_input: {
  name: string;
  teamId: string;
  role: TeamRole;
  scopes?: string[];
  createdBy: string;
}): Promise<{ key: string; id: string } | null> {
  // TODO: Implement using @codeb/db ApiKeyRepo
  return null;
}
