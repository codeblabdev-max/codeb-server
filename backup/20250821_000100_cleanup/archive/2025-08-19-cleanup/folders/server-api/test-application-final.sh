#!/bin/bash

echo "🚀 Git Application Deployment Test (Proper Application)"
echo "=================================================="

PROJECT_NAME="codeb-app-final"
API_URL="http://141.164.60.51:3007/api"

echo "📦 Project: $PROJECT_NAME"
echo "🌐 Auto-generate domain with SSL"
echo "📂 Repository: Coolify Examples"
echo ""

# Git 애플리케이션 배포 (자동 도메인 생성)
echo "Creating application with auto-generated domain..."
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
echo "=================================================="
echo "✅ Application deployment completed!"
echo ""
echo "Check status at:"
echo "  📊 Dashboard: http://141.164.60.51:8000/projects"
echo ""
echo "Note: The application will have an auto-generated domain with SSL"
echo "It should appear as 'Application' not 'Service' in Coolify"