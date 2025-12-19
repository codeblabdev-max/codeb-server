#!/bin/bash

# Coolify + PowerDNS 연동 테스트 스크립트

set -euo pipefail

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 설정
SERVER_IP="141.164.60.51"
POWERDNS_API_URL="http://${SERVER_IP}:8081/api/v1"
COOLIFY_URL="http://${SERVER_IP}:8000"
PDNS_API_KEY="20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5"

# 로그 함수
log_message() {
    echo -e "${1}"
}

# PowerDNS API 테스트
test_powerdns_api() {
    log_message "${YELLOW}PowerDNS API 테스트 중...${NC}"
    
    # 서버 상태 확인
    local response=$(curl -s -H "X-API-Key: $PDNS_API_KEY" "$POWERDNS_API_URL/servers")
    
    if echo "$response" | grep -q "localhost"; then
        log_message "${GREEN}✅ PowerDNS API 접근 성공${NC}"
        return 0
    else
        log_message "${RED}❌ PowerDNS API 접근 실패${NC}"
        log_message "응답: $response"
        return 1
    fi
}

# 존재하는 존 목록 확인
list_existing_zones() {
    log_message "${YELLOW}기존 DNS 존 확인 중...${NC}"
    
    local zones=$(curl -s -H "X-API-Key: $PDNS_API_KEY" "$POWERDNS_API_URL/servers/localhost/zones")
    
    if [ -n "$zones" ]; then
        log_message "${BLUE}기존 존 목록:${NC}"
        echo "$zones" | jq -r '.[].name // empty' 2>/dev/null || echo "$zones"
    else
        log_message "${YELLOW}설정된 존이 없습니다${NC}"
    fi
}

# 테스트 DNS 레코드 생성
create_test_record() {
    local test_domain="test.$(date +%s).local"
    
    log_message "${YELLOW}테스트 DNS 레코드 생성: $test_domain${NC}"
    
    # 먼저 .local 존이 있는지 확인하고 없으면 생성
    local zone_response=$(curl -s -H "X-API-Key: $PDNS_API_KEY" "$POWERDNS_API_URL/servers/localhost/zones/local")
    
    if echo "$zone_response" | grep -q "Could not find domain"; then
        log_message "${YELLOW}local 존 생성 중...${NC}"
        
        local zone_data=$(cat <<EOF
{
    "name": "local",
    "kind": "Native",
    "masters": [],
    "nameservers": ["ns1.local", "ns2.local"]
}
EOF
)
        
        curl -s -X POST "$POWERDNS_API_URL/servers/localhost/zones" \
            -H "X-API-Key: $PDNS_API_KEY" \
            -H "Content-Type: application/json" \
            -d "$zone_data"
    fi
    
    # A 레코드 생성
    local record_data=$(cat <<EOF
{
    "rrsets": [
        {
            "name": "$test_domain",
            "type": "A",
            "records": [
                {
                    "content": "$SERVER_IP",
                    "disabled": false
                }
            ]
        }
    ]
}
EOF
)
    
    local record_response=$(curl -s -X PATCH "$POWERDNS_API_URL/servers/localhost/zones/local" \
        -H "X-API-Key: $PDNS_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$record_data")
    
    if [ -z "$record_response" ]; then
        log_message "${GREEN}✅ 테스트 DNS 레코드 생성 성공: $test_domain${NC}"
        
        # DNS 쿼리 테스트
        sleep 2
        local query_result=$(dig @$SERVER_IP $test_domain +short 2>/dev/null || echo "query_failed")
        
        if [ "$query_result" = "$SERVER_IP" ]; then
            log_message "${GREEN}✅ DNS 쿼리 테스트 성공${NC}"
        else
            log_message "${YELLOW}⚠️ DNS 쿼리 테스트 결과: $query_result${NC}"
        fi
        
        return 0
    else
        log_message "${RED}❌ 테스트 DNS 레코드 생성 실패${NC}"
        log_message "응답: $record_response"
        return 1
    fi
}

# Coolify 상태 확인
test_coolify_status() {
    log_message "${YELLOW}Coolify 상태 확인 중...${NC}"
    
    # Coolify 웹 인터페이스 접근 테스트
    local http_code=$(curl -s -o /dev/null -w "%{http_code}" "$COOLIFY_URL")
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "302" ] || [ "$http_code" = "301" ]; then
        log_message "${GREEN}✅ Coolify 웹 인터페이스 접근 가능 (HTTP $http_code)${NC}"
    else
        log_message "${YELLOW}⚠️ Coolify 웹 인터페이스 응답: HTTP $http_code${NC}"
    fi
    
    # Docker 컨테이너 상태 확인
    log_message "${BLUE}Coolify 컨테이너 상태:${NC}"
    ssh root@$SERVER_IP "docker ps --filter 'name=coolify' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
}

