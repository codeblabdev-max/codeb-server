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
  WorkTask,
  WorkTaskFile,
  TaskStatus,
  TaskPriority,
  ProgressNote,
  ConflictInfo,
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

const SCHEMA_VERSION = 3;

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

  // Migration v2: Add domains table
  2: [
    // Domains table (SSOT for domain configuration)
    `CREATE TABLE IF NOT EXISTS domains (
      id SERIAL PRIMARY KEY,
      domain VARCHAR(255) UNIQUE NOT NULL,
      project_name VARCHAR(100) REFERENCES projects(name) ON DELETE CASCADE,
      environment VARCHAR(20) NOT NULL DEFAULT 'production',
      type VARCHAR(20) NOT NULL DEFAULT 'subdomain',
      ssl_enabled BOOLEAN DEFAULT true,
      ssl_issuer VARCHAR(100) DEFAULT 'letsencrypt',
      dns_configured BOOLEAN DEFAULT false,
      dns_verified_at TIMESTAMPTZ,
      caddy_configured BOOLEAN DEFAULT false,
      status VARCHAR(20) DEFAULT 'pending',
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // Environment variables table (SSOT for env)
    `CREATE TABLE IF NOT EXISTS project_envs (
      id SERIAL PRIMARY KEY,
      project_name VARCHAR(100) REFERENCES projects(name) ON DELETE CASCADE,
      environment VARCHAR(20) NOT NULL DEFAULT 'production',
      env_data JSONB NOT NULL DEFAULT '{}',
      encrypted BOOLEAN DEFAULT false,
      version INTEGER DEFAULT 1,
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(project_name, environment)
    )`,

    // Indexes for new tables
    `CREATE INDEX IF NOT EXISTS idx_domains_project ON domains(project_name)`,
    `CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain)`,
    `CREATE INDEX IF NOT EXISTS idx_project_envs_project ON project_envs(project_name, environment)`,
  ],

  // Migration v3: Work Tasks (Team Collaboration & Conflict Prevention)
  3: [
    // Work tasks table - 작업 등록 + MD 문서 저장
    `CREATE TABLE IF NOT EXISTS work_tasks (
      id SERIAL PRIMARY KEY,
      team_id VARCHAR(32) REFERENCES teams(id) ON DELETE CASCADE,
      project_name VARCHAR(100) REFERENCES projects(name) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      author VARCHAR(255) NOT NULL,
      branch VARCHAR(255),
      pr_number INTEGER,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      priority VARCHAR(20) NOT NULL DEFAULT 'medium',
      affected_files JSONB DEFAULT '[]',
      affected_areas JSONB DEFAULT '[]',
      progress_notes JSONB DEFAULT '[]',
      deploy_id VARCHAR(32),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // Work task files - 파일별 잠금 추적
    `CREATE TABLE IF NOT EXISTS work_task_files (
      id SERIAL PRIMARY KEY,
      task_id INTEGER REFERENCES work_tasks(id) ON DELETE CASCADE,
      file_path VARCHAR(1000) NOT NULL,
      lock_type VARCHAR(20) NOT NULL DEFAULT 'editing',
      change_description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'locked',
      locked_at TIMESTAMPTZ DEFAULT NOW(),
      released_at TIMESTAMPTZ
    )`,

    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_work_tasks_team ON work_tasks(team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_work_tasks_project ON work_tasks(project_name)`,
    `CREATE INDEX IF NOT EXISTS idx_work_tasks_status ON work_tasks(status)`,
    `CREATE INDEX IF NOT EXISTS idx_work_tasks_author ON work_tasks(author)`,
    `CREATE INDEX IF NOT EXISTS idx_work_task_files_task ON work_task_files(task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_work_task_files_path ON work_task_files(file_path)`,
    `CREATE INDEX IF NOT EXISTS idx_work_task_files_status ON work_task_files(status)`,
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

  async listByTeam(teamId: string): Promise<ProjectSlots[]> {
    const db = await getPool();
    const result = await db.query(
      `SELECT ps.* FROM project_slots ps
       JOIN projects p ON ps.project_name = p.name
       WHERE p.team_id = $1
       ORDER BY ps.project_name, ps.environment`,
      [teamId]
    );
    return result.rows.map(mapProjectSlots);
  },

  async listByProjects(projectNames: string[]): Promise<ProjectSlots[]> {
    if (projectNames.length === 0) return [];
    const db = await getPool();
    const placeholders = projectNames.map((_, i) => `$${i + 1}`).join(', ');
    const result = await db.query(
      `SELECT * FROM project_slots WHERE project_name IN (${placeholders}) ORDER BY project_name, environment`,
      projectNames
    );
    return result.rows.map(mapProjectSlots);
  },
};

// ============================================================================
// Project Repository
// ============================================================================

export interface ProjectRecord {
  name: string;
  teamId: string;
  type: string;
  databaseName?: string;
  databasePort?: number;
  redisDb?: number;
  redisPort?: number;
  createdAt: string;
  updatedAt: string;
}

export const ProjectRepo = {
  async create(project: Omit<ProjectRecord, 'createdAt' | 'updatedAt'>): Promise<ProjectRecord> {
    const db = await getPool();
    const result = await db.query(
      `INSERT INTO projects (name, team_id, type, database_name, database_port, redis_db, redis_port)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        project.name,
        project.teamId,
        project.type || 'nextjs',
        project.databaseName,
        project.databasePort,
        project.redisDb,
        project.redisPort,
      ]
    );
    return mapProject(result.rows[0]);
  },

  async findByName(name: string): Promise<ProjectRecord | null> {
    const db = await getPool();
    const result = await db.query('SELECT * FROM projects WHERE name = $1', [name]);
    return result.rows[0] ? mapProject(result.rows[0]) : null;
  },

  async findByTeam(teamId: string): Promise<ProjectRecord[]> {
    const db = await getPool();
    const result = await db.query(
      'SELECT * FROM projects WHERE team_id = $1 ORDER BY created_at DESC',
      [teamId]
    );
    return result.rows.map(mapProject);
  },

  async update(name: string, updates: Partial<ProjectRecord>): Promise<ProjectRecord | null> {
    const db = await getPool();
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.type) {
      setClauses.push(`type = $${idx++}`);
      values.push(updates.type);
    }
    if (updates.databaseName !== undefined) {
      setClauses.push(`database_name = $${idx++}`);
      values.push(updates.databaseName);
    }
    if (updates.databasePort !== undefined) {
      setClauses.push(`database_port = $${idx++}`);
      values.push(updates.databasePort);
    }
    if (updates.redisDb !== undefined) {
      setClauses.push(`redis_db = $${idx++}`);
      values.push(updates.redisDb);
    }
    if (updates.redisPort !== undefined) {
      setClauses.push(`redis_port = $${idx++}`);
      values.push(updates.redisPort);
    }

    if (setClauses.length === 0) return null;

    setClauses.push(`updated_at = NOW()`);
    values.push(name);

    const result = await db.query(
      `UPDATE projects SET ${setClauses.join(', ')} WHERE name = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ? mapProject(result.rows[0]) : null;
  },

  async delete(name: string): Promise<boolean> {
    const db = await getPool();
    const result = await db.query('DELETE FROM projects WHERE name = $1', [name]);
    return (result.rowCount ?? 0) > 0;
  },

  async list(): Promise<ProjectRecord[]> {
    const db = await getPool();
    const result = await db.query('SELECT * FROM projects ORDER BY created_at DESC');
    return result.rows.map(mapProject);
  },

  async upsert(project: Omit<ProjectRecord, 'createdAt' | 'updatedAt'>): Promise<void> {
    const db = await getPool();
    await db.query(
      `INSERT INTO projects (name, team_id, type, database_name, database_port, redis_db, redis_port)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (name) DO UPDATE SET
         team_id = EXCLUDED.team_id,
         type = EXCLUDED.type,
         database_name = EXCLUDED.database_name,
         database_port = EXCLUDED.database_port,
         redis_db = EXCLUDED.redis_db,
         redis_port = EXCLUDED.redis_port,
         updated_at = NOW()`,
      [
        project.name,
        project.teamId,
        project.type || 'nextjs',
        project.databaseName,
        project.databasePort,
        project.redisDb,
        project.redisPort,
      ]
    );
  },
};

function mapProject(row: any): ProjectRecord {
  return {
    name: row.name,
    teamId: row.team_id,
    type: row.type,
    databaseName: row.database_name,
    databasePort: row.database_port,
    redisDb: row.redis_db,
    redisPort: row.redis_port,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

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

// ============================================================================
// Domain Repository (SSOT for domain configuration)
// ============================================================================

export interface Domain {
  id: number;
  domain: string;
  project_name: string | null;
  environment: string;
  type: 'subdomain' | 'custom';
  ssl_enabled: boolean;
  ssl_issuer: string;
  dns_configured: boolean;
  dns_verified_at: Date | null;
  caddy_configured: boolean;
  status: 'pending' | 'active' | 'error' | 'deleted';
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export const DomainRepo = {
  async create(data: {
    domain: string;
    projectName?: string;
    environment?: string;
    type?: 'subdomain' | 'custom';
    sslEnabled?: boolean;
    createdBy?: string;
  }): Promise<Domain> {
    const db = await getPool();
    const result = await db.query(
      `INSERT INTO domains (domain, project_name, environment, type, ssl_enabled, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.domain,
        data.projectName || null,
        data.environment || 'production',
        data.type || 'subdomain',
        data.sslEnabled !== false,
        data.createdBy || null,
      ]
    );
    return result.rows[0];
  },

  async findByDomain(domain: string): Promise<Domain | null> {
    const db = await getPool();
    const result = await db.query(
      'SELECT * FROM domains WHERE domain = $1',
      [domain]
    );
    return result.rows[0] || null;
  },

  async findByProject(projectName: string, environment?: string): Promise<Domain[]> {
    const db = await getPool();
    let query = 'SELECT * FROM domains WHERE project_name = $1';
    const values: unknown[] = [projectName];

    if (environment) {
      query += ' AND environment = $2';
      values.push(environment);
    }

    query += ' ORDER BY created_at DESC';
    const result = await db.query(query, values);
    return result.rows;
  },

  async listAll(): Promise<Domain[]> {
    const db = await getPool();
    const result = await db.query(
      'SELECT * FROM domains ORDER BY created_at DESC'
    );
    return result.rows;
  },

  async update(domain: string, data: Partial<{
    projectName: string;
    environment: string;
    sslEnabled: boolean;
    dnsConfigured: boolean;
    dnsVerifiedAt: Date;
    caddyConfigured: boolean;
    status: 'pending' | 'active' | 'error' | 'deleted';
  }>): Promise<Domain | null> {
    const db = await getPool();
    const updates: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let idx = 1;

    if (data.projectName !== undefined) {
      updates.push(`project_name = $${idx++}`);
      values.push(data.projectName);
    }
    if (data.environment !== undefined) {
      updates.push(`environment = $${idx++}`);
      values.push(data.environment);
    }
    if (data.sslEnabled !== undefined) {
      updates.push(`ssl_enabled = $${idx++}`);
      values.push(data.sslEnabled);
    }
    if (data.dnsConfigured !== undefined) {
      updates.push(`dns_configured = $${idx++}`);
      values.push(data.dnsConfigured);
    }
    if (data.dnsVerifiedAt !== undefined) {
      updates.push(`dns_verified_at = $${idx++}`);
      values.push(data.dnsVerifiedAt);
    }
    if (data.caddyConfigured !== undefined) {
      updates.push(`caddy_configured = $${idx++}`);
      values.push(data.caddyConfigured);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${idx++}`);
      values.push(data.status);
    }

    values.push(domain);
    const result = await db.query(
      `UPDATE domains SET ${updates.join(', ')} WHERE domain = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },

  async delete(domain: string): Promise<boolean> {
    const db = await getPool();
    const result = await db.query(
      'DELETE FROM domains WHERE domain = $1',
      [domain]
    );
    return (result.rowCount ?? 0) > 0;
  },

  async markActive(domain: string): Promise<Domain | null> {
    return this.update(domain, {
      status: 'active',
      dnsConfigured: true,
      dnsVerifiedAt: new Date(),
      caddyConfigured: true,
    });
  },
};

