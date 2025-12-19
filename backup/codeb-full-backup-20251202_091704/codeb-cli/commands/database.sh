#!/bin/bash

# CodeB CLI v2.1 - 데이터베이스 관리 명령어 모듈

# 데이터베이스 명령어 라우터
cmd_database() {
    local subcommand=$1
    local project_name=$2
    shift 2
    
    if ! check_api_connection; then
        return 1
    fi
    
    case $subcommand in
        "backup")
            cmd_db_backup "$project_name" "$@"
            ;;
        "restore")
            cmd_db_restore "$project_name" "$@"
            ;;
        "tables")
            cmd_db_tables "$project_name" "$@"
            ;;
        "query")
            cmd_db_query "$project_name" "$@"
            ;;
        "push")
            cmd_db_push "$project_name" "$@"
            ;;
        *)
            show_db_help
            ;;
    esac
}

# 데이터베이스 백업
cmd_db_backup() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 db backup <프로젝트명>"
        return 1
    fi
    
    log_header "💾 데이터베이스 백업: $project_name"
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="${project_name}_${timestamp}.sql"
    
    log_info "백업 파일 다운로드 중..."
    show_progress 1 3 "백업 생성 중..."
    
    if api_download_file "/projects/${project_name}/db/backup" "$backup_file" 60; then
        show_progress 3 3 "백업 완료"
        local size=$(du -h "$backup_file" | cut -f1)
        log_success "백업 완료: $backup_file ($size)"
        return 0
    else
        rm -f "$backup_file"
        return 1
    fi
}

# 데이터베이스 복원
cmd_db_restore() {
    local project_name=$1
    local backup_file=$2
    
    if [ -z "$project_name" ] || [ -z "$backup_file" ]; then
        log_error "사용법: $0 db restore <프로젝트명> <백업파일>"
        return 1
    fi
    
    if ! check_file_exists "$backup_file" "백업"; then
        return 1
    fi
    
    log_header "🔄 데이터베이스 복원: $project_name"
    log_warning "주의: 기존 데이터가 백업 후 덮어쓰여집니다"
    
    if ! confirm_action "계속하시겠습니까?" "N"; then
        log_info "취소되었습니다"
        return 0
    fi
    
    log_info "복원 중... (시간이 걸릴 수 있습니다)"
    show_progress 1 5 "백업 업로드 중..."
    
    local response=$(api_upload_file "/projects/${project_name}/db/restore" "backup" "$backup_file" 120)
    
    if handle_api_error "$response" "복원"; then
        show_progress 5 5 "복원 완료"
        local message=$(parse_api_response "$response" ".message")
        log_success "복원 완료: $message"
        return 0
    else
        return 1
    fi
}

# 테이블 목록
cmd_db_tables() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: $0 db tables <프로젝트명>"
        return 1
    fi
    
    log_header "📋 데이터베이스 테이블: $project_name"
    
    local response=$(api_call GET "/projects/$project_name/db/tables")
    
    if handle_api_error "$response" "테이블 조회"; then
        local tables=$(parse_api_response "$response" ".tables[]")
        local count=$(parse_api_response "$response" ".count")
        
        echo "데이터베이스: $project_name"
        echo "테이블 수: $count"
        echo ""
        echo "테이블 목록:"
        
        if [ -n "$tables" ] && [ "$tables" != "null" ]; then
            echo "$tables" | nl -w2 -s'. '
        else
            echo "테이블이 없습니다"
        fi
        return 0
    else
        return 1
    fi
}

# SQL 쿼리 실행
cmd_db_query() {
    local project_name=$1
    shift
    
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
    
    if handle_api_error "$response" "쿼리 실행"; then
        local result=$(parse_api_response "$response" ".result")
        local warning=$(parse_api_response "$response" ".warning")
        
        echo "결과:"
        echo "$result"
        
        if [ "$warning" != "null" ] && [ -n "$warning" ]; then
            log_warning "경고: $warning"
        fi
        return 0
    else
        return 1
    fi
}

# SQL 파일 푸시
cmd_db_push() {
    local project_name=$1
    local sql_file=$2
    
    if [ -z "$project_name" ] || [ -z "$sql_file" ]; then
        log_error "사용법: $0 db push <프로젝트명> <SQL파일>"
        return 1
    fi
    
    if ! check_file_exists "$sql_file" "SQL"; then
        return 1
    fi
    
    log_header "🚀 SQL 파일 푸시: $project_name"
    log_info "파일: $sql_file"
    
    local file_size=$(du -h "$sql_file" | cut -f1)
    log_info "크기: $file_size"
    
    log_warning "주의: SQL 파일을 데이터베이스에 직접 실행합니다"
    
    if ! confirm_action "계속하시겠습니까?" "N"; then
        log_info "취소되었습니다"
        return 0
    fi
    
    log_info "SQL 실행 중... (시간이 걸릴 수 있습니다)"
    
    local response=$(api_upload_file "/projects/${project_name}/db/push" "sqlFile" "$sql_file" 180)
    
    if handle_api_error "$response" "SQL 실행"; then
        local message=$(parse_api_response "$response" ".message")
        local affected_rows=$(parse_api_response "$response" ".affectedRows")
        
        log_success "SQL 실행 완료: $message"
        if [ "$affected_rows" != "null" ] && [ "$affected_rows" != "false" ]; then
            log_info "영향받은 행: $affected_rows"
        fi
        return 0
    else
        return 1
    fi
}

# 데이터베이스 도움말
show_db_help() {
    echo "사용법: $0 db <명령> <프로젝트명> [옵션]"
    echo ""
    echo "명령:"
    echo "  backup <프로젝트명>              - 데이터베이스 백업"
    echo "  restore <프로젝트명> <백업파일>   - 데이터베이스 복원"
    echo "  tables <프로젝트명>               - 테이블 목록 조회"
    echo "  query <프로젝트명> '<SQL>'        - SQL 쿼리 실행"
    echo "  push <프로젝트명> <SQL파일>       - SQL 파일 실행"
    echo ""
}