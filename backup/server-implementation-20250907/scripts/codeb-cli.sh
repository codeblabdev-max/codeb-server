#!/bin/bash

# CodeB CLI v3.0 - 통합 개발-배포 관리 도구
# 로컬 개발, 서버 관리, 자동 배포 통합 시스템

VERSION="3.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$HOME/.codeb"
LOCAL_PROJECTS_DIR="$HOME/codeb-projects"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# 로깅 함수
log_info() { echo -e "${BLUE}ℹ️ $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️ $1${NC}"; }
log_header() { echo -e "${BOLD}${CYAN}🚀 $1${NC}"; }
log_debug() { [ "$DEBUG" = "true" ] && echo -e "${PURPLE}🔍 $1${NC}"; }

# 설정 로드
load_config() {
    # 설정 디렉토리 생성
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$LOCAL_PROJECTS_DIR"
    
    # 기본 설정 파일 생성
    if [ ! -f "$CONFIG_DIR/config.yml" ]; then
        cat > "$CONFIG_DIR/config.yml" << 'EOF'
# CodeB CLI Configuration
version: 3.0.0

# 서버 설정
server:
  ip: 141.164.60.51
  port: 3008
  domain: one-q.xyz

# 로컬 개발 설정
local:
  projects_dir: ~/codeb-projects
  port_range_start: 3000
  port_range_end: 3999
  podman_network: codeb-local

# 배포 설정
deploy:
  use_act: true
  auto_commit: true
  auto_push: true
  backup_before_deploy: true

# 데이터베이스 설정
database:
  migrations_dir: migrations
  seeds_dir: seeds
  backup_dir: backups
EOF
        log_info "설정 파일 생성: $CONFIG_DIR/config.yml"
    fi
    
    # 데이터베이스 설정 파일
    if [ ! -f "$CONFIG_DIR/database.yml" ]; then
        cat > "$CONFIG_DIR/database.yml" << 'EOF'
# Database Configuration
development:
  seed_data: true
  sample_users: 100
  reset_allowed: true
  auto_migrate: true

production:
  seed_data: false
  sample_users: 0
  reset_allowed: false
  backup_before_migrate: true
  require_confirmation: true

migration:
  auto_rollback: true
  transaction_mode: true
  dry_run_first: true
  safety_check: true
EOF
        log_info "데이터베이스 설정 생성: $CONFIG_DIR/database.yml"
    fi
}

# 모드별 스크립트 로드
load_mode_scripts() {
    local mode=$1
    
    case $mode in
        "local")
            source "$SCRIPT_DIR/codeb-cli/modes/local.sh" 2>/dev/null || create_local_mode
            ;;
        "server")
            source "$SCRIPT_DIR/codeb-cli/modes/server.sh" 2>/dev/null || create_server_mode
            ;;
        "deploy")
            source "$SCRIPT_DIR/codeb-cli/modes/deploy.sh" 2>/dev/null || create_deploy_mode
            ;;
        "db")
            source "$SCRIPT_DIR/codeb-cli/modes/database.sh" 2>/dev/null || create_database_mode
            ;;
    esac
}

