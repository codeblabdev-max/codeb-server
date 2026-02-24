/**
 * @codeb/shared - Server & Infrastructure Types
 * Based on mcp-server/src/lib/types.ts + servers.ts
 */

// ============================================================================
// Server Configuration
// ============================================================================

export interface ServerConfig {
  name: string;
  ip: string;
  domain: string;
  role: 'app' | 'streaming' | 'storage' | 'backup';
  services: string[];
  ports: Record<string, number>;
}

// ============================================================================
// SSH Types
// ============================================================================

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string;
}

export interface SSHResult {
  stdout: string;
  stderr: string;
  code: number;
  duration: number;
}

// ============================================================================
// API Types
// ============================================================================

export interface APIRequest {
  tool: string;
  params: Record<string, unknown>;
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

// ============================================================================
// Audit Log Types
// ============================================================================

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  teamId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ip: string;
  userAgent: string;
  duration: number;
  success: boolean;
  error?: string;
}
