/**
 * LogStreamService - Real-time log streaming (framework-agnostic)
 *
 * SSE-based log broadcasting, container log tailing via SSH,
 * and deployment step streaming.
 *
 * Refactored from mcp-server/src/lib/log-stream.ts
 * - Removed Express Response dependency (now uses a generic WritableClient interface)
 * - Class-based with dependency injection
 */

import { EventEmitter } from 'node:events';
import type { SSHClientWrapper } from '@codeb/ssh';

interface LoggerLike {
  debug(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Types
// ============================================================================

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
  projectName?: string;
  environment?: string;
  slot?: string;
  metadata?: Record<string, unknown>;
}

export interface LogFilter {
  projectName?: string;
  environment?: string;
  slot?: string;
  level?: string;
  source?: string;
}

/**
 * Generic writable client interface.
 * Any SSE transport (Express Response, Fastify Reply, Node http.ServerResponse)
 * can implement this minimal contract.
 */
export interface WritableClient {
  write(data: string): boolean;
  on(event: 'close', listener: () => void): void;
}

export interface StreamClient {
  id: string;
  writer: WritableClient;
  filters: LogFilter;
  connectedAt: Date;
}

export interface TailOptions {
  projectName: string;
  environment: string;
  slot?: string;
  lines?: number;
  follow?: boolean;
}

export interface BuildLogEntry {
  timestamp: string;
  step: string;
  output: string;
  isError: boolean;
}

// ============================================================================
// Service
// ============================================================================

export class LogStreamService extends EventEmitter {
  private clients: Map<string, StreamClient> = new Map();
  private pingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(
    private readonly ssh: SSHClientWrapper,
    private readonly logger: LoggerLike,
  ) {
    super();
    this.setMaxListeners(100);
  }

  // ---------------------------------------------------------------------------
  // Client management
  // ---------------------------------------------------------------------------

  /**
   * Register a new SSE client.
   * The caller is responsible for setting SSE headers on the transport
   * before invoking this method.
   */
  addClient(id: string, writer: WritableClient, filters: LogFilter = {}): void {
    // Send initial connection event
    writer.write(`event: connected\ndata: ${JSON.stringify({ clientId: id })}\n\n`);

    const client: StreamClient = { id, writer, filters, connectedAt: new Date() };
    this.clients.set(id, client);

    this.logger.debug('Log stream client connected', { clientId: id, total: this.clients.size });

    // Handle disconnect
    writer.on('close', () => {
      this.removeClient(id);
    });

    // Keep-alive ping every 30s
    const ping = setInterval(() => {
      if (this.clients.has(id)) {
        writer.write(':ping\n\n');
      } else {
        clearInterval(ping);
      }
    }, 30_000);

    this.pingIntervals.set(id, ping);
  }

  removeClient(id: string): void {
    this.clients.delete(id);
    const ping = this.pingIntervals.get(id);
    if (ping) {
      clearInterval(ping);
      this.pingIntervals.delete(id);
    }
    this.logger.debug('Log stream client disconnected', { clientId: id, total: this.clients.size });
  }

  // ---------------------------------------------------------------------------
  // Broadcasting
  // ---------------------------------------------------------------------------

  /** Broadcast a log entry to all matching clients */
  broadcast(entry: LogEntry): void {
    const message = JSON.stringify(entry);

    for (const [id, client] of this.clients) {
      if (this.matchesFilter(entry, client.filters)) {
        try {
          client.writer.write(`event: log\ndata: ${message}\n\n`);
        } catch {
          this.removeClient(id);
        }
      }
    }
  }

