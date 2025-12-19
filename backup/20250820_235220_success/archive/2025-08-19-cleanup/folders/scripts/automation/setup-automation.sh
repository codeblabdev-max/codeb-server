#!/bin/bash

# Coolify + PowerDNS 자동화 환경 설정 스크립트

set -euo pipefail

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SERVER_IP="141.164.60.51"
PDNS_API_KEY="20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5"

# 로그 함수
log_message() {
    echo -e "${1}"
}

# PowerDNS API 접근 설정
setup_powerdns_access() {
    log_message "${YELLOW}PowerDNS API 접근 설정 중...${NC}"
    
    ssh root@$SERVER_IP << 'EOF'
# PowerDNS 설정 업데이트
echo "PowerDNS API 접근 범위 확장 중..."

# 현재 설정 백업
cp /etc/powerdns/pdns.conf /etc/powerdns/pdns.conf.backup

# webserver-allow-from 설정 업데이트 (현재 IP 대역 포함)
sed -i 's/webserver-allow-from=.*/webserver-allow-from=0.0.0.0\/0/' /etc/powerdns/pdns.conf

# 설정 확인
echo "=== 업데이트된 PowerDNS 설정 ==="
grep -E "(api|webserver)" /etc/powerdns/pdns.conf

# PowerDNS 재시작
systemctl restart pdns

# 상태 확인
systemctl status pdns --no-pager -l
EOF
    
    log_message "${GREEN}✅ PowerDNS API 접근 설정 완료${NC}"
}

# Coolify API 토큰 설정 가이드
setup_coolify_token() {
    log_message "${YELLOW}Coolify API 토큰 설정 안내${NC}"
    
    cat << EOF

${BLUE}=== Coolify API 토큰 생성 방법 ===${NC}

1. 브라우저에서 Coolify 접속: http://$SERVER_IP:8000
2. 로그인 후 Settings → API Tokens 메뉴
3. "Create new token" 클릭
4. 토큰 이름 입력 (예: automation-token)
5. 생성된 토큰을 복사

${BLUE}=== 환경 변수 설정 ===${NC}

생성된 토큰을 다음과 같이 설정하세요:

export COOLIFY_API_TOKEN="your-token-here"
echo 'export COOLIFY_API_TOKEN="your-token-here"' >> ~/.zshrc

${BLUE}=== PowerDNS API 키 설정 ===${NC}

export PDNS_API_KEY="$PDNS_API_KEY"
echo 'export PDNS_API_KEY="$PDNS_API_KEY"' >> ~/.zshrc

EOF
}

# 방화벽 설정 (필요시)
setup_firewall() {
    log_message "${YELLOW}방화벽 설정 확인 중...${NC}"
    
    ssh root@$SERVER_IP << 'EOF'
# UFW 상태 확인
if command -v ufw >/dev/null 2>&1; then
    echo "=== UFW 상태 ==="
    ufw status
    
    # PowerDNS API 포트 열기
    echo "PowerDNS API 포트 8081 열기..."
    ufw allow 8081/tcp comment "PowerDNS API"
    
    # 설정 다시 로드
    ufw reload
    
    echo "=== 업데이트된 UFW 규칙 ==="
    ufw status numbered
else
    echo "UFW가 설치되지 않음 또는 다른 방화벽 사용 중"
fi

# iptables 직접 확인
echo -e "\n=== iptables 규칙 ==="
iptables -L -n | grep -E "(8081|8000|53)"
EOF
}

