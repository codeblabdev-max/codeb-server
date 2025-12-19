#!/bin/bash

# Coolify Extended CLI - 프로젝트 및 애플리케이션 관리 추가 기능
# 사용법: source coolify-extended-cli.sh

COOLIFY_URL="http://141.164.60.51:8000"
COOLIFY_TOKEN="7|hhVQUT7DdQEBUD3Ac992z9Zx2OVkaGjXye3f7BtEb0fb5881"

# 색상 코드
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 프로젝트 목록 보기
coolify-projects() {
    echo -e "${BLUE}=== Coolify 프로젝트 목록 ===${NC}"
    curl -s -H "Authorization: Bearer $COOLIFY_TOKEN" \
        "$COOLIFY_URL/api/v1/projects" | \
        python3 -m json.tool 2>/dev/null || \
        curl -s -H "Authorization: Bearer $COOLIFY_TOKEN" \
        "$COOLIFY_URL/api/v1/projects" | \
        jq '.' 2>/dev/null || \
        echo "JSON 파싱 도구가 필요합니다 (python3 또는 jq)"
}

# 프로젝트 목록 (테이블 형식)
coolify-projects-table() {
    echo -e "${BLUE}=== Coolify 프로젝트 목록 ===${NC}"
    echo "ID | UUID                     | 이름                    | 설명"
    echo "---|--------------------------|-------------------------|--------------------------------"
    curl -s -H "Authorization: Bearer $COOLIFY_TOKEN" \
        "$COOLIFY_URL/api/v1/projects" | \
        python3 -c "
import json, sys
data = json.load(sys.stdin)
for p in data:
    print(f\"{p['id']:<3}| {p['uuid']:<24} | {p['name']:<23} | {p.get('description', 'N/A')}\")
"
}

# 애플리케이션 목록 보기
coolify-applications() {
    echo -e "${BLUE}=== Coolify 애플리케이션 목록 ===${NC}"
    curl -s -H "Authorization: Bearer $COOLIFY_TOKEN" \
        "$COOLIFY_URL/api/v1/applications" | \
        python3 -m json.tool 2>/dev/null || \
        jq '.' 2>/dev/null
}

# 특정 프로젝트 상세 정보
coolify-project() {
    if [ -z "$1" ]; then
        echo "사용법: coolify-project <PROJECT_UUID>"
        return 1
    fi
    echo -e "${BLUE}=== 프로젝트 상세 정보: $1 ===${NC}"
    curl -s -H "Authorization: Bearer $COOLIFY_TOKEN" \
        "$COOLIFY_URL/api/v1/projects/$1" | \
        python3 -m json.tool
}

# 데이터베이스 목록
coolify-databases() {
    echo -e "${BLUE}=== Coolify 데이터베이스 목록 ===${NC}"
    curl -s -H "Authorization: Bearer $COOLIFY_TOKEN" \
        "$COOLIFY_URL/api/v1/databases" | \
        python3 -m json.tool
}

# 서비스 목록
coolify-services() {
    echo -e "${BLUE}=== Coolify 서비스 목록 ===${NC}"
    curl -s -H "Authorization: Bearer $COOLIFY_TOKEN" \
        "$COOLIFY_URL/api/v1/services" | \
        python3 -m json.tool
}

# 도움말
coolify-help() {
    echo -e "${GREEN}Coolify Extended CLI 명령어${NC}"
    echo ""
    echo "프로젝트 관리:"
    echo "  coolify-projects         - 프로젝트 목록 (JSON)"
    echo "  coolify-projects-table   - 프로젝트 목록 (테이블)"
    echo "  coolify-project <UUID>   - 프로젝트 상세 정보"
    echo ""
    echo "리소스 관리:"
    echo "  coolify-applications     - 애플리케이션 목록"
    echo "  coolify-databases        - 데이터베이스 목록"
    echo "  coolify-services         - 서비스 목록"
    echo ""
    echo "기본 CLI:"
    echo "  ~/coolify-cli servers list    - 서버 목록"
    echo "  ~/coolify-cli instances list  - 인스턴스 목록"
}

# 별칭 설정
alias cprojects="coolify-projects-table"
alias capps="coolify-applications"
alias cdbs="coolify-databases"
alias cservices="coolify-services"
alias chelp="coolify-help"

echo -e "${GREEN}✅ Coolify Extended CLI 로드됨!${NC}"
echo "사용 가능한 명령어를 보려면 'coolify-help' 또는 'chelp'를 입력하세요."