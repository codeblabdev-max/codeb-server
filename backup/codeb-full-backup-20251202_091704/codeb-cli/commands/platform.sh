#!/bin/bash

# CodeB CLI v3.5 - Platform 명령어 모듈
# 원격 서버의 프로젝트별 컨테이너 관리

# 색상 정의
source "$CLI_ROOT/lib/colors.sh"

# 플랫폼 설정
PLATFORM_API="${CODEB_PLATFORM_API:-http://141.164.60.51:3010/api}"
PLATFORM_KEY="${CODEB_PLATFORM_KEY:-}"

# 설정 파일 경로
PLATFORM_CONFIG="$HOME/.codeb/platform.json"

# =============================================================================
# 플랫폼 초기 설정
# =============================================================================
cmd_platform_init() {
    local api_url=$1
    local api_key=$2
    
    if [ -z "$api_url" ] || [ -z "$api_key" ]; then
        echo -e "${RED}❌ 사용법: codeb platform init <API_URL> <API_KEY>${NC}"
        echo ""
        echo "예시:"
        echo "  codeb platform init http://141.164.60.51:3010/api your-api-key"
        return 1
    fi
    
    echo -e "${CYAN}🔧 플랫폼 설정 중...${NC}"
    
    # 설정 저장
    cat > "$PLATFORM_CONFIG" << EOF
{
  "api": "$api_url",
  "key": "$api_key",
  "configured": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
    
    # 환경 변수 설정
    export CODEB_PLATFORM_API="$api_url"
    export CODEB_PLATFORM_KEY="$api_key"
    
    # 연결 테스트
    echo -e "${BLUE}🔍 연결 확인 중...${NC}"
    local response=$(curl -s -w "\n%{http_code}" -H "X-API-Key: $api_key" "$api_url/../health")
    local http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ 플랫폼 연결 성공!${NC}"
        return 0
    else
        echo -e "${RED}❌ 플랫폼 연결 실패 (HTTP $http_code)${NC}"
        return 1
    fi
}

# =============================================================================
# 플랫폼 설정 로드
# =============================================================================
load_platform_config() {
    if [ -f "$PLATFORM_CONFIG" ]; then
        PLATFORM_API=$(jq -r '.api' "$PLATFORM_CONFIG" 2>/dev/null)
        PLATFORM_KEY=$(jq -r '.key' "$PLATFORM_CONFIG" 2>/dev/null)
        export CODEB_PLATFORM_API="$PLATFORM_API"
        export CODEB_PLATFORM_KEY="$PLATFORM_KEY"
    fi
    
    if [ -z "$PLATFORM_KEY" ]; then
        echo -e "${RED}❌ 플랫폼이 설정되지 않았습니다.${NC}"
        echo ""
        echo "먼저 플랫폼을 설정하세요:"
        echo "  codeb platform init <API_URL> <API_KEY>"
        return 1
    fi
}

# =============================================================================
# 프로젝트 생성 (원격)
# =============================================================================
cmd_platform_create() {
    local project_name=$1
    local template=${2:-nextjs}
    
    if [ -z "$project_name" ]; then
        echo -e "${RED}❌ 프로젝트 이름을 입력하세요${NC}"
        return 1
    fi
    
    # 설정 로드
    load_platform_config || return 1
    
    echo -e "${CYAN}🚀 원격 프로젝트 생성: $project_name${NC}"
    echo -e "${BLUE}📦 템플릿: $template${NC}"
    echo ""
    
    # API 호출
    local response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "X-API-Key: $PLATFORM_KEY" \
        -d "{\"name\": \"$project_name\", \"template\": \"$template\"}" \
        "$PLATFORM_API/projects")
    
    # 결과 확인
    if echo "$response" | jq -e '.success' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 프로젝트 생성 완료!${NC}"
        echo ""
        
        # 로컬 프로젝트 디렉토리 생성
        mkdir -p "$project_name"
        cd "$project_name"
        
        # 환경 변수 파일 생성 (.env.remote)
        echo -e "${BLUE}📝 환경 설정 파일 생성 중...${NC}"
        
        cat > .env.remote << EOF
# CodeB Platform - Remote Environment
# Generated: $(date)
# Project: $project_name

# Database
DATABASE_URL=$(echo "$response" | jq -r '.env.DATABASE_URL')

# Redis
REDIS_URL=$(echo "$response" | jq -r '.env.REDIS_URL')

# Storage
STORAGE_URL=$(echo "$response" | jq -r '.env.STORAGE_URL')

# API
NEXT_PUBLIC_API_URL=$(echo "$response" | jq -r '.env.NEXT_PUBLIC_API_URL')

# Environment
NODE_ENV=development
EOF
        
        # 프로젝트 정보 저장
        echo "$response" | jq '.credentials' > .codeb-platform.json
        
        # 사용 안내
        echo -e "${GREEN}✅ 로컬 개발 환경 준비 완료!${NC}"
        echo ""
        echo -e "${BOLD}📌 사용 방법:${NC}"
        echo ""
        echo "1. 환경 변수 로드:"
        echo "   ${CYAN}cp .env.remote .env.local${NC}"
        echo ""
        echo "2. 프로젝트 초기화 (Next.js 예시):"
        echo "   ${CYAN}npx create-next-app@latest . --typescript --tailwind --app${NC}"
        echo ""
        echo "3. 개발 서버 시작:"
        echo "   ${CYAN}npm run dev${NC}"
        echo ""
        echo -e "${YELLOW}💡 데이터베이스와 Redis는 원격 서버에서 실행됩니다.${NC}"
        echo ""
        echo "📊 접속 정보:"
        echo "   PostgreSQL: $(echo "$response" | jq -r '.credentials.database.host'):$(echo "$response" | jq -r '.credentials.database.port')"
        echo "   Redis: $(echo "$response" | jq -r '.credentials.redis.host'):$(echo "$response" | jq -r '.credentials.redis.port')"
        echo ""
        
    else
        echo -e "${RED}❌ 프로젝트 생성 실패${NC}"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        return 1
    fi
}

