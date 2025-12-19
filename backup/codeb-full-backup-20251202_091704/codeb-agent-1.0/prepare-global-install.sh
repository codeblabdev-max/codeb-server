#!/bin/bash

# CodeB Agent 1.0 - Prepare Global Installation
# 전역 설치 준비 스크립트

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${PURPLE}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║     CodeB Agent 1.0 - Global Installation Prep        ║${NC}"
echo -e "${PURPLE}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# 현재 디렉토리 확인
CURRENT_DIR=$(pwd)
echo -e "${CYAN}📁 Current directory:${NC} $CURRENT_DIR"
echo ""

# 로컬 설치 확인
if [ -d "$HOME/.codeb-agent" ]; then
    echo -e "${GREEN}✅ Local installation found${NC}"
    echo -e "   Location: $HOME/.codeb-agent"
    echo ""
fi

# 전역 설치를 위한 디렉토리 구조 미리보기
echo -e "${CYAN}📋 Global installation will create:${NC}"
echo -e "   ${YELLOW}/usr/local/codeb-agent/${NC}      - Main installation"
echo -e "   ${YELLOW}/usr/local/bin/@codeb-*${NC}      - Command symlinks"
echo -e "   ${YELLOW}/etc/codeb-agent/${NC}             - Configuration"
echo -e "   ${YELLOW}/var/lib/codeb-agent/${NC}         - Data storage"
echo -e "   ${YELLOW}/etc/profile.d/codeb-agent.sh${NC} - System environment"
echo ""

# 파일 목록
echo -e "${CYAN}📦 Files to be installed:${NC}"
echo -e "   • bin/codeb (Main CLI)"
echo -e "   • scripts/codeb-agent-executor.sh (49 agents)"
echo -e "   • config/mcp-config.json (MCP settings)"
echo -e "   • docs/* (5 documentation files)"
echo ""

# 명령어 생성
INSTALL_CMD="sudo ./install.sh --global"

echo -e "${CYAN}🔧 Installation commands:${NC}"
echo -e "${GREEN}================================================${NC}"
echo "cd $CURRENT_DIR"
echo "$INSTALL_CMD"
echo -e "${GREEN}================================================${NC}"
echo ""

# 설치 스크립트 생성
cat > global-install.command <<'EOF'
#!/bin/bash
cd "$(dirname "$0")"
echo "CodeB Agent 1.0 - Global Installation"
echo "======================================"
echo ""
echo "Installing to /usr/local/codeb-agent..."
echo "This requires administrator privileges."
echo ""
sudo ./install.sh --global
echo ""
echo "Installation complete!"
echo "Press any key to exit..."
read -n 1
EOF

chmod +x global-install.command

echo -e "${GREEN}✅ Preparation complete!${NC}"
echo ""
echo -e "${YELLOW}📌 To install globally, you have 3 options:${NC}"
echo ""
echo -e "${BLUE}Option 1: Run the command directly${NC}"
echo "   $INSTALL_CMD"
echo ""
echo -e "${BLUE}Option 2: Double-click the installer${NC}"
echo "   ./global-install.command"
echo ""
echo -e "${BLUE}Option 3: Copy to clipboard and paste in terminal${NC}"
echo "   The commands have been prepared above"
echo ""
echo -e "${PURPLE}Note: You will be prompted for your password${NC}"