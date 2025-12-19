#!/bin/bash

echo "🔄 CodeB 로컬 환경 초기화..."
cd "."
podman-compose down -v
podman-compose up -d
echo "✅ 환경이 초기화되었습니다."
