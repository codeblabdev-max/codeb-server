#!/bin/bash

# CodeB CLI v2.1 - 배포 관리 명령어 모듈

# 코드 배포
cmd_deploy_code() {
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
    
    if ! validate_project_name "$project_name"; then
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
    
    # 배포 진행 상황 표시
    show_progress 1 10 "Git 저장소 복제 중..."
    sleep 1
    show_progress 3 10 "의존성 설치 중..."
    sleep 2
    show_progress 5 10 "빌드 실행 중..."
    sleep 2
    show_progress 7 10 "데이터베이스 설정 중..."
    sleep 1
    show_progress 9 10 "서비스 시작 중..."
    
    local response=$(api_call POST "/projects/$project_name/deploy" "$deploy_data" 600)
    
    if handle_api_error "$response" "배포"; then
        show_progress 10 10 "배포 완료"
        
        local url=$(parse_api_response "$response" ".url")
        local domain=$(parse_api_response "$response" ".domain")
        
        log_success "배포 완료!"
        echo ""
        echo -e "${BOLD}📊 배포 정보:${NC}"
        echo "• 접속 URL: $url"
        if [ "$domain" != "null" ] && [ "$domain" != "false" ] && [ -n "$domain" ]; then
            echo "• 도메인: https://$domain"
        fi
        echo "• Git 브랜치: $branch"
        if [ -n "$db_backup_url" ]; then
            echo "• DB 복원: 완료"
        fi
        return 0
    else
        return 1
    fi
}

# 빌드 실행
cmd_deploy_build() {
    local project_name=$1
    local build_type=${2:-build}
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 build <프로젝트명> [build|dev|start]"
        return 1
    fi
    
    if ! validate_project_name "$project_name"; then
        return 1
    fi
    
    log_header "🔨 빌드 실행: $project_name ($build_type)"
    
    if ! check_api_connection; then
        return 1
    fi
    
    local build_data=$(jq -n --arg type "$build_type" '{type: $type}')
    
    log_info "빌드 시작 중..."
    show_progress 1 5 "빌드 요청 전송 중..."
    
    local response=$(api_call POST "/projects/$project_name/build" "$build_data" 60)
    
    if handle_api_error "$response" "빌드 시작"; then
        show_progress 2 5 "빌드 큐에 등록됨"
        
        local build_id=$(parse_api_response "$response" ".buildId")
        local status=$(parse_api_response "$response" ".status")
        
        show_progress 5 5 "빌드 시작 완료"
        log_success "빌드가 시작되었습니다 (ID: $build_id)"
        echo "상태: $status"
        
        if [ "$status" = "running" ]; then
            echo ""
            log_info "빌드 로그 확인: $0 logs $project_name build"
            log_info "실시간 모니터링: $0 tail $project_name"
        fi
        return 0
    else
        return 1
    fi
}

# 배포 히스토리
cmd_deploy_history() {
    local project_name=$1
    local limit=${2:-10}
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 history <프로젝트명> [개수]"
        return 1
    fi
    
    log_header "📜 배포 히스토리: $project_name"
    
    if ! check_api_connection; then
        return 1
    fi
    
    local response=$(api_call GET "/projects/$project_name/deploys?limit=$limit")
    
    if handle_api_error "$response" "배포 히스토리 조회"; then
        local deploys=$(echo "$response" | jq -r '.deploys[]' 2>/dev/null)
        
        if [ -z "$deploys" ]; then
            log_info "배포 히스토리가 없습니다"
            return 0
        fi
        
        echo -e "${BOLD}최근 $limit개 배포:${NC}"
        echo ""
        
        echo "$response" | jq -r '.deploys[] | [.id, .timestamp, .status, .branch, .commit] | @tsv' | \
        while read -r id timestamp status branch commit; do
            local status_color="$RED"
            local status_icon="❌"
            
            if [ "$status" = "success" ]; then
                status_color="$GREEN"
                status_icon="✅"
            elif [ "$status" = "running" ]; then
                status_color="$YELLOW"
                status_icon="🔄"
            fi
            
            echo -e "$status_icon #$id - $timestamp"
            echo -e "   ${status_color}$status${NC} | 브랜치: $branch | 커밋: ${commit:0:7}"
            echo ""
        done
        return 0
    else
        return 1
    fi
}

# 롤백
cmd_deploy_rollback() {
    local project_name=$1
    local deploy_id=$2
    
    if [ -z "$project_name" ] || [ -z "$deploy_id" ]; then
        log_error "사용법: $0 rollback <프로젝트명> <배포ID>"
        return 1
    fi
    
    log_warning "⚠️ 롤백은 현재 배포를 이전 상태로 되돌립니다"
    
    if ! confirm_action "정말로 배포 #$deploy_id로 롤백하시겠습니까?" "N"; then
        log_info "롤백이 취소되었습니다"
        return 0
    fi
    
    log_header "🔄 롤백 실행: $project_name → #$deploy_id"
    
    if ! check_api_connection; then
        return 1
    fi
    
    local rollback_data=$(jq -n --arg deployId "$deploy_id" '{deployId: $deployId}')
    
    show_progress 1 5 "롤백 준비 중..."
    local response=$(api_call POST "/projects/$project_name/rollback" "$rollback_data" 300)
    show_progress 3 5 "이전 버전 복원 중..."
    
    if handle_api_error "$response" "롤백"; then
        show_progress 5 5 "롤백 완료"
        
        local url=$(parse_api_response "$response" ".url")
        
        log_success "롤백이 완료되었습니다!"
        echo "접속 URL: $url"
        return 0
    else
        return 1
    fi
}