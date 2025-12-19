#!/bin/bash

# CodeB CLI v2.0 전역 설치 스크립트

echo "🚀 CodeB CLI v2.0 전역 설치 시작..."

# 1. CLI 파일을 /usr/local/bin으로 복사
echo "📁 CLI 파일 복사 중..."
sudo cp codeb-cli-v2.sh /usr/local/bin/codeb
sudo chmod +x /usr/local/bin/codeb

# 2. 설치 확인
echo "✅ 설치 확인 중..."
if command -v codeb >/dev/null 2>&1; then
    echo "🎉 CodeB CLI v2.0 설치 완료!"
    echo ""
    echo "사용법:"
    echo "  codeb list                    # 프로젝트 목록"
    echo "  codeb create my-app nodejs    # 프로젝트 생성" 
    echo "  codeb tail my-app app         # 실시간 로그"
    echo ""
    echo "버전 확인:"
    codeb --help | head -1
else
    echo "❌ 설치 실패"
    exit 1
fi

echo ""
echo "🔧 API 서버 실행이 필요합니다:"
echo "  cd $(pwd)"
echo "  npm install"
echo "  npm start"
