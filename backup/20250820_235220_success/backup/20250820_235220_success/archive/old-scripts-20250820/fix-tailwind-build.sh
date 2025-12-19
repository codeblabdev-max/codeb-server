#!/bin/bash

# Tailwind CSS 빌드 오류 수정 스크립트
# Next.js 14.2.31에서 @tailwind 파싱 오류 해결

echo "🔧 Fixing Tailwind CSS build error..."

# 1. package.json 확인 및 업데이트
cat > update-package.json << 'EOF'
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.31",
    "react": "^18",
    "react-dom": "^18"
  },
  "devDependencies": {
    "tailwindcss": "^3.4.1",
    "postcss": "^8.4.33",
    "autoprefixer": "^10.4.17",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "typescript": "^5"
  }
}
EOF

# 2. PostCSS 설정 (중요!)
cat > postcss.config.js << 'EOF'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF

# 3. Tailwind 설정
cat > tailwind.config.ts << 'EOF'
import type { Config } from 'tailwindcss'

const config: Config = {
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

export default config
EOF

# 4. next.config.js 업데이트
cat > next.config.js << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // PostCSS 설정 명시
  webpack: (config) => {
    config.module.rules.push({
      test: /\.css$/,
      use: [
        'style-loader',
        'css-loader',
        {
          loader: 'postcss-loader',
          options: {
            postcssOptions: {
              plugins: [
                ['tailwindcss', {}],
                ['autoprefixer', {}],
              ],
            },
          },
        },
      ],
    })
    return config
  },
}

module.exports = nextConfig
EOF

# 5. globals.css 확인 및 수정
cat > src/app/globals.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom styles */
:root {
  --foreground-rgb: 0, 0, 0;
  --background-start-rgb: 214, 219, 220;
  --background-end-rgb: 255, 255, 255;
}

@media (prefers-color-scheme: dark) {
  :root {
    --foreground-rgb: 255, 255, 255;
    --background-start-rgb: 0, 0, 0;
    --background-end-rgb: 0, 0, 0;
  }
}

body {
  color: rgb(var(--foreground-rgb));
  background: linear-gradient(
      to bottom,
      transparent,
      rgb(var(--background-end-rgb))
    )
    rgb(var(--background-start-rgb));
}
EOF

# 6. 서버 직접 수정 명령어
cat > fix-on-server.sh << 'EOF'
#!/bin/bash

SERVER_IP="141.164.60.51"
PROJECT_NAME="celly-creative"

echo "🔧 Fixing Tailwind CSS on server..."

# PostCSS 설정 파일 생성 및 복사
cat > /tmp/postcss.config.js << 'CONFIG'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
CONFIG

cat > /tmp/fix-tailwind.sh << 'SCRIPT'
#!/bin/sh
cd /app

# PostCSS 설정 적용
cat > postcss.config.js << 'CONFIG'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
CONFIG

# PostCSS 설정 (mjs 버전도 생성)
cat > postcss.config.mjs << 'CONFIG'
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
export default config
CONFIG

# 의존성 재설치
npm install -D tailwindcss@latest postcss@latest autoprefixer@latest
npm install -D postcss-loader css-loader style-loader

# 캐시 삭제
rm -rf .next
rm -rf node_modules/.cache

# 재빌드
npm run build
SCRIPT

# 서버에 적용
scp -o ConnectTimeout=5 /tmp/postcss.config.js root@${SERVER_IP}:/tmp/ 2>/dev/null
scp -o ConnectTimeout=5 /tmp/fix-tailwind.sh root@${SERVER_IP}:/tmp/ 2>/dev/null

if [ $? -eq 0 ]; then
  ssh root@${SERVER_IP} << REMOTE
    podman cp /tmp/postcss.config.js ${PROJECT_NAME}-app:/app/
    podman cp /tmp/fix-tailwind.sh ${PROJECT_NAME}-app:/app/
    podman exec ${PROJECT_NAME}-app sh /app/fix-tailwind.sh
REMOTE
else
  echo "Manual fix required on server:"
  echo "1. podman exec -it ${PROJECT_NAME}-app sh"
  echo "2. Create postcss.config.js with the configuration above"
  echo "3. npm install -D tailwindcss postcss autoprefixer"
  echo "4. npm run build"
fi
EOF

chmod +x fix-on-server.sh

echo "
========================================
✅ Tailwind CSS 빌드 오류 수정 준비 완료
========================================

문제 원인:
- PostCSS 설정 파일 누락
- Tailwind CSS가 CSS 모듈로 처리되지 않음

해결 방법:

1. 로컬에서 수정:
   - PostCSS 설정 파일 생성 (postcss.config.js)
   - 의존성 재설치
   - npm install -D tailwindcss postcss autoprefixer
   - npm run build

2. 서버에서 직접 수정:
   ./fix-on-server.sh

3. 수동으로 서버 접속해서 수정:
   ssh root@141.164.60.51
   podman exec -it celly-creative-app sh
   cd /app
   # PostCSS 설정 파일 생성
   vi postcss.config.js
   # 의존성 설치
   npm install -D tailwindcss postcss autoprefixer
   # 빌드
   npm run build
   # 실행
   npm start

생성된 파일:
- postcss.config.js
- tailwind.config.ts
- next.config.js (PostCSS loader 설정 포함)
"