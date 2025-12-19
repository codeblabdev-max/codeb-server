#!/bin/bash

# CodeB CLI - Terminal-based Project Management Tool
VERSION="1.0.0"
# Auto-detect if running on server or remotely
if [ -f "/usr/local/bin/codeb" ] && [ "$(hostname -I | cut -d' ' -f1)" = "141.164.60.51" ]; then
    SERVER_IP="localhost"
    API_PORT="${CODEB_API_PORT:-3008}"
    BASE_URL="http://localhost:${API_PORT}"
else
    SERVER_IP="${CODEB_SERVER_IP:-141.164.60.51}"
    API_PORT="${CODEB_API_PORT:-3008}"
    BASE_URL="http://${SERVER_IP}:${API_PORT}"
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Icons/Emojis
ICON_SUCCESS="✅"
ICON_ERROR="❌"
ICON_WARNING="⚠️"
ICON_INFO="ℹ️"
ICON_ROCKET="🚀"
ICON_GEAR="⚙️"
ICON_FOLDER="📁"
ICON_BUILD="🔨"
ICON_DEPLOY="📦"

show_header() {
    clear
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                 CodeB Project Manager CLI                     ║${NC}"
    echo -e "${CYAN}║                      Version ${VERSION}                           ║${NC}"
    echo -e "${CYAN}║               Server: ${SERVER_IP}                    ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

log_info() {
    echo -e "${BLUE}${ICON_INFO} $1${NC}"
}

log_success() {
    echo -e "${GREEN}${ICON_SUCCESS} $1${NC}"
}

log_error() {
    echo -e "${RED}${ICON_ERROR} $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}${ICON_WARNING} $1${NC}"
}

api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    if [ "$method" = "GET" ]; then
        curl -s "${BASE_URL}${endpoint}"
    else
        curl -s -X "$method" "${BASE_URL}${endpoint}" \
            -H "Content-Type: application/json" \
            -d "$data"
    fi
}

# Commands

cmd_list() {
    show_header
    log_info "프로젝트 목록 조회 중..."
    
    response=$(api_call "GET" "/api/projects")
    
    if echo "$response" | jq -e '.success' > /dev/null 2>&1; then
        echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
        printf "%-20s %-8s %-8s %-30s\n" "PROJECT NAME" "PORT" "STATUS" "DOMAIN"
        echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
        
        echo "$response" | jq -r '.projects[] | [.name, .appPort, .status, .domain] | @tsv' | \
        while IFS=$'\t' read -r name port status domain; do
            if [ "$status" = "Running" ]; then
                status_icon="${GREEN}●${NC}"
            else
                status_icon="${RED}●${NC}"
            fi
            printf "%-20s %-8s %s%-6s %-30s\n" "$name" "$port" "$status_icon" "$status" "$domain"
        done
    else
        log_error "프로젝트 목록을 가져올 수 없습니다."
    fi
    echo ""
}

cmd_create() {
    local project_name=$1
    local template=${2:-"nodejs"}
    local git_url=$3
    
    if [ -z "$project_name" ]; then
        log_error "사용법: codeb create <project-name> [template] [git-url]"
        return 1
    fi
    
    show_header
    log_info "프로젝트 생성 중: $project_name"
    
    data=$(cat <<EOF
{
    "name": "$project_name",
    "template": "$template",
    "enablePostgres": true,
    "enableRedis": true
}
EOF
)
    
    response=$(api_call "POST" "/api/projects" "$data")
    
    if echo "$response" | jq -e '.success' > /dev/null 2>&1; then
        log_success "프로젝트 '$project_name' 생성 완료"
        
        port=$(echo "$response" | jq -r '.project.appPort')
        domain=$(echo "$response" | jq -r '.project.domain')
        
        echo -e "${CYAN}접속 정보:${NC}"
        echo "  • 포트: $port"
        echo "  • 도메인: https://$domain"
        echo "  • 직접 접근: http://$SERVER_IP:$port"
        
        # Git URL이 제공된 경우 자동 배포
        if [ -n "$git_url" ]; then
            log_info "Git 저장소에서 코드 배포 중..."
            cmd_deploy "$project_name" "$git_url"
        fi
    else
        error_msg=$(echo "$response" | jq -r '.error // "Unknown error"')
        log_error "프로젝트 생성 실패: $error_msg"
    fi
}

