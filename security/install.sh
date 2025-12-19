#!/bin/bash
#
# CodeB Security System - Installation Script
#
# 4-Layer Defense Architecture 설치
# - Protection Daemon
# - MCP Proxy Gateway
# - CLI Validator
# - Claude Code Hooks
#

set -e

# ============================================================================
# 색상 정의
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# 헬퍼 함수
# ============================================================================

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}🚨 $1${NC}"
}

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
        log_error "Node.js is not installed. Please install Node.js 18+"
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        log_error "Node.js 18+ required. Current: $(node -v)"
        exit 1
    fi

    # npm 확인
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi

    log_success "Requirements OK (Node.js $(node -v))"
}

# ============================================================================
# 디렉토리 생성
# ============================================================================

create_directories() {
    log_info "Creating directories..."

    mkdir -p /opt/codeb/security/daemon
    mkdir -p /opt/codeb/security/mcp-proxy
    mkdir -p /opt/codeb/security/cli
    mkdir -p /opt/codeb/security/hooks
    mkdir -p /var/run/codeb
    mkdir -p /var/lib/codeb
    mkdir -p /var/log/codeb
    mkdir -p /etc/codeb

    # 권한 설정
    chmod 755 /opt/codeb
    chmod 755 /opt/codeb/security
    chmod 750 /var/run/codeb
    chmod 750 /var/lib/codeb
    chmod 750 /var/log/codeb

    log_success "Directories created"
}

# ============================================================================
# 파일 복사
# ============================================================================

copy_files() {
    log_info "Copying files..."

    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    # Daemon 파일 복사
    cp "$SCRIPT_DIR/daemon/"*.js /opt/codeb/security/daemon/

    # MCP Proxy 파일 복사
    cp "$SCRIPT_DIR/mcp-proxy/"*.js /opt/codeb/security/mcp-proxy/

    # CLI 파일 복사
    cp "$SCRIPT_DIR/cli/"*.js /opt/codeb/security/cli/

    # Hooks 파일 복사
    cp "$SCRIPT_DIR/hooks/pre-bash.py" /opt/codeb/security/hooks/
    chmod +x /opt/codeb/security/hooks/pre-bash.py

    # Systemd 서비스 파일 복사
    cp "$SCRIPT_DIR/systemd/"*.service /etc/systemd/system/

    log_success "Files copied"
}

# ============================================================================
# 의존성 설치
# ============================================================================

install_dependencies() {
    log_info "Installing dependencies..."

    # Daemon 의존성
    cd /opt/codeb/security/daemon
    cat > package.json << 'EOF'
{
  "name": "codeb-protection-daemon",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "better-sqlite3": "^9.0.0"
  }
}
EOF
    npm install --production

    # MCP Proxy 의존성 (없음 - 순수 Node.js)
    cd /opt/codeb/security/mcp-proxy
    cat > package.json << 'EOF'
{
  "name": "codeb-mcp-proxy",
  "version": "1.0.0",
  "private": true,
  "dependencies": {}
}
EOF

    log_success "Dependencies installed"
}

# ============================================================================
# Systemd 서비스 설정
# ============================================================================

setup_systemd() {
    log_info "Setting up systemd services..."

    # 데몬 재로드
    systemctl daemon-reload

    # 서비스 활성화
    systemctl enable codeb-protection
    systemctl enable codeb-mcp-proxy

    # 서비스 시작
    systemctl start codeb-protection
    sleep 2  # Daemon이 먼저 시작되도록 대기

    systemctl start codeb-mcp-proxy

    log_success "Systemd services configured"
}

# ============================================================================
# Claude Code Hooks 설정
# ============================================================================

setup_claude_hooks() {
    log_info "Setting up Claude Code hooks..."

    # 사용자 홈 디렉토리 찾기
    if [ -n "$SUDO_USER" ]; then
        USER_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
    else
        USER_HOME="$HOME"
    fi

    CLAUDE_DIR="$USER_HOME/.claude"
    PROJECT_CLAUDE_DIR="$(pwd)/.claude"

    # 글로벌 hooks 디렉토리
    mkdir -p "$CLAUDE_DIR/hooks"

    # 글로벌 hook 복사
    cp /opt/codeb/security/hooks/pre-bash.py "$CLAUDE_DIR/hooks/"
    chmod +x "$CLAUDE_DIR/hooks/pre-bash.py"

    # 글로벌 settings.local.json 설정
    SETTINGS_FILE="$CLAUDE_DIR/settings.local.json"

    if [ -f "$SETTINGS_FILE" ]; then
        # 기존 파일 백업
        cp "$SETTINGS_FILE" "${SETTINGS_FILE}.backup.$(date +%s)"
    fi

    cat > "$SETTINGS_FILE" << 'EOF'
{
  "permissions": {
    "allow": [
      "Bash(we:*)",
      "Bash(we *)",
      "Bash(podman ps:*)",
      "Bash(podman ps *)",
      "Bash(podman logs:*)",
      "Bash(podman logs *)",
      "Bash(podman inspect:*)",
      "Bash(podman inspect *)",
      "Bash(podman images:*)",
      "Bash(podman stats:*)",
      "Bash(ls:*)",
      "Bash(cat:*)",
      "Bash(grep:*)",
      "Bash(find:*)",
      "Bash(curl:*)",
      "Bash(git:*)",
      "Bash(npm:*)",
      "Bash(node:*)"
    ],
    "deny": [
      "Bash(podman rm -f:*)",
      "Bash(podman rm -f *)",
      "Bash(podman rm --force:*)",
      "Bash(podman volume rm:*)",
      "Bash(podman volume rm *)",
      "Bash(podman system prune:*)",
      "Bash(podman volume prune:*)",
      "Bash(podman kill:*)",
      "Bash(docker rm -f:*)",
      "Bash(docker rm -f *)",
      "Bash(docker volume rm:*)",
      "Bash(docker-compose down -v*)",
      "Bash(rm -rf /opt/codeb*)",
      "Bash(rm -rf /var/lib/containers*)",
      "Bash(systemctl stop codeb*)",
      "Bash(pkill podman*)",
      "Bash(pkill codeb*)"
    ],
    "ask": [
      "Bash(podman stop:*)",
      "Bash(podman stop *)",
      "Bash(podman restart:*)",
      "Bash(docker stop:*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/pre-bash.py",
            "timeout": 5,
            "statusMessage": "🔒 Validating security rules..."
          }
        ]
      }
    ]
  },
  "enableAllProjectMcpServers": true
}
EOF

    # 소유자 설정
    if [ -n "$SUDO_USER" ]; then
        chown -R "$SUDO_USER:$(id -gn $SUDO_USER)" "$CLAUDE_DIR"
    fi

    log_success "Claude Code hooks configured"
}

