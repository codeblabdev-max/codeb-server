/**
 * @codeb/db - Team Repository
 * Based on mcp-server/src/lib/database.ts TeamRepo
 */

import { getPool } from '../pool.js';
import type { Team } from '@codeb/shared';

// ============================================================================
// Row Mapper
// ============================================================================

function mapTeam(row: Record<string, unknown>): Team {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    owner: row.owner as string,
    plan: row.plan as Team['plan'],
    createdAt: (row.created_at as Date).toISOString(),
    projects: [],
    settings: row.settings as Team['settings'],
  };
}

// ============================================================================
// Repository
// ============================================================================

export const TeamRepo = {
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

  async create(team: Omit<Team, 'createdAt'>): Promise<Team> {
    const db = await getPool();
    const result = await db.query(
      `INSERT INTO teams (id, name, slug, owner, plan, settings)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [team.id, team.name, team.slug, team.owner, team.plan, team.settings],
    );
    return mapTeam(result.rows[0]);
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
    setClauses.push('updated_at = NOW()');

    if (setClauses.length <= 1) return this.findById(id);

    values.push(id);
    const result = await db.query(
      `UPDATE teams SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    return result.rows[0] ? mapTeam(result.rows[0]) : null;
  },

  async delete(id: string): Promise<boolean> {
    const db = await getPool();
    const result = await db.query('DELETE FROM teams WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async list(): Promise<Team[]> {
    const db = await getPool();
    const result = await db.query('SELECT * FROM teams ORDER BY created_at DESC');
    return result.rows.map(mapTeam);
  },
};
