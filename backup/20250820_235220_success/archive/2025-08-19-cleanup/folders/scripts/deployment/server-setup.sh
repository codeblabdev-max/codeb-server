#!/bin/bash

# 서버 안전 배포 스크립트
# 실행 전 서버 상태 확인 및 안전한 배포

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SERVER_IP="141.164.60.51"

# 로그 함수
log_message() {
    echo -e "${1}" | tee -a setup.log
}

# 서버 접속 테스트
test_ssh_connection() {
    log_message "${YELLOW}SSH 접속 테스트 중...${NC}"
    
    if ssh -o ConnectTimeout=10 -o BatchMode=yes root@$SERVER_IP "echo 'SSH 접속 성공'" 2>/dev/null; then
        log_message "${GREEN}✅ SSH 접속 성공${NC}"
        return 0
    else
        log_message "${RED}❌ SSH 접속 실패${NC}"
        return 1
    fi
}

# 서버 상태 확인
check_server_status() {
    log_message "${YELLOW}서버 상태 확인 중...${NC}"
    
    ssh root@$SERVER_IP << 'EOF'
echo "=== 시스템 정보 ==="
uname -a
echo ""

echo "=== 메모리 사용률 ==="
free -h
echo ""

echo "=== 디스크 사용률 ==="
df -h
echo ""

echo "=== 실행 중인 Docker 컨테이너 ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

echo "=== 시스템 로드 ==="
uptime
echo ""

echo "=== Block Storage 마운트 상태 ==="
lsblk | grep vdb || echo "Block Storage가 마운트되지 않음"
mountpoint /mnt/blockstorage 2>/dev/null && echo "✅ Block Storage 마운트됨" || echo "❌ Block Storage 마운트 안됨"
EOF
}

# Block Storage 안전 마운트
safe_mount_storage() {
    log_message "${YELLOW}Block Storage 안전 마운트 중...${NC}"
    
    ssh root@$SERVER_IP << 'EOF'
# Block Storage 디바이스 확인
if ! lsblk | grep -q vdb; then
    echo "❌ Block Storage 디바이스가 없습니다"
    exit 1
fi

# 이미 마운트되어 있는지 확인
if mountpoint -q /mnt/blockstorage; then
    echo "✅ Block Storage가 이미 마운트되어 있습니다"
    exit 0
fi

# 마운트 포인트 생성
mkdir -p /mnt/blockstorage

# 파일시스템 존재 여부 확인
if ! blkid /dev/vdb; then
    echo "Block Storage에 파일시스템 생성 중..."
    mkfs.ext4 /dev/vdb
fi

# 마운트
mount /dev/vdb /mnt/blockstorage

# fstab에 추가 (중복 방지)
if ! grep -q "/dev/vdb" /etc/fstab; then
    echo '/dev/vdb /mnt/blockstorage ext4 defaults,nofail 0 0' >> /etc/fstab
    echo "✅ fstab에 자동 마운트 설정 추가됨"
fi

# 마운트 확인
if mountpoint -q /mnt/blockstorage; then
    echo "✅ Block Storage 마운트 성공"
    df -h /mnt/blockstorage
else
    echo "❌ Block Storage 마운트 실패"
    exit 1
fi
EOF
}

# 백업 디렉토리 구조 생성
create_backup_structure() {
    log_message "${YELLOW}백업 디렉토리 구조 생성 중...${NC}"
    
    ssh root@$SERVER_IP << 'EOF'
# 백업 디렉토리 구조 생성
mkdir -p /mnt/blockstorage/{backups,docker-volumes,logs,snapshots}
mkdir -p /mnt/blockstorage/backups/{daily,weekly,monthly}

# 권한 설정
chmod 755 /mnt/blockstorage
chmod 755 /mnt/blockstorage/*
chmod 755 /mnt/blockstorage/backups/*

# 구조 확인
echo "=== 백업 디렉토리 구조 ==="
tree /mnt/blockstorage 2>/dev/null || ls -la /mnt/blockstorage/

echo "✅ 백업 디렉토리 구조 생성 완료"
EOF
}

# 메인 실행
main() {
    log_message "${GREEN}=== 서버 안전 설정 시작 ===${NC}"
    
    # 1. SSH 접속 테스트
    if ! test_ssh_connection; then
        log_message "${RED}SSH 접속에 실패했습니다. 스크립트를 종료합니다.${NC}"
        exit 1
    fi
    
    # 2. 서버 상태 확인
    check_server_status
    
    # 3. Block Storage 마운트
    safe_mount_storage
    
    # 4. 백업 디렉토리 생성
    create_backup_structure
    
    log_message "${GREEN}=== 서버 설정 완료 ===${NC}"
}

# 스크립트 실행
main "$@"