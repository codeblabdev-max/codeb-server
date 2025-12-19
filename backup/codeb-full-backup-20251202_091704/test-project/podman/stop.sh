#!/bin/bash

echo "🛑 CodeB 로컬 개발 환경 중지..."
cd "."
podman-compose down
echo "✅ 환경이 중지되었습니다."
