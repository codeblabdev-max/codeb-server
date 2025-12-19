#!/bin/bash
# =============================================================================
# GitHub Actions Self-Hosted Runner Setup for CodeB
# =============================================================================
# Labels: self-hosted, codeb, claude-code
# Purpose: Run CI/CD workflows with Claude Code Max integration
# Usage: sudo GITHUB_TOKEN=ghp_xxx GITHUB_REPO=owner/repo ./setup-self-hosted-runner.sh
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
RUNNER_NAME="${RUNNER_NAME:-codeb-runner-$(hostname)}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,codeb,claude-code}"
RUNNER_WORKDIR="${RUNNER_WORKDIR:-/opt/codeb/actions-runner}"
RUNNER_VERSION="${RUNNER_VERSION:-2.311.0}"
GITHUB_ORG="${GITHUB_ORG:-}"
GITHUB_REPO="${GITHUB_REPO:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

check_requirements() {
  log_info "Checking requirements..."

  if [ "$EUID" -ne 0 ]; then
    log_error "This script must be run as root"
    exit 1
  fi

  if [ -z "$GITHUB_TOKEN" ]; then
    log_error "GITHUB_TOKEN environment variable is required"
    echo ""
    echo "Usage: sudo GITHUB_TOKEN=ghp_xxx GITHUB_REPO=owner/repo ./setup-self-hosted-runner.sh"
    exit 1
  fi

  if [ -z "$GITHUB_ORG" ] && [ -z "$GITHUB_REPO" ]; then
    log_error "Either GITHUB_ORG or GITHUB_REPO must be set"
    exit 1
  fi

  log_success "Requirements check passed"
}

install_dependencies() {
  log_info "Installing dependencies..."
  apt-get update -qq
  apt-get install -y -qq curl git jq tar wget build-essential libssl-dev libffi-dev python3-dev ca-certificates gnupg lsb-release
  log_success "Dependencies installed"
}

install_nodejs() {
  log_info "Installing Node.js 20..."
  if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" == "20" ]; then
      log_success "Node.js 20 already installed"
      return
    fi
  fi
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  log_success "Node.js 20 installed ($(node -v))"
}

install_gh_cli() {
  log_info "Installing GitHub CLI..."
  if command -v gh &> /dev/null; then
    log_success "GitHub CLI already installed"
    return
  fi
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
  chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
  apt-get update -qq
  apt-get install -y gh
  echo "$GITHUB_TOKEN" | gh auth login --with-token
  log_success "GitHub CLI installed and authenticated"
}

install_claude_cli() {
  log_info "Installing Claude Code CLI..."
  if command -v claude &> /dev/null; then
    log_success "Claude CLI already installed"
    return
  fi
  npm install -g @anthropic-ai/claude-code-cli
  log_success "Claude CLI installed: $(claude --version)"
}

create_runner_user() {
  log_info "Creating runner user..."
  if id "github-runner" &>/dev/null; then
    log_success "User github-runner already exists"
    return
  fi
  useradd -m -s /bin/bash github-runner
  usermod -aG sudo github-runner
  echo "github-runner ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/github-runner
  chmod 440 /etc/sudoers.d/github-runner
  log_success "User github-runner created"
}

install_runner() {
  log_info "Installing GitHub Actions Runner..."
  mkdir -p "$RUNNER_WORKDIR"
  cd "$RUNNER_WORKDIR"

  RUNNER_ARCH="x64"
  [ "$(uname -m)" == "aarch64" ] && RUNNER_ARCH="arm64"

  RUNNER_PKG="actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
  RUNNER_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_PKG}"

  curl -o "$RUNNER_PKG" -L "$RUNNER_URL"

  EXPECTED_CHECKSUM=$(curl -L "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_PKG}.sha256" | cut -d' ' -f1)
  ACTUAL_CHECKSUM=$(sha256sum "$RUNNER_PKG" | cut -d' ' -f1)

  if [ "$EXPECTED_CHECKSUM" != "$ACTUAL_CHECKSUM" ]; then
    log_error "Checksum verification failed"
    exit 1
  fi

  tar xzf "$RUNNER_PKG" && rm "$RUNNER_PKG"
  chown -R github-runner:github-runner "$RUNNER_WORKDIR"
  log_success "Runner installed to $RUNNER_WORKDIR"
}

configure_runner() {
  log_info "Configuring GitHub Actions Runner..."
  cd "$RUNNER_WORKDIR"

  if [ -n "$GITHUB_ORG" ]; then
    REGISTRATION_TOKEN=$(curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/orgs/$GITHUB_ORG/actions/runners/registration-token" | jq -r .token)
    RUNNER_URL="https://github.com/$GITHUB_ORG"
  else
    REGISTRATION_TOKEN=$(curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/$GITHUB_REPO/actions/runners/registration-token" | jq -r .token)
    RUNNER_URL="https://github.com/$GITHUB_REPO"
  fi

  if [ -z "$REGISTRATION_TOKEN" ] || [ "$REGISTRATION_TOKEN" == "null" ]; then
    log_error "Failed to get registration token"
    exit 1
  fi

  sudo -u github-runner ./config.sh --url "$RUNNER_URL" --token "$REGISTRATION_TOKEN" --name "$RUNNER_NAME" --labels "$RUNNER_LABELS" --work _work --unattended --replace
  log_success "Runner configured"
}

install_service() {
  log_info "Installing systemd service..."
  cd "$RUNNER_WORKDIR"
  sudo ./svc.sh install github-runner
  sudo ./svc.sh start
  systemctl enable actions.runner.*
  log_success "systemd service installed and started"
}

verify_installation() {
  log_info "Verifying installation..."
  if systemctl is-active --quiet actions.runner.*; then
    log_success "Runner service is active"
  else
    log_error "Runner service is not active"
    systemctl status actions.runner.* --no-pager
    exit 1
  fi
  sleep 5
  if journalctl -u actions.runner.* -n 20 --no-pager | grep -q "Listening for Jobs"; then
    log_success "Runner is connected and listening for jobs"
  else
    log_warning "Runner may not be fully connected yet"
  fi
}

display_info() {
  echo ""
  log_success "================================================"
  log_success "GitHub Actions Runner Installation Complete!"
  log_success "================================================"
  echo ""
  echo -e "${GREEN}Runner Name:${NC} $RUNNER_NAME"
  echo -e "${GREEN}Labels:${NC} $RUNNER_LABELS"
  echo -e "${GREEN}Work Directory:${NC} $RUNNER_WORKDIR"
  echo ""
  echo -e "${BLUE}Commands:${NC}"
  echo "  Status:  systemctl status actions.runner.*"
  echo "  Logs:    journalctl -u actions.runner.* -f"
  echo ""
  echo -e "${BLUE}Next Steps:${NC}"
  echo "  1. Set up Claude Code Max: ./scripts/setup-claude-code-max.sh"
  echo "  2. Test workflow: git push origin main"
  echo ""
}

main() {
  log_info "================================================"
  log_info "GitHub Actions Self-Hosted Runner Setup"
  log_info "================================================"
  check_requirements
  install_dependencies
  install_nodejs
  install_gh_cli
  install_claude_cli
  create_runner_user
  install_runner
  configure_runner
  install_service
  verify_installation
  display_info
}

main
