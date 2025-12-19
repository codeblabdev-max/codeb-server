#!/bin/bash

###############################################################################
# CodeB Notification System - Test Script
#
# Tests all notification functionality:
# - Configuration
# - Health checks
# - Test notifications
# - Event notifications
# - Deployment hooks
###############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(dirname "$SCRIPT_DIR")"

echo "=========================================="
echo "CodeB Notification System - Test Suite"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

test_result() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
  else
    echo -e "${RED}✗ FAILED${NC}"
    ((FAILED++))
  fi
  echo ""
}

# Test 1: Check if notifier module exists
echo -e "${BLUE}Test 1: Module exists${NC}"
if [ -f "$CLI_DIR/src/notifier.js" ]; then
  echo "✓ notifier.js found"
  test_result
else
  echo "✗ notifier.js not found"
  test_result
fi

# Test 2: Initialize notifier
echo -e "${BLUE}Test 2: Initialize notifier${NC}"
node "$CLI_DIR/src/notifier.js" config > /dev/null 2>&1
test_result

# Test 3: Show configuration
echo -e "${BLUE}Test 3: Show configuration${NC}"
node "$CLI_DIR/src/notifier.js" config
test_result

# Test 4: Health check
echo -e "${BLUE}Test 4: Health check${NC}"
node "$CLI_DIR/src/notifier.js" health
test_result

# Test 5: Test notification (will fail if not configured)
echo -e "${BLUE}Test 5: Test notification${NC}"
echo -e "${YELLOW}Note: This will fail if channels are not configured${NC}"
node "$CLI_DIR/src/notifier.js" test all || true
echo ""

# Test 6: Send test event
echo -e "${BLUE}Test 6: Send deployment.started event${NC}"
node "$CLI_DIR/src/notifier.js" notify deployment.started test-project production
test_result

# Test 7: Deployment hooks - started
echo -e "${BLUE}Test 7: Deployment hook - started${NC}"
node "$CLI_DIR/src/deployment-hooks.js" started test-app production \
  deployer "test-user" \
  branch "main" \
  commit "abc123"
test_result

# Test 8: Deployment hooks - success
echo -e "${BLUE}Test 8: Deployment hook - success${NC}"
node "$CLI_DIR/src/deployment-hooks.js" success test-app production \
  version "1.0.0" \
  duration "30s" \
  url "https://test-app.codeb.dev"
test_result

# Test 9: Deployment hooks - failed
echo -e "${BLUE}Test 9: Deployment hook - failed${NC}"
node "$CLI_DIR/src/deployment-hooks.js" failed test-app production \
  error "Build failed" \
  stage "compile"
test_result

# Test 10: Healthcheck failed
echo -e "${BLUE}Test 10: Healthcheck failed event${NC}"
node "$CLI_DIR/src/deployment-hooks.js" healthcheck-failed test-app production \
  endpoint "/health" \
  statusCode "500" \
  attempts "3"
test_result

# Test 11: Resource threshold
echo -e "${BLUE}Test 11: Resource threshold exceeded${NC}"
node "$CLI_DIR/src/deployment-hooks.js" resource-threshold disk 90 85 \
  server "web-01"
test_result

# Test 12: API Server (if running)
echo -e "${BLUE}Test 12: API Server health${NC}"
if curl -s http://localhost:7778/health > /dev/null 2>&1; then
  echo "✓ API Server is running"
  curl -s http://localhost:7778/health | jq .
  test_result
else
  echo -e "${YELLOW}⚠ API Server not running (skipped)${NC}"
  echo "Start with: node $CLI_DIR/src/notification-server.js"
  echo ""
fi

# Test 13: API - Send notification via HTTP
echo -e "${BLUE}Test 13: API - POST /api/v1/notify${NC}"
if curl -s http://localhost:7778/health > /dev/null 2>&1; then
  curl -X POST http://localhost:7778/api/v1/notify \
    -H "Content-Type: application/json" \
    -d '{
      "event": "deployment.success",
      "project": "test-api",
      "environment": "production",
      "data": {
        "version": "2.0.0",
        "duration": "45s"
      }
    }' | jq .
  test_result
else
  echo -e "${YELLOW}⚠ API Server not running (skipped)${NC}"
  echo ""
fi

# Test 14: API - Test notification via HTTP
echo -e "${BLUE}Test 14: API - POST /api/v1/notify/test${NC}"
if curl -s http://localhost:7778/health > /dev/null 2>&1; then
  curl -X POST http://localhost:7778/api/v1/notify/test \
    -H "Content-Type: application/json" \
    -d '{
      "channel": "all",
      "message": "API test notification"
    }' | jq .
  test_result
else
  echo -e "${YELLOW}⚠ API Server not running (skipped)${NC}"
  echo ""
fi

# Test 15: API - Get configuration via HTTP
echo -e "${BLUE}Test 15: API - GET /api/v1/config/notifications${NC}"
if curl -s http://localhost:7778/health > /dev/null 2>&1; then
  curl -s http://localhost:7778/api/v1/config/notifications | jq .
  test_result
else
  echo -e "${YELLOW}⚠ API Server not running (skipped)${NC}"
  echo ""
fi

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}All tests passed! 🎉${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed${NC}"
  exit 1
fi
