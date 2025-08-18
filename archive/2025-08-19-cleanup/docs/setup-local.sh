#!/bin/bash

#################################################
# CodeB Local Development Setup Script
# 
# This script sets up CodeB for local development
# on your machine (macOS, Linux, or WSL).
#################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Print colored message
print_message() {
    local color=$1
    shift
    echo -e "${color}$@${NC}"
}

# Detect OS
detect_os() {
    OS=$(uname -s)
    case "$OS" in
        Darwin*)
            OS_TYPE="macos"
            print_message $BLUE "Detected OS: macOS"
            ;;
        Linux*)
            OS_TYPE="linux"
            print_message $BLUE "Detected OS: Linux"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            OS_TYPE="windows"
            print_message $BLUE "Detected OS: Windows (using WSL recommended)"
            ;;
        *)
            print_message $RED "Unsupported OS: $OS"
            exit 1
            ;;
    esac
}

# Check prerequisites
check_prerequisites() {
    print_message $YELLOW "Checking prerequisites..."
    
    local missing=()
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        missing+=("Node.js")
    else
        NODE_VERSION=$(node -v)
        print_message $GREEN "✓ Node.js $NODE_VERSION"
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        missing+=("npm")
    else
        NPM_VERSION=$(npm -v)
        print_message $GREEN "✓ npm $NPM_VERSION"
    fi
    
    # Check Git
    if ! command -v git &> /dev/null; then
        missing+=("Git")
    else
        GIT_VERSION=$(git --version | cut -d' ' -f3)
        print_message $GREEN "✓ Git $GIT_VERSION"
    fi
    
    # Check Podman (optional for local dev)
    if command -v podman &> /dev/null; then
        PODMAN_VERSION=$(podman --version | cut -d' ' -f3)
        print_message $GREEN "✓ Podman $PODMAN_VERSION"
    else
        print_message $YELLOW "⚠ Podman not installed (optional for local development)"
    fi
    
    # Report missing dependencies
    if [ ${#missing[@]} -gt 0 ]; then
        print_message $RED "\nMissing required dependencies:"
        for dep in "${missing[@]}"; do
            print_message $RED "  - $dep"
        done
        print_message $YELLOW "\nPlease install missing dependencies first:"
        
        if [[ "$OS_TYPE" == "macos" ]]; then
            print_message $BLUE "  brew install node git"
            print_message $BLUE "  brew install --cask podman-desktop  # Optional"
        elif [[ "$OS_TYPE" == "linux" ]]; then
            print_message $BLUE "  sudo apt install nodejs npm git podman  # Ubuntu/Debian"
            print_message $BLUE "  sudo dnf install nodejs npm git podman  # Fedora/RHEL"
        fi
        exit 1
    fi
}

# Setup project directories
setup_directories() {
    print_message $YELLOW "Setting up project directories..."
    
    # Create data directories
    mkdir -p data/{database,repositories,backups}
    mkdir -p logs
    
    print_message $GREEN "✓ Directories created"
}

# Install server dependencies
install_server_deps() {
    print_message $YELLOW "Installing server dependencies..."
    
    cd codeb-remix
    
    # Install dependencies
    npm install
    
    # Generate Prisma client (even though we use JSON DB)
    npm run db:generate || true
    
    print_message $GREEN "✓ Server dependencies installed"
    cd ..
}

# Install CLI dependencies
install_cli_deps() {
    print_message $YELLOW "Installing CLI dependencies..."
    
    cd codeb-cli
    
    # Install dependencies
    npm install
    
    # Link CLI for local development
    npm link
    
    print_message $GREEN "✓ CLI dependencies installed and linked"
    print_message $BLUE "  You can now use 'codeb' command globally"
    cd ..
}

# Create environment configuration
create_env_config() {
    print_message $YELLOW "Creating environment configuration..."
    
    # Generate JWT secret
    JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "dev-secret-change-in-production")
    
    cat > codeb-remix/.env << EOF
# CodeB Local Development Configuration
NODE_ENV=development
PORT=3000

# Database
DATABASE_PATH=../data/database/database.json

# Storage
STORAGE_PATH=../data
GIT_REPOS_PATH=../data/repositories
LOG_PATH=../logs

# Security
JWT_SECRET=$JWT_SECRET

# Podman (if available)
PODMAN_SOCKET=/var/run/podman/podman.sock

# Caddy API (if using)
CADDY_API_URL=http://localhost:2019

# API Configuration
CODEB_API_URL=http://localhost:3000
EOF
    
    print_message $GREEN "✓ Environment configuration created"
    print_message $BLUE "  Edit codeb-remix/.env to customize settings"
}

# Initialize database
initialize_database() {
    print_message $YELLOW "Initializing database..."
    
    cd codeb-remix
    
    # Start server temporarily to initialize
    print_message $BLUE "Starting server temporarily..."
    npm run dev > ../logs/init.log 2>&1 &
    SERVER_PID=$!
    
    # Wait for server to start
    sleep 5
    
    # Create initial admin key
    print_message $YELLOW "Creating initial admin API key..."
    
    RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/init)
    
    if [[ $? -eq 0 ]]; then
        API_KEY=$(echo $RESPONSE | grep -oP '"key"\s*:\s*"[^"]*"' | cut -d'"' -f4)
        
        if [[ -n "$API_KEY" ]]; then
            print_message $GREEN "\n========================================="
            print_message $GREEN "INITIAL ADMIN API KEY CREATED"
            print_message $GREEN "========================================="
            print_message $CYAN "API Key: $API_KEY"
            print_message $GREEN "========================================="
            print_message $RED "SAVE THIS KEY SECURELY!"
            print_message $YELLOW "This key will not be shown again."
            
            # Save to file
            echo "$API_KEY" > ../data/admin-key.txt
            print_message $BLUE "\nKey saved to: data/admin-key.txt"
        fi
    fi
    
    # Stop server
    kill $SERVER_PID 2>/dev/null || true
    
    cd ..
    print_message $GREEN "✓ Database initialized"
}

