#!/bin/bash

# CodeB 빌드 에러 처리 및 복구 시스템
# 빌드 실패시 자동 진단 및 복구 수행

VERSION="1.0.0"
SERVER_IP="141.164.60.51"
API_PORT="3008"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️ $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️ $1${NC}"; }

# 빌드 에러 진단 함수
diagnose_build_error() {
    local project_name=$1
    local container_name="${project_name}-app"
    
    log_info "빌드 에러 진단 시작: $project_name"
    
    # 1. 컨테이너 상태 확인
    if ! podman exec $container_name echo "Container accessible" >/dev/null 2>&1; then
        log_error "컨테이너에 접근할 수 없습니다: $container_name"
        return 1
    fi
    
    # 2. package.json 존재 확인
    if ! podman exec $container_name test -f /app/package.json; then
        log_error "package.json 파일이 없습니다"
        echo "MISSING_PACKAGE_JSON"
        return 1
    fi
    
    # 3. node_modules 확인
    if ! podman exec $container_name test -d /app/node_modules; then
        log_warning "node_modules가 없습니다 - 의존성 미설치"
        echo "MISSING_DEPENDENCIES"
        return 2
    fi
    
    # 4. 최근 빌드 로그 확인
    local build_log=$(podman exec $container_name sh -c 'cd /app && npm run build 2>&1 | tail -20')
    
    # 5. 일반적인 에러 패턴 감지
    if echo "$build_log" | grep -q "Module parse failed.*@tailwind"; then
        echo "TAILWIND_ERROR"
        return 3
    elif echo "$build_log" | grep -q "Cannot find module"; then
        echo "MODULE_NOT_FOUND"
        return 4
    elif echo "$build_log" | grep -q "TypeScript error"; then
        echo "TYPESCRIPT_ERROR" 
        return 5
    elif echo "$build_log" | grep -q "ESLint"; then
        echo "ESLINT_ERROR"
        return 6
    elif echo "$build_log" | grep -q "ENOSPC"; then
        echo "DISK_SPACE_ERROR"
        return 7
    elif echo "$build_log" | grep -q "ENOMEM"; then
        echo "MEMORY_ERROR"
        return 8
    else
        echo "UNKNOWN_ERROR"
        return 9
    fi
}

# 자동 복구 함수들
fix_missing_package_json() {
    local project_name=$1
    local container_name="${project_name}-app"
    
    log_info "package.json 자동 생성 중..."
    
    podman exec $container_name sh -c 'cd /app && cat > package.json << EOF
{
  "name": "'$project_name'",
  "version": "0.1.0",
  "private": true,
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
    "typescript": "^5",
    "eslint": "^8",
    "eslint-config-next": "14.2.31"
  }
}
EOF'
    
    log_success "package.json 생성 완료"
}

fix_missing_dependencies() {
    local project_name=$1
    local container_name="${project_name}-app"
    
    log_info "의존성 설치 중..."
    
    podman exec $container_name sh -c 'cd /app && 
        rm -rf node_modules package-lock.json &&
        npm cache clean --force &&
        npm install --no-optional --legacy-peer-deps'
    
    if [ $? -eq 0 ]; then
        log_success "의존성 설치 완료"
        return 0
    else
        log_error "의존성 설치 실패"
        return 1
    fi
}

