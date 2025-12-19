#!/bin/bash

# CodeB CLI v2.1 - 설정 및 환경변수 모듈

# 기본 설정
VERSION="2.1.0"
SERVER_IP="141.164.60.51"
API_PORT="3008"
API_BASE="http://${SERVER_IP}:${API_PORT}/api"

# 설정 파일 경로
CONFIG_DIR="$HOME/.codeb"
CONFIG_FILE="$CONFIG_DIR/config.json"

# 설정 디렉토리 생성
init_config() {
    if [ ! -d "$CONFIG_DIR" ]; then
        mkdir -p "$CONFIG_DIR"
        log_info "설정 디렉토리 생성: $CONFIG_DIR"
    fi
}

# 기본 설정 생성
create_default_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        cat > "$CONFIG_FILE" << EOF
{
  "version": "$VERSION",
  "server": {
    "ip": "$SERVER_IP",
    "port": "$API_PORT",
    "api_base": "$API_BASE"
  },
  "defaults": {
    "template": "nodejs",
    "log_lines": 50,
    "timeout": 30
  },
  "features": {
    "auto_backup": true,
    "color_output": true,
    "verbose": false
  }
}
EOF
        log_success "기본 설정 파일 생성: $CONFIG_FILE"
    fi
}

# 설정 값 읽기
get_config() {
    local key=$1
    local default_value=$2
    
    if [ -f "$CONFIG_FILE" ] && command -v jq >/dev/null 2>&1; then
        local value=$(jq -r "$key" "$CONFIG_FILE" 2>/dev/null)
        if [ "$value" != "null" ] && [ -n "$value" ]; then
            echo "$value"
        else
            echo "$default_value"
        fi
    else
        echo "$default_value"
    fi
}

# 설정 값 저장
set_config() {
    local key=$1
    local value=$2
    
    if [ -f "$CONFIG_FILE" ] && command -v jq >/dev/null 2>&1; then
        local tmp_file=$(mktemp)
        jq "$key = \"$value\"" "$CONFIG_FILE" > "$tmp_file" && mv "$tmp_file" "$CONFIG_FILE"
        log_success "설정 업데이트: $key = $value"
    else
        log_error "설정 파일 업데이트 실패"
        return 1
    fi
}

# 설정 초기화
init_config
create_default_config

# 동적 설정 로드
SERVER_IP=$(get_config ".server.ip" "$SERVER_IP")
API_PORT=$(get_config ".server.port" "$API_PORT")
API_BASE="http://${SERVER_IP}:${API_PORT}/api"