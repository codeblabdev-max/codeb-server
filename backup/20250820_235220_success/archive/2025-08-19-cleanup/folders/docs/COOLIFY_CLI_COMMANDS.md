# 📚 Coolify CLI 명령어 가이드

## 🔧 Coolify CLI 종류

### 1. **Community Coolify CLI** (Luca-Sordetti 개발)
비공식이지만 널리 사용되는 커뮤니티 버전

### 2. **공식 Coolify CLI** (coollabsio 개발)  
Coolify 팀에서 공식 제공하는 CLI

---

## 📦 설치 방법

### Community CLI 설치
```bash
# NPM을 통한 전역 설치
npm install -g coolify

# Yarn을 통한 설치
yarn global add coolify
```

### 공식 CLI 설치
```bash
# 자동 설치 스크립트
curl -fsSL https://raw.githubusercontent.com/coollabsio/coolify-cli/main/scripts/install.sh | bash

# 설치 경로
# CLI 실행 파일: /usr/local/bin/coolify
# 설정 파일: ~/.config/coolify/config.json
```

---

## 🎯 Community CLI 명령어

### 프로젝트 배포
```bash
# 기본 배포
coolify deploy [PROJECT_NAME]

# 옵션과 함께 배포
coolify deploy myapp --force        # 강제 배포
coolify deploy myapp --watch        # 배포 후 로그 모니터링
coolify deploy myapp -f -w          # 강제 배포 + 모니터링
```

### 애플리케이션 관리
```bash
# 앱 시작
coolify start [PROJECT_NAME]
coolify start myapp --watch         # 시작 후 로그 확인

# 앱 중지
coolify stop [PROJECT_NAME]

# 앱 재시작
coolify restart [PROJECT_NAME]
coolify restart myapp --watch       # 재시작 후 로그 확인

# 앱 상태 확인
coolify status [PROJECT_NAME]

# 앱 제거
coolify applications remove [PROJECT_NAME]
```

### 명령 실행
```bash
# 컨테이너 내부에서 명령 실행
coolify execute [PROJECT_NAME] [COMMAND]

# 예시
coolify execute myapp ls -la
coolify execute myapp npm run migrate
coolify execute myapp yarn build
```

### 인스턴스 관리
```bash
# Coolify 인스턴스 목록
coolify instances list

# 인스턴스 제거
coolify instances remove [INSTANCE_NAME]
```

### 도움말
```bash
# 전체 도움말
coolify --help
coolify help

# 특정 명령어 도움말
coolify help deploy
coolify deploy --help

# 중첩 명령어 표시
coolify help --nested-commands
```

---

## 🔐 공식 CLI 명령어

### 초기 설정
```bash
# Coolify Cloud 토큰 설정
coolify instances set token cloud YOUR_TOKEN_HERE

# 셀프호스팅 인스턴스 추가
coolify instances add -d myserver example.com YOUR_TOKEN_HERE
# -d: 기본 인스턴스로 설정

# 기본 인스턴스 변경
coolify instances set default production
```

### 인스턴스 관리
```bash
# 인스턴스 목록 확인
coolify instances list

# 인스턴스 상태 확인
coolify instances status

# 인스턴스 제거
coolify instances remove myserver
```

### CLI 업데이트
```bash
# 최신 버전으로 업데이트
coolify update
```

---

## 🚀 프로젝트 자동 배포 (현재 프로젝트)

현재 프로젝트에서 제공하는 통합 자동화 스크립트:

### 기본 사용법
```bash
# 단순 웹앱 배포
./scripts/automation/coolify-auto-deploy.sh myapp
# 결과: http://myapp.one-q.xyz 자동 생성

# Git 저장소에서 배포
./scripts/automation/coolify-auto-deploy.sh \
  -t git \
  -r https://github.com/user/repo \
  myproject

# SSL 인증서 포함 배포
./scripts/automation/coolify-auto-deploy.sh \
  --ssl \
  -d secure.one-q.kr \
  secureapp
```

