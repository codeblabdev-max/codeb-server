#!/bin/bash
# CodeB Hybrid Deployment - GitHub Secrets Setup Guide
# 각 배포 타입에 필요한 Secrets 설정 가이드

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

usage() {
    echo "Usage: $0 <project-name> <deploy-type> [--set]"
    echo ""
    echo "Deploy Types:"
    echo "  self-hosted  - Self-hosted Runner"
    echo "  ssh          - GitHub-hosted + SSH"
    echo "  api          - GitHub-hosted + API"
    echo ""
    echo "Options:"
    echo "  --set        Actually set the secrets (requires gh CLI)"
    echo "  --check      Check if secrets are already set"
    echo ""
    echo "Examples:"
    echo "  $0 myapp api          # Show required secrets"
    echo "  $0 myapp api --check  # Check existing secrets"
    echo "  $0 myapp ssh --set    # Interactively set secrets"
    exit 1
}

# Parse arguments
PROJECT_NAME=""
DEPLOY_TYPE=""
ACTION="show"

while [[ $# -gt 0 ]]; do
    case $1 in
        --set)
            ACTION="set"
            shift
            ;;
        --check)
            ACTION="check"
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            if [ -z "$PROJECT_NAME" ]; then
                PROJECT_NAME="$1"
            elif [ -z "$DEPLOY_TYPE" ]; then
                DEPLOY_TYPE="$1"
            fi
            shift
            ;;
    esac
done

if [ -z "$PROJECT_NAME" ] || [ -z "$DEPLOY_TYPE" ]; then
    usage
fi

# Validate deploy type
case $DEPLOY_TYPE in
    self-hosted|ssh|api)
        ;;
    *)
        echo -e "${RED}Error: Invalid deploy type '$DEPLOY_TYPE'${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         CodeB GitHub Secrets Setup                         ║${NC}"
echo -e "${BLUE}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BLUE}║${NC} Project: ${GREEN}$PROJECT_NAME${NC}"
echo -e "${BLUE}║${NC} Type: ${GREEN}$DEPLOY_TYPE${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to check if secret exists
check_secret() {
    local secret_name=$1
    if gh secret list 2>/dev/null | grep -q "^$secret_name"; then
        echo -e "  ${GREEN}✓${NC} $secret_name"
        return 0
    else
        echo -e "  ${RED}✗${NC} $secret_name (not set)"
        return 1
    fi
}

# Function to set secret
set_secret() {
    local secret_name=$1
    local description=$2
    local default_value=$3

    echo ""
    echo -e "${CYAN}$secret_name${NC}: $description"

    if [ -n "$default_value" ]; then
        echo -e "  Default: ${YELLOW}$default_value${NC}"
        read -p "  Enter value (or press Enter for default): " value
        value="${value:-$default_value}"
    else
        read -p "  Enter value: " value
    fi

    if [ -n "$value" ]; then
        echo "$value" | gh secret set "$secret_name"
        echo -e "  ${GREEN}✓${NC} Secret set"
    else
        echo -e "  ${YELLOW}⚠${NC} Skipped"
    fi
}

# Function to set secret from file
set_secret_from_file() {
    local secret_name=$1
    local description=$2

    echo ""
    echo -e "${CYAN}$secret_name${NC}: $description"
    read -p "  Enter file path: " filepath

    if [ -f "$filepath" ]; then
        gh secret set "$secret_name" < "$filepath"
        echo -e "  ${GREEN}✓${NC} Secret set from file"
    else
        echo -e "  ${RED}✗${NC} File not found"
    fi
}

