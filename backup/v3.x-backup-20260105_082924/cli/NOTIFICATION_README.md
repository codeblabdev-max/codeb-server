# CodeB Notification System

Real-time notification system for CodeB deployment infrastructure.

## Quick Start

### Installation

```bash
# Copy files to server
scp -r cli/src/*.js root@141.164.60.51:/opt/codeb/cli/src/
scp cli/systemd/codeb-notifier.service root@141.164.60.51:/etc/systemd/system/

# Run installation script
ssh root@141.164.60.51
bash /opt/codeb/cli/scripts/install-notifier.sh
```

### Configuration

Interactive setup wizard:

```bash
node /opt/codeb/cli/src/notifier.js config
```

Or manually edit:

```bash
nano /opt/codeb/config/notifications.json
```

### Test

```bash
# Test all channels
node /opt/codeb/cli/src/notifier.js test

# Test specific channel
node /opt/codeb/cli/src/notifier.js test slack
```

## Features

- **Multi-channel support**: Slack, Discord, Email
- **Event-based triggers**: Deployment, server status, health checks, resource monitoring
- **RESTful API**: OpenAPI 3.0 compliant
- **CLI interface**: Easy command-line management
- **Deployment hooks**: Automatic notifications during deployments
- **Health monitoring**: Channel health checks
- **SSOT integration**: Works with CodeB registry system

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   CodeB Infrastructure                   │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐    ┌────────────────────────────┐    │
│  │   Deploy     │───▶│   Deployment Hooks         │    │
│  │   Scripts    │    │   (deployment-hooks.js)    │    │
│  └──────────────┘    └────────────┬───────────────┘    │
│                                    │                     │
│  ┌──────────────┐    ┌────────────▼───────────────┐    │
│  │   Health     │───▶│   Notification Service     │    │
│  │   Monitors   │    │   (notifier.js)            │    │
│  └──────────────┘    └────────────┬───────────────┘    │
│                                    │                     │
│  ┌──────────────┐    ┌────────────▼───────────────┐    │
│  │   GitHub     │───▶│   HTTP API Server          │    │
│  │   Actions    │    │   (notification-server.js)  │    │
│  └──────────────┘    │   Port: 7778               │    │
│                      └────────────┬───────────────┘    │
│                                    │                     │
└────────────────────────────────────┼─────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
         ┌──────────▼─────┐  ┌──────▼──────┐  ┌─────▼─────┐
         │   Slack        │  │  Discord    │  │   Email   │
         │   Webhook      │  │  Webhook    │  │   SMTP    │
         └────────────────┘  └─────────────┘  └───────────┘
```

## File Structure

```
cli/
├── src/
│   ├── notifier.js                 # Core notification service
│   ├── notification-server.js      # HTTP API server
│   └── deployment-hooks.js         # Deployment integration
├── commands/
│   └── notify.js                   # WE CLI command
├── systemd/
│   └── codeb-notifier.service      # Systemd service
├── config/
│   └── notifications.example.json  # Example configuration
└── scripts/
    ├── install-notifier.sh         # Installation script
    └── test-notifications.sh       # Test suite
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/notify` | POST | Send notification |
| `/api/v1/notify/test` | POST | Test notification |
| `/api/v1/config/notifications` | GET | Get configuration |
| `/api/v1/config/notifications` | PUT | Update configuration |
| `/api/v1/health/notifications` | GET | Health check |
| `/health` | GET | Service health |

See full API spec: `docs/API_NOTIFICATION_SPEC.yaml`

## Usage Examples

### Send Deployment Success

```bash
node /opt/codeb/cli/src/deployment-hooks.js success myapp production \
  version "1.2.3" \
  duration "45s" \
  url "https://myapp.codeb.dev"
```

### Send Server Down Alert

```bash
node /opt/codeb/cli/src/deployment-hooks.js server-down web-01 \
  ip "141.164.60.51" \
  lastSeen "2025-12-19T10:30:00Z"
```

### Send Custom Notification

```bash
curl -X POST http://localhost:7778/api/v1/notify \
  -H "Content-Type: application/json" \
  -d '{
    "event": "deployment.success",
    "project": "myapp",
    "environment": "production",
    "data": {
      "version": "1.2.3",
      "deployer": "john@example.com"
    }
  }'
```

### Health Check

```bash
curl http://localhost:7778/api/v1/health/notifications
```

## Event Types

| Event | Severity | Default Channels |
|-------|----------|------------------|
| `deployment.started` | info | slack, discord |
| `deployment.success` | info | slack, discord |
| `deployment.failed` | error | slack, discord, email |
| `server.up` | info | slack |
| `server.down` | critical | slack, discord, email |
| `healthcheck.failed` | warning | slack, discord |
| `resource.threshold` | warning/critical | slack, email |
| `backup.completed` | info | slack |
| `backup.failed` | error | slack, email |

## Configuration

### Slack Setup

1. Create incoming webhook: https://api.slack.com/apps
2. Add webhook URL to config:

```json
{
  "channels": {
    "slack": {
      "enabled": true,
      "webhookUrl": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
      "defaultChannel": "#deployments",
      "mentionOnCritical": true,
      "mentionUsers": ["@channel"]
    }
  }
}
```

### Discord Setup

1. Create webhook in Discord server settings
2. Add webhook URL to config:

```json
{
  "channels": {
    "discord": {
      "enabled": true,
      "webhookUrl": "https://discord.com/api/webhooks/YOUR/WEBHOOK",
      "username": "CodeB Notifier",
      "avatarUrl": "https://codeb.dev/logo.png"
    }
  }
}
```

### Email Setup (Gmail)

1. Enable 2FA and create App Password
2. Add SMTP config:

```json
{
  "channels": {
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
  }
}
```

## Service Management

```bash
# Start service
systemctl start codeb-notifier

# Stop service
systemctl stop codeb-notifier

# Restart service
systemctl restart codeb-notifier

# Check status
systemctl status codeb-notifier

# View logs
journalctl -u codeb-notifier -f
```

## Troubleshooting

### Service won't start

```bash
# Check logs
journalctl -u codeb-notifier -n 50

# Check Node.js
which node
node --version

# Check file permissions
ls -la /opt/codeb/cli/src/
```

### Notifications not sending

```bash
# Test configuration
node /opt/codeb/cli/src/notifier.js config

# Test specific channel
node /opt/codeb/cli/src/notifier.js test slack

# Check webhook URL
curl -X POST YOUR_WEBHOOK_URL -H "Content-Type: application/json" -d '{"text":"test"}'
```

### API not responding

```bash
# Check if service is running
systemctl status codeb-notifier

# Check port
netstat -tlnp | grep 7778

# Test locally
curl http://localhost:7778/health
```

## Documentation

- **API Specification**: `docs/API_NOTIFICATION_SPEC.yaml`
- **User Guide**: `docs/NOTIFICATION_GUIDE.md`
- **Installation**: `cli/scripts/install-notifier.sh`
- **Tests**: `cli/scripts/test-notifications.sh`

## License

MIT

## Support

For issues and support:
- GitHub: https://github.com/codeblabdev-max/codeb-server
- Email: support@codeb.dev
