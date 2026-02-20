#!/bin/bash
# CodeB v8.1.0 설치 스크립트
# MCP 서버 + Skills + CLAUDE.md + CONTRIBUTING.md 설치

set -e

VERSION="8.1.0"
INSTALL_DIR="$HOME/.codeb"
CLAUDE_DIR="$HOME/.claude"
CLAUDE_SETTINGS="$CLAUDE_DIR/settings.json"
ENV_FILE="$INSTALL_DIR/.env"

echo ""
echo "  CodeB v${VERSION} 설치"
echo "  ========================"
echo ""

# ─── jq 확인/설치 ───
if ! command -v jq &> /dev/null; then
  echo "  jq 설치 중..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    brew install jq 2>/dev/null || { echo "  brew install jq 실패. Homebrew를 먼저 설치하세요."; exit 1; }
  else
    sudo apt-get install -y jq 2>/dev/null || { echo "  apt install jq 실패."; exit 1; }
  fi
fi

# ─── 기존 설치 업데이트 or 신규 설치 ───
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "  기존 설치 발견 - 업데이트 중..."
  cd "$INSTALL_DIR"
  git pull --ff-only 2>/dev/null || { rm -rf "$INSTALL_DIR"; git clone --depth 1 https://github.com/codeb-dev-run/codeb-server.git "$INSTALL_DIR"; }
else
  echo "  신규 설치 중..."
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 https://github.com/codeb-dev-run/codeb-server.git "$INSTALL_DIR"
fi

# ─── MCP 서버 빌드 ───
echo "  MCP 서버 빌드 중..."
cd "$INSTALL_DIR/mcp-server"
npm install --production=false --silent 2>/dev/null
npm run build --silent 2>/dev/null
echo "  MCP 서버 빌드 완료"

# ─── API Key 입력 (기존 키 유지 옵션) ───
EXISTING_KEY=""
if [ -f "$ENV_FILE" ]; then
  EXISTING_KEY=$(grep "^CODEB_API_KEY=" "$ENV_FILE" 2>/dev/null | cut -d= -f2)
fi

if [ -n "$EXISTING_KEY" ]; then
  MASKED="${EXISTING_KEY:0:12}...${EXISTING_KEY: -4}"
  echo ""
  echo "  기존 API Key: $MASKED"
  read -p "  새 키로 변경? (Enter = 유지, 새 키 입력 = 변경): " NEW_KEY
  if [ -n "$NEW_KEY" ]; then
    API_KEY="$NEW_KEY"
  else
    API_KEY="$EXISTING_KEY"
  fi
else
  echo ""
  read -p "  CODEB_API_KEY 입력: " API_KEY
  if [ -z "$API_KEY" ]; then
    echo "  API Key가 필요합니다."
    exit 1
  fi
fi

# ─── .env 파일 생성 ───
cat > "$ENV_FILE" << EOF
CODEB_API_URL=https://api.codeb.kr
CODEB_API_KEY=$API_KEY
EOF

# ─── Claude Code 설정 디렉토리 확인 ───
mkdir -p "$CLAUDE_DIR"

# ─── MCP 서버 등록 (~/.claude/settings.json) ───
echo "  Claude Code MCP 설정 중..."

MCP_PATH="$INSTALL_DIR/mcp-server/dist/index.js"

if [ -f "$CLAUDE_SETTINGS" ]; then
  # 기존 설정에 mcpServers 추가/업데이트
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
  # 신규 settings.json 생성
  cat > "$CLAUDE_SETTINGS" << EOF
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
EOF
fi

# ─── 프로젝트 레벨 설치 (현재 디렉토리가 git 프로젝트인 경우) ───
PROJECT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || echo "")

