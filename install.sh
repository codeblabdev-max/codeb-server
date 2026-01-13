#!/bin/bash
# CodeB MCP 설치 스크립트

set -e

INSTALL_DIR="$HOME/.codeb"

echo "📦 CodeB MCP 설치 중..."

# 기존 설치 제거
rm -rf "$INSTALL_DIR"

# 클론
git clone --depth 1 https://github.com/codeb-dev-run/codeb-server.git "$INSTALL_DIR"

# MCP 서버 설치 및 빌드
cd "$INSTALL_DIR/mcp-server"
npm install --production=false
npm run build

echo ""
echo "✅ 설치 완료!"
echo ""
echo "Claude Code MCP 설정에 추가하세요 (~/.claude.json):"
echo ""
cat << 'CONFIG'
{
  "mcpServers": {
    "codeb-deploy": {
      "command": "node",
      "args": ["~/.codeb/mcp-server/dist/index.js"],
      "env": {
        "CODEB_API_KEY": "your-api-key"
      }
    }
  }
}
CONFIG
