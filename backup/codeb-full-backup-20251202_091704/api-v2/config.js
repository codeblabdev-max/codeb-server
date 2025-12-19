/**
 * CodeB API Server v2 Configuration
 * Centralized configuration for port ranges, paths, and system settings
 */

module.exports = {
  // Server configuration
  server: {
    port: process.env.PORT || 3020,
    host: '0.0.0.0',
    environment: process.env.NODE_ENV || 'production'
  },

  // Port allocation ranges
  ports: {
    app: {
      start: 3000,
      max: 1000,      // 3000-3999
      name: 'Application'
    },
    postgres: {
      start: 5432,
      max: 100,       // 5432-5531
      name: 'PostgreSQL'
    },
    mysql: {
      start: 3306,
      max: 100,       // 3306-3405
      name: 'MySQL'
    },
    redis: {
      start: 6379,
      max: 100,       // 6379-6478
      name: 'Redis'
    },
    memcached: {
      start: 11211,
      max: 50,        // 11211-11260
      name: 'Memcached'
    }
  },

  // Project paths
  paths: {
    projects: '/opt/projects',
    backups: '/opt/codeb-backups',
    registry: '/opt/codeb/registry.json',
    templates: '/opt/codeb/templates'
  },

  // Podman configuration
  podman: {
    network: 'codeb-network',
    socketPath: '/run/podman/podman.sock',
    images: {
      postgres: 'docker.io/library/postgres:15-alpine',
      mysql: 'docker.io/library/mysql:8.0',
      redis: 'docker.io/library/redis:7-alpine',
      memcached: 'docker.io/library/memcached:1.6-alpine'
    }
  },

  // PM2 configuration
  pm2: {
    ecosystem: '/opt/codeb/ecosystem.config.js',
    maxRestarts: 10,
    minUptime: '10s',
    autorestart: true,
    watch: false
  },

  // PowerDNS configuration
  powerdns: {
    apiUrl: process.env.PDNS_API_URL || 'http://localhost:8081/api/v1',
    apiKey: process.env.PDNS_API_KEY || '',
    zone: process.env.PDNS_ZONE || 'your-domain.com',
    serverIp: '141.164.60.51',
    ttl: 3600
  },

  // Database defaults
  database: {
    postgres: {
      user: 'dbuser',
      passwordLength: 32,
      database: 'app_db',
      version: '15'
    },
    mysql: {
      user: 'dbuser',
      passwordLength: 32,
      database: 'app_db',
      rootPasswordLength: 32,
      version: '8.0'
    }
  },

  // Security
  security: {
    saltRounds: 10,
    tokenExpiry: '30d',
    allowedOrigins: ['*']
  },

  // Deployment
  deployment: {
    healthCheckRetries: 3,
    healthCheckInterval: 5000,
    buildTimeout: 600000,      // 10 minutes
    deployTimeout: 300000       // 5 minutes
  }
};
