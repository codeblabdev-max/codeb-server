#!/bin/bash

# CodeB CLI v2.1 - API 호출 모듈

# API 호출 헬퍼 함수
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local timeout=${4:-30}
    
    local url="${API_BASE}${endpoint}"
    local response
    local exit_code
    
    case $method in
        "GET")
            response=$(curl -s --max-time "$timeout" "$url")
            exit_code=$?
            ;;
        "POST")
            response=$(curl -s --max-time "$timeout" -X POST \
                 -H "Content-Type: application/json" \
                 -d "$data" "$url")
            exit_code=$?
            ;;
        "DELETE")
            response=$(curl -s --max-time "$timeout" -X DELETE "$url")
            exit_code=$?
            ;;
        "UPLOAD")
            local file_param=$4
            local file_path=$5
            response=$(curl -s --max-time "$timeout" -X POST \
                 -F "$file_param=@$file_path" "$url")
            exit_code=$?
            ;;
        *)
            log_error "지원하지 않는 HTTP 메소드: $method"
            return 1
            ;;
    esac
    
    if [ $exit_code -ne 0 ]; then
        log_error "API 호출 실패: $url (exit code: $exit_code)"
        return $exit_code
    fi
    
    echo "$response"
    return 0
}

# API 서버 연결 확인
check_api_connection() {
    log_info "API 서버 연결 확인 중..."
    
    local health_check
    local exit_code
    
    health_check=$(api_call GET "/health" "" 10)
    exit_code=$?
    
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

# API 응답 파싱
parse_api_response() {
    local response=$1
    local key=${2:-.success}
    
    if [ -z "$response" ]; then
        echo "false"
        return 1
    fi
    
    local value=$(echo "$response" | jq -r "$key" 2>/dev/null)
    
    if [ "$value" = "null" ] || [ -z "$value" ]; then
        echo "false"
        return 1
    fi
    
    echo "$value"
    return 0
}

# API 에러 처리
handle_api_error() {
    local response=$1
    local operation=$2
    
    local success=$(parse_api_response "$response" ".success")
    
    if [ "$success" != "true" ]; then
        local error=$(parse_api_response "$response" ".error")
        log_error "$operation 실패: $error"
        return 1
    fi
    
    return 0
}

# 파일 업로드 API
api_upload_file() {
    local endpoint=$1
    local file_param=$2
    local file_path=$3
    local timeout=${4:-60}
    
    if [ ! -f "$file_path" ]; then
        log_error "업로드할 파일을 찾을 수 없습니다: $file_path"
        return 1
    fi
    
    local file_size=$(du -h "$file_path" | cut -f1)
    log_info "파일 업로드 중: $file_path ($file_size)"
    
    api_call "UPLOAD" "$endpoint" "" "$timeout" "$file_param" "$file_path"
}

# 파일 다운로드 API
api_download_file() {
    local endpoint=$1
    local output_path=$2
    local timeout=${3:-60}
    
    local url="${API_BASE}${endpoint}"
    
    log_info "파일 다운로드 중: $output_path"
    
    if curl -s --max-time "$timeout" -o "$output_path" "$url"; then
        if [ -s "$output_path" ]; then
            local size=$(du -h "$output_path" | cut -f1)
            log_success "다운로드 완료: $output_path ($size)"
            return 0
        else
            log_error "다운로드된 파일이 비어있습니다"
            rm -f "$output_path"
            return 1
        fi
    else
        log_error "다운로드 실패"
        rm -f "$output_path"
        return 1
    fi
}