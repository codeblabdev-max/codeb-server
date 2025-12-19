#!/bin/bash
# CodeB Quadlet Network Setup
# Sets up the shared Podman network for all CodeB services
#
# Usage: ./setup-quadlet-network.sh

set -euo pipefail

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }

NETWORK_NAME="codeb"
SUBNET="10.89.0.0/24"
GATEWAY="10.89.0.1"
QUADLET_DIR="/etc/containers/systemd"

log "=== CodeB Network Setup ==="

# Check if network exists
if podman network exists "${NETWORK_NAME}" 2>/dev/null; then
  log "Network '${NETWORK_NAME}' already exists"
  podman network inspect "${NETWORK_NAME}" --format '{{.Subnets}}'
else
  log "Creating Podman network: ${NETWORK_NAME}"

  # Create network via Podman CLI
  podman network create \
    --subnet="${SUBNET}" \
    --gateway="${GATEWAY}" \
    --label="codeb.managed=true" \
    "${NETWORK_NAME}"

  success "Network created"
fi

# Create Quadlet network file (for declarative management)
log "Creating Quadlet network file..."
sudo mkdir -p "${QUADLET_DIR}"

sudo tee "${QUADLET_DIR}/${NETWORK_NAME}.network" > /dev/null << EOF
# CodeB Shared Network
# Auto-managed by Quadlet

[Network]
NetworkName=${NETWORK_NAME}
Subnet=${SUBNET}
Gateway=${GATEWAY}
Label=codeb.managed=true
Label=codeb.network=primary

# DNS resolution between containers
Internal=false
EOF

success "Quadlet network file: ${QUADLET_DIR}/${NETWORK_NAME}.network"

# Reload systemd to pick up network
log "Reloading systemd daemon..."
sudo systemctl daemon-reload
success "systemd daemon reloaded"

# Verify
log "Network details:"
podman network inspect "${NETWORK_NAME}" --format json | jq '{name: .name, subnets: .subnets, dns_enabled: .dns_enabled}' 2>/dev/null || \
  podman network inspect "${NETWORK_NAME}"

echo ""
success "Network setup complete!"
echo ""
log "Connected containers can communicate via container names (DNS)"
log "Example: curl http://codeb-postgres:5432"
