#!/bin/bash
# CodeB Hybrid Deployment - Workflow Generator
# 3가지 배포 타입의 워크플로우 파일 생성

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/../templates/workflows"
OUTPUT_DIR=".github/workflows"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

usage() {
    echo "Usage: $0 <project-name> <deploy-type>"
    echo ""
    echo "Deploy Types:"
    echo "  self-hosted  - Self-hosted Runner (관리자용)"
    echo "  ssh          - GitHub-hosted + SSH (admin용)"
    echo "  api          - GitHub-hosted + API (팀원용, 권장)"
    echo ""
    echo "Examples:"
    echo "  $0 myapp api"
    echo "  $0 myapp ssh"
    echo "  $0 myapp self-hosted"
    echo ""
    echo "Options:"
    echo "  -o, --output <dir>   Output directory (default: .github/workflows)"
    echo "  -f, --force          Overwrite existing file"
    echo "  -h, --help           Show this help"
    exit 1
}

# Parse arguments
PROJECT_NAME=""
DEPLOY_TYPE=""
FORCE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -f|--force)
            FORCE=true
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

# Validate arguments
if [ -z "$PROJECT_NAME" ] || [ -z "$DEPLOY_TYPE" ]; then
    usage
fi

# Validate deploy type
case $DEPLOY_TYPE in
    self-hosted|ssh|api)
        ;;
    *)
        echo -e "${RED}Error: Invalid deploy type '$DEPLOY_TYPE'${NC}"
        echo "Valid types: self-hosted, ssh, api"
        exit 1
        ;;
esac

# Check template exists
TEMPLATE_FILE="$TEMPLATE_DIR/deploy-${DEPLOY_TYPE}.yml"
if [ ! -f "$TEMPLATE_FILE" ]; then
    echo -e "${RED}Error: Template not found: $TEMPLATE_FILE${NC}"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

OUTPUT_FILE="$OUTPUT_DIR/deploy.yml"

# Check if file exists
if [ -f "$OUTPUT_FILE" ] && [ "$FORCE" = false ]; then
    echo -e "${YELLOW}Warning: $OUTPUT_FILE already exists${NC}"
    read -p "Overwrite? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# Generate workflow
echo -e "${BLUE}Generating workflow...${NC}"
echo "  Project: $PROJECT_NAME"
echo "  Type: $DEPLOY_TYPE"
echo "  Template: $TEMPLATE_FILE"
echo "  Output: $OUTPUT_FILE"

# Replace placeholders
sed "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" "$TEMPLATE_FILE" > "$OUTPUT_FILE"

echo ""
echo -e "${GREEN}Workflow generated successfully!${NC}"
echo ""

# Show required secrets
echo "Required GitHub Secrets:"
echo "========================"

case $DEPLOY_TYPE in
    self-hosted)
        echo "  - GHCR_TOKEN (optional, uses GITHUB_TOKEN)"
        echo ""
        echo "Note: Self-hosted Runner must be installed on the server."
        ;;
    ssh)
        echo "  - GHCR_TOKEN (optional, uses GITHUB_TOKEN)"
        echo "  - SERVER_HOST    = 158.247.203.55"
        echo "  - SERVER_USER    = deploy"
        echo "  - SSH_PRIVATE_KEY = <Ed25519 private key>"
        echo ""
        echo -e "${YELLOW}Warning: SSH 방식은 admin 권한만 사용 가능${NC}"
        ;;
    api)
        echo "  - GHCR_TOKEN (optional, uses GITHUB_TOKEN)"
        echo "  - CODEB_API_KEY  = codeb_teamId_role_token"
        echo ""
        echo "Get API key: /we:token create myapp member"
        ;;
esac

echo ""
echo "Next steps:"
echo "  1. Set required secrets in GitHub repository settings"
echo "  2. Push changes to trigger deployment"
echo "     git add $OUTPUT_FILE && git commit -m 'Add deploy workflow' && git push"
echo ""
echo "Manual trigger:"
echo "  gh workflow run deploy.yml"
echo "  gh workflow run deploy.yml -f action=promote"
echo "  gh workflow run deploy.yml -f action=rollback"
