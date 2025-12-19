#!/bin/bash

# CodeB CLI v3.5 - 환경 관리 모듈
# 로컬/서버 환경 전환 및 설정 관리

# 현재 환경 모드 확인
get_current_mode() {
    if [ -f ".codeb-mode" ]; then
        cat .codeb-mode
    else
        echo "local"  # 기본값
    fi
}

# 환경 초기화
cmd_env_init() {
    local mode=$1
    local project_name=${2:-$(basename "$PWD")}
    
    if [ -z "$mode" ]; then
        log_error "환경 모드를 지정하세요: local 또는 server"
        echo "사용법: codeb env init <local|server> [프로젝트명]"
        return 1
    fi
    
    if [ "$mode" != "local" ] && [ "$mode" != "server" ]; then
        log_error "올바른 환경 모드가 아닙니다: $mode"
        echo "사용 가능한 모드: local, server"
        return 1
    fi
    
    log_info "환경 초기화: $mode 모드 (프로젝트: $project_name)"
    
    # 모드 파일 생성
    echo "$mode" > .codeb-mode
    
    # 환경별 설정 생성
    if [ "$mode" = "local" ]; then
        init_local_env "$project_name"
    else
        init_server_env "$project_name"
    fi
    
    log_success "환경 초기화 완료!"
}

# 로컬 환경 초기화
init_local_env() {
    local project_name=$1
    
    log_info "로컬 개발 환경 설정 생성..."
    
    # .env.local 생성
    cat > .env.local << EOF
# CodeB v3.5 - 로컬 개발 환경
# 프로젝트: $project_name
# 생성일: $(date +%Y-%m-%d)

# 기본 설정
NODE_ENV=development
PORT=3000
APP_NAME=$project_name

# 로컬 Podman PostgreSQL
DATABASE_URL=postgresql://codeb:codeb123@localhost:5432/codeb_dev
DB_HOST=localhost
DB_PORT=5432
DB_USER=codeb
DB_PASSWORD=codeb123
DB_NAME=codeb_dev

# 로컬 Podman Redis
REDIS_URL=redis://:codeb123@localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=codeb123

# 로컬 스토리지
STORAGE_TYPE=local
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760  # 10MB

# 세션 및 보안 (개발용)
SESSION_SECRET=dev-session-secret-$(openssl rand -hex 16)
JWT_SECRET=dev-jwt-secret-$(openssl rand -hex 16)
CORS_ORIGIN=http://localhost:3000

# 로깅
LOG_LEVEL=debug
LOG_FILE=./logs/app.log

# 개발 도구
HOT_RELOAD=true
SOURCE_MAPS=true
DEBUG=true
EOF
    
    # .env.local.example 생성 (버전 관리용)
    cat > .env.local.example << EOF
# CodeB v3.5 - 로컬 개발 환경 설정 예시
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://codeb:codeb123@localhost:5432/codeb_dev
REDIS_URL=redis://:codeb123@localhost:6379
STORAGE_TYPE=local
UPLOAD_DIR=./uploads
SESSION_SECRET=your-session-secret
JWT_SECRET=your-jwt-secret
EOF
    
    # .gitignore에 환경 파일 추가
    if [ -f ".gitignore" ]; then
        if ! grep -q "^.env.local$" .gitignore; then
            echo ".env.local" >> .gitignore
        fi
    else
        cat > .gitignore << EOF
# 환경 변수
.env.local
.env.production

# Podman 데이터
podman/data/

# 로그
logs/
*.log

# 업로드
uploads/

# Node
node_modules/
.next/
dist/
build/
EOF
    fi
    
    log_success "로컬 환경 설정 파일 생성 완료!"
    echo "다음 단계:"
    echo "  1. codeb local init        # Podman 환경 초기화"
    echo "  2. codeb local start       # 컨테이너 시작"
    echo "  3. npm run dev             # 개발 서버 시작"
}

