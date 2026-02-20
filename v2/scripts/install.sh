#!/bin/bash
# =============================================================================
# CodeB CLI v2 Install Script
# =============================================================================
# Usage:
#   curl -sSL https://releases.codeb.kr/cli/install.sh | bash
#   curl -sSL https://releases.codeb.kr/cli/install.sh | bash -s -- <API_KEY>
#
# What this installs:
#   ~/.codeb/bin/we.cjs           CLI (esbuild single-file bundle)
#   ~/.codeb/bin/codeb-mcp.cjs    MCP server (esbuild single-file bundle)
#   ~/.codeb/package.json        Metadata
#   ~/.claude/skills/we/         Skills for Claude Code
#   ~/.claude/hooks/pre-bash.py  Security hook
#   ~/.claude/CLAUDE.md          Global rules
#   ~/.claude/settings.json      MCP server registration (merge)
#
# No node_modules needed! (esbuild single-file bundles)
# =============================================================================

set -e

MINIO_URL="${CODEB_RELEASES_URL:-https://releases.codeb.kr}"
CODEB_DIR="$HOME/.codeb"
CLAUDE_DIR="$HOME/.claude"
CLAUDE_SETTINGS="$CLAUDE_DIR/settings.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GRAY='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BLUE}${BOLD}=================================================${NC}"
echo -e "${BLUE}${BOLD}     CodeB CLI Installer (v2 - esbuild bundle)${NC}"
echo -e "${BLUE}${BOLD}=================================================${NC}"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}ERROR: Node.js not found. Install Node.js 20+ first.${NC}"
  echo -e "${GRAY}  https://nodejs.org/${NC}"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo -e "${RED}ERROR: Node.js 20+ required (found: $(node -v))${NC}"
  exit 1
fi
echo -e "${GREEN}Node.js:${NC} $(node -v)"

# Check existing installation
if [ -f "$CODEB_DIR/version.json" ]; then
  CURRENT_VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$CODEB_DIR/version.json" 2>/dev/null | cut -d'"' -f4 || echo "unknown")
  echo -e "${GRAY}Current: v${CURRENT_VERSION} (upgrading...)${NC}"
fi

# Get latest version
echo ""
echo -e "${GRAY}Checking latest version...${NC}"
VERSION_JSON=$(curl -sf "$MINIO_URL/cli/version.json" 2>/dev/null || echo "")
if [ -z "$VERSION_JSON" ]; then
  echo -e "${RED}ERROR: Failed to reach $MINIO_URL/cli/version.json${NC}"
  exit 1
fi

