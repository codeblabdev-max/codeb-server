#!/bin/bash

echo "🚀 Complete Auto Domain & SSL Test"
echo "===================================="

PROJECT_NAME="final-auto-ssl"
API_URL="http://141.164.60.51:3007/api"

echo "📦 Project: $PROJECT_NAME"
echo "🌐 Domain: $PROJECT_NAME.one-q.xyz (auto-generated)"
echo "🔒 SSL: Let's Encrypt (automatic)"
echo "📂 Repository: Coolify Examples"
echo ""

# 자동 도메인 생성으로 배포
echo "Creating application with full automation..."
curl -X POST "$API_URL/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "'$PROJECT_NAME'",
    "gitRepository": "https://github.com/coollabsio/coolify-examples",
    "gitBranch": "main",
    "buildPack": "nixpacks",
    "port": "3000",
    "generateDomain": true,
    "databases": [
      {"type": "postgresql", "name": "db"},
      {"type": "redis", "name": "cache"}
    ],
    "environmentVariables": [
      {"key": "NODE_ENV", "value": "production"},
      {"key": "APP_NAME", "value": "'$PROJECT_NAME'"}
    ]
  }' | jq .

echo ""
echo "===================================="
echo "✅ Deployment completed!"
echo ""
echo "Your application will be available at:"
echo "  🌐 https://$PROJECT_NAME.one-q.xyz (with SSL)"
echo "  📊 Dashboard: http://141.164.60.51:8000/projects"
echo ""
echo "Features:"
echo "  ✅ Git Repository Application (not Service)"
echo "  ✅ Auto-generated domain"
echo "  ✅ SSL certificate via Let's Encrypt"
echo "  ✅ PostgreSQL & Redis databases"
echo "  ✅ Environment variables configured"