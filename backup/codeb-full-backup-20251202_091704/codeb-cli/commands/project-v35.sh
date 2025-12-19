#!/bin/bash

# CodeB CLI v3.5 - 향상된 프로젝트 관리 모듈
# 로컬/서버 환경 분리형 프로젝트 생성

# v3.5 향상된 프로젝트 생성
cmd_project_create_v35() {
    local project_name=$1
    local template=${2:-nextjs}
    local mode=${3:-local}
    local with_db=${4:-postgresql}
    local with_cache=${5:-redis}
    local with_storage=${6:-local}
    
    if [ -z "$project_name" ]; then
        log_error "사용법: codeb create <프로젝트명> [템플릿] [옵션]"
        echo "템플릿: nextjs, remix, react, vue, nodejs, python"
        echo "옵션:"
        echo "  --mode=<local|server>       환경 모드 (기본: local)"
        echo "  --with-db=<postgresql|mysql>      데이터베이스 (기본: postgresql)"
        echo "  --with-cache=<redis|memcached>    캐시 (기본: redis)"
        echo "  --with-storage=<local|s3|gcs>     스토리지 (기본: local)"
        return 1
    fi
    
    if ! validate_project_name "$project_name"; then
        return 1
    fi
    
    # 옵션 파싱
    shift 2
    while [ $# -gt 0 ]; do
        case "$1" in
            --mode=*)
                mode="${1#*=}"
                ;;
            --with-db=*)
                with_db="${1#*=}"
                ;;
            --with-cache=*)
                with_cache="${1#*=}"
                ;;
            --with-storage=*)
                with_storage="${1#*=}"
                ;;
        esac
        shift
    done
    
    log_header "🚀 CodeB v3.5 프로젝트 생성"
    echo "• 프로젝트: $project_name"
    echo "• 템플릿: $template"
    echo "• 환경: $mode"
    echo "• 데이터베이스: $with_db"
    echo "• 캐시: $with_cache"
    echo "• 스토리지: $with_storage"
    echo ""
    
    # 프로젝트 디렉토리 생성
    if [ -d "$project_name" ]; then
        log_error "프로젝트 디렉토리가 이미 존재합니다: $project_name"
        return 1
    fi
    
    mkdir -p "$project_name"
    cd "$project_name"
    
    # 환경 모드 설정
    echo "$mode" > .codeb-mode
    
    # 템플릿별 프로젝트 구조 생성
    case $template in
        "nextjs")
            create_nextjs_project "$project_name" "$mode"
            ;;
        "remix")
            create_remix_project "$project_name" "$mode"
            ;;
        "react")
            create_react_project "$project_name" "$mode"
            ;;
        "vue")
            create_vue_project "$project_name" "$mode"
            ;;
        "nodejs")
            create_nodejs_project "$project_name" "$mode"
            ;;
        "python")
            create_python_project "$project_name" "$mode"
            ;;
        *)
            log_error "지원하지 않는 템플릿: $template"
            cd ..
            rm -rf "$project_name"
            return 1
            ;;
    esac
    
    # 환경별 설정
    if [ "$mode" = "local" ]; then
        # 로컬 환경 설정
        log_info "로컬 개발 환경 설정..."
        
        # 환경 변수 생성
        cmd_env_init local "$project_name"
        
        # Podman 설정 생성
        cmd_podman_init "$project_name" "$with_db" "$with_cache"
        
        echo ""
        log_success "로컬 개발 환경 준비 완료!"
        echo ""
        echo "📋 다음 단계:"
        echo "  1. cd $project_name"
        echo "  2. codeb local start    # Podman 컨테이너 시작"
        echo "  3. npm install          # 종속성 설치"
        echo "  4. npm run dev          # 개발 서버 시작"
        
    else
        # 서버 환경 설정
        log_info "서버 환경 설정..."
        
        # 환경 변수 생성
        cmd_env_init server "$project_name"
        
        # Docker 및 배포 설정 생성
        create_server_deployment_config "$project_name" "$template"
        
        echo ""
        log_success "서버 환경 준비 완료!"
        echo ""
        echo "📋 다음 단계:"
        echo "  1. cd $project_name"
        echo "  2. .env.production.example을 .env.production으로 복사"
        echo "  3. .env.production 수정 (실제 서버 정보 입력)"
        echo "  4. npm install          # 종속성 설치"
        echo "  5. npm run build        # 프로덕션 빌드"
        echo "  6. ./deploy.sh          # 서버 배포"
    fi
    
    cd ..
}

# Next.js 프로젝트 생성
create_nextjs_project() {
    local project_name=$1
    local mode=$2
    
    log_info "Next.js 프로젝트 구조 생성..."
    
    # package.json 생성
    cat > package.json << EOF
{
  "name": "$project_name",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "migrate": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy",
    "db:push": "prisma db push",
    "db:seed": "prisma db seed"
  },
  "dependencies": {
    "next": "14.0.4",
    "react": "^18",
    "react-dom": "^18",
    "@prisma/client": "^5.7.0",
    "redis": "^4.6.11",
    "aws-sdk": "^2.1500.0"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10.0.1",
    "postcss": "^8",
    "tailwindcss": "^3.3.0",
    "eslint": "^8",
    "eslint-config-next": "14.0.4",
    "prisma": "^5.7.0"
  }
}
EOF

    # next.config.js 생성
    cat > next.config.js << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
  },
}

