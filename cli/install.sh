#!/bin/bash
#
# CodeB we-cli 원라인 설치 스크립트
# VERSION은 설치 후 VERSION 파일에서 자동으로 읽힘 (SSOT)
#
# 설치 방법 1 (권장 — GitHub 직접 설치):
#   curl -fsSL https://raw.githubusercontent.com/codeb-dev-run/codeb-server/main/install.sh | bash
#
# 설치 방법 2 (npm — GitHub Package Registry):
#   echo "@codeb-dev-run:registry=https://npm.pkg.github.com" >> ~/.npmrc
#   npm install -g @codeb-dev-run/we-cli
#
# 설치 방법 3 (npm — npmjs.org):
#   npm install -g @codeb-dev-run/we-cli
#

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════╗"
echo "║   CodeB we-cli 설치                                    ║"
echo "║   배포 • 모니터링 • 워크플로우 • MCP 통합              ║"
echo "╚═══════════════════════════════════════════════════════╝"
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
echo -e "${GREEN}   ✅ npm $(npm -v)${NC}"

# GitHub Package Registry 설정
echo -e "${YELLOW}3. GitHub Package Registry 설정...${NC}"
if ! grep -q "@codeb-dev-run:registry=https://npm.pkg.github.com" ~/.npmrc 2>/dev/null; then
    echo "@codeb-dev-run:registry=https://npm.pkg.github.com" >> ~/.npmrc
    echo -e "${GREEN}   ✅ .npmrc 설정 추가${NC}"
else
    echo -e "${GREEN}   ✅ .npmrc 이미 설정됨${NC}"
fi

# we-cli 설치
echo -e "${YELLOW}4. @codeb-dev-run/we-cli 설치...${NC}"
npm install -g @codeb-dev-run/we-cli

# 설치 확인
echo -e "${YELLOW}5. 설치 확인...${NC}"
if command -v we &> /dev/null; then
    WE_VERSION=$(we --version 2>/dev/null || echo "installed")
    echo -e "${GREEN}   ✅ we 명령어 설치 완료 (${WE_VERSION})${NC}"
else
    echo -e "${RED}   ❌ we 명령어 설치 실패${NC}"
    exit 1
fi

# 완료 메시지
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ 설치 완료!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}다음 단계:${NC}"
echo "   1. API 키 설정:   we init <API_KEY>"
echo "   2. Claude Code 재시작"
echo "   3. 상태 확인:     /we:health"
echo "   4. 배포:          /we:deploy <프로젝트>"
echo ""
echo -e "${CYAN}자동 설치 항목:${NC}"
echo "   ~/.claude/skills/       - Skills (자동 활성화)"
echo "   ~/.claude/CLAUDE.md     - AI 규칙"
echo "   ~/.claude/hooks/        - 보안 Hooks"
echo "   ~/.claude/settings.json - MCP 서버 설정"
echo ""
echo -e "${CYAN}서버 인프라:${NC}"
echo "   App:       158.247.203.55 (MCP API, Caddy, Docker)"
echo "   Streaming: 141.164.42.213 (Centrifugo WebSocket)"
echo "   Storage:   64.176.226.119 (PostgreSQL, Redis)"
echo "   Backup:    141.164.37.63  (Prometheus, Grafana)"
echo ""
echo -e "${YELLOW}⚠️  Claude Code를 재시작하여 MCP와 Skills를 로드하세요.${NC}"
echo ""
