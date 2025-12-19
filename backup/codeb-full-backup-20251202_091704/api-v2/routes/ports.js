/**
 * Port Management Routes
 * Handles port allocation and availability
 */

const portManager = require('../lib/ports');

/**
 * Register port routes
 * @param {Express} app - Express app instance
 */
function registerRoutes(app) {
  // Get port statistics
  app.get('/ports/stats', getPortStats);

  // Allocate ports for services
  app.post('/ports/allocate', allocatePorts);

  // Check port availability
  app.get('/ports/check/:port', checkPort);
}

/**
 * Get port usage statistics
 */
async function getPortStats(req, res) {
  try {
    const stats = await portManager.getPortStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get port statistics',
      message: error.message
    });
  }
}

/**
 * Allocate ports for services
 */
async function allocatePorts(req, res) {
  try {
    const { projectName, services = ['app'] } = req.body;

    if (!projectName) {
      return res.status(400).json({
        success: false,
        error: 'Project name is required'
      });
    }

    const allocation = await portManager.allocatePorts(projectName, services);

    res.json({
      success: true,
      projectName,
      ports: allocation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to allocate ports',
      message: error.message
    });
  }
}

/**
 * Check if specific port is available
 */
async function checkPort(req, res) {
  try {
    const port = parseInt(req.params.port);

    if (isNaN(port) || port < 1 || port > 65535) {
      return res.status(400).json({
        success: false,
        error: 'Invalid port number'
      });
    }

    const available = await portManager.isPortAvailable(port);

    res.json({
      success: true,
      port,
      available
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check port',
      message: error.message
    });
  }
}

module.exports = { registerRoutes };
