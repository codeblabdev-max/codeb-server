#!/bin/bash

# Coolify 배포 서버 시작 스크립트

echo "🚀 Starting Coolify Deployment Server..."
echo "=================================="

# 서버에서 실행
if [ "$1" == "server" ]; then
    echo "Starting on server mode..."
    cd /root/server-api || exit 1
    
    # npm 패키지 설치
    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        npm install express axios uuid
    fi
    
    # PM2로 서버 시작
    if command -v pm2 &> /dev/null; then
        pm2 stop coolify-deploy-server 2>/dev/null
        pm2 start coolify-deployment-server.js --name coolify-deploy-server
        pm2 save
        echo "✅ Server started with PM2"
        echo "View logs: pm2 logs coolify-deploy-server"
    else
        # 백그라운드로 실행
        nohup node coolify-deployment-server.js > deploy-server.log 2>&1 &
        echo $! > deploy-server.pid
        echo "✅ Server started in background (PID: $(cat deploy-server.pid))"
        echo "View logs: tail -f deploy-server.log"
    fi
    
    echo ""
    echo "Server API endpoints:"
    echo "  http://141.164.60.51:3005/api/health"
    echo "  http://141.164.60.51:3005/api/deploy/complete"
    echo "  http://141.164.60.51:3005/api/projects"

# 로컬에서 실행
else
    echo "Starting local development server..."
    
    # npm 패키지 확인
    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        npm install
    fi
    
    # 서버 시작
    export DEPLOY_API_URL=http://141.164.60.51:3005/api
    node coolify-deployment-server.js &
    SERVER_PID=$!
    
    sleep 2
    
    echo ""
    echo "✅ Local server started (PID: $SERVER_PID)"
    echo ""
    echo "Quick deployment examples:"
    echo "  ./deploy-cli.js --name myapp --git https://github.com/user/repo"
    echo "  ./deploy-cli.js --name myapp --db postgresql --db redis"
    echo "  ./deploy-cli.js --config deploy-sample.json"
    echo "  ./deploy-cli.js --interactive"
    echo ""
    echo "Stop server: kill $SERVER_PID"
fi

echo "=================================="