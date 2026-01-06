#!/usr/bin/env node

/**
 * CodeB Notification System
 * API Contract: OpenAPI 3.0 - See docs/API_NOTIFICATION_SPEC.yaml
 *
 * Supports:
 * - Slack webhooks
 * - Discord webhooks
 * - Email (SMTP)
 * - Event-based triggers
 * - SSOT Registry integration
 */

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Configuration paths
const CONFIG_DIR = '/opt/codeb/config';
const CONFIG_FILE = path.join(CONFIG_DIR, 'notifications.json');
const SSOT_DIR = '/opt/codeb/ssot-registry';

// Default configuration
const DEFAULT_CONFIG = {
  enabled: true,
  channels: {
    slack: {
      enabled: false,
      webhookUrl: '',
      defaultChannel: '#deployments',
      mentionOnCritical: true,
      mentionUsers: ['@channel']
    },
    discord: {
      enabled: false,
      webhookUrl: '',
      username: 'CodeB Notifier',
      avatarUrl: 'https://codeb.dev/logo.png'
    },
    email: {
      enabled: false,
      smtp: {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: '',
          pass: ''
        }
      },
      from: 'noreply@codeb.dev',
      to: []
    }
  },
  rules: {
    'deployment.started': ['slack', 'discord'],
    'deployment.success': ['slack', 'discord'],
    'deployment.failed': ['slack', 'discord', 'email'],
    'server.down': ['slack', 'discord', 'email'],
    'healthcheck.failed': ['slack', 'discord'],
    'resource.threshold': ['slack', 'email']
  },
  thresholds: {
    disk: 85,
    memory: 90,
    cpu: 80
  }
};

class NotificationService {
  constructor() {
    this.config = null;
    this.initialized = false;
  }

