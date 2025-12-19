#!/bin/bash
# 간단한 Commerce 배포 스크립트
# CLI v2를 사용한 직접 배포

set -e

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  Commerce 프로젝트 배포 (CLI v2)${NC}"
echo -e "${GREEN}=====================================${NC}"

# 변수 설정
PROJECT_NAME="commerce"
GIT_REPO="https://github.com/dungeun/e-market.git"
BRANCH="main"

# 1. GitHub 최신 코드 푸시
echo -e "\n${YELLOW}[1/3] GitHub에 최신 코드 푸시 중...${NC}"
cd /Users/admin/new_project/commerce-nextjs
git add .
git commit -m "Deploy to production" || true
git push origin main || true
echo -e "${GREEN}✅ GitHub 동기화 완료${NC}"

# 2. 서버에 배포 (CLI v2 사용)
echo -e "\n${YELLOW}[2/3] 서버에 배포 중...${NC}"
cd /Users/admin/new_project/codeb-server

# 프로젝트가 없으면 생성 시도
echo "프로젝트 존재 여부 확인..."
PROJECT_EXISTS=$(curl -s "http://141.164.60.51:3008/api/projects" | grep -c '"name":"commerce"' || echo "0")

if [ "$PROJECT_EXISTS" = "0" ]; then
    echo "프로젝트가 없습니다. 새로 생성 시도..."
    ./codeb-cli-v2.sh create commerce nodejs 2>/dev/null || {
        echo -e "${YELLOW}⚠️  프로젝트 생성 실패. 기존 프로젝트로 계속 진행...${NC}"
    }
fi

# 배포 실행
echo "배포 시작..."
./codeb-cli-v2.sh deploy commerce "$GIT_REPO" "$BRANCH" || {
    echo -e "${RED}❌ 배포 명령 실패${NC}"
    echo "대체 방법: GitHub Actions를 사용하여 배포"
    
    # GitHub Actions 트리거
    echo -e "\n${YELLOW}GitHub Actions 배포 트리거 중...${NC}"
    cd /Users/admin/new_project/commerce-nextjs
    
    # workflow_dispatch 이벤트 트리거
    gh workflow run cd-production.yml 2>/dev/null || {
        echo "GitHub CLI가 설치되어 있지 않습니다."
        echo "수동으로 배포하려면:"
        echo "1. https://github.com/dungeun/e-market/actions 접속"
        echo "2. 'CD - Deploy to Production' 워크플로우 선택"
        echo "3. 'Run workflow' 버튼 클릭"
    }
}

# 3. 배포 상태 확인
echo -e "\n${YELLOW}[3/3] 배포 상태 확인 중...${NC}"
sleep 5

# 상태 체크
STATUS=$(./codeb-cli-v2.sh status commerce 2>/dev/null || echo "UNKNOWN")

if [[ "$STATUS" == *"running"* ]] || [[ "$STATUS" == *"RUNNING"* ]]; then
    echo -e "${GREEN}✅ 배포 성공!${NC}"
    echo ""
    echo "🌐 접속 URL:"
    echo "   - 로컬: http://141.164.60.51:4001"
    echo "   - 도메인: https://commerce.codeb.one-q.xyz"
else
    echo -e "${YELLOW}⚠️  배포 상태를 확인할 수 없습니다.${NC}"
    echo ""
    echo "수동 확인 방법:"
    echo "   ./codeb-cli-v2.sh status commerce"
    echo "   ./codeb-cli-v2.sh logs commerce app 50"
fi

echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  배포 프로세스 완료${NC}"
echo -e "${GREEN}=====================================${NC}"