#!/bin/bash

# CodeB CLI v2.0 - 100% API 기반 프로젝트 관리 도구
# SSH 의존성 완전 제거, 순수 API 기반 구현

VERSION="2.0.0"
SERVER_IP="141.164.60.51"
API_PORT="3008"
API_BASE="http://${SERVER_IP}:${API_PORT}/api"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# 로깅 함수
log_info() { echo -e "${BLUE}ℹ️ $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️ $1${NC}"; }
log_header() { echo -e "${BOLD}${CYAN}🚀 $1${NC}"; }

# API 호출 헬퍼 함수
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local timeout=${4:-30}
    
    local url="${API_BASE}${endpoint}"
    
    if [ "$method" = "GET" ]; then
        curl -s --max-time $timeout "$url"
    elif [ "$method" = "POST" ]; then
        curl -s --max-time $timeout -X POST \
             -H "Content-Type: application/json" \
             -d "$data" "$url"
    elif [ "$method" = "DELETE" ]; then
        curl -s --max-time $timeout -X DELETE "$url"
    fi
}

# API 서버 연결 확인
check_api_connection() {
    log_info "API 서버 연결 확인 중..."
    
    local health_check=$(api_call GET "/health" "" 10)
    local exit_code=$?
    
    if [ $exit_code -eq 0 ] && echo "$health_check" | jq -r '.status' 2>/dev/null | grep -q "healthy"; then
        local version=$(echo "$health_check" | jq -r '.version' 2>/dev/null)
        log_success "API 서버 연결됨 (v$version)"
        return 0
    else
        log_error "API 서버 연결 실패: $API_BASE"
        log_error "서버가 실행 중인지 확인하세요"
        return 1
    fi
}

# 프로젝트 목록
cmd_list() {
    log_header "📋 프로젝트 목록"
    
    if ! check_api_connection; then
        return 1
    fi
    
    local response=$(api_call GET "/projects")
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        local projects=$(echo "$response" | jq -r '.projects[]')
        
        if [ -z "$projects" ]; then
            log_info "프로젝트가 없습니다"
            return 0
        fi
        
        echo -e "${BOLD}┌────────────────────────────────────────────────────────────┐${NC}"
        echo -e "${BOLD}│                    CodeB 프로젝트 목록                      │${NC}"
        echo -e "${BOLD}├────────────────┬─────────┬────────┬─────────────────────────┤${NC}"
        echo -e "${BOLD}│ 프로젝트명      │ 포트    │ 상태   │ 도메인                   │${NC}"
        echo -e "${BOLD}├────────────────┼─────────┼────────┼─────────────────────────┤${NC}"
        
        echo "$response" | jq -r '.projects[] | [.name, .appPort, .status, .domain] | @tsv' | while read -r name port status domain; do
            local status_icon="🔴"
            local status_color="$RED"
            
            if [ "$status" = "Running" ]; then
                status_icon="🟢"
                status_color="$GREEN"
            elif [ "$status" = "Paused" ]; then
                status_icon="🟡"
                status_color="$YELLOW"
            fi
            
            printf "│ %-14s │ %-7s │ %s%-6s%s │ %-23s │\n" \
                "$name" "$port" "$status_color" "$status" "$NC" "$domain"
        done
        
        echo -e "${BOLD}└────────────────┴─────────┴────────┴─────────────────────────┘${NC}"
        
    else
        local error=$(echo "$response" | jq -r '.error' 2>/dev/null)
        log_error "프로젝트 목록 조회 실패: $error"
        return 1
    fi
}

