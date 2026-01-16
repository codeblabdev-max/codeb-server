#!/bin/bash
# CodeB CLI Uninstall Script
# Usage: curl -sSL https://releases.codeb.kr/cli/uninstall.sh | bash
#
# 완전 삭제:
# 1. ~/.codeb/ (CLI 패키지)
# 2. ~/.claude/commands/we/ (커맨드)
# 3. ~/.claude/skills/ (스킬)
# 4. ~/.claude.json에서 codeb-deploy MCP 제거 (다른 설정 유지)
# 5. 심볼릭 링크 제거

set -e

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "          🗑️  CodeB CLI Uninstaller"
echo "═══════════════════════════════════════════════════════════"
echo ""

# 1. CLI 패키지 삭제
echo "📦 Removing CLI package..."
if [ -d "$HOME/.codeb" ]; then
  rm -rf "$HOME/.codeb"
  echo "   ✅ ~/.codeb/ removed"
else
  echo "   ℹ️  ~/.codeb/ not found"
fi

# 2. 커맨드 삭제
echo "📋 Removing commands..."
if [ -d "$HOME/.claude/commands/we" ]; then
  rm -rf "$HOME/.claude/commands/we"
  echo "   ✅ ~/.claude/commands/we/ removed"
else
  echo "   ℹ️  ~/.claude/commands/we/ not found"
fi

# 3. 스킬 삭제 (we 관련만)
echo "🎯 Removing skills..."
if [ -d "$HOME/.claude/skills" ]; then
  # we 관련 스킬만 삭제
  rm -rf "$HOME/.claude/skills/deploy" 2>/dev/null || true
  rm -rf "$HOME/.claude/skills/monitoring" 2>/dev/null || true
  rm -rf "$HOME/.claude/skills/infrastructure" 2>/dev/null || true
  rm -rf "$HOME/.claude/skills/analysis" 2>/dev/null || true
  echo "   ✅ CodeB skills removed"
else
  echo "   ℹ️  ~/.claude/skills/ not found"
fi

# 4. MCP 설정에서 codeb-deploy 제거
echo "🔌 Removing MCP configuration..."
CLAUDE_JSON="$HOME/.claude.json"
if [ -f "$CLAUDE_JSON" ]; then
  if command -v jq &> /dev/null; then
    TMP_JSON=$(mktemp)
    jq 'del(.mcpServers["codeb-deploy"])' "$CLAUDE_JSON" > "$TMP_JSON" && mv "$TMP_JSON" "$CLAUDE_JSON"
    echo "   ✅ codeb-deploy MCP removed (other settings preserved)"
  else
    echo "   ⚠️  jq not found - please manually remove 'codeb-deploy' from ~/.claude.json"
  fi
else
  echo "   ℹ️  ~/.claude.json not found"
fi

# 5. 심볼릭 링크 제거
echo "🔗 Removing symlinks..."
rm -f "$HOME/.local/bin/we" 2>/dev/null && echo "   ✅ ~/.local/bin/we removed" || true
rm -f "$HOME/.local/bin/codeb-mcp" 2>/dev/null && echo "   ✅ ~/.local/bin/codeb-mcp removed" || true
rm -f "/opt/homebrew/bin/we" 2>/dev/null && echo "   ✅ /opt/homebrew/bin/we removed" || true
rm -f "/opt/homebrew/bin/codeb-mcp" 2>/dev/null && echo "   ✅ /opt/homebrew/bin/codeb-mcp removed" || true

# 6. 캐시/임시 파일 정리
echo "🧹 Cleaning up..."
rm -f /tmp/codeb-cli.tar.gz 2>/dev/null || true
rm -rf /tmp/codeb-release 2>/dev/null || true

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ CodeB CLI Uninstalled!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "📋 To reinstall:"
echo "   curl -fsSL https://releases.codeb.kr/cli/install.sh | bash"
echo ""
echo "═══════════════════════════════════════════════════════════"
