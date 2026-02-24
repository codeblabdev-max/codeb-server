/**
 * @codeb/db - Project Environment Repository
 * Based on mcp-server/src/lib/database.ts ProjectEnvRepo
 */

import { getPool } from '../pool.js';

// ============================================================================
// Types
// ============================================================================

export interface ProjectEnvRecord {
  id: number;
  projectName: string;
  environment: string;
  envData: Record<string, string>;
  encrypted: boolean;
  version: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Row Mapper
// ============================================================================

function mapProjectEnv(row: Record<string, unknown>): ProjectEnvRecord {
  return {
    id: row.id as number,
    projectName: row.project_name as string,
    environment: row.environment as string,
    envData: row.env_data as Record<string, string>,
    encrypted: row.encrypted as boolean,
    version: row.version as number,
    createdBy: row.created_by as string | null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

// ============================================================================
// Repository
// ============================================================================

export const ProjectEnvRepo = {
  async getEnv(
    projectName: string,
    environment: string = 'production',
  ): Promise<ProjectEnvRecord | null> {
    const db = await getPool();
    const result = await db.query(
      'SELECT * FROM project_envs WHERE project_name = $1 AND environment = $2',
      [projectName, environment],
    );
    return result.rows[0] ? mapProjectEnv(result.rows[0]) : null;
  },

  async saveEnv(data: {
    projectName: string;
    environment?: string;
    envData: Record<string, string>;
    createdBy?: string;
  }): Promise<ProjectEnvRecord> {
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
      [data.projectName, environment, JSON.stringify(data.envData), data.createdBy || null],
    );
    return mapProjectEnv(result.rows[0]);
  },

  async getVersions(projectName: string): Promise<ProjectEnvRecord[]> {
    const db = await getPool();
    const result = await db.query(
      'SELECT * FROM project_envs WHERE project_name = $1 ORDER BY environment',
      [projectName],
    );
    return result.rows.map(mapProjectEnv);
  },

  async delete(
    projectName: string,
    environment?: string,
  ): Promise<boolean> {
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
};