# 프로젝트 생성
cmd_create() {
    local project_name=$1
    local template=${2:-nodejs}
    local resume=false
    
    # --resume 옵션 확인
    if [ "$2" = "--resume" ] || [ "$3" = "--resume" ]; then
        resume=true
        if [ "$2" = "--resume" ]; then
            template="nodejs"
        fi
    fi
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 create <프로젝트명> [템플릿] [--resume]"
        echo "템플릿: nodejs, python, php, go, static"
        echo "옵션: --resume (중단된 생성 재개)"
        return 1
    fi
    
    # 이름 유효성 검사
    if ! echo "$project_name" | grep -qE '^[a-z0-9-]+$'; then
        log_error "프로젝트 이름은 소문자, 숫자, 하이픈만 사용 가능합니다"
        return 1
    fi
    
    if [ "$resume" = true ]; then
        log_header "🔄 프로젝트 복구/재개: $project_name"
    else
        log_header "🏗️ 프로젝트 생성: $project_name"
    fi
    
    if ! check_api_connection; then
        return 1
    fi
    
    local create_data=$(jq -n \
        --arg name "$project_name" \
        --arg template "$template" \
        --arg resume "$resume" \
        '{name: $name, template: $template, enablePostgres: true, enableRedis: true, resume: ($resume == "true")}')
    
    log_info "프로젝트 생성 중... (최대 2분 소요)"
    
    local response=$(api_call POST "/projects" "$create_data" 120)
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        local message=$(echo "$response" | jq -r '.message' 2>/dev/null)
        local next_step=$(echo "$response" | jq -r '.nextStep' 2>/dev/null)
        
        # 이미 존재하거나 부분 생성된 프로젝트 처리
        if [[ "$message" == *"이미"* ]] || [[ "$message" == *"부분적"* ]]; then
            log_success "$message"
            echo ""
            
            # 불완전한 부분 표시
            if echo "$response" | jq -e '.incomplete' >/dev/null 2>&1; then
                echo -e "${YELLOW}⚠️ 불완전한 항목:${NC}"
                local incomplete=$(echo "$response" | jq -r '.incomplete')
                if [ "$(echo "$incomplete" | jq -r '.pod')" = "true" ]; then
                    echo "  • Pod가 생성되지 않음"
                fi
                if [ "$(echo "$incomplete" | jq -r '.domain')" = "true" ]; then
                    echo "  • 도메인이 설정되지 않음"
                fi
                if [ "$(echo "$incomplete" | jq -r '.packages')" = "true" ]; then
                    echo "  • 패키지가 설치되지 않음"
                fi
                echo ""
            fi
            
            if [ "$next_step" != "null" ]; then
                echo -e "${BOLD}🚀 다음 단계:${NC}"
                echo "  $next_step"
                echo ""
            fi
            
            # 접속 정보가 있는 경우 표시
            if echo "$response" | jq -e '.access.url' >/dev/null 2>&1; then
                local url=$(echo "$response" | jq -r '.access.url')
                local domain=$(echo "$response" | jq -r '.access.domain')
                echo -e "${BOLD}📊 접속 정보:${NC}"
                echo "• URL: $url"
                if [ "$domain" != "null" ]; then
                    echo "• 도메인: https://$domain"
                fi
            fi
            
            return 0
        fi
        
        # 새로 생성된 경우
        local port=$(echo "$response" | jq -r '.project.appPort')
        local domain=$(echo "$response" | jq -r '.project.domain')
        
        log_success "프로젝트 생성 완료!"
        echo ""
        echo -e "${BOLD}📊 프로젝트 정보${NC}"
        echo "• 이름: $project_name"
        echo "• 템플릿: $template"
        echo "• 포트: $port"
        echo "• 도메인: $domain"
        echo "• 접속: http://$SERVER_IP:$port"
        echo ""
        log_info "다음 단계: codeb deploy $project_name <git-url>"
        
    else
        local error=$(echo "$response" | jq -r '.error' 2>/dev/null)
        log_error "프로젝트 생성 실패: $error"
        return 1
    fi
}

# 프로젝트 상태 확인
cmd_status() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 status <프로젝트명>"
        return 1
    fi
    
    log_header "📊 프로젝트 상태: $project_name"
    
    if ! check_api_connection; then
        return 1
    fi
    
    local response=$(api_call GET "/projects/$project_name/status")
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        local status=$(echo "$response" | jq -r '.status')
        local running=$(echo "$response" | jq -r '.running')
        
        echo "상태: $status"
        echo "실행 중: $running"
        
        # 컨테이너 정보
        if echo "$response" | jq -e '.containers' >/dev/null 2>&1; then
            echo ""
            echo "컨테이너 목록:"
            echo "$response" | jq -r '.containers[] | "• \(.name): \(.state) (\(.status))"'
        fi
        
    else
        local error=$(echo "$response" | jq -r '.error' 2>/dev/null)
        log_error "상태 조회 실패: $error"
        return 1
    fi
}

