#!/bin/bash
#
# CodeB v5.0 - Server Installation Script
# Self-hosted Runner + Quadlet + systemd + Podman
#
# Usage:
#   curl -fsSL https://codeb.dev/install.sh | bash
#
# Or with options:
#   curl -fsSL https://codeb.dev/install.sh | bash -s -- --with-runner
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
CODEB_VERSION="5.0.0"
CODEB_USER="codeb"
CODEB_HOME="/opt/codeb"
RUNNER_VERSION="2.311.0"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          CodeB v5.0 - Server Installation                  ║${NC}"
echo -e "${BLUE}║    Self-hosted Runner + Quadlet + systemd + Podman         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Parse arguments
INSTALL_RUNNER=false
GITHUB_TOKEN=""
GITHUB_REPO=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --with-runner)
      INSTALL_RUNNER=true
      shift
      ;;
    --github-token)
      GITHUB_TOKEN="$2"
      shift 2
      ;;
    --github-repo)
      GITHUB_REPO="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# Check root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: Please run as root${NC}"
  exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
  VERSION=$VERSION_ID
else
  echo -e "${RED}Error: Cannot detect OS${NC}"
  exit 1
fi

echo -e "${GREEN}✓${NC} Detected OS: ${OS} ${VERSION}"

# ============================================================================
# Step 1: Install Podman
# ============================================================================

echo ""
echo -e "${BLUE}[1/6] Installing Podman...${NC}"

case $OS in
  ubuntu|debian)
    apt-get update -qq
    apt-get install -y -qq podman curl jq
    ;;
  fedora|centos|rhel|rocky|almalinux)
    dnf install -y -q podman curl jq
    ;;
  *)
    echo -e "${RED}Error: Unsupported OS${NC}"
    exit 1
    ;;
esac

echo -e "${GREEN}✓${NC} Podman $(podman --version | awk '{print $3}') installed"

# ============================================================================
# Step 2: Create CodeB user
# ============================================================================

echo ""
echo -e "${BLUE}[2/6] Creating CodeB user...${NC}"

if ! id -u ${CODEB_USER} &>/dev/null; then
  useradd -r -m -d ${CODEB_HOME} -s /bin/bash ${CODEB_USER}
  echo -e "${GREEN}✓${NC} User ${CODEB_USER} created"
else
  echo -e "${YELLOW}→${NC} User ${CODEB_USER} already exists"
fi

# Enable lingering for user services
loginctl enable-linger ${CODEB_USER}
echo -e "${GREEN}✓${NC} User linger enabled (systemd user services will persist)"

# ============================================================================
# Step 3: Create directory structure
# ============================================================================

echo ""
echo -e "${BLUE}[3/6] Creating directory structure...${NC}"

mkdir -p ${CODEB_HOME}/{projects,registry/slots,logs/rollbacks,quadlet/templates}
mkdir -p /etc/caddy/sites
mkdir -p /var/log/caddy

chown -R ${CODEB_USER}:${CODEB_USER} ${CODEB_HOME}

# Create Quadlet directory for user
sudo -u ${CODEB_USER} mkdir -p ${CODEB_HOME}/.config/containers/systemd

echo -e "${GREEN}✓${NC} Directory structure created"

# ============================================================================
# Step 4: Install Caddy
# ============================================================================

echo ""
echo -e "${BLUE}[4/6] Installing Caddy...${NC}"

case $OS in
  ubuntu|debian)
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
    ;;
  fedora|centos|rhel|rocky|almalinux)
    dnf install -y -q 'dnf-command(copr)'
    dnf copr enable -y @caddy/caddy
    dnf install -y -q caddy
    ;;
esac

# Configure Caddy to include sites
cat > /etc/caddy/Caddyfile << 'EOF'
# CodeB v5.0 - Caddy Configuration
{
    admin off
    auto_https on
}

import /etc/caddy/sites/*.caddy
EOF

systemctl enable caddy
systemctl start caddy

echo -e "${GREEN}✓${NC} Caddy $(caddy version | head -1) installed"

# ============================================================================
# Step 5: Configure systemd for Podman Quadlet
# ============================================================================

echo ""
echo -e "${BLUE}[5/6] Configuring Quadlet...${NC}"

# Create Quadlet template
cat > ${CODEB_HOME}/quadlet/templates/container.template << 'EOF'
# CodeB v5.0 - Quadlet Container Template
# Variables: PROJECT_NAME, ENVIRONMENT, SLOT, PORT, IMAGE, VERSION

[Unit]
Description={{PROJECT_NAME}} {{ENVIRONMENT}} {{SLOT}}
After=network-online.target

[Container]
Image={{IMAGE}}
ContainerName={{PROJECT_NAME}}-{{ENVIRONMENT}}-{{SLOT}}
PublishPort={{PORT}}:3000
EnvironmentFile=/opt/codeb/projects/{{PROJECT_NAME}}/.env.{{ENVIRONMENT}}
Label=project={{PROJECT_NAME}}
Label=environment={{ENVIRONMENT}}
Label=slot={{SLOT}}
Label=version={{VERSION}}
HealthCmd=curl -f http://localhost:3000/health || exit 1
HealthInterval=10s
HealthTimeout=5s
HealthRetries=3

[Service]
Restart=always
TimeoutStartSec=300

[Install]
WantedBy=default.target
EOF

chown -R ${CODEB_USER}:${CODEB_USER} ${CODEB_HOME}/quadlet

echo -e "${GREEN}✓${NC} Quadlet configured"

# ============================================================================
# Step 6: Install GitHub Self-hosted Runner (optional)
# ============================================================================

if [ "$INSTALL_RUNNER" = true ]; then
  echo ""
  echo -e "${BLUE}[6/6] Installing GitHub Self-hosted Runner...${NC}"

  if [ -z "$GITHUB_TOKEN" ] || [ -z "$GITHUB_REPO" ]; then
    echo -e "${YELLOW}Warning: --github-token and --github-repo required for runner installation${NC}"
    echo "You can install the runner manually later:"
    echo "  cd ${CODEB_HOME}/runner"
    echo "  ./config.sh --url https://github.com/OWNER/REPO --token YOUR_TOKEN"
  else
    RUNNER_DIR="${CODEB_HOME}/runner"
    mkdir -p ${RUNNER_DIR}
    cd ${RUNNER_DIR}

    # Download runner
    curl -sL "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" | tar xz

    # Configure runner
    chown -R ${CODEB_USER}:${CODEB_USER} ${RUNNER_DIR}
    sudo -u ${CODEB_USER} ./config.sh --url "https://github.com/${GITHUB_REPO}" --token "${GITHUB_TOKEN}" --unattended

    # Install as service
    ./svc.sh install ${CODEB_USER}
    ./svc.sh start

    echo -e "${GREEN}✓${NC} GitHub Runner installed and started"
  fi
else
  echo ""
  echo -e "${BLUE}[6/6] Skipping GitHub Runner installation${NC}"
  echo -e "${YELLOW}→${NC} Use --with-runner to install"
fi

# ============================================================================
# Summary
# ============================================================================

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                  Installation Complete!                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Installed Components:${NC}"
echo "  • Podman (rootless containers)"
echo "  • Caddy (reverse proxy + auto SSL)"
echo "  • Quadlet (systemd container management)"
if [ "$INSTALL_RUNNER" = true ] && [ -n "$GITHUB_TOKEN" ]; then
  echo "  • GitHub Self-hosted Runner"
fi
echo ""
echo -e "${GREEN}Directory Structure:${NC}"
echo "  ${CODEB_HOME}/"
echo "  ├── projects/          # Project ENV files"
echo "  ├── registry/slots/    # Slot state registry"
echo "  ├── logs/              # Deployment logs"
echo "  └── quadlet/           # Quadlet templates"
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo "  1. Add Self-hosted Runner (if not done):"
echo "     cd ${CODEB_HOME}/runner"
echo "     ./config.sh --url https://github.com/OWNER/REPO --token TOKEN"
echo ""
echo "  2. Create project ENV file:"
echo "     mkdir -p ${CODEB_HOME}/projects/myapp"
echo "     vi ${CODEB_HOME}/projects/myapp/.env.staging"
echo ""
echo "  3. Copy workflow files to your repo:"
echo "     .github/workflows/deploy.yml"
echo "     .github/workflows/promote.yml"
echo "     .github/workflows/rollback.yml"
echo ""
echo -e "${GREEN}CodeB v${CODEB_VERSION} is ready!${NC}"
