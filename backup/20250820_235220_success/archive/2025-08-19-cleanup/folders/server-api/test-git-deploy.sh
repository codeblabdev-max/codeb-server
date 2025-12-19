#!/bin/bash

echo "🚀 Git Repository Deployment Test"
echo "=================================="

PROJECT_NAME="codeb-nextjs"
API_URL="http://141.164.60.51:3007/api"

echo "📦 Project: $PROJECT_NAME"
echo "🌐 Domain: $PROJECT_NAME.one-q.xyz"
echo "📂 Repository: Coolify Next.js Example"
echo ""

# Git 저장소 배포 요청
echo "Deploying Next.js application from Git..."
curl -X POST "$API_URL/deploy/git" \
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