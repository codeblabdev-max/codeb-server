/**
 * @codeb/db - Deployment Repository
 * Based on mcp-server/src/lib/database.ts DeploymentRepo
 */

import { getPool } from '../pool.js';
import type { Environment, SlotName } from '@codeb/shared';

// ============================================================================
// Types
// ============================================================================

export interface DeploymentRecord {
  id: string;
  projectName: string;
  environment: Environment;
  slot: SlotName;
  version?: string;
  image?: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  deployedBy: string;
  promotedAt?: string;
  promotedBy?: string;
  rolledBackAt?: string;
  rolledBackBy?: string;
  rollbackReason?: string;
  steps: unknown[];
  duration?: number;
  createdAt: string;
  completedAt?: string;
}

// ============================================================================
// Repository
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
      ],
    );
  },

  async findByProject(
    projectName: string,
    options?: { environment?: Environment; limit?: number },
  ): Promise<DeploymentRecord[]> {
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
      values,
    );

    return result.rows.map(mapDeployment);
  },

  async findLatest(
    projectName: string,
    environment: Environment,
  ): Promise<DeploymentRecord | null> {
    const db = await getPool();
    const result = await db.query(
      `SELECT * FROM deployments
       WHERE project_name = $1 AND environment = $2
       ORDER BY created_at DESC LIMIT 1`,
      [projectName, environment],
    );
    return result.rows[0] ? mapDeployment(result.rows[0]) : null;
  },

  async updateStatus(
    id: string,
    status: 'pending' | 'running' | 'success' | 'failed',
    details?: {
      steps?: unknown[];
      duration?: number;
      error?: string;
    },
  ): Promise<void> {
    const db = await getPool();
    const setClauses = ['status = $1'];
    const values: unknown[] = [status];
    let idx = 2;

    if (status === 'success' || status === 'failed') {
      setClauses.push('completed_at = NOW()');
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
      values,
    );
  },

  async markPromoted(id: string, promotedBy: string): Promise<void> {
    const db = await getPool();
    await db.query(
      'UPDATE deployments SET promoted_at = NOW(), promoted_by = $1 WHERE id = $2',
      [promotedBy, id],
    );
  },

  async markRolledBack(id: string, rolledBackBy: string, reason?: string): Promise<void> {
    const db = await getPool();
    await db.query(
      'UPDATE deployments SET rolled_back_at = NOW(), rolled_back_by = $1, rollback_reason = $2 WHERE id = $3',
      [rolledBackBy, reason, id],
    );
  },
};

// ============================================================================
// Row Mapper
// ============================================================================

function mapDeployment(row: Record<string, unknown>): DeploymentRecord {
  return {
    id: row.id as string,
    projectName: row.project_name as string,
    environment: row.environment as Environment,
    slot: row.slot as SlotName,
    version: row.version as string | undefined,
    image: row.image as string | undefined,
    status: row.status as DeploymentRecord['status'],
    deployedBy: row.deployed_by as string,
    promotedAt: (row.promoted_at as Date | null)?.toISOString(),
    promotedBy: row.promoted_by as string | undefined,
    rolledBackAt: (row.rolled_back_at as Date | null)?.toISOString(),
    rolledBackBy: row.rolled_back_by as string | undefined,
    rollbackReason: row.rollback_reason as string | undefined,
    steps: (row.steps as unknown[]) || [],
    duration: row.duration as number | undefined,
    createdAt: (row.created_at as Date).toISOString(),
    completedAt: (row.completed_at as Date | null)?.toISOString(),
  };
}
