#!/bin/bash
#
# CodeB 자동 백업 Cron 설정 스크립트
#
# 실행: bash setup-backup-cron.sh
#
# 이 스크립트는 다음을 설정합니다:
# 1. PostgreSQL 일일 백업 (새벽 2시)
# 2. 오래된 백업 자동 삭제 (7일)
# 3. 디스크 용량 모니터링

set -e

echo "🕐 CodeB 자동 백업 Cron 설정 시작..."

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 변수
BACKUP_DIR="/opt/codeb/backup"
SCRIPTS_DIR="/opt/codeb/scripts"
RETENTION_DAYS=7
POSTGRES_CONTAINER="codeb-postgres"
POSTGRES_DB="codeb"
POSTGRES_USER="codeb"

# 디렉토리 생성
mkdir -p "$BACKUP_DIR"
mkdir -p "$SCRIPTS_DIR"

# =====================================================
# 백업 스크립트 생성
# =====================================================
cat > "$SCRIPTS_DIR/daily-backup.sh" << 'BACKUPEOF'
#!/bin/bash
#
# CodeB 일일 백업 스크립트
# Cron에 의해 자동 실행됨

set -e

# 변수
BACKUP_DIR="/opt/codeb/backup"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/$TIMESTAMP"
LOG_FILE="/opt/codeb/logs/backup.log"

# 로그 함수
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "========== 백업 시작 =========="

# 백업 디렉토리 생성
mkdir -p "$BACKUP_PATH"

# PostgreSQL 백업
log "PostgreSQL 백업 중..."
if podman inspect codeb-postgres &>/dev/null; then
    if podman exec codeb-postgres pg_dump -U codeb codeb 2>/dev/null | gzip > "$BACKUP_PATH/postgres_codeb.sql.gz"; then
        log "✅ PostgreSQL 백업 완료: $(du -h "$BACKUP_PATH/postgres_codeb.sql.gz" | cut -f1)"
    else
        log "❌ PostgreSQL 백업 실패"
    fi
else
    log "⚠️ PostgreSQL 컨테이너 없음, 건너뜀"
fi

# Redis 백업 (선택적)
log "Redis 백업 중..."
if podman inspect codeb-redis &>/dev/null; then
    podman exec codeb-redis redis-cli BGSAVE 2>/dev/null || true
    sleep 3
    if [ -f /opt/codeb/data/redis/dump.rdb ]; then
        cp /opt/codeb/data/redis/dump.rdb "$BACKUP_PATH/redis_dump.rdb"
        log "✅ Redis 백업 완료"
    fi
else
    log "⚠️ Redis 컨테이너 없음, 건너뜀"
fi

# 설정 파일 백업
log "설정 파일 백업 중..."
tar -czf "$BACKUP_PATH/config_backup.tar.gz" \
    /opt/codeb/config \
    /etc/caddy/Caddyfile 2>/dev/null || true
log "✅ 설정 백업 완료"

# 오래된 백업 삭제
log "오래된 백업 정리 중..."
find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +$RETENTION_DAYS -exec rm -rf {} \; 2>/dev/null
DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +$RETENTION_DAYS | wc -l)
log "🧹 $DELETED개의 오래된 백업 삭제됨"

# 백업 크기 확인
BACKUP_SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)

log "========== 백업 완료 =========="
log "📦 현재 백업: $BACKUP_SIZE"
log "💾 총 백업 용량: $TOTAL_SIZE"
log "📁 위치: $BACKUP_PATH"

# 디스크 용량 경고
DISK_USAGE=$(df /opt/codeb | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$DISK_USAGE" -gt 80 ]; then
    log "⚠️ 경고: 디스크 사용량 ${DISK_USAGE}% (80% 초과)"
fi

log ""
BACKUPEOF

chmod +x "$SCRIPTS_DIR/daily-backup.sh"
echo -e "${GREEN}✅ 백업 스크립트 생성됨: $SCRIPTS_DIR/daily-backup.sh${NC}"

# =====================================================
# 디스크 모니터링 스크립트 생성
# =====================================================
cat > "$SCRIPTS_DIR/check-disk.sh" << 'DISKEOF'
#!/bin/bash
#
# 디스크 용량 모니터링 스크립트

THRESHOLD_WARNING=80
THRESHOLD_CRITICAL=90

DISK_USAGE=$(df /opt/codeb | awk 'NR==2 {print $5}' | tr -d '%')

if [ "$DISK_USAGE" -gt "$THRESHOLD_CRITICAL" ]; then
    echo "🚨 CRITICAL: 디스크 사용량 ${DISK_USAGE}%"
    # 여기에 알림 로직 추가 (Slack, Email 등)
    exit 2
elif [ "$DISK_USAGE" -gt "$THRESHOLD_WARNING" ]; then
    echo "⚠️ WARNING: 디스크 사용량 ${DISK_USAGE}%"
    exit 1
else
    echo "✅ OK: 디스크 사용량 ${DISK_USAGE}%"
    exit 0
fi
DISKEOF

chmod +x "$SCRIPTS_DIR/check-disk.sh"
echo -e "${GREEN}✅ 디스크 모니터링 스크립트 생성됨: $SCRIPTS_DIR/check-disk.sh${NC}"

# =====================================================
# Cron 작업 추가
# =====================================================
echo "📅 Cron 작업 설정 중..."

# 기존 CodeB cron 제거
crontab -l 2>/dev/null | grep -v "codeb" | grep -v "daily-backup" | grep -v "check-disk" > /tmp/crontab.tmp || true

# 새 cron 작업 추가
cat >> /tmp/crontab.tmp << 'CRONEOF'
# CodeB 자동 백업 (매일 새벽 2시)
0 2 * * * /opt/codeb/scripts/daily-backup.sh >> /opt/codeb/logs/backup.log 2>&1

# CodeB 디스크 모니터링 (매 6시간)
0 */6 * * * /opt/codeb/scripts/check-disk.sh >> /opt/codeb/logs/disk-check.log 2>&1
CRONEOF

# Cron 설치
crontab /tmp/crontab.tmp
rm /tmp/crontab.tmp

echo -e "${GREEN}✅ Cron 작업 설정 완료${NC}"

# =====================================================
# 로그 디렉토리 생성
# =====================================================
mkdir -p /opt/codeb/logs
touch /opt/codeb/logs/backup.log
touch /opt/codeb/logs/disk-check.log

# =====================================================
# 완료
# =====================================================
echo ""
echo -e "${GREEN}🎉 자동 백업 설정 완료!${NC}"
echo ""
echo "📋 설정된 Cron 작업:"
crontab -l | grep -E "(codeb|backup|disk)" || echo "  (없음)"
echo ""
echo "📁 스크립트 위치:"
echo "  - 백업: $SCRIPTS_DIR/daily-backup.sh"
echo "  - 디스크 체크: $SCRIPTS_DIR/check-disk.sh"
echo ""
echo "📊 로그 위치:"
echo "  - 백업 로그: /opt/codeb/logs/backup.log"
echo "  - 디스크 로그: /opt/codeb/logs/disk-check.log"
echo ""
echo "🧪 수동 테스트:"
echo "  bash $SCRIPTS_DIR/daily-backup.sh"
echo "  bash $SCRIPTS_DIR/check-disk.sh"