# 프로젝트 시작/중지/재시작
cmd_control() {
    local action=$1
    local project_name=$2
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 $action <프로젝트명>"
        return 1
    fi
    
    log_header "🔄 프로젝트 $action: $project_name"
    
    if ! check_api_connection; then
        return 1
    fi
    
    local response=$(api_call POST "/projects/$project_name/$action" "{}")
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        log_success "프로젝트 ${action} 완료"
    else
        local error=$(echo "$response" | jq -r '.error' 2>/dev/null)
        log_error "프로젝트 $action 실패: $error"
        return 1
    fi
}

# 코드 배포
cmd_deploy() {
    local project_name=$1
    local git_url=$2
    local branch=${3:-main}
    local db_backup_url=""
    
    # Parse optional --db-backup flag
    shift 3 2>/dev/null || true
    while [[ $# -gt 0 ]]; do
        case $1 in
            --db-backup)
                db_backup_url="$2"
                shift 2
                ;;
            *)
                log_error "알 수 없는 옵션: $1"
                return 1
                ;;
        esac
    done
    
    if [ -z "$project_name" ] || [ -z "$git_url" ]; then
        log_error "사용법: $0 deploy <프로젝트명> <git-url> [branch] [--db-backup <백업-URL>]"
        return 1
    fi
    
    log_header "🚀 코드 배포: $project_name"
    
    if [ -n "$db_backup_url" ]; then
        log_info "데이터베이스 백업 URL: $db_backup_url"
    fi
    
    if ! check_api_connection; then
        return 1
    fi
    
    local deploy_data
    if [ -n "$db_backup_url" ]; then
        deploy_data=$(jq -n \
            --arg gitUrl "$git_url" \
            --arg branch "$branch" \
            --arg dbBackupUrl "$db_backup_url" \
            '{gitUrl: $gitUrl, branch: $branch, dbBackupUrl: $dbBackupUrl}')
    else
        deploy_data=$(jq -n \
            --arg gitUrl "$git_url" \
            --arg branch "$branch" \
            '{gitUrl: $gitUrl, branch: $branch}')
    fi
    
    log_info "배포 중... (데이터베이스 복원 포함, 최대 10분 소요)"
    
    local response=$(api_call POST "/projects/$project_name/deploy" "$deploy_data" 600)
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        local url=$(echo "$response" | jq -r '.url')
        local domain=$(echo "$response" | jq -r '.domain')
        log_success "배포 완료!"
        echo "접속 URL: $url"
        if [ "$domain" != "null" ] && [ -n "$domain" ]; then
            echo "도메인: https://$domain"
        fi
    else
        local error=$(echo "$response" | jq -r '.error' 2>/dev/null)
        log_error "배포 실패: $error"
        return 1
    fi
}

# 빌드 실행
cmd_build() {
    local project_name=$1
    local build_type=${2:-build}
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 build <프로젝트명> [build|dev|start]"
        return 1
    fi
    
    log_header "🔨 빌드 실행: $project_name ($build_type)"
    
    if ! check_api_connection; then
        return 1
    fi
    
    local build_data=$(jq -n --arg type "$build_type" '{type: $type}')
    
    log_info "빌드 시작 중..."
    
    local response=$(api_call POST "/projects/$project_name/build" "$build_data" 60)
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        local build_id=$(echo "$response" | jq -r '.buildId')
        local status=$(echo "$response" | jq -r '.status')
        
        log_success "빌드 시작됨 (ID: $build_id)"
        echo "상태: $status"
        
        if [ "$status" = "running" ]; then
            log_info "빌드 로그 확인: codeb logs $project_name build"
        fi
        
    else
        local error=$(echo "$response" | jq -r '.error' 2>/dev/null)
        log_error "빌드 시작 실패: $error"
        return 1
    fi
}

