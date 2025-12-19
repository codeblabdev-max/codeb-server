#!/bin/bash

# CodeB CLI v3.5 - 유틸리티 함수 모듈

# 종속성 확인
check_dependencies() {
    local deps=("jq" "curl")
    local optional_deps=("docker" "podman" "docker-compose" "podman-compose")
    local missing=()
    local missing_optional=()
    
    # 필수 종속성 확인
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" >/dev/null 2>&1; then
            missing+=("$dep")
        fi
    done
    
    # 선택적 종속성 확인 (Docker/Podman)
    local has_container_runtime=false
    if command -v docker >/dev/null 2>&1 || command -v podman >/dev/null 2>&1; then
        has_container_runtime=true
    fi
    
    if ! $has_container_runtime; then
        missing_optional+=("docker 또는 podman")
    fi
    
    if [ ${#missing[@]} -gt 0 ]; then
        log_error "다음 도구들이 설치되어 있지 않습니다: ${missing[*]}"
        log_info "설치 방법:"
        for dep in "${missing[@]}"; do
            case $dep in
                "jq")
                    echo "  apt install jq (Ubuntu) 또는 yum install jq (CentOS) 또는 brew install jq (macOS)"
                    ;;
                "curl")
                    echo "  apt install curl (Ubuntu) 또는 yum install curl (CentOS) 또는 brew install curl (macOS)"
                    ;;
            esac
        done
        exit 1
    fi
    
    # 선택적 종속성 경고
    if [ ${#missing_optional[@]} -gt 0 ]; then
        log_warn "로컬 개발 환경을 위한 도구가 설치되지 않았습니다: ${missing_optional[*]}"
        log_info "설치 권장:"
        echo "  Docker: https://docs.docker.com/get-docker/"
        echo "  Podman: https://podman.io/getting-started/installation"
        echo ""
        echo "  로컬 개발 환경 기능을 사용하려면 Docker 또는 Podman이 필요합니다."
    fi
}

# 컨테이너 런타임 확인
detect_container_runtime() {
    if command -v podman >/dev/null 2>&1; then
        echo "podman"
    elif command -v docker >/dev/null 2>&1; then
        echo "docker"
    else
        echo ""
    fi
}

# 환경 모드 확인
get_environment_mode() {
    if [ -f ".codeb-mode" ]; then
        cat .codeb-mode
    else
        echo "local"  # 기본값
    fi
}

# 프로젝트 이름 검증
validate_project_name() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "프로젝트 이름이 필요합니다"
        return 1
    fi
    
    if ! echo "$project_name" | grep -qE '^[a-z0-9-]+$'; then
        log_error "프로젝트 이름은 소문자, 숫자, 하이픈만 사용 가능합니다"
        return 1
    fi
    
    return 0
}

# 파일 존재 확인
check_file_exists() {
    local file_path=$1
    local file_desc=$2
    
    if [ ! -f "$file_path" ]; then
        log_error "$file_desc 파일을 찾을 수 없습니다: $file_path"
        return 1
    fi
    
    return 0
}

# 사용자 확인 프롬프트
confirm_action() {
    local message=$1
    local default=${2:-"N"}
    
    if [ "$default" = "Y" ]; then
        read -p "$message (Y/n): " -r response
        [[ $response =~ ^[Nn]$ ]] && return 1
    else
        read -p "$message (y/N): " -r response
        [[ ! $response =~ ^[Yy]$ ]] && return 1
    fi
    
    return 0
}

# 진행 상황 표시
show_progress() {
    local current=$1
    local total=$2
    local message=$3
    
    local percent=$((current * 100 / total))
    local bar_length=50
    local filled_length=$((percent * bar_length / 100))
    
    local bar=""
    for ((i=0; i<filled_length; i++)); do bar+="█"; done
    for ((i=filled_length; i<bar_length; i++)); do bar+="░"; done
    
    printf "\r${BLUE}[$bar] %d%% %s${NC}" "$percent" "$message"
    
    if [ "$current" -eq "$total" ]; then
        echo ""
        log_success "완료: $message"
    fi
}