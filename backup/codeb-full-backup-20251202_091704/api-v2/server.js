#!/usr/bin/env node

/**
 * CodeB API Server v2
 * Project management and deployment orchestration API
 */

const express = require('express');
const config = require('./config');

// Route modules
const projectRoutes = require('./routes/projects');
const deployRoutes = require('./routes/deploy');
const portRoutes = require('./routes/ports');
const dnsRoutes = require('./routes/dns');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    environment: config.server.environment
  });
});

// API info
app.get('/', (req, res) => {
  res.json({
    name: 'CodeB API Server',
    version: '2.0.0',
    description: 'Project management and deployment orchestration API',
    endpoints: {
      health: 'GET /health',
      projects: {
        list: 'GET /projects',
        get: 'GET /projects/:name',
        create: 'POST /projects',
        delete: 'DELETE /projects/:name',
        status: 'GET /projects/:name/status'
      },
      deployment: {
        deploy: 'POST /projects/:name/deploy',
        start: 'POST /projects/:name/start',
        stop: 'POST /projects/:name/stop',
        restart: 'POST /projects/:name/restart',
        logs: 'GET /projects/:name/logs'
      },
      ports: {
        stats: 'GET /ports/stats',
        allocate: 'POST /ports/allocate',
        check: 'GET /ports/check/:port'
      },
      dns: {
        register: 'POST /dns/register',
        delete: 'DELETE /dns/:projectName',
        get: 'GET /dns/:projectName'
      }
    }
  });
});

// Register routes
projectRoutes.registerRoutes(app);
deployRoutes.registerRoutes(app);
portRoutes.registerRoutes(app);
dnsRoutes.registerRoutes(app);

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    path: req.path
  });
});

// Start server
async function startServer() {
  try {
    console.log('🚀 CodeB API Server v2');
    console.log('================================');

    // Check required directories
    const fs = require('fs').promises;
    try {
      await fs.access(config.paths.projects);
    } catch {
      console.log(`Creating projects directory: ${config.paths.projects}`);
      await fs.mkdir(config.paths.projects, { recursive: true });
    }

    // Start listening
    app.listen(config.server.port, config.server.host, () => {
      console.log(`✅ Server running on http://${config.server.host}:${config.server.port}`);
      console.log(`📊 Environment: ${config.server.environment}`);
      console.log(`📁 Projects path: ${config.paths.projects}`);
      console.log('\nAvailable endpoints:');
      console.log('  GET  /health');
      console.log('  GET  /projects');
      console.log('  POST /projects');
      console.log('  POST /projects/:name/deploy');
      console.log('  GET  /ports/stats');
      console.log('  POST /dns/register');
      console.log('');
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('\n⏹️  Shutting down gracefully...');
      process.exit(0);
    });

    process.on('SIGINT', () => {
      console.log('\n⏹️  Shutting down gracefully...');
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Run
if (require.main === module) {
  startServer();
}

module.exports = app;
