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

echo ""
echo "Version sync complete: $VERSION"
echo ""
echo "Next steps:"
echo "  1. cd cli && npm publish"
echo "  2. scp api/* to server"
echo "  3. git commit -m 'chore: bump version to $VERSION'"