# 로그 보기
cmd_logs() {
    local project_name=$1
    local log_type=${2:-app}
    local lines=${3:-50}
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 logs <프로젝트명> [app|build|pm2] [라인수]"
        return 1
    fi
    
    log_header "📜 로그 보기: $project_name ($log_type)"
    
    if ! check_api_connection; then
        return 1
    fi
    
    local endpoint
    case $log_type in
        "build")
            endpoint="/projects/$project_name/logs/build?lines=$lines"
            ;;
        "pm2")
            endpoint="/projects/$project_name/logs/pm2?lines=$lines"
            ;;
        *)
            endpoint="/projects/$project_name/logs?container=$log_type&lines=$lines"
            ;;
    esac
    
    local response=$(api_call GET "$endpoint")
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        echo "$response" | jq -r '.logs[]' | while read -r line; do
            if [[ "$line" == *"ERROR"* ]] || [[ "$line" == *"Failed"* ]]; then
                echo -e "${RED}$line${NC}"
            elif [[ "$line" == *"SUCCESS"* ]] || [[ "$line" == *"✓"* ]]; then
                echo -e "${GREEN}$line${NC}"
            elif [[ "$line" == *"WARNING"* ]] || [[ "$line" == *"WARN"* ]]; then
                echo -e "${YELLOW}$line${NC}"
            else
                echo "$line"
            fi
        done
    else
        local error=$(echo "$response" | jq -r '.error' 2>/dev/null)
        log_error "로그 조회 실패: $error"
        return 1
    fi
}

# 실시간 로그 모니터링
cmd_tail() {
    local project_name=$1
    local log_type=${2:-app}
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 tail <프로젝트명> [app|pm2]"
        return 1
    fi
    
    log_header "📺 실시간 로그 모니터링: $project_name ($log_type)"
    log_info "중단하려면 Ctrl+C를 누르세요"
    
    if ! check_api_connection; then
        return 1
    fi
    
    # Server-Sent Events를 통한 실시간 로그 스트림
    curl -s --max-time 3600 \
         "${API_BASE}/projects/$project_name/logs/stream?type=$log_type" | \
    while read -r line; do
        if [[ "$line" =~ ^data:.*$ ]]; then
            local json_data=$(echo "$line" | sed 's/^data: //')
            local log_line=$(echo "$json_data" | jq -r '.log' 2>/dev/null)
            local log_type_resp=$(echo "$json_data" | jq -r '.type' 2>/dev/null)
            local timestamp=$(echo "$json_data" | jq -r '.timestamp' 2>/dev/null)
            
            if [ "$log_line" != "null" ] && [ -n "$log_line" ]; then
                local time_short=$(echo "$timestamp" | cut -c12-19)
                
                if [ "$log_type_resp" = "error" ]; then
                    echo -e "${RED}[$time_short] $log_line${NC}"
                elif [[ "$log_line" == *"SUCCESS"* ]] || [[ "$log_line" == *"✓"* ]]; then
                    echo -e "${GREEN}[$time_short] $log_line${NC}"
                elif [[ "$log_line" == *"WARNING"* ]] || [[ "$log_line" == *"WARN"* ]]; then
                    echo -e "${YELLOW}[$time_short] $log_line${NC}"
                else
                    echo "[$time_short] $log_line"
                fi
            fi
        fi
    done
}

# 파일 구조 확인
cmd_files() {
    local project_name=$1
    local target_path=${2:-/}
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 files <프로젝트명> [경로]"
        return 1
    fi
    
    log_header "📁 파일 구조: $project_name ($target_path)"
    
    if ! check_api_connection; then
        return 1
    fi
    
    local response=$(api_call GET "/projects/$project_name/files?path=$target_path")
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        echo "$response" | jq -r '.files[] | if .type == "directory" then "📁 \(.name)/" else "📄 \(.name)" end'
    else
        local error=$(echo "$response" | jq -r '.error' 2>/dev/null)
        log_error "파일 구조 조회 실패: $error"
        return 1
    fi
}