### 고급 옵션
```bash
# 전체 옵션 사용 예시
./scripts/automation/coolify-auto-deploy.sh \
  -d api.one-q.kr \                    # 커스텀 도메인
  -t git \                              # 프로젝트 타입
  -r https://github.com/user/repo \    # Git 저장소
  -p 5000 \                             # 내부 포트
  --ssl \                               # SSL 자동 발급
  myapi                                 # 프로젝트명
```

### 옵션 설명
- `-d, --domain`: 사용할 도메인 (기본: PROJECT_NAME.one-q.xyz)
- `-t, --type`: 프로젝트 타입 (docker-compose|dockerfile|git)
- `-r, --repo`: Git 저장소 URL (git 타입 필수)
- `-e, --env`: 환경 변수 파일 경로
- `-p, --port`: 내부 포트 (기본: 3000)
- `--ssl`: Let's Encrypt SSL 자동 발급
- `--no-dns`: DNS 레코드 생성 건너뛰기

---

## 🔌 API 엔드포인트 (서버 API)

현재 프로젝트의 배포 서버 API:

### 헬스 체크
```bash
curl http://localhost:3007/api/health
```

### 완전 자동 배포
```bash
curl -X POST http://localhost:3007/api/deploy/complete \
  -H 'Content-Type: application/json' \
  -d '{
    "projectName": "myapp",
    "gitRepository": "https://github.com/user/repo",
    "subdomain": "myapp",
    "enableSSL": true
  }'
```

### DNS 레코드만 생성
```bash
curl -X POST http://localhost:3007/api/dns/create \
  -H 'Content-Type: application/json' \
  -d '{
    "subdomain": "api",
    "type": "A",
    "content": "141.164.60.51"
  }'
```

---

## 🛠️ 환경 변수 설정

### PowerDNS API 키
```bash
export PDNS_API_KEY='your-powerdns-api-key'
```

### Coolify API 토큰
```bash
export COOLIFY_API_TOKEN='your-coolify-api-token'
```

### 설정 파일 위치
- Community CLI: `~/.coolifyrc`
- 공식 CLI: `~/.config/coolify/config.json`
- 프로젝트 설정: `/config/domain-config.json`

---

## 📊 명령어 비교표

| 기능 | Community CLI | 공식 CLI | 프로젝트 스크립트 |
|------|--------------|----------|------------------|
| 배포 | `coolify deploy` | - | `./coolify-auto-deploy.sh` |
| 시작 | `coolify start` | - | API 호출 |
| 중지 | `coolify stop` | - | API 호출 |
| 재시작 | `coolify restart` | - | API 호출 |
| 상태 확인 | `coolify status` | - | API 호출 |
| 로그 확인 | `--watch` 플래그 | - | 웹 대시보드 |
| SSL 설정 | - | - | `--ssl` 플래그 |
| DNS 설정 | - | - | 자동 생성 |

---

## 🚨 문제 해결

### 권한 오류
```bash
# CLI 권한 설정
chmod +x /usr/local/bin/coolify

# 스크립트 실행 권한
chmod +x scripts/automation/*.sh
```

### API 토큰 오류
```bash
# Coolify 대시보드에서 토큰 재생성
# Settings > API Tokens > Generate New Token

# 토큰 설정
export COOLIFY_API_TOKEN='new-token'
```

### DNS 전파 지연
```bash
# DNS 캐시 플러시 (macOS)
sudo dscacheutil -flushcache

# DNS 캐시 플러시 (Linux)
sudo systemd-resolve --flush-caches

# DNS 확인
dig myapp.one-q.xyz
nslookup myapp.one-q.xyz
```

---

## 📚 추가 리소스

- [Coolify 공식 문서](https://coolify.io/docs)
- [Community CLI GitHub](https://github.com/Luca-Sordetti/coolify-cli)
- [공식 CLI GitHub](https://github.com/coollabsio/coolify-cli)
- [PowerDNS API 문서](https://doc.powerdns.com/authoritative/http-api/)

---

**최종 업데이트**: 2025-08-18
**작성자**: Claude Code Assistant