/**
 * CodeB v5.0 - SSH Client
 * Secure SSH connection management
 */

import { Client } from 'ssh2';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { SSHConfig, SSHResult } from './types.js';
import { SERVERS } from './servers.js';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_SSH_CONFIG: SSHConfig = {
  host: SERVERS.app.ip,
  port: 22,
  username: 'root',
  privateKeyPath: join(homedir(), '.ssh', 'id_rsa'),
};

// ============================================================================
// SSH Client Class
// ============================================================================

export class SSHClientWrapper {
  private client: Client;
  private config: SSHConfig;
  private connected: boolean = false;

  constructor(config: Partial<SSHConfig> = {}) {
    this.client = new Client();
    this.config = { ...DEFAULT_SSH_CONFIG, ...config };
  }

  /**
   * Connect to SSH server
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      const connectionConfig: Record<string, unknown> = {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
      };

      // Load private key
      if (this.config.privateKeyPath && existsSync(this.config.privateKeyPath)) {
        connectionConfig.privateKey = readFileSync(this.config.privateKeyPath);
      } else {
        reject(new Error(`SSH private key not found: ${this.config.privateKeyPath}`));
        return;
      }

      this.client
        .on('ready', () => {
          this.connected = true;
          resolve();
        })
        .on('error', (err) => {
          reject(err);
        })
        .connect(connectionConfig);
    });
  }

  /**
   * Execute command on remote server
   */
  async exec(
    command: string,
    options: { timeout?: number } = {}
  ): Promise<SSHResult> {
    const { timeout = 60000 } = options;
    const startTime = Date.now();

    if (!this.connected) {
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

      this.client.exec(command, (err, stream) => {
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
   */
  async writeFile(remotePath: string, content: string): Promise<void> {
    // Escape content for shell
    const escapedContent = content
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "'\\''");

    await this.exec(`cat > ${remotePath} << 'CODEB_EOF'\n${content}\nCODEB_EOF`);
  }

  /**
   * Read file from remote server
   */
  async readFile(remotePath: string): Promise<string> {
    const result = await this.exec(`cat ${remotePath}`);
    return result.stdout;
  }

  /**
   * Check if file exists
   */
  async fileExists(remotePath: string): Promise<boolean> {
    const result = await this.exec(`test -f ${remotePath} && echo "yes" || echo "no"`);
    return result.stdout.trim() === 'yes';
  }

  /**
   * Create directory recursively
   */
  async mkdir(remotePath: string): Promise<void> {
    await this.exec(`mkdir -p ${remotePath}`);
  }

  /**
   * Disconnect from SSH server
   */
  disconnect(): void {
    if (this.connected) {
      this.client.end();
      this.connected = false;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Get SSH client instance
 * @param host - Optional host override (default: App server)
 */
export function getSSHClient(host?: string): SSHClientWrapper {
  const config: Partial<SSHConfig> = {};

  if (host) {
    config.host = host;
  }

  return new SSHClientWrapper(config);
}

/**
 * Get SSH client for specific server
 */
export function getSSHClientForServer(
  serverRole: 'app' | 'streaming' | 'storage' | 'backup'
): SSHClientWrapper {
  const server = SERVERS[serverRole];
  return new SSHClientWrapper({ host: server.ip });
}
