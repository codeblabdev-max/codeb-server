variable "vultr_api_key" {
  description = "Vultr API Key"
  type        = string
  sensitive   = true
}

variable "region" {
  description = "Vultr region for resources"
  type        = string
  default     = "icn"  # Seoul
}

variable "server_config" {
  description = "Server configuration"
  type = object({
    plan        = string
    os_id       = number
    label       = string
    hostname    = string
    enable_ipv6 = bool
    backups     = string
    ddos_protection = bool
  })
  default = {
    plan        = "vc2-2c-16gb"    # 2 vCPU, 16GB RAM
    os_id       = 1743              # Ubuntu 22.04 x64
    label       = "coolify-server"
    hostname    = "coolify"
    enable_ipv6 = false
    backups     = "disabled"
    ddos_protection = false
  }
}

variable "block_storage_config" {
  description = "Block Storage configuration"
  type = object({
    size_gb     = number
    label       = string
    block_type  = string
  })
  default = {
    size_gb     = 100
    label       = "coolify-backup"
    block_type  = "storage_opt"
  }
}

variable "ssh_keys" {
  description = "SSH public keys for server access"
  type        = list(string)
  default     = []
}

variable "firewall_rules" {
  description = "Firewall rules configuration"
  type = list(object({
    ip_type     = string
    protocol    = string
    subnet      = string
    subnet_size = number
    port        = string
    notes       = string
  }))
  default = [
    {
      ip_type     = "v4"
      protocol    = "tcp"
      subnet      = "0.0.0.0"
      subnet_size = 0
      port        = "22"
      notes       = "SSH"
    },
    {
      ip_type     = "v4"
      protocol    = "tcp"
      subnet      = "0.0.0.0"
      subnet_size = 0
      port        = "80"
      notes       = "HTTP"
    },
    {
      ip_type     = "v4"
      protocol    = "tcp"
      subnet      = "0.0.0.0"
      subnet_size = 0
      port        = "443"
      notes       = "HTTPS"
    },
    {
      ip_type     = "v4"
      protocol    = "tcp"
      subnet      = "0.0.0.0"
      subnet_size = 0
      port        = "8000"
      notes       = "Coolify UI"
    }
  ]
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = list(string)
  default     = ["production", "coolify", "managed-by-terraform"]
}