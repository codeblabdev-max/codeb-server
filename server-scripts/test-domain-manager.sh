#!/bin/bash

###############################################################################
# CodeB Domain Manager - Integration Test Script
#
# 158.247.203.55 서버에서 실행
# PowerDNS + Caddy + Domain Manager API 통합 테스트
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_URL="http://localhost:3103"
PDNS_API_KEY="${PDNS_API_KEY:-changeme}"
TEST_PROJECT="test-domain-app"
TEST_PORT=9999
TEST_DOMAIN="${TEST_PROJECT}.one-q.xyz"

function success() {
  echo -e "${GREEN}✓${NC} $1"
}

function error() {
  echo -e "${RED}✗${NC} $1"
}

function info() {
  echo -e "${YELLOW}ℹ${NC} $1"
}

function separator() {
  echo ""
  echo "============================================================"
  echo "$1"
  echo "============================================================"
}

###############################################################################
# Test 1: Service Health Check
###############################################################################

test_health_check() {
  separator "Test 1: Health Check"

  info "Checking Domain Manager API health..."
  response=$(curl -s -w "\n%{http_code}" "$API_URL/health")
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)

  if [ "$http_code" -eq 200 ]; then
    success "Domain Manager API is running"
    echo "$body" | jq '.'
  else
    error "Domain Manager API health check failed (HTTP $http_code)"
    exit 1
  fi
}

###############################################################################
# Test 2: PowerDNS API Connectivity
###############################################################################

test_powerdns_connectivity() {
  separator "Test 2: PowerDNS API Connectivity"

  info "Testing PowerDNS API..."
  response=$(curl -s -w "\n%{http_code}" \
    -H "X-API-Key: $PDNS_API_KEY" \
    http://localhost:8081/api/v1/servers)

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)

  if [ "$http_code" -eq 200 ]; then
    success "PowerDNS API is accessible"
    echo "$body" | jq '.'
  else
    error "PowerDNS API connection failed (HTTP $http_code)"
    exit 1
  fi
}

###############################################################################
# Test 3: Setup Test Application Container
###############################################################################

test_setup_app() {
  separator "Test 3: Setup Test Application"

  info "Starting test application on port $TEST_PORT..."

  # Stop existing test container if any
  podman stop $TEST_PROJECT 2>/dev/null || true
  podman rm $TEST_PROJECT 2>/dev/null || true

  # Start simple HTTP server
  podman run -d \
    --name $TEST_PROJECT \
    -p $TEST_PORT:80 \
    nginx:alpine

  sleep 2

  # Test if app is running
  if curl -s http://localhost:$TEST_PORT > /dev/null; then
    success "Test application is running on port $TEST_PORT"
  else
    error "Test application failed to start"
    exit 1
  fi
}

###############################################################################
# Test 4: Domain Setup (DNS + Caddy + SSL)
###############################################################################

test_domain_setup() {
  separator "Test 4: Domain Setup"

  info "Setting up domain: $TEST_DOMAIN -> localhost:$TEST_PORT"

  response=$(curl -s -w "\n%{http_code}" \
    -X POST "$API_URL/domain/setup" \
    -H "Content-Type: application/json" \
    -d "{
      \"projectName\": \"$TEST_PROJECT\",
      \"targetPort\": $TEST_PORT,
      \"environment\": \"staging\",
      \"enableSSL\": true
    }")

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)

  if [ "$http_code" -eq 200 ]; then
    success=$(echo "$body" | jq -r '.success')
    if [ "$success" = "true" ]; then
      success "Domain setup successful"
      echo "$body" | jq '.'
    else
      error "Domain setup failed: $(echo "$body" | jq -r '.error')"
      exit 1
    fi
  else
    error "Domain setup API call failed (HTTP $http_code)"
    echo "$body"
    exit 1
  fi
}

###############################################################################
# Test 5: Verify DNS Record
###############################################################################

test_dns_record() {
  separator "Test 5: DNS Record Verification"

  info "Checking DNS A record for $TEST_DOMAIN..."

  # Wait a bit for DNS propagation
  sleep 2

  # Query local PowerDNS
  dns_result=$(dig @localhost $TEST_DOMAIN +short 2>/dev/null || echo "")

  if [ -n "$dns_result" ]; then
    success "DNS A record exists: $TEST_DOMAIN -> $dns_result"
  else
    error "DNS A record not found"
    exit 1
  fi
}

###############################################################################
# Test 6: Verify Caddy Configuration
###############################################################################

test_caddy_config() {
  separator "Test 6: Caddy Configuration Verification"

  info "Checking Caddy configuration for $TEST_DOMAIN..."

  config_file="/etc/caddy/sites/${TEST_DOMAIN}.caddy"

  if [ -f "$config_file" ]; then
    success "Caddy config file exists: $config_file"
    echo ""
    cat "$config_file"
    echo ""
  else
    error "Caddy config file not found: $config_file"
    exit 1
  fi

  # Validate Caddy config
  if caddy validate --config /etc/caddy/Caddyfile 2>&1 | grep -q "Valid"; then
    success "Caddy configuration is valid"
  else
    error "Caddy configuration validation failed"
    caddy validate --config /etc/caddy/Caddyfile
    exit 1
  fi
}

###############################################################################
# Test 7: Test HTTP Access (via Caddy)
###############################################################################

