#!/bin/bash
#
# CodeB Security System - Uninstallation Script
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${YELLOW}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "${RED}⚠️  $1${NC}"; }

# Root 확인
if [ "$EUID" -ne 0 ]; then
    log_warn "Please run as root (sudo ./uninstall.sh)"
    exit 1
fi

echo ""
echo "⚠️  CodeB Security System 제거"
echo ""
read -p "정말 제거하시겠습니까? (y/N): " confirm

if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "취소됨"
    exit 0
fi

log_info "Stopping services..."
systemctl stop codeb-mcp-proxy 2>/dev/null || true
systemctl stop codeb-protection 2>/dev/null || true

log_info "Disabling services..."
systemctl disable codeb-mcp-proxy 2>/dev/null || true
systemctl disable codeb-protection 2>/dev/null || true

log_info "Removing service files..."
rm -f /etc/systemd/system/codeb-protection.service
rm -f /etc/systemd/system/codeb-mcp-proxy.service
systemctl daemon-reload

log_info "Removing files..."
rm -rf /opt/codeb/security
rm -rf /var/run/codeb
rm -f /var/lib/codeb/audit.db
rm -rf /var/log/codeb

log_info "Removing hooks..."
if [ -n "$SUDO_USER" ]; then
    USER_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
    rm -f "$USER_HOME/.claude/hooks/pre-bash.py"
fi

log_success "CodeB Security System removed"
echo ""
echo "⚠️  ~/.claude/settings.local.json은 수동으로 복구하세요"
echo ""
