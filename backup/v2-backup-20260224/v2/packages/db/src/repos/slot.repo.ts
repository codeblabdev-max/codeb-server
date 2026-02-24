/**
 * @codeb/db - Slot Repository
 * Based on mcp-server/src/lib/database.ts SlotRepo
 */

import { getPool } from '../pool.js';
import type { ProjectSlots, Environment, Slot } from '@codeb/shared';

// ============================================================================
// Row Mapper
// ============================================================================

function mapProjectSlots(row: Record<string, unknown>): ProjectSlots {
  return {
    projectName: row.project_name as string,
    environment: row.environment as Environment,
    activeSlot: row.active_slot as 'blue' | 'green',
    lastUpdated: (row.updated_at as Date).toISOString(),
    blue: {
      name: 'blue',
      state: row.blue_state as Slot['state'],
      port: row.blue_port as number,
      version: row.blue_version as string | undefined,
      image: row.blue_image as string | undefined,
      deployedAt: (row.blue_deployed_at as Date | null)?.toISOString(),
      deployedBy: row.blue_deployed_by as string | undefined,
      healthStatus: row.blue_health_status as Slot['healthStatus'],
    },
    green: {
      name: 'green',
      state: row.green_state as Slot['state'],
      port: row.green_port as number,
      version: row.green_version as string | undefined,
      image: row.green_image as string | undefined,
      deployedAt: (row.green_deployed_at as Date | null)?.toISOString(),
      deployedBy: row.green_deployed_by as string | undefined,
      healthStatus: row.green_health_status as Slot['healthStatus'],
      graceExpiresAt: (row.grace_expires_at as Date | null)?.toISOString(),
    },
  };
}

// ============================================================================
// Repository
// ============================================================================

export const SlotRepo = {
  async findByProject(
    projectName: string,
    environment: Environment,
  ): Promise<ProjectSlots | null> {
    const db = await getPool();
    const result = await db.query(
      'SELECT * FROM project_slots WHERE project_name = $1 AND environment = $2',
      [projectName, environment],
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
      ],
    );
  },

  async updateState(
    projectName: string,
    environment: Environment,
    slot: 'blue' | 'green',
    state: string,
  ): Promise<void> {
    const db = await getPool();
    const column = `${slot}_state`;
    await db.query(
      `UPDATE project_slots SET ${column} = $1, updated_at = NOW()
       WHERE project_name = $2 AND environment = $3`,
      [state, projectName, environment],
    );
  },

  async listAll(): Promise<ProjectSlots[]> {
    const db = await getPool();
    const result = await db.query(
      'SELECT * FROM project_slots ORDER BY project_name, environment',
    );
    return result.rows.map(mapProjectSlots);
  },

  async listByTeam(teamId: string): Promise<ProjectSlots[]> {
    const db = await getPool();
    const result = await db.query(
      `SELECT ps.* FROM project_slots ps
       JOIN projects p ON ps.project_name = p.name
       WHERE p.team_id = $1
       ORDER BY ps.project_name, ps.environment`,
      [teamId],
    );
    return result.rows.map(mapProjectSlots);
  },
};
