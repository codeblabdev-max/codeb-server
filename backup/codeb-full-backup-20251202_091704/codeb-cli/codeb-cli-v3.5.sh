#!/bin/bash

# CodeB CLI v3.5 - 로컬/서버 환경 분리형 프로젝트 관리 도구
# 로컬: Podman으로 PostgreSQL/Redis 실행 + 코드만 로컬에서 개발
# 서버: 원격 DB/Redis/Storage 사용

VERSION="3.5.0"
CLI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 라이브러리 로드
source "$CLI_ROOT/lib/colors.sh"
source "$CLI_ROOT/lib/config.sh"
source "$CLI_ROOT/lib/utils.sh"
source "$CLI_ROOT/lib/api.sh"

# 명령어 모듈 로드
source "$CLI_ROOT/commands/project.sh"
source "$CLI_ROOT/commands/control.sh"
source "$CLI_ROOT/commands/deploy.sh"
source "$CLI_ROOT/commands/logs.sh"
source "$CLI_ROOT/commands/database.sh"
source "$CLI_ROOT/commands/diagnose.sh"

# v3.5 새 모듈 로드 (존재하는 경우에만)
[ -f "$CLI_ROOT/commands/podman.sh" ] && source "$CLI_ROOT/commands/podman.sh"
[ -f "$CLI_ROOT/commands/environment.sh" ] && source "$CLI_ROOT/commands/environment.sh"
[ -f "$CLI_ROOT/commands/project-v35.sh" ] && source "$CLI_ROOT/commands/project-v35.sh"

# 환경 모드 감지
ENVIRONMENT_MODE="local"  # local or server
if [ -f ".codeb-mode" ]; then
    ENVIRONMENT_MODE=$(cat .codeb-mode)
fi

# 도움말
show_help() {
    echo -e "${BOLD}${CYAN}CodeB CLI v$VERSION - 로컬/서버 환경 분리형 프로젝트 관리${NC}"
    echo ""
    echo "사용법: $0 <명령> [옵션]"
    echo ""
    echo -e "${BOLD}${YELLOW}★ v3.5 새 기능:${NC}"
    echo -e "${BOLD}환경 관리:${NC}"
    echo "  env init <local|server>     환경 초기화"
    echo "  env switch <local|server>   환경 전환"
    echo "  env status                  현재 환경 상태"
    echo ""
    echo -e "${BOLD}로컬 개발 (Podman):${NC}"
    echo "  local init                  로컬 개발 환경 초기화"
    echo "  local start                 Podman 컨테이너 시작 (DB/Redis)"
    echo "  local stop                  Podman 컨테이너 중지"
    echo "  local reset                 컨테이너 초기화"
    echo "  local status                컨테이너 상태 확인"
    echo ""
    echo -e "${BOLD}프로젝트 생성 (향상):${NC}"
    echo "  create <이름> [템플릿] --mode=<local|server>  프로젝트 생성"
    echo "    --with-db=<postgresql|mysql>              DB 설정"
    echo "    --with-cache=<redis|memcached>            캐시 설정"
    echo "    --with-storage=<local|s3|gcs>             스토리지 설정"
    echo ""
    echo -e "${BOLD}프로젝트 관리:${NC}"
    echo "  list                        프로젝트 목록 보기"
    echo "  delete <이름>               프로젝트 삭제"
    echo "  status <이름>               프로젝트 상태 확인"
    echo ""
    echo -e "${BOLD}프로젝트 제어:${NC}"
    echo "  start <이름>                프로젝트 시작"
    echo "  stop <이름>                 프로젝트 중지"
    echo "  restart <이름>              프로젝트 재시작"
    echo ""
    echo -e "${BOLD}배포 & 빌드:${NC}"
    echo "  deploy <이름> <git-url> [브랜치]  코드 배포"
    echo "  build <이름> [build|dev|start]    빌드 실행"
    echo ""
    echo -e "${BOLD}데이터베이스:${NC}"
    echo "  db migrate <이름>           마이그레이션 실행"
    echo "  db seed <이름>              시드 데이터 생성"
    echo "  db backup <이름>            데이터베이스 백업"
    echo "  db restore <이름> <파일>     데이터베이스 복원"
    echo ""
    echo -e "${BOLD}모니터링:${NC}"
    echo "  logs <이름> [app|build|pm2]  로그 보기"
    echo "  diagnose <이름>             종합 진단"
    echo ""
    echo -e "${BOLD}템플릿:${NC} nextjs, remix, react, vue, nodejs, python"
    echo -e "${BOLD}현재 모드:${NC} $ENVIRONMENT_MODE"
    echo ""
}

