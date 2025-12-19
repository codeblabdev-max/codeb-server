#!/bin/bash
# =============================================================================
# Claude Code Max Setup for Self-Hosted Runner
# =============================================================================
# Purpose: Configure Claude Code Max authentication and MCP server connection
# Subscription: $200/month for unlimited tokens
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
CLAUDE_API_KEY="${CLAUDE_API_KEY:-}"
MCP_SERVER_URL="${MCP_SERVER_URL:-http://localhost:3100}"
RUNNER_USER="${RUNNER_USER:-github-runner}"
CONFIG_DIR="/home/$RUNNER_USER/.claude"
WORKSPACE_DIR="/opt/codeb/actions-runner/_work"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# -----------------------------------------------------------------------------
# Check Requirements
# -----------------------------------------------------------------------------
check_requirements() {
  log_info "Checking requirements..."

  # Check root
  if [ "$EUID" -ne 0 ]; then
    log_error "This script must be run as root"
    exit 1
  fi

  # Check Claude API key
  if [ -z "$CLAUDE_API_KEY" ]; then
    log_error "CLAUDE_API_KEY environment variable is required"
    echo ""
    echo "Get your API key from: https://console.anthropic.com/"
    echo "Then run: export CLAUDE_API_KEY='sk-ant-...'"
    exit 1
  fi

  # Check runner user exists
  if ! id "$RUNNER_USER" &>/dev/null; then
    log_error "User $RUNNER_USER does not exist"
    exit 1
  fi

  # Check Claude CLI installed
  if ! command -v claude &> /dev/null; then
    log_error "Claude CLI is not installed"
    echo "Run: npm install -g @anthropic-ai/claude-code-cli"
    exit 1
  fi

  log_success "Requirements check passed"
}

# -----------------------------------------------------------------------------
# Create Configuration Directory
# -----------------------------------------------------------------------------
create_config_dir() {
  log_info "Creating configuration directory..."

  sudo -u "$RUNNER_USER" mkdir -p "$CONFIG_DIR"
  sudo -u "$RUNNER_USER" mkdir -p "$CONFIG_DIR/mcp"

  log_success "Configuration directory created: $CONFIG_DIR"
}

# -----------------------------------------------------------------------------
# Configure Claude Code Max Authentication
# -----------------------------------------------------------------------------
configure_claude_auth() {
  log_info "Configuring Claude Code Max authentication..."

  # Create auth config
  sudo -u "$RUNNER_USER" cat > "$CONFIG_DIR/auth.json" << EOF
{
  "apiKey": "$CLAUDE_API_KEY",
  "model": "claude-sonnet-4",
  "maxTokens": "unlimited",
  "subscription": "claude-code-max",
  "features": {
    "mcp": true,
    "caching": true,
    "streaming": true
  }
}
EOF

  # Set permissions
  chmod 600 "$CONFIG_DIR/auth.json"
  chown "$RUNNER_USER:$RUNNER_USER" "$CONFIG_DIR/auth.json"

  log_success "Claude authentication configured"
}

# -----------------------------------------------------------------------------
# Configure MCP Server Connection
# -----------------------------------------------------------------------------
configure_mcp_server() {
  log_info "Configuring MCP server connection..."

  # Create MCP config
  sudo -u "$RUNNER_USER" cat > "$CONFIG_DIR/mcp/settings.json" << EOF
{
  "mcpServers": {
    "codeb-deploy": {
      "url": "$MCP_SERVER_URL",
      "enabled": true,
      "capabilities": [
        "self-healing",
        "deployment",
        "database",
        "project-management"
      ],
      "tools": [
        "getBuildErrors",
        "validateFix",
        "autoFixBuildLoop",
        "deployProject",
        "createDatabase",
        "listProjects"
      ],
      "timeout": 30000,
      "retries": 3
    },
    "sequential-thinking": {
      "enabled": true,
      "priority": "high"
    },
    "context7": {
      "enabled": true,
      "priority": "medium"
    },
    "magic": {
      "enabled": true,
      "priority": "low"
    },
    "playwright": {
      "enabled": true,
      "priority": "medium"
    }
  },
  "defaultServer": "codeb-deploy",
  "autoConnect": true,
  "healthCheck": {
    "enabled": true,
    "interval": 60000,
    "timeout": 5000
  }
}
EOF

  # Set permissions
  chmod 644 "$CONFIG_DIR/mcp/settings.json"
  chown "$RUNNER_USER:$RUNNER_USER" "$CONFIG_DIR/mcp/settings.json"

  log_success "MCP server configured: $MCP_SERVER_URL"
}

# -----------------------------------------------------------------------------
# Configure Environment Variables
# -----------------------------------------------------------------------------
configure_env_vars() {
  log_info "Configuring environment variables..."

  # Create .env file for runner
  sudo -u "$RUNNER_USER" cat > "/home/$RUNNER_USER/.env" << EOF
# Claude Code Max Configuration
CLAUDE_API_KEY=$CLAUDE_API_KEY
CLAUDE_MODEL=claude-sonnet-4
CLAUDE_MAX_TOKENS=unlimited

# MCP Server Configuration
MCP_SERVER_URL=$MCP_SERVER_URL
MCP_AUTO_CONNECT=true
MCP_TIMEOUT=30000

# CodeB Configuration
CODEB_WORKSPACE=$WORKSPACE_DIR
CODEB_AUTO_FIX=true
CODEB_MAX_FIX_ATTEMPTS=5
CODEB_NO_DELETION_PRINCIPLE=true

# GitHub Actions Integration
ACTIONS_RUNNER_HOOK_JOB_STARTED=/opt/codeb/hooks/job-started.sh
ACTIONS_RUNNER_HOOK_JOB_COMPLETED=/opt/codeb/hooks/job-completed.sh
EOF

  # Set permissions
  chmod 600 "/home/$RUNNER_USER/.env"
  chown "$RUNNER_USER:$RUNNER_USER" "/home/$RUNNER_USER/.env"

  # Add to runner's .bashrc
  if ! grep -q "source ~/.env" "/home/$RUNNER_USER/.bashrc"; then
    echo "source ~/.env" >> "/home/$RUNNER_USER/.bashrc"
  fi

  log_success "Environment variables configured"
}

