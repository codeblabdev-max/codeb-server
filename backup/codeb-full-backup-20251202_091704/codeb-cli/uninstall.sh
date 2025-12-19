#!/bin/bash

# CodeB CLI v3.5 - 전역 제거 스크립트

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 설치 디렉토리
INSTALL_DIR="/usr/local/bin"
CODEB_HOME="$HOME/.codeb"

echo -e "${BOLD}${CYAN}🗑️  CodeB CLI v3.5 제거${NC}"
echo ""

# 확인
read -p "정말로 CodeB CLI를 제거하시겠습니까? (y/N): " -r response
if [[ ! $response =~ ^[Yy]$ ]]; then
    echo "제거가 취소되었습니다."
    exit 0
fi

echo ""
echo -e "${BLUE}📋 제거 진행 중...${NC}"

# 1. 심볼릭 링크 제거
if [ -L "$INSTALL_DIR/codeb" ]; then
    if [ -w "$INSTALL_DIR" ]; then
        rm -f "$INSTALL_DIR/codeb"
        echo -e "${GREEN}✅ 전역 명령어 제거됨${NC}"
    else
        echo -e "${YELLOW}⚠️  sudo로 전역 명령어를 제거하세요:${NC}"
        echo "   sudo rm -f $INSTALL_DIR/codeb"
    fi
fi

# 2. 설정 파일 백업 여부 확인
if [ -d "$CODEB_HOME" ]; then
    read -p "설정 파일을 백업하시겠습니까? (Y/n): " -r backup_response
    if [[ ! $backup_response =~ ^[Nn]$ ]]; then
        BACKUP_DIR="$HOME/codeb-backup-$(date +%Y%m%d-%H%M%S)"
        mkdir -p "$BACKUP_DIR"
        
        # 중요한 설정 파일만 백업
        [ -f "$CODEB_HOME/config.json" ] && cp "$CODEB_HOME/config.json" "$BACKUP_DIR/" 2>/dev/null || true
        [ -d "$CODEB_HOME/templates" ] && cp -r "$CODEB_HOME/templates" "$BACKUP_DIR/" 2>/dev/null || true
        
        echo -e "${GREEN}✅ 백업 완료: $BACKUP_DIR${NC}"
    fi
fi

# 3. CodeB 홈 디렉토리 제거
if [ -d "$CODEB_HOME" ]; then
    rm -rf "$CODEB_HOME"
    echo -e "${GREEN}✅ CodeB 홈 디렉토리 제거됨${NC}"
fi

# 4. PATH 설정 안내
echo ""
echo -e "${YELLOW}📌 PATH 설정 제거:${NC}"
echo ""
echo "다음 파일에서 CodeB 관련 PATH 설정을 수동으로 제거하세요:"
echo ""

for rc_file in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
    if [ -f "$rc_file" ] && grep -q ".codeb/bin" "$rc_file"; then
        echo "  • $rc_file"
        echo "    제거할 라인: export PATH=\"\$HOME/.codeb/bin:\$PATH\""
    fi
done

echo ""
echo -e "${BOLD}${GREEN}✅ CodeB CLI 제거가 완료되었습니다.${NC}"
echo ""
echo "재설치하려면:"
echo "  ./install.sh"