# 네트워크 연결성 테스트
test_network_connectivity() {
    log_message "${YELLOW}네트워크 연결성 테스트 중...${NC}"
    
    # SSH 연결 테스트
    if ssh -o ConnectTimeout=5 root@$SERVER_IP "echo 'SSH OK'" > /dev/null 2>&1; then
        log_message "${GREEN}✅ SSH 연결 정상${NC}"
    else
        log_message "${RED}❌ SSH 연결 실패${NC}"
        return 1
    fi
    
    # PowerDNS 포트 테스트
    if nc -z $SERVER_IP 53 2>/dev/null; then
        log_message "${GREEN}✅ PowerDNS 포트 53 접근 가능${NC}"
    else
        log_message "${YELLOW}⚠️ PowerDNS 포트 53 접근 불가${NC}"
    fi
    
    # PowerDNS API 포트 테스트
    if nc -z $SERVER_IP 8081 2>/dev/null; then
        log_message "${GREEN}✅ PowerDNS API 포트 8081 접근 가능${NC}"
    else
        log_message "${RED}❌ PowerDNS API 포트 8081 접근 불가${NC}"
    fi
    
    # Coolify 포트 테스트
    if nc -z $SERVER_IP 8000 2>/dev/null; then
        log_message "${GREEN}✅ Coolify 포트 8000 접근 가능${NC}"
    else
        log_message "${RED}❌ Coolify 포트 8000 접근 불가${NC}"
    fi
}

# 시스템 리소스 확인
check_system_resources() {
    log_message "${YELLOW}시스템 리소스 확인 중...${NC}"
    
    ssh root@$SERVER_IP << 'EOF'
echo "=== 메모리 사용률 ==="
free -h

echo -e "\n=== 디스크 사용률 ==="
df -h /

echo -e "\n=== 시스템 로드 ==="
uptime

echo -e "\n=== Docker 상태 ==="
docker system df
EOF
}

# 통합 테스트 결과 출력
show_test_summary() {
    log_message "${BLUE}=== 테스트 결과 요약 ===${NC}"
    
    local total_tests=5
    local passed_tests=0
    
    # 각 테스트 결과 재확인
    if test_network_connectivity > /dev/null 2>&1; then
        log_message "${GREEN}✅ 네트워크 연결성: 통과${NC}"
        ((passed_tests++))
    else
        log_message "${RED}❌ 네트워크 연결성: 실패${NC}"
    fi
    
    if test_powerdns_api > /dev/null 2>&1; then
        log_message "${GREEN}✅ PowerDNS API: 통과${NC}"
        ((passed_tests++))
    else
        log_message "${RED}❌ PowerDNS API: 실패${NC}"
    fi
    
    if test_coolify_status > /dev/null 2>&1; then
        log_message "${GREEN}✅ Coolify 상태: 통과${NC}"
        ((passed_tests++))
    else
        log_message "${RED}❌ Coolify 상태: 실패${NC}"
    fi
    
    log_message "${BLUE}통과율: $passed_tests/$total_tests${NC}"
    
    if [ $passed_tests -eq $total_tests ]; then
        log_message "${GREEN}🎉 모든 테스트 통과! 자동 배포 준비 완료${NC}"
    else
        log_message "${YELLOW}⚠️ 일부 테스트 실패. 설정을 확인해주세요${NC}"
    fi
}

# 메인 실행
main() {
    log_message "${GREEN}=== Coolify + PowerDNS 통합 테스트 시작 ===${NC}"
    
    # 1. 네트워크 연결성 테스트
    test_network_connectivity
    echo
    
    # 2. PowerDNS API 테스트
    test_powerdns_api
    echo
    
    # 3. 기존 존 목록 확인
    list_existing_zones
    echo
    
    # 4. 테스트 DNS 레코드 생성
    create_test_record
    echo
    
    # 5. Coolify 상태 확인
    test_coolify_status
    echo
    
    # 6. 시스템 리소스 확인
    check_system_resources
    echo
    
    # 7. 테스트 결과 요약
    show_test_summary
    
    log_message "${BLUE}=== 테스트 완료 ===${NC}"
    log_message "${YELLOW}다음 단계: 실제 도메인으로 배포 테스트를 진행하세요${NC}"
    log_message "${BLUE}예시: ./coolify-auto-deploy.sh -d myapp.yourdomain.com myapp${NC}"
}

# 스크립트 실행
main "$@"