#!/bin/bash

# CodeB Platform API 시작 스크립트

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 환경 변수 설정
export PORT="${PORT:-3010}"
export API_KEY="${API_KEY:-$(openssl rand -hex 32)}"
export SERVER_IP="${SERVER_IP:-141.164.60.51}"
export PROJECTS_DIR="${PROJECTS_DIR:-/opt/codeb-projects}"
export STORAGE_DIR="${STORAGE_DIR:-/opt/codeb-storage}"

echo -e "${BOLD}${CYAN}🚀 CodeB Platform API 시작${NC}"
echo ""
echo -e "${BLUE}📋 설정:${NC}"
echo "   포트: $PORT"
echo "   API 키: $API_KEY"
echo "   서버 IP: $SERVER_IP"
echo "   프로젝트 디렉토리: $PROJECTS_DIR"
echo "   스토리지 디렉토리: $STORAGE_DIR"
echo ""

# npm 패키지 설치 확인
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 npm 패키지 설치 중...${NC}"
    npm install express cors
fi

# PM2로 실행
if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}✅ PM2로 API 서버 시작${NC}"
    pm2 start codeb-platform-api.js --name codeb-platform-api \
        --env PORT="$PORT" \
        --env API_KEY="$API_KEY" \
        --env SERVER_IP="$SERVER_IP" \
        --env PROJECTS_DIR="$PROJECTS_DIR" \
        --env STORAGE_DIR="$STORAGE_DIR"
    
    echo ""
    echo -e "${GREEN}✅ API 서버가 시작되었습니다!${NC}"
    echo ""
    echo -e "${BOLD}📌 로컬 CLI 설정:${NC}"
    echo ""
    echo "   codeb platform init http://$SERVER_IP:$PORT/api $API_KEY"
    echo ""
else
    # Node.js로 직접 실행
    echo -e "${GREEN}✅ Node.js로 API 서버 시작${NC}"
    node codeb-platform-api.js
fi