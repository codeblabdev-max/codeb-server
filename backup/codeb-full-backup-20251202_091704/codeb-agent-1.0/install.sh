#!/bin/bash

# CodeB Agent 1.0 - Installation Script
# 시스템 전역 및 로컬 설치 지원

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# 버전 정보
VERSION=$(cat VERSION)
INSTALL_TYPE="${1:-local}"

# 로고 표시
show_logo() {
    echo -e "${PURPLE}"
    echo "╔═══════════════════════════════════════╗"
    echo "║       CodeB Agent Installation        ║"
    echo "║           Version $VERSION            ║"
    echo "╚═══════════════════════════════════════╝"
    echo -e "${NC}"
}

# 설치 경로 설정
if [ "$INSTALL_TYPE" = "--global" ] || [ "$INSTALL_TYPE" = "global" ]; then
    INSTALL_DIR="/usr/local/codeb-agent"
    BIN_DIR="/usr/local/bin"
    CONFIG_DIR="/etc/codeb-agent"
    DATA_DIR="/var/lib/codeb-agent"
    INSTALL_TYPE="global"
    echo -e "${CYAN}🌍 Global installation selected${NC}"
else
    INSTALL_DIR="$HOME/.codeb-agent"
    BIN_DIR="$HOME/.local/bin"
    CONFIG_DIR="$HOME/.config/codeb-agent"
    DATA_DIR="$HOME/.local/share/codeb-agent"
    INSTALL_TYPE="local"
    echo -e "${CYAN}📁 Local installation selected${NC}"
fi

# 권한 확인
check_permissions() {
    if [ "$INSTALL_TYPE" = "global" ]; then
        if [ "$EUID" -ne 0 ]; then
            echo -e "${RED}❌ Global installation requires sudo${NC}"
            echo -e "${YELLOW}Please run: sudo ./install.sh --global${NC}"
            exit 1
        fi
    fi
}

# 디렉토리 생성
create_directories() {
    echo -e "${BLUE}📁 Creating directories...${NC}"
    
    # 메인 디렉토리
    mkdir -p "$INSTALL_DIR"/{bin,scripts,lib,config,docs,data,tests}
    mkdir -p "$BIN_DIR"
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$DATA_DIR"
    
    # 체크포인트 디렉토리
    mkdir -p "$DATA_DIR/checkpoints"
    mkdir -p "$DATA_DIR/patterns"
    mkdir -p "$DATA_DIR/reports"
    
    echo -e "  ${GREEN}✓${NC} Directories created"
}

