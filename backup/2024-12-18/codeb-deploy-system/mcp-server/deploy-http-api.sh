#!/bin/bash
#
# CodeB HTTP API Gateway 배포 스크립트
# CodeB Infra 서버 (141.164.60.51)에 HTTP API를 배포합니다.
#
# 사용법:
#   ./deploy-http-api.sh [API_KEY]
#
# 예시:
#   ./deploy-http-api.sh my-secret-api-key
#

set -e

# 설정
CODEB_SERVER="141.164.60.51"
CODEB_USER="root"
MCP_DIR="/opt/codeb/mcp-server"
HTTP_API_PORT="9100"

# API 키 (인자로 전달되지 않으면 랜덤 생성)
API_KEY="${1:-$(openssl rand -hex 32)}"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       CodeB HTTP API Gateway Deployment                    ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  Server: ${CODEB_SERVER}                                    ║"
echo "║  Port: ${HTTP_API_PORT}                                           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 1. 빌드
echo "📦 Building HTTP API..."
npm run build

# 2. 파일 복사
echo "📤 Copying files to server..."
scp dist/http-api.js ${CODEB_USER}@${CODEB_SERVER}:${MCP_DIR}/dist/
scp codeb-http-api.service ${CODEB_USER}@${CODEB_SERVER}:/etc/systemd/system/

# 3. 환경 변수 설정
echo "🔧 Configuring environment..."
ssh ${CODEB_USER}@${CODEB_SERVER} "cat > ${MCP_DIR}/.env << 'EOF'
NODE_ENV=production
CODEB_HTTP_API_PORT=${HTTP_API_PORT}
CODEB_API_KEY=${API_KEY}
EOF"

# 4. systemd 서비스 설정
echo "🚀 Starting HTTP API service..."
ssh ${CODEB_USER}@${CODEB_SERVER} << 'EOF'
systemctl daemon-reload
systemctl enable codeb-http-api
systemctl restart codeb-http-api
sleep 2
systemctl status codeb-http-api --no-pager
EOF

# 5. 헬스체크
echo ""
echo "🩺 Health check..."
sleep 2
HEALTH_RESPONSE=$(ssh ${CODEB_USER}@${CODEB_SERVER} "curl -s http://localhost:${HTTP_API_PORT}/health")
echo "Health check response: ${HEALTH_RESPONSE}"

# 6. 방화벽 설정 (필요한 경우)
echo ""
echo "🔥 Checking firewall..."
ssh ${CODEB_USER}@${CODEB_SERVER} << EOF
if command -v ufw &> /dev/null; then
  ufw allow ${HTTP_API_PORT}/tcp comment 'CodeB HTTP API'
  echo "UFW rule added for port ${HTTP_API_PORT}"
fi
EOF

# 완료
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ✅ HTTP API Gateway deployed successfully!                ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  API URL: http://${CODEB_SERVER}:${HTTP_API_PORT}                 ║"
echo "║  API Key: ${API_KEY:0:16}...                                 ║"
echo "╠════════════════════════════════════════════════════════════╣"
echo "║  Developer 설정:                                           ║"
echo "║  ~/.codeb/config.json 또는 환경변수에 추가:               ║"
echo "║    CODEB_API_KEY=${API_KEY:0:16}...                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "전체 API 키: ${API_KEY}"
echo ""
echo "테스트 명령어:"
echo "  curl -H 'X-API-Key: ${API_KEY}' http://${CODEB_SERVER}:${HTTP_API_PORT}/api/tools"
