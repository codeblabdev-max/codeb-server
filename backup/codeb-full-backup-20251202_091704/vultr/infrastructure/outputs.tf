output "server_id" {
  description = "ID of the Vultr instance"
  value       = vultr_instance.coolify.id
}

output "server_ip" {
  description = "Main IP address of the server"
  value       = vultr_instance.coolify.main_ip
}

output "server_status" {
  description = "Current status of the server"
  value       = vultr_instance.coolify.status
}

output "server_vcpu" {
  description = "Number of vCPUs"
  value       = vultr_instance.coolify.vcpu_count
}

output "server_ram" {
  description = "RAM in MB"
  value       = vultr_instance.coolify.ram
}

output "server_disk" {
  description = "Disk size in GB"
  value       = vultr_instance.coolify.disk
}

output "server_region" {
  description = "Server region"
  value       = vultr_instance.coolify.region
}

output "block_storage_id" {
  description = "ID of the block storage"
  value       = vultr_block_storage.backup.id
}

output "block_storage_size" {
  description = "Size of block storage in GB"
  value       = vultr_block_storage.backup.size_gb
}

output "block_storage_mount_id" {
  description = "Mount ID for the block storage"
  value       = vultr_block_storage.backup.mount_id
}

output "firewall_group_id" {
  description = "ID of the firewall group"
  value       = vultr_firewall_group.main.id
}

output "reserved_ip" {
  description = "Reserved IP address (if created)"
  value       = length(vultr_reserved_ip.main) > 0 ? vultr_reserved_ip.main[0].subnet : "Not created"
}

output "monthly_cost" {
  description = "Estimated monthly costs"
  value = {
    server        = "$80 (approx)"
    block_storage = "$${vultr_block_storage.backup.size_gb * 0.025}"
    total         = "$${80 + (vultr_block_storage.backup.size_gb * 0.025)}"
  }
}

output "ssh_command" {
  description = "SSH connection command"
  value       = "ssh root@${vultr_instance.coolify.main_ip}"
}

output "management_urls" {
  description = "Management URLs"
  value = {
    coolify_ui = "http://${vultr_instance.coolify.main_ip}:8000"
    server_ssh = "ssh root@${vultr_instance.coolify.main_ip}"
  }
  sensitive = false
}