# Show/Check/Set secrets based on deploy type
case $DEPLOY_TYPE in
    self-hosted)
        echo "Required Secrets for Self-hosted Runner:"
        echo "========================================="
        echo ""
        echo "  GHCR_TOKEN (optional)"
        echo "    - Uses GITHUB_TOKEN by default"
        echo "    - Only needed if pushing to external registry"
        echo ""
        echo -e "${YELLOW}Note: Self-hosted Runner must be installed on the server.${NC}"
        echo ""
        echo "Runner Installation:"
        echo "  1. Go to GitHub repo → Settings → Actions → Runners"
        echo "  2. Click 'New self-hosted runner'"
        echo "  3. Follow instructions to install on server"
        echo ""
        echo "Server Requirements:"
        echo "  - Docker installed and running"
        echo "  - Access to /opt/codeb/registry/"
        echo "  - Access to /opt/codeb/projects/"
        ;;

    ssh)
        echo "Required Secrets for SSH Deployment:"
        echo "====================================="
        echo ""

        if [ "$ACTION" = "check" ]; then
            echo "Checking secrets..."
            check_secret "SERVER_HOST"
            check_secret "SERVER_USER"
            check_secret "SSH_PRIVATE_KEY"

        elif [ "$ACTION" = "set" ]; then
            if ! command -v gh &> /dev/null; then
                echo -e "${RED}Error: GitHub CLI (gh) is required for --set${NC}"
                echo "Install: brew install gh"
                exit 1
            fi

            echo "Setting secrets interactively..."
            set_secret "SERVER_HOST" "App server IP address" "158.247.203.55"
            set_secret "SERVER_USER" "SSH username" "deploy"

            echo ""
            echo -e "${CYAN}SSH_PRIVATE_KEY${NC}: SSH private key (Ed25519 recommended)"
            echo "  Generate new key: ssh-keygen -t ed25519 -f ~/.ssh/codeb-deploy"
            echo ""
            read -p "  Enter path to private key file: " keyfile

            if [ -f "$keyfile" ]; then
                gh secret set "SSH_PRIVATE_KEY" < "$keyfile"
                echo -e "  ${GREEN}✓${NC} SSH key set"
                echo ""
                echo -e "${YELLOW}Don't forget to add public key to server:${NC}"
                echo "  cat ${keyfile}.pub >> ~/.ssh/authorized_keys"
            else
                echo -e "  ${RED}✗${NC} File not found"
            fi

        else
            echo "  SERVER_HOST      = 158.247.203.55 (App server)"
            echo "  SERVER_USER      = deploy (or root)"
            echo "  SSH_PRIVATE_KEY  = <Ed25519 private key content>"
            echo ""
            echo -e "${YELLOW}⚠️  SSH 방식은 admin 권한만 사용 가능합니다.${NC}"
            echo ""
            echo "SSH Key Setup:"
            echo "  1. Generate key:"
            echo "     ssh-keygen -t ed25519 -C 'github-actions' -f ~/.ssh/github-deploy"
            echo ""
            echo "  2. Add public key to server:"
            echo "     ssh-copy-id -i ~/.ssh/github-deploy.pub deploy@158.247.203.55"
            echo ""
            echo "  3. Set secret in GitHub:"
            echo "     gh secret set SSH_PRIVATE_KEY < ~/.ssh/github-deploy"
        fi
        ;;

    api)
        echo "Required Secrets for API Deployment:"
        echo "====================================="
        echo ""

        if [ "$ACTION" = "check" ]; then
            echo "Checking secrets..."
            check_secret "CODEB_API_KEY"

        elif [ "$ACTION" = "set" ]; then
            if ! command -v gh &> /dev/null; then
                echo -e "${RED}Error: GitHub CLI (gh) is required for --set${NC}"
                echo "Install: brew install gh"
                exit 1
            fi

            echo "Setting secrets..."
            echo ""
            echo -e "${CYAN}CODEB_API_KEY${NC}: CodeB API key"
            echo ""
            echo "Get API key using Claude Code:"
            echo "  /we:token create $PROJECT_NAME member"
            echo ""
            read -p "  Enter API key (codeb_...): " apikey

            if [ -n "$apikey" ]; then
                echo "$apikey" | gh secret set "CODEB_API_KEY"
                echo -e "  ${GREEN}✓${NC} API key set"
            else
                echo -e "  ${YELLOW}⚠${NC} Skipped"
            fi

        else
            echo "  CODEB_API_KEY = codeb_teamId_role_token"
            echo ""
            echo "API Key Format:"
            echo "  codeb_{teamId}_{role}_{randomToken}"
            echo ""
            echo "Roles:"
            echo "  owner  - 팀 삭제, 모든 작업"
            echo "  admin  - 멤버 관리, 토큰 관리"
            echo "  member - 배포, promote, rollback"
            echo "  viewer - 조회만"
            echo ""
            echo "Get API Key:"
            echo "  # Claude Code에서 실행"
            echo "  /we:token create $PROJECT_NAME member"
            echo ""
            echo "Set Secret:"
            echo "  gh secret set CODEB_API_KEY"
            echo "  # 프롬프트에 API 키 붙여넣기"
        fi
        ;;
esac

echo ""
echo "───────────────────────────────────────────────────────────────"
echo ""
echo "Common Secrets (all types):"
echo "  GITHUB_TOKEN - Auto-provided by GitHub Actions"
echo ""
echo "GitHub CLI commands:"
echo "  gh secret list                    # List secrets"
echo "  gh secret set SECRET_NAME         # Set secret (interactive)"
echo "  gh secret set SECRET_NAME < file  # Set from file"
echo "  gh secret delete SECRET_NAME      # Delete secret"
echo ""
