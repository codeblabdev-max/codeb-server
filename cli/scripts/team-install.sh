#!/bin/bash
# CodeB CLI Team Install Script
#
# 팀 관리자용 설치 스크립트 생성기
# API 키가 미리 포함된 설치 스크립트를 생성합니다.
#
# Usage (관리자):
#   ./team-install.sh <TEAM_API_KEY> > install-myteam.sh
#
# Usage (팀원):
#   curl -sSL https://releases.codeb.kr/cli/team/myteam.sh | bash
#   또는 로컬 파일 실행: bash install-myteam.sh

set -e

# API 키 확인
TEAM_API_KEY="${1:-}"
if [ -z "$TEAM_API_KEY" ]; then
    echo "❌ API Key가 필요합니다."
    echo ""
    echo "Usage: $0 <TEAM_API_KEY>"
    echo ""
    echo "Example:"
    echo "  $0 codeb_myteam_member_xxx > install-myteam.sh"
    exit 1
fi

# API 키 형식 검증
if [[ ! "$TEAM_API_KEY" =~ ^codeb_ ]]; then
    echo "❌ API Key 형식이 올바르지 않습니다 (codeb_로 시작해야 함)"
    exit 1
fi

# 팀 ID 추출 (codeb_{teamId}_{role}_{token})
TEAM_ID=$(echo "$TEAM_API_KEY" | cut -d'_' -f2)

cat << 'SCRIPT_HEADER'
#!/bin/bash
# CodeB CLI Team Install Script (Auto-generated)
# API Key가 미리 포함된 팀 전용 설치 스크립트
#
# Usage: bash this-script.sh
#
# 설치 내용:
#   1. CodeB CLI (~/.codeb/)
#   2. Claude Code 연동 (~/.claude.json)
#   3. Commands & Skills (~/.claude/)

set -e

MINIO_URL="${MINIO_URL:-https://releases.codeb.kr}"
CLAUDE_DIR="$HOME/.claude"
CLAUDE_JSON="$HOME/.claude.json"
CODEB_DIR="$HOME/.codeb"

SCRIPT_HEADER

# API 키를 스크립트에 포함
echo ""
echo "# Pre-configured Team API Key"
echo "TEAM_API_KEY=\"$TEAM_API_KEY\""
echo ""

cat << 'SCRIPT_BODY'
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "          🚀 CodeB CLI Team Installer"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check existing installation
if [ -d "$CODEB_DIR" ] && [ -f "$CODEB_DIR/package.json" ]; then
    CURRENT_VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$CODEB_DIR/package.json" 2>/dev/null | cut -d'"' -f4 || echo "unknown")
    echo "📌 Current version: $CURRENT_VERSION"
    echo "🔄 Upgrading installation..."
    echo ""
fi

