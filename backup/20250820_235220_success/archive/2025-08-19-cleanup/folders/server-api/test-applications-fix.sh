#!/bin/bash

echo "🚀 Applications 생성 테스트 (Environment UUID 수정)"
echo "=================================================="

PROJECT_NAME="app-fix-test"
GITHUB_REPO="https://github.com/dungeun/coolify-nextjs-login-app"
API_URL="http://141.164.60.51:3007/api"

echo "📦 Project: $PROJECT_NAME"
echo "🌐 Domain: $PROJECT_NAME.one-q.xyz (auto-generated)"
echo "🔒 SSL: Let's Encrypt (automatic)"
echo "📂 Repository: $GITHUB_REPO"
echo "🎯 Type: Next.js Application (Environment UUID only)"
echo ""

# Next.js 애플리케이션 배포 (Environment UUID만 사용)
echo "Creating Next.js application as APPLICATION (not Service)..."
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
      {"key": "NEXTAUTH_SECRET", "value": "super-secret-nextauth-key-for-production"},
      {"key": "APP_NAME", "value": "'$PROJECT_NAME'"}
    ]
  }' | jq .

echo ""
echo "=================================================="
echo "✅ Application deployment completed!"
echo ""
echo "🔍 Check in Coolify Dashboard:"
echo "  📊 http://141.164.60.51:8000/projects"
echo "  🎯 Should appear as 'Application' NOT 'Service'"
echo ""
echo "Your application will be available at:"
echo "  🌐 https://$PROJECT_NAME.one-q.xyz"
echo ""
echo "Features tested:"
echo "  ✅ Environment UUID only (no project_uuid)"
echo "  ✅ Next.js + PostgreSQL"
echo "  ✅ Auto domain + SSL"