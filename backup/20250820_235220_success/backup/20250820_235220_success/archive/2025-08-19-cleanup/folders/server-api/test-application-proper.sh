#!/bin/bash

echo "🚀 Proper Application Deployment Test"
echo "======================================="

PROJECT_NAME="proper-app-test"
API_URL="http://141.164.60.51:3007/api"

echo "📦 Project: $PROJECT_NAME"
echo "🌐 Domain: $PROJECT_NAME.one-q.xyz"
echo "🔒 SSL: Let's Encrypt (automatic)"
echo "📂 Repository: Coolify Examples"
echo "🎯 Type: Application (NOT Service)"
echo ""

# Git 애플리케이션 배포
echo "Creating proper Application..."
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
      {"type": "postgresql", "name": "db"}
    ],
    "environmentVariables": [
      {"key": "NODE_ENV", "value": "production"}
    ]
  }' | jq .

echo ""
echo "======================================="
echo "✅ Application deployment completed!"
echo ""
echo "Check in Coolify Dashboard:"
echo "  📊 http://141.164.60.51:8000/projects"
echo "  Should appear as 'Application' not 'Service'"
echo ""
echo "Domain: https://$PROJECT_NAME.one-q.xyz"