#!/bin/bash
#
# CodeB we-cli 원라인 설치 스크립트
#
# 설치 명령어:
#   curl -fsSL https://raw.githubusercontent.com/codeblabdev-max/codeb-server/main/cli/install.sh | bash
#
# 또는 npm 직접 설치 (GitHub Package Registry):
#   echo "@codeblabdev-max:registry=https://npm.pkg.github.com" >> ~/.npmrc
#   npm install -g @codeblabdev-max/we-cli
#

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════╗"
echo "║   CodeB we-cli v3.2.9 설치                    ║"
echo "║   배포 • 분석 • 워크플로우 • MCP 통합          ║"
echo "╚═══════════════════════════════════════════════╝"
echo -e "${NC}"

# Node.js 버전 확인
echo -e "${YELLOW}1. Node.js 버전 확인...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js가 설치되어 있지 않습니다.${NC}"
    echo "   https://nodejs.org 에서 Node.js 18+ 버전을 설치하세요."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js 18+ 버전이 필요합니다. 현재: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}   ✅ Node.js $(node -v)${NC}"

# npm 버전 확인
echo -e "${YELLOW}2. npm 버전 확인...${NC}"
NPM_VERSION=$(npm -v | cut -d'.' -f1)
echo -e "${GREEN}   ✅ npm $(npm -v)${NC}"

# GitHub Package Registry 설정
echo -e "${YELLOW}3. GitHub Package Registry 설정...${NC}"
if ! grep -q "@codeblabdev-max:registry=https://npm.pkg.github.com" ~/.npmrc 2>/dev/null; then
    echo "@codeblabdev-max:registry=https://npm.pkg.github.com" >> ~/.npmrc
    echo -e "${GREEN}   ✅ .npmrc 설정 추가${NC}"
else
    echo -e "${GREEN}   ✅ .npmrc 이미 설정됨${NC}"
fi

# we-cli 설치
echo -e "${YELLOW}4. @codeblabdev-max/we-cli 설치...${NC}"
npm install -g @codeblabdev-max/we-cli

# 설치 확인
echo -e "${YELLOW}5. 설치 확인...${NC}"
if command -v we &> /dev/null; then
    echo -e "${GREEN}   ✅ we 명령어 설치 완료${NC}"
else
    echo -e "${RED}   ❌ we 명령어 설치 실패${NC}"
    exit 1
fi

# 완료 메시지
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ 설치 완료!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}🚀 시작하기:${NC}"
echo "   we help                    - 도움말 보기"
echo "   we config init             - 설정 초기화"
echo "   we workflow init myapp     - 프로젝트 생성"
echo "   we deploy myapp            - 배포"
echo ""
echo -e "${CYAN}📦 자동 설치 항목:${NC}"
echo "   ~/.claude/commands/we/     - Slash Commands"
echo "   ~/.claude/CLAUDE.md        - AI 규칙 (Socket.IO 금지, Centrifugo 사용)"
echo "   ~/.claude/hooks/           - 보안 Hooks"
echo "   ~/.claude.json             - MCP 서버 설정"
echo ""
echo -e "${CYAN}🌐 서버 인프라:${NC}"
echo "   n1.codeb.kr (158.247.203.55) - App Server"
echo "   n2.codeb.kr (141.164.42.213) - Streaming (Centrifugo)"
echo "   n3.codeb.kr (64.176.226.119) - Storage (PostgreSQL, Redis)"
echo "   n4.codeb.kr (141.164.37.63)  - Backup"
echo ""
echo -e "${YELLOW}⚠️  Claude Code를 재시작하여 MCP와 명령어를 로드하세요.${NC}"
echo ""
