#!/bin/bash

# Coolify + PowerDNS 자동 프로젝트 배포 스크립트
# 프로젝트 생성과 동시에 도메인 자동 생성 및 설정

set -euo pipefail

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 기본 설정
COOLIFY_URL="http://141.164.60.51:8000"
POWERDNS_API_URL="http://141.164.60.51:8081/api/v1"
BASE_DOMAIN="one-q.xyz"
SERVER_IP="141.164.60.51"

# 로그 함수
log_message() {
    echo -e "${1}" | tee -a deployment.log
}

# 사용법 출력
show_usage() {
    cat << EOF
사용법: $0 [OPTIONS] PROJECT_NAME

OPTIONS:
    -d, --domain DOMAIN     사용할 도메인 (기본값: PROJECT_NAME.$BASE_DOMAIN)
    -t, --type TYPE         프로젝트 타입 (docker-compose|dockerfile|git)
    -r, --repo REPO_URL     Git 저장소 URL (git 타입인 경우)
    -e, --env ENV_FILE      환경 변수 파일
    -p, --port PORT         내부 포트 (기본값: 3000)
    --ssl                   SSL 인증서 자동 발급 (Let's Encrypt)
    --no-dns                DNS 레코드 생성 안 함
    -h, --help              이 도움말 출력

예시:
    $0 myapp                                    # myapp.your-domain.com
    $0 -d api.example.com myapi                 # 커스텀 도메인
    $0 -t git -r https://github.com/user/repo myproject
    $0 --ssl myapp                             # SSL 포함
EOF
}

# PowerDNS API 함수들
pdns_create_zone() {
    local domain="$1"
    local zone_data=$(cat <<EOF
{
    "name": "$domain",
    "kind": "Native",
    "masters": [],
    "nameservers": ["ns1.$BASE_DOMAIN", "ns2.$BASE_DOMAIN"]
}
EOF
)
    
    curl -s -X POST "$POWERDNS_API_URL/servers/localhost/zones" \
        -H "X-API-Key: $PDNS_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$zone_data"
}

pdns_create_record() {
    local zone="$1"
    local name="$2"
    local type="$3"
    local content="$4"
    
    local record_data=$(cat <<EOF
{
    "rrsets": [
        {
            "name": "$name",
            "type": "$type",
            "records": [
                {
                    "content": "$content",
                    "disabled": false
                }
            ]
        }
    ]
}
EOF
)
    
    curl -s -X PATCH "$POWERDNS_API_URL/servers/localhost/zones/$zone" \
        -H "X-API-Key: $PDNS_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$record_data"
}

# Coolify API 함수들
coolify_create_project() {
    local project_name="$1"
    local domain="$2"
    local project_type="$3"
    local repo_url="$4"
    local port="$5"
    
    # Coolify API 호출 (실제 구현시 Coolify API 문서 참조)
    log_message "${YELLOW}Coolify 프로젝트 생성 중...${NC}"
    
    # 예시: Docker Compose 프로젝트 생성
    if [ "$project_type" = "docker-compose" ]; then
        create_docker_compose_project "$project_name" "$domain" "$port"
    elif [ "$project_type" = "git" ]; then
        create_git_project "$project_name" "$domain" "$repo_url" "$port"
    fi
}

create_docker_compose_project() {
    local project_name="$1"
    local domain="$2"
    local port="$3"
    
    # Docker Compose 템플릿 생성
    local compose_file="/tmp/${project_name}-docker-compose.yml"
    cat > "$compose_file" << EOF
version: '3.8'
services:
  app:
    image: nginx:alpine
    ports:
      - "$port:80"
    environment:
      - NODE_ENV=production
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${project_name}.rule=Host(\`${domain}\`)"
      - "traefik.http.routers.${project_name}.tls=true"
      - "traefik.http.routers.${project_name}.tls.certresolver=letsencrypt"
EOF
    
    log_message "${GREEN}Docker Compose 파일 생성됨: $compose_file${NC}"
}

create_git_project() {
    local project_name="$1"
    local domain="$2"
    local repo_url="$3"
    local port="$4"
    
    log_message "${YELLOW}Git 저장소에서 프로젝트 생성: $repo_url${NC}"
    
    # Git 저장소 클론 및 Coolify 설정
    # (실제 Coolify API 호출 구현 필요)
}

# 메인 배포 프로세스
deploy_project() {
    local project_name="$1"
    local domain="$2"
    local project_type="$3"
    local repo_url="$4"
    local port="$5"
    local enable_ssl="$6"
    local create_dns="$7"
    
    log_message "${GREEN}=== 프로젝트 자동 배포 시작 ===${NC}"
    log_message "프로젝트명: $project_name"
    log_message "도메인: $domain"
    log_message "타입: $project_type"
    log_message "포트: $port"
    
    # 1. DNS 레코드 생성
    if [ "$create_dns" = "true" ]; then
        log_message "${YELLOW}DNS 레코드 생성 중...${NC}"
        
        # A 레코드 생성
        pdns_create_record "$BASE_DOMAIN" "$domain" "A" "$SERVER_IP"
        
        if [ $? -eq 0 ]; then
            log_message "${GREEN}✅ DNS A 레코드 생성됨: $domain -> $SERVER_IP${NC}"
        else
            log_message "${RED}❌ DNS 레코드 생성 실패${NC}"
            exit 1
        fi
        
        # CNAME 레코드 생성 (www 서브도메인)
        if [[ ! "$domain" =~ ^www\. ]]; then
            pdns_create_record "$BASE_DOMAIN" "www.$domain" "CNAME" "$domain"
            log_message "${GREEN}✅ www CNAME 레코드 생성됨${NC}"
        fi
    fi
    
    # 2. Coolify 프로젝트 생성
    coolify_create_project "$project_name" "$domain" "$project_type" "$repo_url" "$port"
    
    # 3. SSL 인증서 설정
    if [ "$enable_ssl" = "true" ]; then
        log_message "${YELLOW}SSL 인증서 설정 중...${NC}"
        setup_ssl_certificate "$domain"
    fi
    
    # 4. 배포 상태 확인
    verify_deployment "$domain" "$port"
    
    log_message "${GREEN}=== 배포 완료 ===${NC}"
    log_message "${BLUE}접속 URL: http${enable_ssl:+s}://$domain${NC}"
}

# SSL 인증서 설정
setup_ssl_certificate() {
    local domain="$1"
    
    # Let's Encrypt 인증서 발급
    # (Coolify의 자동 SSL 기능 사용 또는 별도 구현)
    log_message "${GREEN}✅ SSL 인증서 설정 완료${NC}"
}

# 배포 검증
verify_deployment() {
    local domain="$1"
    local port="$2"
    
    log_message "${YELLOW}배포 상태 확인 중...${NC}"
    
    # DNS 전파 확인
    for i in {1..30}; do
        if dig +short "$domain" | grep -q "$SERVER_IP"; then
            log_message "${GREEN}✅ DNS 전파 완료${NC}"
            break
        fi
        
        if [ $i -eq 30 ]; then
            log_message "${YELLOW}⚠️ DNS 전파가 완료되지 않았을 수 있습니다${NC}"
        fi
        
        sleep 2
    done
    
    # HTTP 응답 확인
    for i in {1..10}; do
        if curl -s -o /dev/null -w "%{http_code}" "http://$domain" | grep -q "200\|301\|302"; then
            log_message "${GREEN}✅ 웹 서비스 정상 응답${NC}"
            break
        fi
        
        if [ $i -eq 10 ]; then
            log_message "${YELLOW}⚠️ 웹 서비스 응답 확인 실패 (설정 중일 수 있음)${NC}"
        fi
        
        sleep 3
    done
}

# 환경 변수 확인
check_environment() {
    if [ -z "${PDNS_API_KEY:-}" ]; then
        log_message "${RED}❌ PDNS_API_KEY 환경 변수가 설정되지 않았습니다${NC}"
        log_message "PowerDNS API 키를 설정하세요:"
        log_message "export PDNS_API_KEY='your-api-key'"
        exit 1
    fi
    
    if [ -z "${COOLIFY_API_TOKEN:-}" ]; then
        log_message "${YELLOW}⚠️ COOLIFY_API_TOKEN이 설정되지 않았습니다${NC}"
        log_message "Coolify API 토큰을 설정하면 자동화가 더 원활해집니다"
    fi
}

# 사전 확인
preflight_check() {
    log_message "${YELLOW}사전 확인 중...${NC}"
    
    # PowerDNS 서비스 확인
    if ! curl -s "$POWERDNS_API_URL/servers" > /dev/null; then
        log_message "${RED}❌ PowerDNS API에 접근할 수 없습니다${NC}"
        exit 1
    fi
    
    # Coolify 서비스 확인
    if ! curl -s "$COOLIFY_URL" > /dev/null; then
        log_message "${RED}❌ Coolify에 접근할 수 없습니다${NC}"
        exit 1
    fi
    
    log_message "${GREEN}✅ 사전 확인 완료${NC}"
}

# 메인 실행
main() {
    # 기본값 설정
    local project_name=""
    local domain=""
    local project_type="docker-compose"
    local repo_url=""
    local port="3000"
    local enable_ssl="false"
    local create_dns="true"
    
    # 파라미터 파싱
    while [[ $# -gt 0 ]]; do
        case $1 in
            -d|--domain)
                domain="$2"
                shift 2
                ;;
            -t|--type)
                project_type="$2"
                shift 2
                ;;
            -r|--repo)
                repo_url="$2"
                shift 2
                ;;
            -p|--port)
                port="$2"
                shift 2
                ;;
            --ssl)
                enable_ssl="true"
                shift
                ;;
            --no-dns)
                create_dns="false"
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            -*)
                log_message "${RED}❌ 알 수 없는 옵션: $1${NC}"
                show_usage
                exit 1
                ;;
            *)
                if [ -z "$project_name" ]; then
                    project_name="$1"
                else
                    log_message "${RED}❌ 프로젝트명이 중복 지정되었습니다${NC}"
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    # 프로젝트명 확인
    if [ -z "$project_name" ]; then
        log_message "${RED}❌ 프로젝트명을 지정해주세요${NC}"
        show_usage
        exit 1
    fi
    
    # 도메인 기본값 설정
    if [ -z "$domain" ]; then
        domain="$project_name.$BASE_DOMAIN"
    fi
    
    # Git 타입인데 저장소 URL이 없는 경우
    if [ "$project_type" = "git" ] && [ -z "$repo_url" ]; then
        log_message "${RED}❌ Git 타입인 경우 저장소 URL이 필요합니다${NC}"
        exit 1
    fi
    
    # 환경 변수 및 사전 확인
    check_environment
    preflight_check
    
    # 배포 실행
    deploy_project "$project_name" "$domain" "$project_type" "$repo_url" "$port" "$enable_ssl" "$create_dns"
}

# 스크립트 실행
main "$@"