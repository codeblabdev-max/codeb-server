#!/bin/bash
# CodeB v9.0 설치 스크립트
# VERSION 파일이 SSOT — 이 파일의 VERSION 표시는 참고용
#
# 설치 명령어:
#   curl -fsSL https://raw.githubusercontent.com/codeblabdev-max/codeb-server/main/install.sh | bash
#
# MCP 서버 + Skills + CLAUDE.md + Hooks 설치

set -e

REPO_URL="https://github.com/codeblabdev-max/codeb-server.git"
INSTALL_DIR="$HOME/.codeb"
CLAUDE_DIR="$HOME/.claude"
CLAUDE_SETTINGS="$CLAUDE_DIR/settings.json"
ENV_FILE="$INSTALL_DIR/.env"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║          CodeB 설치 스크립트                           ║${NC}"
echo -e "${CYAN}║          MCP + Skills + Hooks 통합 설치                ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# ─── 필수 도구 확인 ───
echo -e "${YELLOW}1. 환경 확인...${NC}"

if ! command -v node &> /dev/null; then
  echo -e "${RED}   ❌ Node.js가 설치되어 있지 않습니다.${NC}"
  echo "      https://nodejs.org 에서 Node.js 18+ 버전을 설치하세요."
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}   ❌ Node.js 18+ 버전이 필요합니다. 현재: $(node -v)${NC}"
  exit 1
fi
echo -e "${GREEN}   ✅ Node.js $(node -v)${NC}"

if ! command -v git &> /dev/null; then
  echo -e "${RED}   ❌ git이 설치되어 있지 않습니다.${NC}"
  exit 1
fi
echo -e "${GREEN}   ✅ git $(git --version | cut -d' ' -f3)${NC}"

if ! command -v jq &> /dev/null; then
  echo -e "${YELLOW}   jq 설치 중...${NC}"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    brew install jq 2>/dev/null || { echo -e "${RED}   brew install jq 실패${NC}"; exit 1; }
  else
    sudo apt-get install -y jq 2>/dev/null || { echo -e "${RED}   apt install jq 실패${NC}"; exit 1; }
  fi
fi
echo -e "${GREEN}   ✅ jq $(jq --version 2>/dev/null)${NC}"

# ─── Git Clone / Pull ───
echo ""
echo -e "${YELLOW}2. 소스 코드 다운로드...${NC}"

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "   기존 설치 발견 — 업데이트 중..."
  cd "$INSTALL_DIR"
  git pull --ff-only 2>/dev/null || {
    echo "   pull 실패 — 재설치..."
    cd "$HOME"
    rm -rf "$INSTALL_DIR"
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  }
else
  echo "   신규 설치..."
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

# VERSION 파일에서 버전 읽기 (SSOT)
VERSION="unknown"
if [ -f "$INSTALL_DIR/VERSION" ]; then
  VERSION=$(cat "$INSTALL_DIR/VERSION" | tr -d '[:space:]')
fi
echo -e "${GREEN}   ✅ v${VERSION} 다운로드 완료${NC}"

# ─── MCP 서버 빌드 ───
echo ""
echo -e "${YELLOW}3. MCP 서버 빌드...${NC}"
cd "$INSTALL_DIR/mcp-server"

# VERSION 파일 복사 (Dockerfile에서 COPY VERSION ./VERSION 필요)
cp "$INSTALL_DIR/VERSION" ./VERSION 2>/dev/null || true

npm install --silent 2>/dev/null
npm run build --silent 2>/dev/null
echo -e "${GREEN}   ✅ MCP 서버 빌드 완료${NC}"

# ─── API Key 설정 ───
echo ""
echo -e "${YELLOW}4. API Key 설정...${NC}"

EXISTING_KEY=""
if [ -f "$ENV_FILE" ]; then
  EXISTING_KEY=$(grep "^CODEB_API_KEY=" "$ENV_FILE" 2>/dev/null | cut -d= -f2)
fi

