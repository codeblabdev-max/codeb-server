#!/bin/bash

echo "🚀 CodeB 로컬 개발 환경 시작..."
cd "."

# 컨테이너 시작
podman-compose up -d

# 상태 확인
echo "⏳ 컨테이너 상태 확인 중..."
sleep 5

if podman-compose ps | grep -q "Up\|running"; then
    echo "✅ 컨테이너가 성공적으로 시작되었습니다!"
    echo ""
    echo "📋 연결 정보:"
    podman-compose ps
    echo ""
    if [ -f docker-compose.yml ] && grep -q postgres docker-compose.yml; then
        echo "   PostgreSQL: localhost:5432 (codeb/codeb123)"
    fi
    if [ -f docker-compose.yml ] && grep -q mysql docker-compose.yml; then
        echo "   MySQL: localhost:3306 (codeb/codeb123)"
    fi
    if [ -f docker-compose.yml ] && grep -q redis docker-compose.yml; then
        echo "   Redis: localhost:6379 (비밀번호: codeb123)"
    fi
    if [ -f docker-compose.yml ] && grep -q memcached docker-compose.yml; then
        echo "   Memcached: localhost:11211"
    fi
else
    echo "❌ 컨테이너 시작에 실패했습니다."
    podman-compose logs
fi
