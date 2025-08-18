#!/bin/bash

#################################################
# CodeB Server Installation Script
# 
# This script installs and configures the CodeB
# project management system on your server.
#################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/codeb"
DATA_DIR="/var/lib/codeb"
LOG_DIR="/var/log/codeb"
SERVICE_USER="codeb"
NODE_VERSION="18"

# Print colored message
print_message() {
    local color=$1
    shift
    echo -e "${color}$@${NC}"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_message $RED "This script must be run as root!"
        exit 1
    fi
}

# Detect OS
detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID
        OS_VERSION=$VERSION_ID
    else
        print_message $RED "Cannot detect OS. This script supports Ubuntu, Debian, and RHEL-based systems."
        exit 1
    fi
    
    print_message $BLUE "Detected OS: $OS $OS_VERSION"
}

# Install system dependencies
install_dependencies() {
    print_message $YELLOW "Installing system dependencies..."
    
    case $OS in
        ubuntu|debian)
            apt-get update
            apt-get install -y \
                curl \
                git \
                build-essential \
                nginx \
                certbot \
                python3-certbot-nginx \
                postgresql \
                postgresql-contrib \
                redis-server \
                ufw
            ;;
        rhel|centos|fedora|rocky|almalinux)
            dnf install -y \
                curl \
                git \
                gcc-c++ \
                make \
                nginx \
                certbot \
                python3-certbot-nginx \
                postgresql \
                postgresql-server \
                postgresql-contrib \
                redis \
                firewalld
            
            # Initialize PostgreSQL
            postgresql-setup --initdb
            systemctl enable postgresql
            systemctl start postgresql
            ;;
        *)
            print_message $RED "Unsupported OS: $OS"
            exit 1
            ;;
    esac
}

# Install Podman
install_podman() {
    print_message $YELLOW "Installing Podman..."
    
    case $OS in
        ubuntu|debian)
            apt-get install -y podman
            ;;
        rhel|centos|fedora|rocky|almalinux)
            dnf install -y podman
            ;;
    esac
    
    # Enable podman socket for user
    systemctl enable --now podman.socket
}

# Install Caddy
install_caddy() {
    print_message $YELLOW "Installing Caddy..."
    
    case $OS in
        ubuntu|debian)
            apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
            curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
            curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
            apt-get update
            apt-get install -y caddy
            ;;
        rhel|centos|fedora|rocky|almalinux)
            dnf install -y 'dnf-command(copr)'
            dnf copr enable @caddy/caddy -y
            dnf install -y caddy
            ;;
    esac
    
    systemctl enable caddy
}

# Install Node.js
install_nodejs() {
    print_message $YELLOW "Installing Node.js v${NODE_VERSION}..."
    
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    
    case $OS in
        ubuntu|debian)
            apt-get install -y nodejs
            ;;
        rhel|centos|fedora|rocky|almalinux)
            dnf install -y nodejs
            ;;
    esac
    
    # Install global packages
    npm install -g pm2 pnpm
}

# Create system user
create_user() {
    print_message $YELLOW "Creating system user..."
    
    if id "$SERVICE_USER" &>/dev/null; then
        print_message $BLUE "User $SERVICE_USER already exists"
    else
        useradd -r -s /bin/bash -m -d /home/$SERVICE_USER $SERVICE_USER
        print_message $GREEN "User $SERVICE_USER created"
    fi
}

# Create directory structure
create_directories() {
    print_message $YELLOW "Creating directory structure..."
    
    mkdir -p $INSTALL_DIR
    mkdir -p $DATA_DIR/{projects,postgres,redis,backups,repositories}
    mkdir -p $LOG_DIR
    
    chown -R $SERVICE_USER:$SERVICE_USER $INSTALL_DIR
    chown -R $SERVICE_USER:$SERVICE_USER $DATA_DIR
    chown -R $SERVICE_USER:$SERVICE_USER $LOG_DIR
    
    chmod 755 $INSTALL_DIR
    chmod 755 $DATA_DIR
    chmod 755 $LOG_DIR
}

