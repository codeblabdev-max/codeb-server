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
