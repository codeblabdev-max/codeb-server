#!/bin/bash

###############################################################################
# CodeB Domain Manager - Remote Deployment Script
#
# 로컬에서 실행하여 158.247.203.55 서버에 자동 배포
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SERVER_IP="158.247.203.55"
SERVER_USER="root"
REMOTE_TMP="/tmp/codeb-domain-manager"
REMOTE_INSTALL="/opt/codeb/ssot-registry"

function success() {
  echo -e "${GREEN}✓${NC} $1"
}

function error() {
  echo -e "${RED}✗${NC} $1"
}

function info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

function separator() {
  echo ""
  echo "============================================================"
  echo "$1"
  echo "============================================================"
}

###############################################################################
# Pre-flight checks
###############################################################################

preflight_checks() {
  separator "Pre-flight Checks"

  # Check SSH connection
  info "Testing SSH connection to $SERVER_IP..."
  if ssh -o ConnectTimeout=5 $SERVER_USER@$SERVER_IP "echo 'SSH OK'" > /dev/null 2>&1; then
    success "SSH connection successful"
  else
    error "Cannot connect to $SERVER_IP via SSH"
    echo "Please check:"
    echo "  1. Server IP is correct"
    echo "  2. SSH key is configured"
    echo "  3. Server is accessible"
    exit 1
  fi

  # Check required files
  info "Checking required files..."
  required_files=(
    "domain-manager.js"
    "domain-cli.js"
    "install-domain-manager.sh"
    "test-domain-manager.sh"
  )

  for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
      success "Found: $file"
    else
      error "Missing: $file"
      exit 1
    fi
  done
}

###############################################################################
# Upload files
###############################################################################

upload_files() {
  separator "Uploading Files"

  info "Creating remote directory..."
  ssh $SERVER_USER@$SERVER_IP "mkdir -p $REMOTE_TMP"

  info "Uploading files..."
  scp -r \
    domain-manager.js \
    domain-cli.js \
    install-domain-manager.sh \
    test-domain-manager.sh \
    caddy-setup.md \
    powerdns-setup.md \
    DOMAIN_AUTOMATION_README.md \
    $SERVER_USER@$SERVER_IP:$REMOTE_TMP/

  success "Files uploaded to $REMOTE_TMP"
}

###############################################################################
# Install on server
###############################################################################

install_on_server() {
  separator "Installing on Server"

  info "Running installation script..."
  ssh $SERVER_USER@$SERVER_IP << 'ENDSSH'
    cd /tmp/codeb-domain-manager
    chmod +x install-domain-manager.sh
    ./install-domain-manager.sh
ENDSSH

  success "Installation completed"
}

###############################################################################
# Configure environment
###############################################################################

configure_environment() {
  separator "Environment Configuration"

  info "Checking PowerDNS API key..."

  # Check if .env already exists
  if ssh $SERVER_USER@$SERVER_IP "test -f $REMOTE_INSTALL/.env"; then
    info ".env file already exists"

    # Ask if user wants to update
    echo ""
    echo -n "Do you want to update the PowerDNS API key? (y/N): "
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
      echo -n "Enter PowerDNS API key: "
      read -r api_key

      ssh $SERVER_USER@$SERVER_IP "sed -i 's/PDNS_API_KEY=.*/PDNS_API_KEY=$api_key/' $REMOTE_INSTALL/.env"
      success "API key updated"
    else
      info "Skipping API key update"
    fi
  else
    error ".env file not found"
    echo ""
    echo -n "Enter PowerDNS API key: "
    read -r api_key

    echo -n "Enter DNS zone (default: codeb.kr): "
    read -r dns_zone
    dns_zone=${dns_zone:-codeb.kr}

    ssh $SERVER_USER@$SERVER_IP << ENDSSH
cat > $REMOTE_INSTALL/.env << 'EOF'
# PowerDNS API Configuration
PDNS_API_KEY=$api_key
PDNS_API_URL=http://localhost:8081/api/v1

# Domain Manager API Port
DOMAIN_MANAGER_PORT=3103

# SSOT Registry URL
SSOT_REGISTRY_URL=http://localhost:3102

# DNS Zone
DNS_ZONE=$dns_zone
EOF
ENDSSH

    success "Environment configured"
  fi
}

###############################################################################
# Start service
###############################################################################

