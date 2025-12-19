#!/bin/bash

echo "🧪 PowerDNS 도메인 자동 할당 테스트"
echo "=================================="

PROJECT_NAME="powerdns-test-$(date +%s)"
GITHUB_REPO="https://github.com/dungeun/coolify-nextjs-login-app"
API_URL="http://141.164.60.51:3007/api"

echo "📦 Project: $PROJECT_NAME"
echo "📂 Repository: $GITHUB_REPO"
echo "🌍 Domain: $PROJECT_NAME.one-q.xyz"
echo ""

# DB 상태 확인
echo "🔍 DB 상태 (Before):"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT COUNT(*) as app_count FROM applications; SELECT COUNT(*) as service_count FROM services;\""

echo ""
echo "🚀 Creating application with automatic domain generation..."

# API 호출 - generateDomain: true로 설정
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
echo "🔍 최근 생성된 Applications:"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT name, fqdn, uuid, created_at FROM applications WHERE name LIKE '%powerdns%' ORDER BY created_at DESC;\""

echo ""
echo "🌍 DNS 레코드 확인:"
echo "dig +short $PROJECT_NAME.one-q.xyz"
dig +short $PROJECT_NAME.one-q.xyz

echo ""
echo "📋 PowerDNS 레코드 확인:"
curl -s -H "X-API-Key: 20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5" \
  "http://141.164.60.51:8081/api/v1/servers/localhost/zones/one-q.xyz./rrsets" | \
  jq ".[] | select(.name | contains(\"$PROJECT_NAME\"))"

echo ""
echo "========================================="
echo "✅ Applications 생성과 DNS 레코드가 모두 확인되어야 합니다!"