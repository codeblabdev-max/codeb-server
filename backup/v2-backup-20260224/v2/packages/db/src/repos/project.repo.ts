/**
 * @codeb/db - Project Repository
 * Based on mcp-server/src/lib/database.ts ProjectRepo
 */

import { getPool } from '../pool.js';

// ============================================================================
// Types
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

// ============================================================================
// Row Mapper
// ============================================================================

function mapProject(row: Record<string, unknown>): ProjectRecord {
  return {
    name: row.name as string,
    teamId: row.team_id as string,
    type: row.type as string,
    databaseName: row.database_name as string | undefined,
    databasePort: row.database_port as number | undefined,
    redisDb: row.redis_db as number | undefined,
    redisPort: row.redis_port as number | undefined,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

// ============================================================================
// Repository
// ============================================================================

export const ProjectRepo = {
  async findByName(name: string): Promise<ProjectRecord | null> {
    const db = await getPool();
    const result = await db.query('SELECT * FROM projects WHERE name = $1', [name]);
    return result.rows[0] ? mapProject(result.rows[0]) : null;
  },

  async findAll(): Promise<ProjectRecord[]> {
    const db = await getPool();
    const result = await db.query('SELECT * FROM projects ORDER BY created_at DESC');
    return result.rows.map(mapProject);
  },

  async findByTeam(teamId: string): Promise<ProjectRecord[]> {
    const db = await getPool();
    const result = await db.query(
      'SELECT * FROM projects WHERE team_id = $1 ORDER BY created_at DESC',
      [teamId],
    );
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
      ],
    );
  },

  async delete(name: string): Promise<boolean> {
    const db = await getPool();
    const result = await db.query('DELETE FROM projects WHERE name = $1', [name]);
    return (result.rowCount ?? 0) > 0;
  },
};
