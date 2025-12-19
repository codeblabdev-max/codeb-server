# CodeB Infrastructure - Variables
# 3-Layer Architecture: Provisioning Layer
#
# 변수 정의 파일

# =====================================================
# 필수 변수
# =====================================================

variable "vultr_api_key" {
  description = "Vultr API 키"
  type        = string
  sensitive   = true
}

variable "ssh_public_key" {
  description = "SSH 공개키 내용"
  type        = string
  sensitive   = true
}

# =====================================================
# 서버 관리 설정
# =====================================================

variable "import_existing_test_server" {
  description = "기존 테스트 서버(141.164.60.51) import 여부"
  type        = bool
  default     = true
}

variable "create_production_server" {
  description = "새 프로덕션 서버 생성 여부"
  type        = bool
  default     = false
}

variable "test_server_plan" {
  description = "테스트 서버 플랜"
  type        = string
  default     = "vc2-2c-16gb"  # 현재 141 서버 스펙
}

variable "production_server_plan" {
  description = "프로덕션 서버 플랜"
  type        = string
  default     = "vc2-4c-8gb"

  # 권장 플랜:
  # vc2-2c-4gb  : 2 vCPU,  4GB RAM,  80GB SSD - $24/월 (소규모)
  # vc2-4c-8gb  : 4 vCPU,  8GB RAM, 160GB SSD - $48/월 (권장)
  # vc2-6c-16gb : 6 vCPU, 16GB RAM, 320GB SSD - $96/월 (대규모)
}

# =====================================================
# 프로젝트 설정
# =====================================================

variable "project_name" {
  description = "프로젝트 이름"
  type        = string
  default     = "codeb"
}

variable "environment" {
  description = "환경 (production, staging)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "environment는 production, staging, development 중 하나여야 합니다."
  }
}

# =====================================================
# Vultr 설정
# =====================================================

variable "vultr_region" {
  description = "Vultr 리전 코드 (icn=서울, nrt=도쿄, sgp=싱가포르)"
  type        = string
  default     = "icn"
}

variable "enable_backups" {
  description = "자동 백업 활성화 (추가 비용 발생)"
  type        = bool
  default     = true
}

# =====================================================
# 네트워크 설정
# =====================================================

variable "domain" {
  description = "메인 도메인"
  type        = string
  default     = "one-q.xyz"  # 새 도메인
}

variable "manage_dns" {
  description = "Terraform으로 DNS 관리 여부 (PowerDNS 사용 시 false)"
  type        = bool
  default     = false
}

variable "allowed_ssh_cidr" {
  description = "SSH 접근 허용 IP 대역 (보안을 위해 제한 권장)"
  type        = string
  default     = "0.0.0.0/0"  # 모든 IP 허용 - 프로덕션에서는 제한 권장
}

# =====================================================
# 태그
# =====================================================

variable "tags" {
  description = "추가 태그"
  type        = list(string)
  default     = []
}