# 종합 진단
cmd_diagnose() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 diagnose <프로젝트명>"
        return 1
    fi
    
    log_header "🔍 종합 진단: $project_name"
    
    if ! check_api_connection; then
        return 1
    fi
    
    local response=$(api_call GET "/projects/$project_name/diagnose")
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        local diagnosis=$(echo "$response" | jq -r '.diagnosis')
        local health_score=$(echo "$diagnosis" | jq -r '.healthScore')
        local status=$(echo "$diagnosis" | jq -r '.status')
        local timestamp=$(echo "$diagnosis" | jq -r '.timestamp')
        
        echo "진단 시간: $timestamp"
        echo "건강 점수: $health_score%"
        
        local status_icon="🔴"
        local status_color="$RED"
        
        if [ "$status" = "healthy" ]; then
            status_icon="🟢"
            status_color="$GREEN"
        elif [ "$status" = "warning" ]; then
            status_icon="🟡"
            status_color="$YELLOW"
        fi
        
        echo -e "전체 상태: $status_icon ${status_color}$status${NC}"
        echo ""
        
        echo "상세 검사 결과:"
        
        # 컨테이너 상태
        local container_status=$(echo "$diagnosis" | jq -r '.checks.container.status')
        local container_running=$(echo "$diagnosis" | jq -r '.checks.container.running')
        echo "• 컨테이너: $container_status (실행중: $container_running)"
        
        # 애플리케이션 파일
        local package_json=$(echo "$diagnosis" | jq -r '.checks.packageJson')
        local node_modules=$(echo "$diagnosis" | jq -r '.checks.nodeModules')
        echo "• package.json: $package_json"
        echo "• node_modules: $node_modules"
        
        # 포트 상태
        if echo "$diagnosis" | jq -e '.checks.port.allocated' >/dev/null 2>&1; then
            local port=$(echo "$diagnosis" | jq -r '.checks.port.allocated')
            local listening=$(echo "$diagnosis" | jq -r '.checks.port.listening')
            echo "• 포트 $port: listening=$listening"
        fi
        
        # 빌드 로그
        local build_logs_available=$(echo "$diagnosis" | jq -r '.checks.buildLogs.available')
        if [ "$build_logs_available" = "true" ]; then
            local has_errors=$(echo "$diagnosis" | jq -r '.checks.buildLogs.hasErrors')
            echo "• 빌드 로그: 사용 가능 (에러: $has_errors)"
        else
            echo "• 빌드 로그: 사용 불가"
        fi
        
        # PM2 상태
        local pm2_running=$(echo "$diagnosis" | jq -r '.checks.pm2.running')
        echo "• PM2: 실행중=$pm2_running"
        
    else
        local error=$(echo "$response" | jq -r '.error' 2>/dev/null)
        log_error "진단 실패: $error"
        return 1
    fi
}

