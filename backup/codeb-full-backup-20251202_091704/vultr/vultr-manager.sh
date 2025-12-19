#!/bin/bash

# Vultr 서버 관리 스크립트
# API 키는 환경변수로 설정

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# API 키 확인
if [ -z "$VULTR_API_KEY" ]; then
    echo -e "${RED}❌ VULTR_API_KEY 환경변수가 설정되지 않았습니다.${NC}"
    echo "export VULTR_API_KEY='your-api-key' 명령을 먼저 실행하세요."
    exit 1
fi

# 서버 정보
SERVER1_ID="0c099e4d-29f0-4c54-b60f-4cdd375ac2d4"  # 141.164.60.51 (Coolify)
SERVER2_ID="3a8c65b6-ea72-40e3-b33f-1ba67a4731be"  # 158.247.233.83 (CyberPanel)
REGION="icn"  # Seoul

# 1. 서버 상태 확인
status() {
    echo -e "${GREEN}=== 서버 상태 ===${NC}"
    echo -e "\n${YELLOW}서버 1 (Coolify - 141.164.60.51):${NC}"
    vultr-cli instance get $SERVER1_ID | grep -E "LABEL|STATUS|MAIN_IP|VCPU_COUNT|RAM|DISK|BANDWIDTH"
    
    echo -e "\n${YELLOW}서버 2 (CyberPanel - 158.247.233.83):${NC}"
    vultr-cli instance get $SERVER2_ID | grep -E "LABEL|STATUS|MAIN_IP|VCPU_COUNT|RAM|DISK|BANDWIDTH"
    
    echo -e "\n${GREEN}=== 리소스 사용량 ===${NC}"
    echo "서버 1 대역폭:"
    vultr-cli instance bandwidth $SERVER1_ID | tail -5
    echo -e "\n서버 2 대역폭:"
    vultr-cli instance bandwidth $SERVER2_ID | tail -5
}

# 2. Block Storage 추가 (100GB)
add_storage() {
    echo -e "${YELLOW}Block Storage 생성 중 (100GB)...${NC}"
    
    # Storage 생성
    STORAGE_JSON=$(vultr-cli block-storage create \
        --region $REGION \
        --size 100 \
        --label "coolify-backup-$(date +%Y%m%d)" \
        --output json)
    
    if [ $? -eq 0 ]; then
        STORAGE_ID=$(echo $STORAGE_JSON | jq -r '.block_storage.id')
        echo -e "${GREEN}✅ Storage 생성 완료: $STORAGE_ID${NC}"
        
        # 서버 1에 연결
        echo -e "${YELLOW}Storage를 서버 1에 연결 중...${NC}"
        vultr-cli block-storage attach $STORAGE_ID --instance $SERVER1_ID
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Storage 연결 완료${NC}"
            
            # 마운트 가이드
            echo -e "\n${BLUE}=== 서버에서 마운트하기 ===${NC}"
            echo "1. SSH 접속:"
            echo "   ssh root@141.164.60.51"
            echo ""
            echo "2. 디바이스 확인:"
            echo "   lsblk"
            echo ""
            echo "3. 포맷 (처음만):"
            echo "   mkfs.ext4 /dev/vdb"
            echo ""
            echo "4. 마운트:"
            echo "   mkdir -p /mnt/blockstorage"
            echo "   mount /dev/vdb /mnt/blockstorage"
            echo ""
            echo "5. 자동 마운트 설정:"
            echo "   echo '/dev/vdb /mnt/blockstorage ext4 defaults,nofail 0 0' >> /etc/fstab"
        else
            echo -e "${RED}❌ Storage 연결 실패${NC}"
        fi
    else
        echo -e "${RED}❌ Storage 생성 실패${NC}"
    fi
}

