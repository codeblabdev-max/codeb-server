/**
 * @codeb/logger - Structured Logging
 * Based on mcp-server/src/lib/logger.ts
 *
 * Features:
 * - Structured JSON logging with Winston
 * - Log levels: error, warn, info, debug
 * - File rotation (daily, size-limited)
 * - Console output with colors (dev) or JSON (prod)
 * - Request correlation IDs
 * - Sensitive data masking
 */

import { createLogger, type Logger } from 'winston';
import { randomBytes } from 'node:crypto';
import {
  createConsoleTransport,
  createErrorFileTransport,
  createCombinedFileTransport,
  createAuditFileTransport,
  jsonFormat,
} from './transports.js';

// Re-export sanitizer
export { SENSITIVE_KEYS, maskSensitiveData } from './sanitizer.js';

// ============================================================================
// Configuration
// ============================================================================

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================================
// Logger Instance (singleton)
// ============================================================================

const logger: Logger = createLogger({
  level: LOG_LEVEL,
  format: jsonFormat,
  defaultMeta: { service: 'codeb-api' },
  transports: [createConsoleTransport()],
});

// Add file transports in production
if (NODE_ENV === 'production') {
  logger.add(createErrorFileTransport());
  logger.add(createCombinedFileTransport());
  logger.add(createAuditFileTransport());
}

// ============================================================================
// Correlation ID
// ============================================================================

export function generateCorrelationId(): string {
  return randomBytes(8).toString('hex');
}

// ============================================================================
// Contextual Logger
// ============================================================================

export interface RequestContext {
  correlationId: string;
  teamId?: string;
  keyId?: string;
  role?: string;
  ip?: string;
  userAgent?: string;
}

class ContextualLogger {
  private context: RequestContext;

  constructor(context: RequestContext) {
    this.context = context;
  }

  private log(level: string, message: string, meta?: Record<string, unknown>) {
    (logger as unknown as Record<string, (msg: string, meta?: object) => void>)[level](message, { ...this.context, ...meta });
  }

  info(message: string, meta?: Record<string, unknown>) {
    this.log('info', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>) {
    this.log('error', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.log('warn', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>) {
    this.log('debug', message, meta);
  }

  audit(action: string, meta: {
    resource?: string;
    resourceId?: string;
    success: boolean;
    duration?: number;
    params?: Record<string, unknown>;
    error?: string;
  }) {
    logger.info(`AUDIT: ${action}`, {
      ...this.context,
      action,
      ...meta,
      type: 'audit',
    });
  }

  deploy(phase: string, meta: {
    projectName: string;
    environment: string;
    slot?: string;
    version?: string;
    step?: string;
    success?: boolean;
    duration?: number;
    error?: string;
  }) {
    const level = meta.success === false ? 'error' : 'info';
    logger.log(level, `DEPLOY: ${phase}`, {
      ...this.context,
      ...meta,
      type: 'deploy',
    });
  }
}

export function createContextualLogger(context: RequestContext): ContextualLogger {
  return new ContextualLogger(context);
}

// ============================================================================
// HTTP Request Logging
// ============================================================================

export interface HttpLogMeta {
  method: string;
  url: string;
  statusCode: number;
  duration: number;
  contentLength?: number;
  userAgent?: string;
  ip?: string;
  correlationId?: string;
}

export function logHttpRequest(meta: HttpLogMeta) {
  const level = meta.statusCode >= 500 ? 'error' : meta.statusCode >= 400 ? 'warn' : 'info';
  logger.log(level, `${meta.method} ${meta.url} ${meta.statusCode}`, {
    ...meta,
    type: 'http',
  });
}

// ============================================================================
// Export
// ============================================================================

export default logger;
export { logger };
