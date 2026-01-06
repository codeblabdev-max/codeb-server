#!/bin/bash
# sync-version.sh - 모든 package.json 버전을 VERSION 파일과 동기화
# 사용법: ./scripts/sync-version.sh [new-version]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
VERSION_FILE="$ROOT_DIR/VERSION"

# 새 버전이 인자로 주어지면 VERSION 파일 업데이트
if [ -n "$1" ]; then
  echo "$1" > "$VERSION_FILE"
  echo "Updated VERSION file to: $1"
fi

# VERSION 파일에서 버전 읽기
VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')

if [ -z "$VERSION" ]; then
  echo "Error: VERSION file is empty"
  exit 1
fi

echo "Syncing all packages to version: $VERSION"

# 모든 package.json 업데이트
update_package() {
  local file="$1"
  if [ -f "$file" ]; then
    # jq로 버전 업데이트 (jq 없으면 sed 사용)
    if command -v jq &> /dev/null; then
      jq ".version = \"$VERSION\"" "$file" > "$file.tmp" && mv "$file.tmp" "$file"
    else
      sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$file" && rm -f "$file.bak"
    fi
    echo "  Updated: $file"
  fi
}

# CLI package.json
update_package "$ROOT_DIR/cli/package.json"

# API package.json
update_package "$ROOT_DIR/api/package.json"

# Root package.json (if exists)
update_package "$ROOT_DIR/package.json"

# install.sh 배너 버전 업데이트
INSTALL_SH="$ROOT_DIR/cli/install.sh"
if [ -f "$INSTALL_SH" ]; then
  sed -i.bak "s/we-cli v[0-9]*\.[0-9]*\.[0-9]*/we-cli v$VERSION/" "$INSTALL_SH" && rm -f "$INSTALL_SH.bak"
  echo "  Updated: $INSTALL_SH"
fi

# CLAUDE.md 버전 헤더 업데이트 (프로젝트)
CLAUDE_MD="$ROOT_DIR/CLAUDE.md"
if [ -f "$CLAUDE_MD" ]; then
  # 첫 줄에 버전이 없으면 추가, 있으면 업데이트
  if head -1 "$CLAUDE_MD" | grep -q "^# CLAUDE.md.*v[0-9]"; then
    sed -i.bak "1s/v[0-9]*\.[0-9]*\.[0-9]*/v$VERSION/" "$CLAUDE_MD" && rm -f "$CLAUDE_MD.bak"
  else
    sed -i.bak "1s/^# CLAUDE.md.*$/# CLAUDE.md v$VERSION - CodeB Project Rules/" "$CLAUDE_MD" && rm -f "$CLAUDE_MD.bak"
  fi
  echo "  Updated: $CLAUDE_MD"
fi

# ~/.claude/CLAUDE.md 도 동기화
HOME_CLAUDE_MD="$HOME/.claude/CLAUDE.md"
if [ -f "$HOME_CLAUDE_MD" ]; then
  cp "$CLAUDE_MD" "$HOME_CLAUDE_MD"
  echo "  Synced: $HOME_CLAUDE_MD"
fi

# cli/rules/CLAUDE.md 도 동기화 (npm 패키지에 포함됨)
CLI_CLAUDE_MD="$ROOT_DIR/cli/rules/CLAUDE.md"
if [ -f "$CLI_CLAUDE_MD" ]; then
  cp "$CLAUDE_MD" "$CLI_CLAUDE_MD"
  echo "  Synced: $CLI_CLAUDE_MD"
fi

echo ""
echo "✅ Version sync complete: $VERSION"
echo ""
echo "Files updated:"
echo "  - VERSION"
echo "  - cli/package.json"
echo "  - api/package.json"
echo "  - cli/install.sh"
echo "  - CLAUDE.md"
echo "  - ~/.claude/CLAUDE.md"
echo "  - cli/rules/CLAUDE.md"
echo ""
echo "Next steps:"
echo "  1. cd cli && npm publish"
echo "  2. scp api/* to server"
echo "  3. git add . && git commit -m 'chore: bump version to $VERSION'"
echo "  4. git push origin main"
