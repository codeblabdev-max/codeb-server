#!/bin/bash
# CodeB Project Update Script
# Usage: curl -sSL https://releases.codeb.kr/cli/project-update.sh | bash
# 현재 디렉토리의 프로젝트를 최신 버전으로 업데이트

set -e

MINIO_URL="${MINIO_URL:-https://releases.codeb.kr}"

echo "🔄 CodeB Project Update"
echo "═══════════════════════════════════════════════"

# 현재 디렉토리가 프로젝트인지 확인
if [ ! -d ".claude" ] && [ ! -f "CLAUDE.md" ]; then
  echo "❌ Error: Not a CodeB project directory"
  echo "   Run this command from your project root"
  exit 1
fi

# Get latest version
VERSION=$(curl -sf "$MINIO_URL/cli/version.json" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
echo "📦 Latest version: $VERSION"
echo "📁 Project: $(pwd)"

# Download and extract
echo "📥 Downloading..."
curl -sL "$MINIO_URL/cli/codeb-cli-${VERSION}.tar.gz" -o /tmp/codeb-cli.tar.gz
tar -xzf /tmp/codeb-cli.tar.gz -C /tmp

# Update commands
if [ -d ".claude/commands/we" ]; then
  echo "📋 Updating Commands..."
  rm -f .claude/commands/we/*.md 2>/dev/null || true
  cp -r /tmp/codeb-release/commands/we/* .claude/commands/we/
  CMD_COUNT=$(ls -1 .claude/commands/we/*.md 2>/dev/null | wc -l | tr -d ' ')
  echo "   ✅ $CMD_COUNT commands updated"
else
  echo "   ℹ️  No .claude/commands/we/ directory"
fi

# Update CLAUDE.md
if [ -f "CLAUDE.md" ]; then
  echo "📜 Updating CLAUDE.md..."
  cp /tmp/codeb-release/rules/CLAUDE.md ./CLAUDE.md
  NEW_VERSION=$(head -1 CLAUDE.md | grep -o 'v[0-9.]*' || echo "$VERSION")
  echo "   ✅ CLAUDE.md → $NEW_VERSION"
fi

# Cleanup
rm -rf /tmp/codeb-release /tmp/codeb-cli.tar.gz

echo ""
echo "═══════════════════════════════════════════════"
echo "✅ Project updated to v$VERSION"
echo ""
echo "💡 Restart Claude Code to apply changes"
echo "═══════════════════════════════════════════════"
