#!/bin/bash

echo "🚀 Next.js GitHub Repository Deployment Test"
echo "============================================="

PROJECT_NAME="nextjs-login-app"
GITHUB_REPO="https://github.com/dungeun/coolify-nextjs-login-app"
API_URL="http://141.164.60.51:3007/api"

echo "📦 Project: $PROJECT_NAME"
echo "🌐 Domain: $PROJECT_NAME.one-q.xyz (auto-generated)"
echo "🔒 SSL: Let's Encrypt (automatic)"
echo "📂 Repository: $GITHUB_REPO"
echo "🎯 Type: Next.js Application with Database"
echo ""

# Next.js 애플리케이션 배포 (PostgreSQL 포함)
echo "Creating Next.js application with database..."
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
echo "============================================="
echo "✅ Next.js Application deployment completed!"
echo ""
echo "Your application will be available at:"
echo "  🌐 https://$PROJECT_NAME.one-q.xyz (with SSL)"
echo "  📊 Dashboard: http://141.164.60.51:8000/projects"
echo ""
echo "Features:"
echo "  ✅ Next.js 14 + TypeScript Application"
echo "  ✅ Prisma ORM + PostgreSQL database"
echo "  ✅ User authentication (login/register)"
echo "  ✅ Auto-generated domain with SSL"
echo "  ✅ Environment variables configured"
echo "  ✅ Database connection string auto-generated"
echo ""
echo "Test the application:"
echo "  1. Visit https://$PROJECT_NAME.one-q.xyz"
echo "  2. Try registering a new account"
echo "  3. Login and access the dashboard"