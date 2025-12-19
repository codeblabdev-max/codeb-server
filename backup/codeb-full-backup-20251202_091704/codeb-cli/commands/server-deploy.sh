#!/bin/bash

# CodeB CLI v3.5 - 서버 Podman 배포 모듈
# 로컬 Podman 구성을 원격 서버에 배포

# 서버 배포 준비
cmd_server_prepare() {
    local server_host=$1
    local server_user=${2:-root}
    local project_name=${3:-$(basename "$PWD")}
    
    if [ -z "$server_host" ]; then
        log_error "사용법: codeb server prepare <서버주소> [사용자] [프로젝트명]"
        return 1
    fi
    
    log_header "🚀 서버 Podman 배포 준비"
    echo "• 서버: $server_user@$server_host"
    echo "• 프로젝트: $project_name"
    echo ""
    
    # 로컬 podman 디렉토리 확인
    if [ ! -d "podman" ]; then
        log_error "podman 디렉토리가 없습니다. 먼저 'codeb local init'을 실행하세요."
        return 1
    fi
    
    # 서버 배포용 스크립트 생성
    create_server_deployment_package "$project_name"
    
    log_success "서버 배포 패키지 생성 완료!"
    echo ""
    echo "📋 다음 단계:"
    echo "  1. codeb server deploy $server_host  # 서버에 배포"
    echo "  2. ssh $server_user@$server_host"
    echo "  3. cd /opt/codeb/$project_name"
    echo "  4. ./setup.sh"
}

# 서버 배포 패키지 생성
create_server_deployment_package() {
    local project_name=$1
    
    log_info "서버 배포 패키지 생성 중..."
    
    # deploy 디렉토리 생성
    mkdir -p deploy
    
    # docker-compose.yml 복사 및 수정
    cp podman/docker-compose.yml deploy/docker-compose.yml
    
    # 서버용 환경 변수 파일 생성
    cat > deploy/.env.server << EOF
# CodeB v3.5 - 서버 Podman 환경
PROJECT_NAME=$project_name
COMPOSE_PROJECT_NAME=$project_name

# PostgreSQL 설정
POSTGRES_DB=${project_name}_db
POSTGRES_USER=${project_name}_user
POSTGRES_PASSWORD=$(openssl rand -hex 16)

# Redis 설정  
REDIS_PASSWORD=$(openssl rand -hex 16)

# 네트워크 설정
NETWORK_NAME=${project_name}_network
EOF

    # 서버 설치 스크립트 생성
    cat > deploy/setup.sh << 'EOF'
#!/bin/bash

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BOLD}${CYAN}🚀 CodeB 서버 Podman 환경 설치${NC}"
echo ""

# 1. Podman/Docker 확인
if command -v podman &> /dev/null; then
    CONTAINER_RUNTIME="podman"
    COMPOSE_CMD="podman-compose"
elif command -v docker &> /dev/null; then
    CONTAINER_RUNTIME="docker"
    COMPOSE_CMD="docker-compose"
else
    echo -e "${RED}❌ Podman 또는 Docker가 설치되어 있지 않습니다.${NC}"
    echo "설치 방법:"
    echo "  Podman: dnf install podman podman-compose"
    echo "  Docker: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

echo -e "${GREEN}✅ $CONTAINER_RUNTIME 감지됨${NC}"

# 2. Docker Compose 확인
if ! command -v $COMPOSE_CMD &> /dev/null; then
    if [ "$CONTAINER_RUNTIME" = "docker" ]; then
        COMPOSE_CMD="docker compose"
    else
        echo -e "${YELLOW}⚠️  podman-compose가 설치되어 있지 않습니다.${NC}"
        echo "설치: pip3 install podman-compose"
        exit 1
    fi
fi

# 3. 환경 변수 로드
if [ -f ".env.server" ]; then
    source .env.server
    echo -e "${GREEN}✅ 환경 변수 로드됨${NC}"
else
    echo -e "${RED}❌ .env.server 파일이 없습니다.${NC}"
    exit 1
