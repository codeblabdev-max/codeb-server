/**
 * @codeb/db - PostgreSQL Connection Pool
 * Based on mcp-server/src/lib/database.ts pool section
 */

import { Pool, type PoolClient } from 'pg';
import logger from '@codeb/logger';

// ============================================================================
// Configuration
// ============================================================================

const DB_CONFIG = {
  host: process.env.CODEB_DB_HOST || 'db.codeb.kr',
  port: parseInt(process.env.CODEB_DB_PORT || '5432'),
  database: process.env.CODEB_DB_NAME || 'codeb',
  user: process.env.CODEB_DB_USER || 'codeb',
  password: process.env.CODEB_DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// ============================================================================
// Pool Singleton
// ============================================================================

let pool: Pool | null = null;

export async function getPool(): Promise<Pool> {
  if (!pool) {
    pool = new Pool(DB_CONFIG);

    pool.on('error', (err) => {
      logger.error('Unexpected database pool error', { error: err.message });
    });

    // Test connection on first acquire
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      logger.info('Database connected successfully');
    } finally {
      client.release();
    }
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}

// ============================================================================
// Transaction Helper
// ============================================================================

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