fix_tailwind_error() {
    local project_name=$1
    local container_name="${project_name}-app"
    
    log_info "Tailwind CSS 설정 수정 중..."
    
    # PostCSS 설정 생성
    podman exec $container_name sh -c 'cd /app && cat > postcss.config.js << EOF
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF'

    # Tailwind 설정 생성
    podman exec $container_name sh -c 'cd /app && cat > tailwind.config.js << EOF
/** @type {import("tailwindcss").Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
EOF'

    # next.config.js 수정
    podman exec $container_name sh -c 'cd /app && cat > next.config.js << EOF
/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
}

module.exports = nextConfig
EOF'

    # 관련 의존성 재설치
    podman exec $container_name sh -c 'cd /app && 
        npm install -D tailwindcss postcss autoprefixer &&
        rm -rf .next'
    
    log_success "Tailwind CSS 설정 완료"
}

fix_module_not_found() {
    local project_name=$1
    local container_name="${project_name}-app"
    
    log_info "누락된 모듈 수정 중..."
    
    # 캐시 정리 후 재설치
    podman exec $container_name sh -c 'cd /app && 
        npm cache clean --force &&
        rm -rf node_modules package-lock.json .next &&
        npm install --force &&
        npm audit fix --force'
    
    log_success "모듈 재설치 완료"
}

fix_typescript_error() {
    local project_name=$1
    local container_name="${project_name}-app"
    
    log_info "TypeScript 오류 수정 중..."
    
    # tsconfig.json 생성/수정
    podman exec $container_name sh -c 'cd /app && cat > tsconfig.json << EOF
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "es6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": false,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF'
    
    log_success "TypeScript 설정 완료"
}

fix_disk_space_error() {
    local project_name=$1
    local container_name="${project_name}-app"
    
    log_warning "디스크 공간 부족 - 정리 중..."
    
    # 캐시 및 임시 파일 정리
    podman exec $container_name sh -c 'cd /app && 
        rm -rf .next/cache node_modules/.cache &&
        npm cache clean --force'
    
    # 시스템 레벨 정리
    podman system prune -f
    
    log_success "디스크 정리 완료"
}

# 메인 복구 함수
auto_fix_build() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: auto_fix_build <project-name>"
        return 1
    fi
    
    log_info "🔧 빌드 자동 복구 시작: $project_name"
    
    # 진단 수행
    local error_type=$(diagnose_build_error "$project_name")
    local diagnosis_result=$?
    
    echo "진단 결과: $error_type (코드: $diagnosis_result)"
    
    # 에러 타입별 수정
    case $error_type in
        "MISSING_PACKAGE_JSON")
            fix_missing_package_json "$project_name"
            ;;
        "MISSING_DEPENDENCIES")
            fix_missing_dependencies "$project_name"
            ;;
        "TAILWIND_ERROR")
            fix_tailwind_error "$project_name"
            ;;
        "MODULE_NOT_FOUND")
            fix_module_not_found "$project_name"
            ;;
        "TYPESCRIPT_ERROR")
            fix_typescript_error "$project_name"
            ;;
        "DISK_SPACE_ERROR")
            fix_disk_space_error "$project_name"
            ;;
        "MEMORY_ERROR")
            log_warning "메모리 부족 - 시스템 관리자에게 문의하세요"
            return 1
            ;;
        *)
            log_warning "알 수 없는 오류 타입: $error_type"
            log_info "일반적인 수정 시도..."
            fix_missing_dependencies "$project_name"
            fix_tailwind_error "$project_name"
            ;;
    esac
    
    # 수정 후 빌드 재시도
    log_info "🔄 빌드 재시도 중..."
    
    local container_name="${project_name}-app"
    local build_result=$(podman exec $container_name sh -c 'cd /app && npm run build 2>&1')
    local build_exit_code=$?
    
    if [ $build_exit_code -eq 0 ]; then
        log_success "🎉 빌드 복구 성공!"
        
        # 애플리케이션 시작
        log_info "애플리케이션 시작 중..."
        podman exec $container_name sh -c 'cd /app && 
            npm install -g pm2 2>/dev/null || true &&
            pm2 delete '$project_name' 2>/dev/null || true &&
            pm2 start "npm start" --name '$project_name' &&
            pm2 save'
        
        return 0
    else
        log_error "빌드 복구 실패"
        echo "빌드 로그:"
        echo "$build_result" | tail -10
        return 1
    fi
}

# 스크립트가 직접 실행될 때
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [ "$1" = "diagnose" ]; then
        diagnose_build_error "$2"
    elif [ "$1" = "fix" ]; then
        auto_fix_build "$2"
    else
        echo "사용법: $0 [diagnose|fix] <project-name>"
        echo ""
        echo "예제:"
        echo "  $0 diagnose test-nextjs"
        echo "  $0 fix test-nextjs"
    fi
fi