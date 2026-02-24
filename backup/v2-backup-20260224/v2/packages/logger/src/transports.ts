/**
 * @codeb/logger - Winston Transports
 * Console + file transports with rotation
 */

import { format, transports } from 'winston';
import type { Logform } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { maskSensitiveData } from './sanitizer.js';

// ============================================================================
// Configuration
// ============================================================================

const LOG_DIR = process.env.LOG_DIR || '/app/logs';
const NODE_ENV = process.env.NODE_ENV || 'development';

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
    version: '8.0.0',
    env: NODE_ENV,
  };
});

// ============================================================================
// Transport Factories
// ============================================================================

export const jsonFormat: ReturnType<typeof format.combine> = format.combine(
  format.timestamp(),
  contextFormat(),
  maskFormat(),
  format.json(),
);

export const consoleFormat: ReturnType<typeof format.combine> = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  maskFormat(),
  format.colorize(),
  format.printf(({ timestamp, level, message, correlationId, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0
      ? `\n${JSON.stringify(meta, null, 2)}`
      : '';
    const corrId = correlationId ? ` [${correlationId}]` : '';
    return `${timestamp} ${level}${corrId}: ${message}${metaStr}`;
  }),
);

/** Console transport (uses pretty format in dev, JSON in prod) */
export function createConsoleTransport() {
  return new transports.Console({
    format: NODE_ENV === 'development' ? consoleFormat : jsonFormat,
  });
}

/** Error file transport with daily rotation (30-day retention) */
export function createErrorFileTransport() {
  return new DailyRotateFile({
    filename: `${LOG_DIR}/error-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxFiles: '30d',
    maxSize: '100m',
    format: jsonFormat,
  });
}

/** Combined file transport with daily rotation (14-day retention) */
export function createCombinedFileTransport() {
  return new DailyRotateFile({
    filename: `${LOG_DIR}/combined-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    maxFiles: '14d',
    maxSize: '200m',
    format: jsonFormat,
  });
}

/** Audit file transport with daily rotation (365-day retention) */
export function createAuditFileTransport() {
  return new DailyRotateFile({
    filename: `${LOG_DIR}/audit-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    maxFiles: '365d',
    maxSize: '500m',
    format: jsonFormat,
  });
}