  /** Send a deployment step update to matching clients */
  sendDeploymentStep(
    projectName: string,
    environment: string,
    slot: string,
    step: {
      name: string;
      status: 'pending' | 'running' | 'success' | 'failed';
      output?: string;
      error?: string;
      duration?: number;
    },
  ): void {
    const message = JSON.stringify({
      type: 'deployment_step',
      projectName,
      environment,
      slot,
      step,
      timestamp: new Date().toISOString(),
    });

    for (const [, client] of this.clients) {
      if (
        (!client.filters.projectName || client.filters.projectName === projectName) &&
        (!client.filters.environment || client.filters.environment === environment)
      ) {
        try {
          client.writer.write(`event: deployment\ndata: ${message}\n\n`);
        } catch {
          // Client disconnected; will be cleaned up on next broadcast
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Container log tailing
  // ---------------------------------------------------------------------------

  async tailContainerLogs(
    options: TailOptions,
    callback: (entry: LogEntry) => void,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const { projectName, environment, slot = 'blue', lines = 100, follow = true } = options;
    const containerName = `${projectName}-${environment}-${slot}`;

    const followFlag = follow ? '-f' : '';
    const command = `docker logs ${followFlag} --tail ${lines} ${containerName} 2>&1`;

    try {
      if (!follow) {
        // One-shot: execute and return
        const result = await this.ssh.exec(command);
        const logs = LogStreamService.parseContainerLogs(result.stdout, projectName, environment, slot);
        logs.forEach(callback);
        return;
      }

      // Follow mode: poll every second
      const pollInterval = setInterval(async () => {
        if (abortSignal?.aborted) {
          clearInterval(pollInterval);
          return;
        }

        try {
          const result = await this.ssh.exec(
            `docker logs --tail 10 ${containerName} 2>&1`,
          );
          const logs = LogStreamService.parseContainerLogs(result.stdout, projectName, environment, slot);
          logs.forEach(callback);
        } catch {
          // Container might not exist yet
        }
      }, 1_000);

      abortSignal?.addEventListener('abort', () => {
        clearInterval(pollInterval);
      });
    } catch (error) {
      callback({
        timestamp: new Date().toISOString(),
        level: 'error',
        source: 'container',
        message: `Failed to tail logs: ${error instanceof Error ? error.message : String(error)}`,
        projectName,
        environment,
        slot,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getClientCount(): number {
    return this.clients.size;
  }

  getClients(): Array<{ id: string; filters: LogFilter; connectedAt: Date }> {
    return Array.from(this.clients.values()).map((c) => ({
      id: c.id,
      filters: c.filters,
      connectedAt: c.connectedAt,
    }));
  }

  // ---------------------------------------------------------------------------
  // Static helpers
  // ---------------------------------------------------------------------------

  /** Parse raw container log output into structured entries */
  static parseContainerLogs(
    stdout: string,
    projectName: string,
    environment: string,
    slot: string,
  ): LogEntry[] {
    const lines = stdout.split('\n').filter((line) => line.trim());
    const entries: LogEntry[] = [];

    for (const line of lines) {
      try {
        // Try JSON log format (common in Node.js apps)
        const parsed = JSON.parse(line);
        entries.push({
          timestamp: parsed.timestamp || parsed.time || new Date().toISOString(),
          level: LogStreamService.mapLevel(parsed.level || parsed.severity || 'info'),
          source: 'container',
          message: parsed.msg || parsed.message || line,
          projectName,
          environment,
          slot,
          metadata: parsed,
        });
      } catch {
        // Plain text log
        entries.push({
          timestamp: new Date().toISOString(),
          level: LogStreamService.detectLevel(line),
          source: 'container',
          message: line,
          projectName,
          environment,
          slot,
        });
      }
    }

    return entries;
  }

  /** Parse Docker/Podman build output into structured entries */
  static parseBuildOutput(output: string): BuildLogEntry[] {
    const entries: BuildLogEntry[] = [];
    const lines = output.split('\n');
    let currentStep = 'build';

    for (const line of lines) {
      if (!line.trim()) continue;

      const stepMatch = line.match(/^Step (\d+)\/(\d+)\s*:\s*(.+)/i);
      if (stepMatch) {
        currentStep = stepMatch[3].split(' ')[0];
      }

      entries.push({
        timestamp: new Date().toISOString(),
        step: currentStep,
        output: line,
        isError: line.toLowerCase().includes('error') || line.startsWith('Error:'),
      });
    }

    return entries;
  }

  /** Create a log entry helper */
  static createLogEntry(
    level: 'info' | 'warn' | 'error' | 'debug',
    source: string,
    message: string,
    extra?: {
      projectName?: string;
      environment?: string;
      slot?: string;
      metadata?: Record<string, unknown>;
    },
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      ...extra,
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private matchesFilter(entry: LogEntry, filters: LogFilter): boolean {
    if (filters.projectName && entry.projectName !== filters.projectName) return false;
    if (filters.environment && entry.environment !== filters.environment) return false;
    if (filters.slot && entry.slot !== filters.slot) return false;
    if (filters.level && entry.level !== filters.level) return false;
    if (filters.source && entry.source !== filters.source) return false;
    return true;
  }

  private static mapLevel(level: string): 'info' | 'warn' | 'error' | 'debug' {
    const normalized = level.toLowerCase();
    if (['error', 'err', 'fatal', 'crit'].includes(normalized)) return 'error';
    if (['warn', 'warning'].includes(normalized)) return 'warn';
    if (['debug', 'trace', 'verbose'].includes(normalized)) return 'debug';
    return 'info';
  }

  private static detectLevel(line: string): 'info' | 'warn' | 'error' | 'debug' {
    const lower = line.toLowerCase();
    if (lower.includes('error') || lower.includes('failed') || lower.includes('exception')) return 'error';
    if (lower.includes('warn')) return 'warn';
    if (lower.includes('debug')) return 'debug';
    return 'info';
  }
}
