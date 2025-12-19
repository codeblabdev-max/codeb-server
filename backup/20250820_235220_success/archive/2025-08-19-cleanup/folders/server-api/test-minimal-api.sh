#!/bin/bash

echo "🧪 최소 파라미터 테스트"
echo "======================"

# 가장 기본적인 파라미터만으로 직접 Coolify API 호출
echo "🎯 Coolify API 직접 호출 테스트"

PROJECT_UUID="bc8gwoc4koscwc0soo0so844"  # 방금 생성된 프로젝트
SERVER_UUID="io0ok40oo0448k80g888ock8"
BEARER_TOKEN="1|EJufWNorFOBkW7SH8GS7BruHwJ5lzjVEcLZxjhAZ9b1e84d1"

curl -X POST "http://141.164.60.51:8000/api/v1/applications/public" \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_uuid": "'$PROJECT_UUID'",
    "server_uuid": "'$SERVER_UUID'",
    "environment_name": "production",
    "git_repository": "https://github.com/dungeun/coolify-nextjs-login-app",
    "git_branch": "main",
    "build_pack": "nixpacks",
    "ports_exposes": "3000",
    "name": "minimal-test"
  }' | jq .

echo ""
echo "📊 결과 확인:"
ssh root@141.164.60.51 "docker exec coolify-db psql -U coolify -c \"SELECT 'APPLICATION' as type, name, uuid, created_at FROM applications WHERE name LIKE '%minimal%' UNION SELECT 'SERVICE' as type, name, uuid, created_at FROM services WHERE name LIKE '%minimal%' ORDER BY created_at DESC;\""