# 🌐 Coolify + PowerDNS 프로젝트 도메인 자동 생성 메뉴얼

**단 한 줄 명령어로 프로젝트 생성 → 도메인 자동 생성 → 배포까지 완전 자동화**

---

## 🚀 핵심 개념

### "프로젝트 생성 = 도메인 자동 생성"
```
프로젝트명 입력 → DNS 레코드 생성 → SSL 발급 → 자동 배포 → 접속 가능
     ↓              ↓              ↓          ↓           ↓
   myapp    →  myapp.one-q.kr  →   HTTPS   →  배포완료  →  🌐 서비스 오픈
```

---

## ⚡ 즉시 시작하기

### 1단계: 환경 준비 (최초 1회만)
```bash
# PowerDNS API 키 설정
export PDNS_API_KEY="20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5"

# Coolify 토큰 설정 (Coolify 웹에서 생성 필요)
export COOLIFY_API_TOKEN="your-token-here"

# 영구 저장
echo 'export PDNS_API_KEY="20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5"' >> ~/.zshrc
echo 'export COOLIFY_API_TOKEN="your-token-here"' >> ~/.zshrc
```

### 2단계: 프로젝트 배포
```bash
# 프로젝트 디렉토리 이동
cd /Users/admin/new_project/codeb-server

# 기본 배포 (도메인 자동 생성)
./scripts/automation/coolify-auto-deploy.sh 프로젝트명
```

**끝! 🎉**

---

## 🎯 실제 사용 예시

### 간단한 웹사이트 만들기
```bash
# 명령어 실행
./scripts/automation/coolify-auto-deploy.sh myblog

# 결과
# ✅ DNS 레코드 생성됨: myblog.one-q.kr → 141.164.60.51
# ✅ Nginx 컨테이너 배포됨
# ✅ 웹사이트 접속 가능: http://myblog.one-q.kr
```

### React 앱 배포하기
```bash
# Git 저장소에서 자동 빌드 + 배포
./scripts/automation/coolify-auto-deploy.sh \
  --type git \
  --repo https://github.com/username/react-app \
  --domain app.one-q.kr \
  --ssl \
  myreactapp

# 결과
# ✅ Git 저장소 클론됨
# ✅ React 앱 자동 빌드됨  
# ✅ SSL 인증서 발급됨
# ✅ 웹사이트 접속 가능: https://app.one-q.kr
```

### API 서버 배포하기
```bash
# Node.js API 서버 배포
./scripts/automation/coolify-auto-deploy.sh \
  --type git \
  --repo https://github.com/username/api-server \
  --domain api.one-q.kr \
  --port 3000 \
  --ssl \
  myapi

# 결과
# ✅ API 서버 배포됨
# ✅ 포트 3000에서 실행됨
# ✅ API 접속 가능: https://api.one-q.kr
```

---

## 🛠️ 명령어 옵션

### 기본 문법
```bash
./scripts/automation/coolify-auto-deploy.sh [옵션] 프로젝트명
```

### 주요 옵션

| 옵션 | 설명 | 예시 |
|------|------|------|
| `--domain` `-d` | 커스텀 도메인 지정 | `-d custom.one-q.kr` |
| `--type` `-t` | 프로젝트 타입 | `-t git` (Git 저장소) |
| `--repo` `-r` | Git 저장소 URL | `-r https://github.com/user/repo` |
| `--port` `-p` | 앱 내부 포트 | `-p 3000` |
| `--ssl` | SSL 인증서 자동 발급 | `--ssl` |
| `--no-dns` | DNS 생성 건너뛰기 | `--no-dns` |

### 프로젝트 타입

| 타입 | 설명 | 언제 사용? |
|------|------|-----------|
| `docker-compose` | Docker Compose (기본값) | 간단한 웹사이트, DB 포함 앱 |
| `git` | Git 저장소 자동 빌드 | React, Vue, Node.js, Python 등 |
| `dockerfile` | 커스텀 Dockerfile | 특별한 설정이 필요한 경우 |

---

## 🌐 도메인 자동 생성 규칙

### 기본 도메인 패턴
```bash
# 프로젝트명이 도메인이 됨
프로젝트명: myapp     → 도메인: myapp.one-q.kr
프로젝트명: api       → 도메인: api.one-q.kr  
프로젝트명: shop      → 도메인: shop.one-q.kr
```

### 커스텀 도메인 사용
```bash
# 원하는 도메인으로 직접 지정
./scripts/automation/coolify-auto-deploy.sh -d custom.one-q.kr myproject
# → 도메인: custom.one-q.kr
```

### 사용 가능한 도메인
- **one-q.kr** (메인 도메인)
- **one-q.xyz** (서브 도메인)

---

## 📱 실전 시나리오

### 시나리오 1: 포트폴리오 사이트
```bash
# HTML/CSS 포트폴리오 배포
./scripts/automation/coolify-auto-deploy.sh portfolio

# 결과: http://portfolio.one-q.kr
```

### 시나리오 2: 블로그 사이트  
```bash
# Ghost 블로그 시스템
./scripts/automation/coolify-auto-deploy.sh --ssl blog

# 결과: https://blog.one-q.kr
```

### 시나리오 3: 쇼핑몰 구축
```bash
# 프론트엔드
./scripts/automation/coolify-auto-deploy.sh \
  -t git -r https://github.com/mystore/frontend \
  -d shop.one-q.kr --ssl frontend

# 백엔드 API
./scripts/automation/coolify-auto-deploy.sh \
  -t git -r https://github.com/mystore/backend \
  -d api.shop.one-q.kr -p 3000 --ssl backend

# 관리자 패널
./scripts/automation/coolify-auto-deploy.sh \
  -t git -r https://github.com/mystore/admin \
  -d admin.shop.one-q.kr --ssl admin
```

