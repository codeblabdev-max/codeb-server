#!/bin/bash

# Vultr 서버 1 자동 백업 스크립트
# 실행 위치: 서버 1 (141.164.60.51)
# 용도: Docker 컨테이너, PostgreSQL DB, Coolify 설정 백업

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 백업 설정
BACKUP_DIR="/mnt/blockstorage/backups/daily"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7
LOG_FILE="/mnt/blockstorage/logs/backup_${DATE}.log"

# 로그 디렉토리 생성
mkdir -p /mnt/blockstorage/logs

# 로그 함수
log_message() {
    echo -e "${1}" | tee -a $LOG_FILE
}

# 백업 시작
log_message "${GREEN}=== 백업 시작: $(date) ===${NC}"

# 1. Block Storage 마운트 확인
if ! mountpoint -q /mnt/blockstorage; then
    log_message "${RED}❌ Block Storage가 마운트되지 않았습니다!${NC}"
    exit 1
fi

# 2. 백업 디렉토리 생성
mkdir -p $BACKUP_DIR
mkdir -p /mnt/blockstorage/backups/{weekly,monthly}

# 3. PostgreSQL 데이터베이스 백업
log_message "${YELLOW}PostgreSQL 백업 시작...${NC}"
for container in $(docker ps --format '{{.Names}}' | grep -E 'postgres|postgresql'); do
    if [ ! -z "$container" ]; then
        log_message "  - $container 백업 중..."
        docker exec $container pg_dumpall -U postgres 2>/dev/null | \
        gzip > $BACKUP_DIR/postgres_${container}_${DATE}.sql.gz
        
        if [ $? -eq 0 ]; then
            log_message "${GREEN}  ✅ $container 백업 완료${NC}"
        else
            log_message "${RED}  ❌ $container 백업 실패${NC}"
        fi
    fi
done

# 4. MySQL/MariaDB 데이터베이스 백업
log_message "${YELLOW}MySQL/MariaDB 백업 시작...${NC}"
for container in $(docker ps --format '{{.Names}}' | grep -E 'mysql|mariadb'); do
    if [ ! -z "$container" ]; then
        log_message "  - $container 백업 중..."
        docker exec $container mysqldump --all-databases -u root 2>/dev/null | \
        gzip > $BACKUP_DIR/mysql_${container}_${DATE}.sql.gz
        
        if [ $? -eq 0 ]; then
            log_message "${GREEN}  ✅ $container 백업 완료${NC}"
        else
            log_message "${RED}  ❌ $container 백업 실패${NC}"
        fi
    fi
done

# 5. Docker 볼륨 백업 (중요 볼륨만)
log_message "${YELLOW}Docker 볼륨 백업 시작...${NC}"
IMPORTANT_VOLUMES=$(docker volume ls -q | grep -E 'coolify|data|config|backup')
if [ ! -z "$IMPORTANT_VOLUMES" ]; then
    docker run --rm \
        -v /var/lib/docker/volumes:/source:ro \
        -v $BACKUP_DIR:/backup \
        alpine tar czf /backup/docker_volumes_${DATE}.tar.gz \
        $(echo $IMPORTANT_VOLUMES | sed 's/^/-C \/source /' | xargs) 2>/dev/null
    
    if [ $? -eq 0 ]; then
        log_message "${GREEN}✅ Docker 볼륨 백업 완료${NC}"
    else
        log_message "${YELLOW}⚠️ Docker 볼륨 백업 부분 실패${NC}"
    fi
fi

# 6. Coolify 설정 백업
log_message "${YELLOW}Coolify 설정 백업 시작...${NC}"
if [ -d "/root/coolify" ]; then
    tar czf $BACKUP_DIR/coolify_config_${DATE}.tar.gz \
        /root/coolify/.env \
        /root/coolify/docker-compose.yml \
        /root/coolify/docker-compose.prod.yml 2>/dev/null
    
    if [ $? -eq 0 ]; then
        log_message "${GREEN}✅ Coolify 설정 백업 완료${NC}"
    else
        log_message "${YELLOW}⚠️ 일부 Coolify 설정 파일 누락${NC}"
    fi
fi

# 7. 시스템 설정 백업
log_message "${YELLOW}시스템 설정 백업 시작...${NC}"
tar czf $BACKUP_DIR/system_config_${DATE}.tar.gz \
    /etc/nginx \
    /etc/ssh/sshd_config \
    /etc/crontab \
    /root/.bashrc \
    /root/.ssh/authorized_keys 2>/dev/null

if [ $? -eq 0 ]; then
    log_message "${GREEN}✅ 시스템 설정 백업 완료${NC}"
fi

# 8. 오래된 백업 삭제
log_message "${YELLOW}오래된 백업 정리 중...${NC}"
find $BACKUP_DIR -type f -mtime +$RETENTION_DAYS -delete
DELETED_COUNT=$(find $BACKUP_DIR -type f -mtime +$RETENTION_DAYS | wc -l)
log_message "  - ${DELETED_COUNT}개 파일 삭제됨"

# 9. 주간 백업 (일요일)
if [ $(date +%u) -eq 7 ]; then
    log_message "${BLUE}주간 백업 생성 중...${NC}"
    cp $BACKUP_DIR/*_${DATE}.* /mnt/blockstorage/backups/weekly/ 2>/dev/null
    # 30일 이상 된 주간 백업 삭제
    find /mnt/blockstorage/backups/weekly -type f -mtime +30 -delete
fi

# 10. 월간 백업 (매월 1일)
if [ $(date +%d) -eq 01 ]; then
    log_message "${BLUE}월간 백업 생성 중...${NC}"
    cp $BACKUP_DIR/*_${DATE}.* /mnt/blockstorage/backups/monthly/ 2>/dev/null
    # 180일 이상 된 월간 백업 삭제
    find /mnt/blockstorage/backups/monthly -type f -mtime +180 -delete
fi

# 11. 백업 통계
BACKUP_SIZE=$(du -sh $BACKUP_DIR | cut -f1)
BACKUP_COUNT=$(ls -1 $BACKUP_DIR | wc -l)
STORAGE_USAGE=$(df -h /mnt/blockstorage | tail -1 | awk '{print $5}')

log_message "${GREEN}=== 백업 완료: $(date) ===${NC}"
log_message "📊 백업 통계:"
log_message "  - 백업 디렉토리 크기: $BACKUP_SIZE"
log_message "  - 백업 파일 개수: $BACKUP_COUNT"
log_message "  - Storage 사용률: $STORAGE_USAGE"

# 12. 백업 실패 시 알림 (선택사항)
if grep -q "❌" $LOG_FILE; then
    log_message "${RED}⚠️ 일부 백업이 실패했습니다. 로그를 확인하세요.${NC}"
    exit 1
fi

exit 0