#!/bin/bash

echo "🔍 DB 모니터링하면서 API 테스트"
echo "=================================="

PROJECT_NAME="debug-api-test"
GITHUB_REPO="https://github.com/dungeun/coolify-nextjs-login-app"
API_URL="http://141.164.60.51:3007/api"

echo "📦 Project: $PROJECT_NAME"
echo "📂 Repository: $GITHUB_REPO"
echo ""

# DB 모니터링 시작
echo "🔍 DB 상태 (Before):"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT COUNT(*) as app_count FROM applications; SELECT COUNT(*) as service_count FROM services;\""

echo ""
echo "🚀 Creating application..."

# API 호출
curl -X POST "$API_URL/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "'$PROJECT_NAME'",
    "gitRepository": "'$GITHUB_REPO'",
    "gitBranch": "main",
    "buildPack": "nixpacks",
    "port": "3000",
    "generateDomain": true,
    "environmentVariables": [
      {"key": "NODE_ENV", "value": "production"}
    ]
  }' | jq .

echo ""
echo "🔍 DB 상태 (After):"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT COUNT(*) as app_count FROM applications; SELECT COUNT(*) as service_count FROM services;\""

echo ""
echo "🔍 최근 생성된 레코드:"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT 'APPLICATION' as type, name, uuid, created_at FROM applications WHERE name LIKE '%debug%' UNION SELECT 'SERVICE' as type, name, uuid, created_at FROM services WHERE name LIKE '%debug%' ORDER BY created_at DESC;\""