cmd_deploy() {
    local project_name=$1
    local git_url=$2
    local branch=${3:-"main"}
    
    if [ -z "$project_name" ] || [ -z "$git_url" ]; then
        log_error "사용법: codeb deploy <project-name> <git-url> [branch]"
        return 1
    fi
    
    log_info "배포 시작: $project_name <- $git_url ($branch)"
    
    # 1. Git clone 및 코드 복사
    log_info "코드 다운로드 중..."
    temp_dir="/tmp/codeb-deploy-$$"
    git clone --branch "$branch" --depth 1 "$git_url" "$temp_dir" 2>/dev/null
    
    if [ $? -ne 0 ]; then
        log_error "Git clone 실패"
        return 1
    fi
    
    # 2. 컨테이너에 코드 복사
    log_info "컨테이너에 코드 배포 중..."
    tar -czf "${temp_dir}.tar.gz" -C "$temp_dir" .
    
    ssh root@$SERVER_IP "
        podman cp ${temp_dir}.tar.gz ${project_name}-app:/tmp/
        podman exec ${project_name}-app sh -c 'cd /app && tar -xzf /tmp/$(basename ${temp_dir}).tar.gz'
        rm -f ${temp_dir}.tar.gz
    " 2>/dev/null
    
    # 3. 환경변수 설정
    log_info "환경변수 설정 중..."
    cmd_env_setup "$project_name"
    
    # 4. 빌드 및 시작
    log_info "빌드 및 시작..."
    cmd_build "$project_name"
    cmd_start "$project_name"
    
    # 정리
    rm -rf "$temp_dir" "${temp_dir}.tar.gz" 2>/dev/null
    
    log_success "배포 완료: $project_name"
}

cmd_build() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: codeb build <project-name>"
        return 1
    fi
    
    log_info "${ICON_BUILD} 프로젝트 빌드: $project_name"
    
    # 빌드 시도 함수
    try_build() {
        local container_name="${project_name}-app"
        
        podman exec $container_name sh -c '
            cd /app
            
            # package.json 확인
            if [ -f package.json ]; then
                echo "📦 Node.js 프로젝트 감지"
                
                # 의존성 설치
                npm install --no-optional --legacy-peer-deps
                
                # Next.js 프로젝트 확인
                if npm list next >/dev/null 2>&1 || grep -q "next" package.json; then
                    echo "⚡ Next.js 프로젝트"
                    
                    # PostCSS 설정 생성
                    cat > postcss.config.js << EOF
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF
                    
                    # Tailwind 의존성 설치
                    npm install -D tailwindcss postcss autoprefixer
                    
                    # 캐시 정리
                    rm -rf .next
                    
                    # 빌드 시도
                    npm run build
                else
                    echo "📦 일반 Node.js 프로젝트"
                    npm run build || npm run start
                fi
            else
                echo "❓ package.json이 없습니다 - 자동 생성 중..."
                cat > package.json << EOF
{
  "name": "'$project_name'",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.31",
    "react": "^18",
    "react-dom": "^18"
  }
}
EOF
                npm install
                npm run build
            fi
        '
    }
    
    # 프로젝트 타입 감지 및 빌드
    if [ "$SERVER_IP" = "localhost" ] || [ "$SERVER_IP" = "127.0.0.1" ] || [ -z "$SERVER_IP" ]; then
        # 로컬 실행 - 스마트 빌드
        if try_build; then
            log_success "빌드 성공: $project_name"
        else
            log_warning "초기 빌드 실패 - 자동 복구 시도 중..."
            
            # 빌드 에러 자동 복구
            if cmd_fix_build "$project_name"; then
                log_success "자동 복구 후 빌드 성공: $project_name"
            else
                log_error "빌드 복구 실패: $project_name"
                log_info "수동 복구: codeb fix $project_name"
                return 1
            fi
        fi
    else
        # 원격 실행 (API 기반)
        log_info "원격 빌드는 API를 통해 수행됩니다"
        response=$(api_call "POST" "/api/projects/$project_name/build")
        if echo "$response" | jq -e '.success' > /dev/null 2>&1; then
            log_success "빌드 요청 완료"
        else
            log_error "빌드 요청 실패"
        fi
    fi
}

