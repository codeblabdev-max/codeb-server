#!/bin/bash

echo "🧪 Generate Domain 버튼 기능 테스트"
echo "================================="

PROJECT_NAME="generate-domain-test"
GITHUB_REPO="https://github.com/dungeun/coolify-nextjs-login-app"
API_URL="http://141.164.60.51:3007/api"

echo "📦 Project: $PROJECT_NAME"
echo "📂 Repository: $GITHUB_REPO"
echo "🌍 Wildcard Domain: one-q.xyz (설정 완료)"
echo ""

echo "🚀 Step 1: 도메인 없이 애플리케이션 생성..."
RESULT=$(curl -s -X POST "$API_URL/deploy/complete" \
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
  }')

echo "✅ 배포 결과:"
echo "$RESULT" | jq .

# 애플리케이션 UUID 추출
APP_UUID=$(echo "$RESULT" | jq -r '.coolify.applicationUuid')
PROJECT_UUID=$(echo "$RESULT" | jq -r '.coolify.projectUuid')

echo ""
echo "📊 Step 2: 애플리케이션 상태 확인..."
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT name, fqdn, uuid FROM applications WHERE uuid = '$APP_UUID';\""

echo ""
echo "🎯 Step 3: Generate Domain API 테스트 (Coolify에서 확인한 방식)..."

# Coolify 내부 Generate Domain 함수 직접 호출 (웹 브라우저에서 확인한 방식)
echo "Coolify Generate Domain 호출..."
curl -X POST "http://141.164.60.51:8000/api/v1/applications/$APP_UUID/domains" \
  -H "Authorization: Bearer 7|hhVQUT7DdQEBUD3Ac992z9Zx2OVkaGjXye3f7BtEb0fb5881" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" | jq .

echo ""
echo "📊 Step 4: 도메인 생성 후 애플리케이션 상태 확인..."
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT name, fqdn, uuid FROM applications WHERE uuid = '$APP_UUID';\""

echo ""
echo "🌍 Step 5: 생성된 도메인 DNS 확인..."
FQDN=$(ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -t -c \"SELECT fqdn FROM applications WHERE uuid = '$APP_UUID';\"" | xargs)
if [ ! -z "$FQDN" ]; then
    DOMAIN_NAME=$(echo "$FQDN" | sed 's|https\?://||')
    echo "Generated domain: $DOMAIN_NAME"
    echo "DNS 확인:"
    dig +short $DOMAIN_NAME
else
    echo "❌ 도메인이 생성되지 않았습니다."
fi

echo ""
echo "📋 Step 6: 대시보드 링크..."
echo "🖥️  Dashboard: http://141.164.60.51:8000/project/$PROJECT_UUID"
echo "🌍 Generated Domain: $FQDN"

echo ""
echo "========================================="
echo "✅ Generate Domain 버튼 기능 테스트 완료!"
echo "   - Coolify wildcard_domain 설정: https://one-q.xyz"
echo "   - Generate Domain API 호출 결과 확인"
echo "   - 자동 생성된 도메인 DNS 확인"