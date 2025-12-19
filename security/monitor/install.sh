#!/bin/bash
#
# CodeB Watchdog Monitor - Installation Script
#
# 실시간 파일/컨테이너 감시 및 자동 복구 시스템 설치
#

set -e

# ============================================================================
# 색상 정의
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}🚨 $1${NC}"; }

# ============================================================================
# 사전 요구사항 확인
# ============================================================================

check_requirements() {
    log_info "Checking requirements..."

    # Root 권한 확인
    if [ "$EUID" -ne 0 ]; then
        log_error "Please run as root (sudo ./install.sh)"
        exit 1
    fi

    # Node.js 확인
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi

    # Podman 확인
    if ! command -v podman &> /dev/null; then
        log_warn "Podman is not installed - container monitoring will be limited"
    fi

    # e2fsprogs 확인 (chattr용)
    if ! command -v chattr &> /dev/null; then
        log_warn "e2fsprogs not installed - file locking will be unavailable"
        log_info "Install with: apt install e2fsprogs"
    fi

    log_success "Requirements check passed"
}

# ============================================================================
# 디렉토리 생성
# ============================================================================

create_directories() {
    log_info "Creating directories..."

    mkdir -p /opt/codeb/security/monitor
    mkdir -p /var/run/codeb
    mkdir -p /var/lib/codeb/backups
    mkdir -p /var/lib/codeb/snapshots
    mkdir -p /var/log/codeb

    chmod 755 /opt/codeb/security/monitor
    chmod 750 /var/lib/codeb/backups
    chmod 750 /var/lib/codeb/snapshots

    log_success "Directories created"
}

# ============================================================================
# 파일 복사
# ============================================================================

copy_files() {
    log_info "Copying files..."

    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    # Watchdog 파일 복사
    cp "$SCRIPT_DIR/watchdog.js" /opt/codeb/security/monitor/
    chmod +x /opt/codeb/security/monitor/watchdog.js

    # Systemd 서비스 파일 복사
    cp "$SCRIPT_DIR/systemd/codeb-watchdog.service" /etc/systemd/system/

    log_success "Files copied"
}

# ============================================================================
# 알림 설정
# ============================================================================

configure_notifications() {
    log_info "Configuring notifications..."

    echo ""
    read -p "Enable Slack notifications? (y/N): " enable_slack

    if [ "$enable_slack" = "y" ] || [ "$enable_slack" = "Y" ]; then
        read -p "Enter Slack Webhook URL: " slack_url
        if [ -n "$slack_url" ]; then
            sed -i "s|Environment=SLACK_WEBHOOK_URL=|Environment=SLACK_WEBHOOK_URL=$slack_url|" \
                /etc/systemd/system/codeb-watchdog.service
            log_success "Slack notifications configured"
        fi
    fi

    read -p "Enable Discord notifications? (y/N): " enable_discord

    if [ "$enable_discord" = "y" ] || [ "$enable_discord" = "Y" ]; then
        read -p "Enter Discord Webhook URL: " discord_url
        if [ -n "$discord_url" ]; then
            sed -i "s|Environment=DISCORD_WEBHOOK_URL=|Environment=DISCORD_WEBHOOK_URL=$discord_url|" \
                /etc/systemd/system/codeb-watchdog.service
            log_success "Discord notifications configured"
        fi
    fi
}

# ============================================================================
# Systemd 서비스 설정
# ============================================================================

setup_systemd() {
    log_info "Setting up systemd service..."

    systemctl daemon-reload
    systemctl enable codeb-watchdog
    systemctl start codeb-watchdog

    sleep 2

    if systemctl is-active --quiet codeb-watchdog; then
        log_success "Watchdog service started"
    else
        log_error "Failed to start watchdog service"
        systemctl status codeb-watchdog --no-pager || true
    fi
}

# ============================================================================
# 초기 백업 생성
# ============================================================================

create_initial_backups() {
    log_info "Creating initial backups..."

    # 중요 파일 백업
    CRITICAL_FILES=(
        "/opt/codeb/security/daemon/protection-daemon.js"
        "/opt/codeb/security/mcp-proxy/mcp-proxy-gateway.js"
        "/etc/codeb/protection-rules.json"
    )

    for file in "${CRITICAL_FILES[@]}"; do
        if [ -f "$file" ]; then
            BACKUP_NAME=$(echo "$file" | tr '/' '_')
            cp "$file" "/var/lib/codeb/backups/${BACKUP_NAME}.$(date +%Y%m%d_%H%M%S)"
            log_info "Backed up: $file"
        fi
    done

    log_success "Initial backups created"
}

# ============================================================================
# 상태 확인
# ============================================================================

verify_installation() {
    log_info "Verifying installation..."

    # 서비스 상태
    if systemctl is-active --quiet codeb-watchdog; then
        log_success "Watchdog Service: Running"
    else
        log_error "Watchdog Service: Not running"
    fi

    # PID 파일
    if [ -f /var/run/codeb/watchdog.pid ]; then
        PID=$(cat /var/run/codeb/watchdog.pid)
        log_success "Watchdog PID: $PID"
    fi

    # 백업 디렉토리
    BACKUP_COUNT=$(ls -1 /var/lib/codeb/backups 2>/dev/null | wc -l)
    log_info "Backup files: $BACKUP_COUNT"
}

# ============================================================================
# 메인
# ============================================================================

main() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║       CodeB Watchdog Monitor - Installation Script            ║"
    echo "║           Real-time File & Container Monitoring               ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""

    check_requirements
    create_directories
    copy_files
    configure_notifications
    setup_systemd
    create_initial_backups
    verify_installation

    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                    Installation Complete!                      ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "📋 서비스 관리:"
    echo "   sudo systemctl status codeb-watchdog"
    echo "   sudo systemctl restart codeb-watchdog"
    echo ""
    echo "📋 로그 확인:"
    echo "   sudo journalctl -u codeb-watchdog -f"
    echo "   tail -f /var/log/codeb/watchdog.log"
    echo ""
    echo "📋 CLI 명령:"
    echo "   node /opt/codeb/security/monitor/watchdog.js --status"
    echo "   node /opt/codeb/security/monitor/watchdog.js --backup <file>"
    echo "   node /opt/codeb/security/monitor/watchdog.js --lock <file>"
    echo ""
    echo "🔒 Watchdog가 시스템을 감시하고 있습니다!"
    echo ""
}

main "$@"