if [ -n "$EXISTING_KEY" ]; then
  MASKED="${EXISTING_KEY:0:12}...${EXISTING_KEY: -4}"
  echo "   기존 API Key: $MASKED"
  read -p "   새 키로 변경? (Enter = 유지, 새 키 입력 = 변경): " NEW_KEY
  if [ -n "$NEW_KEY" ]; then
    API_KEY="$NEW_KEY"
  else
    API_KEY="$EXISTING_KEY"
  fi
else
  read -p "   CODEB_API_KEY 입력: " API_KEY
  if [ -z "$API_KEY" ]; then
    echo -e "${RED}   ❌ API Key가 필요합니다.${NC}"
    exit 1
  fi
fi

# .env 파일 생성
cat > "$ENV_FILE" << EOF
CODEB_API_URL=https://api.codeb.kr
CODEB_API_KEY=$API_KEY
EOF
echo -e "${GREEN}   ✅ API Key 저장됨${NC}"

# ─── Claude Code 설정 ───
echo ""
echo -e "${YELLOW}5. Claude Code MCP 설정...${NC}"
mkdir -p "$CLAUDE_DIR"

MCP_PATH="$INSTALL_DIR/mcp-server/dist/index.js"

# claude mcp add 시도 (Claude Code CLI가 있는 경우)
MCP_REGISTERED=false
if command -v claude &> /dev/null; then
  # 기존 등록 제거
  claude mcp remove codeb-deploy -s user 2>/dev/null || true

  # 새로 등록
  if claude mcp add codeb-deploy -s user \
    -e CODEB_API_KEY="$API_KEY" \
    -e CODEB_API_URL="https://api.codeb.kr" \
    -- node "$MCP_PATH" 2>/dev/null; then
    echo -e "${GREEN}   ✅ MCP 서버 등록 완료 (claude mcp add)${NC}"
    MCP_REGISTERED=true
  fi
fi

# claude CLI가 없거나 실패한 경우 settings.json 직접 수정
if [ "$MCP_REGISTERED" = false ]; then
  if [ -f "$CLAUDE_SETTINGS" ]; then
    jq --arg key "$API_KEY" --arg path "$MCP_PATH" '
      .mcpServers["codeb-deploy"] = {
        "command": "node",
        "args": [$path],
        "env": {
          "CODEB_API_KEY": $key,
          "CODEB_API_URL": "https://api.codeb.kr"
        }
      }
    ' "$CLAUDE_SETTINGS" > "$CLAUDE_SETTINGS.tmp" && mv "$CLAUDE_SETTINGS.tmp" "$CLAUDE_SETTINGS"
  else
    cat > "$CLAUDE_SETTINGS" << SETTINGS_EOF
{
  "mcpServers": {
    "codeb-deploy": {
      "command": "node",
      "args": ["$MCP_PATH"],
      "env": {
        "CODEB_API_KEY": "$API_KEY",
        "CODEB_API_URL": "https://api.codeb.kr"
      }
    }
  }
}
SETTINGS_EOF
  fi
  echo -e "${GREEN}   ✅ MCP 서버 등록 완료 (settings.json)${NC}"
fi

# ─── Skills 설치 ───
echo ""
echo -e "${YELLOW}6. Skills 설치...${NC}"

SKILLS_SRC="$INSTALL_DIR/.claude/skills"
SKILLS_DEST="$CLAUDE_DIR/skills"

