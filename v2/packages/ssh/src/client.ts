/**
 * @codeb/ssh - SSH Client Wrapper
 * Based on mcp-server/src/lib/ssh.ts SSHClientWrapper
 */

import type { Client } from 'ssh2';
import type { SSHResult } from '@codeb/shared';
import { SERVERS } from '@codeb/shared';
import { SSHConnectionPool } from './pool.js';

// ============================================================================
// Allowed Paths for Security
// ============================================================================

const ALLOWED_PATHS = [
  '/opt/codeb/',
  '/etc/caddy/',
  '/etc/containers/',
  '/var/log/',
  '/tmp/',
] as const;

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
      let timeoutId: ReturnType<typeof setTimeout>;

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
   * Write file to remote server.
   * Uses heredoc with properly escaped content.
   */
  async writeFile(remotePath: string, content: string): Promise<void> {
    if (!this.validatePath(remotePath)) {
      throw new Error(`Invalid path: ${remotePath}`);
    }

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
   * Validate path to prevent directory traversal.
   * Only allows specific base paths.
   */
  private validatePath(path: string): boolean {
    if (!path.startsWith('/')) return false;
    if (path.includes('..')) return false;
    return ALLOWED_PATHS.some(base => path.startsWith(base));
  }
}
