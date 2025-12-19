#!/bin/bash

# 백업 시스템 배포 스크립트
# 안전하게 백업 스크립트를 서버에 배포

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SERVER_IP="141.164.60.51"
SCRIPT_DIR="/Users/admin/new_project/codeb-server/scripts"

# 로그 함수
log_message() {
    echo -e "${1}" | tee -a deploy.log
}

# 백업 스크립트 배포
deploy_backup_scripts() {
    log_message "${YELLOW}백업 스크립트 배포 중...${NC}"
    
    # 자동 백업 스크립트 전송
    scp "$SCRIPT_DIR/backup/auto-backup.sh" root@$SERVER_IP:/usr/local/bin/
    
    # 복원 스크립트 전송
    scp "$SCRIPT_DIR/backup/restore-backup.sh" root@$SERVER_IP:/usr/local/bin/
    
    # 권한 설정
    ssh root@$SERVER_IP << 'EOF'
chmod +x /usr/local/bin/auto-backup.sh
chmod +x /usr/local/bin/restore-backup.sh

echo "✅ 백업 스크립트 권한 설정 완료"
EOF
}

# 백업 테스트 실행
test_backup_script() {
    log_message "${YELLOW}백업 스크립트 테스트 실행...${NC}"
    
    ssh root@$SERVER_IP << 'EOF'
echo "=== 백업 스크립트 테스트 시작 ==="

# 테스트 백업 실행
/usr/local/bin/auto-backup.sh

# 백업 결과 확인
if [ $? -eq 0 ]; then
    echo "✅ 백업 스크립트 테스트 성공"
    
    echo "=== 생성된 백업 파일 ==="
    ls -la /mnt/blockstorage/backups/daily/ | tail -10
    
    echo "=== 백업 로그 ==="
    tail -20 /mnt/blockstorage/logs/backup_*.log | tail -10
else
    echo "❌ 백업 스크립트 테스트 실패"
    exit 1
fi
EOF
}

# 백업 복원 스크립트 테스트
test_restore_script() {
    log_message "${YELLOW}복원 스크립트 테스트...${NC}"
    
    ssh root@$SERVER_IP << 'EOF'
echo "=== 복원 스크립트 테스트 ==="

# 백업 목록 확인
/usr/local/bin/restore-backup.sh --list

if [ $? -eq 0 ]; then
    echo "✅ 복원 스크립트 정상 작동"
else
    echo "❌ 복원 스크립트 오류"
fi
EOF
}

# Cron 작업 설정
setup_cron_jobs() {
    log_message "${YELLOW}Cron 작업 설정 중...${NC}"
    
    ssh root@$SERVER_IP << 'EOF'
# 기존 백업 cron 제거
crontab -l 2>/dev/null | grep -v "auto-backup.sh" | crontab -

# 새로운 cron 작업 추가
(crontab -l 2>/dev/null; echo "# 매일 새벽 3시 자동 백업") | crontab -
(crontab -l 2>/dev/null; echo "0 3 * * * /usr/local/bin/auto-backup.sh >> /mnt/blockstorage/logs/cron.log 2>&1") | crontab -

# 주간 백업 정리 (매주 일요일 새벽 4시)
(crontab -l 2>/dev/null; echo "# 주간 백업 정리") | crontab -
(crontab -l 2>/dev/null; echo "0 4 * * 0 find /mnt/blockstorage/backups/weekly -mtime +30 -delete") | crontab -

# 월간 백업 정리 (매월 1일 새벽 5시)
(crontab -l 2>/dev/null; echo "# 월간 백업 정리") | crontab -
(crontab -l 2>/dev/null; echo "0 5 1 * * find /mnt/blockstorage/backups/monthly -mtime +180 -delete") | crontab -

echo "=== 설정된 Cron 작업 ==="
crontab -l

# Cron 서비스 상태 확인
systemctl status cron --no-pager
echo "✅ Cron 작업 설정 완료"
EOF
}

# 모니터링 스크립트 설치
install_monitoring() {
    log_message "${YELLOW}모니터링 스크립트 설치 중...${NC}"
    
    ssh root@$SERVER_IP << 'EOF'
# 디스크 사용량 모니터링 스크립트 생성
cat > /usr/local/bin/check-backup-storage.sh << 'SCRIPT_EOF'
#!/bin/bash

# Block Storage 사용량 체크
USAGE=$(df -h /mnt/blockstorage | tail -1 | awk '{print $5}' | sed 's/%//')
DATE=$(date)

if [ $USAGE -gt 80 ]; then
    echo "[$DATE] 경고: Block Storage 사용률이 ${USAGE}%입니다!" >> /mnt/blockstorage/logs/storage-alerts.log
    
    # 오래된 백업 자동 정리
    find /mnt/blockstorage/backups/daily -type f -mtime +5 -delete
    echo "[$DATE] 자동 정리: 5일 이상 된 daily 백업 삭제" >> /mnt/blockstorage/logs/storage-alerts.log
fi

# 사용량 로그 기록
echo "[$DATE] Storage Usage: ${USAGE}%" >> /mnt/blockstorage/logs/storage-usage.log
SCRIPT_EOF

chmod +x /usr/local/bin/check-backup-storage.sh

# 매시간 스토리지 체크 cron 추가
(crontab -l 2>/dev/null; echo "# 매시간 스토리지 사용량 체크") | crontab -
(crontab -l 2>/dev/null; echo "0 * * * * /usr/local/bin/check-backup-storage.sh") | crontab -

echo "✅ 모니터링 스크립트 설치 완료"
EOF
}

# 백업 상태 체크 스크립트
create_status_script() {
    ssh root@$SERVER_IP << 'EOF'
# 백업 상태 확인 스크립트 생성
cat > /usr/local/bin/backup-status.sh << 'SCRIPT_EOF'
#!/bin/bash

echo "=== 백업 시스템 상태 ==="
echo "현재 시간: $(date)"
echo ""

echo "=== Block Storage 상태 ==="
df -h /mnt/blockstorage
echo ""

echo "=== 최근 백업 파일 (5개) ==="
ls -lt /mnt/blockstorage/backups/daily/ | head -6
echo ""

echo "=== 백업 크기 통계 ==="
du -sh /mnt/blockstorage/backups/*
echo ""

echo "=== 최근 백업 로그 ==="
if ls /mnt/blockstorage/logs/backup_*.log 1> /dev/null 2>&1; then
    tail -10 $(ls -t /mnt/blockstorage/logs/backup_*.log | head -1)
else
    echo "백업 로그가 없습니다."
fi
echo ""

echo "=== Cron 작업 상태 ==="
crontab -l | grep -E "(backup|storage)"
SCRIPT_EOF

chmod +x /usr/local/bin/backup-status.sh
echo "✅ 상태 확인 스크립트 생성 완료"
EOF
}

# 메인 실행
main() {
    log_message "${GREEN}=== 백업 시스템 배포 시작 ===${NC}"
    
    # 1. 백업 스크립트 배포
    deploy_backup_scripts
    
    # 2. 백업 테스트
    test_backup_script
    
    # 3. 복원 스크립트 테스트
    test_restore_script
    
    # 4. Cron 작업 설정
    setup_cron_jobs
    
    # 5. 모니터링 설치
    install_monitoring
    
    # 6. 상태 확인 스크립트 생성
    create_status_script
    
    log_message "${GREEN}=== 백업 시스템 배포 완료 ===${NC}"
    log_message "${BLUE}백업 상태 확인: ssh root@$SERVER_IP '/usr/local/bin/backup-status.sh'${NC}"
}

# 스크립트 실행
main "$@"