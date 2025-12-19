# 📦 CodeB CLI 설치 가이드

## 🚀 빠른 설치

### 방법 1: npm 전역 설치 (추천)
```bash
npm install -g codeb-cli
```

### 방법 2: 로컬 설치 스크립트
```bash
# 1. 패키지 다운로드
git clone https://github.com/your-username/codeb-cli.git
cd codeb-cli

# 2. 자동 설치
./install.sh
```

### 방법 3: 수동 설치
```bash
# 1. 의존성 설치
npm install

# 2. 전역 링크
npm link

# 3. 확인
codeb --help
```

## 📋 설치 요구사항

### 시스템 요구사항
- **Node.js**: 18.0.0 이상
- **npm**: 9.0.0 이상
- **운영체제**: macOS, Linux, Windows

### 확인 방법
```bash
node --version    # v18.0.0+
npm --version     # 9.0.0+
```

## 🔧 설치 후 설정

### 1. 기본 설정 확인
```bash
codeb config --show
```

### 2. 서버 연결 테스트
```bash
codeb health
```

### 3. 첫 번째 배포 테스트
```bash
codeb deploy test-app https://github.com/dungeun/coolify-nextjs-login-app
```

## 🌍 다양한 설치 방법

### 📦 NPM 저장소에서 설치
```bash
# 안정 버전
npm install -g codeb-cli

# 최신 베타 버전
npm install -g codeb-cli@beta

# 특정 버전
npm install -g codeb-cli@1.0.0
```

### 🔗 GitHub에서 직접 설치
```bash
npm install -g https://github.com/your-username/codeb-cli.git
```

### 📁 로컬 디렉토리에서 설치
```bash
cd /path/to/codeb-cli
npm install -g .
```

## 🔄 업데이트

### 최신 버전으로 업데이트
```bash
npm update -g codeb-cli
```

### 버전 확인
```bash
codeb --version
npm list -g codeb-cli
```

## 🗑️ 제거

### CLI 제거
```bash
npm uninstall -g codeb-cli
```

### 설정 파일 제거
```bash
codeb config --reset  # 제거 전에 실행
```

### 완전 제거
```bash
# 1. CLI 제거
npm uninstall -g codeb-cli

# 2. 설정 디렉토리 제거 (선택사항)
rm -rf ~/.config/codeb-cli        # Linux/macOS
rm -rf ~/Library/Preferences/codeb-cli-nodejs  # macOS
```

## 🐛 설치 문제 해결

### 권한 오류
```bash
# macOS/Linux
sudo npm install -g codeb-cli

# 또는 nvm 사용 권장
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
npm install -g codeb-cli
```

### 네트워크 오류
```bash
# npm 레지스트리 확인
npm config get registry

# 대안 레지스트리 사용
npm install -g codeb-cli --registry https://registry.npmmirror.com
```

### 캐시 문제
```bash
# npm 캐시 클리어
npm cache clean --force

# 재설치
npm uninstall -g codeb-cli
npm install -g codeb-cli
```

### Node.js 버전 문제
```bash
# 현재 버전 확인
node --version

# nvm으로 최신 LTS 설치
nvm install --lts
nvm use --lts

# 재설치
npm install -g codeb-cli
```

## 🔧 고급 설정

### 개발 환경 설정
```bash
# 개발용 로컬 링크
git clone https://github.com/your-username/codeb-cli.git
cd codeb-cli
npm install
npm link

# 개발 중인 변경사항 실시간 반영
```

### 커스텀 서버 설정
```bash
# 프라이빗 서버 사용
codeb config --server http://your-private-server:3007

# 설정 확인
codeb config --show

# 연결 테스트
codeb health
```

### 프록시 환경
```bash
# HTTP 프록시 설정
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080

# 설치
npm install -g codeb-cli
```

## ✅ 설치 확인 체크리스트

설치 완료 후 다음 명령들이 모두 작동하는지 확인하세요:

- [ ] `codeb --version` - 버전 표시
- [ ] `codeb --help` - 도움말 표시  
- [ ] `codeb config --show` - 설정 정보 표시
- [ ] `codeb health` - 서버 연결 성공
- [ ] `codeb status` - 프로젝트 목록 (비어있어도 오류 없음)

모든 체크리스트가 통과하면 설치가 성공적으로 완료된 것입니다! 🎉

## 📞 지원

설치 관련 문제가 있으시면:
- **GitHub Issues**: [https://github.com/your-username/codeb-cli/issues](https://github.com/your-username/codeb-cli/issues)
- **Discord**: [커뮤니티 채널](#)
- **Email**: support@codeb-cli.com