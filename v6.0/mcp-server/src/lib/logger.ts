/**
 * CodeB v6.0 - Structured Logging with Winston
 *
 * Features:
 * - Structured JSON logging
 * - Log levels: error, warn, info, debug
 * - File rotation
 * - Console output with colors
 * - Request correlation IDs
 * - Sensitive data masking
 */

import { createLogger, format, transports, Logger } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { randomBytes } from 'crypto';

// ============================================================================
// Configuration
// ============================================================================

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_DIR = process.env.LOG_DIR || '/var/log/codeb';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================================
// Sensitive Data Masking
// ============================================================================

const SENSITIVE_KEYS = [
  'password',
  'apiKey',
  'api_key',
  'secret',
  'token',
  'authorization',
  'x-api-key',
  'database_url',
  'redis_url',
  'private_key',
];

function maskSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(maskSensitiveData);
  }

  const masked: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(k => lowerKey.includes(k))) {
      if (typeof value === 'string' && value.length > 8) {
        masked[key] = `${value.slice(0, 4)}****${value.slice(-4)}`;
      } else {
        masked[key] = '****';
      }
    } else if (typeof value === 'object') {
      masked[key] = maskSensitiveData(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

// ============================================================================
// Custom Formats
// ============================================================================

const maskFormat = format((info) => {
  if (info.params) {
    info.params = maskSensitiveData(info.params);
  }
  if (info.error && typeof info.error === 'object') {
    info.error = maskSensitiveData(info.error);
  }
  return info;
});

const contextFormat = format((info) => {
  return {
    ...info,
    service: 'codeb-api',
    version: '6.0.0',
    env: NODE_ENV,
  };
});

// ============================================================================
// Logger Instance
// ============================================================================

const consoleFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  maskFormat(),
  format.colorize(),
  format.printf(({ timestamp, level, message, correlationId, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0
      ? `\n${JSON.stringify(meta, null, 2)}`
      : '';
    const corrId = correlationId ? ` [${correlationId}]` : '';
    return `${timestamp} ${level}${corrId}: ${message}${metaStr}`;
  })
);

const jsonFormat = format.combine(
  format.timestamp(),
  contextFormat(),
  maskFormat(),
  format.json()
);

const logger: Logger = createLogger({
  level: LOG_LEVEL,
  format: jsonFormat,
  defaultMeta: { service: 'codeb-api' },
  transports: [
    // Console output
    new transports.Console({
      format: NODE_ENV === 'development' ? consoleFormat : jsonFormat,
    }),
  ],
});

// Add file transport in production
if (NODE_ENV === 'production') {
  // Error logs
  logger.add(
    new DailyRotateFile({
      filename: `${LOG_DIR}/error-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '30d',
      maxSize: '100m',
      format: jsonFormat,
    })
  );

  // Combined logs
  logger.add(
    new DailyRotateFile({
      filename: `${LOG_DIR}/combined-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      maxSize: '200m',
      format: jsonFormat,
    })
  );

  // Audit logs (long retention)
  logger.add(
    new DailyRotateFile({
      filename: `${LOG_DIR}/audit-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      maxFiles: '365d',
      maxSize: '500m',
      format: jsonFormat,
    })
  );
}

// ============================================================================
// Correlation ID
// ============================================================================

export function generateCorrelationId(): string {
  return randomBytes(8).toString('hex');
}

// ============================================================================
// Logging Helpers
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

  private log(level: string, message: string, meta?: Record<string, any>) {
    (logger as any)[level](message, { ...this.context, ...meta });
  }

  info(message: string, meta?: Record<string, any>) {
    this.log('info', message, meta);
  }

  error(message: string, meta?: Record<string, any>) {
    this.log('error', message, meta);
  }

  warn(message: string, meta?: Record<string, any>) {
    this.log('warn', message, meta);
  }

  debug(message: string, meta?: Record<string, any>) {
    this.log('debug', message, meta);
  }

  audit(action: string, meta: {
    resource?: string;
    resourceId?: string;
    success: boolean;
    duration?: number;
    params?: Record<string, any>;
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
// Middleware Helpers
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
// Metrics Helpers (Prometheus style)
// ============================================================================

interface MetricEntry {
  name: string;
  type: 'counter' | 'gauge' | 'histogram';
  value: number;
  labels: Record<string, string>;
  timestamp: Date;
}

const metricsBuffer: MetricEntry[] = [];
const MAX_METRICS_BUFFER = 1000;

export function recordMetric(
  name: string,
  type: 'counter' | 'gauge' | 'histogram',
  value: number,
  labels: Record<string, string> = {}
) {
  metricsBuffer.push({
    name,
    type,
    value,
    labels,
    timestamp: new Date(),
  });

  // Trim buffer
  if (metricsBuffer.length > MAX_METRICS_BUFFER) {
    metricsBuffer.splice(0, metricsBuffer.length - MAX_METRICS_BUFFER);
  }

  // Log at debug level
  logger.debug(`METRIC: ${name}`, { name, metricType: type, value, labels, logType: 'metric' });
}

export function getMetrics(): MetricEntry[] {
  return [...metricsBuffer];
}

// ============================================================================
// Export
// ============================================================================

export default logger;
export { logger };
