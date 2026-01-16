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

# ============================================
# Install CLI package (~/.codeb/)
# ============================================
echo "📦 Installing CLI package..."

# Clean old installation completely for upgrade
if [ -d "$CODEB_DIR" ]; then
  rm -rf "$CODEB_DIR"
fi
mkdir -p "$CODEB_DIR"

cp -r /tmp/codeb-release/bin "$CODEB_DIR/"
cp -r /tmp/codeb-release/src "$CODEB_DIR/"
cp /tmp/codeb-release/package.json "$CODEB_DIR/"
cp /tmp/codeb-release/package-lock.json "$CODEB_DIR/" 2>/dev/null || true
cp /tmp/codeb-release/VERSION "$CODEB_DIR/" 2>/dev/null || true

# Install dependencies (--ignore-scripts to prevent postinstall from running old commands)
if [ -f "$CODEB_DIR/package.json" ]; then
  cd "$CODEB_DIR"
  npm install --omit=dev --ignore-scripts --silent 2>/dev/null || npm install --production --ignore-scripts --silent 2>/dev/null || true
  cd - > /dev/null
fi

# Create symlinks for 'we' and 'codeb-mcp' commands
chmod +x "$CODEB_DIR/bin/we.js"
chmod +x "$CODEB_DIR/bin/codeb-mcp.js" 2>/dev/null || true

# Primary: ~/.local/bin (for most systems)
mkdir -p "$HOME/.local/bin"
rm -f "$HOME/.local/bin/we" 2>/dev/null || true
rm -f "$HOME/.local/bin/codeb-mcp" 2>/dev/null || true
ln -sf "$CODEB_DIR/bin/we.js" "$HOME/.local/bin/we"
ln -sf "$CODEB_DIR/bin/codeb-mcp.js" "$HOME/.local/bin/codeb-mcp" 2>/dev/null || true

# Secondary: /opt/homebrew/bin (for macOS with Homebrew, higher PATH priority)
if [ -d "/opt/homebrew/bin" ] && [ -w "/opt/homebrew/bin" ]; then
  rm -f "/opt/homebrew/bin/we" 2>/dev/null || true
  rm -f "/opt/homebrew/bin/codeb-mcp" 2>/dev/null || true
  ln -sf "$CODEB_DIR/bin/we.js" "/opt/homebrew/bin/we"
  ln -sf "$CODEB_DIR/bin/codeb-mcp.js" "/opt/homebrew/bin/codeb-mcp" 2>/dev/null || true
  echo "   ✅ CLI → ~/.codeb/ (linked to ~/.local/bin + /opt/homebrew/bin)"
else
  echo "   ✅ CLI → ~/.codeb/ (linked to ~/.local/bin)"
fi

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

# MCP proxy is included in CLI package (src/mcp/)

# ============================================
# API Key 설정
# ============================================
echo ""
echo "🔑 API Key Configuration..."

# API 키 확인 (순서: 인자 > 환경변수 > config.json > 프롬프트)
API_KEY="${1:-$CODEB_API_KEY}"

if [ -z "$API_KEY" ] && [ -f "$CODEB_DIR/config.json" ]; then
  API_KEY=$(grep -o '"apiKey"[[:space:]]*:[[:space:]]*"[^"]*"' "$CODEB_DIR/config.json" 2>/dev/null | cut -d'"' -f4)
fi

if [ -z "$API_KEY" ]; then
  echo ""
  echo "   ⚠️  API Key가 필요합니다."
  echo "   팀 관리자에게 발급받은 API Key를 입력하세요."
  echo ""
  read -p "   API Key: " API_KEY
fi

if [ -z "$API_KEY" ]; then
  echo "   ❌ API Key가 입력되지 않았습니다."
  echo "   나중에 다음 명령으로 설정할 수 있습니다:"
  echo "   we init <YOUR_API_KEY>"
  API_KEY=""
