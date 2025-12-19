#!/bin/bash

# CodeB CLI v3.5 - Podman 컨테이너 관리 모듈
# 로컬 개발 환경용 PostgreSQL/Redis 컨테이너 관리

# Podman/Docker 감지
detect_container_runtime() {
    if command -v podman &> /dev/null; then
        echo "podman"
    elif command -v docker &> /dev/null; then
        echo "docker"
    else
        log_error "Podman 또는 Docker가 설치되지 않았습니다."
        exit 1
    fi
}

CONTAINER_RUNTIME=$(detect_container_runtime)
COMPOSE_CMD="${CONTAINER_RUNTIME}-compose"

# Docker Compose도 지원
if [ "$CONTAINER_RUNTIME" = "docker" ] && ! command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker compose"
fi

# Podman 환경 초기화
cmd_podman_init() {
    local project_name=$1
    local db_type=${2:-postgresql}
    local cache_type=${3:-redis}
    
    log_info "Podman 환경 초기화: $project_name"
    
    # podman 디렉토리 생성
    mkdir -p podman/{data,scripts,init}
    
    # Docker Compose 파일 생성
    generate_docker_compose "$db_type" "$cache_type"
    
    # 스크립트 생성
    generate_podman_scripts
    
    # 초기화 SQL 생성 (PostgreSQL인 경우)
    if [ "$db_type" = "postgresql" ]; then
        generate_init_sql "$project_name"
    fi
    
    log_success "Podman 환경 초기화 완료!"
}

# Docker Compose 파일 생성
generate_docker_compose() {
    local db_type=$1
    local cache_type=$2
    
    cat > podman/docker-compose.yml << 'EOF'
version: '3.8'

services:
EOF

    # PostgreSQL 서비스 추가
    if [ "$db_type" = "postgresql" ]; then
        cat >> podman/docker-compose.yml << 'EOF'
  postgres:
    image: postgres:15-alpine
    container_name: codeb-postgres
    environment:
      POSTGRES_DB: codeb_dev
      POSTGRES_USER: codeb
      POSTGRES_PASSWORD: codeb123
      PGDATA: /var/lib/postgresql/data
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
    networks:
      - codeb-network

EOF
    elif [ "$db_type" = "mysql" ]; then
        cat >> podman/docker-compose.yml << 'EOF'
  mysql:
    image: mysql:8.0-debian
    container_name: codeb-mysql
    environment:
      MYSQL_ROOT_PASSWORD: root123
      MYSQL_DATABASE: codeb_dev
      MYSQL_USER: codeb
      MYSQL_PASSWORD: codeb123
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./init:/docker-entrypoint-initdb.d
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - codeb-network

EOF
    fi

    # Redis 서비스 추가
    if [ "$cache_type" = "redis" ]; then
        cat >> podman/docker-compose.yml << 'EOF'
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
    networks:
      - codeb-network

EOF
    elif [ "$cache_type" = "memcached" ]; then
        cat >> podman/docker-compose.yml << 'EOF'
  memcached:
    image: memcached:1.6-alpine
    container_name: codeb-memcached
    ports:
      - "11211:11211"
    restart: unless-stopped
    networks:
      - codeb-network

EOF
    fi

    # 볼륨과 네트워크 정의
    cat >> podman/docker-compose.yml << 'EOF'
volumes:
EOF

    if [ "$db_type" = "postgresql" ]; then
        echo "  postgres_data:" >> podman/docker-compose.yml
    elif [ "$db_type" = "mysql" ]; then
        echo "  mysql_data:" >> podman/docker-compose.yml
    fi

    if [ "$cache_type" = "redis" ]; then
        echo "  redis_data:" >> podman/docker-compose.yml
    fi

    cat >> podman/docker-compose.yml << 'EOF'

networks:
  codeb-network:
    driver: bridge
EOF
}

