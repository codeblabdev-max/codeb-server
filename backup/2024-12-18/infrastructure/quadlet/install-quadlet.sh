#!/bin/bash
#
# CodeB Quadlet 설치 스크립트
# 실행: bash install-quadlet.sh
#
# Quadlet은 Podman 4.4+ 에서 기본 포함됨
# Ubuntu 22.04의 Podman 3.4.4는 Quadlet 미지원
# → Podman 업그레이드 또는 수동 systemd 서비스 사용

set -e

echo "🚀 CodeB Quadlet 설치 시작..."

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Podman 버전 확인
PODMAN_VERSION=$(podman --version | awk '{print $3}' | cut -d. -f1,2)
REQUIRED_VERSION="4.4"

echo "📦 현재 Podman 버전: $PODMAN_VERSION"

version_ge() {
    [ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" = "$2" ]
}

# 디렉토리 생성
echo "📁 디렉토리 구조 생성..."
sudo mkdir -p /opt/codeb/{config,data,logs,backup}
sudo mkdir -p /opt/codeb/data/{app,postgres,redis}
sudo mkdir -p /opt/codeb/logs/{app,postgres,redis}

if version_ge "$PODMAN_VERSION" "$REQUIRED_VERSION"; then
    echo -e "${GREEN}✅ Podman $PODMAN_VERSION - Quadlet 지원됨${NC}"

    # Quadlet 디렉토리 생성
    QUADLET_DIR="/etc/containers/systemd"
    sudo mkdir -p "$QUADLET_DIR"

    # Quadlet 파일 복사
    echo "📋 Quadlet 파일 복사 중..."
    sudo cp *.container "$QUADLET_DIR/"
    sudo cp *.network "$QUADLET_DIR/" 2>/dev/null || true

    # 환경변수 파일 복사 (템플릿)
    echo "⚙️ 환경변수 템플릿 복사 중..."
    if [ ! -f /opt/codeb/config/app.env ]; then
        sudo cp config/app.env.example /opt/codeb/config/app.env
        echo -e "${YELLOW}⚠️ /opt/codeb/config/app.env 파일을 수정하세요${NC}"
    fi

    if [ ! -f /opt/codeb/config/postgres.env ]; then
        sudo cp config/postgres.env.example /opt/codeb/config/postgres.env
        echo -e "${YELLOW}⚠️ /opt/codeb/config/postgres.env 파일을 수정하세요${NC}"
    fi

    # systemd 리로드
    echo "🔄 systemd 리로드 중..."
    sudo systemctl daemon-reload

    echo ""
    echo -e "${GREEN}✅ Quadlet 설치 완료!${NC}"
    echo ""
    echo "📌 다음 단계:"
    echo "   1. 환경변수 수정:"
    echo "      sudo nano /opt/codeb/config/app.env"
    echo "      sudo nano /opt/codeb/config/postgres.env"
    echo ""
    echo "   2. 서비스 시작:"
    echo "      sudo systemctl start codeb-postgres"
    echo "      sudo systemctl start codeb-redis"
    echo "      sudo systemctl start codeb-app"
    echo ""
    echo "   3. 부팅 시 자동 시작:"
    echo "      sudo systemctl enable codeb-postgres codeb-redis codeb-app"
    echo ""
    echo "   4. 상태 확인:"
    echo "      sudo systemctl status codeb-app"
    echo "      journalctl -u codeb-app -f"

else
    echo -e "${YELLOW}⚠️ Podman $PODMAN_VERSION - Quadlet 미지원 (4.4+ 필요)${NC}"
    echo ""
    echo "📌 두 가지 옵션이 있습니다:"
    echo ""
    echo "   옵션 1: Podman 업그레이드 (권장)"
    echo "   --------------------------------"
    echo "   # Podman 4.x PPA 추가"
    echo "   sudo apt-get update"
    echo "   sudo apt-get install -y podman"
    echo ""
    echo "   옵션 2: 기존 방식 유지 (수동 systemd)"
    echo "   ------------------------------------"
    echo "   # 수동 systemd 서비스 파일 사용"
    echo "   # infrastructure/systemd/ 디렉토리의 파일 참조"
    echo ""

    # 기존 방식 systemd 파일 생성
    echo "📋 수동 systemd 서비스 파일 생성 중..."

    SYSTEMD_DIR="$(dirname "$0")/systemd"
    mkdir -p "$SYSTEMD_DIR"

    # App 서비스
    cat > "$SYSTEMD_DIR/codeb-app.service" << 'APPEOF'
[Unit]
Description=CodeB Application Container
After=network-online.target codeb-postgres.service codeb-redis.service
Wants=network-online.target
Requires=codeb-postgres.service codeb-redis.service

[Service]
Type=simple
Restart=always
RestartSec=10s
ExecStartPre=-/usr/bin/podman stop -t 10 codeb-app
ExecStartPre=-/usr/bin/podman rm codeb-app
ExecStart=/usr/bin/podman run --rm --name codeb-app \
    --env-file /opt/codeb/config/app.env \
    --network codeb-network \
    -p 3000:3000 \
    -v /opt/codeb/data/app:/app/data:Z \
    -v /opt/codeb/logs/app:/app/logs:Z \
    ghcr.io/your-org/codeb-app:latest
ExecStop=/usr/bin/podman stop -t 10 codeb-app

[Install]
WantedBy=multi-user.target
APPEOF

    # PostgreSQL 서비스
    cat > "$SYSTEMD_DIR/codeb-postgres.service" << 'PGEOF'
[Unit]
Description=CodeB PostgreSQL Container
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Restart=always
RestartSec=10s
ExecStartPre=-/usr/bin/podman stop -t 30 codeb-postgres
ExecStartPre=-/usr/bin/podman rm codeb-postgres
ExecStart=/usr/bin/podman run --rm --name codeb-postgres \
    --env-file /opt/codeb/config/postgres.env \
    --network codeb-network \
    -p 5432:5432 \
    -v /opt/codeb/data/postgres:/var/lib/postgresql/data:Z \
    docker.io/library/postgres:15-alpine
ExecStop=/usr/bin/podman stop -t 30 codeb-postgres

[Install]
WantedBy=multi-user.target
PGEOF

    # Redis 서비스
    cat > "$SYSTEMD_DIR/codeb-redis.service" << 'REDISEOF'
[Unit]
Description=CodeB Redis Container
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Restart=always
RestartSec=5s
ExecStartPre=-/usr/bin/podman stop -t 10 codeb-redis
ExecStartPre=-/usr/bin/podman rm codeb-redis
ExecStart=/usr/bin/podman run --rm --name codeb-redis \
    --network codeb-network \
    -p 6379:6379 \
    -v /opt/codeb/data/redis:/data:Z \
    docker.io/library/redis:7-alpine \
    redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
ExecStop=/usr/bin/podman stop -t 10 codeb-redis

[Install]
WantedBy=multi-user.target
REDISEOF

    echo -e "${GREEN}✅ 수동 systemd 파일 생성 완료: $SYSTEMD_DIR/${NC}"
    echo ""
    echo "📌 수동 설치 방법:"
    echo "   sudo cp $SYSTEMD_DIR/*.service /etc/systemd/system/"
    echo "   sudo systemctl daemon-reload"
    echo "   podman network create codeb-network 2>/dev/null || true"
    echo "   sudo systemctl enable --now codeb-postgres codeb-redis codeb-app"
fi

echo ""
echo "🎉 설치 스크립트 완료!"
