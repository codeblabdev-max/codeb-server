#!/bin/bash
#
# CodeB Server 초기화 스크립트
# Terraform user_data로 실행됨
#
# 변수 (templatefile로 주입):
# - project_name: ${project_name}
# - environment: ${environment}

set -e

exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

echo "🚀 CodeB 서버 초기화 시작..."
echo "프로젝트: ${project_name}"
echo "환경: ${environment}"

# =====================================================
# 시스템 업데이트
# =====================================================
echo "📦 시스템 업데이트 중..."
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

# =====================================================
# 필수 패키지 설치
# =====================================================
echo "📦 필수 패키지 설치 중..."
apt-get install -y \
    curl \
    wget \
    git \
    htop \
    vim \
    unzip \
    ca-certificates \
    gnupg \
    lsb-release \
    jq \
    tree

# =====================================================
# Docker/Podman 설치
# =====================================================
echo "🐳 Podman 설치 중..."
apt-get install -y podman

# 버전 확인
podman --version

# =====================================================
# Node.js 설치 (PM2용)
# =====================================================
echo "📦 Node.js 20.x 설치 중..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# PM2 글로벌 설치
npm install -g pm2

# =====================================================
# Caddy 설치
# =====================================================
echo "🌐 Caddy 설치 중..."
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

# =====================================================
# GitHub CLI 설치
# =====================================================
echo "🐙 GitHub CLI 설치 중..."
type -p curl >/dev/null || apt-get install -y curl
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
apt-get update
apt-get install -y gh

# =====================================================
# 디렉토리 구조 생성
# =====================================================
echo "📁 디렉토리 구조 생성 중..."
mkdir -p /opt/codeb/{config,data,logs,backup,scripts}
mkdir -p /opt/codeb/data/{app,postgres,redis}
mkdir -p /opt/codeb/logs/{app,caddy,podman}

# 권한 설정
chown -R root:root /opt/codeb

# =====================================================
# Podman 네트워크 생성
# =====================================================
echo "🔗 Podman 네트워크 생성 중..."
podman network create codeb-network 2>/dev/null || true

# =====================================================
# 방화벽 설정 (ufw)
# =====================================================
echo "🔒 방화벽 설정 중..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

# =====================================================
# Swap 설정 (4GB RAM 서버 기준)
# =====================================================
echo "💾 Swap 설정 중..."
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    sysctl -p
fi

# =====================================================
# 타임존 설정
# =====================================================
echo "🕐 타임존 설정 중..."
timedatectl set-timezone Asia/Seoul

# =====================================================
# 보안 설정
# =====================================================
echo "🔐 보안 설정 중..."

# SSH 설정 강화
sed -i 's/#PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# 자동 보안 업데이트
apt-get install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# =====================================================
# 완료
# =====================================================
echo ""
echo "✅ CodeB 서버 초기화 완료!"
echo ""
echo "설치된 도구:"
echo "  - Podman: $(podman --version)"
echo "  - Node.js: $(node --version)"
echo "  - PM2: $(pm2 --version)"
echo "  - Caddy: $(caddy version)"
echo "  - gh: $(gh --version | head -1)"
echo ""
echo "다음 단계:"
echo "  1. Caddy 설정: /etc/caddy/Caddyfile"
echo "  2. 환경변수 설정: /opt/codeb/config/"
echo "  3. 앱 배포: GitHub Actions에서 자동 배포"
