#!/bin/bash

echo "🚀 Final Complete Deployment Test"
echo "=================================="

PROJECT_NAME="codeb-final"
API_URL="http://141.164.60.51:3007/api"

echo "📦 Project: $PROJECT_NAME"
echo "🌐 Domain: $PROJECT_NAME.one-q.xyz"
echo ""

# 배포 요청
echo "Sending deployment request..."
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
      {"key": "API_PORT", "value": "3000"},
      {"key": "SECRET_KEY", "value": "super-secret-key-123"}
    ]
  }' | jq .

echo ""
echo "=================================="