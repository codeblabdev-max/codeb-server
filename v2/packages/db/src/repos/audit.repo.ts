/**
 * @codeb/db - Audit Log Repository
 * Based on mcp-server/src/lib/database.ts AuditLogRepo
 */

import { randomBytes } from 'node:crypto';
import { getPool } from '../pool.js';
import type { AuditLogEntry } from '@codeb/shared';

// ============================================================================
// Row Mapper
// ============================================================================

function mapAuditLog(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: row.id as string,
    timestamp: (row.timestamp as Date).toISOString(),
    teamId: row.team_id as string,
    userId: row.user_id as string,
    action: row.action as string,
    resource: row.resource as string,
    resourceId: row.resource_id as string | undefined,
    details: row.params as Record<string, unknown> | undefined,
    ip: row.ip as string,
    userAgent: row.user_agent as string,
    duration: row.duration as number,
    success: row.success as boolean,
    error: row.error as string | undefined,
  };
}

// ============================================================================
// Repository
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
      ],
    );
  },

  async findByTeam(
    teamId: string,
    options?: {
      action?: string;
      since?: Date;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ logs: AuditLogEntry[]; total: number }> {
    const db = await getPool();
    const conditions: string[] = ['team_id = $1'];
    const values: unknown[] = [teamId];
    let idx = 2;

    if (options?.action) {
      conditions.push(`action = $${idx++}`);
      values.push(options.action);
    }
    if (options?.since) {
      conditions.push(`timestamp >= $${idx++}`);
      values.push(options.since);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) FROM audit_logs ${where}`,
      values,
    );
    const total = parseInt(countResult.rows[0].count as string);

    // Get logs
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    values.push(limit, offset);

    const result = await db.query(
      `SELECT * FROM audit_logs ${where} ORDER BY timestamp DESC LIMIT $${idx++} OFFSET $${idx}`,
      values,
    );

    return {
      logs: result.rows.map(mapAuditLog),
      total,
    };
  },

  async cleanup(retentionDays: number = 90): Promise<number> {
    const db = await getPool();
    const result = await db.query(
      `DELETE FROM audit_logs WHERE timestamp < NOW() - INTERVAL '1 day' * $1`,
      [retentionDays],
    );
    return result.rowCount ?? 0;
  },
};
