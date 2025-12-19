#!/bin/bash

# Import existing Vultr infrastructure into Terraform state

echo "🔄 Importing existing Vultr infrastructure..."

# Import server instance
echo "📥 Importing server instance..."
terraform import vultr_instance.coolify 0c099e4d-29f0-4c54-b60f-4cdd375ac2d4

# Import block storage
echo "📥 Importing block storage..."
terraform import vultr_block_storage.backup 1ec416d9-605a-4d04-98ed-56eb784b6d64

# Import block storage attachment
echo "📥 Importing block storage attachment..."
terraform import vultr_block_storage_attach.backup_attach "1ec416d9-605a-4d04-98ed-56eb784b6d64,0c099e4d-29f0-4c54-b60f-4cdd375ac2d4"

echo "✅ Import completed!"
echo ""
echo "Now run 'terraform plan' to verify the imported state matches your configuration."