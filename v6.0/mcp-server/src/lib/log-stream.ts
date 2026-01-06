/**
 * CodeB v6.0 - Real-time Log Streaming
 *
 * Features:
 * - Server-Sent Events (SSE) for real-time logs
 * - Container log tailing via SSH
 * - Deployment progress streaming
 * - Multi-client broadcasting
 */

import { EventEmitter } from 'events';
import { Response } from 'express';
import { execCommand } from './ssh.js';

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

export interface StreamClient {
  id: string;
  res: Response;
  filters: LogFilter;
  connectedAt: Date;
}

export interface LogFilter {
  projectName?: string;
  environment?: string;
  slot?: string;
  level?: string;
  source?: string;
}

// ============================================================================
// Log Stream Manager
// ============================================================================

class LogStreamManager extends EventEmitter {
  private clients: Map<string, StreamClient> = new Map();
  private tailProcesses: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  // Add a new SSE client
  addClient(id: string, res: Response, filters: LogFilter = {}): void {
    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send initial connection message
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId: id })}\n\n`);

    const client: StreamClient = {
      id,
      res,
      filters,
      connectedAt: new Date(),
    };

    this.clients.set(id, client);
    console.log(`[LogStream] Client connected: ${id} (total: ${this.clients.size})`);

    // Handle client disconnect
    res.on('close', () => {
      this.removeClient(id);
    });

    // Keep-alive ping every 30 seconds
    const pingInterval = setInterval(() => {
      if (this.clients.has(id)) {
        res.write(':ping\n\n');
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);
  }

  // Remove a client
  removeClient(id: string): void {
    this.clients.delete(id);
    console.log(`[LogStream] Client disconnected: ${id} (total: ${this.clients.size})`);
  }

  // Broadcast a log entry to all matching clients
  broadcast(entry: LogEntry): void {
    const message = JSON.stringify(entry);

    for (const [id, client] of this.clients) {
      if (this.matchesFilter(entry, client.filters)) {
        try {
          client.res.write(`event: log\ndata: ${message}\n\n`);
        } catch (error) {
          console.error(`[LogStream] Error sending to client ${id}:`, error);
          this.removeClient(id);
        }
      }
    }
  }

  // Check if log entry matches client filters
  private matchesFilter(entry: LogEntry, filters: LogFilter): boolean {
    if (filters.projectName && entry.projectName !== filters.projectName) {
      return false;
    }
    if (filters.environment && entry.environment !== filters.environment) {
      return false;
    }
    if (filters.slot && entry.slot !== filters.slot) {
      return false;
    }
    if (filters.level && entry.level !== filters.level) {
      return false;
    }
    if (filters.source && entry.source !== filters.source) {
      return false;
    }
    return true;
  }

  // Send deployment step update
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
    }
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
          client.res.write(`event: deployment\ndata: ${message}\n\n`);
        } catch (error) {
          // Client disconnected
        }
      }
    }
  }

  // Get connected clients count
  getClientCount(): number {
    return this.clients.size;
  }

  // Get client info
  getClients(): { id: string; filters: LogFilter; connectedAt: Date }[] {
    return Array.from(this.clients.values()).map(c => ({
      id: c.id,
      filters: c.filters,
      connectedAt: c.connectedAt,
    }));
  }
}

// Singleton instance
export const logStream = new LogStreamManager();

// ============================================================================
// Container Log Tailing
// ============================================================================

export interface TailOptions {
  projectName: string;
  environment: string;
  slot?: string;
  lines?: number;
  follow?: boolean;
}

export async function tailContainerLogs(
  options: TailOptions,
  callback: (entry: LogEntry) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const { projectName, environment, slot = 'blue', lines = 100, follow = true } = options;
  const containerName = `${projectName}-${environment}-${slot}`;

  const followFlag = follow ? '-f' : '';
  const command = `podman logs ${followFlag} --tail ${lines} ${containerName} 2>&1`;

  try {
    // For non-follow mode, execute and return
    if (!follow) {
      const result = await execCommand('app', command);
      const logs = parseContainerLogs(result.stdout, projectName, environment, slot);
      logs.forEach(callback);
      return;
    }

    // For follow mode, we need to stream
    // This is a simplified version - real implementation would use SSH streams
    const pollInterval = setInterval(async () => {
      if (abortSignal?.aborted) {
        clearInterval(pollInterval);
        return;
      }

      try {
        const result = await execCommand('app', `podman logs --tail 10 ${containerName} 2>&1`);
        const logs = parseContainerLogs(result.stdout, projectName, environment, slot);
        logs.forEach(callback);
      } catch (error) {
        // Container might not exist yet
      }
    }, 1000);

    // Cleanup on abort
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

function parseContainerLogs(
  stdout: string,
  projectName: string,
  environment: string,
  slot: string
): LogEntry[] {
  const lines = stdout.split('\n').filter(line => line.trim());
  const entries: LogEntry[] = [];

  for (const line of lines) {
    // Try to parse JSON logs (common in Node.js apps)
    try {
      const parsed = JSON.parse(line);
      entries.push({
        timestamp: parsed.timestamp || parsed.time || new Date().toISOString(),
        level: mapLevel(parsed.level || parsed.severity || 'info'),
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
        level: detectLevel(line),
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

function mapLevel(level: string): 'info' | 'warn' | 'error' | 'debug' {
  const normalized = level.toLowerCase();
  if (['error', 'err', 'fatal', 'crit'].includes(normalized)) return 'error';
  if (['warn', 'warning'].includes(normalized)) return 'warn';
  if (['debug', 'trace', 'verbose'].includes(normalized)) return 'debug';
  return 'info';
}

function detectLevel(line: string): 'info' | 'warn' | 'error' | 'debug' {
  const lower = line.toLowerCase();
  if (lower.includes('error') || lower.includes('failed') || lower.includes('exception')) {
    return 'error';
  }
  if (lower.includes('warn')) return 'warn';
  if (lower.includes('debug')) return 'debug';
  return 'info';
}

// ============================================================================
// Build Log Streaming
// ============================================================================

export interface BuildLogEntry {
  timestamp: string;
  step: string;
  output: string;
  isError: boolean;
}

export function parseBuildOutput(output: string): BuildLogEntry[] {
  const entries: BuildLogEntry[] = [];
  const lines = output.split('\n');
  let currentStep = 'build';

  for (const line of lines) {
    if (!line.trim()) continue;

    // Detect Docker/Podman build steps
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

// ============================================================================
// Utility: Create log entry helper
// ============================================================================

export function createLogEntry(
  level: 'info' | 'warn' | 'error' | 'debug',
  source: string,
  message: string,
  extra?: {
    projectName?: string;
    environment?: string;
    slot?: string;
    metadata?: Record<string, unknown>;
  }
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    ...extra,
  };
}
