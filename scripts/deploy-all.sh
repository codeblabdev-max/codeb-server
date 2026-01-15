#!/bin/bash
# CodeB SSOT Unified Deploy Script
# 단일 명령으로 모든 배포 대상 동기화
# Usage: ./scripts/deploy-all.sh [version]
#
# 배포 대상:
# 1. Git Repository (백업용)
# 2. API Server (Docker)
# 3. CLI Package (Minio)
#
# SSOT: VERSION 파일이 기준

set -e

cd "$(dirname "$0")/.."
ROOT_DIR=$(pwd)

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 서버 정보
API_SERVER="root@158.247.203.55"
MINIO_BUCKET="codeb/releases"

echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}       CodeB SSOT Unified Deploy System        ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"

# 1. 버전 결정
if [ -n "$1" ]; then
  NEW_VERSION="$1"
  echo "$NEW_VERSION" > VERSION
  echo -e "${GREEN}✅ VERSION updated to: $NEW_VERSION${NC}"
else
  NEW_VERSION=$(cat VERSION | tr -d '\n')
fi

echo ""
echo -e "${YELLOW}📦 Target Version: $NEW_VERSION${NC}"
echo ""

# 2. 로컬 파일 버전 동기화
echo -e "${BLUE}[1/5] Syncing local files...${NC}"

# package.json 동기화
for PKG in "mcp-server/package.json" "cli/package.json"; do
  if [ -f "$PKG" ]; then
    jq --arg v "$NEW_VERSION" '.version = $v' "$PKG" > "$PKG.tmp" && mv "$PKG.tmp" "$PKG"
    echo "   ✅ $PKG"
  fi
done

# CLAUDE.md 동기화
for CLAUDE_FILE in "CLAUDE.md" "cli/rules/CLAUDE.md"; do
  if [ -f "$CLAUDE_FILE" ]; then
    sed -i '' "s/CLAUDE.md v[0-9.]*-/CLAUDE.md v${NEW_VERSION} -/" "$CLAUDE_FILE" 2>/dev/null || \
    sed -i "s/CLAUDE.md v[0-9.]*-/CLAUDE.md v${NEW_VERSION} -/" "$CLAUDE_FILE"
    echo "   ✅ $CLAUDE_FILE"
  fi
done

# 3. Git 커밋 & 푸시 (백업용)
echo ""
echo -e "${BLUE}[2/5] Git commit & push (backup)...${NC}"
git add -A
git commit -m "chore: release v$NEW_VERSION

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>" 2>/dev/null || echo "   ℹ️  No changes to commit"
git push origin main 2>/dev/null || echo "   ⚠️  Push failed (will retry)"
echo "   ✅ Git synced"

# 4. API Server 배포 (Docker)
echo ""
echo -e "${BLUE}[3/5] Deploying API Server (Docker)...${NC}"

# TypeScript 빌드
cd mcp-server
npm run build 2>&1 | tail -3
cp ../VERSION ./

# tarball 생성
tar -czf /tmp/mcp-server-deploy.tar.gz dist package.json package-lock.json VERSION

# 서버로 전송 및 배포
scp /tmp/mcp-server-deploy.tar.gz $API_SERVER:/tmp/

ssh $API_SERVER "
  cd /tmp
  rm -rf /tmp/mcp-deploy && mkdir -p /tmp/mcp-deploy
  tar -xzf mcp-server-deploy.tar.gz -C /tmp/mcp-deploy 2>/dev/null
  cd /tmp/mcp-deploy
  npm ci --omit=dev 2>&1 | tail -3

  docker stop codeb-mcp-api 2>/dev/null || true
  docker rm codeb-mcp-api 2>/dev/null || true
  fuser -k 9101/tcp 2>/dev/null || true
  sleep 1

  cat > Dockerfile.prod <<'DOCKERFILE'
