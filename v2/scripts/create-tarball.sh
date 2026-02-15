#!/bin/bash
# v2/scripts/create-tarball.sh
#
# Assembles the codeb-cli-{VERSION}.tar.gz tarball for distribution.
# Prerequisites: esbuild bundle must be run first (dist/bundle/ exists).
#
# Output: /tmp/codeb-cli-{VERSION}.tar.gz
# Usage: bash scripts/create-tarball.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
V2_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$V2_ROOT/.." && pwd)"

VERSION=$(cat "$REPO_ROOT/VERSION" | tr -d '\n')
STAGING_DIR="/tmp/codeb-cli-${VERSION}"
TARBALL="/tmp/codeb-cli-${VERSION}.tar.gz"

echo "Creating tarball for CodeB v${VERSION}"
echo ""

# Clean previous staging
rm -rf "$STAGING_DIR" "$TARBALL"
mkdir -p "$STAGING_DIR/bin"
mkdir -p "$STAGING_DIR/skills/we"
mkdir -p "$STAGING_DIR/hooks"

# 1. Copy esbuild bundles
if [ ! -f "$V2_ROOT/dist/bundle/we.cjs" ]; then
  echo "ERROR: dist/bundle/we.cjs not found. Run 'pnpm bundle' first."
  exit 1
fi
if [ ! -f "$V2_ROOT/dist/bundle/codeb-mcp.cjs" ]; then
  echo "ERROR: dist/bundle/codeb-mcp.cjs not found. Run 'pnpm bundle' first."
  exit 1
fi

cp "$V2_ROOT/dist/bundle/we.cjs" "$STAGING_DIR/bin/we.cjs"
cp "$V2_ROOT/dist/bundle/codeb-mcp.cjs" "$STAGING_DIR/bin/codeb-mcp.cjs"
chmod +x "$STAGING_DIR/bin/we.cjs"
chmod +x "$STAGING_DIR/bin/codeb-mcp.cjs"

echo "  bin/we.cjs             ($(wc -c < "$STAGING_DIR/bin/we.cjs" | tr -d ' ') bytes)"
echo "  bin/codeb-mcp.cjs      ($(wc -c < "$STAGING_DIR/bin/codeb-mcp.cjs" | tr -d ' ') bytes)"

# 2. Copy skills
# Check multiple potential skill locations
SKILLS_FOUND=false
for SKILLS_SRC in \
  "$REPO_ROOT/.claude/skills/we" \
  "$V2_ROOT/.claude/skills/we" \
  "$REPO_ROOT/cli/skills"; do
  if [ -d "$SKILLS_SRC" ] && ls "$SKILLS_SRC"/*.md >/dev/null 2>&1; then
    cp "$SKILLS_SRC"/*.md "$STAGING_DIR/skills/we/"
    SKILLS_FOUND=true
    break
  fi
done

if [ "$SKILLS_FOUND" = true ]; then
  SKILL_COUNT=$(ls -1 "$STAGING_DIR/skills/we/"*.md 2>/dev/null | wc -l | tr -d ' ')
  echo "  skills/we/             (${SKILL_COUNT} files)"
else
  echo "  skills/we/             (WARN: no skill files found)"
fi

# 3. Copy hooks
for HOOKS_SRC in \
  "$REPO_ROOT/.claude/hooks" \
  "$V2_ROOT/.claude/hooks"; do
  if [ -f "$HOOKS_SRC/pre-bash.py" ]; then
    cp "$HOOKS_SRC/pre-bash.py" "$STAGING_DIR/hooks/"
    echo "  hooks/pre-bash.py"
    break
  fi
done

# 4. Copy CLAUDE.md (global rules)
if [ -f "$REPO_ROOT/CLAUDE.md" ]; then
  cp "$REPO_ROOT/CLAUDE.md" "$STAGING_DIR/CLAUDE.md"
  echo "  CLAUDE.md"
fi

# 5. Copy VERSION
cp "$REPO_ROOT/VERSION" "$STAGING_DIR/VERSION"
echo "  VERSION                ($VERSION)"

# 6. Generate version.json
cat > "$STAGING_DIR/version.json" <<EOF
{
  "version": "${VERSION}",
  "buildDate": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "commit": "$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
}
EOF
echo "  version.json"

# 7. Generate minimal package.json for ESM module resolution
cat > "$STAGING_DIR/package.json" <<EOF
{"name": "@codeb/cli", "version": "${VERSION}"}
EOF
echo "  package.json           (metadata)"

# 8. Copy install.sh into tarball (self-contained distribution)
if [ -f "$V2_ROOT/scripts/install.sh" ]; then
  cp "$V2_ROOT/scripts/install.sh" "$STAGING_DIR/install.sh"
  echo "  install.sh"
fi

# 9. Create tarball
echo ""
echo "Packing..."
cd /tmp
tar -czf "$TARBALL" "codeb-cli-${VERSION}"
TARBALL_SIZE=$(wc -c < "$TARBALL" | tr -d ' ')
echo ""
echo "Tarball: $TARBALL"
echo "Size:    ${TARBALL_SIZE} bytes ($(( TARBALL_SIZE / 1024 )) KB)"
echo ""

# Also create latest symlink
cp "$TARBALL" "/tmp/codeb-cli-latest.tar.gz"
echo "Latest:  /tmp/codeb-cli-latest.tar.gz"
echo "Done."