// ============================================================================
// Project Environment Repository (SSOT for environment variables)
// ============================================================================

export interface ProjectEnv {
  id: number;
  project_name: string;
  environment: string;
  env_data: Record<string, string>;
  encrypted: boolean;
  version: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export const ProjectEnvRepo = {
  async upsert(data: {
    projectName: string;
    environment?: string;
    envData: Record<string, string>;
    createdBy?: string;
  }): Promise<ProjectEnv> {
    const db = await getPool();
    const environment = data.environment || 'production';

    const result = await db.query(
      `INSERT INTO project_envs (project_name, environment, env_data, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_name, environment) DO UPDATE SET
         env_data = $3,
         version = project_envs.version + 1,
         updated_at = NOW()
       RETURNING *`,
      [data.projectName, environment, JSON.stringify(data.envData), data.createdBy || null]
    );
    return result.rows[0];
  },

  async findByProject(projectName: string, environment?: string): Promise<ProjectEnv | null> {
    const db = await getPool();
    const env = environment || 'production';
    const result = await db.query(
      'SELECT * FROM project_envs WHERE project_name = $1 AND environment = $2',
      [projectName, env]
    );
    return result.rows[0] || null;
  },

  async listByProject(projectName: string): Promise<ProjectEnv[]> {
    const db = await getPool();
    const result = await db.query(
      'SELECT * FROM project_envs WHERE project_name = $1 ORDER BY environment',
      [projectName]
    );
    return result.rows;
  },

  async delete(projectName: string, environment?: string): Promise<boolean> {
    const db = await getPool();
    let query = 'DELETE FROM project_envs WHERE project_name = $1';
    const values: unknown[] = [projectName];

    if (environment) {
      query += ' AND environment = $2';
      values.push(environment);
    }

    const result = await db.query(query, values);
    return (result.rowCount ?? 0) > 0;
  },

  async getEnvValue(projectName: string, key: string, environment?: string): Promise<string | null> {
    const envRecord = await this.findByProject(projectName, environment);
    if (!envRecord) return null;
    return envRecord.env_data[key] || null;
  },

  async setEnvValue(projectName: string, key: string, value: string, environment?: string): Promise<ProjectEnv> {
    const existing = await this.findByProject(projectName, environment);
    const envData = existing?.env_data || {};
    envData[key] = value;
    return this.upsert({ projectName, environment, envData });
  },
};

// ============================================================================
// Work Task Repository (Team Collaboration & Conflict Prevention)
// ============================================================================

export const WorkTaskRepo = {
  async create(data: {
    teamId: string;
    projectName: string;
    title: string;
    description: string;
    author: string;
    branch?: string;
    priority?: TaskPriority;
    affectedFiles?: string[];
    affectedAreas?: string[];
  }): Promise<WorkTask> {
    const db = await getPool();
    const result = await db.query(
      `INSERT INTO work_tasks (team_id, project_name, title, description, author, branch, priority, affected_files, affected_areas, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'in_progress')
       RETURNING *`,
      [
        data.teamId,
        data.projectName,
        data.title,
        data.description,
        data.author,
        data.branch || null,
        data.priority || 'medium',
        JSON.stringify(data.affectedFiles || []),
        JSON.stringify(data.affectedAreas || []),
      ]
    );
    return mapWorkTask(result.rows[0]);
  },

  async findById(id: number): Promise<WorkTask | null> {
    const db = await getPool();
    const result = await db.query('SELECT * FROM work_tasks WHERE id = $1', [id]);
    return result.rows[0] ? mapWorkTask(result.rows[0]) : null;
  },

  async findByProject(projectName: string, statusFilter?: TaskStatus[]): Promise<WorkTask[]> {
    const db = await getPool();
    let query = 'SELECT * FROM work_tasks WHERE project_name = $1';
    const values: unknown[] = [projectName];

    if (statusFilter && statusFilter.length > 0) {
      const placeholders = statusFilter.map((_, i) => `$${i + 2}`).join(', ');
      query += ` AND status IN (${placeholders})`;
      values.push(...statusFilter);
    }

    query += ' ORDER BY created_at DESC';
    const result = await db.query(query, values);
    return result.rows.map(mapWorkTask);
  },

  async findActive(teamId?: string): Promise<WorkTask[]> {
    const db = await getPool();
    const activeStatuses = ['draft', 'in_progress', 'pushed', 'deploying'];
    const placeholders = activeStatuses.map((_, i) => `$${i + 1}`).join(', ');
    let query = `SELECT * FROM work_tasks WHERE status IN (${placeholders})`;
    const values: unknown[] = [...activeStatuses];

    if (teamId) {
      query += ` AND team_id = $${values.length + 1}`;
      values.push(teamId);
    }

    query += ' ORDER BY priority DESC, created_at ASC';
    const result = await db.query(query, values);
    return result.rows.map(mapWorkTask);
  },

  async updateStatus(id: number, status: TaskStatus): Promise<WorkTask | null> {
    const db = await getPool();
    const result = await db.query(
      'UPDATE work_tasks SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );
    return result.rows[0] ? mapWorkTask(result.rows[0]) : null;
  },

  async update(id: number, updates: {
    title?: string;
    description?: string;
    branch?: string;
    prNumber?: number;
    status?: TaskStatus;
    priority?: TaskPriority;
    affectedFiles?: string[];
    affectedAreas?: string[];
    deployId?: string;
  }): Promise<WorkTask | null> {
    const db = await getPool();
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.title !== undefined) { setClauses.push(`title = $${idx++}`); values.push(updates.title); }
    if (updates.description !== undefined) { setClauses.push(`description = $${idx++}`); values.push(updates.description); }
    if (updates.branch !== undefined) { setClauses.push(`branch = $${idx++}`); values.push(updates.branch); }
    if (updates.prNumber !== undefined) { setClauses.push(`pr_number = $${idx++}`); values.push(updates.prNumber); }
    if (updates.status !== undefined) { setClauses.push(`status = $${idx++}`); values.push(updates.status); }
    if (updates.priority !== undefined) { setClauses.push(`priority = $${idx++}`); values.push(updates.priority); }
    if (updates.affectedFiles !== undefined) { setClauses.push(`affected_files = $${idx++}`); values.push(JSON.stringify(updates.affectedFiles)); }
    if (updates.affectedAreas !== undefined) { setClauses.push(`affected_areas = $${idx++}`); values.push(JSON.stringify(updates.affectedAreas)); }
    if (updates.deployId !== undefined) { setClauses.push(`deploy_id = $${idx++}`); values.push(updates.deployId); }

    if (setClauses.length === 0) return this.findById(id);

    setClauses.push('updated_at = NOW()');
    values.push(id);

    const result = await db.query(
      `UPDATE work_tasks SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] ? mapWorkTask(result.rows[0]) : null;
  },

  async addProgressNote(id: number, note: ProgressNote): Promise<WorkTask | null> {
    const db = await getPool();
    const result = await db.query(
      `UPDATE work_tasks
       SET progress_notes = progress_notes || $1::jsonb, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [JSON.stringify([note]), id]
    );
    return result.rows[0] ? mapWorkTask(result.rows[0]) : null;
  },

  async complete(id: number, deployId?: string): Promise<WorkTask | null> {
    const db = await getPool();
    const result = await db.query(
      `UPDATE work_tasks SET status = 'deployed', deploy_id = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [deployId || null, id]
    );
    return result.rows[0] ? mapWorkTask(result.rows[0]) : null;
  },
};

function mapWorkTask(row: any): WorkTask {
  return {
    id: row.id,
    teamId: row.team_id,
    projectName: row.project_name,
    title: row.title,
    description: row.description,
    author: row.author,
    branch: row.branch,
    prNumber: row.pr_number,
    status: row.status,
    priority: row.priority,
    affectedFiles: row.affected_files || [],
    affectedAreas: row.affected_areas || [],
    progressNotes: row.progress_notes || [],
    deployId: row.deploy_id,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  };
}

// ============================================================================
// Work Task File Lock Repository
// ============================================================================

export const WorkTaskFileRepo = {
  async lockFiles(taskId: number, files: { path: string; description?: string; lockType?: string }[]): Promise<WorkTaskFile[]> {
    const db = await getPool();
    const results: WorkTaskFile[] = [];

    for (const file of files) {
      const result = await db.query(
        `INSERT INTO work_task_files (task_id, file_path, lock_type, change_description)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [taskId, file.path, file.lockType || 'editing', file.description || null]
      );
      results.push(mapWorkTaskFile(result.rows[0]));
    }

    return results;
  },