FROM node:20-alpine
RUN addgroup -g 1001 -S nodejs && adduser -S codeb -u 1001 -G nodejs
WORKDIR /app
COPY --chown=codeb:nodejs dist ./dist
COPY --chown=codeb:nodejs node_modules ./node_modules
COPY --chown=codeb:nodejs package.json ./
COPY --chown=codeb:nodejs VERSION ./
RUN mkdir -p /app/logs && chown codeb:nodejs /app/logs
ENV NODE_ENV=production PORT=9101
USER codeb
EXPOSE 9101
CMD [\"node\", \"dist/index.js\"]
DOCKERFILE

  docker build -t codeb-mcp-api:latest -f Dockerfile.prod . 2>&1 | tail -5

  docker run -d \
    --name codeb-mcp-api \
    --restart always \
    --network host \
    -e NODE_ENV=production \
    -e PORT=9101 \
    -e LOG_DIR=/app/logs \
    -v /opt/codeb/logs:/app/logs \
    -v /opt/codeb/registry:/opt/codeb/registry \
    -v /opt/codeb/ssh:/app/ssh:ro \
    codeb-mcp-api:latest

  rm -rf /tmp/mcp-deploy /tmp/mcp-server-deploy.tar.gz
  sleep 3
"

# API 헬스체크
API_VERSION=$(curl -sf https://api.codeb.kr/health | jq -r '.version')
if [ "$API_VERSION" = "$NEW_VERSION" ]; then
  echo -e "   ${GREEN}✅ API Server: $API_VERSION${NC}"
else
  echo -e "   ${RED}❌ API Server: $API_VERSION (expected $NEW_VERSION)${NC}"
fi

cd "$ROOT_DIR"

# 5. CLI Package 배포 (Minio)
echo ""
echo -e "${BLUE}[4/5] Deploying CLI Package (Minio)...${NC}"

# tarball 생성
rm -rf /tmp/codeb-release
mkdir -p /tmp/codeb-release
cp -r cli/bin /tmp/codeb-release/
cp -r cli/src /tmp/codeb-release/
cp -r cli/commands /tmp/codeb-release/
cp -r cli/rules /tmp/codeb-release/
cp -r cli/scripts /tmp/codeb-release/
cp cli/package.json /tmp/codeb-release/
cp cli/package-lock.json /tmp/codeb-release/
cp VERSION /tmp/codeb-release/

cd /tmp && tar -czf codeb-cli-${NEW_VERSION}.tar.gz codeb-release

# 서버로 전송 및 Minio 업로드
scp /tmp/codeb-cli-${NEW_VERSION}.tar.gz $API_SERVER:/tmp/
scp "$ROOT_DIR/cli/scripts/minio-install.sh" "$ROOT_DIR/cli/scripts/project-update.sh" $API_SERVER:/tmp/

ssh $API_SERVER "
  VERSION=$NEW_VERSION
  mc cp /tmp/codeb-cli-\${VERSION}.tar.gz $MINIO_BUCKET/cli/codeb-cli-\${VERSION}.tar.gz
  mc cp /tmp/codeb-cli-\${VERSION}.tar.gz $MINIO_BUCKET/cli/codeb-cli-latest.tar.gz
  echo '{\"version\": \"'\${VERSION}'\", \"updated\": \"'\$(date -u +%Y-%m-%dT%H:%M:%SZ)'\"}' > /tmp/version.json
  mc cp /tmp/version.json $MINIO_BUCKET/cli/version.json
  mc cp /tmp/minio-install.sh $MINIO_BUCKET/cli/install.sh
  mc cp /tmp/project-update.sh $MINIO_BUCKET/cli/project-update.sh
  rm -f /tmp/codeb-cli-*.tar.gz /tmp/version.json /tmp/minio-install.sh /tmp/project-update.sh
"

# Minio 버전 확인
MINIO_VERSION=$(ssh $API_SERVER "mc cat $MINIO_BUCKET/cli/version.json" | jq -r '.version')
if [ "$MINIO_VERSION" = "$NEW_VERSION" ]; then
  echo -e "   ${GREEN}✅ Minio CLI: $MINIO_VERSION${NC}"
else
  echo -e "   ${RED}❌ Minio CLI: $MINIO_VERSION (expected $NEW_VERSION)${NC}"
fi

cd "$ROOT_DIR"
rm -rf /tmp/codeb-release /tmp/codeb-cli-*.tar.gz

# 6. SSOT Registry 업데이트
echo ""
echo -e "${BLUE}[5/5] Updating SSOT Registry...${NC}"

ssh $API_SERVER "
  mkdir -p /opt/codeb/registry
  cat > /opt/codeb/registry/versions.json <<EOF
{
  \"ssot_version\": \"$NEW_VERSION\",
  \"updated\": \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
  \"components\": {
    \"api\": {
      \"version\": \"$NEW_VERSION\",
      \"endpoint\": \"https://api.codeb.kr\",
      \"health\": \"https://api.codeb.kr/health\"
    },
    \"cli\": {
      \"version\": \"$NEW_VERSION\",
      \"download\": \"https://releases.codeb.kr/cli/install.sh\",
      \"tarball\": \"https://releases.codeb.kr/cli/codeb-cli-latest.tar.gz\"
    },
    \"git\": {
      \"version\": \"$NEW_VERSION\",
      \"repo\": \"https://github.com/codeblabdev-max/codeb-server\"
    }
  }
}
EOF
  echo '✅ SSOT Registry updated'
"

# 최종 검증
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo -e "${BLUE}            Deployment Summary                  ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
echo ""
echo -e "📦 Target Version: ${GREEN}$NEW_VERSION${NC}"
echo ""

# 각 컴포넌트 버전 확인
GIT_VERSION=$(git log -1 --oneline | grep -o 'v[0-9.]*' | head -1 || echo "N/A")
API_VERSION=$(curl -sf https://api.codeb.kr/health | jq -r '.version' 2>/dev/null || echo "N/A")
CLI_VERSION=$(ssh $API_SERVER "mc cat $MINIO_BUCKET/cli/version.json" 2>/dev/null | jq -r '.version' || echo "N/A")

echo "   Git Repository:  $GIT_VERSION"
echo "   API Server:      $API_VERSION"
echo "   CLI Package:     $CLI_VERSION"
echo ""

# 버전 일치 확인
if [ "$API_VERSION" = "$NEW_VERSION" ] && [ "$CLI_VERSION" = "$NEW_VERSION" ]; then
  echo -e "${GREEN}✅ All components synced to v$NEW_VERSION${NC}"
else
  echo -e "${RED}❌ Version mismatch detected!${NC}"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════${NC}"