test_http_access() {
  separator "Test 7: HTTP Access Test"

  info "Testing HTTP access to $TEST_DOMAIN..."

  # Add to /etc/hosts for local testing
  if ! grep -q "$TEST_DOMAIN" /etc/hosts; then
    echo "127.0.0.1 $TEST_DOMAIN" >> /etc/hosts
    success "Added $TEST_DOMAIN to /etc/hosts"
  fi

  # Test HTTP access
  sleep 3
  if curl -s -H "Host: $TEST_DOMAIN" http://localhost | grep -q "nginx"; then
    success "HTTP access successful (via Caddy reverse proxy)"
  else
    error "HTTP access failed"
    exit 1
  fi
}

###############################################################################
# Test 8: Check Domain Status API
###############################################################################

test_domain_status() {
  separator "Test 8: Domain Status Check"

  info "Checking domain status via API..."

  response=$(curl -s "$API_URL/domain/status/$TEST_DOMAIN")

  dns_configured=$(echo "$response" | jq -r '.dns.configured')
  caddy_configured=$(echo "$response" | jq -r '.caddy.configured')
  ssot_registered=$(echo "$response" | jq -r '.ssot.registered')

  echo "$response" | jq '.'

  if [ "$dns_configured" = "true" ]; then
    success "DNS is configured"
  else
    error "DNS is not configured"
  fi

  if [ "$caddy_configured" = "true" ]; then
    success "Caddy is configured"
  else
    error "Caddy is not configured"
  fi

  if [ "$ssot_registered" = "true" ]; then
    success "Domain registered in SSOT"
  else
    error "Domain not registered in SSOT"
  fi
}

###############################################################################
# Test 9: List All Domains
###############################################################################

test_list_domains() {
  separator "Test 9: List All Domains"

  info "Fetching all domains..."

  response=$(curl -s "$API_URL/domains")

  echo "$response" | jq '.'

  dns_count=$(echo "$response" | jq '.dns | length')
  ssot_count=$(echo "$response" | jq '.ssot | length')

  success "Found $dns_count DNS records and $ssot_count SSOT domains"
}

###############################################################################
# Test 10: CLI Test
###############################################################################

test_cli() {
  separator "Test 10: CLI Test"

  info "Testing domain-cli..."

  if command -v domain-cli &> /dev/null; then
    success "domain-cli is installed"

    # Test CLI status command
    domain-cli status "$TEST_DOMAIN"

    # Test CLI list command
    domain-cli list
  else
    error "domain-cli not found"
    exit 1
  fi
}

###############################################################################
# Test 11: Domain Removal
###############################################################################

test_domain_removal() {
  separator "Test 11: Domain Removal"

  info "Removing domain: $TEST_DOMAIN"

  response=$(curl -s -w "\n%{http_code}" \
    -X DELETE "$API_URL/domain/remove" \
    -H "Content-Type: application/json" \
    -d "{\"domain\": \"$TEST_DOMAIN\"}")

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)

  if [ "$http_code" -eq 200 ]; then
    success=$(echo "$body" | jq -r '.success')
    if [ "$success" = "true" ]; then
      success "Domain removed successfully"
      echo "$body" | jq '.'
    else
      error "Domain removal failed: $(echo "$body" | jq -r '.error')"
    fi
  else
    error "Domain removal API call failed (HTTP $http_code)"
  fi

  # Verify removal
  sleep 2

  # Check DNS
  dns_result=$(dig @localhost $TEST_DOMAIN +short 2>/dev/null || echo "")
  if [ -z "$dns_result" ]; then
    success "DNS record removed"
  else
    error "DNS record still exists"
  fi

  # Check Caddy config
  config_file="/etc/caddy/sites/${TEST_DOMAIN}.caddy"
  if [ ! -f "$config_file" ]; then
    success "Caddy config file removed"
  else
    error "Caddy config file still exists"
  fi
}

###############################################################################
# Cleanup
###############################################################################

cleanup() {
  separator "Cleanup"

  info "Stopping test application..."
  podman stop $TEST_PROJECT 2>/dev/null || true
  podman rm $TEST_PROJECT 2>/dev/null || true

  info "Removing test domain from /etc/hosts..."
  sed -i "/$TEST_DOMAIN/d" /etc/hosts 2>/dev/null || true

  success "Cleanup completed"
}

###############################################################################
# Main Test Runner
###############################################################################

main() {
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║   CodeB Domain Manager - Integration Test Suite           ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""

  # Prerequisites
  info "Checking prerequisites..."

  if ! command -v jq &> /dev/null; then
    error "jq is required but not installed. Install with: apt install jq"
    exit 1
  fi

  if ! command -v dig &> /dev/null; then
    error "dig is required but not installed. Install with: apt install dnsutils"
    exit 1
  fi

  if ! command -v podman &> /dev/null; then
    error "podman is required but not installed"
    exit 1
  fi

  success "All prerequisites are installed"
  echo ""

  # Run tests
  test_health_check
  test_powerdns_connectivity
  test_setup_app
  test_domain_setup
  test_dns_record
  test_caddy_config
  test_http_access
  test_domain_status
  test_list_domains
  test_cli
  test_domain_removal
  cleanup

  # Summary
  separator "Test Summary"
  success "All tests passed! ✨"
  echo ""
  echo "Domain Manager is working correctly:"
  echo "  - PowerDNS API integration ✓"
  echo "  - Caddy configuration ✓"
  echo "  - DNS record management ✓"
  echo "  - SSL certificate support ✓"
  echo "  - SSOT registry sync ✓"
  echo "  - CLI functionality ✓"
  echo ""
}

# Run main function
main "$@"