  async releaseByTask(taskId: number): Promise<number> {
    const db = await getPool();
    const result = await db.query(
      `UPDATE work_task_files SET status = 'released', released_at = NOW()
       WHERE task_id = $1 AND status = 'locked'`,
      [taskId]
    );
    return result.rowCount ?? 0;
  },

  async findLockedByPaths(filePaths: string[]): Promise<(WorkTaskFile & { task: WorkTask })[]> {
    if (filePaths.length === 0) return [];
    const db = await getPool();
    const placeholders = filePaths.map((_, i) => `$${i + 1}`).join(', ');

    const result = await db.query(
      `SELECT wtf.*, wt.title as task_title, wt.author as task_author,
              wt.status as task_status, wt.project_name as task_project
       FROM work_task_files wtf
       JOIN work_tasks wt ON wtf.task_id = wt.id
       WHERE wtf.file_path IN (${placeholders})
         AND wtf.status = 'locked'
         AND wt.status IN ('draft', 'in_progress', 'pushed', 'deploying')
       ORDER BY wtf.locked_at ASC`,
      filePaths
    );

    return result.rows.map((row: any) => ({
      ...mapWorkTaskFile(row),
      task: {
        id: row.task_id,
        teamId: '',
        projectName: row.task_project,
        title: row.task_title,
        description: '',
        author: row.task_author,
        status: row.task_status,
        priority: 'medium' as TaskPriority,
        affectedFiles: [],
        affectedAreas: [],
        progressNotes: [],
        createdAt: '',
        updatedAt: '',
      },
    }));
  },

