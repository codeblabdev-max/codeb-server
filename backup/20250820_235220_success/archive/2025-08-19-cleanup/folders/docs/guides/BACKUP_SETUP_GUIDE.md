# 📚 서버 1 백업 자동화 설정 가이드

## 🎯 현재 상태
- ✅ Block Storage 생성 완료 (100GB)
- ✅ 서버 1에 연결 완료
- ⏳ 마운트 및 자동 백업 설정 필요

## 📋 설정 단계

### 1. 서버 접속
```bash
ssh root@141.164.60.51
```

### 2. Block Storage 마운트 확인 및 설정
```bash
# 디바이스 확인
lsblk

# 출력 예시:
# NAME    MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT
# vda     252:0    0  100G  0 disk
# └─vda1  252:1    0  100G  0 part /
# vdb     252:16   0  100G  0 disk  <-- 이것이 Block Storage

# 파일시스템 생성 (처음 한 번만)
mkfs.ext4 /dev/vdb

# 마운트 포인트 생성
mkdir -p /mnt/blockstorage

# 마운트
mount /dev/vdb /mnt/blockstorage

# 자동 마운트 설정
echo '/dev/vdb /mnt/blockstorage ext4 defaults,nofail 0 0' >> /etc/fstab

# 마운트 확인
df -h /mnt/blockstorage
```

### 3. 백업 디렉토리 구조 생성
```bash
# 백업 디렉토리 구조 생성
mkdir -p /mnt/blockstorage/{backups,docker-volumes,logs,snapshots}
mkdir -p /mnt/blockstorage/backups/{daily,weekly,monthly}

# 권한 설정
chmod 755 /mnt/blockstorage
chmod 755 /mnt/blockstorage/*
```

### 4. 백업 스크립트 설치
```bash
# 백업 스크립트 다운로드 또는 생성
cat > /usr/local/bin/auto-backup.sh << 'EOF'
[여기에 auto-backup.sh 내용 붙여넣기]
EOF

# 실행 권한 부여
chmod +x /usr/local/bin/auto-backup.sh

# 복원 스크립트도 설치
cat > /usr/local/bin/restore-backup.sh << 'EOF'
[여기에 restore-backup.sh 내용 붙여넣기]
EOF

chmod +x /usr/local/bin/restore-backup.sh
```

### 5. Cron 작업 설정
```bash
# Crontab 편집
crontab -e

# 다음 라인 추가:
# 매일 새벽 3시 백업
0 3 * * * /usr/local/bin/auto-backup.sh >> /mnt/blockstorage/logs/cron.log 2>&1

# 매주 일요일 새벽 4시 주간 백업 정리
0 4 * * 0 find /mnt/blockstorage/backups/weekly -mtime +30 -delete

# 매월 1일 새벽 5시 월간 백업 정리
0 5 1 * * find /mnt/blockstorage/backups/monthly -mtime +180 -delete

# Cron 작업 확인
crontab -l
```

### 6. 수동 백업 테스트
```bash
# 백업 스크립트 수동 실행
/usr/local/bin/auto-backup.sh

# 백업 확인
ls -la /mnt/blockstorage/backups/daily/

# 로그 확인
tail -f /mnt/blockstorage/logs/backup_*.log
```

### 7. 모니터링 설정 (선택사항)
```bash
# 디스크 사용량 모니터링 스크립트
cat > /usr/local/bin/check-backup-storage.sh << 'EOF'
#!/bin/bash
USAGE=$(df -h /mnt/blockstorage | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $USAGE -gt 80 ]; then
    echo "경고: Block Storage 사용률이 ${USAGE}%입니다!" | mail -s "Storage 경고" admin@example.com
fi
EOF

chmod +x /usr/local/bin/check-backup-storage.sh

# Cron에 추가 (매일 정오 체크)
echo "0 12 * * * /usr/local/bin/check-backup-storage.sh" | crontab -
```

## 🔄 백업 복원 방법

### 백업 목록 확인
```bash
/usr/local/bin/restore-backup.sh --list
```

### 특정 날짜 DB 복원
```bash
/usr/local/bin/restore-backup.sh --restore-db 20250815_120000
```

### 전체 복원
```bash
/usr/local/bin/restore-backup.sh --restore-all 20250815_120000
```

## 📊 백업 상태 확인

### Storage 사용량 확인
```bash
df -h /mnt/blockstorage
```

### 백업 파일 크기 확인
```bash
du -sh /mnt/blockstorage/backups/*
```

### 최근 백업 로그 확인
```bash
ls -lt /mnt/blockstorage/logs/ | head -5
tail -50 /mnt/blockstorage/logs/backup_*.log
```

## ⚠️ 주의사항

1. **첫 포맷**: `/dev/vdb`를 처음 포맷할 때만 `mkfs.ext4` 실행. 이미 포맷된 경우 데이터 손실!
2. **fstab 설정**: `nofail` 옵션 필수 - Block Storage 연결 실패 시에도 부팅 가능
3. **백업 테스트**: 실제 데이터로 복원 테스트 필수
4. **모니터링**: Storage 사용률 80% 초과 시 정리 필요

## 🚀 추가 권장사항

### 1. 원격 백업 (Backblaze B2)
```bash
# rclone 설치
curl https://rclone.org/install.sh | sudo bash

# rclone 설정
rclone config

# 중요 백업만 B2로 동기화 (Cron 추가)
0 5 * * * rclone sync /mnt/blockstorage/backups/daily b2:coolify-backup/daily --min-age 1d --max-age 7d
```

### 2. 백업 알림
- 백업 성공/실패 시 이메일 또는 Slack 알림 설정
- Uptime Kuma로 백업 스크립트 모니터링

### 3. 백업 검증
- 매주 랜덤하게 백업 파일 무결성 검사
- 분기별 복원 테스트 실행

## 📝 문제 해결

### Block Storage가 마운트되지 않음
```bash
# 디바이스 확인
lsblk
fdisk -l

# 수동 마운트
mount /dev/vdb /mnt/blockstorage

# fstab 확인
cat /etc/fstab
```

### 백업 스크립트 실행 오류
```bash
# 실행 권한 확인
ls -la /usr/local/bin/auto-backup.sh

# 스크립트 디버깅
bash -x /usr/local/bin/auto-backup.sh
```

### Cron 작업이 실행되지 않음
```bash
# Cron 서비스 상태
systemctl status cron

# Cron 로그 확인
grep CRON /var/log/syslog
```

---

**작성일**: 2025-08-15
**서버**: 141.164.60.51 (Vultr Seoul)
**Block Storage ID**: 1ec416d9-605a-4d04-98ed-56eb784b6d64