# =============================================================================
# 프로젝트 배포
# =============================================================================
cmd_platform_deploy() {
    local project_name=$1
    local git_url=$2
    
    if [ -z "$project_name" ]; then
        # 현재 디렉토리에서 프로젝트 이름 추출
        if [ -f ".codeb-platform.json" ]; then
            project_name=$(jq -r '.project // empty' .codeb-platform.json)
        fi
        
        if [ -z "$project_name" ]; then
            echo -e "${RED}❌ 프로젝트 이름을 입력하세요${NC}"
            return 1
        fi
    fi
    
    # 설정 로드
    load_platform_config || return 1
    
    # Git URL이 없으면 현재 리포지토리 사용
    if [ -z "$git_url" ]; then
        if [ -d ".git" ]; then
            git_url=$(git config --get remote.origin.url 2>/dev/null)
        fi
    fi
    
    echo -e "${CYAN}🚀 프로젝트 배포: $project_name${NC}"
    if [ -n "$git_url" ]; then
        echo -e "${BLUE}📦 Git URL: $git_url${NC}"
    fi
    echo ""
    
    # 배포 요청
    local response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "X-API-Key: $PLATFORM_KEY" \
        -d "{\"gitUrl\": \"$git_url\", \"branch\": \"main\"}" \
        "$PLATFORM_API/projects/$project_name/deploy")
    
    if echo "$response" | jq -e '.success' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 배포 완료!${NC}"
        echo ""
        echo "🌐 애플리케이션 URL: $(echo "$response" | jq -r '.url')"
        echo ""
    else
        echo -e "${RED}❌ 배포 실패${NC}"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        return 1
    fi
}

# =============================================================================
# 프로젝트 상태 확인
# =============================================================================
cmd_platform_status() {
    local project_name=$1
    
    # 설정 로드
    load_platform_config || return 1
    
    if [ -z "$project_name" ]; then
        # 프로젝트 목록 표시
        echo -e "${CYAN}📋 프로젝트 목록${NC}"
        echo ""
        
        local response=$(curl -s -H "X-API-Key: $PLATFORM_KEY" "$PLATFORM_API/projects")
        
        if [ -n "$response" ]; then
            echo "$response" | jq -r '.[] | "• \(.name) (DB:\(.ports.db), Redis:\(.ports.redis), App:\(.ports.app)) - Created: \(.created)"'
        else
            echo -e "${YELLOW}프로젝트가 없습니다.${NC}"
        fi
    else
        # 특정 프로젝트 상태
        echo -e "${CYAN}📊 프로젝트 상태: $project_name${NC}"
        echo ""
        
        local response=$(curl -s -H "X-API-Key: $PLATFORM_KEY" "$PLATFORM_API/projects/$project_name")
        
        if echo "$response" | jq -e '.name' > /dev/null 2>&1; then
            echo "상태:"
            echo "$response" | jq -r '.status | to_entries[] | "  • \(.key): \(.value)"'
            echo ""
            echo "포트:"
            echo "$response" | jq -r '.ports | to_entries[] | "  • \(.key): \(.value)"'
            echo ""
            echo "URL:"
            echo "  • App: http://$(echo "$response" | jq -r '.credentials.database.host'):$(echo "$response" | jq -r '.ports.app')"
            echo ""
        else
            echo -e "${RED}❌ 프로젝트를 찾을 수 없습니다${NC}"
            return 1
        fi
    fi
}

