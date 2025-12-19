#!/bin/bash

# CodeB CLI v2.1 - 프로젝트 제어 명령어 모듈

# 프로젝트 시작
cmd_control_start() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 start <프로젝트명>"
        return 1
    fi
    
    if ! validate_project_name "$project_name"; then
        return 1
    fi
    
    log_header "🔄 프로젝트 시작: $project_name"
    
    if ! check_api_connection; then
        return 1
    fi
    
    show_progress 1 3 "시작 요청 전송 중..."
    local response=$(api_call POST "/projects/$project_name/start" "{}")
    show_progress 2 3 "컨테이너 시작 중..."
    
    if handle_api_error "$response" "프로젝트 시작"; then
        show_progress 3 3 "프로젝트 시작 완료"
        log_success "프로젝트가 성공적으로 시작되었습니다"
        
        # 접속 정보 표시
        local url=$(parse_api_response "$response" ".url")
        if [ "$url" != "null" ] && [ "$url" != "false" ]; then
            echo ""
            echo -e "${BOLD}📊 접속 정보:${NC}"
            echo "• URL: $url"
        fi
        return 0
    else
        return 1
    fi
}

# 프로젝트 중지
cmd_control_stop() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 stop <프로젝트명>"
        return 1
    fi
    
    if ! validate_project_name "$project_name"; then
        return 1
    fi
    
    log_header "🔄 프로젝트 중지: $project_name"
    
    if ! check_api_connection; then
        return 1
    fi
    
    show_progress 1 3 "중지 요청 전송 중..."
    local response=$(api_call POST "/projects/$project_name/stop" "{}")
    show_progress 2 3 "컨테이너 중지 중..."
    
    if handle_api_error "$response" "프로젝트 중지"; then
        show_progress 3 3 "프로젝트 중지 완료"
        log_success "프로젝트가 성공적으로 중지되었습니다"
        return 0
    else
        return 1
    fi
}

# 프로젝트 재시작
cmd_control_restart() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 restart <프로젝트명>"
        return 1
    fi
    
    if ! validate_project_name "$project_name"; then
        return 1
    fi
    
    log_header "🔄 프로젝트 재시작: $project_name"
    
    if ! check_api_connection; then
        return 1
    fi
    
    show_progress 1 5 "재시작 요청 전송 중..."
    local response=$(api_call POST "/projects/$project_name/restart" "{}")
    show_progress 2 5 "컨테이너 중지 중..."
    sleep 2
    show_progress 3 5 "컨테이너 시작 중..."
    sleep 2
    show_progress 4 5 "서비스 확인 중..."
    
    if handle_api_error "$response" "프로젝트 재시작"; then
        show_progress 5 5 "프로젝트 재시작 완료"
        log_success "프로젝트가 성공적으로 재시작되었습니다"
        
        # 접속 정보 표시
        local url=$(parse_api_response "$response" ".url")
        if [ "$url" != "null" ] && [ "$url" != "false" ]; then
            echo ""
            echo -e "${BOLD}📊 접속 정보:${NC}"
            echo "• URL: $url"
        fi
        return 0
    else
        return 1
    fi
}

# 모든 프로젝트 상태 확인
cmd_control_status_all() {
    log_header "📊 모든 프로젝트 상태"
    
    if ! check_api_connection; then
        return 1
    fi
    
    local response=$(api_call GET "/projects")
    
    if ! handle_api_error "$response" "프로젝트 목록 조회"; then
        return 1
    fi
    
    local projects=$(echo "$response" | jq -r '.projects[]' 2>/dev/null)
    
    if [ -z "$projects" ]; then
        log_info "프로젝트가 없습니다"
        return 0
    fi
    
    echo "$response" | jq -r '.projects[] | [.name, .status, .appPort] | @tsv' | while read -r name status port; do
        local status_icon="🔴"
        local status_color="$RED"
        
        if [ "$status" = "Running" ]; then
            status_icon="🟢"
            status_color="$GREEN"
        elif [ "$status" = "Paused" ]; then
            status_icon="🟡"
            status_color="$YELLOW"
        fi
        
        echo -e "$status_icon $name: ${status_color}$status${NC} (포트: $port)"
    done
}