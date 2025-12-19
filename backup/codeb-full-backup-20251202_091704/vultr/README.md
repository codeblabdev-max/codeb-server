# 🌐 Vultr 서버 관리 도구

CodeB 서버용 Vultr 클라우드 인프라 관리 도구 모음입니다.

## 📁 구성 파일

### 🔧 관리 도구
- **`vultr-manager.sh`** - 대화형 Vultr 서버 관리 스크립트
- **`infrastructure/`** - Terraform 기반 인프라 관리
- **`VULTR_INFRASTRUCTURE_AUTOMATION.md`** - 자동화 가이드
- **`SERVER_COST_COMPARISON.md`** - 서버 비용 분석

## 🚀 현재 서버 구성

### 서버 1: Coolify 서버 (141.164.60.51)
- **스펙**: 2 vCPU, 16GB RAM, 160GB SSD
- **용도**: CodeB API 서버, 프로젝트 호스팅
- **비용**: ~$80/월
- **추가 스토리지**: 98GB Block Storage 연결됨

### 서버 2: CyberPanel 서버 (158.247.233.83) 
- **스펙**: 1 vCPU, 2GB RAM, 55GB SSD
- **용도**: 백업 서버 (삭제 예정)
- **비용**: ~$12/월

## 🎯 주요 기능

### 1. Vultr Manager 스크립트
```bash
# 실행
./vultr-manager.sh

# 주요 기능
1. 서버 상태 확인
2. Block Storage 추가 (100GB)
3. 스냅샷 생성
4. 서버 재시작
5. 백업 목록 확인
6. 서버 2 삭제 (⚠️ 주의)
7. 비용 확인
8. 서버 1 강화 빠른 설정
```

### 2. Terraform 인프라 관리
```bash
cd infrastructure/

# 초기화
terraform init

# 기존 인프라 Import
./import.sh

# 계획 확인
terraform plan

# 적용
terraform apply
```

## ⚙️ 설정 방법

### 1. Vultr CLI 설치
```bash
# macOS
brew install vultr-cli

# Linux
curl -L https://github.com/vultr/vultr-cli/releases/latest/download/vultr-cli_linux_amd64.tar.gz | tar -xz
sudo mv vultr-cli /usr/local/bin/
```

### 2. API 키 설정
```bash
# 환경변수 설정
export VULTR_API_KEY='your-vultr-api-key'

# 또는 ~/.bashrc에 추가
echo 'export VULTR_API_KEY="your-vultr-api-key"' >> ~/.bashrc
```

### 3. Terraform 설정
```bash
cd infrastructure/
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars 파일에서 API 키 설정
```

## 💰 현재 비용 구성

| 항목 | 스펙 | 월 비용 |
|------|------|---------|
| 서버 1 (Coolify) | 2 vCPU, 16GB RAM | $80 |
| Block Storage | 98GB | $2.45 |
| 서버 2 (삭제예정) | 1 vCPU, 2GB RAM | $12 |
| **현재 총 비용** |  | **$94.45/월** |
| **서버 2 삭제 후** |  | **$82.45/월** |

## 🔒 보안 설정

### 현재 방화벽 규칙 (서버 1)
- **SSH**: 22번 포트
- **HTTP**: 80번 포트  
- **HTTPS**: 443번 포트
- **API**: 3008번 포트 (CodeB API)
- **Coolify**: 8000번 포트
- **프로젝트 포트**: 4000-4999번 포트

### 설치된 보안 도구
- **Fail2ban**: 무차별 대입 공격 방지
- **UFW**: 방화벽 관리
- **Let's Encrypt**: 자동 SSL 인증서

## 📊 모니터링

### 설치된 모니터링 도구
- **Netdata**: 실시간 시스템 모니터링 (http://141.164.60.51:19999)
- **PM2**: 프로세스 관리 및 로그
- **Coolify**: Docker 컨테이너 모니터링

### 로그 위치
```bash
# CodeB API 로그
/mnt/blockstorage/logs/api-server.log

# 시스템 로그  
/mnt/blockstorage/logs/system.log

# PM2 로그
~/.pm2/logs/
```

## 🚨 백업 전략

### 1. 자동 스냅샷 (계획)
- **주기**: 일간 (새벽 2시)
- **보관**: 7일
- **대상**: 서버 1 전체

### 2. Block Storage 백업
- **데이터베이스**: 일간 자동 백업
- **프로젝트 파일**: 증분 백업
- **시스템 설정**: 주간 백업

### 3. 오프사이트 백업 (계획)
- **대상**: 중요 데이터
- **주기**: 주간
- **저장소**: AWS S3 또는 다른 클라우드

## 🔧 유지보수 작업

### 주간 작업
- [ ] 서버 상태 확인
- [ ] 디스크 사용량 점검 
- [ ] 백업 상태 확인
- [ ] 보안 업데이트 적용

### 월간 작업  
- [ ] 스냅샷 정리
- [ ] 비용 검토
- [ ] 성능 분석
- [ ] 불필요한 파일 정리

## 📞 지원 및 문의

문제 발생 시:
1. **서버 상태**: `./vultr-manager.sh` → 옵션 1
2. **로그 확인**: `journalctl -u codeb-api-server -f`
3. **리소스 확인**: `df -h`, `free -h`, `top`

---

**업데이트**: 2025-08-21
**CodeB CLI v2.1**: 통합 관리 도구로 발전