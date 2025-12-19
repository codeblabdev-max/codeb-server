# SSH Key (optional - if provided)
resource "vultr_ssh_key" "main" {
  count   = length(var.ssh_keys) > 0 ? length(var.ssh_keys) : 0
  name    = "terraform-key-${count.index}"
  ssh_key = var.ssh_keys[count.index]
}

# Firewall Group
resource "vultr_firewall_group" "main" {
  description = "Coolify Server Firewall Rules"
}

# Firewall Rules
resource "vultr_firewall_rule" "rules" {
  for_each = { for idx, rule in var.firewall_rules : idx => rule }
  
  firewall_group_id = vultr_firewall_group.main.id
  ip_type          = each.value.ip_type
  protocol         = each.value.protocol
  subnet           = each.value.subnet
  subnet_size      = each.value.subnet_size
  port             = each.value.port
  notes            = each.value.notes
}

# Main Server Instance
resource "vultr_instance" "coolify" {
  region              = var.region
  plan                = var.server_config.plan
  os_id               = var.server_config.os_id
  label               = var.server_config.label
  hostname            = var.server_config.hostname
  enable_ipv6         = var.server_config.enable_ipv6
  backups             = var.server_config.backups
  ddos_protection     = var.server_config.ddos_protection
  activation_email    = false
  firewall_group_id   = vultr_firewall_group.main.id
  ssh_key_ids        = length(vultr_ssh_key.main) > 0 ? vultr_ssh_key.main[*].id : []
  
  tags = var.tags

  # User data script for initial setup
  user_data = base64encode(templatefile("${path.module}/scripts/user-data.sh", {
    hostname = var.server_config.hostname
  }))

  lifecycle {
    create_before_destroy = true
    ignore_changes = [
      user_data,  # Don't recreate on user_data changes
      os_id,      # Don't recreate on OS changes
    ]
  }
}

# Block Storage
resource "vultr_block_storage" "backup" {
  region     = var.region
  size_gb    = var.block_storage_config.size_gb
  label      = var.block_storage_config.label
  block_type = var.block_storage_config.block_type

  lifecycle {
    prevent_destroy = true  # Prevent accidental deletion of backup storage
  }
}

# Attach Block Storage to Instance
resource "vultr_block_storage_attach" "backup_attach" {
  block_storage_id = vultr_block_storage.backup.id
  instance_id      = vultr_instance.coolify.id
  
  depends_on = [
    vultr_instance.coolify,
    vultr_block_storage.backup
  ]
}

# Reserved IP (optional - for production stability)
resource "vultr_reserved_ip" "main" {
  count       = 1
  region      = var.region
  ip_type     = "v4"
  label       = "coolify-reserved-ip"
  instance_id = vultr_instance.coolify.id
}

# Snapshot for backup (manual trigger)
resource "vultr_snapshot" "backup" {
  count       = 0  # Set to 1 to create snapshot
  instance_id = vultr_instance.coolify.id
  description = "Coolify Backup - ${formatdate("YYYY-MM-DD", timestamp())}"
}

# DNS Records (optional - uncomment if managing DNS through Vultr)
# resource "vultr_dns_domain" "main" {
#   domain = "example.com"
#   ip     = vultr_instance.coolify.main_ip
# }

# resource "vultr_dns_record" "www" {
#   domain = vultr_dns_domain.main.id
#   name   = "www"
#   type   = "A"
#   data   = vultr_instance.coolify.main_ip
#   ttl    = 300
# }