else
  # API 키 형식 검증
  if [[ ! "$API_KEY" =~ ^codeb_ ]]; then
    echo "   ⚠️  API Key 형식이 올바르지 않습니다 (codeb_로 시작해야 함)"
    API_KEY=""
  else
    echo "   ✅ API Key: ${API_KEY:0:20}..."

    # config.json에 저장
    mkdir -p "$CODEB_DIR"
    cat > "$CODEB_DIR/config.json" << CONFIGEOF
{
  "apiKey": "$API_KEY",
  "apiUrl": "https://api.codeb.kr",
  "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
CONFIGEOF
  fi
fi

# ============================================
# MCP 설정 (기존 설정 유지, codeb-deploy만 추가)
# ============================================
echo ""
echo "🔌 Configuring MCP..."

MCP_SCRIPT="$CODEB_DIR/src/mcp/index.js"

# API 키가 있으면 MCP 환경변수에 포함
if [ -n "$API_KEY" ]; then
  MCP_ENV_JSON="{\"CODEB_API_URL\": \"https://api.codeb.kr\", \"CODEB_API_KEY\": \"$API_KEY\"}"
else
  MCP_ENV_JSON="{\"CODEB_API_URL\": \"https://api.codeb.kr\"}"
fi

if [ -f "$CLAUDE_JSON" ]; then
  # 기존 파일이 있으면 codeb-deploy만 추가/업데이트
  if command -v jq &> /dev/null; then
    TMP_JSON=$(mktemp)
    if [ -n "$API_KEY" ]; then
      jq --arg script "$MCP_SCRIPT" --arg apikey "$API_KEY" '
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
    else
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
    fi
    echo "   ✅ codeb-deploy MCP 추가 (기존 설정 유지)"
  else
    if command -v claude &> /dev/null; then
      claude mcp remove codeb-deploy -s user 2>/dev/null || true
      if [ -n "$API_KEY" ]; then
        claude mcp add codeb-deploy -s user -e CODEB_API_URL=https://api.codeb.kr -e CODEB_API_KEY="$API_KEY" -- node "$MCP_SCRIPT" 2>/dev/null || true
      else
        claude mcp add codeb-deploy -s user -e CODEB_API_URL=https://api.codeb.kr -- node "$MCP_SCRIPT" 2>/dev/null || true
      fi
      echo "   ✅ codeb-deploy MCP 등록됨"
    else
      echo "   ⚠️  jq/claude CLI 없음 - 수동 등록 필요"
    fi
  fi
else
  # 새 파일 생성
  if [ -n "$API_KEY" ]; then
    cat > "$CLAUDE_JSON" << EOF
{
  "mcpServers": {
    "codeb-deploy": {
      "type": "stdio",
      "command": "node",
      "args": ["$MCP_SCRIPT"],
      "env": {
        "CODEB_API_URL": "https://api.codeb.kr",
        "CODEB_API_KEY": "$API_KEY"
      }
    }
  }
}
EOF
  else
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
  fi
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
echo "   • CLI:       ~/.codeb/ (we command)"
echo "   • Commands:  ~/.claude/commands/we/ ($CMD_COUNT files)"
echo "   • Rules:     ~/.claude/CLAUDE.md"
echo "   • MCP:       ~/.claude.json (codeb-deploy)"
echo ""
if [ "$IS_PROJECT" = true ]; then
echo "📋 Project Updated:"
echo "   • Path:      $CURRENT_DIR"
echo "   • CLAUDE.md: Updated to v$VERSION"
echo ""
fi
if [ -n "$API_KEY" ]; then
echo "🔑 API Key: Configured ✅"
echo ""
echo "📋 Next Steps:"
echo "   1. Claude Code 재시작 (필수!)"
echo "   2. /we:health 로 연결 확인"
else
echo "⚠️  API Key: Not configured"
echo ""
echo "📋 Next Steps:"
echo "   1. API 키 설정:"
echo "      curl -fsSL https://releases.codeb.kr/cli/install.sh | bash -s -- YOUR_API_KEY"
echo "      또는 ~/.claude.json의 codeb-deploy.env에 CODEB_API_KEY 추가"
echo "   2. Claude Code 재시작"
echo "   3. /we:health 로 연결 확인"
fi
echo ""
echo "═══════════════════════════════════════════════════════════"
