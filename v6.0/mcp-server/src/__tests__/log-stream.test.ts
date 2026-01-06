/**
 * Log Streaming Tests
 */

import { createLogEntry, parseBuildOutput, LogEntry } from '../lib/log-stream.js';

describe('Log Streaming', () => {
  describe('createLogEntry', () => {
    it('should create a log entry with required fields', () => {
      const entry = createLogEntry('info', 'test', 'Test message');

      expect(entry.timestamp).toBeDefined();
      expect(entry.level).toBe('info');
      expect(entry.source).toBe('test');
      expect(entry.message).toBe('Test message');
    });

    it('should include optional project info', () => {
      const entry = createLogEntry('error', 'api', 'Deployment failed', {
        projectName: 'myapp',
        environment: 'production',
        slot: 'green',
      });

      expect(entry.projectName).toBe('myapp');
      expect(entry.environment).toBe('production');
      expect(entry.slot).toBe('green');
    });

    it('should include metadata', () => {
      const entry = createLogEntry('debug', 'ssh', 'Command executed', {
        metadata: { command: 'podman ps', duration: 150 },
      });

      expect(entry.metadata).toEqual({ command: 'podman ps', duration: 150 });
    });

    it('should set correct timestamp format', () => {
      const entry = createLogEntry('warn', 'system', 'Warning message');

      // Should be ISO format
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('parseBuildOutput', () => {
    it('should parse Docker build output', () => {
      const output = `Step 1/5 : FROM node:20-alpine
Step 2/5 : WORKDIR /app
COPY package*.json ./
Step 3/5 : RUN npm install
npm WARN deprecated package@1.0.0
Step 4/5 : COPY . .
Step 5/5 : CMD ["node", "server.js"]`;

      const entries = parseBuildOutput(output);

      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].step).toBeDefined();
    });

    it('should detect error lines', () => {
      const output = `Step 1/3 : FROM node:20
Step 2/3 : RUN npm install
Error: Cannot find module 'express'`;

      const entries = parseBuildOutput(output);

      const errorEntry = entries.find(e => e.isError);
      expect(errorEntry).toBeDefined();
      expect(errorEntry?.output).toContain('Error');
    });

    it('should handle empty output', () => {
      const entries = parseBuildOutput('');
      expect(entries).toEqual([]);
    });

    it('should assign timestamps to all entries', () => {
      const output = `Line 1
Line 2
Line 3`;

      const entries = parseBuildOutput(output);

      entries.forEach(entry => {
        expect(entry.timestamp).toBeDefined();
      });
    });
  });
});