# 도메인 설정 템플릿 생성
create_domain_template() {
    log_message "${YELLOW}도메인 설정 템플릿 생성 중...${NC}"
    
    # 도메인 설정 파일 생성
    cat > /Users/admin/new_project/codeb-server/config/domain-config.json << EOF
{
    "base_domain": "your-domain.com",
    "nameservers": [
        "ns1.your-domain.com",
        "ns2.your-domain.com"
    ],
    "default_ttl": 3600,
    "ssl_enabled": true,
    "ssl_provider": "letsencrypt",
    "auto_www": true,
    "subdomain_patterns": {
        "api": "api.{domain}",
        "app": "app.{domain}",
        "admin": "admin.{domain}",
        "staging": "staging.{domain}"
    }
}
EOF
    
    # 프로젝트 템플릿 생성
    mkdir -p /Users/admin/new_project/codeb-server/templates
    
    cat > /Users/admin/new_project/codeb-server/templates/docker-compose.yml << 'EOF'
version: '3.8'
services:
  app:
    image: ${IMAGE_NAME:-nginx:alpine}
    container_name: ${PROJECT_NAME:-app}
    ports:
      - "${PORT:-3000}:${INTERNAL_PORT:-80}"
    environment:
      - NODE_ENV=${NODE_ENV:-production}
      - DOMAIN=${DOMAIN}
      - DATABASE_URL=${DATABASE_URL:-}
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${PROJECT_NAME}.rule=Host(\`${DOMAIN}\`)"
      - "traefik.http.routers.${PROJECT_NAME}.tls=true"
      - "traefik.http.routers.${PROJECT_NAME}.tls.certresolver=letsencrypt"
      - "coolify.managed=true"
    restart: unless-stopped

  # 데이터베이스 (필요시)
  db:
    image: postgres:15-alpine
    container_name: ${PROJECT_NAME:-app}-db
    environment:
      - POSTGRES_DB=${DB_NAME:-app}
      - POSTGRES_USER=${DB_USER:-app}
      - POSTGRES_PASSWORD=${DB_PASSWORD:-changeme}
    volumes:
      - db_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  db_data:
EOF
    
    log_message "${GREEN}✅ 도메인 설정 템플릿 생성 완료${NC}"
}

# 자동화 스크립트 서버 배포
deploy_scripts_to_server() {
    log_message "${YELLOW}자동화 스크립트를 서버에 배포 중...${NC}"
    
    # 서버에 스크립트 디렉토리 생성
    ssh root@$SERVER_IP "mkdir -p /opt/coolify-automation/{scripts,templates,logs}"
    
    # PowerDNS 관리 스크립트 생성
    cat > /tmp/dns-manager.sh << 'EOF'
#!/bin/bash
# PowerDNS 관리 스크립트

PDNS_API_KEY="20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5"
PDNS_API_URL="http://localhost:8081/api/v1"

case "$1" in
    "list-zones")
        curl -s -H "X-API-Key: $PDNS_API_KEY" "$PDNS_API_URL/servers/localhost/zones" | jq -r '.[].name'
        ;;
    "create-record")
        # Usage: ./dns-manager.sh create-record domain.com subdomain A 1.2.3.4
        ZONE="$2"
        NAME="$3"
        TYPE="$4"
        CONTENT="$5"
        
        curl -s -X PATCH "$PDNS_API_URL/servers/localhost/zones/$ZONE" \
            -H "X-API-Key: $PDNS_API_KEY" \
            -H "Content-Type: application/json" \
            -d "{\"rrsets\":[{\"name\":\"$NAME\",\"type\":\"$TYPE\",\"records\":[{\"content\":\"$CONTENT\",\"disabled\":false}]}]}"
        ;;
    "delete-record")
        # Usage: ./dns-manager.sh delete-record domain.com subdomain A
        ZONE="$2"
        NAME="$3"
        TYPE="$4"
        
        curl -s -X PATCH "$PDNS_API_URL/servers/localhost/zones/$ZONE" \
            -H "X-API-Key: $PDNS_API_KEY" \
            -H "Content-Type: application/json" \
            -d "{\"rrsets\":[{\"name\":\"$NAME\",\"type\":\"$TYPE\",\"changetype\":\"DELETE\"}]}"
        ;;
    "query")
        # Usage: ./dns-manager.sh query subdomain.domain.com
        dig @localhost "$2" +short
        ;;
    *)
        echo "사용법: $0 {list-zones|create-record|delete-record|query}"
        echo "예시:"
        echo "  $0 list-zones"
        echo "  $0 create-record example.com app.example.com A 1.2.3.4"
        echo "  $0 delete-record example.com app.example.com A"
        echo "  $0 query app.example.com"
        ;;
esac
EOF
    
    # 스크립트 서버로 전송
    scp /tmp/dns-manager.sh root@$SERVER_IP:/opt/coolify-automation/scripts/
    ssh root@$SERVER_IP "chmod +x /opt/coolify-automation/scripts/dns-manager.sh"
    
    # Coolify 프로젝트 관리 스크립트 생성 및 전송
    cat > /tmp/project-manager.sh << 'EOF'
#!/bin/bash
# Coolify 프로젝트 관리 스크립트

COOLIFY_URL="http://localhost:8000"

case "$1" in
    "create-simple")
        PROJECT_NAME="$2"
        DOMAIN="$3"
        
        echo "간단한 프로젝트 생성: $PROJECT_NAME ($DOMAIN)"
        
        # Docker Compose 파일 생성
        mkdir -p "/tmp/$PROJECT_NAME"
        cat > "/tmp/$PROJECT_NAME/docker-compose.yml" << COMPOSE_EOF
version: '3.8'
services:
  app:
    image: nginx:alpine
    container_name: $PROJECT_NAME
    ports:
      - "80"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.$PROJECT_NAME.rule=Host(\\\`$DOMAIN\\\`)"
      - "traefik.http.routers.$PROJECT_NAME.tls=true"
      - "traefik.http.routers.$PROJECT_NAME.tls.certresolver=letsencrypt"
    restart: unless-stopped
COMPOSE_EOF
        
        echo "프로젝트 파일 생성됨: /tmp/$PROJECT_NAME/"
        echo "Coolify에서 수동으로 프로젝트를 가져오세요: $COOLIFY_URL"
        ;;
    "list")
        echo "Docker 컨테이너 목록:"
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        ;;
    *)
        echo "사용법: $0 {create-simple|list}"
        echo "예시:"
        echo "  $0 create-simple myapp app.example.com"
        echo "  $0 list"
        ;;
esac
EOF
    
    scp /tmp/project-manager.sh root@$SERVER_IP:/opt/coolify-automation/scripts/
    ssh root@$SERVER_IP "chmod +x /opt/coolify-automation/scripts/project-manager.sh"
    
    log_message "${GREEN}✅ 자동화 스크립트 서버 배포 완료${NC}"
}

# 테스트 실행
run_integration_test() {
    log_message "${YELLOW}통합 테스트 실행 중...${NC}"
    
    ssh root@$SERVER_IP << 'EOF'
echo "=== PowerDNS API 테스트 ==="
curl -s -H "X-API-Key: 20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5" \
    "http://localhost:8081/api/v1/servers" | head -100

echo -e "\n=== Coolify 상태 ==="
curl -s "http://localhost:8000" | head -50 | grep -o '<title>.*</title>' || echo "HTTP 응답 확인됨"

echo -e "\n=== 자동화 스크립트 테스트 ==="
/opt/coolify-automation/scripts/dns-manager.sh list-zones
EOF
    
    log_message "${GREEN}✅ 통합 테스트 완료${NC}"
}

# 사용 가이드 출력
show_usage_guide() {
    cat << EOF

${GREEN}=== 자동화 설정 완료! ===${NC}

${BLUE}=== 다음 단계 ===${NC}

1. ${YELLOW}환경 변수 설정${NC}
   export PDNS_API_KEY="$PDNS_API_KEY"
   export COOLIFY_API_TOKEN="your-coolify-token"

2. ${YELLOW}도메인 설정${NC}
   vim /Users/admin/new_project/codeb-server/config/domain-config.json
   # base_domain을 실제 도메인으로 변경

3. ${YELLOW}첫 번째 프로젝트 배포 테스트${NC}
   ./scripts/automation/coolify-auto-deploy.sh test-app

4. ${YELLOW}서버에서 직접 DNS 관리${NC}
   ssh root@$SERVER_IP
   /opt/coolify-automation/scripts/dns-manager.sh list-zones
   /opt/coolify-automation/scripts/dns-manager.sh create-record your-domain.com app.your-domain.com A $SERVER_IP

${BLUE}=== 자동 배포 예시 ===${NC}

# 간단한 웹앱 배포
./coolify-auto-deploy.sh myapp

# Git 저장소에서 배포
./coolify-auto-deploy.sh -t git -r https://github.com/user/repo -d api.example.com --ssl myapi

# Docker Compose 프로젝트
./coolify-auto-deploy.sh -t docker-compose -p 8080 --ssl webapp

${BLUE}=== 문제 해결 ===${NC}

- PowerDNS 로그: ssh root@$SERVER_IP "journalctl -u pdns -f"
- Coolify 로그: ssh root@$SERVER_IP "docker logs coolify -f"
- DNS 테스트: dig @$SERVER_IP your-domain.com

EOF
}

# 메인 실행
main() {
    log_message "${GREEN}=== Coolify + PowerDNS 자동화 환경 설정 시작 ===${NC}"
    
    # 1. PowerDNS API 접근 설정
    setup_powerdns_access
    echo
    
    # 2. 방화벽 설정
    setup_firewall
    echo
    
    # 3. 도메인 설정 템플릿 생성
    create_domain_template
    echo
    
    # 4. 자동화 스크립트 서버 배포
    deploy_scripts_to_server
    echo
    
    # 5. 통합 테스트 실행
    run_integration_test
    echo
    
    # 6. Coolify 토큰 설정 안내
    setup_coolify_token
    
    # 7. 사용 가이드 출력
    show_usage_guide
    
    log_message "${GREEN}=== 자동화 환경 설정 완료! ===${NC}"
}

# 스크립트 실행
main "$@"