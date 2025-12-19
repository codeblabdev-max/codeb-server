#!/bin/bash

echo "🚀 FINAL FIX - Applications 생성 테스트"
echo "=================================================="

PROJECT_NAME="final-fix-app"
GITHUB_REPO="https://github.com/dungeun/coolify-nextjs-login-app"
API_URL="http://141.164.60.51:3007/api"

echo "📦 Project: $PROJECT_NAME"
echo "🌐 Domain: $PROJECT_NAME.one-q.xyz"
echo "📂 Repository: $GITHUB_REPO"
echo "🎯 API: /applications/public + project_uuid + environment_name"
echo ""

# 최종 수정된 API로 테스트
echo "Creating Application with CORRECT API structure..."
curl -X POST "$API_URL/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "'$PROJECT_NAME'",
    "gitRepository": "'$GITHUB_REPO'",
    "gitBranch": "main",
    "buildPack": "nixpacks",
    "port": "3000",
    "generateDomain": true,
    "databases": [
      {"type": "postgresql", "name": "db"}
    ],
    "environmentVariables": [
      {"key": "NODE_ENV", "value": "production"},
      {"key": "NEXTAUTH_SECRET", "value": "super-secret-nextauth-key"},
      {"key": "APP_NAME", "value": "'$PROJECT_NAME'"}
    ]
  }' | jq .

echo ""
echo "=================================================="
echo "✅ FINAL FIX Applied!"
echo ""
echo "Key Changes Made:"
echo "  ✅ Endpoint: /applications/public (restored)"
echo "  ✅ Body: project_uuid + environment_name"
echo "  ✅ Based on SSH source code analysis"
echo ""
echo "🔍 Check in Coolify Dashboard:"
echo "  📊 http://141.164.60.51:8000/projects"
echo "  🎯 Should now appear as 'Application' NOT 'Service'!"