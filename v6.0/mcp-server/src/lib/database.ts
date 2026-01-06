/**
 * CodeB v6.0 - PostgreSQL Database Layer
 * File-based storage → PostgreSQL migration
 *
 * Features:
 * - Connection pooling
 * - Transaction support
 * - Automatic schema migration
 * - Audit log persistence
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { createHash, randomBytes } from 'crypto';
import type {
  Team,
  TeamMember,
  ApiKey,
  ProjectSlots,
  AuditLogEntry,
  TeamRole,
  Environment,
  SlotName,
  SlotState,
} from './types.js';

// ============================================================================
// Configuration
// ============================================================================

const DB_CONFIG = {
  host: process.env.CODEB_DB_HOST || 'db.codeb.kr',
  port: parseInt(process.env.CODEB_DB_PORT || '5432'),
  database: process.env.CODEB_DB_NAME || 'codeb',
  user: process.env.CODEB_DB_USER || 'codeb',
  password: process.env.CODEB_DB_PASSWORD || '',
  max: 20, // Connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// ============================================================================
// Pool Management
// ============================================================================

let pool: Pool | null = null;

export async function getPool(): Promise<Pool> {
  if (!pool) {
    pool = new Pool(DB_CONFIG);

    pool.on('error', (err) => {
      console.error('Unexpected database error:', err);
    });

    // Test connection
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      console.log('✅ Database connected successfully');
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
  }
}

// ============================================================================
// Schema Migration
// ============================================================================

const SCHEMA_VERSION = 1;

const MIGRATIONS: Record<number, string[]> = {
  1: [
    // Teams table
    `CREATE TABLE IF NOT EXISTS teams (
      id VARCHAR(32) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) UNIQUE NOT NULL,
      owner VARCHAR(255) NOT NULL,
      plan VARCHAR(20) DEFAULT 'free',
      settings JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // Team members
    `CREATE TABLE IF NOT EXISTS team_members (
      id VARCHAR(32) PRIMARY KEY,
      team_id VARCHAR(32) REFERENCES teams(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      role VARCHAR(20) NOT NULL,
      invited_by VARCHAR(255),
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      last_active_at TIMESTAMPTZ,
      UNIQUE(team_id, email)
    )`,

    // API keys (with hashed storage)
    `CREATE TABLE IF NOT EXISTS api_keys (
      id VARCHAR(32) PRIMARY KEY,
      key_hash VARCHAR(64) NOT NULL UNIQUE,
      key_prefix VARCHAR(20) NOT NULL,
      name VARCHAR(255) NOT NULL,
      team_id VARCHAR(32) REFERENCES teams(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL,
      scopes JSONB DEFAULT '[]',
      rate_limit JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      created_by VARCHAR(255),
      last_used_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ
    )`,

    // Projects
    `CREATE TABLE IF NOT EXISTS projects (
      name VARCHAR(100) PRIMARY KEY,
      team_id VARCHAR(32) REFERENCES teams(id) ON DELETE CASCADE,
      type VARCHAR(50) DEFAULT 'nextjs',
      database_name VARCHAR(100),
      database_port INTEGER,
      redis_db INTEGER,
      redis_port INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // Project slots (Blue-Green)
    `CREATE TABLE IF NOT EXISTS project_slots (
      id SERIAL PRIMARY KEY,
      project_name VARCHAR(100) REFERENCES projects(name) ON DELETE CASCADE,
      environment VARCHAR(20) NOT NULL,
      active_slot VARCHAR(10) NOT NULL DEFAULT 'blue',
      blue_state VARCHAR(20) DEFAULT 'empty',
      blue_port INTEGER,
      blue_version VARCHAR(100),
      blue_image VARCHAR(500),
      blue_deployed_at TIMESTAMPTZ,
      blue_deployed_by VARCHAR(255),
      blue_health_status VARCHAR(20) DEFAULT 'unknown',
      green_state VARCHAR(20) DEFAULT 'empty',
      green_port INTEGER,
      green_version VARCHAR(100),
      green_image VARCHAR(500),
      green_deployed_at TIMESTAMPTZ,
      green_deployed_by VARCHAR(255),
      green_health_status VARCHAR(20) DEFAULT 'unknown',
      grace_expires_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(project_name, environment)
    )`,

    // Audit logs (persistent)
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id VARCHAR(32) PRIMARY KEY,
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      team_id VARCHAR(32),
      key_id VARCHAR(32),
      user_id VARCHAR(255),
      role VARCHAR(20),
      action VARCHAR(100) NOT NULL,
      resource VARCHAR(100),
      resource_id VARCHAR(255),
      params JSONB,
      success BOOLEAN DEFAULT true,
      duration INTEGER,
      ip VARCHAR(45),
      user_agent TEXT,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // Deployments history
    `CREATE TABLE IF NOT EXISTS deployments (
      id VARCHAR(32) PRIMARY KEY,
      project_name VARCHAR(100) REFERENCES projects(name) ON DELETE CASCADE,
      environment VARCHAR(20) NOT NULL,
      slot VARCHAR(10) NOT NULL,
      version VARCHAR(100),
      image VARCHAR(500),
      status VARCHAR(20) DEFAULT 'pending',
      deployed_by VARCHAR(255),
      promoted_at TIMESTAMPTZ,
      promoted_by VARCHAR(255),
      rolled_back_at TIMESTAMPTZ,
      rolled_back_by VARCHAR(255),
      rollback_reason TEXT,
      steps JSONB DEFAULT '[]',
      duration INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )`,

    // Schema version tracking
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_team ON audit_logs(team_id, timestamp DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`,
    `CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_name, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_api_keys_team ON api_keys(team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix)`,
  ],
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
      'SELECT MAX(version) as version FROM schema_migrations'
    );
    const currentVersion = result.rows[0]?.version || 0;

    // Apply pending migrations
    for (let version = currentVersion + 1; version <= SCHEMA_VERSION; version++) {
      const statements = MIGRATIONS[version];
      if (statements) {
        console.log(`Applying migration v${version}...`);
        for (const sql of statements) {
          await client.query(sql);
        }
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version]
        );
      }
    }

    await client.query('COMMIT');
    console.log(`✅ Database schema at v${SCHEMA_VERSION}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// API Key Utilities
// ============================================================================

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(role: TeamRole, teamId: string): { key: string; prefix: string } {
  const token = randomBytes(24).toString('base64url');
  const key = `codeb_${teamId.slice(0, 8)}_${role}_${token}`;
  const prefix = key.slice(0, 20);
  return { key, prefix };
}

// ============================================================================
// Team Repository
// ============================================================================

export const TeamRepo = {
  async create(team: Omit<Team, 'createdAt'>): Promise<Team> {
    const db = await getPool();
    const result = await db.query(
      `INSERT INTO teams (id, name, slug, owner, plan, settings)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [team.id, team.name, team.slug, team.owner, team.plan, team.settings]
    );
    return mapTeam(result.rows[0]);
  },

  async findById(id: string): Promise<Team | null> {
    const db = await getPool();
    const result = await db.query('SELECT * FROM teams WHERE id = $1', [id]);
    return result.rows[0] ? mapTeam(result.rows[0]) : null;
  },

  async findBySlug(slug: string): Promise<Team | null> {
    const db = await getPool();
    const result = await db.query('SELECT * FROM teams WHERE slug = $1', [slug]);
    return result.rows[0] ? mapTeam(result.rows[0]) : null;
  },

  async list(): Promise<Team[]> {
    const db = await getPool();
    const result = await db.query('SELECT * FROM teams ORDER BY created_at DESC');
    return result.rows.map(mapTeam);
  },

  async update(id: string, updates: Partial<Team>): Promise<Team | null> {
    const db = await getPool();
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.name) {
      setClauses.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.plan) {
      setClauses.push(`plan = $${idx++}`);
      values.push(updates.plan);
    }
    if (updates.settings) {
      setClauses.push(`settings = $${idx++}`);
      values.push(updates.settings);
    }
    setClauses.push(`updated_at = NOW()`);

    values.push(id);
    const result = await db.query(
      `UPDATE teams SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ? mapTeam(result.rows[0]) : null;
  },

  async delete(id: string): Promise<boolean> {
    const db = await getPool();
    const result = await db.query('DELETE FROM teams WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },
};

function mapTeam(row: any): Team {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    owner: row.owner,
    plan: row.plan,
    createdAt: row.created_at.toISOString(),
    projects: [],
    settings: row.settings,
  };
}

// ============================================================================
// API Key Repository
// ============================================================================

export const ApiKeyRepo = {
  async create(input: {
    id: string;
    keyHash: string;
    keyPrefix: string;
    name: string;
    teamId: string;
    role: TeamRole;
    scopes: string[];
    createdBy: string;
    expiresAt?: Date;
  }): Promise<void> {
    const db = await getPool();
    await db.query(
      `INSERT INTO api_keys (id, key_hash, key_prefix, name, team_id, role, scopes, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.id,
        input.keyHash,
        input.keyPrefix,
        input.name,
        input.teamId,
        input.role,
        JSON.stringify(input.scopes),
        input.createdBy,
        input.expiresAt,
      ]
    );
  },

  async findByHash(keyHash: string): Promise<ApiKey | null> {
    const db = await getPool();
    const result = await db.query(
      'SELECT * FROM api_keys WHERE key_hash = $1 AND (expires_at IS NULL OR expires_at > NOW())',
      [keyHash]
    );
    return result.rows[0] ? mapApiKey(result.rows[0]) : null;
  },

  async findByPrefix(prefix: string): Promise<ApiKey | null> {
    const db = await getPool();
    const result = await db.query(
      'SELECT * FROM api_keys WHERE key_prefix = $1 AND (expires_at IS NULL OR expires_at > NOW())',
      [prefix]
    );
    return result.rows[0] ? mapApiKey(result.rows[0]) : null;
  },

  async findByTeam(teamId: string): Promise<ApiKey[]> {
    const db = await getPool();
    const result = await db.query(
      'SELECT * FROM api_keys WHERE team_id = $1 ORDER BY created_at DESC',
      [teamId]
    );
    return result.rows.map(mapApiKey);
  },

  async updateLastUsed(id: string): Promise<void> {
    const db = await getPool();
    await db.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [id]);
  },

  async revoke(id: string): Promise<boolean> {
    const db = await getPool();
    const result = await db.query('DELETE FROM api_keys WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },
};

function mapApiKey(row: any): ApiKey {
  return {
    id: row.id,
    key: '', // Never expose the hash
    name: row.name,
    teamId: row.team_id,
    role: row.role,
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by,
    lastUsed: row.last_used_at?.toISOString(),
    expiresAt: row.expires_at?.toISOString(),
    scopes: row.scopes || [],
  };
}

// ============================================================================
// Project Slots Repository
// ============================================================================

export const SlotRepo = {
  async findByProject(
    projectName: string,
    environment: Environment
  ): Promise<ProjectSlots | null> {
    const db = await getPool();
    const result = await db.query(
      'SELECT * FROM project_slots WHERE project_name = $1 AND environment = $2',
      [projectName, environment]
    );
    return result.rows[0] ? mapProjectSlots(result.rows[0]) : null;
  },

  async upsert(slots: ProjectSlots): Promise<void> {
    const db = await getPool();
    await db.query(
      `INSERT INTO project_slots (
        project_name, environment, active_slot,
        blue_state, blue_port, blue_version, blue_image, blue_deployed_at, blue_deployed_by, blue_health_status,
        green_state, green_port, green_version, green_image, green_deployed_at, green_deployed_by, green_health_status,
        grace_expires_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
      ON CONFLICT (project_name, environment) DO UPDATE SET
        active_slot = EXCLUDED.active_slot,
        blue_state = EXCLUDED.blue_state,
        blue_port = EXCLUDED.blue_port,
        blue_version = EXCLUDED.blue_version,
        blue_image = EXCLUDED.blue_image,
        blue_deployed_at = EXCLUDED.blue_deployed_at,
        blue_deployed_by = EXCLUDED.blue_deployed_by,
        blue_health_status = EXCLUDED.blue_health_status,
        green_state = EXCLUDED.green_state,
        green_port = EXCLUDED.green_port,
        green_version = EXCLUDED.green_version,
        green_image = EXCLUDED.green_image,
        green_deployed_at = EXCLUDED.green_deployed_at,
        green_deployed_by = EXCLUDED.green_deployed_by,
        green_health_status = EXCLUDED.green_health_status,
        grace_expires_at = EXCLUDED.grace_expires_at,
        updated_at = NOW()`,
      [
        slots.projectName,
        slots.environment,
        slots.activeSlot,
        slots.blue.state,
        slots.blue.port,
        slots.blue.version,
        slots.blue.image,
        slots.blue.deployedAt,
        slots.blue.deployedBy,
        slots.blue.healthStatus,
        slots.green.state,
        slots.green.port,
        slots.green.version,
        slots.green.image,
        slots.green.deployedAt,
        slots.green.deployedBy,
        slots.green.healthStatus,
        slots.green.graceExpiresAt || slots.blue.graceExpiresAt,
      ]
    );
  },

  async listAll(): Promise<ProjectSlots[]> {
    const db = await getPool();
    const result = await db.query('SELECT * FROM project_slots ORDER BY project_name, environment');
    return result.rows.map(mapProjectSlots);
  },
};

function mapProjectSlots(row: any): ProjectSlots {
  return {
    projectName: row.project_name,
    environment: row.environment,
    activeSlot: row.active_slot,
    lastUpdated: row.updated_at.toISOString(),
    blue: {
      name: 'blue',
      state: row.blue_state,
      port: row.blue_port,
      version: row.blue_version,
      image: row.blue_image,
      deployedAt: row.blue_deployed_at?.toISOString(),
      deployedBy: row.blue_deployed_by,
      healthStatus: row.blue_health_status,
    },
    green: {
      name: 'green',
      state: row.green_state,
      port: row.green_port,
      version: row.green_version,
      image: row.green_image,
      deployedAt: row.green_deployed_at?.toISOString(),
      deployedBy: row.green_deployed_by,
      healthStatus: row.green_health_status,
      graceExpiresAt: row.grace_expires_at?.toISOString(),
    },
  };
}

// ============================================================================
// Audit Log Repository
// ============================================================================

export const AuditLogRepo = {
  async create(entry: Omit<AuditLogEntry, 'id'>): Promise<void> {
    const db = await getPool();
    const id = randomBytes(16).toString('hex');
    await db.query(
      `INSERT INTO audit_logs (
        id, timestamp, team_id, key_id, user_id, action, resource, resource_id,
        params, success, duration, ip, user_agent, error
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        id,
        entry.timestamp,
        entry.teamId,
        entry.userId,
        entry.userId,
        entry.action,
        entry.resource,
        entry.resourceId,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.success,
        entry.duration,
        entry.ip,
        entry.userAgent,
        entry.error,
      ]
    );
  },

  async find(options: {
    teamId?: string;
    action?: string;
    since?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLogEntry[]; total: number }> {
    const db = await getPool();
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (options.teamId) {
      conditions.push(`team_id = $${idx++}`);
      values.push(options.teamId);
    }
    if (options.action) {
      conditions.push(`action = $${idx++}`);
      values.push(options.action);
    }
    if (options.since) {
      conditions.push(`timestamp >= $${idx++}`);
      values.push(options.since);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) FROM audit_logs ${where}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    // Get logs
    const limit = options.limit || 100;
    const offset = options.offset || 0;
    values.push(limit, offset);

    const result = await db.query(
      `SELECT * FROM audit_logs ${where} ORDER BY timestamp DESC LIMIT $${idx++} OFFSET $${idx}`,
      values
    );

    return {
      logs: result.rows.map(mapAuditLog),
      total,
    };
  },

  async cleanup(retentionDays: number = 90): Promise<number> {
    const db = await getPool();
    const result = await db.query(
      `DELETE FROM audit_logs WHERE timestamp < NOW() - INTERVAL '${retentionDays} days'`
    );
    return result.rowCount ?? 0;
  },
};

function mapAuditLog(row: any): AuditLogEntry {
  return {
    id: row.id,
    timestamp: row.timestamp.toISOString(),
    teamId: row.team_id,
    userId: row.user_id,
    action: row.action,
    resource: row.resource,
    resourceId: row.resource_id,
    details: row.params,
    ip: row.ip,
    userAgent: row.user_agent,
    duration: row.duration,
    success: row.success,
    error: row.error,
  };
}

// ============================================================================
// Deployment History Repository
// ============================================================================

export const DeploymentRepo = {
  async create(deployment: {
    id: string;
    projectName: string;
    environment: Environment;
    slot: SlotName;
    version?: string;
    image?: string;
    deployedBy: string;
  }): Promise<void> {
    const db = await getPool();
    await db.query(
      `INSERT INTO deployments (id, project_name, environment, slot, version, image, deployed_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
      [
        deployment.id,
        deployment.projectName,
        deployment.environment,
        deployment.slot,
        deployment.version,
        deployment.image,
        deployment.deployedBy,
      ]
    );
  },

  async updateStatus(
    id: string,
    status: 'pending' | 'running' | 'success' | 'failed',
    details?: {
      steps?: unknown[];
      duration?: number;
      error?: string;
    }
  ): Promise<void> {
    const db = await getPool();
    const setClauses = ['status = $1'];
    const values: unknown[] = [status];
    let idx = 2;

    if (status === 'success' || status === 'failed') {
      setClauses.push(`completed_at = NOW()`);
    }
    if (details?.steps) {
      setClauses.push(`steps = $${idx++}`);
      values.push(JSON.stringify(details.steps));
    }
    if (details?.duration) {
      setClauses.push(`duration = $${idx++}`);
      values.push(details.duration);
    }

    values.push(id);
    await db.query(
      `UPDATE deployments SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      values
    );
  },

  async markPromoted(id: string, promotedBy: string): Promise<void> {
    const db = await getPool();
    await db.query(
      'UPDATE deployments SET promoted_at = NOW(), promoted_by = $1 WHERE id = $2',
      [promotedBy, id]
    );
  },

  async markRolledBack(id: string, rolledBackBy: string, reason?: string): Promise<void> {
    const db = await getPool();
    await db.query(
      'UPDATE deployments SET rolled_back_at = NOW(), rolled_back_by = $1, rollback_reason = $2 WHERE id = $3',
      [rolledBackBy, reason, id]
    );
  },

  async findByProject(
    projectName: string,
    options?: { environment?: Environment; limit?: number }
  ): Promise<any[]> {
    const db = await getPool();
    const conditions = ['project_name = $1'];
    const values: unknown[] = [projectName];
    let idx = 2;

    if (options?.environment) {
      conditions.push(`environment = $${idx++}`);
      values.push(options.environment);
    }

    values.push(options?.limit || 50);
    const result = await db.query(
      `SELECT * FROM deployments WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT $${idx}`,
      values
    );

    return result.rows;
  },
};

// ============================================================================
// Transaction Helper
// ============================================================================

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
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