# 환경 초기화 함수
env_init() {
    local mode=$1
    if [ -z "$mode" ]; then
        log_error "환경 모드를 지정하세요: local 또는 server"
        return 1
    fi
    
    echo "$mode" > .codeb-mode
    
    if [ "$mode" = "local" ]; then
        log_info "로컬 개발 환경으로 초기화..."
        
        # .env.local 생성
        cat > .env.local << EOF
# CodeB v3.5 - 로컬 개발 환경
NODE_ENV=development
PORT=3000

# 로컬 Podman 데이터베이스
DATABASE_URL=postgresql://codeb:codeb123@localhost:5432/codeb_dev

# 로컬 Podman Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=codeb123

# 로컬 스토리지
STORAGE_TYPE=local
UPLOAD_DIR=./uploads
EOF
        
        log_success "로컬 환경 설정 완료!"
        echo "다음 명령으로 Podman 컨테이너를 시작하세요: codeb local start"
        
    elif [ "$mode" = "server" ]; then
        log_info "서버 환경으로 초기화..."
        
        # .env.production.example 생성
        cat > .env.production.example << EOF
# CodeB v3.5 - 서버 환경
NODE_ENV=production
PORT=3000

# 서버 데이터베이스
DATABASE_URL=postgresql://username:password@db-server:5432/production_db

# 서버 Redis
REDIS_URL=redis://redis-server:6379
REDIS_PASSWORD=production-redis-password

# 서버 스토리지
STORAGE_TYPE=s3
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_BUCKET=your-bucket-name
EOF
        
        log_success "서버 환경 설정 템플릿 생성 완료!"
        echo ".env.production.example을 참고하여 실제 환경 변수를 설정하세요."
    fi
}

# 로컬 Podman 환경 초기화
local_init() {
    log_info "로컬 Podman 환경 초기화..."
    
    # podman 디렉토리 생성
    mkdir -p podman/{scripts,data,init}
    
    # docker-compose.yml 생성
    cat > podman/docker-compose.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: codeb-postgres
    environment:
      POSTGRES_DB: codeb_dev
      POSTGRES_USER: codeb
      POSTGRES_PASSWORD: codeb123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init:/docker-entrypoint-initdb.d
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U codeb -d codeb_dev"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: codeb-redis
    command: redis-server --appendonly yes --requirepass codeb123
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
  redis_data:

networks:
  default:
    name: codeb-network
    driver: bridge
EOF

    # 시작 스크립트 생성
    cat > podman/start.sh << 'EOF'
#!/bin/bash
echo "🚀 CodeB 로컬 개발 환경 시작..."
cd podman
docker-compose up -d
echo "⏳ 컨테이너 상태 확인 중..."
sleep 5

if docker-compose ps | grep -q "Up"; then
    echo "✅ 컨테이너가 성공적으로 시작되었습니다!"
    echo ""
    echo "📋 연결 정보:"
    echo "   PostgreSQL: localhost:5432 (codeb/codeb123)"
    echo "   Redis: localhost:6379 (비밀번호: codeb123)"
else
    echo "❌ 컨테이너 시작에 실패했습니다."
    docker-compose logs
fi
EOF
    chmod +x podman/start.sh

    # 중지 스크립트 생성
    cat > podman/stop.sh << 'EOF'
#!/bin/bash
echo "🛑 CodeB 로컬 개발 환경 중지..."
cd podman
docker-compose down
echo "✅ 환경이 중지되었습니다."
EOF
    chmod +x podman/stop.sh

    # 리셋 스크립트 생성
    cat > podman/reset.sh << 'EOF'
#!/bin/bash
echo "🔄 CodeB 로컬 환경 초기화..."
cd podman
docker-compose down -v
docker-compose up -d
echo "✅ 환경이 초기화되었습니다."
EOF
    chmod +x podman/reset.sh

    log_success "로컬 Podman 환경 초기화 완료!"
    echo "다음 명령으로 시작하세요: codeb local start"
}

