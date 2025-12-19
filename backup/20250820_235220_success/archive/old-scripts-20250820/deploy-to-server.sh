#!/bin/bash

SERVER_IP="141.164.60.51"
PROJECT_NAME="celly-creative"

echo "📦 Preparing deployment package..."

# 배포 패키지 준비
tar -czf celly-creative-deploy.tar.gz \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=.git \
  .

echo "📤 Uploading to server..."

# SSH 접속 시도
scp -o ConnectTimeout=5 celly-creative-deploy.tar.gz root@${SERVER_IP}:/tmp/ 2>/dev/null

if [ $? -eq 0 ]; then
  echo "✅ Files uploaded successfully!"
  
  ssh root@${SERVER_IP} << 'REMOTE_SCRIPT'
    # 컨테이너에 파일 복사
    podman cp /tmp/celly-creative-deploy.tar.gz celly-creative-app:/app/
    
    # 컨테이너 내에서 압축 해제 및 설치
    podman exec celly-creative-app sh -c "
      cd /app
      tar -xzf celly-creative-deploy.tar.gz
      rm celly-creative-deploy.tar.gz
      
      # 환경 변수 설정
      cp .env.production .env.local
      
      # 의존성 설치
      npm install
      npm install -D tailwindcss postcss autoprefixer
      
      # 빌드
      npm run build
      
      # PM2로 실행 (또는 직접 실행)
      npm install -g pm2
      pm2 delete celly-creative 2>/dev/null || true
      pm2 start npm --name celly-creative -- start
      pm2 save
    "
REMOTE_SCRIPT
else
  echo "⚠️ SSH not available. Manual deployment required."
  echo "Upload celly-creative-deploy.tar.gz to server and run:"
  echo "podman exec celly-creative-app sh -c 'cd /app && tar -xzf celly-creative-deploy.tar.gz && npm install && npm run build && npm start'"
fi
