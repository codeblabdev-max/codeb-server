#!/bin/bash

# Celly Creative 배포 스크립트
# Vercel에서 자체 서버로 마이그레이션

PROJECT_NAME="celly-creative"
SERVER_IP="141.164.60.51"
PORT="4001"

echo "🚀 Deploying Celly Creative to self-hosted server..."

# 1. 환경 변수 파일 생성
cat > .env.production << 'EOF'
# Supabase Database
DATABASE_URL="postgres://postgres.hibktfylqdamdzigznkt:68FBtj7P8d3MXS3H@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true"
DIRECT_URL="postgres://postgres.hibktfylqdamdzigznkt:68FBtj7P8d3MXS3H@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require"

# JWT
JWT_SECRET="LinkPickPlatform2024!SuperSecretJWTKey#RevuPlatformProduction$"
JWT_REFRESH_SECRET="LinkPickPlatform2024!RefreshSecretKey#RevuPlatformRefresh$"

# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://hibktfylqdamdzigznkt.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpYmt0ZnlscWRhbWR6aWd6bmt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2NjIzODQsImV4cCI6MjA2ODIzODM4NH0.FzlCpOSA2qV_gjAbUOEnSQ62O8F73InDAJj_oTyJ2VE"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpYmt0ZnlscWRhbWR6aWd6bmt0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjY2MjM4NCwiZXhwIjoyMDY4MjM4Mzg0fQ.LLIFiN0-lLZp9lryWhOnh4rHDbLGKdGeG9lCCIqVv1s"

# Toss Payments
TOSS_SECRET_KEY="test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R"
NEXT_PUBLIC_TOSS_CLIENT_KEY="test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq"

# Redis
REDIS_URL="redis://default:mYOnQFZCyXRh2xYS8Y5JLZN1WcSjIdRy@redis-15395.c340.ap-northeast-2-1.ec2.redns.redis-cloud.com:15395"
KV_URL="redis://default:mYOnQFZCyXRh2xYS8Y5JLZN1WcSjIdRy@redis-15395.c340.ap-northeast-2-1.ec2.redns.redis-cloud.com:15395"

# Application - 자체 서버 URL로 변경
NEXT_PUBLIC_API_URL="https://celly-creative.codeb.one-q.xyz"
NEXT_PUBLIC_APP_URL="https://celly-creative.codeb.one-q.xyz"
NODE_ENV="production"

# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_I3OTDOKFZvApv5dF_EIJqUWcncdb0ADYIyF9GdakWxrKOoz"

# Performance & Logging
LOG_LEVEL="silent"
NEXT_PUBLIC_LOG_LEVEL="silent"
DISABLE_CONSOLE_LOG="true"
ENABLE_CACHE="true"
CACHE_TTL="3600"

# Port for self-hosted server
PORT=3000
EOF

echo "✅ Environment variables created"

# 2. PostCSS 설정 파일 생성 (Tailwind CSS 빌드 오류 수정)
cat > postcss.config.js << 'EOF'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF

cat > postcss.config.mjs << 'EOF'
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

export default config
EOF

echo "✅ PostCSS configuration created"

# 3. Tailwind 설정 확인 및 생성
if [ ! -f "tailwind.config.js" ] && [ ! -f "tailwind.config.ts" ]; then
  cat > tailwind.config.js << 'EOF'
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
EOF
  echo "✅ Tailwind configuration created"
fi

# 4. 필요한 dependencies 설치 스크립트
cat > install-deps.sh << 'EOF'
#!/bin/bash
# Tailwind CSS 및 PostCSS 의존성 설치
npm install -D tailwindcss postcss autoprefixer
npm install -D @types/node

# Next.js 업데이트 (선택사항)
# npm install next@latest react@latest react-dom@latest

echo "✅ Dependencies installed"
EOF

chmod +x install-deps.sh

# 5. 서버 배포 스크립트
cat > deploy-to-server.sh << 'EOF'
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
EOF

chmod +x deploy-to-server.sh

# 6. 로컬 빌드 테스트 스크립트
cat > test-build.sh << 'EOF'
#!/bin/bash

echo "🧪 Testing build locally..."

# 환경 변수 로드
cp .env.production .env.local

# 의존성 설치
npm install
npm install -D tailwindcss postcss autoprefixer

# CSS 파일 확인
if [ -f "src/app/globals.css" ]; then
  echo "✅ globals.css found"
  # Tailwind directives 확인
  if ! grep -q "@tailwind base" src/app/globals.css; then
    echo "Adding Tailwind directives..."
    cat > src/app/globals.css << 'CSS'
@tailwind base;
@tailwind components;
@tailwind utilities;
CSS
  fi
fi

# 빌드 시도
npm run build

if [ $? -eq 0 ]; then
  echo "✅ Build successful!"
  echo "Run 'npm start' to test locally"
else
  echo "❌ Build failed. Check the error messages above."
fi
EOF

chmod +x test-build.sh

echo "
========================================
📋 Celly Creative 배포 준비 완료
========================================

다음 단계:

1. 의존성 설치 (Tailwind CSS 오류 수정):
   ./install-deps.sh

2. 로컬 빌드 테스트:
   ./test-build.sh

3. 서버에 배포:
   ./deploy-to-server.sh

환경 변수:
- .env.production 파일 생성됨
- URL이 https://celly-creative.codeb.one-q.xyz로 설정됨

PostCSS 설정:
- postcss.config.js 생성됨
- Tailwind CSS 빌드 오류 수정됨

접속 URL:
- https://celly-creative.codeb.one-q.xyz
"