# 로컬 환경 시작
local_start() {
    if [ ! -f "podman/docker-compose.yml" ]; then
        log_error "Podman 환경이 초기화되지 않았습니다."
        echo "먼저 'codeb local init'을 실행하세요."
        return 1
    fi
    
    ./podman/start.sh
}

# 로컬 환경 중지
local_stop() {
    if [ ! -f "podman/docker-compose.yml" ]; then
        log_error "Podman 환경이 초기화되지 않았습니다."
        return 1
    fi
    
    ./podman/stop.sh
}

# 로컬 환경 리셋
local_reset() {
    if [ ! -f "podman/docker-compose.yml" ]; then
        log_error "Podman 환경이 초기화되지 않았습니다."
        return 1
    fi
    
    ./podman/reset.sh
}

# 로컬 환경 상태
local_status() {
    if [ ! -f "podman/docker-compose.yml" ]; then
        log_error "Podman 환경이 초기화되지 않았습니다."
        return 1
    fi
    
    echo -e "${BOLD}${CYAN}📊 Podman 컨테이너 상태${NC}"
    cd podman && docker-compose ps
}

# 향상된 프로젝트 생성
enhanced_create() {
    local project_name=$1
    local template=$2
    local mode="local"  # 기본값
    local with_db="postgresql"
    local with_cache="redis"
    local with_storage="local"
    
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
    
    log_info "프로젝트 생성: $project_name (모드: $mode)"
    
    # 기존 프로젝트 생성 로직 호출
    cmd_project_create "$project_name" "$template"
    
    # 프로젝트 디렉토리로 이동
    if [ -d "$project_name" ]; then
        cd "$project_name"
        
        # 환경 모드 설정
        echo "$mode" > .codeb-mode
        
        # 모드에 따른 설정
        if [ "$mode" = "local" ]; then
            env_init local
            local_init
            log_success "로컬 개발 환경 설정 완료!"
        else
            env_init server
            log_success "서버 환경 설정 완료!"
        fi
        
        cd ..
    fi
}

# 메인 로직
main() {
    # 종속성 확인
    check_dependencies
    
    local command=$1
    shift
    
    case $command in
        # v3.5 새 명령어
        "env")
            local subcmd=$1
            shift
            case $subcmd in
                "init")
                    env_init "$@"
                    ;;
                "switch")
                    env_init "$@"
                    ;;
                "status")
                    echo -e "${BOLD}현재 환경 모드:${NC} $ENVIRONMENT_MODE"
                    ;;
                *)
                    log_error "알 수 없는 env 명령: $subcmd"
                    ;;
            esac
            ;;
        "local")
            local subcmd=$1
            shift
            case $subcmd in
                "init")
                    local_init
                    ;;
                "start")
                    local_start
                    ;;
                "stop")
                    local_stop
                    ;;
                "reset")
                    local_reset
                    ;;
                "status")
                    local_status
                    ;;
                *)
                    log_error "알 수 없는 local 명령: $subcmd"
                    ;;
            esac
            ;;
        "create")
            # v3.5 향상된 create 명령
            if [ -n "$(type -t cmd_project_create_v35)" ]; then
                cmd_project_create_v35 "$@"
            else
                enhanced_create "$@"
            fi
            ;;
        # 기존 명령어들
        "list"|"ls")
            cmd_project_list "$@"
            ;;
        "delete"|"remove"|"rm")
            cmd_project_delete "$@"
            ;;
        "status"|"stat")
            cmd_project_status "$@"
            ;;
        "start")
            cmd_control_start "$@"
            ;;
        "stop")
            cmd_control_stop "$@"
            ;;
        "restart")
            cmd_control_restart "$@"
            ;;
        "deploy")
            cmd_deploy_code "$@"
            ;;
        "build")
            cmd_deploy_build "$@"
            ;;
        "logs")
            cmd_logs_show "$@"
            ;;
        "tail")
            cmd_logs_tail "$@"
            ;;
        "files")
            cmd_logs_files "$@"
            ;;
        "diagnose"|"diag")
            cmd_diagnose_project "$@"
            ;;
        "db")
            cmd_database "$@"
            ;;
        "help"|"--help"|"-h"|"")
            show_help
            ;;
        *)
            log_error "알 수 없는 명령: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# 스크립트 실행
main "$@"