VERSION=$(echo "$VERSION_JSON" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
if [ -z "$VERSION" ]; then
  echo -e "${RED}ERROR: Could not parse version from version.json${NC}"
  exit 1
fi
echo -e "${GREEN}Latest:  v${VERSION}${NC}"

# Download and extract
echo ""
echo -e "${GRAY}Downloading codeb-cli-${VERSION}.tar.gz...${NC}"
TARBALL_URL="$MINIO_URL/cli/codeb-cli-${VERSION}.tar.gz"
curl -fSL "$TARBALL_URL" -o /tmp/codeb-cli.tar.gz 2>/dev/null
if [ $? -ne 0 ]; then
  echo -e "${RED}ERROR: Download failed from $TARBALL_URL${NC}"
  exit 1
fi

echo -e "${GRAY}Extracting...${NC}"
rm -rf "/tmp/codeb-cli-${VERSION}"
tar -xzf /tmp/codeb-cli.tar.gz -C /tmp

EXTRACT_DIR="/tmp/codeb-cli-${VERSION}"
if [ ! -d "$EXTRACT_DIR" ]; then
  echo -e "${RED}ERROR: Expected directory $EXTRACT_DIR not found${NC}"
  exit 1
fi

# =========================================================================
# PART 1: Install CLI + MCP binaries (~/.codeb/)
# =========================================================================
echo ""
echo -e "${BOLD}[1/4] Installing binaries...${NC}"

mkdir -p "$CODEB_DIR/bin"

# Copy bundles + metadata
cp "$EXTRACT_DIR/bin/we.cjs" "$CODEB_DIR/bin/we.cjs"
cp "$EXTRACT_DIR/bin/codeb-mcp.cjs" "$CODEB_DIR/bin/codeb-mcp.cjs"
cp "$EXTRACT_DIR/package.json" "$CODEB_DIR/package.json"
cp "$EXTRACT_DIR/version.json" "$CODEB_DIR/version.json"
cp "$EXTRACT_DIR/VERSION" "$CODEB_DIR/VERSION"

chmod +x "$CODEB_DIR/bin/we.cjs"
chmod +x "$CODEB_DIR/bin/codeb-mcp.cjs"

# Create symlinks
mkdir -p "$HOME/.local/bin"
ln -sf "$CODEB_DIR/bin/we.cjs" "$HOME/.local/bin/we"
ln -sf "$CODEB_DIR/bin/codeb-mcp.cjs" "$HOME/.local/bin/codeb-mcp"

LINK_TARGETS="~/.local/bin"

# macOS Homebrew bin (higher PATH priority)
if [ -d "/opt/homebrew/bin" ] && [ -w "/opt/homebrew/bin" ]; then
  ln -sf "$CODEB_DIR/bin/we.cjs" "/opt/homebrew/bin/we"
  ln -sf "$CODEB_DIR/bin/codeb-mcp.cjs" "/opt/homebrew/bin/codeb-mcp"
  LINK_TARGETS="$LINK_TARGETS + /opt/homebrew/bin"
fi

echo -e "  ${GREEN}Binaries${NC} -> ~/.codeb/bin/ (linked: $LINK_TARGETS)"

# =========================================================================
# PART 2: Install Skills + Hooks (~/.claude/)
# =========================================================================
echo ""
echo -e "${BOLD}[2/4] Installing skills and hooks...${NC}"

mkdir -p "$CLAUDE_DIR/skills/we"
mkdir -p "$CLAUDE_DIR/hooks"

# Skills
if [ -d "$EXTRACT_DIR/skills/we" ] && ls "$EXTRACT_DIR/skills/we/"*.md >/dev/null 2>&1; then
  rm -f "$CLAUDE_DIR/skills/we/"*.md 2>/dev/null || true
  cp "$EXTRACT_DIR/skills/we/"*.md "$CLAUDE_DIR/skills/we/"
  SKILL_COUNT=$(ls -1 "$CLAUDE_DIR/skills/we/"*.md 2>/dev/null | wc -l | tr -d ' ')
  echo -e "  ${GREEN}Skills:${NC}  $SKILL_COUNT files -> ~/.claude/skills/we/"
else
  echo -e "  ${YELLOW}Skills:${NC}  (no skill files in tarball)"
fi

# Hooks
if [ -f "$EXTRACT_DIR/hooks/pre-bash.py" ]; then
  cp "$EXTRACT_DIR/hooks/pre-bash.py" "$CLAUDE_DIR/hooks/pre-bash.py"
  echo -e "  ${GREEN}Hook:${NC}    pre-bash.py -> ~/.claude/hooks/"
fi

# CLAUDE.md (global rules)
if [ -f "$EXTRACT_DIR/CLAUDE.md" ]; then
  cp "$EXTRACT_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
  echo -e "  ${GREEN}Rules:${NC}   CLAUDE.md -> ~/.claude/"

  # Update project-level CLAUDE.md files (CodeB-managed only)
  PROJECT_UPDATE_COUNT=0
  while IFS= read -r proj_claude; do
    # Only update files that contain "CodeB Project Rules" (our signature)
    if grep -q "CodeB Project Rules" "$proj_claude" 2>/dev/null; then
      # Backup existing before overwriting
      cp "$proj_claude" "${proj_claude}.bak"
      cp "$EXTRACT_DIR/CLAUDE.md" "$proj_claude"
      PROJECT_UPDATE_COUNT=$((PROJECT_UPDATE_COUNT + 1))
    fi
  done < <(find "$HOME" -maxdepth 4 -name "CLAUDE.md" \
    -not -path "*/node_modules/*" \
    -not -path "*/.claude/*" \
    -not -path "*/.taskmaster/*" \
    -not -path "*/codeb-server/CLAUDE.md" \
    2>/dev/null)

  if [ "$PROJECT_UPDATE_COUNT" -gt 0 ]; then
    echo -e "  ${GREEN}Projects:${NC} $PROJECT_UPDATE_COUNT CLAUDE.md updated (backups: .bak)"
  fi
fi

# =========================================================================
# PART 3: API Key Configuration
# =========================================================================
echo ""
echo -e "${BOLD}[3/4] API Key configuration...${NC}"

API_KEY="${1:-${CODEB_API_KEY:-}}"

# Try existing config
if [ -z "$API_KEY" ] && [ -f "$CODEB_DIR/config.json" ]; then
  API_KEY=$(grep -o '"apiKey"[[:space:]]*:[[:space:]]*"[^"]*"' "$CODEB_DIR/config.json" 2>/dev/null | cut -d'"' -f4 || echo "")
  if [ -n "$API_KEY" ]; then
    echo -e "  ${GRAY}Using existing API key from config${NC}"
  fi
fi

if [ -z "$API_KEY" ]; then
  echo -e "  ${YELLOW}API Key not provided.${NC}"
  echo -e "  ${GRAY}Set later: we init <YOUR_API_KEY>${NC}"
elif [[ ! "$API_KEY" =~ ^codeb_ ]]; then
  echo -e "  ${RED}WARNING: API Key must start with 'codeb_'. Skipping.${NC}"
  API_KEY=""
else
  echo -e "  ${GREEN}API Key:${NC} ${API_KEY:0:20}..."
  mkdir -p "$CODEB_DIR"
  cat > "$CODEB_DIR/config.json" << CONFIGEOF
{
  "apiKey": "$API_KEY",
  "apiUrl": "https://api.codeb.kr",
  "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
CONFIGEOF
fi

# =========================================================================
# PART 4: MCP Server Registration
# =========================================================================
echo ""
echo -e "${BOLD}[4/4] Configuring MCP server...${NC}"

MCP_SCRIPT="$CODEB_DIR/bin/codeb-mcp.cjs"
NEED_MANUAL_MCP=false

# Try 'claude mcp add' first
if command -v claude &> /dev/null; then
  claude mcp remove codeb-deploy -s user 2>/dev/null || true

  MCP_ENV_ARGS="-e CODEB_API_URL=https://api.codeb.kr"
  if [ -n "$API_KEY" ]; then
    MCP_ENV_ARGS="$MCP_ENV_ARGS -e CODEB_API_KEY=$API_KEY"
  fi

  if claude mcp add codeb-deploy -s user $MCP_ENV_ARGS -- node "$MCP_SCRIPT" 2>/dev/null; then
    echo -e "  ${GREEN}MCP:${NC}     codeb-deploy registered (claude mcp add)"
  else
    NEED_MANUAL_MCP=true
  fi
else
  NEED_MANUAL_MCP=true
fi

# Fallback: manual settings.json merge
if [ "$NEED_MANUAL_MCP" = true ]; then
  mkdir -p "$CLAUDE_DIR"

  ENV_BLOCK='{"CODEB_API_URL":"https://api.codeb.kr"}'
  if [ -n "$API_KEY" ]; then
    ENV_BLOCK="{\"CODEB_API_URL\":\"https://api.codeb.kr\",\"CODEB_API_KEY\":\"$API_KEY\"}"
  fi

  if [ -f "$CLAUDE_SETTINGS" ] && command -v jq &> /dev/null; then
    TMP_JSON=$(mktemp)
    jq --arg script "$MCP_SCRIPT" --argjson env "$ENV_BLOCK" '
      .mcpServers["codeb-deploy"] = {
        "command": "node",
        "args": [$script],
        "env": $env
      }
    ' "$CLAUDE_SETTINGS" > "$TMP_JSON" && mv "$TMP_JSON" "$CLAUDE_SETTINGS"
    echo -e "  ${GREEN}MCP:${NC}     codeb-deploy merged into settings.json"
  elif command -v jq &> /dev/null; then
    cat > "$CLAUDE_SETTINGS" << MCPEOF
{
  "mcpServers": {
    "codeb-deploy": {
      "command": "node",
      "args": ["$MCP_SCRIPT"],
      "env": $ENV_BLOCK
    }
  }
}
MCPEOF
    echo -e "  ${GREEN}MCP:${NC}     settings.json created"
  else
    echo -e "  ${YELLOW}WARNING:${NC} jq not found. Manual MCP setup needed."
    echo -e "  ${GRAY}Run: claude mcp add codeb-deploy -s user -- node $MCP_SCRIPT${NC}"
  fi
fi

# =========================================================================
# PART 5: Project-level installation (current directory)
# =========================================================================
echo ""
echo -e "${BOLD}[5/5] Project-level setup...${NC}"

PROJECT_DIR=""
PROJECT_SETUP=false

# Detect project root (git root or cwd)
if git rev-parse --show-toplevel &>/dev/null; then
  PROJECT_DIR="$(git rev-parse --show-toplevel)"
elif [ -f "package.json" ] || [ -f "Dockerfile" ]; then
  PROJECT_DIR="$(pwd)"
fi

if [ -n "$PROJECT_DIR" ] && [ "$PROJECT_DIR" != "$HOME" ]; then
  PROJECT_CLAUDE_DIR="$PROJECT_DIR/.claude"
  mkdir -p "$PROJECT_CLAUDE_DIR"

  # CLAUDE.md at project root
  if [ -f "$EXTRACT_DIR/CLAUDE.md" ]; then
    if [ -f "$PROJECT_DIR/CLAUDE.md" ]; then
      cp "$PROJECT_DIR/CLAUDE.md" "$PROJECT_DIR/CLAUDE.md.bak"
    fi
    cp "$EXTRACT_DIR/CLAUDE.md" "$PROJECT_DIR/CLAUDE.md"
    echo -e "  ${GREEN}CLAUDE.md${NC}  -> $PROJECT_DIR/"
    PROJECT_SETUP=true
  fi

  # .claude/settings.local.json (project-level MCP + permissions)
  PROJ_SETTINGS="$PROJECT_CLAUDE_DIR/settings.local.json"
  ENV_BLOCK='{"CODEB_API_URL":"https://api.codeb.kr"}'
  if [ -n "$API_KEY" ]; then
    ENV_BLOCK="{\"CODEB_API_URL\":\"https://api.codeb.kr\",\"CODEB_API_KEY\":\"$API_KEY\"}"
  fi

  if command -v jq &>/dev/null; then
    if [ -f "$PROJ_SETTINGS" ]; then
      # Merge MCP into existing settings
      TMP_PROJ=$(mktemp)
      jq --arg script "$MCP_SCRIPT" --argjson env "$ENV_BLOCK" '
        .mcpServers["codeb-deploy"] = {
          "command": "node",
          "args": [$script],
          "env": $env
        }
      ' "$PROJ_SETTINGS" > "$TMP_PROJ" && mv "$TMP_PROJ" "$PROJ_SETTINGS"
    else
      cat > "$PROJ_SETTINGS" << PROJEOF
{
  "mcpServers": {
    "codeb-deploy": {
      "command": "node",
      "args": ["$MCP_SCRIPT"],
      "env": $ENV_BLOCK
    }
  },
  "permissions": {
    "allow": [
      "mcp__codeb-deploy__*"
    ]
  }
}
PROJEOF
    fi
    echo -e "  ${GREEN}Settings${NC}   -> $PROJECT_CLAUDE_DIR/settings.local.json"
    PROJECT_SETUP=true
  fi

  # Skills (project-level)
  if [ -d "$EXTRACT_DIR/skills/we" ] && ls "$EXTRACT_DIR/skills/we/"*.md >/dev/null 2>&1; then
    mkdir -p "$PROJECT_CLAUDE_DIR/skills/we"
    rm -f "$PROJECT_CLAUDE_DIR/skills/we/"*.md 2>/dev/null || true
    cp "$EXTRACT_DIR/skills/we/"*.md "$PROJECT_CLAUDE_DIR/skills/we/"
    PROJ_SKILL_COUNT=$(ls -1 "$PROJECT_CLAUDE_DIR/skills/we/"*.md 2>/dev/null | wc -l | tr -d ' ')
    echo -e "  ${GREEN}Skills${NC}     -> $PROJECT_CLAUDE_DIR/skills/we/ ($PROJ_SKILL_COUNT files)"
    PROJECT_SETUP=true
  fi

  # Ensure .gitignore includes .claude/settings.local.json
  if [ -f "$PROJECT_DIR/.gitignore" ]; then
    if ! grep -q "settings.local.json" "$PROJECT_DIR/.gitignore" 2>/dev/null; then
      echo "" >> "$PROJECT_DIR/.gitignore"
      echo "# CodeB local settings (contains API keys)" >> "$PROJECT_DIR/.gitignore"
      echo ".claude/settings.local.json" >> "$PROJECT_DIR/.gitignore"
      echo -e "  ${GREEN}.gitignore${NC} updated (settings.local.json excluded)"
    fi
  fi

  if [ "$PROJECT_SETUP" = true ]; then
    echo -e "  ${GREEN}Project:${NC}   $(basename "$PROJECT_DIR")"
  fi
else
  echo -e "  ${GRAY}No project detected in current directory. Skipped.${NC}"
  echo -e "  ${GRAY}Run install.sh from your project folder to set up project-level config.${NC}"
fi

# =========================================================================
# Cleanup + Summary
# =========================================================================
rm -rf "$EXTRACT_DIR" /tmp/codeb-cli.tar.gz /tmp/codeb-cli-latest.tar.gz

echo ""
echo -e "${BLUE}${BOLD}=================================================${NC}"
echo -e "${BLUE}${BOLD}  Installation Complete - CodeB CLI v${VERSION}${NC}"
echo -e "${BLUE}${BOLD}=================================================${NC}"
echo ""
echo -e "  ${GREEN}Global:${NC}"
echo -e "    Binaries   ~/.codeb/bin/ (we, codeb-mcp)"
echo -e "    Skills     ~/.claude/skills/we/"
echo -e "    Hooks      ~/.claude/hooks/"
echo -e "    Rules      ~/.claude/CLAUDE.md"
echo -e "    MCP        codeb-deploy (settings.json)"
if [ "$PROJECT_SETUP" = true ]; then
  echo ""
  echo -e "  ${GREEN}Project ($(basename "$PROJECT_DIR")):${NC}"
  echo -e "    CLAUDE.md  $PROJECT_DIR/CLAUDE.md"
  echo -e "    Settings   $PROJECT_CLAUDE_DIR/settings.local.json"
  echo -e "    Skills     $PROJECT_CLAUDE_DIR/skills/we/"
fi
echo ""
echo -e "  ${BOLD}No node_modules needed! (esbuild bundle)${NC}"
echo ""
if [ -n "$API_KEY" ]; then
  echo -e "  ${BOLD}Next:${NC} Restart Claude Code, then ${GREEN}/we:health${NC}"
else
  echo -e "  ${BOLD}Next:${NC} ${GREEN}we init <API_KEY>${NC}, then restart Claude Code"
fi
echo ""
