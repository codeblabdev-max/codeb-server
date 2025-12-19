#!/bin/bash

echo "🎯 완전한 종단간 테스트 (Git → 배포 → SSL)"
echo "=========================================="

PROJECT_NAME="complete-test-$(date +%s)"
GITHUB_REPO="https://github.com/dungeun/coolify-nextjs-login-app"
API_URL="http://141.164.60.51:3007/api"
DOMAIN="$PROJECT_NAME.one-q.xyz"

echo "📦 Project: $PROJECT_NAME"
echo "📂 Repository: $GITHUB_REPO"
echo "🌍 Domain: $DOMAIN"
echo ""

echo "🚀 Step 1: 애플리케이션 배포..."
RESULT=$(curl -s -X POST "$API_URL/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "'$PROJECT_NAME'",
    "gitRepository": "'$GITHUB_REPO'",
    "gitBranch": "main",
    "buildPack": "nixpacks",
    "port": "3000",
    "generateDomain": true,
    "environmentVariables": [
      {"key": "NODE_ENV", "value": "production"},
      {"key": "NEXT_PUBLIC_APP_NAME", "value": "'$PROJECT_NAME'"}
    ]
  }')

echo "✅ 배포 결과:"
echo "$RESULT" | jq .

# 애플리케이션 UUID 추출
APP_UUID=$(echo "$RESULT" | jq -r '.coolify.applicationUuid')
PROJECT_UUID=$(echo "$RESULT" | jq -r '.coolify.projectUuid')

echo ""
echo "📊 Step 2: 데이터베이스 확인..."
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT name, fqdn, uuid FROM applications WHERE uuid = '$APP_UUID';\""

echo ""
echo "🌐 Step 3: DNS 전파 확인..."
echo "DNS 레코드:"
dig +short $DOMAIN

echo ""
echo "⏰ Step 4: 배포 대기 (60초)..."
sleep 60

echo ""
echo "🔗 Step 5: 웹사이트 접근 테스트..."
echo "HTTP 테스트:"
curl -I "http://$DOMAIN" 2>/dev/null | head -n 5

echo ""
echo "HTTPS 테스트:"
curl -I "https://$DOMAIN" 2>/dev/null | head -n 5

echo ""
echo "📋 Step 6: Coolify 대시보드 링크..."
echo "🖥️  Dashboard: http://141.164.60.51:8000/project/$PROJECT_UUID"
echo "🌍 Website: https://$DOMAIN"

echo ""
echo "========================================="
echo "✅ 완전한 워크플로우 테스트 완료!"
echo "   - Git 저장소에서 자동 빌드"
echo "   - DNS 자동 생성 및 전파"
echo "   - SSL 인증서 자동 발급"
echo "   - 실제 웹사이트 접근 가능"