#!/bin/bash

# 🚀 CodeB Server Deployment Script
# Server: 141.164.60.51

SERVER_IP="141.164.60.51"
SERVER_USER="root"
PROJECT_NAME="codeb-server"
REMOTE_PATH="/opt/codeb-server"

echo "🚀 Starting deployment to $SERVER_IP..."

# 1. 필요한 파일들 압축
echo "📦 Preparing deployment package..."
tar -czf deployment.tar.gz \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='*.log' \
    archive/2025-08-19-cleanup/folders/server-api/* \
    codeb-cli/ \
    codeb-remix/ \
    docker-compose.yml \
    Caddyfile

# 2. 서버로 파일 전송
echo "📤 Uploading to server..."
scp deployment.tar.gz $SERVER_USER@$SERVER_IP:/tmp/

# 3. 서버에서 설치 스크립트 실행
echo "🔧 Installing on server..."
ssh $SERVER_USER@$SERVER_IP << 'ENDSSH'
    # 디렉토리 생성
    mkdir -p /opt/codeb-server
    cd /opt/codeb-server
    
    # 압축 해제
    tar -xzf /tmp/deployment.tar.gz
    
    # Podman 설치 확인
    if ! command -v podman &> /dev/null; then
        echo "Installing Podman..."
        apt-get update
        apt-get install -y podman podman-compose
    fi
    
    # Node.js 설치 확인
    if ! command -v node &> /dev/null; then
        echo "Installing Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    fi
    
    # Server API 설정
    cd /opt/codeb-server/archive/2025-08-19-cleanup/folders/server-api
    npm install
    
    # Systemd 서비스 생성
    cat > /etc/systemd/system/codeb-api.service << EOF
[Unit]
Description=CodeB API Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/codeb-server/archive/2025-08-19-cleanup/folders/server-api
ExecStart=/usr/bin/node coolify-final-server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
    
    # 서비스 시작
    systemctl daemon-reload
    systemctl enable codeb-api
    systemctl restart codeb-api
    
    # Podman 컨테이너 시작 (PostgreSQL + Redis)
    cd /opt/codeb-server
    
    # PostgreSQL 컨테이너
    podman run -d \
        --name codeb-postgres \
        -e POSTGRES_USER=codeb \
        -e POSTGRES_PASSWORD=codeb123 \
        -e POSTGRES_DB=codeb \
        -p 5432:5432 \
        -v postgres-data:/var/lib/postgresql/data \
        postgres:15-alpine
    
    # Redis 컨테이너
    podman run -d \
        --name codeb-redis \
        -p 6379:6379 \
        -v redis-data:/data \
        redis:7-alpine \
        redis-server --appendonly yes
    
    # Caddy 설정 (도메인 자동 SSL)
    cat > /opt/codeb-server/Caddyfile << CADDY
codeb.one-q.xyz {
    reverse_proxy localhost:3007
    encode gzip
    
    header {
        X-Real-IP {remote_host}
        X-Forwarded-For {remote_host}
        X-Forwarded-Proto {scheme}
    }
}

api.codeb.one-q.xyz {
    reverse_proxy localhost:3007
    
    header {
        Access-Control-Allow-Origin *
        Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
        Access-Control-Allow-Headers "Content-Type, Authorization"
    }
}
CADDY
    
    # Caddy 시작
    podman run -d \
        --name codeb-caddy \
        -p 80:80 \
        -p 443:443 \
        -v /opt/codeb-server/Caddyfile:/etc/caddy/Caddyfile:ro \
        -v caddy-data:/data \
        -v caddy-config:/config \
        caddy:2-alpine
    
    echo "✅ Deployment complete!"
    echo "📌 Services:"
    echo "  - API Server: http://$SERVER_IP:3007"
    echo "  - PostgreSQL: $SERVER_IP:5432"
    echo "  - Redis: $SERVER_IP:6379"
    echo "  - Domain: https://codeb.one-q.xyz"
    
    # 서비스 상태 확인
    systemctl status codeb-api --no-pager
    podman ps
ENDSSH

# 4. 정리
rm deployment.tar.gz

echo "✅ Deployment completed successfully!"
echo "🌐 Access your server at:"
echo "   - API: http://$SERVER_IP:3007"
echo "   - Domain: https://codeb.one-q.xyz"