#!/bin/bash

# 테스트 배포 스크립트

echo "🚀 Testing Complete Deployment System"
echo "======================================"

PROJECT_NAME="codeb-full-test"
API_URL="http://141.164.60.51:3006/api"

echo "📦 Project: $PROJECT_NAME"
echo "🌐 Domain: $PROJECT_NAME.one-q.xyz"
echo ""

# 배포 요청
curl -X POST "$API_URL/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "'$PROJECT_NAME'",
    "databases": [
      {"type": "postgresql", "name": "maindb"},
      {"type": "redis", "name": "cache"},
      {"type": "mysql", "name": "analytics"}
    ],
    "environmentVariables": [
      {"key": "NODE_ENV", "value": "production"},
      {"key": "APP_NAME", "value": "'$PROJECT_NAME'"},
      {"key": "API_PORT", "value": "3000"}
    ]
  }' | jq .

echo ""
echo "======================================"
echo "✅ Deployment request sent!"