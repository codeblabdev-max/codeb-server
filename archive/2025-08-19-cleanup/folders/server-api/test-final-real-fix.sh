#!/bin/bash

echo "🎯 REAL FINAL FIX - 수정된 코드로 테스트"
echo "========================================"

PROJECT_NAME="real-final-fix"
GITHUB_REPO="https://github.com/dungeun/coolify-nextjs-login-app"
API_URL="http://141.164.60.51:3007/api"

echo "📦 Project: $PROJECT_NAME"
echo "📂 Repository: $GITHUB_REPO"
echo "🔧 Fixed: 원격 서버 파일 업데이트됨"
echo ""

# DB 상태 확인
echo "🔍 DB 상태 (Before):"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT COUNT(*) as app_count FROM applications; SELECT COUNT(*) as service_count FROM services;\""

echo ""
echo "🚀 Creating application with UPDATED code..."

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
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT 'APPLICATION' as type, name, uuid, created_at FROM applications WHERE name LIKE '%real-final%' UNION SELECT 'SERVICE' as type, name, uuid, created_at FROM services WHERE name LIKE '%real-final%' ORDER BY created_at DESC;\""

echo ""
echo "========================================"
echo "✅ 이번에는 Applications로 생성되어야 합니다!"