start_service() {
  separator "Starting Service"

  info "Enabling and starting codeb-domain-manager service..."

  ssh $SERVER_USER@$SERVER_IP << 'ENDSSH'
    systemctl daemon-reload
    systemctl enable codeb-domain-manager
    systemctl restart codeb-domain-manager
    sleep 2
    systemctl status codeb-domain-manager --no-pager
ENDSSH

  success "Service started"
}

###############################################################################
# Verify installation
###############################################################################

verify_installation() {
  separator "Verification"

  info "Checking service status..."

  # Check if service is running
  if ssh $SERVER_USER@$SERVER_IP "systemctl is-active --quiet codeb-domain-manager"; then
    success "Service is running"
  else
    error "Service is not running"
    echo "Check logs with: ssh $SERVER_USER@$SERVER_IP 'journalctl -u codeb-domain-manager -n 50'"
    exit 1
  fi

  # Check API health
  info "Checking API health..."
  if ssh $SERVER_USER@$SERVER_IP "curl -s http://localhost:3103/health | grep -q ok"; then
    success "API is responding"
  else
    error "API is not responding"
    exit 1
  fi

  # Check CLI
  info "Checking CLI..."
  if ssh $SERVER_USER@$SERVER_IP "command -v domain-cli > /dev/null"; then
    success "CLI is installed"
  else
    error "CLI is not installed"
    exit 1
  fi
}

###############################################################################
# Run tests
###############################################################################

run_tests() {
  separator "Running Tests"

  echo ""
  echo -n "Do you want to run integration tests? (y/N): "
  read -r response

  if [[ "$response" =~ ^[Yy]$ ]]; then
    info "Running integration tests..."
    ssh $SERVER_USER@$SERVER_IP << 'ENDSSH'
      cd /opt/codeb/ssot-registry
      chmod +x test-domain-manager.sh
      ./test-domain-manager.sh
ENDSSH
  else
    info "Skipping tests"
  fi
}

###############################################################################
# Display next steps
###############################################################################

display_next_steps() {
  separator "Deployment Complete!"

  echo ""
  echo -e "${GREEN}✓ CodeB Domain Manager has been deployed successfully!${NC}"
  echo ""
  echo "Next steps:"
  echo ""
  echo "1. Configure PowerDNS (if not already done):"
  echo -e "   ${BLUE}ssh $SERVER_USER@$SERVER_IP${NC}"
  echo -e "   ${BLUE}cat /opt/codeb/ssot-registry/powerdns-setup.md${NC}"
  echo ""
  echo "2. Configure Caddy (if not already done):"
  echo -e "   ${BLUE}cat /opt/codeb/ssot-registry/caddy-setup.md${NC}"
  echo ""
  echo "3. Test domain setup:"
  echo -e "   ${BLUE}domain-cli setup test-app 3000${NC}"
  echo ""
  echo "4. Check domain status:"
  echo -e "   ${BLUE}domain-cli status test-app.codeb.kr${NC}"
  echo ""
  echo "5. List all domains:"
  echo -e "   ${BLUE}domain-cli list${NC}"
  echo ""
  echo "6. Monitor logs:"
  echo -e "   ${BLUE}journalctl -u codeb-domain-manager -f${NC}"
  echo ""
  echo "API Endpoints:"
  echo "  Health:  http://$SERVER_IP:3103/health"
  echo "  Setup:   POST http://$SERVER_IP:3103/domain/setup"
  echo "  Remove:  DELETE http://$SERVER_IP:3103/domain/remove"
  echo "  Status:  GET http://$SERVER_IP:3103/domain/status/:domain"
  echo "  List:    GET http://$SERVER_IP:3103/domains"
  echo ""
  echo "Documentation:"
  echo "  README:     /opt/codeb/ssot-registry/DOMAIN_AUTOMATION_README.md"
  echo "  PowerDNS:   /opt/codeb/ssot-registry/powerdns-setup.md"
  echo "  Caddy:      /opt/codeb/ssot-registry/caddy-setup.md"
  echo ""
  echo -e "${YELLOW}⚠ Important:${NC}"
  echo "  Make sure PowerDNS and Caddy are properly configured"
  echo "  Update DNS zone settings in /opt/codeb/ssot-registry/.env"
  echo ""
  separator ""
}

###############################################################################
# Main
###############################################################################

main() {
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║   CodeB Domain Manager - Remote Deployment Script         ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""

  preflight_checks
  upload_files
  install_on_server
  configure_environment
  start_service
  verify_installation
  run_tests
  display_next_steps
}

# Run main
main "$@"