# Configure CLI
configure_cli() {
    print_message $YELLOW "Configuring CLI..."
    
    # Check if API key was created
    if [[ -f "data/admin-key.txt" ]]; then
        API_KEY=$(cat data/admin-key.txt)
        
        print_message $BLUE "Configuring CLI with local server..."
        
        # Create CLI config directory
        mkdir -p ~/.codeb
        
        # Create config file
        cat > ~/.codeb/config.json << EOF
{
  "server": "http://localhost:3000",
  "apiKey": "$API_KEY",
  "defaultEnvironment": "development",
  "outputFormat": "table"
}
EOF
        
        print_message $GREEN "✓ CLI configured automatically"
    else
        print_message $YELLOW "⚠ No API key found. Configure CLI manually:"
        print_message $BLUE "  codeb config init"
    fi
}

# Create development scripts
create_dev_scripts() {
    print_message $YELLOW "Creating development scripts..."
    
    # Create start script
    cat > start-dev.sh << 'EOF'
#!/bin/bash
# Start CodeB development servers

echo "Starting CodeB development environment..."

# Start server
cd codeb-remix
npm run dev &
SERVER_PID=$!
echo "Server started (PID: $SERVER_PID)"

cd ..

echo ""
echo "========================================="
echo "CodeB Development Environment Started"
echo "========================================="
echo "Server: http://localhost:3000"
echo "API: http://localhost:3000/api"
echo ""
echo "To stop: Press Ctrl+C"
echo "========================================="

# Wait for interrupt
trap "echo 'Stopping...'; kill $SERVER_PID 2>/dev/null; exit" INT
wait
EOF
    chmod +x start-dev.sh
    
    # Create test script
    cat > test-all.sh << 'EOF'
#!/bin/bash
# Run all tests

echo "Running tests..."

# Test server
cd codeb-remix
npm test
cd ..

# Test CLI
cd codeb-cli
npm test
cd ..

echo "All tests completed!"
EOF
    chmod +x test-all.sh
    
    print_message $GREEN "✓ Development scripts created"
    print_message $BLUE "  ./start-dev.sh - Start development servers"
    print_message $BLUE "  ./test-all.sh - Run all tests"
}