# Clone and install CodeB
install_codeb() {
    print_message $YELLOW "Installing CodeB server..."
    
    cd /tmp
    
    # Clone repository (or copy from local if exists)
    if [[ -d "/Users/admin/new_project/codeb-server" ]]; then
        cp -r /Users/admin/new_project/codeb-server/* $INSTALL_DIR/
    else
        git clone https://github.com/yourusername/codeb-server.git
        cp -r codeb-server/* $INSTALL_DIR/
    fi
    
    cd $INSTALL_DIR/codeb-remix
    
    # Install dependencies
    su - $SERVICE_USER -c "cd $INSTALL_DIR/codeb-remix && npm install"
    
    # Build the application
    su - $SERVICE_USER -c "cd $INSTALL_DIR/codeb-remix && npm run build"
    
    print_message $GREEN "CodeB server installed"
}

# Configure environment
configure_environment() {
    print_message $YELLOW "Configuring environment..."
    
    cat > $INSTALL_DIR/codeb-remix/.env << EOF
NODE_ENV=production
PORT=3000
DATABASE_PATH=$DATA_DIR/database.json
STORAGE_PATH=$DATA_DIR
GIT_REPOS_PATH=$DATA_DIR/repositories
LOG_PATH=$LOG_DIR
JWT_SECRET=$(openssl rand -base64 32)
CADDY_API_URL=http://localhost:2019
PODMAN_SOCKET=/run/podman/podman.sock
EOF
    
    chown $SERVICE_USER:$SERVICE_USER $INSTALL_DIR/codeb-remix/.env
    chmod 600 $INSTALL_DIR/codeb-remix/.env
}

# Setup systemd service
setup_service() {
    print_message $YELLOW "Setting up systemd service..."
    
    cat > /etc/systemd/system/codeb.service << EOF
[Unit]
Description=CodeB Project Management Server
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR/codeb-remix
ExecStart=/usr/bin/node $INSTALL_DIR/codeb-remix/build/server/index.js
Restart=on-failure
RestartSec=10
StandardOutput=append:$LOG_DIR/codeb.log
StandardError=append:$LOG_DIR/codeb-error.log
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    systemctl enable codeb
    systemctl start codeb
}

# Setup PM2 (alternative to systemd)
setup_pm2() {
    print_message $YELLOW "Setting up PM2 process manager..."
    
    cat > $INSTALL_DIR/ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'codeb-server',
    script: '$INSTALL_DIR/codeb-remix/build/server/index.js',
    cwd: '$INSTALL_DIR/codeb-remix',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '$LOG_DIR/pm2-error.log',
    out_file: '$LOG_DIR/pm2-out.log',
    log_file: '$LOG_DIR/pm2-combined.log',
    time: true
  }]
};
EOF
    
    su - $SERVICE_USER -c "pm2 start $INSTALL_DIR/ecosystem.config.js"
    su - $SERVICE_USER -c "pm2 save"
    su - $SERVICE_USER -c "pm2 startup systemd -u $SERVICE_USER --hp /home/$SERVICE_USER"
}

# Configure Caddy
configure_caddy() {
    print_message $YELLOW "Configuring Caddy..."
    
    read -p "Enter your domain name (e.g., codeb.example.com): " DOMAIN
    read -p "Enter your email for SSL certificates: " EMAIL
    
    cat > /etc/caddy/Caddyfile << EOF
{
    email $EMAIL
}

$DOMAIN {
    reverse_proxy localhost:3000
    
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }
    
    encode gzip
    
    log {
        output file $LOG_DIR/caddy-access.log
        format json
    }
}
EOF
    
    systemctl restart caddy
}

# Configure firewall
configure_firewall() {
    print_message $YELLOW "Configuring firewall..."
    
    case $OS in
        ubuntu|debian)
            ufw allow 22/tcp   # SSH
            ufw allow 80/tcp   # HTTP
            ufw allow 443/tcp  # HTTPS
            ufw allow 3000/tcp # CodeB (if needed for direct access)
            ufw --force enable
            ;;
        rhel|centos|fedora|rocky|almalinux)
            firewall-cmd --permanent --add-service=ssh
            firewall-cmd --permanent --add-service=http
            firewall-cmd --permanent --add-service=https
            firewall-cmd --permanent --add-port=3000/tcp
            firewall-cmd --reload
            ;;
    esac
}

# Initialize database and create first admin key
initialize_database() {
    print_message $YELLOW "Initializing database..."
    
    # Wait for service to be ready
    sleep 5
    
    # Create initial admin key
    RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/init)
    
    if [[ $? -eq 0 ]]; then
        API_KEY=$(echo $RESPONSE | grep -oP '"key"\s*:\s*"[^"]*"' | cut -d'"' -f4)
        
        if [[ -n "$API_KEY" ]]; then
            print_message $GREEN "========================================="
            print_message $GREEN "INITIAL ADMIN API KEY CREATED"
            print_message $GREEN "========================================="
            print_message $YELLOW "API Key: $API_KEY"
            print_message $GREEN "========================================="
            print_message $RED "SAVE THIS KEY SECURELY! It will not be shown again."
            
            # Save to file
            echo "$API_KEY" > /root/codeb-admin-key.txt
            chmod 600 /root/codeb-admin-key.txt
            print_message $BLUE "Key also saved to: /root/codeb-admin-key.txt"
        fi
    else
        print_message $YELLOW "Could not create initial admin key. You can create it manually later."
    fi
}

# Install CLI tool
install_cli() {
    print_message $YELLOW "Installing CodeB CLI..."
    
    cd $INSTALL_DIR/codeb-cli
    npm install -g .
    
    print_message $GREEN "CodeB CLI installed globally"
    print_message $BLUE "Run 'codeb --help' to get started"
}

# Main installation flow
main() {
    print_message $GREEN "========================================="
    print_message $GREEN "CodeB Server Installation Script"
    print_message $GREEN "========================================="
    
    check_root
    detect_os
    
    print_message $BLUE "\nThis script will install:"
    print_message $BLUE "  - System dependencies"
    print_message $BLUE "  - Podman (container runtime)"
    print_message $BLUE "  - Caddy (web server)"
    print_message $BLUE "  - Node.js v${NODE_VERSION}"
    print_message $BLUE "  - CodeB server and CLI"
    
    read -p "Continue with installation? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_message $YELLOW "Installation cancelled"
        exit 0
    fi
    
    install_dependencies
    install_podman
    install_caddy
    install_nodejs
    create_user
    create_directories
    install_codeb
    configure_environment
    setup_service
    # setup_pm2  # Alternative to systemd
    configure_caddy
    configure_firewall
    initialize_database
    install_cli
    
    print_message $GREEN "\n========================================="
    print_message $GREEN "Installation completed successfully!"
    print_message $GREEN "========================================="
    print_message $BLUE "\nNext steps:"
    print_message $BLUE "1. Configure your DNS to point to this server"
    print_message $BLUE "2. Save the admin API key securely"
    print_message $BLUE "3. Configure the CLI: codeb config init"
    print_message $BLUE "4. Create your first project: codeb project create myapp"
    print_message $BLUE "\nService status:"
    systemctl status codeb --no-pager
    print_message $BLUE "\nLogs location: $LOG_DIR"
    print_message $BLUE "Data location: $DATA_DIR"
    print_message $BLUE "Installation location: $INSTALL_DIR"
}

# Run main function
main "$@"