# 데이터베이스 관리
cmd_db() {
    local subcommand=$1
    local project_name=$2
    shift 2
    
    if ! check_api_connection; then
        return 1
    fi
    
    case $subcommand in
        "backup")
            if [ -z "$project_name" ]; then
                log_error "사용법: $0 db backup <프로젝트명>"
                return 1
            fi
            
            log_header "💾 데이터베이스 백업: $project_name"
            
            local timestamp=$(date +%Y%m%d_%H%M%S)
            local backup_file="${project_name}_${timestamp}.sql"
            
            # Download backup file
            local url="${API_BASE}/projects/${project_name}/db/backup"
            log_info "백업 파일 다운로드 중..."
            
            if curl -s --max-time 60 -o "$backup_file" "$url"; then
                if [ -s "$backup_file" ]; then
                    local size=$(du -h "$backup_file" | cut -f1)
                    log_success "백업 완료: $backup_file ($size)"
                else
                    log_error "백업 파일이 비어있습니다"
                    rm -f "$backup_file"
                    return 1
                fi
            else
                log_error "백업 실패"
                rm -f "$backup_file"
                return 1
            fi
            ;;
            
        "restore")
            local backup_file=$1
            
            if [ -z "$project_name" ] || [ -z "$backup_file" ]; then
                log_error "사용법: $0 db restore <프로젝트명> <백업파일>"
                return 1
            fi
            
            if [ ! -f "$backup_file" ]; then
                log_error "백업 파일을 찾을 수 없습니다: $backup_file"
                return 1
            fi
            
            log_header "🔄 데이터베이스 복원: $project_name"
            log_warning "주의: 기존 데이터가 백업 후 덮어쓰여집니다"
            
            read -p "계속하시겠습니까? (y/N): " -r
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_info "취소되었습니다"
                return 0
            fi
            
            log_info "복원 중... (시간이 걸릴 수 있습니다)"
            
            local response=$(curl -s --max-time 120 -X POST \
                -F "backup=@$backup_file" \
                "${API_BASE}/projects/${project_name}/db/restore")
                
            local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
            
            if [ "$success" = "true" ]; then
                local message=$(echo "$response" | jq -r '.message')
                log_success "복원 완료: $message"
            else
                local error=$(echo "$response" | jq -r '.error' 2>/dev/null)
                log_error "복원 실패: $error"
                return 1
            fi
            ;;
            
        "tables")
            if [ -z "$project_name" ]; then
                log_error "사용법: $0 db tables <프로젝트명>"
                return 1
            fi
            
            log_header "📋 데이터베이스 테이블: $project_name"
            
            local response=$(api_call GET "/projects/$project_name/db/tables")
            local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
            
            if [ "$success" = "true" ]; then
                local tables=$(echo "$response" | jq -r '.tables[]')
                local count=$(echo "$response" | jq -r '.count')
                
                echo "데이터베이스: $project_name"
                echo "테이블 수: $count"
                echo ""
                echo "테이블 목록:"
                
                if [ -n "$tables" ]; then
                    echo "$tables" | nl -w2 -s'. '
                else
                    echo "테이블이 없습니다"
                fi
            else
                local error=$(echo "$response" | jq -r '.error' 2>/dev/null)
                log_error "테이블 조회 실패: $error"
                return 1
            fi
            ;;
            
        "query")
            if [ -z "$project_name" ]; then
                log_error "사용법: $0 db query <프로젝트명> '<SQL>'"
                return 1
            fi
            
            local sql_query="$*"
            if [ -z "$sql_query" ]; then
                log_error "SQL 쿼리를 입력하세요"
                return 1
            fi
            
            log_header "🔍 SQL 쿼리 실행: $project_name"
            echo "쿼리: $sql_query"
            echo ""
            
            local json_data=$(jq -n --arg query "$sql_query" '{query: $query}')
            local response=$(api_call POST "/projects/$project_name/db/query" "$json_data")
            local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
            
            if [ "$success" = "true" ]; then
                local result=$(echo "$response" | jq -r '.result')
                local warning=$(echo "$response" | jq -r '.warning')
                
                echo "결과:"
                echo "$result"
                
                if [ "$warning" != "null" ] && [ -n "$warning" ]; then
                    log_warning "경고: $warning"
                fi
            else
                local error=$(echo "$response" | jq -r '.error' 2>/dev/null)
                log_error "쿼리 실행 실패: $error"
                return 1
            fi
            ;;
            
        *)
            echo "사용법: $0 db <명령> <프로젝트명> [옵션]"
            echo ""
            echo "명령:"
            echo "  backup <프로젝트명>              - 데이터베이스 백업"
            echo "  restore <프로젝트명> <백업파일>   - 데이터베이스 복원"
            echo "  tables <프로젝트명>               - 테이블 목록 조회"
            echo "  query <프로젝트명> '<SQL>'        - SQL 쿼리 실행"
            echo ""
            echo "예시:"
            echo "  $0 db backup celly-creative"
            echo "  $0 db restore celly-creative backup.sql"
            echo "  $0 db tables celly-creative"
            echo "  $0 db query celly-creative 'SELECT COUNT(*) FROM users;'"
            ;;
    esac
}