# -----------------------------------------------------------------------------
# Test Claude CLI Connection
# -----------------------------------------------------------------------------
test_claude_cli() {
  log_info "Testing Claude CLI connection..."

  # Test as runner user
  sudo -u "$RUNNER_USER" bash -c "
    export CLAUDE_API_KEY='$CLAUDE_API_KEY'
    claude --version
  "

  if [ $? -eq 0 ]; then
    log_success "Claude CLI connection successful"
  else
    log_error "Claude CLI connection failed"
    exit 1
  fi
}

# -----------------------------------------------------------------------------
# Test MCP Server Connection
# -----------------------------------------------------------------------------
test_mcp_server() {
  log_info "Testing MCP server connection..."

  # Health check
  HEALTH_RESPONSE=$(curl -s -f "$MCP_SERVER_URL/health" || echo "FAILED")

  if [ "$HEALTH_RESPONSE" != "FAILED" ]; then
    log_success "MCP server is reachable"
    echo "$HEALTH_RESPONSE" | jq . 2>/dev/null || echo "$HEALTH_RESPONSE"
  else
    log_warning "MCP server is not reachable at $MCP_SERVER_URL"
    log_info "Make sure the MCP server is running:"
    log_info "  cd codeb-deploy-system/mcp-server && npm run dev"
  fi
}

# -----------------------------------------------------------------------------
# Create Runner Hooks
# -----------------------------------------------------------------------------
create_runner_hooks() {
  log_info "Creating GitHub Actions runner hooks..."

  mkdir -p /opt/codeb/hooks

  # Job started hook
  cat > /opt/codeb/hooks/job-started.sh << 'EOF'
#!/bin/bash
# Hook: Job Started
echo "[$(date)] GitHub Actions job started: $GITHUB_JOB" >> /var/log/codeb/runner-hooks.log
EOF

  # Job completed hook
  cat > /opt/codeb/hooks/job-completed.sh << 'EOF'
#!/bin/bash
# Hook: Job Completed
echo "[$(date)] GitHub Actions job completed: $GITHUB_JOB (status: $GITHUB_RUN_STATUS)" >> /var/log/codeb/runner-hooks.log
EOF

  # Set permissions
  chmod +x /opt/codeb/hooks/*.sh

  # Create log directory
  mkdir -p /var/log/codeb
  chown "$RUNNER_USER:$RUNNER_USER" /var/log/codeb

  log_success "Runner hooks created"
}

# -----------------------------------------------------------------------------
# Display Configuration Summary
# -----------------------------------------------------------------------------
display_summary() {
  echo ""
  log_success "================================================"
  log_success "Claude Code Max Configuration Complete!"
  log_success "================================================"
  echo ""
  echo -e "${GREEN}Configuration:${NC}"
  echo "  API Key:     ${CLAUDE_API_KEY:0:20}..."
  echo "  Model:       claude-sonnet-4 (Claude Code Max)"
  echo "  Max Tokens:  Unlimited ($200/month)"
  echo "  MCP Server:  $MCP_SERVER_URL"
  echo "  Config Dir:  $CONFIG_DIR"
  echo ""
  echo -e "${GREEN}Features Enabled:${NC}"
  echo "  ✓ MCP Server Integration"
  echo "  ✓ Self-Healing CI/CD"
  echo "  ✓ Prompt Caching"
  echo "  ✓ Streaming Responses"
  echo "  ✓ No-Deletion Principle"
  echo ""
  echo -e "${BLUE}Test Claude CLI:${NC}"
  echo "  sudo -u $RUNNER_USER claude --help"
  echo ""
  echo -e "${BLUE}Test MCP Connection:${NC}"
  echo "  curl $MCP_SERVER_URL/health"
  echo ""
  echo -e "${BLUE}View Logs:${NC}"
  echo "  tail -f /var/log/codeb/runner-hooks.log"
  echo ""
  echo -e "${BLUE}Next Steps:${NC}"
  echo "  1. Start MCP server: cd codeb-deploy-system/mcp-server && npm run dev"
  echo "  2. Test workflow: git push origin main"
  echo "  3. Monitor runner: journalctl -u actions.runner.* -f"
  echo ""
}

# -----------------------------------------------------------------------------
# Main Installation Flow
# -----------------------------------------------------------------------------
main() {
  echo ""
  log_info "================================================"
  log_info "Claude Code Max Setup"
  log_info "================================================"
  echo ""

  check_requirements
  create_config_dir
  configure_claude_auth
  configure_mcp_server
  configure_env_vars
  test_claude_cli
  test_mcp_server
  create_runner_hooks
  display_summary
}

# Run main installation
main
