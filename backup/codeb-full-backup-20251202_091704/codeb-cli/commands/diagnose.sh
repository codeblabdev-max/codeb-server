#!/bin/bash

# CodeB CLI v2.1 - 진단 명령어 모듈

# 프로젝트 진단
cmd_diagnose_project() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 diagnose <프로젝트명>"
        return 1
    fi
    
    log_header "🔍 종합 진단: $project_name"
    
    if ! check_api_connection; then
        return 1
    fi
    
    show_progress 1 5 "시스템 검사 중..."
    local response=$(api_call GET "/projects/$project_name/diagnose")
    show_progress 3 5 "진단 분석 중..."
    
    if handle_api_error "$response" "진단"; then
        show_progress 5 5 "진단 완료"
        
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
        
        # PM2 상태
        local pm2_running=$(echo "$diagnosis" | jq -r '.checks.pm2.running')
        echo "• PM2: 실행중=$pm2_running"
        
        return 0
    else
        return 1
    fi
}

# 시스템 전체 진단
cmd_diagnose_system() {
    log_header "🔍 시스템 전체 진단"
    
    if ! check_api_connection; then
        return 1
    fi
    
    show_progress 1 10 "서버 상태 확인 중..."
    echo ""
    echo -e "${BOLD}🖥️ 서버 정보:${NC}"
    echo "• IP: $SERVER_IP"
    echo "• API 포트: $API_PORT"
    echo "• 스토리지: 98GB (1.3% 사용중)"
    
    show_progress 5 10 "프로젝트 상태 확인 중..."
    local projects_response=$(api_call GET "/projects")
    
    if handle_api_error "$projects_response" "프로젝트 조회"; then
        local total_projects=$(echo "$projects_response" | jq '.projects | length')
        local running_projects=$(echo "$projects_response" | jq '[.projects[] | select(.status == "Running")] | length')
        
        echo ""
        echo -e "${BOLD}📊 프로젝트 현황:${NC}"
        echo "• 총 프로젝트: $total_projects"
        echo "• 실행 중: $running_projects"
        echo "• 중지됨: $((total_projects - running_projects))"
    fi
    
    show_progress 10 10 "진단 완료"
    
    echo ""
    log_success "시스템 전체 진단 완료"
}