# 3. 스냅샷 생성
snapshot() {
    echo -e "${YELLOW}어느 서버의 스냅샷을 생성하시겠습니까?${NC}"
    echo "1) 서버 1 (Coolify - 141.164.60.51)"
    echo "2) 서버 2 (CyberPanel - 158.247.233.83)"
    echo -n "선택 (1/2): "
    read choice
    
    case $choice in
        1)
            INSTANCE_ID=$SERVER1_ID
            LABEL="coolify"
            ;;
        2)
            INSTANCE_ID=$SERVER2_ID
            LABEL="cyberpanel"
            ;;
        *)
            echo -e "${RED}잘못된 선택${NC}"
            return 1
            ;;
    esac
    
    echo -e "${YELLOW}스냅샷 생성 중...${NC}"
    SNAPSHOT_JSON=$(vultr-cli snapshot create \
        --instance-id $INSTANCE_ID \
        --description "$LABEL-backup-$(date +%Y%m%d-%H%M%S)" \
        --output json)
    
    if [ $? -eq 0 ]; then
        SNAPSHOT_ID=$(echo $SNAPSHOT_JSON | jq -r '.snapshot.id')
        echo -e "${GREEN}✅ 스냅샷 생성 시작: $SNAPSHOT_ID${NC}"
        echo "스냅샷 생성은 시간이 걸립니다. 진행 상황은 'vultr-cli snapshot list'로 확인하세요."
    else
        echo -e "${RED}❌ 스냅샷 생성 실패${NC}"
    fi
}

# 4. 서버 재시작
restart() {
    echo -e "${YELLOW}어느 서버를 재시작하시겠습니까?${NC}"
    echo "1) 서버 1 (Coolify - 141.164.60.51)"
    echo "2) 서버 2 (CyberPanel - 158.247.233.83)"
    echo -n "선택 (1/2): "
    read choice
    
    case $choice in
        1)
            INSTANCE_ID=$SERVER1_ID
            ;;
        2)
            INSTANCE_ID=$SERVER2_ID
            ;;
        *)
            echo -e "${RED}잘못된 선택${NC}"
            return 1
            ;;
    esac
    
    echo -e "${YELLOW}서버 재시작 중...${NC}"
    vultr-cli instance restart $INSTANCE_ID
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ 재시작 명령 전송됨${NC}"
        echo "서버가 재시작되는 동안 잠시 기다려주세요..."
    else
        echo -e "${RED}❌ 재시작 실패${NC}"
    fi
}

# 5. 백업 목록
list_backups() {
    echo -e "${GREEN}=== 스냅샷 목록 ===${NC}"
    vultr-cli snapshot list
    
    echo -e "\n${GREEN}=== Block Storage 목록 ===${NC}"
    vultr-cli block-storage list
}

# 6. 서버 2 삭제 (주의!)
delete_server2() {
    echo -e "${RED}⚠️  경고: 서버 2 (158.247.233.83)를 삭제하려고 합니다!${NC}"
    echo -e "${YELLOW}이 작업은 되돌릴 수 없습니다. 데이터 백업을 확인하셨습니까?${NC}"
    echo -n "정말로 삭제하시겠습니까? (yes/no): "
    read confirm
    
    if [ "$confirm" = "yes" ]; then
        echo -n "확인을 위해 'DELETE'를 입력하세요: "
        read final_confirm
        
        if [ "$final_confirm" = "DELETE" ]; then
            echo -e "${RED}서버 2 삭제 중...${NC}"
            vultr-cli instance delete $SERVER2_ID
            
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✅ 서버 2 삭제 요청 완료${NC}"
                echo "서버가 완전히 삭제되는데 몇 분 걸릴 수 있습니다."
            else
                echo -e "${RED}❌ 삭제 실패${NC}"
            fi
        else
            echo -e "${YELLOW}삭제 취소됨${NC}"
        fi
    else
        echo -e "${YELLOW}삭제 취소됨${NC}"
    fi
}

# 7. 비용 확인
costs() {
    echo -e "${GREEN}=== 현재 비용 정보 ===${NC}"
    
    echo -e "\n${YELLOW}계정 정보:${NC}"
    vultr-cli account info | grep -E "BALANCE|PENDING"
    
    echo -e "\n${YELLOW}서버별 월 비용:${NC}"
    echo "서버 1 (2 vCPU, 16GB RAM): ~\$80/월"
    echo "서버 2 (1 vCPU, 2GB RAM): ~\$12/월"
    
    STORAGE_COUNT=$(vultr-cli block-storage list | grep -c "active")
    if [ $STORAGE_COUNT -gt 0 ]; then
        echo -e "\nBlock Storage (100GB): \$10/월 x $STORAGE_COUNT = \$$(($STORAGE_COUNT * 10))/월"
    fi
    
    echo -e "\n${GREEN}총 예상 비용: ~\$92/월 + Storage${NC}"
}

