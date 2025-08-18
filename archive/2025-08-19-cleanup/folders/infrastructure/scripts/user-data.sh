#!/bin/bash

# Vultr Server Initial Setup Script
# This script runs on first boot

set -e

# Update system
apt-get update
apt-get upgrade -y

# Set hostname
hostnamectl set-hostname ${hostname}

# Install essential packages
apt-get install -y \
    curl \
    wget \
    git \
    vim \
    htop \
    net-tools \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    ufw \
    fail2ban

# Configure UFW firewall
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8000/tcp

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
systemctl enable docker
systemctl start docker

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Configure fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# Create backup directories (for block storage)
mkdir -p /mnt/blockstorage

# Log setup completion
echo "Server initialization completed at $(date)" >> /var/log/server-init.log