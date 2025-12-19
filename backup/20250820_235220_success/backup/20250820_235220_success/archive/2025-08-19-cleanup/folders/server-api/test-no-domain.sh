#!/bin/bash

echo "🧪 도메인 없이 테스트 (validation 문제 해결)"
echo "========================================="

PROJECT_NAME="no-domain-test"
GITHUB_REPO="https://github.com/dungeun/coolify-nextjs-login-app"
API_URL="http://141.164.60.51:3007/api"

echo "📦 Project: $PROJECT_NAME"
echo "📂 Repository: $GITHUB_REPO"
echo "🔧 Fixed: fqdn, is_force_https_enabled 제거"
echo ""

# DB 상태 확인
echo "🔍 DB 상태 (Before):"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT COUNT(*) as app_count FROM applications; SELECT COUNT(*) as service_count FROM services;\""

echo ""
echo "🚀 Creating application without domain params..."

# API 호출
curl -X POST "$API_URL/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "'$PROJECT_NAME'",
    "gitRepository": "'$GITHUB_REPO'",
    "gitBranch": "main",
    "buildPack": "nixpacks",
    "port": "3000",
    "generateDomain": false,
    "environmentVariables": [
      {"key": "NODE_ENV", "value": "production"}
    ]
  }' | jq .

echo ""
echo "🔍 DB 상태 (After):"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT COUNT(*) as app_count FROM applications; SELECT COUNT(*) as service_count FROM services;\""

echo ""
echo "🔍 최근 생성된 레코드:"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT 'APPLICATION' as type, name, uuid, created_at FROM applications WHERE name LIKE '%no-domain%' UNION SELECT 'SERVICE' as type, name, uuid, created_at FROM services WHERE name LIKE '%no-domain%' ORDER BY created_at DESC;\""