# 서버 환경 초기화
init_server_env() {
    local project_name=$1
    
    log_info "서버 환경 설정 생성..."
    
    # .env.production.example 생성
    cat > .env.production.example << EOF
# CodeB v3.5 - 프로덕션 환경 설정
# 프로젝트: $project_name
# 생성일: $(date +%Y-%m-%d)
# 주의: 실제 값으로 변경 후 .env.production으로 복사하세요

# 기본 설정
NODE_ENV=production
PORT=3000
APP_NAME=$project_name
DOMAIN=example.com

# 프로덕션 데이터베이스 (원격)
DATABASE_URL=postgresql://username:password@db-server.com:5432/production_db
DB_HOST=db-server.com
DB_PORT=5432
DB_USER=username
DB_PASSWORD=password
DB_NAME=production_db
DB_SSL=true

# 프로덕션 Redis (원격)
REDIS_URL=redis://:password@redis-server.com:6379
REDIS_HOST=redis-server.com
REDIS_PORT=6379
REDIS_PASSWORD=production-redis-password
REDIS_SSL=true

# 클라우드 스토리지 (S3)
STORAGE_TYPE=s3
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_BUCKET=your-bucket-name

# 또는 Google Cloud Storage
# STORAGE_TYPE=gcs
# GCS_PROJECT_ID=your-project-id
# GCS_BUCKET=your-bucket-name
# GCS_KEY_FILE=./credentials/gcs-key.json

# 세션 및 보안 (프로덕션)
SESSION_SECRET=production-session-secret-change-this
JWT_SECRET=production-jwt-secret-change-this
CORS_ORIGIN=https://example.com

# SSL/TLS
SSL_CERT_PATH=/etc/letsencrypt/live/example.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/example.com/privkey.pem

# 로깅
LOG_LEVEL=info
LOG_FILE=/var/log/app/production.log

# 모니터링
SENTRY_DSN=https://your-sentry-dsn
NEW_RELIC_LICENSE_KEY=your-new-relic-key

# 이메일 (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@example.com

# 프로덕션 설정
HOT_RELOAD=false
SOURCE_MAPS=false
DEBUG=false
RATE_LIMIT=100  # requests per minute
EOF
    
    # 배포 스크립트 생성
    cat > deploy.sh << 'EOF'
#!/bin/bash

# CodeB v3.5 - 서버 배포 스크립트

set -e

echo "🚀 프로덕션 배포 시작..."

# 환경 변수 확인
if [ ! -f ".env.production" ]; then
    echo "❌ .env.production 파일이 없습니다."
    echo ".env.production.example을 참고하여 생성하세요."
    exit 1
fi

# 종속성 설치
echo "📦 종속성 설치..."
npm ci --only=production

# 빌드
echo "🔨 프로덕션 빌드..."
npm run build

# 마이그레이션 (있는 경우)
if [ -f "package.json" ] && grep -q '"migrate"' package.json; then
    echo "📊 데이터베이스 마이그레이션..."
    npm run migrate
fi

# PM2로 실행 (있는 경우)
if command -v pm2 &> /dev/null; then
    echo "🔄 PM2로 애플리케이션 재시작..."
    pm2 restart ecosystem.config.js --update-env
else
    echo "▶️ 애플리케이션 시작..."
    npm start
fi

echo "✅ 배포 완료!"
EOF
    chmod +x deploy.sh
    
    # ecosystem.config.js (PM2 설정) 생성
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: '$project_name',
    script: './dist/index.js',  // 또는 './server.js'
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true
  }]
};
EOF
    
    log_success "서버 환경 설정 파일 생성 완료!"
    echo "다음 단계:"
    echo "  1. .env.production.example을 .env.production으로 복사"
    echo "  2. .env.production의 값을 실제 값으로 수정"
    echo "  3. ./deploy.sh 실행하여 배포"
}

