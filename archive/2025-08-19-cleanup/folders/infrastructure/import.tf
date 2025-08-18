# Import existing resources into Terraform state
# 
# This file is used to import existing Vultr resources
# Run these commands to import existing infrastructure:

# Import existing server
# terraform import vultr_instance.coolify 0c099e4d-29f0-4c54-b60f-4cdd375ac2d4

# Import existing block storage
# terraform import vultr_block_storage.backup 1ec416d9-605a-4d04-98ed-56eb784b6d64

# Import block storage attachment
# terraform import vultr_block_storage_attach.backup_attach 1ec416d9-605a-4d04-98ed-56eb784b6d64

# After import, run:
# terraform plan
# to see if there are any differences

# Note: You may need to adjust the configuration in main.tf to match
# the imported resources exactly to avoid recreation