# 파일 복사
copy_files() {
    echo -e "${BLUE}📋 Copying files...${NC}"
    
    # 실행 파일
    cp bin/codeb "$INSTALL_DIR/bin/"
    chmod +x "$INSTALL_DIR/bin/codeb"
    
    # 스크립트
    cp -r scripts/* "$INSTALL_DIR/scripts/"
    chmod +x "$INSTALL_DIR/scripts/"*.sh
    
    # 설정 파일
    cp config/* "$CONFIG_DIR/"
    
    # 라이브러리
    if [ -d "lib" ] && [ "$(ls -A lib)" ]; then
        cp -r lib/* "$INSTALL_DIR/lib/"
    fi
    
    # 문서
    cp -r docs/* "$INSTALL_DIR/docs/"
    
    # 버전 파일
    cp VERSION "$INSTALL_DIR/"
    cp README.md "$INSTALL_DIR/"
    
    echo -e "  ${GREEN}✓${NC} Files copied"
}

# 심볼릭 링크 생성
create_symlinks() {
    echo -e "${BLUE}🔗 Creating symlinks...${NC}"
    
    # codeb 명령어 링크
    ln -sf "$INSTALL_DIR/bin/codeb" "$BIN_DIR/codeb"
    ln -sf "$INSTALL_DIR/bin/codeb" "$BIN_DIR/@codeb-init"
    ln -sf "$INSTALL_DIR/bin/codeb" "$BIN_DIR/@codeb-analyze"
    ln -sf "$INSTALL_DIR/bin/codeb" "$BIN_DIR/@codeb-optimize"
    ln -sf "$INSTALL_DIR/bin/codeb" "$BIN_DIR/@codeb-cleanup"
    ln -sf "$INSTALL_DIR/bin/codeb" "$BIN_DIR/@codeb-pattern"
    ln -sf "$INSTALL_DIR/bin/codeb" "$BIN_DIR/@codeb-monitor"
    ln -sf "$INSTALL_DIR/bin/codeb" "$BIN_DIR/@codeb-delegate"
    ln -sf "$INSTALL_DIR/bin/codeb" "$BIN_DIR/@codeb-status"
    ln -sf "$INSTALL_DIR/bin/codeb" "$BIN_DIR/@codeb-help"
    
    echo -e "  ${GREEN}✓${NC} Symlinks created"
}

# 환경 변수 설정
setup_environment() {
    echo -e "${BLUE}🔧 Setting up environment...${NC}"
    
    # 환경 변수 파일
    ENV_FILE="$CONFIG_DIR/codeb.env"
    cat > "$ENV_FILE" <<EOF
# CodeB Agent Environment Variables
export CODEB_HOME="$INSTALL_DIR"
export CODEB_CONFIG="$CONFIG_DIR"
export CODEB_DATA="$DATA_DIR"
export CODEB_VERSION="$VERSION"
export PATH="\$PATH:$BIN_DIR"
EOF
    
    # Shell 설정 추가
    if [ "$INSTALL_TYPE" = "local" ]; then
        SHELL_RC=""
        if [ -f "$HOME/.bashrc" ]; then
            SHELL_RC="$HOME/.bashrc"
        elif [ -f "$HOME/.zshrc" ]; then
            SHELL_RC="$HOME/.zshrc"
        fi
        
        if [ -n "$SHELL_RC" ]; then
            # 기존 설정 제거
            sed -i.bak '/# CodeB Agent/,/# End CodeB Agent/d' "$SHELL_RC" 2>/dev/null || true
            
            # 새 설정 추가
            echo "" >> "$SHELL_RC"
            echo "# CodeB Agent" >> "$SHELL_RC"
            echo "[ -f $ENV_FILE ] && source $ENV_FILE" >> "$SHELL_RC"
            echo "# End CodeB Agent" >> "$SHELL_RC"
            
            echo -e "  ${GREEN}✓${NC} Shell configuration updated"
        fi
    else
        # 전역 설치 시 /etc/profile.d/ 사용
        cat > /etc/profile.d/codeb-agent.sh <<EOF
#!/bin/bash
# CodeB Agent System-wide Configuration
[ -f $ENV_FILE ] && source $ENV_FILE
EOF
        chmod +x /etc/profile.d/codeb-agent.sh
        echo -e "  ${GREEN}✓${NC} System-wide configuration created"
    fi
}

# MCP 설정
setup_mcp() {
    echo -e "${BLUE}🔌 Setting up MCP integration...${NC}"
    
    # Claude Code MCP 설정 파일 위치
    if [ "$INSTALL_TYPE" = "local" ]; then
        MCP_CONFIG="$HOME/.config/claude/mcp.json"
    else
        MCP_CONFIG="/etc/claude/mcp.json"
    fi
    
    # MCP 디렉토리 생성
    mkdir -p "$(dirname "$MCP_CONFIG")"
    
    # MCP 설정 추가 (기존 설정 보존)
    if [ -f "$MCP_CONFIG" ]; then
        echo -e "  ${YELLOW}⚠️${NC} Existing MCP config found, backing up..."
        cp "$MCP_CONFIG" "$MCP_CONFIG.backup"
    fi
    
    # 새 MCP 설정 생성
    cat > "$MCP_CONFIG" <<EOF
{
  "servers": {
    "codeb-agent": {
      "command": "$INSTALL_DIR/bin/codeb",
      "args": ["mcp-server"],
      "config": {
        "dataDir": "$DATA_DIR",
        "configDir": "$CONFIG_DIR"
      }
    }
  }
}
EOF
    
    echo -e "  ${GREEN}✓${NC} MCP integration configured"
}

# 테스트 실행
run_tests() {
    echo -e "${BLUE}🧪 Running installation tests...${NC}"
    
    # 명령어 테스트
    if command -v codeb &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} codeb command available"
    else
        echo -e "  ${RED}❌${NC} codeb command not found"
        echo -e "  ${YELLOW}Please add $BIN_DIR to your PATH${NC}"
    fi
    
    # 버전 확인
    if [ -f "$INSTALL_DIR/VERSION" ]; then
        INSTALLED_VERSION=$(cat "$INSTALL_DIR/VERSION")
        echo -e "  ${GREEN}✓${NC} Version $INSTALLED_VERSION installed"
    fi
    
    # SQLite 확인
    if command -v sqlite3 &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} SQLite3 available"
    else
        echo -e "  ${YELLOW}⚠️${NC} SQLite3 not found (optional)"
    fi
}

# 설치 요약
show_summary() {
    echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
    echo -e "${GREEN}✅ CodeB Agent $VERSION Installation Complete!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════${NC}\n"
    
    echo -e "${CYAN}📍 Installation Details:${NC}"
    echo -e "  • Type: ${YELLOW}$INSTALL_TYPE${NC}"
    echo -e "  • Install Dir: ${YELLOW}$INSTALL_DIR${NC}"
    echo -e "  • Config Dir: ${YELLOW}$CONFIG_DIR${NC}"
    echo -e "  • Data Dir: ${YELLOW}$DATA_DIR${NC}"
    echo -e "  • Bin Dir: ${YELLOW}$BIN_DIR${NC}"
    
    echo -e "\n${CYAN}🎯 Available Commands:${NC}"
    echo -e "  ${GREEN}@codeb-init${NC}     - Initialize project"
    echo -e "  ${GREEN}@codeb-analyze${NC}  - Run 49-agent analysis"
    echo -e "  ${GREEN}@codeb-optimize${NC} - Optimize project"
    echo -e "  ${GREEN}@codeb-help${NC}     - Show help"
    
    echo -e "\n${CYAN}🚀 Next Steps:${NC}"
    if [ "$INSTALL_TYPE" = "local" ]; then
        echo -e "  1. Reload your shell: ${YELLOW}source ~/.bashrc${NC}"
    else
        echo -e "  1. Reload environment: ${YELLOW}source /etc/profile.d/codeb-agent.sh${NC}"
    fi
    echo -e "  2. Test installation: ${YELLOW}@codeb-help${NC}"
    echo -e "  3. Initialize project: ${YELLOW}@codeb-init${NC}"
    
    echo -e "\n${PURPLE}Thank you for installing CodeB Agent!${NC}"
}

# 메인 설치 프로세스
main() {
    show_logo
    check_permissions
    
    echo -e "${CYAN}📦 Installing CodeB Agent $VERSION...${NC}\n"
    
    create_directories
    copy_files
    create_symlinks
    setup_environment
    setup_mcp
    run_tests
    show_summary
}

# 설치 실행
main