# =============================================================================
# 프로젝트 시작/중지/재시작
# =============================================================================
cmd_platform_start() {
    platform_control "$1" "start"
}

cmd_platform_stop() {
    platform_control "$1" "stop"
}

cmd_platform_restart() {
    platform_control "$1" "restart"
}

platform_control() {
    local project_name=$1
    local action=$2
    
    if [ -z "$project_name" ]; then
        echo -e "${RED}❌ 프로젝트 이름을 입력하세요${NC}"
        return 1
    fi
    
    # 설정 로드
    load_platform_config || return 1
    
    echo -e "${CYAN}🔄 프로젝트 $action: $project_name${NC}"
    
    local response=$(curl -s -X POST \
        -H "X-API-Key: $PLATFORM_KEY" \
        "$PLATFORM_API/projects/$project_name/$action")
    
    if echo "$response" | jq -e '.success' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ $action 완료!${NC}"
    else
        echo -e "${RED}❌ $action 실패${NC}"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        return 1
    fi
}

# =============================================================================
# 프로젝트 삭제
# =============================================================================
cmd_platform_delete() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        echo -e "${RED}❌ 프로젝트 이름을 입력하세요${NC}"
        return 1
    fi
    
    # 설정 로드
    load_platform_config || return 1
    
    # 확인
    echo -e "${YELLOW}⚠️  프로젝트 '$project_name'를 삭제하시겠습니까?${NC}"
    echo -e "${YELLOW}   모든 데이터가 영구적으로 삭제됩니다.${NC}"
    read -p "계속하려면 'yes'를 입력하세요: " confirm
    
    if [ "$confirm" != "yes" ]; then
        echo "취소되었습니다."
        return 0
    fi
    
    echo -e "${RED}🗑️  프로젝트 삭제 중...${NC}"
    
    local response=$(curl -s -X DELETE \
        -H "X-API-Key: $PLATFORM_KEY" \
        "$PLATFORM_API/projects/$project_name")
    
    if echo "$response" | jq -e '.success' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 프로젝트가 삭제되었습니다.${NC}"
    else
        echo -e "${RED}❌ 삭제 실패${NC}"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        return 1
    fi
}

# =============================================================================
# 도움말
# =============================================================================
cmd_platform_help() {
    echo -e "${BOLD}${CYAN}CodeB Platform - 원격 컨테이너 플랫폼${NC}"
    echo ""
    echo -e "${BOLD}사용법:${NC}"
    echo "  codeb platform <명령> [옵션]"
    echo ""
    echo -e "${BOLD}초기 설정:${NC}"
    echo "  init <API_URL> <KEY>  플랫폼 연결 설정"
    echo ""
    echo -e "${BOLD}프로젝트 관리:${NC}"
    echo "  create <이름> [템플릿]  원격 프로젝트 생성"
    echo "  deploy [이름] [git-url]  프로젝트 배포"
    echo "  status [이름]            상태 확인"
    echo "  start <이름>             프로젝트 시작"
    echo "  stop <이름>              프로젝트 중지"
    echo "  restart <이름>           프로젝트 재시작"
    echo "  delete <이름>            프로젝트 삭제"
    echo ""
    echo -e "${BOLD}예시:${NC}"
    echo "  # 플랫폼 연결"
    echo "  codeb platform init http://141.164.60.51:3010/api your-key"
    echo ""
    echo "  # 프로젝트 생성"
    echo "  codeb platform create myapp nextjs"
    echo ""
    echo "  # 배포"
    echo "  codeb platform deploy myapp https://github.com/user/repo.git"
    echo ""
}

# 메인 디스패처
if [ "$1" = "platform" ]; then
    shift
    case "$1" in
        init)
            shift
            cmd_platform_init "$@"
            ;;
        create)
            shift
            cmd_platform_create "$@"
            ;;
        deploy)
            shift
            cmd_platform_deploy "$@"
            ;;
        status)
            shift
            cmd_platform_status "$@"
            ;;
        start)
            shift
            cmd_platform_start "$@"
            ;;
        stop)
            shift
            cmd_platform_stop "$@"
            ;;
        restart)
            shift
            cmd_platform_restart "$@"
            ;;
        delete)
            shift
            cmd_platform_delete "$@"
            ;;
        help|--help|-h|"")
            cmd_platform_help
            ;;
        *)
            echo -e "${RED}❌ 알 수 없는 platform 명령: $1${NC}"
            echo "사용 가능한 명령: init, create, deploy, status, start, stop, restart, delete"
            ;;
    esac
fi