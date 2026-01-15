#!/bin/bash
# CodeB CLI Direct Install Script
# Usage: curl -sSL http://64.176.226.119:9000/releases/cli/install.sh | bash

set -e

MINIO_URL="${MINIO_URL:-http://64.176.226.119:9000}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.codeb}"
CLAUDE_DIR="$HOME/.claude"

echo "🚀 CodeB CLI Direct Install"
echo "═══════════════════════════════════════════════"

# Get latest version
VERSION=$(curl -sf "$MINIO_URL/releases/cli/version.json" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
echo "📦 Latest version: $VERSION"

# Create directories
mkdir -p "$INSTALL_DIR"
mkdir -p "$CLAUDE_DIR/commands/we"
mkdir -p "$CLAUDE_DIR/skills"
mkdir -p "$CLAUDE_DIR/hooks"

# Download and extract
echo "📥 Downloading codeb-cli-${VERSION}.tar.gz..."
curl -sL "$MINIO_URL/releases/cli/codeb-cli-${VERSION}.tar.gz" -o /tmp/codeb-cli.tar.gz

echo "📦 Extracting..."
tar -xzf /tmp/codeb-cli.tar.gz -C /tmp
rm -f /tmp/codeb-cli.tar.gz

# Install to ~/.codeb
echo "📁 Installing to $INSTALL_DIR..."
cp -r /tmp/codeb-release/* "$INSTALL_DIR/"
rm -rf /tmp/codeb-release

# Install dependencies
echo "📦 Installing dependencies..."
cd "$INSTALL_DIR"
npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Setup symlinks
echo "🔗 Setting up symlinks..."
mkdir -p "$HOME/.local/bin"
ln -sf "$INSTALL_DIR/bin/we.js" "$HOME/.local/bin/we"
chmod +x "$INSTALL_DIR/bin/we.js"

# Copy commands to Claude
echo "📋 Installing Claude commands..."
cp -r "$INSTALL_DIR/commands/we/"* "$CLAUDE_DIR/commands/we/" 2>/dev/null || true

# Copy rules
echo "📜 Installing Claude rules..."
cp "$INSTALL_DIR/rules/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md" 2>/dev/null || true

# Copy skills
echo "🎯 Installing Claude skills..."
cp -r "$INSTALL_DIR/skills/"* "$CLAUDE_DIR/skills/" 2>/dev/null || true

# Register MCP server
echo "🔌 Registering MCP server..."
if command -v claude &> /dev/null; then
  claude mcp remove codeb-deploy -s user 2>/dev/null || true
  claude mcp add codeb-deploy -s user -e CODEB_API_URL=https://api.codeb.kr -- node "$INSTALL_DIR/bin/codeb-mcp.js" 2>/dev/null || true
  echo "   ✅ MCP server registered"
else
  echo "   ⚠️ Claude CLI not found. Manual registration required:"
  echo "      claude mcp add codeb-deploy -s user -- node $INSTALL_DIR/bin/codeb-mcp.js"
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "✅ Installation complete!"
echo ""
echo "📍 Installed to: $INSTALL_DIR"
echo "📋 Version: $VERSION"
echo ""
echo "🔧 Add to PATH (add to ~/.bashrc or ~/.zshrc):"
echo '   export PATH="$HOME/.local/bin:$PATH"'
echo ""
echo "📋 Next steps:"
echo "   1. we init <YOUR_API_KEY>  # Set API key"
echo "   2. Restart Claude Code     # Load MCP"
echo "   3. /we:health              # Test connection"
echo "═══════════════════════════════════════════════"
