#!/bin/bash

# Vultr 서버 1 백업 복원 스크립트
# 실행 위치: 서버 1 (141.164.60.51)
# 용도: 백업된 데이터 복원

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 함수: 사용법 출력
usage() {
    echo -e "${BLUE}사용법:${NC}"
    echo "  $0 [옵션]"
    echo ""
    echo -e "${YELLOW}옵션:${NC}"
    echo "  --list                    백업 목록 보기"
    echo "  --restore-db DATE         특정 날짜의 DB 백업 복원"
    echo "  --restore-volumes DATE    특정 날짜의 Docker 볼륨 복원"
    echo "  --restore-config DATE     특정 날짜의 설정 파일 복원"
    echo "  --restore-all DATE        모든 백업 복원"
    echo ""
    echo -e "${BLUE}예제:${NC}"
    echo "  $0 --list"
    echo "  $0 --restore-db 20250815_120000"
    echo "  $0 --restore-all 20250815_120000"
    exit 1
}

# Block Storage 마운트 확인
check_mount() {
    if ! mountpoint -q /mnt/blockstorage; then
        echo -e "${RED}❌ Block Storage가 마운트되지 않았습니다!${NC}"
        exit 1
    fi
}

# 백업 목록 출력
list_backups() {
    echo -e "${GREEN}=== Daily 백업 목록 ===${NC}"
    ls -lah /mnt/blockstorage/backups/daily/ | grep -E '\.tar\.gz|\.sql\.gz'
    
    echo -e "\n${GREEN}=== Weekly 백업 목록 ===${NC}"
    ls -lah /mnt/blockstorage/backups/weekly/ | grep -E '\.tar\.gz|\.sql\.gz'
    
    echo -e "\n${GREEN}=== Monthly 백업 목록 ===${NC}"
    ls -lah /mnt/blockstorage/backups/monthly/ | grep -E '\.tar\.gz|\.sql\.gz'
}

# PostgreSQL 복원
restore_postgres() {
    local DATE=$1
    local BACKUP_FILE=""
    
    # 백업 파일 찾기
    for dir in daily weekly monthly; do
        FILE="/mnt/blockstorage/backups/$dir/postgres_*_${DATE}.sql.gz"
        if ls $FILE 1> /dev/null 2>&1; then
            BACKUP_FILE=$(ls $FILE | head -1)
            break
        fi
    done
    
    if [ -z "$BACKUP_FILE" ]; then
        echo -e "${RED}❌ PostgreSQL 백업 파일을 찾을 수 없습니다: ${DATE}${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}PostgreSQL 복원 중: $BACKUP_FILE${NC}"
    
    # 컨테이너 이름 추출
    CONTAINER=$(basename $BACKUP_FILE | sed 's/postgres_//;s/_[0-9]*.sql.gz//')
    
    # 복원 실행
    gunzip -c $BACKUP_FILE | docker exec -i $CONTAINER psql -U postgres
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ PostgreSQL 복원 완료${NC}"
    else
        echo -e "${RED}❌ PostgreSQL 복원 실패${NC}"
        return 1
    fi
}

# Docker 볼륨 복원
restore_volumes() {
    local DATE=$1
    local BACKUP_FILE=""
    
    # 백업 파일 찾기
    for dir in daily weekly monthly; do
        FILE="/mnt/blockstorage/backups/$dir/docker_volumes_${DATE}.tar.gz"
        if [ -f "$FILE" ]; then
            BACKUP_FILE=$FILE
            break
        fi
    done
    
    if [ -z "$BACKUP_FILE" ]; then
        echo -e "${RED}❌ Docker 볼륨 백업 파일을 찾을 수 없습니다: ${DATE}${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}Docker 볼륨 복원 중: $BACKUP_FILE${NC}"
    echo -e "${RED}⚠️ 경고: 이 작업은 현재 Docker 볼륨을 덮어씁니다!${NC}"
    read -p "계속하시겠습니까? (y/N): " confirm
    
    if [ "$confirm" != "y" ]; then
        echo "복원 취소됨"
        return 1
    fi
    
    # Docker 서비스 중지
    echo -e "${YELLOW}Docker 서비스 중지 중...${NC}"
    docker stop $(docker ps -q)
    
    # 볼륨 복원
    tar -xzf $BACKUP_FILE -C /var/lib/docker/volumes/
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Docker 볼륨 복원 완료${NC}"
        echo -e "${YELLOW}Docker 서비스를 다시 시작하세요${NC}"
    else
        echo -e "${RED}❌ Docker 볼륨 복원 실패${NC}"
        return 1
    fi
}

# 설정 파일 복원
restore_config() {
    local DATE=$1
    
    # Coolify 설정 복원
    COOLIFY_BACKUP="/mnt/blockstorage/backups/daily/coolify_config_${DATE}.tar.gz"
    if [ -f "$COOLIFY_BACKUP" ]; then
        echo -e "${YELLOW}Coolify 설정 복원 중...${NC}"
        tar -xzf $COOLIFY_BACKUP -C /
        echo -e "${GREEN}✅ Coolify 설정 복원 완료${NC}"
    fi
    
    # 시스템 설정 복원
    SYSTEM_BACKUP="/mnt/blockstorage/backups/daily/system_config_${DATE}.tar.gz"
    if [ -f "$SYSTEM_BACKUP" ]; then
        echo -e "${YELLOW}시스템 설정 복원 중...${NC}"
        # 백업 생성 후 복원
        cp -r /etc/nginx /etc/nginx.bak
        tar -xzf $SYSTEM_BACKUP -C /
        echo -e "${GREEN}✅ 시스템 설정 복원 완료${NC}"
        echo -e "${YELLOW}nginx 재시작이 필요할 수 있습니다${NC}"
    fi
}

# 메인 스크립트
check_mount

case "$1" in
    --list)
        list_backups
        ;;
    --restore-db)
        if [ -z "$2" ]; then
            echo -e "${RED}날짜를 입력하세요${NC}"
            usage
        fi
        restore_postgres $2
        ;;
    --restore-volumes)
        if [ -z "$2" ]; then
            echo -e "${RED}날짜를 입력하세요${NC}"
            usage
        fi
        restore_volumes $2
        ;;
    --restore-config)
        if [ -z "$2" ]; then
            echo -e "${RED}날짜를 입력하세요${NC}"
            usage
        fi
        restore_config $2
        ;;
    --restore-all)
        if [ -z "$2" ]; then
            echo -e "${RED}날짜를 입력하세요${NC}"
            usage
        fi
        echo -e "${BLUE}=== 전체 복원 시작 ===${NC}"
        restore_postgres $2
        restore_volumes $2
        restore_config $2
        echo -e "${GREEN}=== 전체 복원 완료 ===${NC}"
        ;;
    *)
        usage
        ;;
esac