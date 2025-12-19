#!/bin/bash

###############################################################################
# CodeB Domain Manager Installation Script
#
# 158.247.203.55 서버에서 실행
# PowerDNS + Caddy + Domain Manager API 통합
###############################################################################

set -e

INSTALL_DIR="/opt/codeb/ssot-registry"
SERVICE_NAME="codeb-domain-manager"

echo "============================================================"
echo "CodeB Domain Manager - Installation"
echo "============================================================"

# Root 권한 확인
if [[ $EUID -ne 0 ]]; then
   echo "Error: This script must be run as root"
   exit 1
fi

# 1. 디렉토리 생성
echo ""
echo "[1/6] Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p /var/log/codeb
mkdir -p /etc/caddy/sites

# 2. 파일 복사
echo "[2/6] Installing files..."
cp domain-manager.js "$INSTALL_DIR/"
cp domain-cli.js "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/domain-manager.js"
chmod +x "$INSTALL_DIR/domain-cli.js"

# 3. 심볼릭 링크 (CLI 전역 사용)
echo "[3/6] Creating symlink for CLI..."
ln -sf "$INSTALL_DIR/domain-cli.js" /usr/local/bin/domain-cli

# 4. npm dependencies 설치
echo "[4/6] Installing npm dependencies..."
cd "$INSTALL_DIR"

if [ ! -f "package.json" ]; then
  cat > package.json << 'EOF'
{
  "name": "codeb-domain-manager",
  "version": "1.0.0",
  "description": "CodeB Domain Manager - PowerDNS + Caddy automation",
  "main": "domain-manager.js",
  "scripts": {
    "start": "node domain-manager.js",
    "dev": "nodemon domain-manager.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "axios": "^1.6.0",
    "commander": "^11.1.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
EOF
fi

npm install --production

# 5. Environment 설정
echo "[5/6] Setting up environment..."

if [ ! -f "$INSTALL_DIR/.env" ]; then
  cat > "$INSTALL_DIR/.env" << 'EOF'
# PowerDNS API Configuration
PDNS_API_KEY=changeme
PDNS_API_URL=http://localhost:8081/api/v1

# Domain Manager API Port
DOMAIN_MANAGER_PORT=3103

# SSOT Registry URL
SSOT_REGISTRY_URL=http://localhost:3102
EOF

  echo ""
  echo "⚠️  IMPORTANT: Edit $INSTALL_DIR/.env and set your PowerDNS API key"
  echo "   PDNS_API_KEY should match the value in PowerDNS container"
  echo ""
fi

# 6. systemd 서비스 생성
echo "[6/6] Creating systemd service..."

cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=CodeB Domain Manager API
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/node ${INSTALL_DIR}/domain-manager.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

# Environment
EnvironmentFile=${INSTALL_DIR}/.env

# Security
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# systemd reload
systemctl daemon-reload

echo ""
echo "============================================================"
echo "✓ Installation Complete!"
echo "============================================================"
echo ""
echo "Next Steps:"
echo ""
echo "1. Configure PowerDNS API key:"
echo "   sudo nano $INSTALL_DIR/.env"
echo ""
echo "2. Start the service:"
echo "   sudo systemctl start ${SERVICE_NAME}"
echo "   sudo systemctl enable ${SERVICE_NAME}"
echo ""
echo "3. Check status:"
echo "   sudo systemctl status ${SERVICE_NAME}"
echo "   sudo journalctl -u ${SERVICE_NAME} -f"
echo ""
echo "4. Test the API:"
echo "   curl http://localhost:3103/health"
echo ""
echo "5. Use the CLI:"
echo "   domain-cli setup myapp 3000"
echo "   domain-cli status myapp.codeb.kr"
echo "   domain-cli list"
echo ""
echo "============================================================"
