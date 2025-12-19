# CodeB Infrastructure

> DevOps 자동화를 위한 인프라 코드 모음

## 📁 디렉토리 구조

```
infrastructure/
├── quadlet/              # Podman Quadlet 설정 (systemd 통합)
│   ├── app.container     # 앱 컨테이너 정의
│   ├── postgres.container # PostgreSQL 컨테이너
│   ├── redis.container   # Redis 컨테이너
│   ├── network.network   # 컨테이너 네트워크
│   ├── config/           # 환경변수 템플릿
│   └── install-quadlet.sh # 설치 스크립트
│
├── terraform/            # Vultr IaC (Infrastructure as Code)
│   ├── main.tf          # 메인 리소스 정의
│   ├── variables.tf     # 변수 정의
│   ├── terraform.tfvars.example # 변수 값 예시
│   └── scripts/         # 초기화 스크립트
│
├── ansible/             # 서버 설정 자동화
│   ├── inventory.yml    # 서버 목록
│   └── playbooks/       # 자동화 플레이북
│       ├── setup-server.yml  # 서버 초기 설정
│       ├── deploy-app.yml    # 앱 배포
│       └── backup.yml        # 백업
│
└── scripts/             # 유틸리티 스크립트
    └── setup-backup-cron.sh  # 백업 cron 설정
```

## 🚀 빠른 시작

### 1. Quadlet (Podman + systemd)

```bash
# 서버에서 실행
cd infrastructure/quadlet
bash install-quadlet.sh
```

**요구사항**: Podman 4.4+ (Quadlet 지원)

### 2. Terraform (IaC)

```bash
cd infrastructure/terraform

# 변수 설정
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars 편집...

# 적용
terraform init
terraform plan
terraform apply
```

**요구사항**: Terraform 1.0+, Vultr API 키

### 3. Ansible

```bash
cd infrastructure/ansible

# 서버 초기 설정
ansible-playbook -i inventory.yml playbooks/setup-server.yml

# 앱 배포
ansible-playbook -i inventory.yml playbooks/deploy-app.yml

# 백업
ansible-playbook -i inventory.yml playbooks/backup.yml
```

**요구사항**: Ansible 2.9+

### 4. 자동 백업 설정

```bash
# 서버에서 실행
cd infrastructure/scripts
bash setup-backup-cron.sh
```

## 📋 현재 상태

| 구성요소 | 상태 | 설명 |
|---------|------|------|
| Quadlet | ⚠️ 준비됨 | Podman 4.4+ 필요 (현재 3.4.4) |
| Terraform | ✅ 준비됨 | Vultr VPS 프로비저닝 |
| Ansible | ✅ 준비됨 | 서버 설정 자동화 |
| 백업 스크립트 | ✅ 준비됨 | PostgreSQL, Redis, 설정 |

## 🔧 환경별 설정

### Production

```bash
# Terraform
environment = "production"

# Ansible
ansible-playbook -i inventory.yml playbooks/deploy-app.yml -l production
```

### Staging

```bash
# Terraform (별도 워크스페이스)
terraform workspace new staging
terraform apply

# Ansible
ansible-playbook -i inventory.yml playbooks/deploy-app.yml -l staging
```

## 📌 주의사항

1. **시크릿 관리**: `terraform.tfvars`, `*.env` 파일은 `.gitignore`에 추가
2. **백업**: 첫 배포 전 `setup-backup-cron.sh` 실행
3. **Podman 버전**: Quadlet은 4.4+ 필요, 그 이하는 수동 systemd 사용

## 📚 관련 문서

- [DEVOPS_COMPLETE_GUIDE.md](../docs/DEVOPS_COMPLETE_GUIDE.md) - 전체 DevOps 가이드
- [CICD_ARCHITECTURE.md](../docs/CICD_ARCHITECTURE.md) - CI/CD 아키텍처
- [DECISION_LOG.md](../docs/DECISION_LOG.md) - 의사결정 기록
