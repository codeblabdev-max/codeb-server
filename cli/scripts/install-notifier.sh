#!/bin/bash

###############################################################################
# CodeB Notification System - Installation Script
#
# Installs and configures the notification system on the server
###############################################################################

set -e

echo "=========================================="
echo "CodeB Notification System - Installer"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root${NC}"
  exit 1
fi

# Variables
INSTALL_DIR="/opt/codeb"
CONFIG_DIR="$INSTALL_DIR/config"
CLI_DIR="$INSTALL_DIR/cli"
SRC_DIR="$CLI_DIR/src"
SYSTEMD_DIR="/etc/systemd/system"

echo -e "${BLUE}Step 1: Creating directories${NC}"
mkdir -p "$CONFIG_DIR"
mkdir -p "$SRC_DIR"
echo -e "${GREEN}✓ Directories created${NC}"
echo ""

echo -e "${BLUE}Step 2: Checking dependencies${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}Node.js is not installed${NC}"
  echo "Install with: curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && apt-get install -y nodejs"
  exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✓ Node.js $NODE_VERSION${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
  echo -e "${RED}npm is not installed${NC}"
  exit 1
fi

NPM_VERSION=$(npm --version)
echo -e "${GREEN}✓ npm $NPM_VERSION${NC}"
echo ""

echo -e "${BLUE}Step 3: Installing npm packages${NC}"
cd "$INSTALL_DIR"

if [ ! -f "package.json" ]; then
  npm init -y
fi

# Install required packages
npm install axios chalk inquirer commander cli-table3 --save

echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

echo -e "${BLUE}Step 4: Copying notification files${NC}"

# These files should be copied from the repository
REQUIRED_FILES=(
  "src/notifier.js"
  "src/notification-server.js"
  "src/deployment-hooks.js"
)

MISSING_FILES=0
for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$CLI_DIR/$file" ]; then
    echo -e "${YELLOW}⚠ Missing: $file${NC}"
    echo "  Please copy from: cli/$file"
    ((MISSING_FILES++))
  else
    echo -e "${GREEN}✓ Found: $file${NC}"
    chmod +x "$CLI_DIR/$file"
  fi
done

if [ $MISSING_FILES -gt 0 ]; then
  echo ""
  echo -e "${RED}Missing files detected!${NC}"
  echo "Copy files with:"
  echo "  scp cli/src/*.js root@YOUR_SERVER:/opt/codeb/cli/src/"
  exit 1
fi

echo ""

echo -e "${BLUE}Step 5: Creating default configuration${NC}"

if [ -f "$CONFIG_DIR/notifications.json" ]; then
  echo -e "${YELLOW}⚠ Configuration already exists, skipping${NC}"
else
  cat > "$CONFIG_DIR/notifications.json" <<EOF
{
  "enabled": false,
  "channels": {
    "slack": {
      "enabled": false,
      "webhookUrl": "",
      "defaultChannel": "#deployments",
      "mentionOnCritical": true,
      "mentionUsers": ["@channel"]
    },
    "discord": {
      "enabled": false,
      "webhookUrl": "",
      "username": "CodeB Notifier",
      "avatarUrl": "https://codeb.dev/logo.png"
    },
    "email": {
      "enabled": false,
      "smtp": {
        "host": "smtp.gmail.com",
        "port": 587,
        "secure": false,
        "auth": {
          "user": "",
          "pass": ""
        }
      },
      "from": "noreply@codeb.dev",
      "to": []
    }
  },
  "rules": {
    "deployment.started": ["slack", "discord"],
    "deployment.success": ["slack", "discord"],
    "deployment.failed": ["slack", "discord", "email"],
    "server.up": ["slack"],
    "server.down": ["slack", "discord", "email"],
    "healthcheck.failed": ["slack", "discord"],
    "resource.threshold": ["slack", "email"],
    "backup.completed": ["slack"],
    "backup.failed": ["slack", "email"]
  },
  "thresholds": {
    "disk": 85,
    "memory": 90,
    "cpu": 80
  }
}
EOF

  chmod 600 "$CONFIG_DIR/notifications.json"
  echo -e "${GREEN}✓ Default configuration created${NC}"
fi

echo ""

echo -e "${BLUE}Step 6: Installing systemd service${NC}"

cat > "$SYSTEMD_DIR/codeb-notifier.service" <<EOF
[Unit]
Description=CodeB Notification Service
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node $SRC_DIR/notification-server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment
Environment="NODE_ENV=production"
Environment="NOTIFIER_PORT=7778"
Environment="NOTIFIER_HOST=0.0.0.0"

# Security
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}✓ Systemd service installed${NC}"
echo ""

echo -e "${BLUE}Step 7: Enabling and starting service${NC}"

systemctl daemon-reload
systemctl enable codeb-notifier

# Ask before starting
read -p "Start notification service now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  systemctl start codeb-notifier
  sleep 2

  if systemctl is-active --quiet codeb-notifier; then
    echo -e "${GREEN}✓ Service is running${NC}"
  else
    echo -e "${RED}✗ Service failed to start${NC}"
    echo "Check logs with: journalctl -u codeb-notifier -n 50"
    exit 1
  fi
else
  echo -e "${YELLOW}Service not started. Start manually with: systemctl start codeb-notifier${NC}"
fi

echo ""

echo -e "${BLUE}Step 8: Opening firewall port${NC}"

if command -v ufw &> /dev/null; then
  ufw allow 7778/tcp comment "CodeB Notifier API"
  echo -e "${GREEN}✓ Firewall rule added${NC}"
else
  echo -e "${YELLOW}⚠ ufw not found, skipping firewall configuration${NC}"
fi

echo ""

echo "=========================================="
echo -e "${GREEN}Installation Complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Configure notifications:"
echo "   node $SRC_DIR/notifier.js config"
echo ""
echo "2. Edit configuration:"
echo "   nano $CONFIG_DIR/notifications.json"
echo ""
echo "3. Test notifications:"
echo "   node $SRC_DIR/notifier.js test"
echo ""
echo "4. Check service status:"
echo "   systemctl status codeb-notifier"
echo ""
echo "5. View logs:"
echo "   journalctl -u codeb-notifier -f"
echo ""
echo "API Endpoints:"
echo "  POST http://$(hostname -I | awk '{print $1}'):7778/api/v1/notify"
echo "  GET  http://$(hostname -I | awk '{print $1}'):7778/api/v1/health/notifications"
echo ""
echo "Documentation:"
echo "  $INSTALL_DIR/docs/NOTIFICATION_GUIDE.md"
echo "  $INSTALL_DIR/docs/API_NOTIFICATION_SPEC.yaml"
echo ""
