# CodeB Infrastructure - Terraform Configuration
# 3-Layer Architecture: Provisioning Layer
#
# 사용법:
#   1. cp terraform.tfvars.example terraform.tfvars
#   2. terraform.tfvars 파일에 API 키 설정
#   3. terraform init
#   4. terraform plan
#   5. terraform apply
#
# 기존 서버 Import:
#   terraform import vultr_instance.test_server 0c099e4d-29f0-4c54-b60f-4cdd375ac2d4

terraform {
  required_version = ">= 1.0"

  required_providers {
    vultr = {
      source  = "vultr/vultr"
      version = "~> 2.0"
    }
  }

  # 상태 저장 (로컬 - 프로덕션에서는 S3/GCS 권장)
  # backend "s3" {
  #   bucket = "codeb-terraform-state"
  #   key    = "production/terraform.tfstate"
  #   region = "ap-northeast-2"
  # }
}

# Vultr Provider 설정
provider "vultr" {
  api_key     = var.vultr_api_key
  rate_limit  = 100
  retry_limit = 3
}

# =====================================================
# Data Sources
# =====================================================
data "vultr_os" "ubuntu" {
  filter {
    name   = "name"
    values = ["Ubuntu 22.04 LTS x64"]
  }
}

# =====================================================
# SSH Key
# =====================================================
resource "vultr_ssh_key" "deploy" {
  name    = "codeb-deploy-key"
  ssh_key = var.ssh_public_key

  lifecycle {
    prevent_destroy = true
  }
}

# =====================================================
# Test Server (141.164.60.51) - 기존 서버
# 용도: 테스트 환경 + 네임서버
# Import: terraform import vultr_instance.test_server 0c099e4d-29f0-4c54-b60f-4cdd375ac2d4
# =====================================================
resource "vultr_instance" "test_server" {
  count = var.import_existing_test_server ? 1 : 0

  plan   = var.test_server_plan
  region = var.vultr_region
  os_id  = data.vultr_os.ubuntu.id

  label    = "codeb-test"
  hostname = "codeb-test"

  ssh_key_ids = [vultr_ssh_key.deploy.id]
  enable_ipv6 = true
  backups     = "enabled"

  tags = [
    "codeb",
    "test",
    "nameserver",
    "managed-by-terraform"
  ]

  # 삭제/재생성 방지 - 매우 중요!
  lifecycle {
    prevent_destroy = true

    # 이 속성들이 변경되어도 재생성하지 않음
    ignore_changes = [
      user_data,
      os_id,
      plan,
      ssh_key_ids
    ]
  }
}

# =====================================================
# Production Server (신규)
# 용도: App + DB + Redis + Socket + Storage
# =====================================================
resource "vultr_instance" "production_server" {
  count = var.create_production_server ? 1 : 0

  plan   = var.production_server_plan
  region = var.vultr_region
  os_id  = data.vultr_os.ubuntu.id

  label    = "codeb-production"
  hostname = "codeb-production"

  ssh_key_ids = [vultr_ssh_key.deploy.id]
  enable_ipv6 = true
  backups     = "enabled"

  # 부팅 시 실행 스크립트 (cloud-init)
  user_data = templatefile("${path.module}/scripts/cloud-init.yaml", {
    project_name   = var.project_name
    environment    = "production"
    podman_version = "4.6"
  })

  tags = [
    "codeb",
    "production",
    "app",
    "managed-by-terraform"
  ]

  # 삭제/재생성 방지
  lifecycle {
    prevent_destroy = true

    ignore_changes = [
      user_data,
      os_id
    ]
  }
}

# =====================================================
# Firewall Group - 공통
# =====================================================
resource "vultr_firewall_group" "codeb" {
  description = "CodeB Server Firewall"

  lifecycle {
    prevent_destroy = true
  }
}

# SSH 접근 (포트 22)
resource "vultr_firewall_rule" "ssh" {
  firewall_group_id = vultr_firewall_group.codeb.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = var.allowed_ssh_cidr
  subnet_size       = split("/", var.allowed_ssh_cidr)[1]
  port              = "22"
  notes             = "SSH Access"
}

# HTTP (포트 80)
resource "vultr_firewall_rule" "http" {
  firewall_group_id = vultr_firewall_group.codeb.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = "80"
  notes             = "HTTP"
}

# HTTPS (포트 443)
resource "vultr_firewall_rule" "https" {
  firewall_group_id = vultr_firewall_group.codeb.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = "443"
  notes             = "HTTPS"
}

# App Ports (3000-3999)
resource "vultr_firewall_rule" "app_ports" {
  firewall_group_id = vultr_firewall_group.codeb.id
  protocol          = "tcp"
  ip_type           = "v4"
  subnet            = "0.0.0.0"
  subnet_size       = 0
  port              = "3000:3999"
  notes             = "Application Ports"
}

# =====================================================
# DNS 설정 (PowerDNS 사용 시 비활성화)
# =====================================================
resource "vultr_dns_domain" "main" {
  count = var.manage_dns ? 1 : 0

  domain   = var.domain
  dns_sec  = "disabled"

  lifecycle {
    prevent_destroy = true
  }
}

# A 레코드 - 메인 도메인
resource "vultr_dns_record" "apex" {
  count = var.manage_dns ? 1 : 0

  domain = vultr_dns_domain.main[0].domain
  name   = ""
  type   = "A"
  data   = var.import_existing_test_server ? vultr_instance.test_server[0].main_ip : vultr_instance.production_server[0].main_ip
  ttl    = 300
}

# A 레코드 - 와일드카드
resource "vultr_dns_record" "wildcard" {
  count = var.manage_dns ? 1 : 0

  domain = vultr_dns_domain.main[0].domain
  name   = "*"
  type   = "A"
  data   = var.import_existing_test_server ? vultr_instance.test_server[0].main_ip : vultr_instance.production_server[0].main_ip
  ttl    = 300
}

# =====================================================
# Outputs
# =====================================================
output "test_server" {
  description = "테스트 서버 정보"
  value = var.import_existing_test_server ? {
    id     = vultr_instance.test_server[0].id
    ip     = vultr_instance.test_server[0].main_ip
    ipv6   = vultr_instance.test_server[0].v6_main_ip
    ssh    = "ssh root@${vultr_instance.test_server[0].main_ip}"
    status = vultr_instance.test_server[0].status
  } : null
}

output "production_server" {
  description = "프로덕션 서버 정보"
  value = var.create_production_server ? {
    id     = vultr_instance.production_server[0].id
    ip     = vultr_instance.production_server[0].main_ip
    ipv6   = vultr_instance.production_server[0].v6_main_ip
    ssh    = "ssh root@${vultr_instance.production_server[0].main_ip}"
    status = vultr_instance.production_server[0].status
  } : null
}

output "firewall_group_id" {
  description = "방화벽 그룹 ID"
  value       = vultr_firewall_group.codeb.id
}

output "ssh_key_id" {
  description = "SSH 키 ID"
  value       = vultr_ssh_key.deploy.id
}