fi

# 4. 디렉토리 생성
mkdir -p data/{postgres,redis}
mkdir -p logs
mkdir -p backups

# 5. 방화벽 설정 (선택사항)
if command -v firewall-cmd &> /dev/null; then
    echo -e "${BLUE}방화벽 포트 열기...${NC}"
    sudo firewall-cmd --permanent --add-port=5432/tcp  # PostgreSQL
    sudo firewall-cmd --permanent --add-port=6379/tcp  # Redis
    sudo firewall-cmd --reload
fi

# 6. SELinux 컨텍스트 설정 (RHEL/CentOS)
if command -v getenforce &> /dev/null && [ "$(getenforce)" != "Disabled" ]; then
    echo -e "${BLUE}SELinux 컨텍스트 설정...${NC}"
    sudo chcon -Rt svirt_sandbox_file_t data/
fi

# 7. 컨테이너 시작
echo -e "${BLUE}컨테이너 시작...${NC}"
$COMPOSE_CMD up -d

# 8. 상태 확인
sleep 5
echo ""
echo -e "${BOLD}${CYAN}📊 컨테이너 상태:${NC}"
$COMPOSE_CMD ps

# 9. 연결 정보 출력
echo ""
echo -e "${BOLD}${GREEN}✅ 설치 완료!${NC}"
echo ""
echo -e "${BOLD}📋 연결 정보:${NC}"
echo "  PostgreSQL:"
echo "    Host: localhost"
echo "    Port: 5432"
echo "    Database: $POSTGRES_DB"
echo "    User: $POSTGRES_USER"
echo "    Password: $POSTGRES_PASSWORD"
echo ""
echo "  Redis:"
echo "    Host: localhost"
echo "    Port: 6379"
echo "    Password: $REDIS_PASSWORD"
echo ""
echo -e "${YELLOW}⚠️  이 정보를 안전한 곳에 저장하세요!${NC}"

# 10. 관리 스크립트 생성
cat > start.sh << 'SCRIPT'
#!/bin/bash
EOF

# Docker/Podman 감지 부분 추가
cat >> deploy/setup.sh << 'EOF'
if command -v podman &> /dev/null; then
    podman-compose up -d
elif command -v docker &> /dev/null; then
    docker-compose up -d
fi
SCRIPT
chmod +x start.sh

cat > stop.sh << 'SCRIPT'
#!/bin/bash
if command -v podman &> /dev/null; then
    podman-compose down
elif command -v docker &> /dev/null; then
    docker-compose down
fi
SCRIPT
chmod +x stop.sh

cat > status.sh << 'SCRIPT'
#!/bin/bash
if command -v podman &> /dev/null; then
    podman-compose ps
elif command -v docker &> /dev/null; then
    docker-compose ps
fi
SCRIPT
chmod +x status.sh

cat > backup.sh << 'SCRIPT'
#!/bin/bash
# PostgreSQL 백업
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

source .env.server

if command -v podman &> /dev/null; then
    podman exec ${PROJECT_NAME}-postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > $BACKUP_DIR/backup_$TIMESTAMP.sql
else
    docker exec ${PROJECT_NAME}-postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > $BACKUP_DIR/backup_$TIMESTAMP.sql
fi

echo "백업 완료: $BACKUP_DIR/backup_$TIMESTAMP.sql"
SCRIPT
chmod +x backup.sh

echo ""
echo -e "${CYAN}관리 스크립트:${NC}"
echo "  ./start.sh   - 컨테이너 시작"
echo "  ./stop.sh    - 컨테이너 중지"
echo "  ./status.sh  - 상태 확인"
echo "  ./backup.sh  - 데이터베이스 백업"
EOF

    chmod +x deploy/setup.sh
    
    # 서버용 docker-compose 수정
    cat > deploy/docker-compose.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: ${PROJECT_NAME}-postgres
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      PGDATA: /var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"  # 로컬호스트만 접근 가능
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
      - ./init:/docker-entrypoint-initdb.d
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - codeb-network

  redis:
    image: redis:7-alpine
    container_name: ${PROJECT_NAME}-redis
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    ports:
      - "127.0.0.1:6379:6379"  # 로컬호스트만 접근 가능
    volumes:
      - ./data/redis:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - codeb-network

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local

