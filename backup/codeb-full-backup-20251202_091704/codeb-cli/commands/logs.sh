#!/bin/bash

# CodeB CLI v2.1 - 로그 모니터링 명령어 모듈

# 로그 보기
cmd_logs_show() {
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
    
    local endpoint="/projects/$project_name/logs?container=$log_type&lines=$lines"
    if [ "$log_type" = "build" ]; then
        endpoint="/projects/$project_name/logs/build?lines=$lines"
    elif [ "$log_type" = "pm2" ]; then
        endpoint="/projects/$project_name/logs/pm2?lines=$lines"
    fi
    
    local response=$(api_call GET "$endpoint")
    
    if handle_api_error "$response" "로그 조회"; then
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
        return 0
    else
        return 1
    fi
}

# 실시간 로그
cmd_logs_tail() {
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
            local timestamp=$(echo "$json_data" | jq -r '.timestamp' 2>/dev/null)
            
            if [ "$log_line" != "null" ] && [ -n "$log_line" ]; then
                local time_short=$(echo "$timestamp" | cut -c12-19 2>/dev/null || echo "00:00:00")
                
                if [[ "$log_line" == *"ERROR"* ]]; then
                    echo -e "${RED}[$time_short] $log_line${NC}"
                elif [[ "$log_line" == *"SUCCESS"* ]]; then
                    echo -e "${GREEN}[$time_short] $log_line${NC}"
                else
                    echo "[$time_short] $log_line"
                fi
            fi
        fi
    done
}

# 파일 구조 확인
cmd_logs_files() {
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
    
    if handle_api_error "$response" "파일 구조 조회"; then
        echo "$response" | jq -r '.files[] | if .type == "directory" then "📁 \(.name)/" else "📄 \(.name)" end'
        return 0
    else
        return 1
    fi
}