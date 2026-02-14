/**
 * @codeb/ssh - SSH Connection Pool
 * Based on mcp-server/src/lib/ssh.ts SSHConnectionPool
 */

import { Client } from 'ssh2';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SSHConfig } from '@codeb/shared';
import { SERVERS } from '@codeb/shared';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_SSH_CONFIG: SSHConfig = {
  host: SERVERS.app.ip,
  port: 22,
  username: 'root',
  privateKeyPath: process.env.SSH_PRIVATE_KEY_PATH || join(homedir(), '.ssh', 'id_rsa'),
};

const POOL_CONFIG = {
  maxConnections: 5,
  idleTimeout: 60000,      // 1 minute
  connectionTimeout: 30000, // 30 seconds
};

// ============================================================================
// Types
// ============================================================================

interface PooledConnection {
  client: Client;
  host: string;
  createdAt: number;
  lastUsedAt: number;
  inUse: boolean;
}

// ============================================================================
// Connection Pool (Singleton)
// ============================================================================

export class SSHConnectionPool {
  private static instance: SSHConnectionPool;
  private connections: Map<string, PooledConnection[]> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
  }

  static getInstance(): SSHConnectionPool {
    if (!SSHConnectionPool.instance) {
      SSHConnectionPool.instance = new SSHConnectionPool();
    }
    return SSHConnectionPool.instance;
  }

  async acquire(host: string, config?: Partial<SSHConfig>): Promise<Client> {
    const pool = this.connections.get(host) || [];

    // Find available connection
    const available = pool.find(c => !c.inUse && this.isConnectionAlive(c.client));
    if (available) {
      available.inUse = true;
      available.lastUsedAt = Date.now();
      return available.client;
    }

    // Create new connection if under limit
    if (pool.length < POOL_CONFIG.maxConnections) {
      const client = await this.createConnection(host, config);
      const pooled: PooledConnection = {
        client,
        host,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        inUse: true,
      };
      pool.push(pooled);
      this.connections.set(host, pool);
      return client;
    }

    // Wait for available connection
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const conn = pool.find(c => !c.inUse);
        if (conn) {
          clearInterval(checkInterval);
          conn.inUse = true;
          conn.lastUsedAt = Date.now();
          resolve(conn.client);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('SSH connection pool exhausted'));
      }, POOL_CONFIG.connectionTimeout);
    });
  }

  release(host: string, client: Client): void {
    const pool = this.connections.get(host) || [];
    const connection = pool.find(c => c.client === client);
    if (connection) {
      connection.inUse = false;
      connection.lastUsedAt = Date.now();
    }
  }

  private async createConnection(host: string, config?: Partial<SSHConfig>): Promise<Client> {
    const fullConfig = { ...DEFAULT_SSH_CONFIG, ...config, host };

    return new Promise((resolve, reject) => {
      const client = new Client();

      const connectionConfig: Record<string, unknown> = {
        host: fullConfig.host,
        port: fullConfig.port,
        username: fullConfig.username,
        readyTimeout: POOL_CONFIG.connectionTimeout,
      };

      // Load private key
      if (fullConfig.privateKeyPath && existsSync(fullConfig.privateKeyPath)) {
        connectionConfig.privateKey = readFileSync(fullConfig.privateKeyPath);
      } else {
        reject(new Error(`SSH private key not found: ${fullConfig.privateKeyPath}`));
        return;
      }

      client
        .on('ready', () => resolve(client))
        .on('error', reject)
        .connect(connectionConfig);
    });
  }

  private isConnectionAlive(client: Client): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client as any;
    return client != null && c._sock != null && !c._sock.destroyed;
  }

  private cleanup(): void {
    const now = Date.now();

    for (const [host, pool] of this.connections.entries()) {
      const active = pool.filter(c => {
        if (c.inUse) return true;

        // Remove idle connections
        if (now - c.lastUsedAt > POOL_CONFIG.idleTimeout) {
          try { c.client.end(); } catch { /* ignore */ }
          return false;
        }

        // Remove dead connections
        if (!this.isConnectionAlive(c.client)) {
          try { c.client.end(); } catch { /* ignore */ }
          return false;
        }

        return true;
      });

      this.connections.set(host, active);
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    for (const pool of this.connections.values()) {
      for (const conn of pool) {
        try { conn.client.end(); } catch { /* ignore */ }
      }
    }

    this.connections.clear();
  }
}