  /**
   * Initialize notification service
   */
  async initialize() {
    try {
      await this.ensureConfigDir();
      await this.loadConfig();
      this.initialized = true;
      console.log('[Notifier] Initialized successfully');
    } catch (error) {
      console.error('[Notifier] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Ensure config directory exists
   */
  async ensureConfigDir() {
    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }

  /**
   * Load configuration from file
   */
  async loadConfig() {
    try {
      const data = await fs.readFile(CONFIG_FILE, 'utf8');
      this.config = JSON.parse(data);
      console.log('[Notifier] Configuration loaded');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('[Notifier] No config found, creating default');
        this.config = DEFAULT_CONFIG;
        await this.saveConfig();
      } else {
        throw error;
      }
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig() {
    await fs.writeFile(
      CONFIG_FILE,
      JSON.stringify(this.config, null, 2),
      'utf8'
    );
    console.log('[Notifier] Configuration saved');
  }

  /**
   * Get configuration (with sensitive data masked)
   */
  getConfig(maskSensitive = true) {
    if (!maskSensitive) return this.config;

    const masked = JSON.parse(JSON.stringify(this.config));

    if (masked.channels.slack.webhookUrl) {
      masked.channels.slack.webhookUrl = '***MASKED***';
    }
    if (masked.channels.discord.webhookUrl) {
      masked.channels.discord.webhookUrl = '***MASKED***';
    }
    if (masked.channels.email.smtp.auth.pass) {
      masked.channels.email.smtp.auth.pass = '***MASKED***';
    }

    return masked;
  }

  /**
   * Update configuration
   */
  async updateConfig(updates) {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
    return { success: true, message: 'Configuration updated' };
  }

  /**
   * Send notification based on event
   *
   * @param {Object} notification - Notification payload
   * @param {string} notification.event - Event type (deployment.success, server.down, etc)
   * @param {string} notification.project - Project name
   * @param {string} notification.environment - Environment (development, staging, production)
   * @param {string} notification.severity - Severity (info, warning, error, critical)
   * @param {Array} notification.channels - Override default channels
   * @param {Object} notification.data - Additional event data
   * @returns {Object} Notification result
   */
  async notify(notification) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.config.enabled) {
      return {
        success: true,
        messageId: null,
        sentTo: [],
        message: 'Notifications disabled'
      };
    }

    const {
      event,
      project = 'unknown',
      environment = 'production',
      severity = 'info',
      channels = null,
      data = {}
    } = notification;

    // Validate event type
    if (!this.isValidEvent(event)) {
      throw new Error(`Invalid event type: ${event}`);
    }

    // Determine which channels to notify
    const targetChannels = channels || this.config.rules[event] || [];

    // Generate unique message ID
    const messageId = this.generateMessageId();

    // Build notification message
    const message = this.buildMessage(event, project, environment, severity, data);

    // Send to all target channels
    const results = await Promise.all(
      targetChannels.map(channel => this.sendToChannel(channel, message, severity))
    );

    return {
      success: true,
      messageId,
      sentTo: results,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate event type
   */
  isValidEvent(event) {
    const validEvents = [
      'deployment.started',
      'deployment.success',
      'deployment.failed',
      'server.up',
      'server.down',
      'healthcheck.failed',
      'resource.threshold',
      'backup.completed',
      'backup.failed'
    ];
    return validEvents.includes(event);
  }

  /**
   * Generate unique message ID
   */
  generateMessageId() {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Build notification message
   */
  buildMessage(event, project, environment, severity, data) {
    const emoji = this.getSeverityEmoji(severity);
    const title = this.getEventTitle(event);

    return {
      emoji,
      title,
      event,
      project,
      environment,
      severity,
      timestamp: new Date().toISOString(),
      data
    };
  }

  /**
   * Get emoji for severity level
   */
  getSeverityEmoji(severity) {
    const emojis = {
      info: '✅',
      warning: '⚠️',
      error: '❌',
      critical: '🚨'
    };
    return emojis[severity] || 'ℹ️';
  }

  /**
   * Get human-readable title for event
   */
  getEventTitle(event) {
    const titles = {
      'deployment.started': 'Deployment Started',
      'deployment.success': 'Deployment Successful',
      'deployment.failed': 'Deployment Failed',
      'server.up': 'Server Online',
      'server.down': 'Server Offline',
      'healthcheck.failed': 'Healthcheck Failed',
      'resource.threshold': 'Resource Threshold Exceeded',
      'backup.completed': 'Backup Completed',
      'backup.failed': 'Backup Failed'
    };
    return titles[event] || event;
  }

  /**
   * Send notification to specific channel
   */
  async sendToChannel(channel, message, severity) {
    const channelConfig = this.config.channels[channel];

    if (!channelConfig || !channelConfig.enabled) {
      return {
        channel,
        status: 'skipped',
        reason: 'Channel not enabled'
      };
    }

    try {
      switch (channel) {
        case 'slack':
          await this.sendToSlack(message, severity);
          break;
        case 'discord':
          await this.sendToDiscord(message);
          break;
        case 'email':
          await this.sendToEmail(message, severity);
          break;
        default:
          throw new Error(`Unknown channel: ${channel}`);
      }

      return {
        channel,
        status: 'sent',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`[Notifier] Failed to send to ${channel}:`, error.message);
      return {
        channel,
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Send notification to Slack
   */
  async sendToSlack(message, severity) {
    const config = this.config.channels.slack;
    if (!config.webhookUrl) {
      throw new Error('Slack webhook URL not configured');
    }

    const color = this.getSlackColor(severity);
    const mention = severity === 'critical' && config.mentionOnCritical
      ? config.mentionUsers.join(' ') + ' '
      : '';

    const payload = {
      text: `${mention}${message.emoji} *${message.title}*`,
      attachments: [{
        color,
        fields: [
          {
            title: 'Project',
            value: message.project,
            short: true
          },
          {
            title: 'Environment',
            value: message.environment,
            short: true
          },
          {
            title: 'Event',
            value: message.event,
            short: true
          },
          {
            title: 'Severity',
            value: message.severity.toUpperCase(),
            short: true
          },
          ...Object.entries(message.data).map(([key, value]) => ({
            title: key.charAt(0).toUpperCase() + key.slice(1),
            value: String(value),
            short: true
          }))
        ],
        footer: 'CodeB Notifier',
        ts: Math.floor(Date.parse(message.timestamp) / 1000)
      }]
    };

    await this.sendWebhook(config.webhookUrl, payload);
  }

  /**
   * Get Slack color for severity
   */
  getSlackColor(severity) {
    const colors = {
      info: '#36a64f',
      warning: '#ff9800',
      error: '#f44336',
      critical: '#9c27b0'
    };
    return colors[severity] || '#2196f3';
  }

  /**
   * Send notification to Discord
   */
  async sendToDiscord(message) {
    const config = this.config.channels.discord;
    if (!config.webhookUrl) {
      throw new Error('Discord webhook URL not configured');
    }

    const color = this.getDiscordColor(message.severity);

    const payload = {
      username: config.username,
      avatar_url: config.avatarUrl,
      embeds: [{
        title: `${message.emoji} ${message.title}`,
        color,
        fields: [
          {
            name: 'Project',
            value: message.project,
            inline: true
          },
          {
            name: 'Environment',
            value: message.environment,
            inline: true
          },
          {
            name: 'Severity',
            value: message.severity.toUpperCase(),
            inline: true
          },
          ...Object.entries(message.data).map(([key, value]) => ({
            name: key.charAt(0).toUpperCase() + key.slice(1),
            value: String(value),
            inline: true
          }))
        ],
        footer: {
          text: 'CodeB Notifier'
        },
        timestamp: message.timestamp
      }]
    };

    await this.sendWebhook(config.webhookUrl, payload);
  }

  /**
   * Get Discord color for severity
   */
  getDiscordColor(severity) {
    const colors = {
      info: 0x36a64f,
      warning: 0xff9800,
      error: 0xf44336,
      critical: 0x9c27b0
    };
    return colors[severity] || 0x2196f3;
  }

  /**
   * Send notification via email
   */
  async sendToEmail(message, severity) {
    const config = this.config.channels.email;

    if (!config.smtp.auth.user || !config.smtp.auth.pass) {
      throw new Error('Email SMTP credentials not configured');
    }

    if (!config.to || config.to.length === 0) {
      throw new Error('Email recipients not configured');
    }

    // For now, log email notification (actual SMTP implementation would go here)
    console.log('[Notifier] Email notification:', {
      from: config.from,
      to: config.to,
      subject: `[${severity.toUpperCase()}] ${message.title} - ${message.project}`,
      body: this.buildEmailBody(message)
    });

    // In production, use nodemailer:
    // const nodemailer = require('nodemailer');
    // const transporter = nodemailer.createTransporter(config.smtp);
    // await transporter.sendMail({ ... });
  }

  /**
   * Build email body
   */
  buildEmailBody(message) {
    const lines = [
      `${message.emoji} ${message.title}`,
      '',
      `Project: ${message.project}`,
      `Environment: ${message.environment}`,
      `Event: ${message.event}`,
      `Severity: ${message.severity.toUpperCase()}`,
      `Timestamp: ${message.timestamp}`,
      ''
    ];

    if (Object.keys(message.data).length > 0) {
      lines.push('Additional Details:');
      for (const [key, value] of Object.entries(message.data)) {
        lines.push(`  ${key}: ${value}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Send webhook request
   */
  async sendWebhook(url, payload) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      const postData = JSON.stringify(payload);

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = protocol.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`Webhook failed: ${res.statusCode} ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  /**
   * Test notification to specific channel
   */
  async test(channel = 'all', customMessage = null) {
    const message = {
      event: 'test.notification',
      project: 'test',
      environment: 'development',
      severity: 'info',
      data: {
        message: customMessage || 'This is a test notification from CodeB',
        timestamp: new Date().toISOString()
      }
    };

    if (channel === 'all') {
      const channels = ['slack', 'discord', 'email'];
      const results = await Promise.all(
        channels.map(ch => this.test(ch, customMessage))
      );
      return {
        success: true,
        results
      };
    }

    return await this.notify({
      ...message,
      channels: [channel]
    });
  }

  /**
   * Get health status of all notification channels
   */
  async health() {
    const channels = {};

    for (const [name, config] of Object.entries(this.config.channels)) {
      channels[name] = {
        enabled: config.enabled,
        configured: this.isChannelConfigured(name, config),
        reachable: false, // Would need actual health check
        lastSuccess: null,
        lastError: null
      };
    }

    const overallStatus = Object.values(channels).some(ch => ch.enabled && ch.configured)
      ? 'healthy'
      : 'unhealthy';

    return {
      status: overallStatus,
      channels,
      lastNotification: null // Would track in production
    };
  }

  /**
   * Check if channel is properly configured
   */
  isChannelConfigured(name, config) {
    switch (name) {
      case 'slack':
        return !!config.webhookUrl;
      case 'discord':
        return !!config.webhookUrl;
      case 'email':
        return !!(config.smtp.auth.user && config.smtp.auth.pass && config.to.length > 0);
      default:
        return false;
    }
  }
}

// Singleton instance
const notifier = new NotificationService();

module.exports = notifier;

// CLI usage
if (require.main === module) {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  (async () => {
    try {
      await notifier.initialize();

      switch (command) {
        case 'test':
          const channel = args[0] || 'all';
          const result = await notifier.test(channel);
          console.log(JSON.stringify(result, null, 2));
          break;

        case 'notify':
          if (args.length === 0) {
            console.error('Usage: notifier.js notify <event> [project] [environment]');
            process.exit(1);
          }
          const notification = {
            event: args[0],
            project: args[1] || 'test',
            environment: args[2] || 'development'
          };
          const notifyResult = await notifier.notify(notification);
          console.log(JSON.stringify(notifyResult, null, 2));
          break;

        case 'config':
          const config = notifier.getConfig();
          console.log(JSON.stringify(config, null, 2));
          break;

        case 'health':
          const health = await notifier.health();
          console.log(JSON.stringify(health, null, 2));
          break;

        default:
          console.log('CodeB Notification Service');
          console.log('');
          console.log('Usage:');
          console.log('  notifier.js test [channel]              - Test notification');
          console.log('  notifier.js notify <event> [project]    - Send notification');
          console.log('  notifier.js config                      - Show configuration');
          console.log('  notifier.js health                      - Health check');
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}