if [ -n "$PROJECT_DIR" ] && [ "$PROJECT_DIR" != "$INSTALL_DIR" ]; then
  echo "  프로젝트 감지: $PROJECT_DIR"
  echo "  프로젝트 레벨 파일 설치 중..."

  # .claude 디렉토리 생성
  mkdir -p "$PROJECT_DIR/.claude"

  # CLAUDE.md 복사 (없는 경우만)
  if [ ! -f "$PROJECT_DIR/CLAUDE.md" ]; then
    cp "$INSTALL_DIR/CLAUDE.md" "$PROJECT_DIR/CLAUDE.md"
    echo "    CLAUDE.md 설치됨"
  else
    echo "    CLAUDE.md 이미 존재 - 건너뜀"
  fi

  # CONTRIBUTING.md 복사 (없는 경우만)
  if [ ! -f "$PROJECT_DIR/CONTRIBUTING.md" ]; then
    cp "$INSTALL_DIR/CONTRIBUTING.md" "$PROJECT_DIR/CONTRIBUTING.md"
    echo "    CONTRIBUTING.md 설치됨"
  else
    echo "    CONTRIBUTING.md 이미 존재 - 건너뜀"
  fi

  # settings.local.json 복사 (없는 경우만)
  if [ ! -f "$PROJECT_DIR/.claude/settings.local.json" ]; then
    cp "$INSTALL_DIR/.claude/settings.local.json" "$PROJECT_DIR/.claude/settings.local.json"
    echo "    .claude/settings.local.json 설치됨"
  else
    echo "    .claude/settings.local.json 이미 존재 - 건너뜀"
  fi

  # Skills 복사
  if [ -d "$INSTALL_DIR/.claude/skills" ]; then
    cp -rn "$INSTALL_DIR/.claude/skills" "$PROJECT_DIR/.claude/" 2>/dev/null || true
    echo "    .claude/skills/ 설치됨"
  fi

  # Hooks 복사
  if [ -d "$INSTALL_DIR/.claude/hooks" ]; then
    cp -rn "$INSTALL_DIR/.claude/hooks" "$PROJECT_DIR/.claude/" 2>/dev/null || true
    echo "    .claude/hooks/ 설치됨"
  fi
fi

# ─── GitHub Secrets 설정 (gh CLI 사용 가능한 경우) ───
if command -v gh &> /dev/null && [ -n "$PROJECT_DIR" ]; then
  cd "$PROJECT_DIR"
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
  if [ -n "$REPO" ]; then
    echo ""
    echo "  GitHub Secrets 설정 ($REPO)"
    echo "  CI/CD 배포에 필요한 3개 Secret을 등록합니다."
    echo ""
    read -p "  GitHub Secrets 자동 등록? [y/N]: " SETUP_SECRETS
    if [[ "$SETUP_SECRETS" =~ ^[yY]$ ]]; then
      # 1. CODEB_API_KEY
      echo "$API_KEY" | gh secret set CODEB_API_KEY 2>/dev/null \
        && echo "    CODEB_API_KEY 등록됨" \
        || echo "    CODEB_API_KEY 등록 실패"

      # 2. MINIO 키 - MCP API에서 자동 조회 시도
      echo "  Minio S3 캐시 키 설정 중..."
      MINIO_SECRETS=$(curl -sf -H "X-API-Key: $API_KEY" "https://api.codeb.kr/api/setup/secrets" 2>/dev/null || echo "")

      if [ -n "$MINIO_SECRETS" ] && echo "$MINIO_SECRETS" | jq -e '.minio_access_key' &>/dev/null; then
        # API에서 자동 조회 성공
        MINIO_AK=$(echo "$MINIO_SECRETS" | jq -r '.minio_access_key')
        MINIO_SK=$(echo "$MINIO_SECRETS" | jq -r '.minio_secret_key')
        echo "    Minio 키 자동 조회 완료"
      else
        # API 조회 실패 시 수동 입력
        echo "    자동 조회 실패 - 수동 입력 (팀 리드에게 문의)"
        echo ""
        read -p "    MINIO_ACCESS_KEY: " MINIO_AK
        read -p "    MINIO_SECRET_KEY: " MINIO_SK
      fi

      if [ -n "$MINIO_AK" ] && [ -n "$MINIO_SK" ]; then
        echo "$MINIO_AK" | gh secret set MINIO_ACCESS_KEY 2>/dev/null \
          && echo "    MINIO_ACCESS_KEY 등록됨" \
          || echo "    MINIO_ACCESS_KEY 등록 실패"
        echo "$MINIO_SK" | gh secret set MINIO_SECRET_KEY 2>/dev/null \
          && echo "    MINIO_SECRET_KEY 등록됨" \
          || echo "    MINIO_SECRET_KEY 등록 실패"
      else
        echo "    Minio 키 미입력 - 나중에 수동 등록 필요"
        echo "    gh secret set MINIO_ACCESS_KEY"
        echo "    gh secret set MINIO_SECRET_KEY"
      fi

      echo ""
      echo "  GitHub Secrets 등록 완료"
      gh secret list 2>/dev/null | head -5
    fi
  fi
fi

# ─── 완료 ───
echo ""
echo "  ========================"
echo "  CodeB v${VERSION} 설치 완료!"
echo "  ========================"
echo ""
echo "  설치 위치:  $INSTALL_DIR"
echo "  MCP 서버:   $MCP_PATH"
echo "  API Key:    ${API_KEY:0:12}...${API_KEY: -4}"
echo "  설정 파일:  $CLAUDE_SETTINGS"
echo ""
echo "  다음 단계:"
echo "    1. Claude Code 실행: claude"
echo "    2. MCP 연결 확인:    /we:health"
echo "    3. 협업 가이드 확인: cat CONTRIBUTING.md"
echo ""