# 빌드 에러 자동 복구 함수
cmd_fix_build() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: codeb fix <project-name>"
        return 1
    fi
    
    log_info "🔧 빌드 자동 복구: $project_name"
    
    local container_name="${project_name}-app"
    
    # 1. 기본 복구 시도
    podman exec $container_name sh -c '
        cd /app
        
        # 캐시 정리
        rm -rf .next node_modules/.cache
        npm cache clean --force
        
        # package.json 존재 확인 및 생성
        if [ ! -f package.json ]; then
            echo "📦 package.json 자동 생성"
            cat > package.json << EOF
{
  "name": "'$project_name'",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build", 
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.31",
    "react": "^18",
    "react-dom": "^18"
  },
  "devDependencies": {
    "tailwindcss": "^3.4.1",
    "postcss": "^8.4.33",
    "autoprefixer": "^10.4.17",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "typescript": "^5"
  }
}
EOF
        fi
        
        # PostCSS 설정
        cat > postcss.config.js << EOF
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF

        # Tailwind 설정
        cat > tailwind.config.js << EOF
/** @type {import("tailwindcss").Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
EOF

        # next.config.js 설정
        cat > next.config.js << EOF
/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
}
module.exports = nextConfig
EOF

        # 의존성 재설치
        rm -rf node_modules package-lock.json
        npm install --no-optional --legacy-peer-deps
        
        # 빌드 재시도
        npm run build
    '
    
    local fix_result=$?
    
    if [ $fix_result -eq 0 ]; then
        log_success "빌드 복구 성공: $project_name"
        return 0
    else
        log_error "빌드 복구 실패: $project_name"
        return 1
    fi
}

cmd_start() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: codeb start <project-name>"
        return 1
    fi
    
    log_info "${ICON_ROCKET} 애플리케이션 시작: $project_name"
    
    ssh root@$SERVER_IP "
        podman exec ${project_name}-app sh -c '
            cd /app
            
            # PM2 설치 및 시작
            npm install -g pm2 2>/dev/null || true
            
            # 기존 프로세스 정지
            pm2 delete ${project_name} 2>/dev/null || true
            
            # 환경변수 설정
            export PORT=3000
            export NODE_ENV=production
            
            # 시작 명령 감지 및 실행
            if [ -f package.json ] && npm run --silent 2>/dev/null | grep -q \"start\"; then
                pm2 start \"npm start\" --name ${project_name}
            elif [ -f package.json ] && npm run --silent 2>/dev/null | grep -q \"dev\"; then
                pm2 start \"npm run dev\" --name ${project_name}
            else
                echo \"❓ 시작 스크립트를 찾을 수 없습니다\"
            fi
            
            pm2 save
        '
    "
    
    log_success "애플리케이션 시작: $project_name"
}

cmd_stop() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: codeb stop <project-name>"
        return 1
    fi
    
    log_info "프로젝트 중지: $project_name"
    
    local container_name="${project_name}-app"
    
    if [ "$SERVER_IP" = "localhost" ]; then
        podman exec $container_name pm2 delete $project_name 2>/dev/null || true
    else
        ssh root@$SERVER_IP "podman exec $container_name pm2 delete $project_name 2>/dev/null || true"
    fi
    
    log_success "프로젝트 중지: $project_name"
}

cmd_restart() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: codeb restart <project-name>"
        return 1
    fi
    
    log_info "🔄 프로젝트 재시작: $project_name"
    
    # 중지 후 시작
    cmd_stop "$project_name"
    sleep 2
    cmd_start "$project_name"
    
    log_success "프로젝트 재시작 완료: $project_name"
}

cmd_logs() {
    local project_name=$1
    local lines=${2:-50}
    local log_type=${3:-"all"}
    
    if [ -z "$project_name" ]; then
        log_error "사용법: codeb logs <project-name> [lines] [type]"
        echo "  타입: all, app, build, error, system"
        return 1
    fi
    
    show_header
    log_info "📜 $project_name 로그 조회 (최근 $lines줄)"
    
    local container_name="${project_name}-app"
    
    case $log_type in
        "build")
            echo -e "${YELLOW}🔨 빌드 로그:${NC}"
            if [ "$SERVER_IP" = "localhost" ]; then
                podman exec $container_name sh -c "cd /app && npm run build 2>&1 | tail -$lines"
            else
                ssh root@$SERVER_IP "podman exec $container_name sh -c 'cd /app && npm run build 2>&1 | tail -$lines'"
            fi
            ;;
        "error")
            echo -e "${RED}❌ 에러 로그:${NC}"
            if [ "$SERVER_IP" = "localhost" ]; then
                # PM2 에러 로그
                podman exec $container_name pm2 logs $project_name --err --lines $lines --no-stream 2>/dev/null || echo "PM2 로그 없음"
                echo ""
                # 컨테이너 로그에서 에러만 추출
                podman logs $container_name 2>&1 | grep -i "error\|failed\|exception\|fatal" | tail -$lines
            else
                ssh root@$SERVER_IP "
                    podman exec $container_name pm2 logs $project_name --err --lines $lines --no-stream 2>/dev/null || echo 'PM2 로그 없음'
                    echo ''
                    podman logs $container_name 2>&1 | grep -i 'error\|failed\|exception\|fatal' | tail -$lines
                "
            fi
            ;;
        "system")
            echo -e "${BLUE}🖥️ 시스템 로그:${NC}"
            if [ "$SERVER_IP" = "localhost" ]; then
                podman logs $container_name 2>&1 | tail -$lines
            else
                ssh root@$SERVER_IP "podman logs $container_name 2>&1 | tail -$lines"
            fi
            ;;
        "app"|"all"|*)
            echo -e "${GREEN}📱 애플리케이션 로그:${NC}"
            if [ "$SERVER_IP" = "localhost" ]; then
                # PM2 로그 시도
                if podman exec $container_name pm2 logs $project_name --lines $lines --no-stream 2>/dev/null; then
                    echo "✅ PM2 로그 표시 완료"
                else
                    echo "ℹ️ PM2 로그 없음 - 컨테이너 로그 표시:"
                    podman logs $container_name 2>&1 | tail -$lines
                fi
            else
                ssh root@$SERVER_IP "
                    if podman exec $container_name pm2 logs $project_name --lines $lines --no-stream 2>/dev/null; then
                        echo '✅ PM2 로그 표시 완료'
                    else
                        echo 'ℹ️ PM2 로그 없음 - 컨테이너 로그 표시:'
                        podman logs $container_name 2>&1 | tail -$lines
                    fi
                "
            fi
            ;;
    esac
    
    echo ""
    log_info "실시간 로그 모니터링: codeb tail $project_name"
}

# 실시간 로그 모니터링
cmd_tail() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: codeb tail <project-name>"
        return 1
    fi
    
    log_info "🔄 실시간 로그 모니터링: $project_name (Ctrl+C로 종료)"
    echo ""
    
    local container_name="${project_name}-app"
    
    if [ "$SERVER_IP" = "localhost" ]; then
        # PM2 로그 실시간 모니터링 시도
        if podman exec $container_name pm2 logs $project_name --follow --no-stream 2>/dev/null; then
            echo "PM2 로그 모니터링 완료"
        else
            echo "PM2 로그 없음 - 컨테이너 로그 모니터링:"
            podman logs -f $container_name
        fi
    else
        ssh root@$SERVER_IP "
            if podman exec $container_name pm2 logs $project_name --follow --no-stream 2>/dev/null; then
                echo 'PM2 로그 모니터링 완료'
            else
                echo 'PM2 로그 없음 - 컨테이너 로그 모니터링:'
                podman logs -f $container_name
            fi
        "
    fi
}

# 에러 진단 및 분석
cmd_diagnose() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: codeb diagnose <project-name>"
        return 1
    fi
    
    show_header
    log_info "🔍 프로젝트 진단: $project_name"
    
    local container_name="${project_name}-app"
    
    # 1. 기본 상태 확인
    echo -e "${CYAN}=== 1. 기본 상태 ===${NC}"
    cmd_status $project_name
    
    echo ""
    echo -e "${CYAN}=== 2. 최근 에러 로그 ===${NC}"
    cmd_logs $project_name 20 error
    
    echo ""
    echo -e "${CYAN}=== 3. 프로젝트 파일 구조 ===${NC}"
    if [ "$SERVER_IP" = "localhost" ]; then
        podman exec $container_name sh -c '
            cd /app
            echo "📁 프로젝트 구조:"
            ls -la | head -10
            echo ""
            echo "📦 package.json 확인:"
            if [ -f package.json ]; then
                echo "✅ package.json 존재"
                cat package.json | jq -r .scripts 2>/dev/null || echo "scripts 정보 없음"
            else
                echo "❌ package.json 없음"
            fi
            echo ""
            echo "🗂️ node_modules:"
            if [ -d node_modules ]; then
                echo "✅ node_modules 존재 ($(ls node_modules | wc -l)개 패키지)"
            else
                echo "❌ node_modules 없음"
            fi
        '
    else
        ssh root@$SERVER_IP "podman exec $container_name sh -c '
            cd /app
            echo \"📁 프로젝트 구조:\"
            ls -la | head -10
            echo \"\"
            echo \"📦 package.json 확인:\"
            if [ -f package.json ]; then
                echo \"✅ package.json 존재\"
                cat package.json | jq -r .scripts 2>/dev/null || echo \"scripts 정보 없음\"
            else
                echo \"❌ package.json 없음\"
            fi
            echo \"\"
            echo \"🗂️ node_modules:\"
            if [ -d node_modules ]; then
                echo \"✅ node_modules 존재 (\$(ls node_modules | wc -l)개 패키지)\"
            else
                echo \"❌ node_modules 없음\"
            fi
        '"
    fi
    
    echo ""
    echo -e "${CYAN}=== 4. 포트 및 프로세스 ===${NC}"
    local port=$(curl -s http://localhost:3008/api/projects | jq -r '.projects[] | select(.name=="'$project_name'") | .appPort')
    echo "할당된 포트: $port"
    
    if [ "$SERVER_IP" = "localhost" ]; then
        echo "포트 사용 상태:"
        netstat -tlnp | grep ":$port " || echo "포트 $port 사용 중이 아님"
        echo ""
        echo "PM2 프로세스:"
        podman exec $container_name pm2 list 2>/dev/null | grep $project_name || echo "PM2 프로세스 없음"
    fi
    
    echo ""
    echo -e "${CYAN}=== 5. 권장 해결책 ===${NC}"
    echo "🔧 문제 해결 명령어:"
    echo "  codeb fix $project_name     # 자동 빌드 복구"
    echo "  codeb build $project_name   # 재빌드"
    echo "  codeb restart $project_name # 재시작"
    echo "  codeb logs $project_name 100 error # 에러 로그 상세 보기"
}

cmd_status() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        cmd_list
        return
    fi
    
    log_info "프로젝트 상태: $project_name"
    
    response=$(api_call "GET" "/api/projects/$project_name/status")
    
    if echo "$response" | jq -e '.success' > /dev/null 2>&1; then
        status=$(echo "$response" | jq -r '.status')
        running=$(echo "$response" | jq -r '.running')
        
        echo -e "${CYAN}상태 정보:${NC}"
        echo "  • Pod 상태: $status"
        echo "  • 실행 중: $running"
        
        # 컨테이너 상태
        echo "$response" | jq -r '.containers[]? | "  • 컨테이너: \(.name) (\(.state))"'
        
        # PM2 프로세스 상태
        ssh root@$SERVER_IP "podman exec ${project_name}-app pm2 list 2>/dev/null | grep ${project_name}" || echo "  • PM2 프로세스 없음"
    fi
}

cmd_env_setup() {
    local project_name=$1
    
    log_info "환경변수 설정: $project_name"
    
    # 기본 환경변수 생성
    ssh root@$SERVER_IP "
        podman exec ${project_name}-app sh -c '
            cd /app
            cat > .env.local << EOF
NODE_ENV=production
PORT=3000
NEXT_TELEMETRY_DISABLED=1
EOF
        '
    "
}

cmd_delete() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: codeb delete <project-name>"
        return 1
    fi
    
    log_warning "프로젝트 삭제: $project_name"
    echo -n "정말 삭제하시겠습니까? (y/N): "
    read -r confirm
    
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        response=$(api_call "DELETE" "/api/projects/$project_name")
        
        if echo "$response" | jq -e '.success' > /dev/null 2>&1; then
            log_success "프로젝트 삭제 완료: $project_name"
        else
            log_error "삭제 실패"
        fi
    else
        log_info "삭제 취소"
    fi
}

cmd_help() {
    show_header
    echo -e "${YELLOW}사용법:${NC} codeb <command> [options]"
    echo ""
    echo -e "${CYAN}프로젝트 관리:${NC}"
    echo "  list                     프로젝트 목록 보기"
    echo "  create <name> [template] [git-url]  새 프로젝트 생성"
    echo "  delete <name>            프로젝트 삭제"
    echo ""
    echo -e "${CYAN}배포 및 빌드:${NC}"
    echo "  deploy <name> <git-url> [branch]    Git에서 배포"
    echo "  build <name>             프로젝트 빌드 (자동 복구 포함)"
    echo "  fix <name>               빌드 에러 자동 복구"
    echo "  start <name>             애플리케이션 시작"
    echo "  stop <name>              애플리케이션 중지"
    echo "  restart <name>           애플리케이션 재시작"
    echo ""
    echo -e "${CYAN}모니터링 및 진단:${NC}"
    echo "  status [name]            프로젝트 상태 확인"
    echo "  logs <name> [lines] [type]  로그 보기 (all, app, build, error, system)"
    echo "  tail <name>              실시간 로그 모니터링"
    echo "  diagnose <name>          프로젝트 종합 진단"
    echo ""
    echo -e "${CYAN}예제:${NC}"
    echo "  codeb create my-app nextjs https://github.com/user/repo.git"
    echo "  codeb deploy my-app https://github.com/user/repo.git"
    echo "  codeb logs my-app 100"
    echo ""
}

# Main command router
main() {
    local command=$1
    
    case $command in
        "list"|"ls")
            cmd_list
            ;;
        "create")
            cmd_create "$2" "$3" "$4"
            ;;
        "deploy")
            cmd_deploy "$2" "$3" "$4"
            ;;
        "build")
            cmd_build "$2"
            ;;
        "fix")
            cmd_fix_build "$2"
            ;;
        "start")
            cmd_start "$2"
            ;;
        "stop")
            cmd_stop "$2"
            ;;
        "restart")
            cmd_restart "$2"
            ;;
        "logs")
            cmd_logs "$2" "$3" "$4"
            ;;
        "tail")
            cmd_tail "$2"
            ;;
        "diagnose")
            cmd_diagnose "$2"
            ;;
        "status")
            cmd_status "$2"
            ;;
        "delete"|"rm")
            cmd_delete "$2"
            ;;
        "help"|"-h"|"--help"|"")
            cmd_help
            ;;
        *)
            log_error "알 수 없는 명령: $command"
            cmd_help
            exit 1
            ;;
    esac
}

# Run if called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi