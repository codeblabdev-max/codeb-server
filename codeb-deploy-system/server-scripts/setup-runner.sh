#!/bin/bash

#############################################
# CodeB Deploy - GitHub Self-hosted Runner 설정
# 서버에서 실행하여 Runner 설치 및 구성
#############################################

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# 사용자 입력
GITHUB_OWNER=""
GITHUB_REPO=""
RUNNER_TOKEN=""
RUNNER_NAME="codeb-runner"
RUNNER_LABELS="self-hosted,linux,x64,codeb"
RUNNER_WORK_DIR="/home/codeb/actions-runner/_work"

usage() {
    echo "Usage: $0 --owner <github-owner> --repo <github-repo> --token <runner-token>"
    echo ""
    echo "Options:"
    echo "  --owner     GitHub organization or username"
    echo "  --repo      GitHub repository name"
    echo "  --token     Runner registration token (from GitHub Settings > Actions > Runners)"
    echo "  --name      Runner name (default: codeb-runner)"
    echo "  --labels    Runner labels (default: self-hosted,linux,x64,codeb)"
    echo ""
    echo "Example:"
    echo "  $0 --owner myorg --repo myproject --token AXXXXXXXXX"
    exit 1
}

# 인수 파싱
while [[ $# -gt 0 ]]; do
    case $1 in
        --owner)
            GITHUB_OWNER="$2"
            shift 2
            ;;
        --repo)
            GITHUB_REPO="$2"
            shift 2
            ;;
        --token)
            RUNNER_TOKEN="$2"
            shift 2
            ;;
        --name)
            RUNNER_NAME="$2"
            shift 2
            ;;
        --labels)
            RUNNER_LABELS="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

# 필수 인수 확인
if [ -z "$GITHUB_OWNER" ] || [ -z "$GITHUB_REPO" ] || [ -z "$RUNNER_TOKEN" ]; then
    log_error "Missing required arguments"
    usage
fi

log_info "========================================"
log_info "CodeB Deploy - GitHub Runner Setup"
log_info "========================================"

# 1. 시스템 요구사항 확인
log_info "Checking system requirements..."

if [ "$(id -u)" -ne 0 ]; then
    log_error "This script must be run as root"
    exit 1
fi

# codeb 사용자 확인/생성
if ! id -u codeb &>/dev/null; then
    log_info "Creating codeb user..."
    useradd -m -s /bin/bash codeb
    usermod -aG sudo codeb
fi

# 2. 필요 패키지 설치
log_info "Installing required packages..."
apt-get update
apt-get install -y \
    curl \
    jq \
    libicu70 \
    libssl3 \
    ca-certificates \
    gnupg

# 3. Runner 디렉토리 생성
RUNNER_DIR="/home/codeb/actions-runner"
log_info "Setting up runner directory: $RUNNER_DIR"

mkdir -p "$RUNNER_DIR"
mkdir -p "$RUNNER_WORK_DIR"
chown -R codeb:codeb "$RUNNER_DIR"

# 4. Runner 다운로드 및 설치
log_info "Downloading GitHub Actions Runner..."

cd "$RUNNER_DIR"

# 최신 버전 확인
RUNNER_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | jq -r '.tag_name' | sed 's/v//')
RUNNER_ARCH="linux-x64"
RUNNER_FILE="actions-runner-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"

if [ ! -f "$RUNNER_FILE" ]; then
    curl -o "$RUNNER_FILE" -L "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_FILE}"
fi

# 압축 해제
tar xzf "$RUNNER_FILE"
chown -R codeb:codeb "$RUNNER_DIR"

# 5. Runner 구성
log_info "Configuring runner..."

REPO_URL="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}"

sudo -u codeb ./config.sh \
    --url "$REPO_URL" \
    --token "$RUNNER_TOKEN" \
    --name "$RUNNER_NAME" \
    --labels "$RUNNER_LABELS" \
    --work "$RUNNER_WORK_DIR" \
    --unattended \
    --replace

# 6. systemd 서비스 설치
log_info "Installing systemd service..."

cat > /etc/systemd/system/actions-runner.service << EOF
[Unit]
Description=GitHub Actions Runner
After=network.target

[Service]
ExecStart=${RUNNER_DIR}/run.sh
User=codeb
WorkingDirectory=${RUNNER_DIR}
KillMode=process
KillSignal=SIGTERM
TimeoutStopSec=5min
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 7. 서비스 시작
log_info "Starting runner service..."
systemctl daemon-reload
systemctl enable actions-runner
systemctl start actions-runner

# 8. 상태 확인
sleep 3
if systemctl is-active --quiet actions-runner; then
    log_success "GitHub Actions Runner is running!"
else
    log_error "Runner failed to start. Check: journalctl -u actions-runner"
    exit 1
fi

# 9. 추가 도구 설치 (CI/CD용)
log_info "Installing additional CI/CD tools..."

# Podman (이미 설치되어 있을 수 있음)
if ! command -v podman &> /dev/null; then
    apt-get install -y podman
fi

# Node.js (NVM 방식)
if [ ! -d "/home/codeb/.nvm" ]; then
    sudo -u codeb bash -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash'
    sudo -u codeb bash -c 'source ~/.nvm/nvm.sh && nvm install 20 && nvm use 20'
fi

# pnpm
if ! command -v pnpm &> /dev/null; then
    npm install -g pnpm
fi

# 10. 완료 메시지
log_success "========================================"
log_success "GitHub Actions Runner setup complete!"
log_success "========================================"
echo ""
echo "Runner Name: $RUNNER_NAME"
echo "Runner Labels: $RUNNER_LABELS"
echo "Repository: $REPO_URL"
echo ""
echo "Commands:"
echo "  Status: systemctl status actions-runner"
echo "  Logs:   journalctl -u actions-runner -f"
echo "  Stop:   systemctl stop actions-runner"
echo "  Start:  systemctl start actions-runner"
echo ""
log_info "Runner should now appear in GitHub repository settings under Actions > Runners"