# 8. 빠른 설정 (서버 1 강화)
quick_setup() {
    echo -e "${BLUE}=== 서버 1 강화 빠른 설정 ===${NC}"
    echo "다음 작업을 수행합니다:"
    echo "1. 100GB Block Storage 추가"
    echo "2. 서버 1 스냅샷 생성"
    echo "3. 설정 스크립트 생성"
    
    echo -n "계속하시겠습니까? (yes/no): "
    read confirm
    
    if [ "$confirm" = "yes" ]; then
        # Block Storage 추가
        add_storage
        
        # 스냅샷 생성
        echo -e "\n${YELLOW}서버 1 스냅샷 생성 중...${NC}"
        vultr-cli snapshot create \
            --instance-id $SERVER1_ID \
            --description "coolify-initial-$(date +%Y%m%d)" \
            --output json
        
        # 설정 스크립트 생성
        cat > setup-server1.sh << 'EOF'
#!/bin/bash
# 서버 1 설정 스크립트

# Block Storage 마운트
DEVICE=$(lsblk -rno NAME,TYPE | grep disk | grep -v vda | head -1 | awk '{print $1}')
if [ -n "$DEVICE" ]; then
    mkfs.ext4 /dev/$DEVICE 2>/dev/null
    mkdir -p /mnt/blockstorage
    mount /dev/$DEVICE /mnt/blockstorage
    UUID=$(blkid -s UUID -o value /dev/$DEVICE)
    grep -q "$UUID" /etc/fstab || echo "UUID=$UUID /mnt/blockstorage ext4 defaults,nofail 0 0" >> /etc/fstab
    
    # 백업 디렉토리 생성
    mkdir -p /mnt/blockstorage/{backups,docker-volumes,logs,snapshots}
    mkdir -p /mnt/blockstorage/backups/{daily,weekly,monthly}
    
    echo "✅ Block Storage 마운트 완료"
fi

# Netdata 설치
if ! systemctl is-active --quiet netdata; then
    bash <(curl -Ss https://get.netdata.cloud/kickstart.sh) --dont-wait --dont-start-it
    systemctl start netdata
    echo "✅ Netdata 설치 완료 - http://$(hostname -I | awk '{print $1}'):19999"
fi

# Fail2ban 설치
if ! systemctl is-active --quiet fail2ban; then
    apt update && apt install -y fail2ban
    systemctl enable fail2ban
    systemctl start fail2ban
    echo "✅ Fail2ban 설치 완료"
fi

echo "🎉 서버 1 강화 설정 완료!"
EOF
        
        chmod +x setup-server1.sh
        echo -e "\n${GREEN}✅ 설정 스크립트 생성 완료: setup-server1.sh${NC}"
        echo "서버에 복사하여 실행하세요:"
        echo "  scp setup-server1.sh root@141.164.60.51:/root/"
        echo "  ssh root@141.164.60.51 'bash /root/setup-server1.sh'"
    else
        echo -e "${YELLOW}설정 취소됨${NC}"
    fi
}

# 메뉴
show_menu() {
    echo -e "\n${BLUE}================================${NC}"
    echo -e "${BLUE}   Vultr 서버 관리 도구${NC}"
    echo -e "${BLUE}================================${NC}"
    echo "1. 서버 상태 확인"
    echo "2. Block Storage 추가 (100GB)"
    echo "3. 스냅샷 생성"
    echo "4. 서버 재시작"
    echo "5. 백업 목록 확인"
    echo "6. 서버 2 삭제 (⚠️ 주의)"
    echo "7. 비용 확인"
    echo "8. 서버 1 강화 빠른 설정"
    echo "0. 종료"
    echo -e "${BLUE}================================${NC}"
    echo -n "선택: "
}

# 메인 루프
while true; do
    show_menu
    read choice
    
    case $choice in
        1) status ;;
        2) add_storage ;;
        3) snapshot ;;
        4) restart ;;
        5) list_backups ;;
        6) delete_server2 ;;
        7) costs ;;
        8) quick_setup ;;
        0) echo "종료합니다."; exit 0 ;;
        *) echo -e "${RED}잘못된 선택입니다.${NC}" ;;
    esac
    
    echo -e "\n${YELLOW}Enter를 눌러 계속...${NC}"
    read
done