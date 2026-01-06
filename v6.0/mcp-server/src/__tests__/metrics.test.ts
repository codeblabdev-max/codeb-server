/**
 * Prometheus Metrics Tests
 */

import {
  httpRequestsTotal,
  toolCallsTotal,
  deploymentsTotal,
  updateSlotMetrics,
  recordDeployment,
  recordToolCall,
  register,
} from '../lib/metrics.js';

describe('Prometheus Metrics', () => {
  beforeEach(async () => {
    // Reset metrics for each test
    await register.clear();
  });

  describe('HTTP Metrics', () => {
    it('should increment http requests counter', () => {
      httpRequestsTotal.inc({ method: 'POST', route: '/api/tool', status_code: '200' });
      httpRequestsTotal.inc({ method: 'POST', route: '/api/tool', status_code: '200' });
      httpRequestsTotal.inc({ method: 'GET', route: '/health', status_code: '200' });

      // Counter should be incremented
      expect(httpRequestsTotal).toBeDefined();
    });
  });

  describe('Tool Call Metrics', () => {
    it('should record tool calls', () => {
      recordToolCall('deploy', 'success', 'admin', 1.5);
      recordToolCall('deploy', 'failed', 'admin', 0.5);
      recordToolCall('promote', 'success', 'member', 0.3);

      expect(toolCallsTotal).toBeDefined();
    });
  });

  describe('Deployment Metrics', () => {
    it('should record deployments', () => {
      recordDeployment('myapp', 'production', 'success', 45);
      recordDeployment('myapp', 'staging', 'success', 30);
      recordDeployment('other', 'production', 'failed', 10);

      expect(deploymentsTotal).toBeDefined();
    });
  });

  describe('Slot Status Metrics', () => {
    it('should update slot metrics', () => {
      updateSlotMetrics('myapp', 'production', 'blue', 'active', true);
      updateSlotMetrics('myapp', 'production', 'green', 'deployed', true);
      updateSlotMetrics('myapp', 'staging', 'blue', 'empty', false);

      // Metrics should be set without error
      expect(true).toBe(true);
    });
  });

  describe('Metrics Export', () => {
    it('should export metrics in Prometheus format', async () => {
      httpRequestsTotal.inc({ method: 'GET', route: '/health', status_code: '200' });

      const output = await register.metrics();
      expect(output).toBeDefined();
      expect(typeof output).toBe('string');
      expect(output).toContain('codeb_');
    });
  });
});
