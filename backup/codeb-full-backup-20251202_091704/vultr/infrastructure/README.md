# 🏗️ Vultr Infrastructure with Terraform

Terraform을 사용하여 Vultr 인프라를 관리하는 프로젝트입니다.

## 📁 프로젝트 구조

```
infrastructure/
├── main.tf                   # 메인 리소스 정의 (서버, Storage)
├── providers.tf             # Provider 설정
├── variables.tf             # 변수 정의
├── outputs.tf               # 출력 변수
├── terraform.tfvars         # 설정 값 (gitignore됨)
├── terraform.tfvars.example # 설정 예시
├── import.sh                # 기존 인프라 Import 스크립트
├── import.tf                # Import 가이드
├── .gitignore               # Git 제외 파일
├── scripts/
│   └── user-data.sh         # 서버 초기 설정 스크립트
└── README.md                # 이 파일
```

## 🚀 빠른 시작

### 1. 설정 파일 준비
```bash
# terraform.tfvars 파일 생성
cp terraform.tfvars.example terraform.tfvars

# API 키 설정
echo 'vultr_api_key = "YOUR_API_KEY"' > terraform.tfvars
```

### 2. Terraform 초기화
```bash
terraform init
```

### 3. 기존 인프라 Import (선택사항)
```bash
# 기존 서버와 Storage가 있는 경우
./import.sh
```

### 4. 계획 확인
```bash
terraform plan
```

### 5. 인프라 배포
```bash
terraform apply
```

## 🛠️ 관리되는 리소스

### 현재 리소스
- **Vultr Instance**: Coolify 서버 (2 vCPU, 16GB RAM)
- **Block Storage**: 100GB 백업 스토리지
- **Firewall Group**: 보안 규칙
- **Reserved IP**: 고정 IP (선택사항)

### 예상 비용
- 서버: ~$80/월
- Block Storage: ~$2.50/월
- **총 비용**: ~$82.50/월

## 📋 주요 명령어

### 현재 상태 확인
```bash
terraform show
```

### 특정 리소스 정보 확인
```bash
terraform state show vultr_instance.coolify
terraform state show vultr_block_storage.backup
```

### 변경사항 적용
```bash
terraform plan    # 변경사항 미리보기
terraform apply   # 변경사항 적용
```

### 리소스 삭제 (주의!)
```bash
terraform destroy  # 모든 리소스 삭제
```

## 🔧 사용자 정의

### 서버 스펙 변경
`terraform.tfvars`에서 서버 설정 수정:
```hcl
server_config = {
  plan        = "vc2-4c-32gb"    # 4 vCPU, 32GB RAM으로 업그레이드
  os_id       = 1743              # Ubuntu 22.04 x64
  label       = "coolify-server"
  hostname    = "coolify"
  enable_ipv6 = false
  backups     = "disabled"
  ddos_protection = false
}
```

### Block Storage 크기 변경
```hcl
block_storage_config = {
  size_gb     = 200              # 200GB로 확장
  label       = "coolify-backup"
  block_type  = "storage_opt"
}
```

### SSH 키 추가
```hcl
ssh_keys = [
  "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ... user@laptop",
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... user@desktop"
]
```

## 🔍 출력 정보

Terraform 적용 후 다음 정보들이 출력됩니다:

```bash
# 서버 정보 확인
terraform output server_ip
terraform output ssh_command

# 비용 정보 확인
terraform output monthly_cost

# 전체 출력 확인
terraform output
```

## 🔐 보안 주의사항

1. **API 키 보안**
   - `terraform.tfvars` 파일은 `.gitignore`에 포함됨
   - API 키를 절대 GitHub에 커밋하지 마세요

2. **State 파일 백업**
   - `terraform.tfstate`는 중요한 파일입니다
   - 정기적으로 백업하세요

3. **방화벽 설정**
   - 기본적으로 SSH(22), HTTP(80), HTTPS(443), Coolify(8000) 포트만 열림
   - 필요시 `variables.tf`에서 수정

## 🚨 문제 해결

### Import 오류 발생 시
```bash
# 기존 state 정리
terraform state rm vultr_instance.coolify
terraform state rm vultr_block_storage.backup

# 다시 import
./import.sh
```

### Plan에서 재생성 표시 시
```bash
# 현재 리소스 상태 확인
terraform refresh

# 설정과 실제 상태 비교
terraform plan -detailed-exitcode
```

### State 파일 손상 시
```bash
# State 백업에서 복원
cp terraform.tfstate.backup terraform.tfstate

# 또는 Remote state 사용 권장
```

## 🔄 CI/CD 통합

GitHub Actions를 통한 자동화 예시:

```yaml
name: Terraform
on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  terraform:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: hashicorp/setup-terraform@v2
    
    - name: Terraform Init
      run: terraform init
      working-directory: infrastructure
      
    - name: Terraform Plan
      run: terraform plan
      working-directory: infrastructure
      env:
        TF_VAR_vultr_api_key: ${{ secrets.VULTR_API_KEY }}
```

## 📞 지원

문제가 발생하면:
1. `terraform plan`으로 상태 확인
2. `terraform show`로 현재 리소스 상태 확인
3. Vultr 콘솔에서 실제 리소스 상태 비교

---

**작성일**: 2025-08-15
**Terraform Version**: 1.5+
**Vultr Provider**: 2.19+