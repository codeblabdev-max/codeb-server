# 📋 서버 관리 프로젝트 종합 정리

## 🔑 API 정보
- **Vultr API Key**: `AMB4DGAONZFB7JVUM5AL2EY7L4TSG7RUVVUA`
- **계정 이메일**: cdekym77@gmail.com
- **계정 이름**: dongeun cheon

## 🖥️ 현재 서버 구성

### 서버 1 (메인 - Coolify)
- **IP**: 141.164.60.51
- **Instance ID**: 0c099e4d-29f0-4c54-b60f-4cdd375ac2d4
- **스펙**: 2 vCPU, 16GB RAM, 100GB SSD
- **OS**: Ubuntu 22.04 x64
- **용도**: Coolify PaaS, Docker 컨테이너 44개 운영
- **월 비용**: ~$80
- **상태**: ✅ 운영 중

### 서버 2 (삭제 예정 - CyberPanel)
- **IP**: 158.247.233.83
- **Instance ID**: 3a8c65b6-ea72-40e3-b33f-1ba67a4731be
- **스펙**: 1 vCPU, 2GB RAM, 25GB SSD
- **OS**: Marketplace (CyberPanel)
- **용도**: 거의 사용 안 함 (140MB 데이터만 존재)
- **월 비용**: ~$12
- **상태**: ⚠️ 삭제 예정 (데이터는 백업 완료)

### 백업된 데이터
- **위치**: `~/Documents/server2-backup-20250815/`
- **내용**: ntcap.kr (85MB), one-q.kr (55MB)
- **총 크기**: 114MB (압축)

## 📝 생성된 문서들

### 1. 인프라 자동화 가이드
**파일**: `VULTR_INFRASTRUCTURE_AUTOMATION.md`
- Vultr CLI 설치 및 설정
- Terraform 인프라 코드화 (완전한 구성)
- 자동화 스크립트
- CI/CD 통합 방법

### 2. 서버 강화 상세 계획
**파일**: `SERVER_ENHANCEMENT_DETAILED_PLAN.md`
- Vultr Block Storage 설정 ($10/월)
- Backblaze B2 백업 ($5/월)
- Netdata 모니터링 (무료)
- Uptime Kuma 서비스 모니터링 (무료)
- Fail2ban + CrowdSec 보안 (무료)

### 3. 관리 스크립트
**파일**: `vultr-manager.sh`
- 대화형 메뉴 시스템
- 서버 상태 확인
- Block Storage 추가
- 스냅샷 생성
- 서버 재시작
- 비용 확인
- 서버 2 삭제 기능

### 4. 분석 문서들
- `SERVER_CONFIGURATION_REPORT.md` - 서버 현재 구성
- `SERVER1_NEEDS_ANALYSIS.md` - 서버 1 필요사항 분석
- `SERVER_COST_COMPARISON.md` - 비용 비교 분석
- `SERVER2_DATA_INVENTORY.md` - 서버 2 데이터 목록

## 🎯 권장 실행 계획

### Phase 1: 즉시 실행 (Day 1)
```bash
# 1. Vultr CLI 설정
export VULTR_API_KEY="AMB4DGAONZFB7JVUM5AL2EY7L4TSG7RUVVUA"
brew install vultr/vultr-cli/vultr-cli

# 2. Block Storage 추가 (100GB)
./vultr-manager.sh
# 메뉴에서 2번 선택

# 3. 서버 1 스냅샷 생성
./vultr-manager.sh
# 메뉴에서 3번 선택 → 서버 1 선택
```

### Phase 2: 서버 설정 (Day 2)
```bash
# 서버 1 접속
ssh root@141.164.60.51

# Block Storage 마운트
lsblk  # 디바이스 확인 (보통 /dev/vdb)
mkfs.ext4 /dev/vdb
mkdir -p /mnt/blockstorage
mount /dev/vdb /mnt/blockstorage
echo '/dev/vdb /mnt/blockstorage ext4 defaults,nofail 0 0' >> /etc/fstab

# 백업 디렉토리 구성
mkdir -p /mnt/blockstorage/{backups,docker-volumes,logs,snapshots}
mkdir -p /mnt/blockstorage/backups/{daily,weekly,monthly}
```

### Phase 3: 모니터링 설치 (Day 3)
```bash
# Netdata 설치
bash <(curl -Ss https://get.netdata.cloud/kickstart.sh)

# Uptime Kuma 설치
mkdir -p /root/uptime-kuma
cd /root/uptime-kuma
# docker-compose.yml 생성 (문서 참조)
docker-compose up -d
```

### Phase 4: 보안 강화 (Day 4)
```bash
# Fail2ban 설치
apt update && apt install -y fail2ban
systemctl enable fail2ban

# CrowdSec 설치 (선택사항)
curl -s https://install.crowdsec.net | sudo sh
```

### Phase 5: 서버 2 삭제 (Day 7)
```bash
# 데이터 백업 확인
ls -la ~/Documents/server2-backup-20250815/

# 서버 2 삭제
./vultr-manager.sh
# 메뉴에서 6번 선택 → 확인 후 DELETE 입력
```

## 💰 비용 분석

### 현재 비용
- 서버 1: $80/월
- 서버 2: $12/월
- **총**: $92/월

### 최적화 후 비용
- 서버 1: $80/월
- Block Storage: $10/월
- Backblaze B2: $5/월
- ~~서버 2~~: $0 (삭제)
- **총**: $95/월 (+$3, 하지만 훨씬 안정적)

## 🔧 Terraform 구성 (선택사항)

### 프로젝트 구조
```
infrastructure/
├── terraform.tfvars      # API 키 (gitignore)
├── variables.tf          # 변수 정의
├── providers.tf          # Vultr Provider
├── main.tf              # 서버, Storage, 방화벽
└── outputs.tf           # 출력 값
```

### 빠른 시작
```bash
cd infrastructure
echo 'vultr_api_key = "AMB4DGAONZFB7JVUM5AL2EY7L4TSG7RUVVUA"' > terraform.tfvars
terraform init
terraform plan
terraform apply
```

## 📌 중요 명령어 모음

### Vultr CLI
```bash
# 계정 정보
vultr-cli account info

# 서버 목록
vultr-cli instance list

# Block Storage 생성
vultr-cli block-storage create --region icn --size 100 --label backup

# 스냅샷 생성
vultr-cli snapshot create --instance-id [ID] --description "backup"

# 서버 재시작
vultr-cli instance restart [ID]
```

### SSH 접속
```bash
# 서버 1 (Coolify)
ssh root@141.164.60.51

# 서버 2 (CyberPanel) - 삭제 예정
ssh root@158.247.233.83
```

## ⚠️ 주의사항

1. **API 키 보안**
   - 절대 GitHub에 커밋하지 않기
   - 환경변수로만 사용
   - .gitignore에 terraform.tfvars 추가

2. **서버 2 삭제 전**
   - 백업 파일 확인: `~/Documents/server2-backup-20250815/`
   - DNS 레코드 이전 필요시 처리

3. **Block Storage 마운트**
   - 처음 한 번만 포맷 (`mkfs.ext4`)
   - fstab에 추가하여 재부팅 후에도 자동 마운트

## 🚀 다음 단계

새 프로젝트에서 실행할 순서:
1. Vultr CLI 설치
2. API 키 설정
3. `vultr-manager.sh` 실행
4. Block Storage 추가
5. 서버 1 강화 설정
6. 서버 2 삭제

---

**생성일**: 2025-08-15
**작성자**: Claude (SuperClaude Framework)
**프로젝트**: REVU Platform 서버 인프라 최적화