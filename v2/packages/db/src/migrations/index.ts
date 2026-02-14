/**
 * @codeb/db - Migration Runner
 */

import { getPool } from '../pool.js';
import logger from '@codeb/logger';
import { VERSION as V1_VERSION, STATEMENTS as V1_STATEMENTS } from './001_init.js';

const SCHEMA_VERSION = V1_VERSION;

const MIGRATIONS: Record<number, string[]> = {
  [V1_VERSION]: V1_STATEMENTS,
};

export async function runMigrations(): Promise<void> {
  const db = await getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Create migrations table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Get current version
    const result = await client.query(
      'SELECT MAX(version) as version FROM schema_migrations',
    );
    const currentVersion: number = result.rows[0]?.version || 0;

    // Apply pending migrations
    for (let version = currentVersion + 1; version <= SCHEMA_VERSION; version++) {
      const statements = MIGRATIONS[version];
      if (statements) {
        logger.info(`Applying migration v${version}...`);
        for (const sql of statements) {
          await client.query(sql);
        }
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version],
        );
      }
    }

    await client.query('COMMIT');
    logger.info(`Database schema at v${SCHEMA_VERSION}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
