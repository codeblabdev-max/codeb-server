#!/bin/bash

# CodeB CLI v3.5 - 전역 설치 스크립트

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 설치 디렉토리
INSTALL_DIR="/usr/local/bin"
CODEB_HOME="$HOME/.codeb"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BOLD}${CYAN}🚀 CodeB CLI v3.5 전역 설치${NC}"
echo ""

# 1. CodeB 홈 디렉토리 생성
echo -e "${BLUE}📁 CodeB 홈 디렉토리 설정...${NC}"
mkdir -p "$CODEB_HOME"
mkdir -p "$CODEB_HOME/bin"
mkdir -p "$CODEB_HOME/lib"
mkdir -p "$CODEB_HOME/commands"
mkdir -p "$CODEB_HOME/templates"

# 2. 파일 복사
echo -e "${BLUE}📋 파일 복사 중...${NC}"

# 메인 스크립트 복사
cp "$SCRIPT_DIR/codeb-cli-v3.5.sh" "$CODEB_HOME/bin/codeb-cli.sh"
chmod +x "$CODEB_HOME/bin/codeb-cli.sh"

# lib 디렉토리 복사
cp -r "$SCRIPT_DIR/lib/"* "$CODEB_HOME/lib/" 2>/dev/null || true

# commands 디렉토리 복사
cp -r "$SCRIPT_DIR/commands/"* "$CODEB_HOME/commands/" 2>/dev/null || true

# 명령어 모듈 개별 복사 (안전성을 위해)
cp "$SCRIPT_DIR/commands/podman.sh" "$CODEB_HOME/commands/" 2>/dev/null || true
cp "$SCRIPT_DIR/commands/environment.sh" "$CODEB_HOME/commands/" 2>/dev/null || true
cp "$SCRIPT_DIR/commands/project-v35.sh" "$CODEB_HOME/commands/" 2>/dev/null || true
cp "$SCRIPT_DIR/commands/server-deploy.sh" "$CODEB_HOME/commands/" 2>/dev/null || true

# 3. 전역 실행 파일 생성
echo -e "${BLUE}🔧 전역 명령어 생성...${NC}"

cat > "$CODEB_HOME/bin/codeb" << 'EOF'
#!/bin/bash

# CodeB CLI v3.5 - 전역 실행 파일
export CODEB_HOME="$HOME/.codeb"
export CLI_ROOT="$CODEB_HOME"

# 실행
exec "$CODEB_HOME/bin/codeb-cli.sh" "$@"
EOF

chmod +x "$CODEB_HOME/bin/codeb"

# 4. 심볼릭 링크 생성 (관리자 권한 필요할 수 있음)
echo -e "${BLUE}🔗 심볼릭 링크 생성...${NC}"

if [ -w "$INSTALL_DIR" ]; then
    ln -sf "$CODEB_HOME/bin/codeb" "$INSTALL_DIR/codeb"
    echo -e "${GREEN}✅ 전역 명령어 설치 완료: $INSTALL_DIR/codeb${NC}"
else
    echo -e "${YELLOW}⚠️  $INSTALL_DIR 에 쓰기 권한이 없습니다.${NC}"
    echo -e "${YELLOW}   sudo로 다시 실행하거나 PATH에 추가하세요:${NC}"
    echo ""
    echo "   sudo ln -sf $CODEB_HOME/bin/codeb $INSTALL_DIR/codeb"
    echo ""
    echo "   또는 ~/.bashrc 또는 ~/.zshrc에 추가:"
    echo "   export PATH=\"\$HOME/.codeb/bin:\$PATH\""
fi

# 5. PATH 설정 안내
echo ""
echo -e "${BOLD}${CYAN}📌 설치 완료!${NC}"
echo ""

# 현재 셸 확인
if [ -n "$BASH_VERSION" ]; then
    SHELL_RC="$HOME/.bashrc"
elif [ -n "$ZSH_VERSION" ]; then
    SHELL_RC="$HOME/.zshrc"
else
    SHELL_RC="$HOME/.profile"
fi

# PATH에 이미 있는지 확인
if ! echo "$PATH" | grep -q "$CODEB_HOME/bin"; then
    echo -e "${YELLOW}PATH에 CodeB 디렉토리를 추가하려면:${NC}"
    echo ""
    echo "  echo 'export PATH=\"\$HOME/.codeb/bin:\$PATH\"' >> $SHELL_RC"
    echo "  source $SHELL_RC"
    echo ""
fi

# 6. 버전 확인
if command -v codeb &> /dev/null; then
    echo -e "${GREEN}✅ CodeB CLI 설치 확인:${NC}"
    codeb --version 2>/dev/null || echo "  버전: 3.5.0"
else
    # PATH에 직접 추가 시도
    export PATH="$CODEB_HOME/bin:$PATH"
    if command -v codeb &> /dev/null; then
        echo -e "${GREEN}✅ CodeB CLI 설치 확인:${NC}"
        echo "  버전: 3.5.0"
    fi
fi

echo ""
echo -e "${BOLD}${GREEN}🎉 설치가 완료되었습니다!${NC}"
echo ""
echo "사용 가능한 명령어:"
echo "  codeb create <프로젝트명>    # 새 프로젝트 생성"
echo "  codeb env init <local|server> # 환경 초기화"
echo "  codeb local start             # Podman 컨테이너 시작"
echo "  codeb server deploy <서버>    # 서버에 배포"
echo "  codeb help                    # 도움말 보기"
echo ""

# 7. 자동완성 설정 (선택사항)
echo -e "${CYAN}💡 자동완성을 활성화하려면:${NC}"
echo ""
echo "Bash:"
echo "  echo 'source $CODEB_HOME/completions/codeb.bash' >> ~/.bashrc"
echo ""
echo "Zsh:"
echo "  echo 'source $CODEB_HOME/completions/codeb.zsh' >> ~/.zshrc"