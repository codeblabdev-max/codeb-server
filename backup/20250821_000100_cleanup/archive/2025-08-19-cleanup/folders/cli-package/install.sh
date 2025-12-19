#!/bin/bash

# CodeB CLI 설치 스크립트

echo "🚀 CodeB CLI 설치 시작..."

# Node.js 버전 확인
if ! command -v node &> /dev/null; then
    echo "❌ Node.js가 설치되어 있지 않습니다."
    echo "   Node.js 18+ 설치가 필요합니다: https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18 이상이 필요합니다. 현재 버전: $(node -v)"
    exit 1
fi

echo "✅ Node.js 버전 확인: $(node -v)"

# npm 설치
echo "📦 CodeB CLI 설치 중..."

# 전역 설치 시도
if npm install -g .; then
    echo "✅ CodeB CLI 설치 완료!"
    echo ""
    echo "🎯 사용법:"
    echo "  codeb deploy my-app https://github.com/user/repo"
    echo "  codeb init my-project"
    echo "  codeb status"
    echo "  codeb health"
    echo "  codeb --help"
    echo ""
    echo "📋 설정 확인:"
    codeb config --show
    echo ""
    echo "🏥 서버 상태:"
    codeb health
else
    echo "❌ 설치 실패"
    echo "💡 권한이 필요할 수 있습니다. 다시 시도:"
    echo "   sudo npm install -g ."
    exit 1
fi