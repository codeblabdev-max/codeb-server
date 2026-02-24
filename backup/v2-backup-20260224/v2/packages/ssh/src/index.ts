/**
 * @codeb/ssh - SSH Client with Connection Pool
 * Based on mcp-server/src/lib/ssh.ts
 *
 * Features:
 * - Connection pooling (max 5 per host)
 * - Auto-cleanup of idle connections
 * - Path validation (directory traversal prevention)
 * - Timeout support
 */

import { SERVERS } from '@codeb/shared';
import type { SSHResult } from '@codeb/shared';
import { SSHConnectionPool } from './pool.js';
import { SSHClientWrapper } from './client.js';

// Re-export classes
export { SSHConnectionPool } from './pool.js';
export { SSHClientWrapper } from './client.js';

// ============================================================================
// Factory Functions
// ============================================================================

/** Get an SSH client for a specific host */
export function getSSHClient(host?: string): SSHClientWrapper {
  return new SSHClientWrapper(host || SERVERS.app.ip);
}

/** Get an SSH client for a server by role */
export function getSSHClientForServer(
  serverRole: 'app' | 'streaming' | 'storage' | 'backup',
): SSHClientWrapper {
  return new SSHClientWrapper(SERVERS[serverRole].ip);
}

/** Execute with automatic connection management */
export async function withSSH<T>(
  host: string,
  fn: (ssh: SSHClientWrapper) => Promise<T>,
): Promise<T> {
  const ssh = new SSHClientWrapper(host);
  try {
    await ssh.connect();
    return await fn(ssh);
  } finally {
    ssh.disconnect();
  }
}

/** Execute a command on a server by role */
export async function execCommand(
  serverRole: 'app' | 'streaming' | 'storage' | 'backup',
  command: string,
  options: { timeout?: number } = {},
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
