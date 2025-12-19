# 🚀 Vultr 인프라 자동화 가이드

## 📋 목차
1. [Vultr API 키 생성](#1-vultr-api-키-생성)
2. [Vultr CLI 설정](#2-vultr-cli-설정)
3. [Terraform 인프라 코드화](#3-terraform-인프라-코드화)
4. [자동화 스크립트](#4-자동화-스크립트)
5. [CI/CD 통합](#5-cicd-통합)

---

## 1. Vultr API 키 생성

### 웹 대시보드에서 생성
```
1. https://my.vultr.com/settings/#settingsapi 접속
2. "Personal Access Token" 섹션
3. "Generate New Token" 클릭
4. 권한 설정:
   - Full Access (모든 권한) 또는
   - Custom (필요한 권한만):
     ✅ Instances: Read/Write
     ✅ Block Storage: Read/Write
     ✅ Snapshots: Read/Write
     ✅ Firewall: Read/Write
     ✅ DNS: Read/Write
5. API 키 복사 (⚠️ 한 번만 표시됨!)
```

### API 키 안전한 저장
```bash
# 환경 변수로 저장 (임시)
export VULTR_API_KEY="your-api-key-here"

# 영구 저장 (.bashrc)
echo 'export VULTR_API_KEY="your-api-key-here"' >> ~/.bashrc
source ~/.bashrc

# 또는 .env 파일
echo "VULTR_API_KEY=your-api-key-here" > .env
chmod 600 .env
```

---

## 2. Vultr CLI 설정

### 설치

#### macOS
```bash
brew install vultr/vultr-cli/vultr-cli
```

#### Linux (서버에 설치)
```bash
# 최신 버전 다운로드
curl -L https://github.com/vultr/vultr-cli/releases/latest/download/vultr-cli_Linux_x86_64.tar.gz | tar xz
sudo mv vultr-cli /usr/local/bin/
chmod +x /usr/local/bin/vultr-cli

# 버전 확인
vultr-cli version
```

#### Docker 방식
```bash
# Docker 이미지로 실행
docker run --rm -e VULTR_API_KEY=$VULTR_API_KEY vultr/vultr-cli:latest instance list
```

### CLI 설정
```bash
# 대화형 설정
vultr-cli configure

# 또는 환경 변수 사용
export VULTR_API_KEY="your-api-key-here"

# 설정 확인
vultr-cli account
```

### 기본 명령어
```bash
# 인스턴스 관리
vultr-cli instance list                           # 서버 목록
vultr-cli instance get <instance-id>              # 상세 정보
vultr-cli instance create --region sgp --plan vc2-2c-16gb --os 1743  # 생성
vultr-cli instance restart <instance-id>          # 재시작
vultr-cli instance delete <instance-id>           # 삭제

# Block Storage
vultr-cli block-storage list                      # 목록
vultr-cli block-storage create --region sgp --size 100 --label backup
vultr-cli block-storage attach <storage-id> --instance <instance-id>
vultr-cli block-storage detach <storage-id>
vultr-cli block-storage delete <storage-id>

# 스냅샷
vultr-cli snapshot list                           # 목록
vultr-cli snapshot create --instance-id <id> --description "backup"
vultr-cli snapshot delete <snapshot-id>

# 방화벽
vultr-cli firewall group list                     # 그룹 목록
vultr-cli firewall rule list <group-id>           # 규칙 목록
vultr-cli firewall rule create --id <group-id> --protocol tcp --port 443
```

---

## 3. Terraform 인프라 코드화

### Terraform 설치

#### macOS
```bash
brew install terraform
```

#### Linux
```bash
# HashiCorp 공식 저장소 추가
curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo apt-key add -
sudo apt-add-repository "deb [arch=amd64] https://apt.releases.hashicorp.com $(lsb_release -cs) main"
sudo apt update && sudo apt install terraform
```

### 프로젝트 구조
```
infrastructure/
├── terraform.tfvars      # 변수 값 (gitignore)
├── variables.tf          # 변수 정의
├── providers.tf          # Provider 설정
├── main.tf              # 메인 리소스
├── outputs.tf           # 출력 값
├── modules/
│   ├── coolify/         # Coolify 모듈
│   ├── monitoring/      # 모니터링 모듈
│   └── backup/          # 백업 모듈
└── environments/
    ├── production/      # 프로덕션 환경
    └── staging/         # 스테이징 환경
```

### 기본 설정 파일

#### `providers.tf`
```hcl
terraform {
  required_version = ">= 1.0"
  
  required_providers {
    vultr = {
      source  = "vultr/vultr"
      version = "~> 2.17"
    }
  }
  
  # 상태 파일 원격 저장 (선택사항)
  backend "s3" {
    bucket = "terraform-state-bucket"
    key    = "vultr/terraform.tfstate"
    region = "ap-northeast-2"
  }
}

provider "vultr" {
  api_key = var.vultr_api_key
  rate_limit = 100  # API 호출 제한
  retry_limit = 3   # 재시도 횟수
}
```

#### `variables.tf`
```hcl
variable "vultr_api_key" {
  description = "Vultr API Key"
  type        = string
  sensitive   = true
}

variable "region" {
  description = "Vultr Region"
  type        = string
  default     = "sgp"  # Singapore
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "instance_plan" {
  description = "Instance plan"
  type        = string
  default     = "vc2-2c-16gb"  # 2 vCPU, 16GB RAM
}

variable "os_id" {
  description = "Operating System ID"
  type        = number
  default     = 1743  # Ubuntu 22.04 LTS x64
}

variable "backup_storage_size" {
  description = "Block storage size in GB"
  type        = number
  default     = 100
}

variable "enable_monitoring" {
  description = "Enable monitoring"
  type        = bool
  default     = true
}

variable "enable_backups" {
  description = "Enable automatic backups"
  type        = bool
  default     = true
}
```

#### `main.tf`
```hcl
# SSH 키 생성
resource "vultr_ssh_key" "main" {
  name    = "${var.environment}-ssh-key"
  ssh_key = file("~/.ssh/id_rsa.pub")
}

# 방화벽 그룹
resource "vultr_firewall_group" "main" {
  description = "${var.environment}-firewall"
}

# 방화벽 규칙
resource "vultr_firewall_rule" "ssh" {
  firewall_group_id = vultr_firewall_group.main.id
  protocol          = "tcp"
  ip_type          = "v4"
  subnet           = "0.0.0.0"
  subnet_size      = 0
  port             = "22"
  notes            = "SSH"
}

resource "vultr_firewall_rule" "http" {
  firewall_group_id = vultr_firewall_group.main.id
  protocol          = "tcp"
  ip_type          = "v4"
  subnet           = "0.0.0.0"
  subnet_size      = 0
  port             = "80"
  notes            = "HTTP"
}

resource "vultr_firewall_rule" "https" {
  firewall_group_id = vultr_firewall_group.main.id
  protocol          = "tcp"
  ip_type          = "v4"
  subnet           = "0.0.0.0"
  subnet_size      = 0
  port             = "443"
  notes            = "HTTPS"
}

resource "vultr_firewall_rule" "coolify" {
  firewall_group_id = vultr_firewall_group.main.id
  protocol          = "tcp"
  ip_type          = "v4"
  subnet           = "0.0.0.0"
  subnet_size      = 0
  port             = "8000"
  notes            = "Coolify Panel"
}

# 메인 인스턴스
resource "vultr_instance" "main" {
  label             = "${var.environment}-coolify-server"
  plan              = var.instance_plan
  region            = var.region
  os_id             = var.os_id
  enable_ipv6       = true
  backups           = var.enable_backups ? "enabled" : "disabled"
  backups_schedule {
    type = "daily"
    hour = 3
  }
  ddos_protection   = false
  activation_email  = false
  ssh_key_ids       = [vultr_ssh_key.main.id]
  firewall_group_id = vultr_firewall_group.main.id
  
  # 사용자 데이터 (초기 설정 스크립트)
  user_data = base64encode(templatefile("${path.module}/scripts/init.sh", {
    environment = var.environment
  }))
  
  tags = {
    Environment = var.environment
    Managed     = "Terraform"
    Purpose     = "Coolify"
  }
}

# Block Storage
resource "vultr_block_storage" "backup" {
  count = var.enable_backups ? 1 : 0
  
  size_gb  = var.backup_storage_size
  region   = var.region
  label    = "${var.environment}-backup-storage"
  
  # 자동으로 인스턴스에 연결
  attached_to_instance = vultr_instance.main.id
}

# 스냅샷 (수동 트리거)
resource "null_resource" "snapshot" {
  count = var.enable_backups ? 1 : 0
  
  provisioner "local-exec" {
    command = <<-EOT
      vultr-cli snapshot create \
        --instance-id ${vultr_instance.main.id} \
        --description "${var.environment}-snapshot-${timestamp()}"
    EOT
  }
  
  triggers = {
    # 매일 실행되도록 트리거
    daily = timestamp()
  }
}

# Reserved IP (고정 IP)
resource "vultr_reserved_ip" "main" {
  region   = var.region
  ip_type  = "v4"
  label    = "${var.environment}-reserved-ip"
  instance = vultr_instance.main.id
}

# DNS 레코드 (선택사항)
resource "vultr_dns_domain" "main" {
  domain = "example.com"
  ip     = vultr_reserved_ip.main.subnet
}

resource "vultr_dns_record" "a" {
  domain = vultr_dns_domain.main.id
  name   = "@"
  type   = "A"
  data   = vultr_reserved_ip.main.subnet
  ttl    = 300
}

resource "vultr_dns_record" "www" {
  domain = vultr_dns_domain.main.id
  name   = "www"
  type   = "CNAME"
  data   = vultr_dns_domain.main.domain
  ttl    = 300
}
```

#### `outputs.tf`
```hcl
output "instance_id" {
  description = "Instance ID"
  value       = vultr_instance.main.id
}

output "instance_ip" {
  description = "Instance IP address"
  value       = vultr_instance.main.main_ip
}

output "reserved_ip" {
  description = "Reserved IP address"
  value       = vultr_reserved_ip.main.subnet
}

output "ssh_command" {
  description = "SSH connection command"
  value       = "ssh root@${vultr_reserved_ip.main.subnet}"
}

output "coolify_url" {
  description = "Coolify panel URL"
  value       = "https://${vultr_reserved_ip.main.subnet}:8000"
}

output "block_storage_id" {
  description = "Block storage ID"
  value       = var.enable_backups ? vultr_block_storage.backup[0].id : null
}
```

#### `terraform.tfvars` (gitignore에 추가)
```hcl
vultr_api_key = "your-actual-api-key-here"
region         = "sgp"
environment    = "production"
instance_plan  = "vc2-2c-16gb"
```

### Terraform 실행

#### 초기화
```bash
cd infrastructure
terraform init
```

#### 계획 확인
```bash
terraform plan
```

#### 적용
```bash
terraform apply

# 자동 승인
terraform apply -auto-approve
```

#### 현재 인프라 가져오기 (Import)
```bash
# 기존 인스턴스 가져오기
terraform import vultr_instance.main <instance-id>

# 기존 Block Storage 가져오기
terraform import vultr_block_storage.backup[0] <storage-id>
```

#### 상태 확인
```bash
terraform show
terraform state list
```

#### 삭제
```bash
terraform destroy
```

---

## 4. 자동화 스크립트

### 통합 관리 스크립트
```bash
#!/bin/bash
# vultr-automation.sh

set -e

# 색상 코드
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 설정
TERRAFORM_DIR="./infrastructure"
BACKUP_DIR="/mnt/blockstorage/backups"
LOG_FILE="/var/log/vultr-automation.log"

# 로깅 함수
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

# 1. 인프라 배포
deploy_infrastructure() {
    echo -e "${BLUE}=== 인프라 배포 시작 ===${NC}"
    
    cd $TERRAFORM_DIR
    
    # Terraform 초기화
    if [ ! -d ".terraform" ]; then
        log "Terraform 초기화 중..."
        terraform init
    fi
    
    # 계획 생성
    log "배포 계획 생성 중..."
    terraform plan -out=tfplan
    
    # 사용자 확인
    echo -e "${YELLOW}위 계획을 적용하시겠습니까? (yes/no)${NC}"
    read -r response
    
    if [ "$response" = "yes" ]; then
        log "인프라 배포 중..."
        terraform apply tfplan
        echo -e "${GREEN}✅ 인프라 배포 완료${NC}"
    else
        echo -e "${RED}❌ 배포 취소됨${NC}"
        rm tfplan
        return 1
    fi
    
    cd -
}

# 2. 서버 초기 설정
initialize_server() {
    echo -e "${BLUE}=== 서버 초기 설정 ===${NC}"
    
    # Terraform 출력에서 IP 가져오기
    SERVER_IP=$(cd $TERRAFORM_DIR && terraform output -raw instance_ip)
    
    log "서버 접속: $SERVER_IP"
    
    # 초기 설정 스크립트 실행
    ssh root@$SERVER_IP << 'ENDSSH'
        # 시스템 업데이트
        apt update && apt upgrade -y
        
        # 필수 패키지 설치
        apt install -y docker.io docker-compose git htop ncdu
        
        # Docker 설정
        systemctl enable docker
        systemctl start docker
        
        # Swap 설정 (메모리 보조)
        if [ ! -f /swapfile ]; then
            fallocate -l 8G /swapfile
            chmod 600 /swapfile
            mkswap /swapfile
            swapon /swapfile
            echo '/swapfile none swap sw 0 0' >> /etc/fstab
        fi
        
        # 보안 설정
        ufw allow 22/tcp
        ufw allow 80/tcp
        ufw allow 443/tcp
        ufw allow 8000/tcp
        ufw --force enable
        
        # Coolify 설치
        if [ ! -d "/root/coolify" ]; then
            curl -fsSL https://get.coolify.io | bash
        fi
        
        echo "✅ 서버 초기 설정 완료"
ENDSSH
    
    echo -e "${GREEN}✅ 서버 초기화 완료${NC}"
}

# 3. Block Storage 설정
setup_block_storage() {
    echo -e "${BLUE}=== Block Storage 설정 ===${NC}"
    
    # Storage ID 가져오기
    STORAGE_ID=$(cd $TERRAFORM_DIR && terraform output -raw block_storage_id)
    SERVER_IP=$(cd $TERRAFORM_DIR && terraform output -raw instance_ip)
    
    if [ "$STORAGE_ID" = "null" ]; then
        echo -e "${YELLOW}Block Storage가 설정되지 않음${NC}"
        return 1
    fi
    
    log "Block Storage 마운트 중: $STORAGE_ID"
    
    ssh root@$SERVER_IP << 'ENDSSH'
        # 디바이스 확인
        DEVICE=$(lsblk -rno NAME,TYPE | grep disk | grep -v vda | head -1 | awk '{print $1}')
        
        if [ -n "$DEVICE" ]; then
            # 포맷 (처음만)
            if ! blkid /dev/$DEVICE; then
                mkfs.ext4 /dev/$DEVICE
            fi
            
            # 마운트
            mkdir -p /mnt/blockstorage
            mount /dev/$DEVICE /mnt/blockstorage
            
            # 자동 마운트 설정
            UUID=$(blkid -s UUID -o value /dev/$DEVICE)
            if ! grep -q "$UUID" /etc/fstab; then
                echo "UUID=$UUID /mnt/blockstorage ext4 defaults,nofail 0 0" >> /etc/fstab
            fi
            
            # 디렉토리 생성
            mkdir -p /mnt/blockstorage/{backups,docker-volumes,logs,snapshots}
            mkdir -p /mnt/blockstorage/backups/{daily,weekly,monthly}
            
            echo "✅ Block Storage 마운트 완료"
        else
            echo "❌ Block Storage 디바이스를 찾을 수 없음"
            exit 1
        fi
ENDSSH
    
    echo -e "${GREEN}✅ Block Storage 설정 완료${NC}"
}

# 4. 백업 자동화 설정
setup_backups() {
    echo -e "${BLUE}=== 백업 자동화 설정 ===${NC}"
    
    SERVER_IP=$(cd $TERRAFORM_DIR && terraform output -raw instance_ip)
    
    log "백업 스크립트 생성 중..."
    
    ssh root@$SERVER_IP << 'ENDSSH'
        # 백업 스크립트 생성
        cat > /usr/local/bin/auto-backup.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/mnt/blockstorage/backups/daily"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# PostgreSQL 백업
for container in $(docker ps --format '{{.Names}}' | grep postgres); do
    docker exec $container pg_dumpall -U postgres | \
    gzip > $BACKUP_DIR/postgres_${container}_${DATE}.sql.gz
done

# Docker 볼륨 백업
docker run --rm \
    -v /var/lib/docker/volumes:/source:ro \
    -v $BACKUP_DIR:/backup \
    alpine tar czf /backup/docker_volumes_${DATE}.tar.gz /source

# Coolify 설정 백업
tar czf $BACKUP_DIR/coolify_config_${DATE}.tar.gz \
    /root/coolify/.env \
    /root/coolify/docker-compose.yml

# 오래된 백업 삭제
find $BACKUP_DIR -type f -mtime +$RETENTION_DAYS -delete

# 주간 백업 (일요일)
if [ $(date +%u) -eq 7 ]; then
    cp $BACKUP_DIR/*_${DATE}.* /mnt/blockstorage/backups/weekly/
fi

# 월간 백업 (1일)
if [ $(date +%d) -eq 01 ]; then
    cp $BACKUP_DIR/*_${DATE}.* /mnt/blockstorage/backups/monthly/
fi

echo "[$(date)] 백업 완료" >> /var/log/backup.log
EOF
        
        chmod +x /usr/local/bin/auto-backup.sh
        
        # Cron 설정
        (crontab -l 2>/dev/null; echo "0 3 * * * /usr/local/bin/auto-backup.sh") | crontab -
        
        echo "✅ 백업 자동화 설정 완료"
ENDSSH
    
    echo -e "${GREEN}✅ 백업 설정 완료${NC}"
}

# 5. 모니터링 설정
setup_monitoring() {
    echo -e "${BLUE}=== 모니터링 설정 ===${NC}"
    
    SERVER_IP=$(cd $TERRAFORM_DIR && terraform output -raw instance_ip)
    
    log "Netdata 설치 중..."
    
    ssh root@$SERVER_IP << 'ENDSSH'
        # Netdata 설치
        if ! systemctl is-active --quiet netdata; then
            bash <(curl -Ss https://get.netdata.cloud/kickstart.sh) --dont-wait
        fi
        
        # Uptime Kuma 설치
        if [ ! -d "/root/uptime-kuma" ]; then
            mkdir -p /root/uptime-kuma
            cat > /root/uptime-kuma/docker-compose.yml << 'EOF'
version: '3.8'

services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    volumes:
      - ./data:/app/data
    ports:
      - "3001:3001"
    restart: always
EOF
            cd /root/uptime-kuma
            docker-compose up -d
        fi
        
        echo "✅ 모니터링 설정 완료"
        echo "Netdata: http://$SERVER_IP:19999"
        echo "Uptime Kuma: http://$SERVER_IP:3001"
ENDSSH
    
    echo -e "${GREEN}✅ 모니터링 설정 완료${NC}"
}

# 6. 상태 확인
check_status() {
    echo -e "${BLUE}=== 인프라 상태 확인 ===${NC}"
    
    # Terraform 상태
    echo -e "${YELLOW}Terraform 리소스:${NC}"
    cd $TERRAFORM_DIR
    terraform state list
    
    # 서버 상태
    SERVER_IP=$(terraform output -raw instance_ip)
    echo -e "\n${YELLOW}서버 상태:${NC}"
    vultr-cli instance get $(terraform output -raw instance_id) | \
        grep -E "LABEL|STATUS|MAIN_IP|VCPU|RAM"
    
    # SSH 연결 테스트
    echo -e "\n${YELLOW}SSH 연결 테스트:${NC}"
    if ssh -o ConnectTimeout=5 root@$SERVER_IP "echo '✅ SSH 연결 성공'"; then
        echo -e "${GREEN}서버 접속 가능${NC}"
    else
        echo -e "${RED}서버 접속 불가${NC}"
    fi
    
    cd -
}

# 7. 재해 복구
disaster_recovery() {
    echo -e "${RED}=== 재해 복구 모드 ===${NC}"
    
    echo -e "${YELLOW}스냅샷 목록:${NC}"
    vultr-cli snapshot list
    
    echo "복구할 스냅샷 ID를 입력하세요:"
    read -r SNAPSHOT_ID
    
    echo -e "${YELLOW}새 인스턴스 생성 중...${NC}"
    NEW_INSTANCE=$(vultr-cli instance create \
        --region sgp \
        --plan vc2-2c-16gb \
        --snapshot $SNAPSHOT_ID \
        --label "recovery-$(date +%Y%m%d)" \
        --output json | jq -r '.instance.id')
    
    echo -e "${GREEN}✅ 복구 인스턴스 생성: $NEW_INSTANCE${NC}"
    
    # Terraform 상태 업데이트
    cd $TERRAFORM_DIR
    terraform import vultr_instance.main $NEW_INSTANCE
    cd -
}

# 메인 메뉴
show_menu() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}   Vultr 인프라 자동화 도구${NC}"
    echo -e "${BLUE}================================${NC}"
    echo "1. 인프라 배포 (Terraform)"
    echo "2. 서버 초기 설정"
    echo "3. Block Storage 설정"
    echo "4. 백업 자동화 설정"
    echo "5. 모니터링 설정"
    echo "6. 상태 확인"
    echo "7. 재해 복구"
    echo "8. 전체 설정 (1-5 순차 실행)"
    echo "0. 종료"
    echo -e "${BLUE}================================${NC}"
    echo -n "선택: "
}

# 전체 설정
full_setup() {
    log "전체 설정 시작"
    deploy_infrastructure && \
    sleep 30 && \
    initialize_server && \
    setup_block_storage && \
    setup_backups && \
    setup_monitoring && \
    check_status
    log "전체 설정 완료"
}

# 메인 루프
main() {
    while true; do
        show_menu
        read -r choice
        
        case $choice in
            1) deploy_infrastructure ;;
            2) initialize_server ;;
            3) setup_block_storage ;;
            4) setup_backups ;;
            5) setup_monitoring ;;
            6) check_status ;;
            7) disaster_recovery ;;
            8) full_setup ;;
            0) echo "종료합니다."; exit 0 ;;
            *) echo -e "${RED}잘못된 선택입니다.${NC}" ;;
        esac
        
        echo -e "\n${YELLOW}Enter를 눌러 계속...${NC}"
        read
        clear
    done
}

# 실행
main
```

### Makefile 자동화
```makefile
# Makefile
.PHONY: help init plan apply destroy status backup monitor

# 변수
TERRAFORM_DIR = ./infrastructure
SERVER_IP = $(shell cd $(TERRAFORM_DIR) && terraform output -raw instance_ip 2>/dev/null)

help: ## 도움말 표시
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

init: ## Terraform 초기화
	cd $(TERRAFORM_DIR) && terraform init

plan: ## 배포 계획 확인
	cd $(TERRAFORM_DIR) && terraform plan

apply: ## 인프라 배포
	cd $(TERRAFORM_DIR) && terraform apply

destroy: ## 인프라 삭제
	cd $(TERRAFORM_DIR) && terraform destroy

status: ## 서버 상태 확인
	@echo "=== 서버 상태 ==="
	@vultr-cli instance list
	@echo "\n=== Block Storage ==="
	@vultr-cli block-storage list
	@echo "\n=== 스냅샷 ==="
	@vultr-cli snapshot list | head -5

backup: ## 즉시 백업 실행
	ssh root@$(SERVER_IP) "/usr/local/bin/auto-backup.sh"
	@echo "✅ 백업 완료"

monitor: ## 모니터링 대시보드
	@echo "Netdata: http://$(SERVER_IP):19999"
	@echo "Uptime Kuma: http://$(SERVER_IP):3001"
	@echo "Coolify: https://$(SERVER_IP):8000"

ssh: ## 서버 SSH 접속
	ssh root@$(SERVER_IP)

logs: ## 서버 로그 확인
	ssh root@$(SERVER_IP) "journalctl -f"

docker-ps: ## Docker 컨테이너 상태
	ssh root@$(SERVER_IP) "docker ps"

snapshot: ## 스냅샷 생성
	vultr-cli snapshot create \
		--instance-id $(shell cd $(TERRAFORM_DIR) && terraform output -raw instance_id) \
		--description "manual-$(shell date +%Y%m%d-%H%M%S)"

storage-add: ## Block Storage 추가
	cd $(TERRAFORM_DIR) && \
	terraform apply -target=vultr_block_storage.backup

import-existing: ## 기존 인프라 가져오기
	@echo "Instance ID를 입력하세요:"
	@read INSTANCE_ID && \
	cd $(TERRAFORM_DIR) && \
	terraform import vultr_instance.main $$INSTANCE_ID

validate: ## Terraform 구성 검증
	cd $(TERRAFORM_DIR) && terraform validate

fmt: ## Terraform 코드 포맷팅
	cd $(TERRAFORM_DIR) && terraform fmt -recursive

cost: ## 예상 비용 계산
	@echo "=== 월별 예상 비용 ==="
	@echo "인스턴스 (2vCPU, 16GB): \$$80"
	@echo "Block Storage (100GB): \$$10"
	@echo "스냅샷 (5개 평균): \$$5"
	@echo "총계: \$$95/월"
```

---

## 5. CI/CD 통합

### GitHub Actions
```yaml
# .github/workflows/infrastructure.yml
name: Infrastructure Management

on:
  workflow_dispatch:
    inputs:
      action:
        description: 'Action to perform'
        required: true
        default: 'plan'
        type: choice
        options:
          - plan
          - apply
          - destroy
          - backup

env:
  VULTR_API_KEY: ${{ secrets.VULTR_API_KEY }}

jobs:
  terraform:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Terraform
      uses: hashicorp/setup-terraform@v2
      with:
        terraform_version: 1.5.0
    
    - name: Terraform Init
      run: |
        cd infrastructure
        terraform init
    
    - name: Terraform Plan
      if: github.event.inputs.action == 'plan'
      run: |
        cd infrastructure
        terraform plan
    
    - name: Terraform Apply
      if: github.event.inputs.action == 'apply'
      run: |
        cd infrastructure
        terraform apply -auto-approve
    
    - name: Create Backup
      if: github.event.inputs.action == 'backup'
      run: |
        curl -L https://github.com/vultr/vultr-cli/releases/latest/download/vultr-cli_Linux_x86_64.tar.gz | tar xz
        ./vultr-cli snapshot create \
          --instance-id $(cd infrastructure && terraform output -raw instance_id) \
          --description "github-action-$(date +%Y%m%d)"
```

### GitLab CI/CD
```yaml
# .gitlab-ci.yml
stages:
  - validate
  - plan
  - apply

variables:
  TF_ROOT: ${CI_PROJECT_DIR}/infrastructure

before_script:
  - apk add --no-cache terraform
  - cd ${TF_ROOT}
  - terraform init

validate:
  stage: validate
  script:
    - terraform validate
    - terraform fmt -check

plan:
  stage: plan
  script:
    - terraform plan -out=tfplan
  artifacts:
    paths:
      - ${TF_ROOT}/tfplan
    expire_in: 7 days

apply:
  stage: apply
  script:
    - terraform apply tfplan
  when: manual
  only:
    - main
```

---

## 📌 Quick Start

### 1분 설정
```bash
# 1. API 키 설정
export VULTR_API_KEY="your-api-key"

# 2. Vultr CLI 설치
curl -L https://github.com/vultr/vultr-cli/releases/latest/download/vultr-cli_Linux_x86_64.tar.gz | tar xz
sudo mv vultr-cli /usr/local/bin/

# 3. 서버 확인
vultr-cli instance list

# 4. Block Storage 추가
vultr-cli block-storage create --region sgp --size 100 --label backup
```

### Terraform 빠른 시작
```bash
# 1. 프로젝트 클론
git clone <your-repo>
cd infrastructure

# 2. API 키 설정
echo 'vultr_api_key = "your-key"' > terraform.tfvars

# 3. 배포
terraform init
terraform apply

# 4. 접속 정보
terraform output ssh_command
```

---

## 🔒 보안 고려사항

1. **API 키 관리**
   - 절대 코드에 하드코딩하지 않기
   - 환경 변수 또는 시크릿 매니저 사용
   - 정기적으로 키 교체

2. **접근 제어**
   - IP 화이트리스트 설정
   - SSH 키 인증만 사용
   - 방화벽 규칙 최소화

3. **백업 암호화**
   - 백업 파일 암호화
   - 전송 중 SSL/TLS 사용
   - 접근 로그 모니터링

4. **모니터링**
   - 비정상 접근 알림
   - 리소스 사용량 추적
   - 보안 이벤트 로깅

---

## 📚 참고 자료

- [Vultr API 문서](https://www.vultr.com/api/)
- [Vultr CLI GitHub](https://github.com/vultr/vultr-cli)
- [Terraform Vultr Provider](https://registry.terraform.io/providers/vultr/vultr/latest/docs)
- [Coolify 문서](https://coolify.io/docs)

---

## 💡 문제 해결

### API 키 오류
```bash
# API 키 확인
echo $VULTR_API_KEY

# 권한 확인
vultr-cli account
```

### Terraform 상태 동기화
```bash
# 상태 새로고침
terraform refresh

# 상태 재구성
terraform init -reconfigure
```

### Block Storage 마운트 실패
```bash
# 디바이스 확인
lsblk

# 수동 마운트
mount /dev/vdb /mnt/blockstorage

# fstab 확인
cat /etc/fstab
```

---

*마지막 업데이트: 2024년 1월*