# 프로젝트 삭제
cmd_delete() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 delete <프로젝트명>"
        return 1
    fi
    
    log_warning "⚠️ 프로젝트 삭제는 되돌릴 수 없습니다!"
    echo -n "정말로 '$project_name' 프로젝트를 삭제하시겠습니까? (yes/no): "
    read -r confirmation
    
    if [ "$confirmation" != "yes" ]; then
        log_info "삭제가 취소되었습니다"
        return 0
    fi
    
    log_header "🗑️ 프로젝트 삭제: $project_name"
    
    if ! check_api_connection; then
        return 1
    fi
    
    local response=$(api_call DELETE "/projects/$project_name")
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        log_success "프로젝트 삭제 완료"
    else
        local error=$(echo "$response" | jq -r '.error' 2>/dev/null)
        log_error "프로젝트 삭제 실패: $error"
        return 1
    fi
}

# 도움말
show_help() {
    echo -e "${BOLD}${CYAN}CodeB CLI v$VERSION - 100% API 기반 프로젝트 관리${NC}"
    echo ""
    echo "사용법: $0 <명령> [옵션]"
    echo ""
    echo -e "${BOLD}프로젝트 관리:${NC}"
    echo "  list                        프로젝트 목록 보기"
    echo "  create <이름> [템플릿]       프로젝트 생성"
    echo "  delete <이름>               프로젝트 삭제"
    echo "  status <이름>               프로젝트 상태 확인"
    echo ""
    echo -e "${BOLD}프로젝트 제어:${NC}"
    echo "  start <이름>                프로젝트 시작"
    echo "  stop <이름>                 프로젝트 중지"
    echo "  restart <이름>              프로젝트 재시작"
    echo ""
    echo -e "${BOLD}배포 & 빌드:${NC}"
    echo "  deploy <이름> <git-url> [브랜치] [--db-backup <URL>]  코드 배포"
    echo "  build <이름> [build|dev|start]   빌드 실행"
    echo ""
    echo -e "${BOLD}모니터링:${NC}"
    echo "  logs <이름> [app|build|pm2] [라인수]  로그 보기"
    echo "  tail <이름> [app|pm2]       실시간 로그 모니터링"
    echo "  files <이름> [경로]         파일 구조 확인"
    echo "  diagnose <이름>             종합 진단"
    echo ""
    echo -e "${BOLD}데이터베이스:${NC}"
    echo "  db backup <이름>            데이터베이스 백업"
    echo "  db restore <이름> <파일>     데이터베이스 복원"
    echo "  db tables <이름>            테이블 목록 조회"
    echo "  db query <이름> '<SQL>'     SQL 쿼리 실행"
    echo ""
    echo -e "${BOLD}템플릿:${NC} nodejs, python, php, go, static"
    echo -e "${BOLD}API 서버:${NC} $API_BASE"
    echo ""
}

# 메인 로직
main() {
    # jq 설치 확인
    if ! command -v jq >/dev/null 2>&1; then
        log_error "jq가 설치되어 있지 않습니다"
        log_info "설치 방법: apt install jq (Ubuntu) 또는 yum install jq (CentOS)"
        exit 1
    fi
    
    # cURL 설치 확인
    if ! command -v curl >/dev/null 2>&1; then
        log_error "curl이 설치되어 있지 않습니다"
        exit 1
    fi
    
    local command=$1
    shift
    
    case $command in
        "list"|"ls")
            cmd_list "$@"
            ;;
        "create")
            cmd_create "$@"
            ;;
        "delete"|"remove"|"rm")
            cmd_delete "$@"
            ;;
        "status"|"stat")
            cmd_status "$@"
            ;;
        "start")
            cmd_control "start" "$@"
            ;;
        "stop")
            cmd_control "stop" "$@"
            ;;
        "restart")
            cmd_control "restart" "$@"
            ;;
        "deploy")
            cmd_deploy "$@"
            ;;
        "build")
            cmd_build "$@"
            ;;
        "logs")
            cmd_logs "$@"
            ;;
        "tail")
            cmd_tail "$@"
            ;;
        "files")
            cmd_files "$@"
            ;;
        "diagnose"|"diag")
            cmd_diagnose "$@"
            ;;
        "db")
            cmd_db "$@"
            ;;
        "help"|"--help"|"-h"|"")
            show_help
            ;;
        *)
            log_error "알 수 없는 명령: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# 스크립트 실행
main "$@"