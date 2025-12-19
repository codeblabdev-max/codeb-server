#!/bin/bash

###############################################################################
# box.one-q.xyz 서브도메인 설정 스크립트
#
# 이 스크립트는 box.one-q.xyz 서브도메인 설정을 자동화합니다.
#
# 사용법:
#   ./setup-box-subdomain.sh [dns|caddy|test|all]
#
# 옵션:
#   dns   - DNS 레코드만 설정
#   caddy - Caddy 설정만 적용
#   test  - 설정 테스트만 실행
#   all   - 전체 설정 (기본값)
###############################################################################

set -e

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 설정 변수
DOMAIN="one-q.xyz"
SUBDOMAIN="box"
FULL_DOMAIN="${SUBDOMAIN}.${DOMAIN}"
SERVER_IP="141.164.60.51"
SERVICE_PORT="3010"
CADDY_CONFIG="/etc/caddy/Caddyfile"
CADDY_LOCAL_CONFIG="../docs/configs/Caddyfile"

###############################################################################
# 유틸리티 함수
###############################################################################

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

###############################################################################
# DNS 설정 함수
###############################################################################

setup_dns() {
    print_header "DNS 레코드 설정"

    # PowerDNS가 설치되어 있는지 확인
    if ! command -v pdnsutil &> /dev/null; then
        print_error "PowerDNS가 설치되어 있지 않습니다."
        print_info "DNS 레코드를 수동으로 추가해주세요:"
        echo ""
        echo "  레코드 타입: A"
        echo "  호스트: ${SUBDOMAIN}"
        echo "  값: ${SERVER_IP}"
        echo "  TTL: 3600"
        echo ""
        return 1
    fi

    # DNS 레코드 추가
    print_info "DNS A 레코드 추가 중..."

    # 기존 레코드 확인
    if sudo pdnsutil list-zone ${DOMAIN} | grep -q "${SUBDOMAIN}"; then
        print_warning "DNS 레코드가 이미 존재합니다."
        read -p "기존 레코드를 삭제하고 새로 추가하시겠습니까? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo pdnsutil delete-rrset ${DOMAIN} ${SUBDOMAIN} A
            print_success "기존 레코드 삭제 완료"
        else
            print_info "DNS 설정을 건너뜁니다."
            return 0
        fi
    fi

    # 새 레코드 추가
    sudo pdnsutil add-record ${DOMAIN} ${SUBDOMAIN} A ${SERVER_IP}
    print_success "DNS A 레코드 추가 완료"

    # PowerDNS 재시작
    print_info "PowerDNS 재시작 중..."
    sudo systemctl restart pdns
    print_success "PowerDNS 재시작 완료"

    # 레코드 확인
    print_info "추가된 레코드 확인:"
    sudo pdnsutil list-zone ${DOMAIN} | grep ${SUBDOMAIN} || print_warning "레코드를 찾을 수 없습니다."
}

###############################################################################
# Caddy 설정 함수
###############################################################################

setup_caddy() {
    print_header "Caddy 설정"

    # Caddy가 설치되어 있는지 확인
    if ! command -v caddy &> /dev/null; then
        print_error "Caddy가 설치되어 있지 않습니다."
        return 1
    fi

    # 로컬 Caddyfile이 존재하는지 확인
    if [ ! -f "${CADDY_LOCAL_CONFIG}" ]; then
        print_error "로컬 Caddyfile을 찾을 수 없습니다: ${CADDY_LOCAL_CONFIG}"
        return 1
    fi

    # Caddyfile 백업
    if [ -f "${CADDY_CONFIG}" ]; then
        print_info "기존 Caddyfile 백업 중..."
        sudo cp ${CADDY_CONFIG} ${CADDY_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)
        print_success "백업 완료"
    fi

    # 새 Caddyfile 복사
    print_info "새 Caddyfile 적용 중..."
    sudo cp ${CADDY_LOCAL_CONFIG} ${CADDY_CONFIG}
    print_success "Caddyfile 복사 완료"

    # Caddy 설정 검증
    print_info "Caddy 설정 검증 중..."
    if sudo caddy validate --config ${CADDY_CONFIG}; then
        print_success "Caddy 설정 유효성 검증 통과"
    else
        print_error "Caddy 설정 검증 실패"
        print_info "백업 파일로 복원하시겠습니까?"
        return 1
    fi

    # Caddy 재시작
    print_info "Caddy 재시작 중..."
    sudo systemctl reload caddy
    sleep 2

    # Caddy 상태 확인
    if sudo systemctl is-active --quiet caddy; then
        print_success "Caddy 재시작 완료"
    else
        print_error "Caddy 재시작 실패"
        sudo journalctl -u caddy -n 20 --no-pager
        return 1
    fi
}