# 환경 전환
cmd_env_switch() {
    local mode=$1
    
    if [ -z "$mode" ]; then
        log_error "환경 모드를 지정하세요: local 또는 server"
        return 1
    fi
    
    if [ "$mode" != "local" ] && [ "$mode" != "server" ]; then
        log_error "올바른 환경 모드가 아닙니다: $mode"
        return 1
    fi
    
    local current_mode=$(get_current_mode)
    
    if [ "$current_mode" = "$mode" ]; then
        log_info "이미 $mode 모드입니다."
        return 0
    fi
    
    log_info "환경 전환: $current_mode → $mode"
    
    echo "$mode" > .codeb-mode
    
    # 환경별 설정 로드
    if [ "$mode" = "local" ]; then
        if [ -f ".env.local" ]; then
            export $(cat .env.local | grep -v '^#' | xargs)
            log_success "로컬 환경으로 전환되었습니다."
        else
            log_warn ".env.local 파일이 없습니다. 'codeb env init local'을 실행하세요."
        fi
    else
        if [ -f ".env.production" ]; then
            export $(cat .env.production | grep -v '^#' | xargs)
            log_success "서버 환경으로 전환되었습니다."
        else
            log_warn ".env.production 파일이 없습니다. 설정을 확인하세요."
        fi
    fi
}

# 환경 상태 확인
cmd_env_status() {
    local current_mode=$(get_current_mode)
    
    echo -e "${BOLD}${CYAN}📊 CodeB 환경 상태${NC}"
    echo ""
    echo -e "${BOLD}현재 모드:${NC} $current_mode"
    echo ""
    
    if [ "$current_mode" = "local" ]; then
        echo -e "${BOLD}로컬 환경 설정:${NC}"
        if [ -f ".env.local" ]; then
            echo "  ✅ .env.local 존재"
            # 주요 설정 표시 (민감한 정보 제외)
            if [ -f ".env.local" ]; then
                echo "  📋 주요 설정:"
                grep -E "^(NODE_ENV|PORT|DATABASE_URL|REDIS_URL|STORAGE_TYPE)" .env.local | sed 's/=.*/:******/' | sed 's/^/     /'
            fi
        else
            echo "  ❌ .env.local 없음"
        fi
        
        # Podman 상태 확인
        if [ -f "podman/docker-compose.yml" ]; then
            echo ""
            echo -e "${BOLD}Podman 상태:${NC}"
            if command -v docker-compose &> /dev/null || command -v podman-compose &> /dev/null; then
                cd podman 2>/dev/null && docker-compose ps 2>/dev/null || podman-compose ps 2>/dev/null
                cd .. 2>/dev/null
            else
                echo "  ⚠️ Docker/Podman Compose가 설치되지 않음"
            fi
        else
            echo ""
            echo "  ⚠️ Podman 환경이 초기화되지 않음"
        fi
    else
        echo -e "${BOLD}서버 환경 설정:${NC}"
        if [ -f ".env.production" ]; then
            echo "  ✅ .env.production 존재"
            grep -E "^(NODE_ENV|DOMAIN|STORAGE_TYPE)" .env.production | sed 's/=.*/:******/' | sed 's/^/     /'
        else
            echo "  ❌ .env.production 없음"
        fi
        
        if [ -f ".env.production.example" ]; then
            echo "  ✅ .env.production.example 존재"
        fi
        
        if [ -f "deploy.sh" ]; then
            echo "  ✅ 배포 스크립트 존재"
        fi
    fi
}

