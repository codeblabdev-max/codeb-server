/**
 * CodeB v6.0 - SSH Client with Connection Pool
 * Secure SSH connection management (Admin only)
 */

import { Client } from 'ssh2';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { SSHConfig, SSHResult } from './types.js';
import { SERVERS } from './servers.js';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_SSH_CONFIG: SSHConfig = {
  host: SERVERS.app.ip,
  port: 22,
  username: 'root',
  privateKeyPath: join(homedir(), '.ssh', 'id_rsa'),
};

const POOL_CONFIG = {
  maxConnections: 5,
  idleTimeout: 60000, // 1 minute
  connectionTimeout: 30000, // 30 seconds
};

// ============================================================================
// Connection Pool
// ============================================================================

interface PooledConnection {
  client: Client;
  host: string;
  createdAt: number;
  lastUsedAt: number;
  inUse: boolean;
}

class SSHConnectionPool {
  private static instance: SSHConnectionPool;
  private connections: Map<string, PooledConnection[]> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Start cleanup interval
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
        const available = pool.find(c => !c.inUse);
        if (available) {
          clearInterval(checkInterval);
          available.inUse = true;
          available.lastUsedAt = Date.now();
          resolve(available.client);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Connection pool exhausted'));
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
    // Check if client is still connected
    return client && (client as any)._sock && !(client as any)._sock.destroyed;
  }

  private cleanup(): void {
    const now = Date.now();

    for (const [host, pool] of this.connections.entries()) {
      const active = pool.filter(c => {
        if (c.inUse) return true;

        // Remove idle connections
        if (now - c.lastUsedAt > POOL_CONFIG.idleTimeout) {
          try {
            c.client.end();
          } catch {}
          return false;
        }

        // Remove dead connections
        if (!this.isConnectionAlive(c.client)) {
          try {
            c.client.end();
          } catch {}
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
        try {
          conn.client.end();
        } catch {}
      }
    }

    this.connections.clear();
  }
}

// ============================================================================
// SSH Client Wrapper
// ============================================================================

export class SSHClientWrapper {
  private pool: SSHConnectionPool;
  private host: string;
  private client: Client | null = null;

  constructor(host: string = SERVERS.app.ip) {
    this.pool = SSHConnectionPool.getInstance();
    this.host = host;
  }

  async connect(): Promise<void> {
    if (this.client) return;
    this.client = await this.pool.acquire(this.host);
  }

  disconnect(): void {
    if (this.client) {
      this.pool.release(this.host, this.client);
      this.client = null;
    }
  }

  async exec(command: string, options: { timeout?: number } = {}): Promise<SSHResult> {
    const { timeout = 60000 } = options;
    const startTime = Date.now();

    if (!this.client) {
      throw new Error('SSH not connected. Call connect() first.');
    }

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let timeoutId: NodeJS.Timeout;

      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          reject(new Error(`Command timed out after ${timeout}ms`));
        }, timeout);
      }

      this.client!.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeoutId);
          reject(err);
          return;
        }

        stream
          .on('close', (code: number) => {
            clearTimeout(timeoutId);
            resolve({
              stdout,
              stderr,
              code,
              duration: Date.now() - startTime,
            });
          })
          .on('data', (data: Buffer) => {
            stdout += data.toString();
          })
          .stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
      });
    });
  }

  /**
   * Write file to remote server
   * FIXED: Uses escapedContent properly
   */
  async writeFile(remotePath: string, content: string): Promise<void> {
    // Validate path to prevent traversal
    if (!this.validatePath(remotePath)) {
      throw new Error(`Invalid path: ${remotePath}`);
    }

    // Escape content for heredoc - FIXED: Actually use the escaped content
    const escapedContent = content
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "'\\''")
      .replace(/\$/g, '\\$');

    await this.exec(`cat > ${remotePath} << 'CODEB_EOF'\n${escapedContent}\nCODEB_EOF`);
  }

  async readFile(remotePath: string): Promise<string> {
    if (!this.validatePath(remotePath)) {
      throw new Error(`Invalid path: ${remotePath}`);
    }

    const result = await this.exec(`cat ${remotePath}`);
    return result.stdout;
  }

  async fileExists(remotePath: string): Promise<boolean> {
    if (!this.validatePath(remotePath)) {
      return false;
    }

    const result = await this.exec(`test -f ${remotePath} && echo "yes" || echo "no"`);
    return result.stdout.trim() === 'yes';
  }

  async mkdir(remotePath: string): Promise<void> {
    if (!this.validatePath(remotePath)) {
      throw new Error(`Invalid path: ${remotePath}`);
    }

    await this.exec(`mkdir -p ${remotePath}`);
  }

  /**
   * Validate path to prevent directory traversal
   */
  private validatePath(path: string): boolean {
    // Must be absolute path
    if (!path.startsWith('/')) return false;

    // No traversal
    if (path.includes('..')) return false;

    // Only allow specific base paths
    const allowedPaths = [
      '/opt/codeb/',
      '/etc/caddy/',
      '/var/log/',
      '/tmp/',
    ];

    return allowedPaths.some(base => path.startsWith(base));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function getSSHClient(host?: string): SSHClientWrapper {
  return new SSHClientWrapper(host || SERVERS.app.ip);
}

export function getSSHClientForServer(
  serverRole: 'app' | 'streaming' | 'storage' | 'backup'
): SSHClientWrapper {
  return new SSHClientWrapper(SERVERS[serverRole].ip);
}

/**
 * Execute with automatic connection management
 */
export async function withSSH<T>(
  host: string,
  fn: (ssh: SSHClientWrapper) => Promise<T>
): Promise<T> {
  const ssh = new SSHClientWrapper(host);
  try {
    await ssh.connect();
    return await fn(ssh);
  } finally {
    ssh.disconnect();
  }
}

// ============================================================================
// Convenient exec function
// ============================================================================

/**
 * Execute a command on a server by role
 */
export async function execCommand(
  serverRole: 'app' | 'streaming' | 'storage' | 'backup',
  command: string,
  options: { timeout?: number } = {}
): Promise<SSHResult> {
  return withSSH(SERVERS[serverRole].ip, async (ssh) => {
    return ssh.exec(command, options);
  });
}

// ============================================================================
// Cleanup on exit
// ============================================================================

process.on('beforeExit', () => {
  SSHConnectionPool.getInstance().destroy();
});

process.on('SIGINT', () => {
  SSHConnectionPool.getInstance().destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  SSHConnectionPool.getInstance().destroy();
  process.exit(0);
});