# 로컬 모드 생성
create_local_mode() {
    mkdir -p "$SCRIPT_DIR/codeb-cli/modes"
    cat > "$SCRIPT_DIR/codeb-cli/modes/local.sh" << 'LOCALMODE'
#!/bin/bash

# 로컬 프로젝트 생성
local_create() {
    local project_name=$1
    local template=${2:-nodejs}
    
    log_header "🏗️ 로컬 프로젝트 생성: $project_name"
    
    # 프로젝트 디렉토리 생성
    local project_dir="$LOCAL_PROJECTS_DIR/$project_name"
    if [ -d "$project_dir" ]; then
        log_error "프로젝트가 이미 존재합니다: $project_name"
        return 1
    fi
    
    mkdir -p "$project_dir"/{app,data,config}
    
    # 포트 할당
    local app_port=$(find_available_port 3000 3999)
    local db_port=$((app_port + 1000))
    local redis_port=$((app_port + 2000))
    
    log_info "포트 할당: App=$app_port, DB=$db_port, Redis=$redis_port"
    
    # Podman Pod 생성
    log_info "Podman Pod 생성 중..."
    podman pod create \
        --name "local-$project_name" \
        -p $app_port:3000 \
        -p $db_port:5432 \
        -p $redis_port:6379 \
        --network codeb-local 2>/dev/null || true
    
    # PostgreSQL 컨테이너
    log_info "PostgreSQL 컨테이너 생성 중..."
    podman run -d \
        --pod "local-$project_name" \
        --name "local-$project_name-postgres" \
        -e POSTGRES_DB=$project_name \
        -e POSTGRES_USER=user \
        -e POSTGRES_PASSWORD=password \
        -v "$project_dir/data/postgres:/var/lib/postgresql/data" \
        postgres:15-alpine
    
    # Redis 컨테이너
    log_info "Redis 컨테이너 생성 중..."
    podman run -d \
        --pod "local-$project_name" \
        --name "local-$project_name-redis" \
        -v "$project_dir/data/redis:/data" \
        redis:7-alpine
    
    # 앱 컨테이너 (개발 모드)
    log_info "앱 컨테이너 생성 중..."
    local app_image="node:20-alpine"
    [ "$template" = "python" ] && app_image="python:3.11-alpine"
    
    podman run -d \
        --pod "local-$project_name" \
        --name "local-$project_name-app" \
        -v "$project_dir/app:/app" \
        -w /app \
        -e NODE_ENV=development \
        -e DATABASE_URL="postgresql://user:password@localhost:5432/$project_name" \
        -e REDIS_URL="redis://localhost:6379" \
        $app_image \
        sh -c "apk add --no-cache git && sleep infinity"
    
    # 프로젝트 메타데이터 저장
    cat > "$project_dir/.codeb.json" << EOF
{
    "name": "$project_name",
    "template": "$template",
    "mode": "local",
    "ports": {
        "app": $app_port,
        "database": $db_port,
        "redis": $redis_port
    },
    "created": "$(date -Iseconds)",
    "status": "created"
}
EOF
    
    log_success "로컬 프로젝트 생성 완료!"
    echo ""
    echo "📂 프로젝트 위치: $project_dir"
    echo "🌐 접속 URL: http://localhost:$app_port"
    echo "🗄️ PostgreSQL: postgresql://user:password@localhost:$db_port/$project_name"
    echo "📦 Redis: redis://localhost:$redis_port"
    echo ""
    echo "다음 명령: codeb local start $project_name"
}

# 로컬 프로젝트 시작
local_start() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: codeb local start <프로젝트명>"
        return 1
    fi
    
    log_header "▶️ 로컬 프로젝트 시작: $project_name"
    
    podman pod start "local-$project_name"
    
    log_success "프로젝트 시작됨"
    
    # 상태 확인
    local_status "$project_name"
}

# 로컬 프로젝트 중지
local_stop() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: codeb local stop <프로젝트명>"
        return 1
    fi
    
    log_header "⏸️ 로컬 프로젝트 중지: $project_name"
    
    podman pod stop "local-$project_name"
    
    log_success "프로젝트 중지됨"
}