# Create sample project
create_sample_project() {
    print_message $YELLOW "Creating sample project configuration..."
    
    cat > sample-project.json << EOF
{
  "name": "sample-app",
  "git": "https://github.com/example/sample-app.git",
  "domain": "sample.local",
  "template": "remix",
  "database": "postgres",
  "cache": true,
  "ssl": true,
  "env": {
    "NODE_ENV": "development",
    "DATABASE_URL": "postgresql://user:pass@localhost/sample",
    "REDIS_URL": "redis://localhost:6379"
  }
}
EOF
    
    print_message $GREEN "✓ Sample project configuration created"
    print_message $BLUE "  Use: codeb project create --from sample-project.json"
}

# Print next steps
print_next_steps() {
    print_message $GREEN "\n========================================="
    print_message $GREEN "Local Development Setup Complete!"
    print_message $GREEN "========================================="
    
    print_message $CYAN "\n📚 Quick Start Guide:"
    print_message $BLUE "\n1. Start the development server:"
    print_message $YELLOW "   ./start-dev.sh"
    
    print_message $BLUE "\n2. In another terminal, test the CLI:"
    print_message $YELLOW "   codeb config test"
    print_message $YELLOW "   codeb project list"
    
    print_message $BLUE "\n3. Create your first project:"
    print_message $YELLOW "   codeb project create myapp --template remix"
    
    print_message $CYAN "\n📁 Project Structure:"
    print_message $BLUE "   codeb-remix/   - Server application"
    print_message $BLUE "   codeb-cli/     - CLI tool"
    print_message $BLUE "   data/          - Local data storage"
    print_message $BLUE "   logs/          - Application logs"
    print_message $BLUE "   docs/          - Documentation"
    
    print_message $CYAN "\n🔧 Configuration Files:"
    print_message $BLUE "   codeb-remix/.env       - Server configuration"
    print_message $BLUE "   ~/.codeb/config.json   - CLI configuration"
    
    print_message $CYAN "\n📖 Documentation:"
    print_message $BLUE "   docs/README.md         - Main documentation"
    print_message $BLUE "   docs/API.md            - API reference"
    print_message $BLUE "   docs/CLI.md            - CLI reference"
    
    if [[ -f "data/admin-key.txt" ]]; then
        print_message $CYAN "\n🔑 Admin API Key:"
        print_message $YELLOW "   $(cat data/admin-key.txt)"
        print_message $RED "   (Saved in data/admin-key.txt)"
    fi
    
    print_message $GREEN "\n========================================="
    print_message $GREEN "Happy coding! 🚀"
    print_message $GREEN "========================================="
}

# Main setup flow
main() {
    print_message $GREEN "========================================="
    print_message $GREEN "CodeB Local Development Setup"
    print_message $GREEN "========================================="
    
    detect_os
    check_prerequisites
    
    print_message $BLUE "\nThis script will set up:"
    print_message $BLUE "  - Project directories"
    print_message $BLUE "  - Server dependencies"
    print_message $BLUE "  - CLI tool"
    print_message $BLUE "  - Environment configuration"
    print_message $BLUE "  - Initial admin API key"
    print_message $BLUE "  - Development scripts"
    
    read -p "Continue with setup? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_message $YELLOW "Setup cancelled"
        exit 0
    fi
    
    setup_directories
    install_server_deps
    install_cli_deps
    create_env_config
    initialize_database
    configure_cli
    create_dev_scripts
    create_sample_project
    print_next_steps
}

# Run main function
main "$@"