module.exports = nextConfig
EOF

    # tsconfig.json 생성
    cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

    # Prisma 스키마 생성
    mkdir -p prisma
    cat > prisma/schema.prisma << 'EOF'
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
EOF

    # 기본 페이지 생성
    mkdir -p src/app
    cat > src/app/layout.tsx << 'EOF'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CodeB v3.5 Project',
  description: 'Created with CodeB CLI v3.5',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
EOF

    cat > src/app/page.tsx << 'EOF'
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8">CodeB v3.5 Project</h1>
        <p className="text-xl mb-4">Welcome to your new Next.js project!</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 border rounded">
            <h2 className="text-xl font-bold mb-2">🚀 Getting Started</h2>
            <p>Edit src/app/page.tsx to get started</p>
          </div>
          <div className="p-4 border rounded">
            <h2 className="text-xl font-bold mb-2">📚 Documentation</h2>
            <p>Check out the Next.js documentation</p>
          </div>
        </div>
      </div>
    </main>
  )
}
EOF

    cat > src/app/globals.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

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

    # Tailwind 설정
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

    cat > postcss.config.js << 'EOF'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF
}

# Remix 프로젝트 생성
create_remix_project() {
    local project_name=$1
    local mode=$2
    
    log_info "Remix 프로젝트 구조 생성..."
    
    # package.json 생성
    cat > package.json << EOF
{
  "name": "$project_name",
  "private": true,
  "sideEffects": false,
  "type": "module",
  "scripts": {
    "build": "remix build",
    "dev": "remix dev",
    "start": "remix-serve ./build/index.js",
    "typecheck": "tsc"
  },
  "dependencies": {
    "@remix-run/node": "^2.4.0",
    "@remix-run/react": "^2.4.0",
    "@remix-run/serve": "^2.4.0",
    "isbot": "^3.6.8",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@prisma/client": "^5.7.0",
    "redis": "^4.6.11"
  },
  "devDependencies": {
    "@remix-run/dev": "^2.4.0",
    "@types/react": "^18.2.20",
    "@types/react-dom": "^18.2.7",
    "typescript": "^5.1.6",
    "vite": "^5.0.0",
    "prisma": "^5.7.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF

    # vite.config.ts 생성
    cat > vite.config.ts << 'EOF'
import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [remix()],
});
EOF

    # remix.config.js 생성
    cat > remix.config.js << 'EOF'
/** @type {import('@remix-run/dev').AppConfig} */
export default {
  ignoredRouteFiles: ["**/.*"],
};
EOF

    # 기본 라우트 생성
    mkdir -p app/routes
    cat > app/root.tsx << 'EOF'
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
EOF

    cat > app/routes/_index.tsx << 'EOF'
import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "CodeB v3.5 Remix Project" },
    { name: "description", content: "Welcome to Remix with CodeB v3.5!" },
  ];
};

export default function Index() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
      <h1>Welcome to CodeB v3.5 Remix Project</h1>
      <p>Your Remix application is ready!</p>
    </div>
  );
}
EOF
}

# Node.js 프로젝트 생성
create_nodejs_project() {
    local project_name=$1
    local mode=$2
    
    log_info "Node.js 프로젝트 구조 생성..."
    
    # package.json 생성
    cat > package.json << EOF
{
  "name": "$project_name",
  "version": "1.0.0",
  "description": "CodeB v3.5 Node.js Project",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.2",
    "dotenv": "^16.3.1",
    "pg": "^8.11.3",
    "redis": "^4.6.11",
    "aws-sdk": "^2.1500.0",
    "morgan": "^1.10.0",
    "cors": "^2.8.5",
    "helmet": "^7.1.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.2",
    "jest": "^29.7.0",
    "@types/node": "^20.10.5"
  }
}
EOF

    # 기본 서버 파일 생성
    mkdir -p src
    cat > src/index.js << 'EOF'
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to CodeB v3.5 Node.js API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
});
EOF
}

# 서버 배포 설정 생성
create_server_deployment_config() {
    local project_name=$1
    local template=$2
    
    # Dockerfile 생성
    case $template in
        "nextjs"|"remix"|"react"|"vue")
            cat > Dockerfile << 'EOF'
FROM node:18-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT 3000
CMD ["node", "server.js"]
EOF
            ;;
        "nodejs"|"python")
            cat > Dockerfile << 'EOF'
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
USER node
CMD ["npm", "start"]
EOF
            ;;
    esac
    
    # docker-compose.yml 생성
    cat > docker-compose.yml << EOF
version: '3.8'

services:
  app:
    build: .
    container_name: ${project_name}-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env.production
    depends_on:
      - postgres
      - redis
    networks:
      - app-network

  postgres:
    image: postgres:15-alpine
    container_name: ${project_name}-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: \${DB_NAME}
      POSTGRES_USER: \${DB_USER}
      POSTGRES_PASSWORD: \${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    container_name: ${project_name}-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass \${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    networks:
      - app-network

  nginx:
    image: nginx:alpine
    container_name: ${project_name}-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
    networks:
      - app-network

volumes:
  postgres_data:
  redis_data:

networks:
  app-network:
    driver: bridge
EOF

    # nginx.conf 생성
    cat > nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream app {
        server app:3000;
    }

    server {
        listen 80;
        server_name _;

        location / {
            proxy_pass http://app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
}
EOF
}