# 로컬 프로젝트 상태
local_status() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        # 전체 프로젝트 목록
        log_header "📋 로컬 프로젝트 목록"
        echo ""
        
        for proj_dir in "$LOCAL_PROJECTS_DIR"/*; do
            if [ -d "$proj_dir" ] && [ -f "$proj_dir/.codeb.json" ]; then
                local name=$(basename "$proj_dir")
                local status=$(podman pod ps --filter name="local-$name" --format "{{.Status}}" 2>/dev/null | head -1)
                [ -z "$status" ] && status="Stopped"
                
                printf "• %-20s %s\n" "$name" "$status"
            fi
        done
    else
        # 특정 프로젝트 상태
        log_header "📊 프로젝트 상태: $project_name"
        
        podman pod ps --filter name="local-$project_name"
        echo ""
        podman ps --filter pod="local-$project_name" --format "table {{.Names}}\t{{.Status}}"
    fi
}

# 로컬 프로젝트 삭제
local_delete() {
    local project_name=$1
    
    if [ -z "$project_name" ]; then
        log_error "사용법: codeb local delete <프로젝트명>"
        return 1
    fi
    
    log_warning "프로젝트를 삭제하시겠습니까? $project_name"
    read -p "확인 (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        log_info "취소되었습니다"
        return 0
    fi
    
    log_header "🗑️ 로컬 프로젝트 삭제: $project_name"
    
    # Pod 중지 및 삭제
    podman pod stop "local-$project_name" 2>/dev/null
    podman pod rm "local-$project_name" 2>/dev/null
    
    # 디렉토리 삭제
    rm -rf "$LOCAL_PROJECTS_DIR/$project_name"
    
    log_success "프로젝트 삭제 완료"
}

# 사용 가능한 포트 찾기
find_available_port() {
    local start=$1
    local end=$2
    
    for port in $(seq $start $end); do
        if ! lsof -i:$port >/dev/null 2>&1; then
            echo $port
            return 0
        fi
    done
    
    log_error "사용 가능한 포트를 찾을 수 없습니다"
    return 1
}

# 로컬 데이터베이스 명령
local_db() {
    local subcommand=$1
    local project_name=$2
    shift 2
    
    case $subcommand in
        "reset")
            log_header "🔄 데이터베이스 초기화: $project_name"
            
            # 스키마 적용
            local project_dir="$LOCAL_PROJECTS_DIR/$project_name"
            if [ -d "$project_dir/migrations/schema" ]; then
                for migration in "$project_dir/migrations/schema"/*.sql; do
                    log_info "적용 중: $(basename $migration)"
                    podman exec -i "local-$project_name-postgres" \
                        psql -U user -d $project_name < "$migration"
                done
            fi
            
            # 로컬 시드 데이터
            if [ -d "$project_dir/migrations/seeds/local" ]; then
                for seed in "$project_dir/migrations/seeds/local"/*.sql; do
                    log_info "시드 적용: $(basename $seed)"
                    podman exec -i "local-$project_name-postgres" \
                        psql -U user -d $project_name < "$seed"
                done
            fi
            
            log_success "데이터베이스 초기화 완료"
            ;;
            
        "migrate")
            log_header "📝 마이그레이션 실행: $project_name"
            # 마이그레이션 로직
            ;;
            
        "seed")
            log_header "🌱 시드 데이터 적용: $project_name"
            # 시드 로직
            ;;
            
        *)
            log_error "알 수 없는 명령: $subcommand"
            ;;
    esac
}
LOCALMODE
    
    source "$SCRIPT_DIR/codeb-cli/modes/local.sh"
}

# 서버 모드 생성
create_server_mode() {
    mkdir -p "$SCRIPT_DIR/codeb-cli/modes"
    cat > "$SCRIPT_DIR/codeb-cli/modes/server.sh" << 'SERVERMODE'
#!/bin/bash

# 서버 모드 - 기존 codeb-cli-v2.sh 기능
SERVER_IP="141.164.60.51"
API_PORT="3008"
API_BASE="http://${SERVER_IP}:${API_PORT}/api"

# API 호출 헬퍼
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local timeout=${4:-30}
    
    local url="${API_BASE}${endpoint}"
    
    if [ "$method" = "GET" ]; then
        curl -s --max-time $timeout "$url"
    elif [ "$method" = "POST" ]; then
        curl -s --max-time $timeout -X POST \
             -H "Content-Type: application/json" \
             -d "$data" "$url"
    elif [ "$method" = "DELETE" ]; then
        curl -s --max-time $timeout -X DELETE "$url"
    fi
}

# 서버 프로젝트 생성
server_create() {
    local project_name=$1
    local template=${2:-nodejs}
    
    log_header "🌐 서버 프로젝트 생성: $project_name"
    
    local create_data=$(jq -n \
        --arg name "$project_name" \
        --arg template "$template" \
        '{name: $name, template: $template, enablePostgres: true, enableRedis: true}')
    
    log_info "서버에 프로젝트 생성 중..."
    
    local response=$(api_call POST "/projects" "$create_data" 120)
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        local port=$(echo "$response" | jq -r '.project.appPort')
        local domain=$(echo "$response" | jq -r '.project.domain')
        
        log_success "서버 프로젝트 생성 완료!"
        echo ""
        echo "🌐 도메인: $domain"
        echo "📡 서버: http://$SERVER_IP:$port"
    else
        local error=$(echo "$response" | jq -r '.error' 2>/dev/null)
        log_error "생성 실패: $error"
    fi
}

# 서버 프로젝트 목록
server_list() {
    log_header "📋 서버 프로젝트 목록"
    
    local response=$(api_call GET "/projects")
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        echo "$response" | jq -r '.projects[] | "\(.name)\t\(.status)\t\(.domain)"' | \
        while IFS=$'\t' read -r name status domain; do
            printf "• %-20s %-10s %s\n" "$name" "$status" "$domain"
        done
    else
        log_error "목록 조회 실패"
    fi
}

# 서버 배포
server_deploy() {
    local project_name=$1
    local git_url=$2
    local branch=${3:-main}
    
    log_header "🚀 서버 배포: $project_name"
    
    local deploy_data=$(jq -n \
        --arg gitUrl "$git_url" \
        --arg branch "$branch" \
        '{gitUrl: $gitUrl, branch: $branch}')
    
    log_info "배포 중..."
    
    local response=$(api_call POST "/projects/$project_name/deploy" "$deploy_data" 600)
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        log_success "배포 완료!"
        echo "$response" | jq -r '.domain'
    else
        log_error "배포 실패"
    fi
}
SERVERMODE
    
    source "$SCRIPT_DIR/codeb-cli/modes/server.sh"
}

# 배포 모드 생성
create_deploy_mode() {
    mkdir -p "$SCRIPT_DIR/codeb-cli/modes"
    cat > "$SCRIPT_DIR/codeb-cli/modes/deploy.sh" << 'DEPLOYMODE'
#!/bin/bash

# 자동 배포 파이프라인
deploy_project() {
    local project_name=$1
    local options=$2
    
    log_header "🚀 자동 배포 파이프라인: $project_name"
    
    # 프로젝트 디렉토리 확인
    local project_dir="$LOCAL_PROJECTS_DIR/$project_name"
    if [ ! -d "$project_dir" ]; then
        log_error "로컬 프로젝트를 찾을 수 없습니다: $project_name"
        return 1
    fi
    
    cd "$project_dir/app"
    
    # 1단계: 로컬 빌드 테스트
    log_info "1단계: 로컬 빌드 테스트"
    if [ -f ".github/workflows/build.yml" ] && command -v act >/dev/null 2>&1; then
        log_info "GitHub Actions로 로컬 테스트 실행 (act)"
        
        if ! act -j build; then
            log_error "로컬 빌드 테스트 실패"
            return 1
        fi
        log_success "로컬 빌드 성공"
    else
        log_info "npm 빌드 실행"
        if [ -f "package.json" ]; then
            npm install && npm run build
            if [ $? -ne 0 ]; then
                log_error "npm 빌드 실패"
                return 1
            fi
        fi
        log_success "빌드 성공"
    fi
    
    # 2단계: Git 커밋 및 푸시
    log_info "2단계: Git 백업"
    
    # Git 상태 확인
    if [ ! -d ".git" ]; then
        git init
        git remote add origin "git@github.com:$USER/$project_name.git" 2>/dev/null || true
    fi
    
    git add -A
    git commit -m "Auto-deploy: $(date '+%Y-%m-%d %H:%M:%S')" || true
    
    if git remote -v | grep -q origin; then
        log_info "Git push 중..."
        git push origin main || git push origin master
        log_success "Git 백업 완료"
    else
        log_warning "Git remote가 설정되지 않음"
    fi
    
    # 3단계: 서버 배포
    log_info "3단계: 서버 배포"
    
    # 데이터베이스 마이그레이션 체크
    if [ -d "../migrations/schema" ]; then
        log_info "데이터베이스 마이그레이션 확인"
        deploy_check_migrations "$project_name"
    fi
    
    # 서버에 배포
    local git_url=$(git remote get-url origin 2>/dev/null || echo "")
    if [ -n "$git_url" ]; then
        server_deploy "$project_name" "$git_url" "main"
        log_success "서버 배포 완료!"
    else
        log_error "Git URL을 찾을 수 없습니다"
        return 1
    fi
    
    # 4단계: 배포 확인
    log_info "4단계: 배포 상태 확인"
    sleep 3
    
    # 서버 상태 체크
    local response=$(api_call GET "/projects/$project_name/status")
    local status=$(echo "$response" | jq -r '.status' 2>/dev/null)
    
    if [ "$status" = "Running" ]; then
        log_success "✨ 배포 완료!"
        echo ""
        echo "📊 배포 요약:"
        echo "  • 로컬 빌드: ✅"
        echo "  • Git 백업: ✅"
        echo "  • 서버 배포: ✅"
        echo "  • 상태: 실행중"
    else
        log_warning "배포는 완료되었지만 서버 상태 확인 필요"
    fi
}

# 마이그레이션 안전성 체크
deploy_check_migrations() {
    local project_name=$1
    local project_dir="$LOCAL_PROJECTS_DIR/$project_name"
    
    log_info "마이그레이션 안전성 검사"
    
    # 위험한 SQL 패턴 검사
    local dangerous_patterns=(
        "DROP TABLE"
        "DROP DATABASE"
        "TRUNCATE"
        "DELETE FROM"
    )
    
    local has_danger=false
    for pattern in "${dangerous_patterns[@]}"; do
        if grep -r "$pattern" "$project_dir/migrations/schema/" 2>/dev/null; then
            log_warning "위험한 마이그레이션 감지: $pattern"
            has_danger=true
        fi
    done
    
    if [ "$has_danger" = true ]; then
        log_warning "위험한 마이그레이션이 감지되었습니다"
        read -p "계속하시겠습니까? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "배포 중단"
            exit 1
        fi
    fi
    
    log_success "마이그레이션 안전성 검사 통과"
}

# 배포 롤백
deploy_rollback() {
    local project_name=$1
    local version=${2:-"HEAD~1"}
    
    log_header "⏪ 배포 롤백: $project_name"
    
    local project_dir="$LOCAL_PROJECTS_DIR/$project_name/app"
    cd "$project_dir"
    
    # Git 롤백
    log_info "이전 버전으로 롤백 중..."
    git checkout $version
    
    # 서버 재배포
    deploy_project "$project_name"
}

# 배포 상태 확인
deploy_status() {
    local project_name=$1
    
    log_header "📊 배포 상태: $project_name"
    
    # 로컬 Git 상태
    local project_dir="$LOCAL_PROJECTS_DIR/$project_name/app"
    if [ -d "$project_dir/.git" ]; then
        cd "$project_dir"
        echo "Git 상태:"
        git log --oneline -5
        echo ""
    fi
    
    # 서버 상태
    echo "서버 상태:"
    local response=$(api_call GET "/projects/$project_name/status")
    echo "$response" | jq '.'
}
DEPLOYMODE
    
    source "$SCRIPT_DIR/codeb-cli/modes/deploy.sh"
}

# 데이터베이스 모드 생성
create_database_mode() {
    mkdir -p "$SCRIPT_DIR/codeb-cli/modes"
    cat > "$SCRIPT_DIR/codeb-cli/modes/database.sh" << 'DBMODE'
#!/bin/bash

# 데이터베이스 마이그레이션 관리
db_migrate() {
    local environment=$1
    local project_name=$2
    local action=${3:-"up"}
    
    log_header "📝 데이터베이스 마이그레이션: $project_name ($environment)"
    
    local project_dir
    if [ "$environment" = "local" ]; then
        project_dir="$LOCAL_PROJECTS_DIR/$project_name"
    else
        project_dir="/tmp/codeb-migrations/$project_name"
        # 서버에서 마이그레이션 파일 다운로드
    fi
    
    # 마이그레이션 디렉토리 구조 생성
    mkdir -p "$project_dir/migrations"/{schema,seeds/{local,common},rollback}
    
    # 마이그레이션 실행
    case $action in
        "up")
            db_migrate_up "$environment" "$project_name" "$project_dir"
            ;;
        "down")
            db_migrate_down "$environment" "$project_name" "$project_dir"
            ;;
        "status")
            db_migrate_status "$environment" "$project_name" "$project_dir"
            ;;
        "create")
            db_migrate_create "$project_name" "$project_dir" "$4"
            ;;
    esac
}

# 마이그레이션 UP
db_migrate_up() {
    local environment=$1
    local project_name=$2
    local project_dir=$3
    
    log_info "마이그레이션 적용 중..."
    
    # 마이그레이션 히스토리 테이블 생성
    local create_history_table="
    CREATE TABLE IF NOT EXISTS migration_history (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        checksum VARCHAR(64)
    );"
    
    if [ "$environment" = "local" ]; then
        echo "$create_history_table" | podman exec -i "local-$project_name-postgres" \
            psql -U user -d $project_name
    else
        # 서버 실행
        echo "$create_history_table" | ssh root@$SERVER_IP \
            "podman exec -i $project_name-postgres psql -U user -d $project_name"
    fi
    
    # 스키마 마이그레이션 적용
    if [ -d "$project_dir/migrations/schema" ]; then
        for migration in "$project_dir/migrations/schema"/*.sql; do
            [ -f "$migration" ] || continue
            
            local filename=$(basename "$migration")
            local checksum=$(sha256sum "$migration" | cut -d' ' -f1)
            
            # 이미 적용되었는지 확인
            local check_query="SELECT 1 FROM migration_history WHERE filename='$filename';"
            local exists
            
            if [ "$environment" = "local" ]; then
                exists=$(echo "$check_query" | podman exec -i "local-$project_name-postgres" \
                    psql -U user -d $project_name -t)
            else
                exists=$(echo "$check_query" | ssh root@$SERVER_IP \
                    "podman exec -i $project_name-postgres psql -U user -d $project_name -t")
            fi
            
            if [ -z "$exists" ]; then
                log_info "적용: $filename"
                
                # 트랜잭션으로 마이그레이션 실행
                local migration_sql="
                BEGIN;
                $(cat "$migration")
                INSERT INTO migration_history (filename, checksum) VALUES ('$filename', '$checksum');
                COMMIT;"
                
                if [ "$environment" = "local" ]; then
                    echo "$migration_sql" | podman exec -i "local-$project_name-postgres" \
                        psql -U user -d $project_name
                else
                    echo "$migration_sql" | ssh root@$SERVER_IP \
                        "podman exec -i $project_name-postgres psql -U user -d $project_name"
                fi
                
                if [ $? -eq 0 ]; then
                    log_success "✓ $filename"
                else
                    log_error "✗ $filename 실패"
                    return 1
                fi
            else
                log_info "스킵: $filename (이미 적용됨)"
            fi
        done
    fi
    
    # 시드 데이터 적용 (로컬 환경만)
    if [ "$environment" = "local" ] && [ -d "$project_dir/migrations/seeds/local" ]; then
        log_info "시드 데이터 적용 중..."
        for seed in "$project_dir/migrations/seeds/local"/*.sql; do
            [ -f "$seed" ] || continue
            local filename=$(basename "$seed")
            log_info "시드: $filename"
            
            podman exec -i "local-$project_name-postgres" \
                psql -U user -d $project_name < "$seed"
        done
    fi
    
    log_success "마이그레이션 완료"
}

# 마이그레이션 생성
db_migrate_create() {
    local project_name=$1
    local project_dir=$2
    local migration_name=$3
    
    if [ -z "$migration_name" ]; then
        log_error "마이그레이션 이름을 입력하세요"
        return 1
    fi
    
    # 타임스탬프 생성
    local timestamp=$(date +%Y%m%d%H%M%S)
    local filename="${timestamp}_${migration_name}.sql"
    local filepath="$project_dir/migrations/schema/$filename"
    
    # 마이그레이션 템플릿 생성
    cat > "$filepath" << EOF
-- Migration: $migration_name
-- Created: $(date -Iseconds)
-- Description: TODO: Add description

-- UP Migration
-- TODO: Add your schema changes here

-- Example:
-- CREATE TABLE example (
--     id SERIAL PRIMARY KEY,
--     name VARCHAR(255) NOT NULL,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );
EOF
    
    # 롤백 파일도 생성
    cat > "$project_dir/migrations/rollback/$filename" << EOF
-- Rollback for: $migration_name
-- Created: $(date -Iseconds)

-- DOWN Migration
-- TODO: Add rollback SQL here

-- Example:
-- DROP TABLE IF EXISTS example;
EOF
    
    log_success "마이그레이션 생성됨:"
    echo "  • UP: $filepath"
    echo "  • DOWN: $project_dir/migrations/rollback/$filename"
    echo ""
    echo "파일을 편집한 후 실행:"
    echo "  codeb db migrate local $project_name up"
}

# 마이그레이션 상태
db_migrate_status() {
    local environment=$1
    local project_name=$2
    local project_dir=$3
    
    log_header "📊 마이그레이션 상태: $project_name"
    
    local query="SELECT filename, executed_at FROM migration_history ORDER BY executed_at DESC LIMIT 10;"
    
    if [ "$environment" = "local" ]; then
        echo "$query" | podman exec -i "local-$project_name-postgres" \
            psql -U user -d $project_name
    else
        echo "$query" | ssh root@$SERVER_IP \
            "podman exec -i $project_name-postgres psql -U user -d $project_name"
    fi
}

# 데이터베이스 동기화
db_sync() {
    local project_name=$1
    local direction=${2:-"local-to-server"}
    
    log_header "🔄 데이터베이스 동기화: $project_name"
    
    case $direction in
        "local-to-server")
            log_info "로컬 → 서버 스키마 동기화"
            
            # 로컬 스키마 덤프 (데이터 제외)
            podman exec "local-$project_name-postgres" \
                pg_dump -U user -d $project_name --schema-only > /tmp/${project_name}_schema.sql
            
            # 서버에 적용
            log_warning "서버 데이터베이스에 스키마를 적용하시겠습니까?"
            read -p "확인 (yes/no): " confirm
            
            if [ "$confirm" = "yes" ]; then
                # 서버 백업 먼저
                ssh root@$SERVER_IP \
                    "podman exec $project_name-postgres pg_dump -U user -d $project_name > /tmp/backup_$(date +%s).sql"
                
                # 스키마 적용
                cat /tmp/${project_name}_schema.sql | ssh root@$SERVER_IP \
                    "podman exec -i $project_name-postgres psql -U user -d $project_name"
                
                log_success "스키마 동기화 완료"
            fi
            ;;
            
        "server-to-local")
            log_info "서버 → 로컬 스키마 동기화"
            
            # 서버 스키마 가져오기
            ssh root@$SERVER_IP \
                "podman exec $project_name-postgres pg_dump -U user -d $project_name --schema-only" > /tmp/${project_name}_schema.sql
            
            # 로컬에 적용
            podman exec -i "local-$project_name-postgres" \
                psql -U user -d $project_name < /tmp/${project_name}_schema.sql
            
            log_success "스키마 동기화 완료"
            ;;
    esac
}
DBMODE
    
    source "$SCRIPT_DIR/codeb-cli/modes/database.sh"
}

# 메인 명령어 라우터
route_command() {
    local mode=$1
    local command=$2
    shift 2
    
    case $mode in
        "local")
            load_mode_scripts "local"
            case $command in
                "create") local_create "$@" ;;
                "start") local_start "$@" ;;
                "stop") local_stop "$@" ;;
                "status"|"list") local_status "$@" ;;
                "delete"|"rm") local_delete "$@" ;;
                "db") local_db "$@" ;;
                *) show_local_help ;;
            esac
            ;;
            
        "server")
            load_mode_scripts "server"
            case $command in
                "create") server_create "$@" ;;
                "list") server_list "$@" ;;
                "deploy") server_deploy "$@" ;;
                *) show_server_help ;;
            esac
            ;;
            
        "deploy")
            load_mode_scripts "deploy"
            load_mode_scripts "server"  # deploy는 server 함수도 필요
            case $command in
                "rollback") deploy_rollback "$@" ;;
                "status") deploy_status "$@" ;;
                *) deploy_project "$command" "$@" ;;  # 프로젝트명이 첫 번째 인자
            esac
            ;;
            
        "db")
            load_mode_scripts "database"
            case $command in
                "migrate") db_migrate "$@" ;;
                "sync") db_sync "$@" ;;
                *) show_db_help ;;
            esac
            ;;
            
        *)
            # 기본 명령어 (help, version 등)
            case $mode in
                "help"|"--help"|"-h") show_help ;;
                "version"|"--version"|"-v") echo "CodeB CLI v$VERSION" ;;
                "init") load_config && log_success "설정 초기화 완료" ;;
                *) show_help ;;
            esac
            ;;
    esac
}

# 도움말 함수들
show_help() {
    echo -e "${BOLD}${CYAN}CodeB CLI v$VERSION - 통합 개발-배포 관리 도구${NC}"
    echo ""
    echo "사용법: codeb <mode> <command> [options]"
    echo ""
    echo -e "${BOLD}모드:${NC}"
    echo "  local              로컬 개발 환경 관리"
    echo "  server             원격 서버 프로젝트 관리"
    echo "  deploy             자동 빌드-배포 파이프라인"
    echo "  db                 데이터베이스 마이그레이션 관리"
    echo ""
    echo -e "${BOLD}로컬 개발 (local):${NC}"
    echo "  codeb local create <name> [template]    프로젝트 생성"
    echo "  codeb local start <name>                개발 서버 시작"
    echo "  codeb local stop <name>                 개발 서버 중지"
    echo "  codeb local status                      프로젝트 목록"
    echo "  codeb local db reset <name>             DB 초기화"
    echo ""
    echo -e "${BOLD}서버 관리 (server):${NC}"
    echo "  codeb server create <name>              서버 프로젝트 생성"
    echo "  codeb server list                       서버 프로젝트 목록"
    echo "  codeb server deploy <name> <git-url>    서버 배포"
    echo ""
    echo -e "${BOLD}자동 배포 (deploy):${NC}"
    echo "  codeb deploy <name>                     빌드-테스트-배포"
    echo "  codeb deploy rollback <name>            이전 버전 롤백"
    echo "  codeb deploy status <name>              배포 상태 확인"
    echo ""
    echo -e "${BOLD}데이터베이스 (db):${NC}"
    echo "  codeb db migrate <env> <name> up        마이그레이션 적용"
    echo "  codeb db migrate <env> <name> create    마이그레이션 생성"
    echo "  codeb db sync <name> <direction>        스키마 동기화"
    echo ""
    echo -e "${BOLD}기타:${NC}"
    echo "  codeb init                               설정 초기화"
    echo "  codeb version                            버전 확인"
    echo "  codeb help                               이 도움말 표시"
}

show_local_help() {
    echo -e "${BOLD}로컬 개발 환경 명령어${NC}"
    echo ""
    echo "  codeb local create <name> [template]    Podman 기반 프로젝트 생성"
    echo "  codeb local start <name>                프로젝트 시작"
    echo "  codeb local stop <name>                 프로젝트 중지"
    echo "  codeb local status                      전체 프로젝트 상태"
    echo "  codeb local delete <name>               프로젝트 삭제"
    echo "  codeb local db reset <name>             데이터베이스 초기화"
    echo "  codeb local db seed <name>              시드 데이터 적용"
}

show_server_help() {
    echo -e "${BOLD}서버 관리 명령어${NC}"
    echo ""
    echo "  codeb server create <name> [template]   서버에 프로젝트 생성"
    echo "  codeb server list                       서버 프로젝트 목록"
    echo "  codeb server deploy <name> <git-url>    Git 저장소 배포"
    echo "  codeb server status <name>              프로젝트 상태 확인"
    echo "  codeb server logs <name>                로그 확인"
}

show_db_help() {
    echo -e "${BOLD}데이터베이스 관리 명령어${NC}"
    echo ""
    echo "  codeb db migrate local <name> up        로컬 마이그레이션 적용"
    echo "  codeb db migrate server <name> up       서버 마이그레이션 적용"
    echo "  codeb db migrate local <name> create <migration-name>  마이그레이션 생성"
    echo "  codeb db migrate <env> <name> status    마이그레이션 상태"
    echo "  codeb db sync <name> local-to-server    로컬→서버 스키마 동기화"
    echo "  codeb db sync <name> server-to-local    서버→로컬 스키마 동기화"
}

# 필수 도구 확인
check_requirements() {
    local missing=()
    
    command -v podman >/dev/null 2>&1 || missing+=("podman")
    command -v jq >/dev/null 2>&1 || missing+=("jq")
    command -v curl >/dev/null 2>&1 || missing+=("curl")
    command -v git >/dev/null 2>&1 || missing+=("git")
    
    if [ ${#missing[@]} -gt 0 ]; then
        log_error "필수 도구가 설치되지 않았습니다: ${missing[*]}"
        echo ""
        echo "설치 방법:"
        echo "  macOS: brew install ${missing[*]}"
        echo "  Ubuntu: apt install ${missing[*]}"
        echo "  CentOS: yum install ${missing[*]}"
        exit 1
    fi
    
    # Podman machine 상태 확인 (macOS)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if ! podman machine list | grep -q "Currently running"; then
            log_warning "Podman machine이 실행되지 않았습니다"
            echo "실행: podman machine start"
        fi
    fi
}

# 메인 실행
main() {
    # 첫 실행시 설정 초기화
    if [ ! -d "$CONFIG_DIR" ]; then
        load_config
    fi
    
    # 필수 도구 확인
    check_requirements
    
    # 명령어 라우팅
    route_command "$@"
}

# 스크립트 실행
main "$@"