### 시나리오 4: 개발/스테이징/프로덕션
```bash
# 개발 환경
./scripts/automation/coolify-auto-deploy.sh -d dev.myapp.one-q.kr dev-app

# 스테이징 환경  
./scripts/automation/coolify-auto-deploy.sh -d staging.myapp.one-q.kr --ssl staging-app

# 프로덕션 환경
./scripts/automation/coolify-auto-deploy.sh -d myapp.one-q.kr --ssl prod-app
```

---

## 🔧 고급 관리

### DNS 직접 관리
```bash
# 서버 접속
ssh root@141.164.60.51

# DNS 존 목록 확인
/opt/coolify-automation/scripts/dns-manager.sh list-zones

# 수동으로 도메인 추가
/opt/coolify-automation/scripts/dns-manager.sh create-record one-q.kr custom.one-q.kr A 141.164.60.51

# DNS 동작 확인
/opt/coolify-automation/scripts/dns-manager.sh query custom.one-q.kr
```

### 프로젝트 상태 확인
```bash
# 배포된 프로젝트 목록
ssh root@141.164.60.51 "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

# 특정 프로젝트 로그 확인
ssh root@141.164.60.51 "docker logs 프로젝트명 -f"
```

### Coolify 웹 관리
- **접속 URL**: http://141.164.60.51:8000
- **용도**: 프로젝트 세부 설정, 환경 변수 관리, 로그 확인

---

## 🚨 자주 발생하는 문제와 해결

### 문제 1: "DNS 레코드 생성 실패"
```bash
# 해결: PowerDNS 상태 확인
ssh root@141.164.60.51 "systemctl status pdns"

# PowerDNS 재시작
ssh root@141.164.60.51 "systemctl restart pdns"
```

### 문제 2: "도메인 접속 안됨"
```bash
# 해결: DNS 전파 확인
dig @8.8.8.8 your-domain.one-q.kr
dig @141.164.60.51 your-domain.one-q.kr

# 로컬 DNS 캐시 삭제
sudo dscacheutil -flushcache
```

### 문제 3: "SSL 인증서 발급 실패"
```bash
# 해결: DNS 전파 대기 후 재시도
sleep 300  # 5분 대기

# 수동 인증서 발급
ssh root@141.164.60.51 "certbot certonly --standalone -d your-domain.one-q.kr"
```

### 문제 4: "Coolify 접속 불가"
```bash
# 해결: Coolify 컨테이너 재시작
ssh root@141.164.60.51 "docker restart coolify coolify-db coolify-redis"
```

---

## 🎯 베스트 프랙티스

### 도메인 명명 규칙
```bash
# 좋은 예시
✅ myapp, blog, api, shop, admin
✅ user-service, payment-api, frontend
✅ dev-app, staging-blog, prod-api

# 피해야 할 예시  
❌ my_app (언더스코어), My-App (대문자)
❌ 너무 긴 이름: very-long-project-name-that-is-hard-to-remember
```

### 환경별 구분
```bash
# 개발용
dev.프로젝트명.one-q.kr

# 스테이징용  
staging.프로젝트명.one-q.kr

# 프로덕션용
프로젝트명.one-q.kr
```

### SSL 사용 권장
```bash
# 항상 --ssl 옵션 사용 권장
./scripts/automation/coolify-auto-deploy.sh --ssl 프로젝트명

# 특히 다음의 경우 필수:
# - 로그인 기능이 있는 사이트
# - 결제 기능이 있는 사이트  
# - API 서버
# - 프로덕션 환경
```

---

## 📞 지원 및 도움

### 빠른 도움
- **전체 문서**: [AUTOMATION_MANUAL.md](AUTOMATION_MANUAL.md)
- **빠른 참조**: [QUICK_REFERENCE.md](QUICK_REFERENCE.md)

### 로그 확인
```bash
# 배포 로그
tail -f /Users/admin/new_project/codeb-server/deployment.log

# 서버 상태
./scripts/automation/test-deployment.sh
```

### 긴급 복구
```bash
# 모든 서비스 재시작
ssh root@141.164.60.51 << 'EOF'
systemctl restart pdns
docker restart coolify coolify-db coolify-redis
EOF
```

---

## 💡 실전 팁

### 팁 1: 프로젝트명 = 도메인명
프로젝트명을 지을 때 도메인명을 고려해서 짓세요.
```bash
# 프로젝트명이 곧 도메인이 됩니다
./scripts/automation/coolify-auto-deploy.sh myblog
# → myblog.one-q.kr
```

### 팁 2: Git 저장소는 public 권장
private 저장소의 경우 SSH 키 설정이 필요할 수 있습니다.

### 팁 3: 환경 변수 미리 설정
자주 배포하는 경우 환경 변수를 미리 설정해두세요.
```bash
# ~/.zshrc에 추가
export PDNS_API_KEY="20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5"
export COOLIFY_API_TOKEN="your-token"
```

### 팁 4: 테스트용 프로젝트 먼저
본격적인 프로젝트 전에 테스트용으로 먼저 해보세요.
```bash
./scripts/automation/coolify-auto-deploy.sh test
# → test.one-q.kr 로 테스트
```

---

**🎉 이제 단 한 줄의 명령어로 프로젝트부터 도메인까지 모든 것이 자동으로 만들어집니다!**

---

**작성일**: 2025-08-15  
**버전**: 1.0  
**업데이트**: 지속적  
**문의**: Claude Code Team