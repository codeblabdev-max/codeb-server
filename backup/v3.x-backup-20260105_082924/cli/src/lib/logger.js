/**
 * Logger
 *
 * Deployment and operation logging
 */

import { appendFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

class Logger {
  constructor() {
    this.logDir = join(homedir(), '.codeb', 'logs');
    this.ensureLogDir();
  }

  async ensureLogDir() {
    try {
      await mkdir(this.logDir, { recursive: true });
    } catch (error) {
      // Directory already exists
    }
  }

  async logDeployment(data) {
    const logFile = join(this.logDir, 'deployments.log');
    const entry = {
      timestamp: data.timestamp,
      project: data.project,
      environment: data.environment,
      result: data.result,
      version: data.version,
      error: data.error
    };

    try {
      await appendFile(logFile, JSON.stringify(entry) + '\n', 'utf8');
    } catch (error) {
      console.error('Failed to write log:', error.message);
    }
  }

  async logOperation(operation, data) {
    const logFile = join(this.logDir, 'operations.log');
    const entry = {
      timestamp: new Date().toISOString(),
      operation: operation,
      ...data
    };

    try {
      await appendFile(logFile, JSON.stringify(entry) + '\n', 'utf8');
    } catch (error) {
      console.error('Failed to write log:', error.message);
    }
  }
}

export const logger = new Logger();