# ============================================================================
# CLI에 Protection Client 통합
# ============================================================================

integrate_cli() {
    log_info "Integrating with CLI..."

    # we CLI에 protection client 연결
    CLI_DIR="/opt/codeb/cli"

    if [ -d "$CLI_DIR/src/lib" ]; then
        cp /opt/codeb/security/cli/protection-client.js "$CLI_DIR/src/lib/"
        log_success "CLI integration complete"
    else
        log_warn "CLI directory not found. Manual integration required."
    fi
}

# ============================================================================
# Watchdog Monitor 설치
# ============================================================================

install_watchdog() {
    log_info "Installing Watchdog Monitor..."

    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    # 디렉토리 생성
    mkdir -p /opt/codeb/security/monitor
    mkdir -p /var/lib/codeb/backups
    mkdir -p /var/lib/codeb/snapshots

    # Watchdog 파일 복사
    if [ -d "$SCRIPT_DIR/monitor" ]; then
        cp "$SCRIPT_DIR/monitor/watchdog.js" /opt/codeb/security/monitor/
        chmod +x /opt/codeb/security/monitor/watchdog.js

        # Systemd 서비스 복사
        if [ -f "$SCRIPT_DIR/monitor/systemd/codeb-watchdog.service" ]; then
            cp "$SCRIPT_DIR/monitor/systemd/codeb-watchdog.service" /etc/systemd/system/
        fi

        # 서비스 활성화 및 시작
        systemctl daemon-reload
        systemctl enable codeb-watchdog
        systemctl start codeb-watchdog

        log_success "Watchdog Monitor installed"
    else
        log_warn "Watchdog Monitor directory not found"
    fi
}

# ============================================================================
# 상태 확인
# ============================================================================

verify_installation() {
    log_info "Verifying installation..."

    # Protection Daemon 상태
    if systemctl is-active --quiet codeb-protection; then
        log_success "Protection Daemon: Running"
    else
        log_error "Protection Daemon: Not running"
        systemctl status codeb-protection --no-pager || true
    fi

    # MCP Proxy 상태
    if systemctl is-active --quiet codeb-mcp-proxy; then
        log_success "MCP Proxy Gateway: Running"
    else
        log_error "MCP Proxy Gateway: Not running"
        systemctl status codeb-mcp-proxy --no-pager || true
    fi

    # Socket 파일 확인
    if [ -S /var/run/codeb/protection.sock ]; then
        log_success "Protection Socket: Available"
    else
        log_error "Protection Socket: Not found"
    fi

    # 연결 테스트
    echo '{"action":"health"}' | nc -U /var/run/codeb/protection.sock 2>/dev/null && \
        log_success "Socket Connection: OK" || \
        log_warn "Socket Connection: Failed (install nc for testing)"

    # Watchdog 상태
    if systemctl is-active --quiet codeb-watchdog; then
        log_success "Watchdog Monitor: Running"
    else
        log_warn "Watchdog Monitor: Not running"
    fi
}

# ============================================================================
# 메인
# ============================================================================

main() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║       CodeB Security System - Installation Script              ║"
    echo "║                  4-Layer Defense Architecture                  ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""

    check_requirements
    create_directories
    copy_files
    install_dependencies
    setup_systemd
    setup_claude_hooks
    integrate_cli
    install_watchdog
    verify_installation

    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                    Installation Complete!                      ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "📋 서비스 관리:"
    echo "   sudo systemctl status codeb-protection"
    echo "   sudo systemctl status codeb-mcp-proxy"
    echo "   sudo systemctl status codeb-watchdog"
    echo ""
    echo "📋 로그 확인:"
    echo "   sudo journalctl -u codeb-protection -f"
    echo "   sudo journalctl -u codeb-mcp-proxy -f"
    echo "   sudo journalctl -u codeb-watchdog -f"
    echo ""
    echo "📋 테스트:"
    echo "   node /opt/codeb/security/cli/protection-client.js --status"
    echo "   node /opt/codeb/security/cli/protection-client.js 'podman rm -f test'"
    echo ""
    echo "📋 Watchdog 명령:"
    echo "   node /opt/codeb/security/monitor/watchdog.js --status"
    echo "   node /opt/codeb/security/monitor/watchdog.js --lock <file>"
    echo ""
    echo "🔒 보안 시스템 + 모니터링이 활성화되었습니다!"
    echo ""
}

main "$@"