# Get latest version
VERSION=$(curl -sf "$MINIO_URL/cli/version.json" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
if [ -z "$VERSION" ]; then
    echo "❌ Failed to get version info"
    exit 1
fi
echo "📦 Latest version: $VERSION"
echo "🔑 API Key: ${TEAM_API_KEY:0:20}..."
echo ""

# Download and extract
echo "📥 Downloading codeb-cli-${VERSION}.tar.gz..."
curl -sL "$MINIO_URL/cli/codeb-cli-${VERSION}.tar.gz" -o /tmp/codeb-cli.tar.gz

echo "📦 Extracting..."
tar -xzf /tmp/codeb-cli.tar.gz -C /tmp

# ============================================
# Install CLI package
# ============================================
echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│  Installing CodeB CLI                                   │"
echo "└─────────────────────────────────────────────────────────┘"

# Create directories
mkdir -p "$CLAUDE_DIR/commands/we"
mkdir -p "$CLAUDE_DIR/skills"

# Clean old installation
if [ -d "$CODEB_DIR" ]; then
    rm -rf "$CODEB_DIR"
fi
mkdir -p "$CODEB_DIR"

# Copy files
cp -r /tmp/codeb-release/bin "$CODEB_DIR/"
cp -r /tmp/codeb-release/src "$CODEB_DIR/"
cp /tmp/codeb-release/package.json "$CODEB_DIR/"
cp /tmp/codeb-release/package-lock.json "$CODEB_DIR/" 2>/dev/null || true
cp /tmp/codeb-release/VERSION "$CODEB_DIR/" 2>/dev/null || true

# Install dependencies
if [ -f "$CODEB_DIR/package.json" ]; then
    cd "$CODEB_DIR"
    npm install --omit=dev --ignore-scripts --silent 2>/dev/null || npm install --production --ignore-scripts --silent 2>/dev/null || true
    cd - > /dev/null
fi

# Create symlinks
chmod +x "$CODEB_DIR/bin/we.js"
chmod +x "$CODEB_DIR/bin/codeb-mcp.js" 2>/dev/null || true

mkdir -p "$HOME/.local/bin"
rm -f "$HOME/.local/bin/we" "$HOME/.local/bin/codeb-mcp" 2>/dev/null || true
ln -sf "$CODEB_DIR/bin/we.js" "$HOME/.local/bin/we"
ln -sf "$CODEB_DIR/bin/codeb-mcp.js" "$HOME/.local/bin/codeb-mcp" 2>/dev/null || true

if [ -d "/opt/homebrew/bin" ] && [ -w "/opt/homebrew/bin" ]; then
    rm -f "/opt/homebrew/bin/we" "/opt/homebrew/bin/codeb-mcp" 2>/dev/null || true
    ln -sf "$CODEB_DIR/bin/we.js" "/opt/homebrew/bin/we"
    ln -sf "$CODEB_DIR/bin/codeb-mcp.js" "/opt/homebrew/bin/codeb-mcp" 2>/dev/null || true
fi
echo "   ✅ CLI installed"

# Copy commands
rm -f "$CLAUDE_DIR/commands/we/"*.md 2>/dev/null || true
cp -r /tmp/codeb-release/commands/we/* "$CLAUDE_DIR/commands/we/" 2>/dev/null || true
CMD_COUNT=$(ls -1 "$CLAUDE_DIR/commands/we/"*.md 2>/dev/null | wc -l | tr -d ' ')
echo "   ✅ $CMD_COUNT commands installed"

# Copy skills
if [ -d "/tmp/codeb-release/skills" ]; then
    cp -r /tmp/codeb-release/skills/* "$CLAUDE_DIR/skills/" 2>/dev/null || true
fi
echo "   ✅ Skills installed"

# Copy rules
cp /tmp/codeb-release/rules/CLAUDE.md "$CLAUDE_DIR/CLAUDE.md" 2>/dev/null || true
echo "   ✅ CLAUDE.md installed"

# ============================================
# API Key & MCP Configuration
# ============================================
echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│  Configuring API Key & MCP                              │"
echo "└─────────────────────────────────────────────────────────┘"

# Save API key to config.json
cat > "$CODEB_DIR/config.json" << CONFIGEOF
{
  "apiKey": "$TEAM_API_KEY",
  "apiUrl": "https://api.codeb.kr",
  "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
CONFIGEOF
echo "   ✅ API Key saved to config.json"

# Configure MCP
MCP_SCRIPT="$CODEB_DIR/src/mcp/index.js"

if [ -f "$CLAUDE_JSON" ]; then
    if command -v jq &> /dev/null; then
        TMP_JSON=$(mktemp)
        jq --arg script "$MCP_SCRIPT" --arg apikey "$TEAM_API_KEY" '
            .mcpServers["codeb-deploy"] = {
                "type": "stdio",
                "command": "node",
                "args": [$script],
                "env": {
                    "CODEB_API_URL": "https://api.codeb.kr",
                    "CODEB_API_KEY": $apikey
                }
            }
        ' "$CLAUDE_JSON" > "$TMP_JSON" && mv "$TMP_JSON" "$CLAUDE_JSON"
        echo "   ✅ MCP configured (existing settings preserved)"
    else
        if command -v claude &> /dev/null; then
            claude mcp remove codeb-deploy -s user 2>/dev/null || true
            claude mcp add codeb-deploy -s user -e CODEB_API_URL=https://api.codeb.kr -e CODEB_API_KEY="$TEAM_API_KEY" -- node "$MCP_SCRIPT" 2>/dev/null || true
            echo "   ✅ MCP configured via claude CLI"
        else
            echo "   ⚠️  jq/claude CLI not found - manual MCP setup required"
        fi
    fi
else
    cat > "$CLAUDE_JSON" << EOF
{
  "mcpServers": {
    "codeb-deploy": {
      "type": "stdio",
      "command": "node",
      "args": ["$MCP_SCRIPT"],
      "env": {
        "CODEB_API_URL": "https://api.codeb.kr",
        "CODEB_API_KEY": "$TEAM_API_KEY"
      }
    }
  }
}
EOF
    echo "   ✅ ~/.claude.json created"
fi

# ============================================
# Cleanup & Summary
# ============================================
rm -rf /tmp/codeb-release /tmp/codeb-cli.tar.gz

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Installation Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "📦 Version: $VERSION"
echo "🔑 API Key: Configured ✅"
echo ""
echo "📋 Installed:"
echo "   • CLI:       ~/.codeb/ (we command)"
echo "   • Commands:  ~/.claude/commands/we/"
echo "   • Rules:     ~/.claude/CLAUDE.md"
echo "   • MCP:       ~/.claude.json (codeb-deploy)"
echo ""
echo "📋 Next Steps:"
echo "   1. Claude Code 재시작 (필수!)"
echo "   2. /we:health 로 연결 확인"
echo "   3. /we:quick 로 새 프로젝트 초기화"
echo ""
echo "═══════════════════════════════════════════════════════════"
SCRIPT_BODY
