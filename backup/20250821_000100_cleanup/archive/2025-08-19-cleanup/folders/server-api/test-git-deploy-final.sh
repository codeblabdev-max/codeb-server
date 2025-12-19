#!/bin/bash

echo "🚀 Git Repository Deployment Test"
echo "=================================="

PROJECT_NAME="codeb-git-app"
API_URL="http://141.164.60.51:3007/api"

echo "📦 Project: $PROJECT_NAME"
echo "🌐 Domain: $PROJECT_NAME.one-q.xyz"
echo "📂 Repository: Coolify Examples (Next.js)"
echo ""

# Git 저장소 배포 요청
echo "Deploying Next.js application from Git repository..."
curl -X POST "$API_URL/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "'$PROJECT_NAME'",
    "gitRepository": "https://github.com/coollabsio/coolify-examples",
    "gitBranch": "main",
    "buildPack": "nixpacks",
    "port": "3000",
    "databases": [
      {"type": "postgresql", "name": "db"}
    ],
    "environmentVariables": [
      {"key": "NODE_ENV", "value": "production"},
      {"key": "NEXT_PUBLIC_APP_NAME", "value": "'$PROJECT_NAME'"}
    ]
  }' | jq .

echo ""
echo "=================================="
echo "✅ Deployment request sent!"
echo ""
echo "Check deployment status at:"
echo "  🌐 Application: https://$PROJECT_NAME.one-q.xyz"
echo "  📊 Dashboard: http://141.164.60.51:8000/projects"
echo ""
echo "Note: SSL certificate will be automatically generated via Let's Encrypt"