# 환경 변수 확인
cmd_env_list() {
    local current_mode=$(get_current_mode)
    local env_file=""
    
    if [ "$current_mode" = "local" ]; then
        env_file=".env.local"
    else
        env_file=".env.production"
    fi
    
    if [ ! -f "$env_file" ]; then
        log_error "$env_file 파일이 없습니다."
        return 1
    fi
    
    echo -e "${BOLD}${CYAN}📋 환경 변수 ($current_mode 모드)${NC}"
    echo ""
    
    # 카테고리별로 정리
    echo -e "${BOLD}기본 설정:${NC}"
    grep -E "^(NODE_ENV|PORT|APP_NAME|DOMAIN)" "$env_file" | sed 's/\(.*=\).*/ \1******/'
    
    echo ""
    echo -e "${BOLD}데이터베이스:${NC}"
    grep -E "^(DATABASE_URL|DB_)" "$env_file" | sed 's/\(.*=\).*/ \1******/'
    
    echo ""
    echo -e "${BOLD}캐시:${NC}"
    grep -E "^(REDIS_)" "$env_file" | sed 's/\(.*=\).*/ \1******/'
    
    echo ""
    echo -e "${BOLD}스토리지:${NC}"
    grep -E "^(STORAGE_|AWS_|GCS_|UPLOAD_)" "$env_file" | sed 's/\(.*=\).*/ \1******/'
    
    echo ""
    echo -e "${BOLD}기타:${NC}"
    grep -vE "^(#|$|NODE_ENV|PORT|APP_NAME|DOMAIN|DATABASE_URL|DB_|REDIS_|STORAGE_|AWS_|GCS_|UPLOAD_)" "$env_file" | sed 's/\(.*=\).*/ \1******/'
}

# 환경 변수 설정
cmd_env_set() {
    local key=$1
    local value=$2
    local current_mode=$(get_current_mode)
    local env_file=""
    
    if [ -z "$key" ] || [ -z "$value" ]; then
        log_error "키와 값을 모두 지정하세요."
        echo "사용법: codeb env set <KEY> <VALUE>"
        return 1
    fi
    
    if [ "$current_mode" = "local" ]; then
        env_file=".env.local"
    else
        env_file=".env.production"
    fi
    
    if [ ! -f "$env_file" ]; then
        log_error "$env_file 파일이 없습니다."
        return 1
    fi
    
    # 기존 키가 있는지 확인
    if grep -q "^$key=" "$env_file"; then
        # 기존 값 업데이트
        sed -i.bak "s/^$key=.*/$key=$value/" "$env_file"
        log_success "$key 값이 업데이트되었습니다."
    else
        # 새 키 추가
        echo "$key=$value" >> "$env_file"
        log_success "$key 값이 추가되었습니다."
    fi
}

# 환경 검증
cmd_env_validate() {
    local current_mode=$(get_current_mode)
    local env_file=""
    local errors=0
    
    if [ "$current_mode" = "local" ]; then
        env_file=".env.local"
    else
        env_file=".env.production"
    fi
    
    echo -e "${BOLD}${CYAN}🔍 환경 설정 검증 ($current_mode 모드)${NC}"
    echo ""
    
    if [ ! -f "$env_file" ]; then
        log_error "$env_file 파일이 없습니다."
        return 1
    fi
    
    # 필수 변수 확인
    local required_vars=(
        "NODE_ENV"
        "PORT"
        "DATABASE_URL"
    )
    
    for var in "${required_vars[@]}"; do
        if ! grep -q "^$var=" "$env_file"; then
            log_error "필수 변수 누락: $var"
            ((errors++))
        else
            log_success "$var 존재"
        fi
    done
    
    # 로컬 환경에서 컨테이너 연결 테스트
    if [ "$current_mode" = "local" ]; then
        echo ""
        echo -e "${BOLD}연결 테스트:${NC}"
        
        # PostgreSQL 연결 테스트
        if command -v pg_isready &> /dev/null; then
            if pg_isready -h localhost -p 5432 -U codeb &> /dev/null; then
                log_success "PostgreSQL 연결 가능"
            else
                log_warn "PostgreSQL 연결 불가 (컨테이너가 실행 중인지 확인)"
            fi
        fi
        
        # Redis 연결 테스트
        if command -v redis-cli &> /dev/null; then
            if redis-cli -h localhost -p 6379 -a codeb123 ping &> /dev/null; then
                log_success "Redis 연결 가능"
            else
                log_warn "Redis 연결 불가 (컨테이너가 실행 중인지 확인)"
            fi
        fi
    fi
    
    echo ""
    if [ $errors -eq 0 ]; then
        log_success "환경 설정 검증 완료! 문제없음"
        return 0
    else
        log_error "환경 설정에 $errors개의 문제가 있습니다."
        return 1
    fi
}