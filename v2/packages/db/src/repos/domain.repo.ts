/**
 * @codeb/db - Domain Repository
 * Based on mcp-server/src/lib/database.ts DomainRepo
 */

import { getPool } from '../pool.js';
import type { DomainRecord } from '@codeb/shared';

// ============================================================================
// Row Mapper
// ============================================================================

function mapDomain(row: Record<string, unknown>): DomainRecord {
  return {
    id: row.id as number,
    domain: row.domain as string,
    projectName: row.project_name as string | null,
    environment: row.environment as string,
    type: row.type as 'subdomain' | 'custom',
    sslEnabled: row.ssl_enabled as boolean,
    sslIssuer: row.ssl_issuer as string,
    dnsConfigured: row.dns_configured as boolean,
    dnsVerifiedAt: (row.dns_verified_at as Date | null)?.toISOString() ?? null,
    caddyConfigured: row.caddy_configured as boolean,
    status: row.status as DomainRecord['status'],
    createdBy: row.created_by as string | null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

// ============================================================================
// Repository
// ============================================================================

export const DomainRepo = {
  async findByProject(
    projectName: string,
    environment?: string,
  ): Promise<DomainRecord[]> {
    const db = await getPool();
    let query = 'SELECT * FROM domains WHERE project_name = $1';
    const values: unknown[] = [projectName];

    if (environment) {
      query += ' AND environment = $2';
      values.push(environment);
    }

    query += ' ORDER BY created_at DESC';
    const result = await db.query(query, values);
    return result.rows.map(mapDomain);
  },

  async findByDomain(domain: string): Promise<DomainRecord | null> {
    const db = await getPool();
    const result = await db.query(
      'SELECT * FROM domains WHERE domain = $1',
      [domain],
    );
    return result.rows[0] ? mapDomain(result.rows[0]) : null;
  },

  async create(data: {
    domain: string;
    projectName?: string;
    environment?: string;
    type?: 'subdomain' | 'custom';
    sslEnabled?: boolean;
    createdBy?: string;
  }): Promise<DomainRecord> {
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
      ],
    );
    return mapDomain(result.rows[0]);
  },

  async delete(domain: string): Promise<boolean> {
    const db = await getPool();
    const result = await db.query(
      'DELETE FROM domains WHERE domain = $1',
      [domain],
    );
    return (result.rowCount ?? 0) > 0;
  },

  async update(domain: string, data: Partial<{
    projectName: string;
    environment: string;
    sslEnabled: boolean;
    dnsConfigured: boolean;
    dnsVerifiedAt: Date;
    caddyConfigured: boolean;
    status: DomainRecord['status'];
  }>): Promise<DomainRecord | null> {
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
      values,
    );
    return result.rows[0] ? mapDomain(result.rows[0]) : null;
  },

  async listAll(): Promise<DomainRecord[]> {
    const db = await getPool();
    const result = await db.query(
      'SELECT * FROM domains ORDER BY created_at DESC',
    );
    return result.rows.map(mapDomain);
  },
};