networks:
  codeb-network:
    name: ${NETWORK_NAME}
    driver: bridge
EOF

    # 배포 README 생성
    cat > deploy/README.md << EOF
# CodeB v3.5 서버 Podman 배포

## 프로젝트: $project_name

### 1. 파일 전송
\`\`\`bash
scp -r deploy/* user@server:/opt/codeb/$project_name/
\`\`\`

### 2. 서버 접속
\`\`\`bash
ssh user@server
cd /opt/codeb/$project_name
\`\`\`

### 3. 설치 실행
\`\`\`bash
./setup.sh
\`\`\`

### 4. 관리 명령어
- 시작: \`./start.sh\`
- 중지: \`./stop.sh\`
- 상태: \`./status.sh\`
- 백업: \`./backup.sh\`

### 5. 애플리케이션 연결
.env.server 파일의 정보를 사용하여 애플리케이션을 설정하세요.

### 보안 주의사항
- 방화벽에서 필요한 포트만 열기
- PostgreSQL과 Redis는 localhost만 접근 가능하도록 설정됨
- 비밀번호는 .env.server에 저장됨 (권한 관리 필요)
EOF
}

# 서버에 배포
cmd_server_deploy() {
    local server_host=$1
    local server_user=${2:-root}
    local project_name=${3:-$(basename "$PWD")}
    local deploy_path="/opt/codeb/$project_name"
    
    if [ -z "$server_host" ]; then
        log_error "사용법: codeb server deploy <서버주소> [사용자] [프로젝트명]"
        return 1
    fi
    
    if [ ! -d "deploy" ]; then
        log_error "deploy 디렉토리가 없습니다. 먼저 'codeb server prepare'를 실행하세요."
        return 1
    fi
    
    log_header "📦 서버 배포: $server_user@$server_host"
    
    # SSH 연결 테스트
    log_info "SSH 연결 테스트..."
    if ! ssh -o ConnectTimeout=5 "$server_user@$server_host" "echo '연결 성공'" &> /dev/null; then
        log_error "SSH 연결 실패. SSH 키 또는 비밀번호 설정을 확인하세요."
        return 1
    fi
    log_success "SSH 연결 성공"
    
    # 서버에 디렉토리 생성
    log_info "서버에 디렉토리 생성..."
    ssh "$server_user@$server_host" "mkdir -p $deploy_path"
    
    # 파일 전송
    log_info "파일 전송 중..."
    scp -r deploy/* "$server_user@$server_host:$deploy_path/"
    
    # init 디렉토리 복사 (있는 경우)
    if [ -d "podman/init" ]; then
        log_info "초기화 SQL 전송..."
        scp -r podman/init "$server_user@$server_host:$deploy_path/"
    fi
    
    log_success "배포 완료!"
    echo ""
    echo "📋 다음 단계:"
    echo "  1. ssh $server_user@$server_host"
    echo "  2. cd $deploy_path"
    echo "  3. ./setup.sh"
    echo ""
    echo "또는 원격 실행:"
    echo "  codeb server setup $server_host"
}

# 원격 서버 설정 실행
cmd_server_setup() {
    local server_host=$1
    local server_user=${2:-root}
    local project_name=${3:-$(basename "$PWD")}
    local deploy_path="/opt/codeb/$project_name"
    
    if [ -z "$server_host" ]; then
        log_error "사용법: codeb server setup <서버주소> [사용자] [프로젝트명]"
        return 1
    fi
    
    log_header "⚙️ 원격 서버 설정 실행"
    
    # 원격으로 setup.sh 실행
    log_info "서버에서 설치 스크립트 실행..."
    ssh -t "$server_user@$server_host" "cd $deploy_path && ./setup.sh"
    
    log_success "서버 설정 완료!"
}

# 원격 서버 상태 확인
cmd_server_status() {
    local server_host=$1
    local server_user=${2:-root}
    local project_name=${3:-$(basename "$PWD")}
    local deploy_path="/opt/codeb/$project_name"
    
    if [ -z "$server_host" ]; then
        log_error "사용법: codeb server status <서버주소> [사용자] [프로젝트명]"
        return 1
    fi
    
    log_header "📊 원격 서버 상태"
    
    ssh "$server_user@$server_host" "cd $deploy_path && ./status.sh"
}

# 원격 서버 시작
cmd_server_start() {
    local server_host=$1
    local server_user=${2:-root}
    local project_name=${3:-$(basename "$PWD")}
    local deploy_path="/opt/codeb/$project_name"
    
    if [ -z "$server_host" ]; then
        log_error "사용법: codeb server start <서버주소> [사용자] [프로젝트명]"
        return 1
    fi
    
    log_header "▶️ 원격 서버 컨테이너 시작"
    
    ssh "$server_user@$server_host" "cd $deploy_path && ./start.sh"
    
    log_success "컨테이너 시작됨"
}

# 원격 서버 중지
cmd_server_stop() {
    local server_host=$1
    local server_user=${2:-root}
    local project_name=${3:-$(basename "$PWD")}
    local deploy_path="/opt/codeb/$project_name"
    
    if [ -z "$server_host" ]; then
        log_error "사용법: codeb server stop <서버주소> [사용자] [프로젝트명]"
        return 1
    fi
    
    log_header "⏹️ 원격 서버 컨테이너 중지"
    
    ssh "$server_user@$server_host" "cd $deploy_path && ./stop.sh"
    
    log_success "컨테이너 중지됨"
}

# 원격 서버 백업
cmd_server_backup() {
    local server_host=$1
    local server_user=${2:-root}
    local project_name=${3:-$(basename "$PWD")}
    local deploy_path="/opt/codeb/$project_name"
    
    if [ -z "$server_host" ]; then
        log_error "사용법: codeb server backup <서버주소> [사용자] [프로젝트명]"
        return 1
    fi
    
    log_header "💾 원격 서버 백업"
    
    # 원격 백업 실행
    log_info "데이터베이스 백업 중..."
    ssh "$server_user@$server_host" "cd $deploy_path && ./backup.sh"
    
    # 백업 파일 다운로드 (선택사항)
    if confirm_action "백업 파일을 로컬로 다운로드하시겠습니까?" "Y"; then
        local backup_dir="./backups/$(date +%Y%m%d)"
        mkdir -p "$backup_dir"
        
        log_info "백업 파일 다운로드 중..."
        scp "$server_user@$server_host:$deploy_path/backups/*.sql" "$backup_dir/"
        
        log_success "백업 파일이 $backup_dir에 저장되었습니다."
    fi
}

# 서버 환경 정보 표시
cmd_server_info() {
    local server_host=$1
    local server_user=${2:-root}
    local project_name=${3:-$(basename "$PWD")}
    local deploy_path="/opt/codeb/$project_name"
    
    if [ -z "$server_host" ]; then
        if [ -f "deploy/.env.server" ]; then
            log_header "📋 로컬 배포 패키지 정보"
            echo ""
            cat deploy/.env.server
            echo ""
            echo "배포 대상 서버를 지정하려면:"
            echo "  codeb server info <서버주소>"
        else
            log_error "배포 패키지가 없습니다. 'codeb server prepare'를 먼저 실행하세요."
        fi
        return
    fi
    
    log_header "📋 서버 환경 정보"
    echo "• 서버: $server_user@$server_host"
    echo "• 경로: $deploy_path"
    echo ""
    
    # 원격 환경 변수 표시
    ssh "$server_user@$server_host" "cat $deploy_path/.env.server 2>/dev/null" || \
        log_warn "서버에 배포되지 않았거나 접근 권한이 없습니다."
}