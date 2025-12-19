#!/bin/bash

# CodeB CLI v3.5 - 프로젝트 관리 명령어 모듈

# 프로젝트 목록
cmd_project_list() {
    log_header "📋 프로젝트 목록"
    
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
    
    echo -e "${BOLD}┌────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${BOLD}│                    CodeB 프로젝트 목록                      │${NC}"
    echo -e "${BOLD}├────────────────┬─────────┬────────┬─────────────────────────┤${NC}"
    echo -e "${BOLD}│ 프로젝트명      │ 포트    │ 상태   │ 도메인                   │${NC}"
    echo -e "${BOLD}├────────────────┼─────────┼────────┼─────────────────────────┤${NC}"
    
    echo "$response" | jq -r '.projects[] | [.name, .appPort, .status, .domain] | @tsv' | while read -r name port status domain; do
        local status_color="$RED"
        
        if [ "$status" = "Running" ]; then
            status_color="$GREEN"
        elif [ "$status" = "Paused" ]; then
            status_color="$YELLOW"
        fi
        
        printf "│ %-14s │ %-7s │ %s%-6s%s │ %-23s │\n" \
            "$name" "$port" "$status_color" "$status" "$NC" "$domain"
    done
    
    echo -e "${BOLD}└────────────────┴─────────┴────────┴─────────────────────────┘${NC}"
}

# 프로젝트 생성
cmd_project_create() {
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
    
    if ! validate_project_name "$project_name"; then
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
    show_progress 1 10 "컨테이너 설정 중..."
    
    local response=$(api_call POST "/projects" "$create_data" 120)
    
    if ! handle_api_error "$response" "프로젝트 생성"; then
        return 1
    fi
    
    show_progress 10 10 "프로젝트 생성 완료"
    
    # 응답 파싱
    local message=$(parse_api_response "$response" ".message")
    local next_step=$(parse_api_response "$response" ".nextStep")
    
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
        
        if [ "$next_step" != "null" ] && [ "$next_step" != "false" ]; then
            echo -e "${BOLD}🚀 다음 단계:${NC}"
            echo "  $next_step"
            echo ""
        fi
        
        # 접속 정보가 있는 경우 표시
        if echo "$response" | jq -e '.access.url' >/dev/null 2>&1; then
            local url=$(parse_api_response "$response" ".access.url")
            local domain=$(parse_api_response "$response" ".access.domain")
            echo -e "${BOLD}📊 접속 정보:${NC}"
            echo "• URL: $url"
            if [ "$domain" != "null" ] && [ "$domain" != "false" ]; then
                echo "• 도메인: https://$domain"
            fi
        fi
        
        return 0
    fi
    
    # 새로 생성된 경우
    local port=$(parse_api_response "$response" ".project.appPort")
    local domain=$(parse_api_response "$response" ".project.domain")
    
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
}

# 프로젝트 상태 확인
cmd_project_status() {
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
    
    if ! handle_api_error "$response" "상태 조회"; then
        return 1
    fi
    
    local status=$(parse_api_response "$response" ".status")
    local running=$(parse_api_response "$response" ".running")
    
    echo "상태: $status"
    echo "실행 중: $running"
    
    # 컨테이너 정보
    if echo "$response" | jq -e '.containers' >/dev/null 2>&1; then
        echo ""
        echo "컨테이너 목록:"
        echo "$response" | jq -r '.containers[] | "• \(.name): \(.state) (\(.status))"'
    fi
}

# 프로젝트 삭제
cmd_project_delete() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 delete <프로젝트명>"
        return 1
    fi
    
    if ! validate_project_name "$project_name"; then
        return 1
    fi
    
    log_warning "⚠️ 프로젝트 삭제는 되돌릴 수 없습니다!"
    
    if ! confirm_action "정말로 '$project_name' 프로젝트를 삭제하시겠습니까?" "N"; then
        log_info "삭제가 취소되었습니다"
        return 0
    fi
    
    log_header "🗑️ 프로젝트 삭제: $project_name"
    
    if ! check_api_connection; then
        return 1
    fi
    
    local response=$(api_call DELETE "/projects/$project_name")
    
    if handle_api_error "$response" "프로젝트 삭제"; then
        log_success "프로젝트 삭제 완료"
        return 0
    else
        return 1
    fi
}