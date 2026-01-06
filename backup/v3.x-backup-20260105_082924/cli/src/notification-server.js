#!/usr/bin/env node

/**
 * CodeB Notification API Server
 * Integrates with SSOT Registry
 *
 * Endpoints:
 * - POST /api/v1/notify              - Send notification
 * - POST /api/v1/notify/test         - Test notification
 * - GET  /api/v1/config/notifications - Get config
 * - PUT  /api/v1/config/notifications - Update config
 * - GET  /api/v1/health/notifications - Health check
 */

const http = require('http');
const url = require('url');
const notifier = require('./notifier');

const PORT = process.env.NOTIFIER_PORT || 7778;
const HOST = process.env.NOTIFIER_HOST || '0.0.0.0';

class NotificationServer {
  constructor() {
    this.server = null;
  }

  /**
   * Start the server
   */
  async start() {
    await notifier.initialize();

    this.server = http.createServer(this.handleRequest.bind(this));

    this.server.listen(PORT, HOST, () => {
      console.log(`[Notification Server] Running on http://${HOST}:${PORT}`);
      console.log('[Notification Server] API Version: v1');
      console.log('[Notification Server] OpenAPI Spec: docs/API_NOTIFICATION_SPEC.yaml');
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  /**
   * Handle incoming HTTP requests
   */
  async handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    console.log(`[${method}] ${pathname}`);

    try {
      // Route handling
      if (pathname === '/api/v1/notify' && method === 'POST') {
        await this.handleNotify(req, res);
      } else if (pathname === '/api/v1/notify/test' && method === 'POST') {
        await this.handleTest(req, res);
      } else if (pathname === '/api/v1/config/notifications' && method === 'GET') {
        await this.handleGetConfig(req, res);
      } else if (pathname === '/api/v1/config/notifications' && method === 'PUT') {
        await this.handleUpdateConfig(req, res);
      } else if (pathname === '/api/v1/health/notifications' && method === 'GET') {
        await this.handleHealth(req, res);
      } else if (pathname === '/health' && method === 'GET') {
        this.sendJson(res, 200, { status: 'ok' });
      } else {
        this.sendError(res, 404, 'NOT_FOUND', 'Endpoint not found');
      }
    } catch (error) {
      console.error('[Server Error]', error);
      this.sendError(res, 500, 'INTERNAL_ERROR', error.message);
    }
  }

  /**
   * Handle POST /api/v1/notify
   */
  async handleNotify(req, res) {
    const body = await this.parseBody(req);

    // Validate required fields
    if (!body.event) {
      return this.sendError(res, 400, 'MISSING_FIELD', 'Field "event" is required');
    }

    try {
      const result = await notifier.notify(body);
      this.sendJson(res, 200, result);
    } catch (error) {
      this.sendError(res, 400, 'NOTIFICATION_FAILED', error.message);
    }
  }

  /**
   * Handle POST /api/v1/notify/test
   */
  async handleTest(req, res) {
    const body = await this.parseBody(req);
    const channel = body.channel || 'all';
    const message = body.message || 'This is a test notification from CodeB';

    try {
      const result = await notifier.test(channel, message);
      this.sendJson(res, 200, result);
    } catch (error) {
      this.sendError(res, 400, 'TEST_FAILED', error.message);
    }
  }

  /**
   * Handle GET /api/v1/config/notifications
   */
  async handleGetConfig(req, res) {
    const config = notifier.getConfig(true); // Mask sensitive data
    this.sendJson(res, 200, config);
  }

  /**
   * Handle PUT /api/v1/config/notifications
   */
  async handleUpdateConfig(req, res) {
    const body = await this.parseBody(req);

    try {
      const result = await notifier.updateConfig(body);
      this.sendJson(res, 200, result);
    } catch (error) {
      this.sendError(res, 400, 'UPDATE_FAILED', error.message);
    }
  }

  /**
   * Handle GET /api/v1/health/notifications
   */
  async handleHealth(req, res) {
    const health = await notifier.health();
    this.sendJson(res, 200, health);
  }

  /**
   * Parse request body
   */
  parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';

      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve(parsed);
        } catch (error) {
          reject(new Error('Invalid JSON'));
        }
      });

      req.on('error', reject);
    });
  }

  /**
   * Send JSON response
   */
  sendJson(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Send error response
   */
  sendError(res, statusCode, code, message) {
    this.sendJson(res, statusCode, {
      success: false,
      error: {
        code,
        message,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('[Notification Server] Shutting down...');

    if (this.server) {
      this.server.close(() => {
        console.log('[Notification Server] Server closed');
        process.exit(0);
      });

      // Force close after 5 seconds
      setTimeout(() => {
        console.log('[Notification Server] Forcing shutdown');
        process.exit(1);
      }, 5000);
    }
  }
}

// Start server
if (require.main === module) {
  const server = new NotificationServer();
  server.start().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = NotificationServer;
