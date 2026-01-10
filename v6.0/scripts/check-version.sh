#!/bin/bash
# CodeB Version Check Script
# 로컬 개발 전 서버 버전과 동기화 확인

set -e

API_URL="${CODEB_API_URL:-https://api.codeb.kr}"
LOCAL_VERSION_FILE="$(dirname "$0")/../VERSION"

echo "🔍 CodeB Version Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 로컬 버전 읽기
if [ -f "$LOCAL_VERSION_FILE" ]; then
  LOCAL_VERSION=$(cat "$LOCAL_VERSION_FILE" | tr -d '\n')
else
  echo "❌ Local VERSION file not found: $LOCAL_VERSION_FILE"
  exit 1
fi

echo "📦 Local version:  $LOCAL_VERSION"

# 서버 버전 확인
echo -n "🌐 Server version: "
SERVER_RESPONSE=$(curl -sf "$API_URL/health" 2>/dev/null || echo '{"version":"unknown"}')
SERVER_VERSION=$(echo "$SERVER_RESPONSE" | jq -r '.version // "unknown"')

if [ "$SERVER_VERSION" = "unknown" ]; then
  echo "⚠️  Could not reach server at $API_URL"
  echo ""
  echo "Options:"
  echo "  1. Start server: we health"
  echo "  2. Continue with local version (--force)"
  exit 1
fi

echo "$SERVER_VERSION"

# 버전 비교
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$LOCAL_VERSION" = "$SERVER_VERSION" ]; then
  echo "✅ Versions match! Ready for development."
  exit 0
fi

# 버전이 다를 경우
compare_versions() {
  # 간단한 버전 비교 (major.minor.patch)
  local v1=$1 v2=$2
  IFS='.' read -ra V1 <<< "$v1"
  IFS='.' read -ra V2 <<< "$v2"

  for i in 0 1 2; do
    local n1=${V1[$i]:-0}
    local n2=${V2[$i]:-0}
    if [ "$n1" -gt "$n2" ]; then
      echo "local_newer"
      return
    elif [ "$n1" -lt "$n2" ]; then
      echo "server_newer"
      return
    fi
  done
  echo "equal"
}

COMPARISON=$(compare_versions "$LOCAL_VERSION" "$SERVER_VERSION")

if [ "$COMPARISON" = "local_newer" ]; then
  echo "⚠️  Local version is NEWER than server"
  echo ""
  echo "This means:"
  echo "  - You have unreleased changes"
  echo "  - Server needs to be updated"
  echo ""
  echo "Actions:"
  echo "  1. Push to main to trigger auto-deploy"
  echo "  2. Or manually deploy: we deploy codeb-api"

elif [ "$COMPARISON" = "server_newer" ]; then
  echo "⚠️  Server version is NEWER than local"
  echo ""
  echo "This means:"
  echo "  - Your local code is outdated"
  echo "  - Pull latest changes from main"
  echo ""
  echo "Actions:"
  echo "  1. git pull origin main"
  echo "  2. Check VERSION file"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Use --force to skip this check"

# --force 플래그 확인
if [[ "$1" == "--force" ]]; then
  echo "⚠️  Forcing development with mismatched versions"
  exit 0
fi

exit 1