if [ -d "$SKILLS_SRC" ]; then
  mkdir -p "$SKILLS_DEST"
  cp -r "$SKILLS_SRC/"* "$SKILLS_DEST/" 2>/dev/null || true
  SKILL_COUNT=$(find "$SKILLS_DEST" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  echo -e "${GREEN}   ✅ ${SKILL_COUNT}개 스킬 설치됨${NC}"
else
  echo "   ⚠️  Skills 디렉토리 없음 — 건너뜀"
fi

# ─── CLAUDE.md 설치 ───
echo ""
echo -e "${YELLOW}7. CLAUDE.md 설치...${NC}"

if [ -f "$INSTALL_DIR/CLAUDE.md" ]; then
  if [ -f "$CLAUDE_DIR/CLAUDE.md" ]; then
    # 백업 후 덮어쓰기
    cp "$CLAUDE_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md.backup.$(date +%s)" 2>/dev/null || true
  fi
  cp "$INSTALL_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
  echo -e "${GREEN}   ✅ CLAUDE.md 설치됨 (v${VERSION})${NC}"
else
  echo "   ⚠️  CLAUDE.md 없음 — 건너뜀"
fi

# ─── Hooks 설치 ───
echo ""
echo -e "${YELLOW}8. Hooks 설치...${NC}"

HOOKS_SRC="$INSTALL_DIR/.claude/hooks"
HOOKS_DEST="$CLAUDE_DIR/hooks"

if [ -d "$HOOKS_SRC" ]; then
  mkdir -p "$HOOKS_DEST"
  cp -n "$HOOKS_SRC/"* "$HOOKS_DEST/" 2>/dev/null || true
  chmod +x "$HOOKS_DEST/"*.py 2>/dev/null || true
  echo -e "${GREEN}   ✅ Hooks 설치됨${NC}"
else
  echo "   ⚠️  Hooks 디렉토리 없음 — 건너뜀"
fi

# ─── 프로젝트 레벨 설치 (현재 디렉토리가 git 프로젝트인 경우) ───
PROJECT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || echo "")

if [ -n "$PROJECT_DIR" ] && [ "$PROJECT_DIR" != "$INSTALL_DIR" ]; then
  echo ""
  echo -e "${YELLOW}9. 프로젝트 레벨 설치: $(basename "$PROJECT_DIR")${NC}"
  mkdir -p "$PROJECT_DIR/.claude"

  # CLAUDE.md
  if [ ! -f "$PROJECT_DIR/CLAUDE.md" ]; then
    cp "$INSTALL_DIR/CLAUDE.md" "$PROJECT_DIR/CLAUDE.md" 2>/dev/null && echo -e "${GREEN}   ✅ CLAUDE.md${NC}" || true
  else
    echo "   ℹ️  CLAUDE.md 이미 존재"
  fi

  # settings.local.json
  if [ ! -f "$PROJECT_DIR/.claude/settings.local.json" ] && [ -f "$INSTALL_DIR/.claude/settings.local.json" ]; then
    cp "$INSTALL_DIR/.claude/settings.local.json" "$PROJECT_DIR/.claude/settings.local.json" 2>/dev/null && echo -e "${GREEN}   ✅ settings.local.json${NC}" || true
  fi

  # Skills
  if [ -d "$INSTALL_DIR/.claude/skills" ]; then
    cp -rn "$INSTALL_DIR/.claude/skills" "$PROJECT_DIR/.claude/" 2>/dev/null || true
    echo -e "${GREEN}   ✅ Skills${NC}"
  fi
fi

# ─── GitHub Secrets (선택) ───
if command -v gh &> /dev/null && [ -n "$PROJECT_DIR" ] && [ "$PROJECT_DIR" != "$INSTALL_DIR" ]; then
  cd "$PROJECT_DIR"
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
  if [ -n "$REPO" ]; then
    echo ""
    read -p "   GitHub Secrets 등록? ($REPO) [y/N]: " SETUP_SECRETS
    if [[ "$SETUP_SECRETS" =~ ^[yY]$ ]]; then
      echo "$API_KEY" | gh secret set CODEB_API_KEY 2>/dev/null && echo -e "${GREEN}   ✅ CODEB_API_KEY${NC}" || true
    fi
  fi
fi

# ─── 완료 ───
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ CodeB v${VERSION} 설치 완료!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}설치 위치:${NC}  $INSTALL_DIR"
echo -e "  ${CYAN}MCP 서버:${NC}   $MCP_PATH"
echo -e "  ${CYAN}API Key:${NC}    ${API_KEY:0:12}...${API_KEY: -4}"
echo -e "  ${CYAN}설정 파일:${NC}  $CLAUDE_SETTINGS"
echo ""
echo -e "  ${YELLOW}다음 단계:${NC}"
echo "    1. Claude Code 재시작"
echo "    2. MCP 연결 확인: /we:health"
echo "    3. 배포 테스트:   /we:deploy <프로젝트>"
echo ""