# Podman 스크립트 생성
generate_podman_scripts() {
    # 시작 스크립트
    cat > podman/start.sh << EOF
#!/bin/bash

echo "🚀 CodeB 로컬 개발 환경 시작..."
cd "$(dirname "\$0")"

# 컨테이너 시작
$COMPOSE_CMD up -d

# 상태 확인
echo "⏳ 컨테이너 상태 확인 중..."
sleep 5

if $COMPOSE_CMD ps | grep -q "Up\|running"; then
    echo "✅ 컨테이너가 성공적으로 시작되었습니다!"
    echo ""
    echo "📋 연결 정보:"
    $COMPOSE_CMD ps
    echo ""
    if [ -f docker-compose.yml ] && grep -q postgres docker-compose.yml; then
        echo "   PostgreSQL: localhost:5432 (codeb/codeb123)"
    fi
    if [ -f docker-compose.yml ] && grep -q mysql docker-compose.yml; then
        echo "   MySQL: localhost:3306 (codeb/codeb123)"
    fi
    if [ -f docker-compose.yml ] && grep -q redis docker-compose.yml; then
        echo "   Redis: localhost:6379 (비밀번호: codeb123)"
    fi
    if [ -f docker-compose.yml ] && grep -q memcached docker-compose.yml; then
        echo "   Memcached: localhost:11211"
    fi
else
    echo "❌ 컨테이너 시작에 실패했습니다."
    $COMPOSE_CMD logs
fi
EOF
    chmod +x podman/start.sh

    # 중지 스크립트
    cat > podman/stop.sh << EOF
#!/bin/bash

echo "🛑 CodeB 로컬 개발 환경 중지..."
cd "$(dirname "\$0")"
$COMPOSE_CMD down
echo "✅ 환경이 중지되었습니다."
EOF
    chmod +x podman/stop.sh

    # 리셋 스크립트
    cat > podman/reset.sh << EOF
#!/bin/bash

echo "🔄 CodeB 로컬 환경 초기화..."
cd "$(dirname "\$0")"
$COMPOSE_CMD down -v
$COMPOSE_CMD up -d
echo "✅ 환경이 초기화되었습니다."
EOF
    chmod +x podman/reset.sh

    # 로그 확인 스크립트
    cat > podman/logs.sh << EOF
#!/bin/bash

cd "$(dirname "\$0")"
$COMPOSE_CMD logs -f \$@
EOF
    chmod +x podman/logs.sh

    # 상태 확인 스크립트
    cat > podman/status.sh << EOF
#!/bin/bash

echo "📊 CodeB 컨테이너 상태"
cd "$(dirname "\$0")"
$COMPOSE_CMD ps
EOF
    chmod +x podman/status.sh
}

# 초기화 SQL 생성
generate_init_sql() {
    local project_name=$1
    
    cat > podman/init/01-init.sql << EOF
-- CodeB 개발 환경 초기화 SQL
-- 프로젝트: $project_name

-- 확장 기능 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 기본 스키마 생성
CREATE SCHEMA IF NOT EXISTS app;

-- 샘플 테이블 (필요에 따라 수정)
CREATE TABLE IF NOT EXISTS app.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스
CREATE INDEX idx_projects_name ON app.projects(name);
CREATE INDEX idx_projects_created_at ON app.projects(created_at);

-- 권한 설정
GRANT ALL ON SCHEMA app TO codeb;
GRANT ALL ON ALL TABLES IN SCHEMA app TO codeb;

-- 초기 데이터 (옵션)
INSERT INTO app.projects (name, description) VALUES
    ('$project_name', 'CodeB v3.5 프로젝트')
ON CONFLICT DO NOTHING;
EOF
}

# 컨테이너 시작
cmd_podman_start() {
    if [ ! -f "podman/docker-compose.yml" ]; then
        log_error "Podman 환경이 초기화되지 않았습니다."
        echo "먼저 'codeb local init'을 실행하세요."
        return 1
    fi
    
    log_info "Podman 컨테이너 시작..."
    ./podman/start.sh
}

# 컨테이너 중지
cmd_podman_stop() {
    if [ ! -f "podman/docker-compose.yml" ]; then
        log_error "Podman 환경이 초기화되지 않았습니다."
        return 1
    fi
    
    log_info "Podman 컨테이너 중지..."
    ./podman/stop.sh
}

# 컨테이너 리셋
cmd_podman_reset() {
    if [ ! -f "podman/docker-compose.yml" ]; then
        log_error "Podman 환경이 초기화되지 않았습니다."
        return 1
    fi
    
    log_info "Podman 환경 리셋..."
    ./podman/reset.sh
}

# 컨테이너 상태
cmd_podman_status() {
    if [ ! -f "podman/docker-compose.yml" ]; then
        log_error "Podman 환경이 초기화되지 않았습니다."
        return 1
    fi
    
    ./podman/status.sh
}

# 컨테이너 로그
cmd_podman_logs() {
    if [ ! -f "podman/docker-compose.yml" ]; then
        log_error "Podman 환경이 초기화되지 않았습니다."
        return 1
    fi
    
    ./podman/logs.sh "$@"
}

# 데이터베이스 접속
cmd_podman_db_connect() {
    local db_type=${1:-postgresql}
    
    if [ ! -f "podman/docker-compose.yml" ]; then
        log_error "Podman 환경이 초기화되지 않았습니다."
        return 1
    fi
    
    if [ "$db_type" = "postgresql" ]; then
        log_info "PostgreSQL 접속..."
        $CONTAINER_RUNTIME exec -it codeb-postgres psql -U codeb -d codeb_dev
    elif [ "$db_type" = "mysql" ]; then
        log_info "MySQL 접속..."
        $CONTAINER_RUNTIME exec -it codeb-mysql mysql -u codeb -pcodeb123 codeb_dev
    else
        log_error "지원하지 않는 데이터베이스 타입: $db_type"
        return 1
    fi
}

# Redis CLI 접속
cmd_podman_redis_cli() {
    if [ ! -f "podman/docker-compose.yml" ]; then
        log_error "Podman 환경이 초기화되지 않았습니다."
        return 1
    fi
    
    log_info "Redis CLI 접속..."
    $CONTAINER_RUNTIME exec -it codeb-redis redis-cli -a codeb123
}