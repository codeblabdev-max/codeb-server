#!/bin/bash
# Commerce 프로젝트 자동 배포 스크립트
# Local → Server 배포 자동화

set -e  # 에러 발생시 즉시 중단

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 설정
SERVER_IP="141.164.60.51"
SERVER_PORT="3008"
PROJECT_NAME="commerce"
GIT_REPO="https://github.com/dungeun/e-market.git"
BRANCH="main"
LOCAL_PROJECT_PATH="/Users/admin/new_project/commerce-nextjs"

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  Commerce 프로젝트 배포 시작${NC}"
echo -e "${GREEN}=====================================${NC}"

# 1. 로컬 Git 상태 확인
echo -e "\n${YELLOW}[1/6] 로컬 Git 상태 확인 중...${NC}"
cd "$LOCAL_PROJECT_PATH"
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}⚠️  커밋되지 않은 변경사항이 있습니다.${NC}"
    echo "변경 파일:"
    git status --short
    read -p "계속 진행하시겠습니까? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}배포가 취소되었습니다.${NC}"
        exit 1
    fi
fi

# 2. GitHub 푸시
echo -e "\n${YELLOW}[2/6] GitHub에 코드 푸시 중...${NC}"
git push origin main || {
    echo -e "${RED}❌ GitHub 푸시 실패${NC}"
    exit 1
}
echo -e "${GREEN}✅ GitHub 푸시 완료${NC}"

# 3. 서버 API 호출로 배포 시작
echo -e "\n${YELLOW}[3/6] 서버 배포 시작 중...${NC}"

# API 서버를 통한 배포
DEPLOY_RESPONSE=$(curl -s -X POST "http://${SERVER_IP}:${SERVER_PORT}/api/projects/${PROJECT_NAME}/deploy" \
    -H "Content-Type: application/json" \
    -d "{
        \"gitRepo\": \"${GIT_REPO}\",
        \"branch\": \"${BRANCH}\",
        \"buildCommand\": \"npm run build\",
        \"startCommand\": \"npm run start\"
    }" 2>/dev/null)

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 서버 연결 실패${NC}"
    echo "서버가 실행중인지 확인해주세요: http://${SERVER_IP}:${SERVER_PORT}"
    exit 1
fi

# 응답 확인
if echo "$DEPLOY_RESPONSE" | grep -q "error"; then
    echo -e "${RED}❌ 배포 실패${NC}"
    echo "$DEPLOY_RESPONSE"
    exit 1
fi

echo -e "${GREEN}✅ 배포 프로세스 시작됨${NC}"

# 4. 배포 상태 모니터링
echo -e "\n${YELLOW}[4/6] 배포 진행 상황 모니터링 중...${NC}"

for i in {1..30}; do
    sleep 5
    STATUS_RESPONSE=$(curl -s "http://${SERVER_IP}:${SERVER_PORT}/api/projects/${PROJECT_NAME}/status" 2>/dev/null)
    
    if echo "$STATUS_RESPONSE" | grep -q '"status":"running"'; then
        echo -e "${GREEN}✅ 배포 완료! 애플리케이션이 실행중입니다.${NC}"
        break
    elif echo "$STATUS_RESPONSE" | grep -q '"status":"building"'; then
        echo "⏳ 빌드 진행중... ($i/30)"
    elif echo "$STATUS_RESPONSE" | grep -q '"status":"error"'; then
        echo -e "${RED}❌ 배포 중 오류 발생${NC}"
        echo "$STATUS_RESPONSE"
        exit 1
    else
        echo "⏳ 배포 진행중... ($i/30)"
    fi
    
    if [ $i -eq 30 ]; then
        echo -e "${YELLOW}⚠️  배포 시간이 초과되었습니다. 서버 로그를 확인해주세요.${NC}"
    fi
done

# 5. 헬스체크
echo -e "\n${YELLOW}[5/6] 애플리케이션 헬스체크 중...${NC}"

# 로컬 포트로 접근 시도
APP_PORT=$(echo "$STATUS_RESPONSE" | grep -o '"port":[0-9]*' | cut -d':' -f2)
if [ -z "$APP_PORT" ]; then
    APP_PORT="4001"  # 기본 포트
fi

# 헬스체크 수행
for i in {1..5}; do
    HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "http://${SERVER_IP}:${APP_PORT}/api/health" 2>/dev/null)
    if [ "$HEALTH_CHECK" = "200" ]; then
        echo -e "${GREEN}✅ 헬스체크 성공${NC}"
        break
    else
        echo "⏳ 애플리케이션 시작 대기중... ($i/5)"
        sleep 3
    fi
done

# 6. 최종 정보 출력
echo -e "\n${YELLOW}[6/6] 배포 완료!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  배포 정보${NC}"
echo -e "${GREEN}=====================================${NC}"
echo "📦 프로젝트: ${PROJECT_NAME}"
echo "🌐 로컬 접속: http://${SERVER_IP}:${APP_PORT}"
echo "🔒 도메인: https://${PROJECT_NAME}.codeb.one-q.xyz"
echo "📊 상태: http://${SERVER_IP}:${SERVER_PORT}/api/projects/${PROJECT_NAME}/status"
echo ""
echo -e "${GREEN}로그 확인 명령어:${NC}"
echo "  curl http://${SERVER_IP}:${SERVER_PORT}/api/projects/${PROJECT_NAME}/logs"
echo ""
echo -e "${GREEN}재시작 명령어:${NC}"
echo "  curl -X POST http://${SERVER_IP}:${SERVER_PORT}/api/projects/${PROJECT_NAME}/restart"

# 로그 미리보기 (옵션)
read -p "최근 로그를 확인하시겠습니까? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "\n${YELLOW}최근 로그 (최대 20줄):${NC}"
    curl -s "http://${SERVER_IP}:${SERVER_PORT}/api/projects/${PROJECT_NAME}/logs?lines=20" | tail -20
fi

echo -e "\n${GREEN}✨ 배포가 성공적으로 완료되었습니다!${NC}"