###############################################################################
# 테스트 함수
###############################################################################

test_setup() {
    print_header "설정 테스트"

    # 1. DNS 테스트
    print_info "DNS 조회 테스트..."
    if nslookup ${FULL_DOMAIN} ${SERVER_IP} > /dev/null 2>&1; then
        print_success "DNS 조회 성공: ${FULL_DOMAIN} → ${SERVER_IP}"
    else
        print_warning "DNS 조회 실패 (전파 중일 수 있습니다)"
    fi

    # 2. 포트 3010 서비스 확인
    print_info "포트 ${SERVICE_PORT} 서비스 확인..."
    if nc -z localhost ${SERVICE_PORT} 2>/dev/null; then
        print_success "포트 ${SERVICE_PORT} 서비스 실행 중"
    else
        print_error "포트 ${SERVICE_PORT} 서비스가 실행되지 않고 있습니다."
    fi

    # 3. Caddy 상태 확인
    print_info "Caddy 서비스 상태 확인..."
    if sudo systemctl is-active --quiet caddy; then
        print_success "Caddy 서비스 실행 중"
    else
        print_error "Caddy 서비스가 실행되지 않고 있습니다."
    fi

    # 4. HTTP 접속 테스트
    print_info "HTTP 접속 테스트..."
    if curl -s -o /dev/null -w "%{http_code}" http://${FULL_DOMAIN} | grep -q "200\|301\|302"; then
        print_success "HTTP 접속 성공"
    else
        print_warning "HTTP 접속 실패 (DNS 전파 대기 중일 수 있습니다)"
    fi

    # 5. HTTPS 접속 테스트
    print_info "HTTPS 접속 테스트..."
    if curl -s -k -o /dev/null -w "%{http_code}" https://${FULL_DOMAIN} | grep -q "200\|301\|302"; then
        print_success "HTTPS 접속 성공"
    else
        print_warning "HTTPS 접속 실패 (SSL 인증서 발급 대기 중일 수 있습니다)"
    fi

    echo ""
    print_info "테스트 완료!"
    print_info "브라우저에서 https://${FULL_DOMAIN} 접속을 확인해주세요."
}

###############################################################################
# 메인 실행 함수
###############################################################################

main() {
    local mode="${1:-all}"

    print_header "box.one-q.xyz 서브도메인 설정"

    case $mode in
        dns)
            setup_dns
            ;;
        caddy)
            setup_caddy
            ;;
        test)
            test_setup
            ;;
        all)
            setup_dns
            echo ""
            setup_caddy
            echo ""
            print_info "DNS 전파를 위해 60초 대기 중..."
            sleep 60
            test_setup
            ;;
        *)
            print_error "잘못된 옵션: $mode"
            echo ""
            echo "사용법: $0 [dns|caddy|test|all]"
            echo ""
            echo "옵션:"
            echo "  dns   - DNS 레코드만 설정"
            echo "  caddy - Caddy 설정만 적용"
            echo "  test  - 설정 테스트만 실행"
            echo "  all   - 전체 설정 (기본값)"
            exit 1
            ;;
    esac

    echo ""
    print_header "작업 완료"
    print_success "box.one-q.xyz 서브도메인 설정이 완료되었습니다!"
    echo ""
    print_info "다음 URL로 접속하세요: https://${FULL_DOMAIN}"
    echo ""
}

# 스크립트 실행
main "$@"
