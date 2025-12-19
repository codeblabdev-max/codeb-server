#!/bin/bash
#
# CodeB Watchdog 설치 스크립트
#

set -euo pipefail

echo "=== CodeB Watchdog Installation ==="
echo ""

# 디렉토리 생성
echo "Creating directories..."
mkdir -p /opt/codeb/registry
mkdir -p /opt/codeb/registry/history
mkdir -p /opt/codeb/registry/backups
mkdir -p /opt/codeb/registry/reports
mkdir -p /opt/codeb/watchdog
mkdir -p /opt/codeb/logs

# 스크립트 복사
echo "Copying watchdog script..."
cp codeb-watchdog.sh /opt/codeb/watchdog/
chmod +x /opt/codeb/watchdog/codeb-watchdog.sh

# systemd 서비스 설치
echo "Installing systemd service..."
cp codeb-watchdog.service /etc/systemd/system/
systemctl daemon-reload

# 서비스 활성화
echo "Enabling service..."
systemctl enable codeb-watchdog

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Commands:"
echo "  systemctl start codeb-watchdog   # 서비스 시작"
echo "  systemctl stop codeb-watchdog    # 서비스 중지"
echo "  systemctl status codeb-watchdog  # 상태 확인"
echo "  journalctl -u codeb-watchdog -f  # 로그 확인"
echo ""
echo "Manual run:"
echo "  /opt/codeb/watchdog/codeb-watchdog.sh once    # 1회 실행"
echo "  /opt/codeb/watchdog/codeb-watchdog.sh status  # 상태 확인"
echo ""
echo "Note: SSOT must be initialized before starting the service!"
echo "      Use MCP tool 'ssot_initialize' to create initial SSOT."
