# CodeB Notification System Guide

Complete guide for setting up and using the CodeB notification system.

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [API Reference](#api-reference)
5. [CLI Usage](#cli-usage)
6. [Integration Examples](#integration-examples)
7. [Troubleshooting](#troubleshooting)

---

## Overview

CodeB Notification System provides real-time alerts for deployment events, server status changes, and resource monitoring.

### Supported Channels

- **Slack** - Webhook-based notifications
- **Discord** - Webhook-based notifications
- **Email** - SMTP-based notifications

### Event Types

| Event | Description | Default Severity |
|-------|-------------|-----------------|
| `deployment.started` | Deployment initiated | info |
| `deployment.success` | Deployment completed successfully | info |
| `deployment.failed` | Deployment failed | error |
| `server.up` | Server came online | info |
| `server.down` | Server went offline | critical |
| `healthcheck.failed` | Health check endpoint failed | warning |
| `resource.threshold` | CPU/Memory/Disk threshold exceeded | warning/critical |
| `backup.completed` | Backup finished successfully | info |
| `backup.failed` | Backup operation failed | error |

---

## Installation

### 1. Install Dependencies

```bash
cd /Users/admin/new_project/codeb-server
npm install
```

### 2. Copy Files to Server

```bash
# Copy notification files
scp cli/src/notifier.js root@141.164.60.51:/opt/codeb/cli/src/
scp cli/src/notification-server.js root@141.164.60.51:/opt/codeb/cli/src/
scp cli/src/deployment-hooks.js root@141.164.60.51:/opt/codeb/cli/src/

# Copy systemd service
scp cli/systemd/codeb-notifier.service root@141.164.60.51:/etc/systemd/system/
```

### 3. Enable and Start Service

```bash
ssh root@141.164.60.51

# Reload systemd
systemctl daemon-reload

# Enable service
systemctl enable codeb-notifier

# Start service
systemctl start codeb-notifier

# Check status
systemctl status codeb-notifier
```

---

## Configuration

### Interactive Setup (Recommended)

```bash
we notify setup
```

This wizard will guide you through:
1. Enabling/disabling notifications
2. Configuring Slack webhooks
3. Configuring Discord webhooks
4. Setting up SMTP email

### Manual Configuration

Edit `/opt/codeb/config/notifications.json`:

```json
{
  "enabled": true,
  "channels": {
    "slack": {
      "enabled": true,
      "webhookUrl": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
      "defaultChannel": "#deployments",
      "mentionOnCritical": true,
      "mentionUsers": ["@channel"]
    },
    "discord": {
      "enabled": true,
      "webhookUrl": "https://discord.com/api/webhooks/YOUR/WEBHOOK",
      "username": "CodeB Notifier",
      "avatarUrl": "https://codeb.dev/logo.png"
    },
    "email": {
      "enabled": true,
      "smtp": {
        "host": "smtp.gmail.com",
        "port": 587,
        "secure": false,
        "auth": {
          "user": "your-email@gmail.com",
          "pass": "your-app-password"
        }
      },
      "from": "noreply@codeb.dev",
      "to": ["admin@example.com"]
    }
  },
  "rules": {
    "deployment.started": ["slack", "discord"],
    "deployment.success": ["slack", "discord"],
    "deployment.failed": ["slack", "discord", "email"],
    "server.down": ["slack", "discord", "email"],
    "healthcheck.failed": ["slack", "discord"],
    "resource.threshold": ["slack", "email"]
  },
  "thresholds": {
    "disk": 85,
    "memory": 90,
    "cpu": 80
  }
}
```

### Getting Webhook URLs

#### Slack
1. Go to https://api.slack.com/apps
2. Create new app or select existing
3. Navigate to "Incoming Webhooks"
4. Add New Webhook to Workspace
5. Copy the webhook URL

#### Discord
1. Open Discord server settings
2. Go to Integrations → Webhooks
3. Click "New Webhook"
4. Select channel and copy webhook URL

#### Gmail SMTP
1. Enable 2-factor authentication
2. Generate App Password at https://myaccount.google.com/apppasswords
3. Use your email and app password in config

---

## API Reference

See complete OpenAPI specification: `docs/API_NOTIFICATION_SPEC.yaml`

### Base URL

```
http://localhost:7778/api/v1
```

### Endpoints

#### POST /notify

Send notification for an event.

**Request:**
```json
{
  "event": "deployment.success",
  "project": "myapp",
  "environment": "production",
  "severity": "info",
  "data": {
    "version": "1.2.3",
    "duration": "45s",
    "deployer": "john@example.com"
  }
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "notif_1703001234567_abc123",
  "sentTo": [
    {
      "channel": "slack",
      "status": "sent",
      "timestamp": "2025-12-19T10:30:00Z"
    },
    {
      "channel": "discord",
      "status": "sent",
      "timestamp": "2025-12-19T10:30:00Z"
    }
  ],
  "timestamp": "2025-12-19T10:30:00Z"
}
```

#### POST /notify/test

Test notification configuration.

**Request:**
```json
{
  "channel": "slack",
  "message": "Test notification"
}
```

#### GET /config/notifications

Get current configuration (sensitive data masked).

#### PUT /config/notifications

Update configuration.

#### GET /health/notifications

Health check for all channels.

---

## CLI Usage

### Test Notifications

```bash
# Test all channels
we notify test

# Test specific channel
we notify test slack
we notify test discord
we notify test email

# Custom message
we notify test all -m "Testing CodeB notifications"
```

### Send Notifications

```bash
# Basic notification
we notify send deployment.success myapp

# With environment
we notify send deployment.success myapp -e production

# With additional data
we notify send deployment.failed myapp -e staging \
  -d '{"error": "Build failed", "stage": "compile"}'

# Override channels
we notify send server.down web-01 -c slack,email
```

### Configuration Management

```bash
# View configuration
we notify config

# View raw JSON
we notify config --raw

# Interactive setup
we notify setup
```

### Health Check

```bash
we notify health
```

---

## Integration Examples

### Deployment Hooks

Automatically send notifications during deployments.

#### In Deploy Script

```bash
#!/bin/bash

PROJECT="myapp"
ENVIRONMENT="production"

# Deployment started
node /opt/codeb/cli/src/deployment-hooks.js started "$PROJECT" "$ENVIRONMENT" \
  deployer "$USER" \
  branch "main" \
  commit "$(git rev-parse --short HEAD)"

# Run deployment
if ./deploy.sh; then
  # Success
  node /opt/codeb/cli/src/deployment-hooks.js success "$PROJECT" "$ENVIRONMENT" \
    version "1.2.3" \
    duration "45s" \
    url "https://$PROJECT.codeb.dev"
else
  # Failed
  node /opt/codeb/cli/src/deployment-hooks.js failed "$PROJECT" "$ENVIRONMENT" \
    error "Deployment script failed" \
    stage "deploy"
fi
```

#### In GitHub Actions

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Notify deployment started
        run: |
          curl -X POST http://141.164.60.51:7778/api/v1/notify \
            -H "Content-Type: application/json" \
            -d '{
              "event": "deployment.started",
              "project": "${{ github.repository }}",
              "environment": "production",
              "data": {
                "branch": "${{ github.ref_name }}",
                "commit": "${{ github.sha }}",
                "actor": "${{ github.actor }}"
              }
            }'

      - name: Deploy
        run: ./deploy.sh

      - name: Notify success
        if: success()
        run: |
          curl -X POST http://141.164.60.51:7778/api/v1/notify \
            -H "Content-Type: application/json" \
            -d '{
              "event": "deployment.success",
              "project": "${{ github.repository }}",
              "environment": "production"
            }'

      - name: Notify failure
        if: failure()
        run: |
          curl -X POST http://141.164.60.51:7778/api/v1/notify \
            -H "Content-Type: application/json" \
            -d '{
              "event": "deployment.failed",
              "project": "${{ github.repository }}",
              "environment": "production"
            }'
```

### Health Monitoring

```bash
#!/bin/bash
# /opt/codeb/scripts/health-monitor.sh

PROJECT="myapp"

# Check health endpoint
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://myapp.codeb.dev/health)

if [ "$STATUS" != "200" ]; then
  node /opt/codeb/cli/src/deployment-hooks.js healthcheck-failed "$PROJECT" \
    endpoint "/health" \
    statusCode "$STATUS" \
    attempts "3"
fi
```

### Resource Monitoring

```bash
#!/bin/bash
# /opt/codeb/scripts/resource-monitor.sh

DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
MEMORY_USAGE=$(free | grep Mem | awk '{printf("%.0f", $3/$2 * 100.0)}')

DISK_THRESHOLD=85
MEMORY_THRESHOLD=90

if [ "$DISK_USAGE" -gt "$DISK_THRESHOLD" ]; then
  node /opt/codeb/cli/src/deployment-hooks.js resource-threshold \
    disk "$DISK_USAGE" "$DISK_THRESHOLD" \
    server "$(hostname)"
fi

if [ "$MEMORY_USAGE" -gt "$MEMORY_THRESHOLD" ]; then
  node /opt/codeb/cli/src/deployment-hooks.js resource-threshold \
    memory "$MEMORY_USAGE" "$MEMORY_THRESHOLD" \
    server "$(hostname)"
fi
```

Add to crontab:

```bash
# Run every 5 minutes
*/5 * * * * /opt/codeb/scripts/resource-monitor.sh
```

### Backup Integration

```bash
#!/bin/bash
# /opt/codeb/scripts/backup.sh

PROJECT="myapp"

if pg_dump myapp_db > backup.sql; then
  SIZE=$(du -h backup.sql | cut -f1)

  node /opt/codeb/cli/src/deployment-hooks.js backup-completed "$PROJECT" \
    type "database" \
    size "$SIZE" \
    location "/backups/$(date +%Y%m%d).sql"
else
  node /opt/codeb/cli/src/deployment-hooks.js backup-failed "$PROJECT" \
    type "database" \
    error "pg_dump failed"
fi
```

### Node.js Integration

```javascript
const axios = require('axios');

const NOTIFIER_URL = 'http://localhost:7778/api/v1/notify';

async function notifyDeployment(status, project, environment, data = {}) {
  try {
    const response = await axios.post(NOTIFIER_URL, {
      event: `deployment.${status}`,
      project,
      environment,
      severity: status === 'failed' ? 'error' : 'info',
      data
    });

    console.log('Notification sent:', response.data.messageId);
  } catch (error) {
    console.error('Failed to send notification:', error.message);
  }
}

// Usage
await notifyDeployment('started', 'myapp', 'production', {
  version: '1.2.3',
  deployer: 'john@example.com'
});
```

---

## Troubleshooting

### Service Not Running

```bash
# Check status
systemctl status codeb-notifier

# View logs
journalctl -u codeb-notifier -f

# Restart service
systemctl restart codeb-notifier
```

### Notifications Not Sending

1. **Check configuration:**
   ```bash
   we notify config
   ```

2. **Test connectivity:**
   ```bash
   we notify test slack
   ```

3. **Check health:**
   ```bash
   we notify health
   ```

4. **Verify webhook URLs:**
   - Ensure URLs are correct
   - Test manually with curl

### Slack Webhook Issues

```bash
# Test Slack webhook manually
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -H "Content-Type: application/json" \
  -d '{"text":"Test message"}'
```

### Discord Webhook Issues

```bash
# Test Discord webhook manually
curl -X POST https://discord.com/api/webhooks/YOUR/WEBHOOK \
  -H "Content-Type: application/json" \
  -d '{"content":"Test message"}'
```

### Email Not Sending

1. **Check SMTP credentials:**
   - Verify username/password
   - Ensure "Less secure app access" or App Password for Gmail

2. **Test SMTP connection:**
   ```bash
   telnet smtp.gmail.com 587
   ```

3. **Check firewall:**
   ```bash
   # Allow SMTP port
   ufw allow 587/tcp
   ```

### Permission Issues

```bash
# Ensure config directory exists
mkdir -p /opt/codeb/config

# Set correct permissions
chown -R root:root /opt/codeb/config
chmod 600 /opt/codeb/config/notifications.json
```

---

## Best Practices

1. **Use different channels for different severities:**
   - Info: Slack/Discord only
   - Error/Critical: All channels including email

2. **Rate limiting:**
   - Avoid notification spam
   - Group similar events
   - Use debouncing for frequent events

3. **Secure credentials:**
   - Use environment variables for secrets
   - Restrict access to config files
   - Rotate webhook URLs periodically

4. **Test regularly:**
   ```bash
   we notify test
   ```

5. **Monitor notification health:**
   ```bash
   we notify health
   ```

---

## Next Steps

- Set up monitoring cron jobs
- Integrate with CI/CD pipelines
- Create custom notification templates
- Add additional channels (PagerDuty, SMS, etc.)

---

For API details, see: `docs/API_NOTIFICATION_SPEC.yaml`

For support, contact: support@codeb.dev