  async findByTask(taskId: number): Promise<WorkTaskFile[]> {
    const db = await getPool();
    const result = await db.query(
      'SELECT * FROM work_task_files WHERE task_id = $1 ORDER BY locked_at ASC',
      [taskId]
    );
    return result.rows.map(mapWorkTaskFile);
  },

  async checkConflicts(filePaths: string[], excludeTaskId?: number): Promise<ConflictInfo[]> {
    if (filePaths.length === 0) return [];
    const db = await getPool();
    const placeholders = filePaths.map((_, i) => `$${i + 1}`).join(', ');
    let query = `
      SELECT wt.id as task_id, wt.title, wt.author, wt.status,
             array_agg(DISTINCT wtf.file_path) as conflicting_files
      FROM work_task_files wtf
      JOIN work_tasks wt ON wtf.task_id = wt.id
      WHERE wtf.file_path IN (${placeholders})
        AND wtf.status = 'locked'
        AND wt.status IN ('draft', 'in_progress', 'pushed', 'deploying')`;

    const values: unknown[] = [...filePaths];

    if (excludeTaskId) {
      query += ` AND wt.id != $${values.length + 1}`;
      values.push(excludeTaskId);
    }

    query += ' GROUP BY wt.id, wt.title, wt.author, wt.status';

    const result = await db.query(query, values);

    return result.rows.map((row: any) => {
      const conflictCount = row.conflicting_files.length;
      const totalChecked = filePaths.length;
      let severity: 'high' | 'medium' | 'low' = 'low';
      if (conflictCount >= 3 || conflictCount / totalChecked > 0.5) severity = 'high';
      else if (conflictCount >= 1) severity = 'medium';

      return {
        taskId: row.task_id,
        title: row.title,
        author: row.author,
        status: row.status as TaskStatus,
        conflictingFiles: row.conflicting_files,
        severity,
      };
    });
  },
};

function mapWorkTaskFile(row: any): WorkTaskFile {
  return {
    id: row.id,
    taskId: row.task_id,
    filePath: row.file_path,
    lockType: row.lock_type,
    changeDescription: row.change_description,
    status: row.status,
    lockedAt: row.locked_at?.toISOString?.() || row.locked_at,
    releasedAt: row.released_at?.toISOString?.() || row.released_at,
  };
}
