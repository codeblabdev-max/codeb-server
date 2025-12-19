#!/bin/bash

# Caddy 설정 수정 스크립트
SERVER_IP="141.164.60.51"

echo "🔧 Caddy 설정 수정 중..."

# 1. 현재 Caddyfile 백업
ssh root@${SERVER_IP} "cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup.$(date +%Y%m%d_%H%M%S)"

# 2. Caddyfile 정리 및 수정
ssh root@${SERVER_IP} "cat > /etc/caddy/Caddyfile << 'EOF'
# CodeB Server Caddyfile
# Auto-generated proxy configurations

# Global options
{
    auto_https on
    log {
        level INFO
    }
}

# Default redirect for IP access
${SERVER_IP} {
    redir https://codeb.one-q.xyz
}

# Project: test-nextjs
test-nextjs.codeb.one-q.xyz {
    reverse_proxy localhost:4001
    encode gzip
    header {
        X-Real-IP {remote_host}
        X-Forwarded-For {remote_host}
        X-Forwarded-Proto {scheme}
    }
    log {
        output file /var/log/caddy/test-nextjs.log
    }
}

# Project: video-platform
video-platform.codeb.one-q.xyz {
    reverse_proxy localhost:4002
    encode gzip
    header {
        X-Real-IP {remote_host}
        X-Forwarded-For {remote_host}
        X-Forwarded-Proto {scheme}
    }
    log {
        output file /var/log/caddy/video-platform.log
    }
}

# Project: celly-creative
celly-creative.codeb.one-q.xyz {
    reverse_proxy localhost:4000
    encode gzip
    header {
        X-Real-IP {remote_host}
        X-Forwarded-For {remote_host}
        X-Forwarded-Proto {scheme}
    }
    log {
        output file /var/log/caddy/celly-creative.log
    }
}
EOF"

# 3. Caddy 설정 검증
echo "📋 Caddy 설정 검증 중..."
ssh root@${SERVER_IP} "caddy validate --config /etc/caddy/Caddyfile"

if [ $? -eq 0 ]; then
    echo "✅ Caddy 설정이 유효합니다."
    
    # 4. Caddy 재시작
    echo "🔄 Caddy 재시작 중..."
    ssh root@${SERVER_IP} "systemctl reload caddy"
    
    # 5. 상태 확인
    sleep 3
    ssh root@${SERVER_IP} "systemctl is-active caddy"
    
    echo "✅ Caddy 설정 완료!"
else
    echo "❌ Caddy 설정에 오류가 있습니다."
    exit 1
fi

# 6. DNS 레코드 확인 및 추가
echo "📡 DNS 레코드 확인 중..."

# DNS 존 파일 확인
ssh root@${SERVER_IP} "grep -q 'celly-creative.codeb' /etc/bind/db.one-q.xyz || echo 'celly-creative.codeb    IN    A    ${SERVER_IP}' >> /etc/bind/db.one-q.xyz"

# BIND 재시작
ssh root@${SERVER_IP} "systemctl reload bind9"

echo "🌐 도메인 테스트:"
echo "- https://celly-creative.codeb.one-q.xyz"
echo "- http://${SERVER_IP}:4000 (직접 접근)"

# 7. 프로젝트 상태 확인
echo "📊 프로젝트 상태:"
curl -s http://${SERVER_IP}:3008/api/projects | jq '.projects[] | select(.name=="celly-creative") | {name, appPort, status, running}'