#!/bin/bash
# CodeB CLI Unified Install Script
# Usage: curl -sSL https://releases.codeb.kr/cli/install.sh | bash
#
# 이 스크립트 하나로 모든 설치/업데이트 완료:
# 1. 글로벌 설치 (~/.claude/)
#    - Commands, Skills, Rules (CLAUDE.md)
#    - MCP 설정 (기존 유지, codeb-deploy만 추가)
# 2. 현재 프로젝트 업데이트 (선택적)
#    - CLAUDE.md 업데이트
#    - .env에 CodeB 설정 추가 (기존 유지)
#    - .claude/commands 업데이트

set -e

MINIO_URL="${MINIO_URL:-https://releases.codeb.kr}"
CLAUDE_DIR="$HOME/.claude"
CLAUDE_JSON="$HOME/.claude.json"
CODEB_DIR="$HOME/.codeb"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "          🚀 CodeB CLI Unified Installer"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Get latest version
VERSION=$(curl -sf "$MINIO_URL/cli/version.json" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
if [ -z "$VERSION" ]; then
  echo "❌ Failed to get version info"
  exit 1
fi
echo "📦 Latest version: $VERSION"
echo ""

# Download and extract
echo "📥 Downloading codeb-cli-${VERSION}.tar.gz..."
curl -sL "$MINIO_URL/cli/codeb-cli-${VERSION}.tar.gz" -o /tmp/codeb-cli.tar.gz

echo "📦 Extracting..."
tar -xzf /tmp/codeb-cli.tar.gz -C /tmp

# ============================================
# PART 1: 글로벌 설치 (~/.claude/)
# ============================================
echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│  [1/2] Global Installation (~/.claude/)                 │"
echo "└─────────────────────────────────────────────────────────┘"

# Create directories
mkdir -p "$CLAUDE_DIR/commands/we"
mkdir -p "$CLAUDE_DIR/skills"
mkdir -p "$CODEB_DIR/bin"

# Copy commands (기존 파일 정리 후 복사)
echo "📋 Installing Commands..."
rm -f "$CLAUDE_DIR/commands/we/"*.md 2>/dev/null || true
cp -r /tmp/codeb-release/commands/we/* "$CLAUDE_DIR/commands/we/" 2>/dev/null || true
CMD_COUNT=$(ls -1 "$CLAUDE_DIR/commands/we/"*.md 2>/dev/null | wc -l | tr -d ' ')
echo "   ✅ $CMD_COUNT commands → ~/.claude/commands/we/"

# Copy skills (기존 we 관련 skills 정리)
echo "🎯 Installing Skills..."
if [ -d "/tmp/codeb-release/skills" ]; then
  cp -r /tmp/codeb-release/skills/* "$CLAUDE_DIR/skills/" 2>/dev/null || true
  echo "   ✅ Skills → ~/.claude/skills/"
else
  echo "   ℹ️  No skills to install"
fi

# Copy rules (글로벌 CLAUDE.md)
echo "📜 Installing Rules..."
cp /tmp/codeb-release/rules/CLAUDE.md "$CLAUDE_DIR/CLAUDE.md" 2>/dev/null || true
echo "   ✅ CLAUDE.md → ~/.claude/CLAUDE.md"

# Copy MCP proxy script
if [ -d "/tmp/codeb-release/mcp-proxy" ]; then
  cp -r /tmp/codeb-release/mcp-proxy/* "$CODEB_DIR/bin/" 2>/dev/null || true
  echo "   ✅ MCP Proxy → ~/.codeb/bin/"
fi

# ============================================
# MCP 설정 (기존 설정 유지, codeb-deploy만 추가)
# ============================================
echo ""
echo "🔌 Configuring MCP..."

MCP_SCRIPT="$CODEB_DIR/bin/codeb-mcp.js"

if [ -f "$CLAUDE_JSON" ]; then
  # 기존 파일이 있으면 codeb-deploy만 추가/업데이트
  if command -v jq &> /dev/null; then
    TMP_JSON=$(mktemp)
    jq --arg script "$MCP_SCRIPT" '
      .mcpServers["codeb-deploy"] = {
        "type": "stdio",
        "command": "node",
        "args": [$script],
        "env": {
          "CODEB_API_URL": "https://api.codeb.kr"
        }
      }
    ' "$CLAUDE_JSON" > "$TMP_JSON" && mv "$TMP_JSON" "$CLAUDE_JSON"
    echo "   ✅ codeb-deploy MCP 추가 (기존 설정 유지)"
  else
    if command -v claude &> /dev/null; then
      claude mcp remove codeb-deploy -s user 2>/dev/null || true
      claude mcp add codeb-deploy -s user -e CODEB_API_URL=https://api.codeb.kr -- node "$MCP_SCRIPT" 2>/dev/null || true
      echo "   ✅ codeb-deploy MCP 등록됨"
    else
      echo "   ⚠️  jq/claude CLI 없음 - 수동 등록 필요"
    fi
  fi
else
  # 새 파일 생성
  cat > "$CLAUDE_JSON" << EOF
{
  "mcpServers": {
    "codeb-deploy": {
      "type": "stdio",
      "command": "node",
      "args": ["$MCP_SCRIPT"],
      "env": {
        "CODEB_API_URL": "https://api.codeb.kr"
      }
    }
  }
}
EOF
  echo "   ✅ ~/.claude.json 생성됨"
fi

# .env.example 복사
if [ -f "/tmp/codeb-release/rules/.env.codeb.example" ]; then
  cp /tmp/codeb-release/rules/.env.codeb.example "$CODEB_DIR/.env.example"
fi

# ============================================
# PART 2: 현재 프로젝트 업데이트 (선택적)
# ============================================
echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│  [2/2] Current Project Update                           │"
echo "└─────────────────────────────────────────────────────────┘"

CURRENT_DIR=$(pwd)
IS_PROJECT=false

# 프로젝트 디렉토리인지 확인 (CLAUDE.md 또는 .claude 폴더 존재)
if [ -f "$CURRENT_DIR/CLAUDE.md" ] || [ -d "$CURRENT_DIR/.claude" ]; then
  IS_PROJECT=true
fi

if [ "$IS_PROJECT" = true ]; then
  echo "📁 Project detected: $CURRENT_DIR"
  echo ""

  # 프로젝트 CLAUDE.md 업데이트
  if [ -f "$CURRENT_DIR/CLAUDE.md" ]; then
    echo "📜 Updating project CLAUDE.md..."
    cp /tmp/codeb-release/rules/CLAUDE.md "$CURRENT_DIR/CLAUDE.md"
    echo "   ✅ CLAUDE.md updated"
  fi

  # 프로젝트 .claude/commands 업데이트
  if [ -d "$CURRENT_DIR/.claude/commands/we" ]; then
    echo "📋 Updating project commands..."
    rm -f "$CURRENT_DIR/.claude/commands/we/"*.md 2>/dev/null || true
    cp -r /tmp/codeb-release/commands/we/* "$CURRENT_DIR/.claude/commands/we/"
    echo "   ✅ Commands updated"
  fi

  # .env에 CodeB 설정 추가 (기존 유지)
  if [ -f "$CURRENT_DIR/.env" ]; then
    echo "🔑 Checking .env..."
    if ! grep -q "CODEB_API_URL" "$CURRENT_DIR/.env" 2>/dev/null; then
      echo "" >> "$CURRENT_DIR/.env"
      echo "# CodeB API Configuration" >> "$CURRENT_DIR/.env"
      echo "CODEB_API_URL=https://api.codeb.kr" >> "$CURRENT_DIR/.env"
      echo "CODEB_API_KEY=" >> "$CURRENT_DIR/.env"
      echo "   ✅ CodeB 설정 추가됨"
    else
      echo "   ℹ️  CodeB 설정 이미 존재"
    fi
  fi
else
  echo "📁 Current directory: $CURRENT_DIR"
  echo "   ℹ️  Not a CodeB project (no CLAUDE.md or .claude folder)"
  echo "   ℹ️  Global installation completed only"
fi

# ============================================
# Cleanup
# ============================================
rm -rf /tmp/codeb-release /tmp/codeb-cli.tar.gz

# ============================================
# Summary
# ============================================
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Installation Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "📦 Version: $VERSION"
echo ""
echo "📋 Global Installation:"
echo "   • Commands:  ~/.claude/commands/we/ ($CMD_COUNT files)"
echo "   • Rules:     ~/.claude/CLAUDE.md"
echo "   • MCP:       ~/.claude.json (codeb-deploy)"
echo "   • Config:    ~/.codeb/"
echo ""
if [ "$IS_PROJECT" = true ]; then
echo "📋 Project Updated:"
echo "   • Path:      $CURRENT_DIR"
echo "   • CLAUDE.md: Updated to v$VERSION"
echo ""
fi
echo "📋 Next Steps:"
echo "   1. API 키 설정: ~/.codeb/.env.example 참고"
echo "   2. Claude Code 재시작"
echo "   3. /we:health 로 연결 확인"
echo ""
echo "═══════════════════════════════════════════════════════════"
