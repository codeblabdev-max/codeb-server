#!/bin/bash

# CodeB API v3.5 서버 배포 스크립트

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 서버 정보
SERVER="141.164.60.51"
SERVER_USER="root"
API_PATH="/root"

echo -e "${BOLD}${CYAN}🚀 CodeB API v3.5 배포${NC}"
echo ""

# 1. API 서버 파일 업로드
echo -e "${BLUE}📤 API 서버 파일 업로드 중...${NC}"
scp codeb-api-server-v3.5.js $SERVER_USER@$SERVER:$API_PATH/codeb-api-server.js

# 2. 백업 생성
echo -e "${BLUE}💾 기존 버전 백업 중...${NC}"
ssh $SERVER_USER@$SERVER << 'EOF'
cd /root
cp codeb-api-server.js codeb-api-server-v2-backup.js 2>/dev/null || true
cp projects.json projects-v2-backup.json 2>/dev/null || true
EOF

# 3. PM2로 재시작
echo -e "${BLUE}🔄 API 서버 재시작 중...${NC}"
ssh $SERVER_USER@$SERVER << 'EOF'
cd /root
pm2 stop codeb-api-server
pm2 start codeb-api-server.js --name codeb-api-server
pm2 save
EOF

# 4. 상태 확인
echo -e "${BLUE}✅ 상태 확인 중...${NC}"
sleep 3
curl -s http://$SERVER:3008/health | jq '.'

echo ""
echo -e "${GREEN}✅ 배포 완료!${NC}"
echo ""
echo -e "${BOLD}📌 사용 방법:${NC}"
echo ""
echo "1. 플랫폼 초기화 (API 키 없이도 작동):"
echo "   codeb platform init http://$SERVER:3008/api/platform"
echo ""
echo "2. 프로젝트 생성:"
echo "   codeb platform create myapp nextjs"
echo ""
echo "3. 로컬에서 개발 (원격 DB/Redis 사용):"
echo "   cd myapp"
echo "   cp .env.remote .env.local"
echo "   npm run dev"
echo ""
echo -e "${YELLOW}💡 서버의 PostgreSQL과 Redis를 사용하여 로컬 개발이 가능합니다.${NC}"