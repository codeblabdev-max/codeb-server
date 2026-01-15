#!/bin/bash
# CodeB CLI Direct Install Script
# Usage: curl -sSL https://releases.codeb.kr/cli/install.sh | bash
#
# 특징:
# - MCP: 기존 설정 유지, codeb-deploy만 추가/업데이트
# - .env: 기존 .env에 CodeB 설정 추가 (덮어쓰기 X)
# - Commands/Skills/Rules: ~/.claude/에 복사

set -e

MINIO_URL="${MINIO_URL:-https://releases.codeb.kr}"
CLAUDE_DIR="$HOME/.claude"
CLAUDE_JSON="$HOME/.claude.json"

echo "🚀 CodeB CLI Direct Install"
echo "═══════════════════════════════════════════════"

# Get latest version
VERSION=$(curl -sf "$MINIO_URL/cli/version.json" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
echo "📦 Latest version: $VERSION"

# Create directories
mkdir -p "$CLAUDE_DIR/commands/we"
mkdir -p "$CLAUDE_DIR/skills"

# Download and extract
echo "📥 Downloading codeb-cli-${VERSION}.tar.gz..."
curl -sL "$MINIO_URL/cli/codeb-cli-${VERSION}.tar.gz" -o /tmp/codeb-cli.tar.gz

echo "📦 Extracting..."
tar -xzf /tmp/codeb-cli.tar.gz -C /tmp

# Copy commands to Claude (기존 파일 정리 후 복사)
echo "📋 Installing Commands..."
rm -f "$CLAUDE_DIR/commands/we/"*.md 2>/dev/null || true
cp -r /tmp/codeb-release/commands/we/* "$CLAUDE_DIR/commands/we/" 2>/dev/null || true
CMD_COUNT=$(ls -1 "$CLAUDE_DIR/commands/we/"*.md 2>/dev/null | wc -l | tr -d ' ')
echo "   ✅ $CMD_COUNT commands"

# Copy skills (기존 we 관련 skills 정리)
echo "🎯 Installing Skills..."
rm -rf "$CLAUDE_DIR/skills/admin" "$CLAUDE_DIR/skills/team" 2>/dev/null || true
rm -rf "$CLAUDE_DIR/skills/analyze" "$CLAUDE_DIR/skills/deploy" "$CLAUDE_DIR/skills/domain" 2>/dev/null || true
rm -rf "$CLAUDE_DIR/skills/health" "$CLAUDE_DIR/skills/init" "$CLAUDE_DIR/skills/rollback" "$CLAUDE_DIR/skills/workflow" 2>/dev/null || true

# Copy rules
echo "📜 Installing Rules..."
cp /tmp/codeb-release/rules/CLAUDE.md "$CLAUDE_DIR/CLAUDE.md" 2>/dev/null || true

# ============================================
# MCP 설정 (기존 설정 유지, codeb-deploy만 추가)
# ============================================
echo "🔌 Configuring MCP..."

MCP_SCRIPT="$HOME/.codeb/bin/codeb-mcp.js"

if [ -f "$CLAUDE_JSON" ]; then
  # 기존 파일이 있으면 codeb-deploy만 추가/업데이트
  if command -v jq &> /dev/null; then
    # jq로 안전하게 추가
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
    echo "   ✅ codeb-deploy MCP 추가됨 (기존 설정 유지)"
  else
    # jq 없으면 claude CLI 사용
    if command -v claude &> /dev/null; then
      claude mcp remove codeb-deploy -s user 2>/dev/null || true
      claude mcp add codeb-deploy -s user -e CODEB_API_URL=https://api.codeb.kr -- node "$MCP_SCRIPT" 2>/dev/null || true
      echo "   ✅ codeb-deploy MCP 등록됨"
    else
      echo "   ⚠️  jq/claude CLI 없음. 수동 등록 필요"
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

# ============================================
# .env 설정 (기존 .env에 CodeB 설정 추가)
# ============================================
echo "🔑 Configuring .env..."

# 프로젝트 .env가 있으면 CodeB 설정 추가
if [ -f ".env" ]; then
  if ! grep -q "CODEB_API_URL" .env 2>/dev/null; then
    echo "" >> .env
    echo "# CodeB API Configuration" >> .env
    echo "CODEB_API_URL=https://api.codeb.kr" >> .env
    echo "CODEB_API_KEY=" >> .env
    echo "   ✅ .env에 CodeB 설정 추가됨"
  else
    echo "   ℹ️  .env에 CodeB 설정 이미 존재"
  fi
else
  echo "   ℹ️  프로젝트 .env 없음 (건너뜀)"
fi

# ~/.codeb 디렉토리에 예제 파일 복사
mkdir -p "$HOME/.codeb"
if [ -f "/tmp/codeb-release/rules/.env.codeb.example" ]; then
  cp /tmp/codeb-release/rules/.env.codeb.example "$HOME/.codeb/.env.example"
  echo "   ✅ ~/.codeb/.env.example 생성됨"
fi

# Cleanup
rm -rf /tmp/codeb-release /tmp/codeb-cli.tar.gz

echo ""
echo "═══════════════════════════════════════════════"
echo "✅ Installation complete!"
echo ""
echo "📋 Version: $VERSION"
echo ""
echo "📋 Installed:"
echo "   • Commands: ~/.claude/commands/we/"
echo "   • Skills:   ~/.claude/skills/"
echo "   • Rules:    ~/.claude/CLAUDE.md"
echo "   • MCP:      ~/.claude.json (codeb-deploy)"
echo ""
echo "📋 Next steps:"
echo "   1. API 키 설정: ~/.codeb/.env.example 참고"
echo "   2. Claude Code 재시작"
echo "   3. /we:health 로 연결 확인"
echo ""
echo "💡 프로젝트별 업데이트 (프로젝트 폴더에서 실행):"
echo "   curl -sSL https://releases.codeb.kr/cli/project-update.sh | bash"
echo "═══════════════════════════════════════════════"
