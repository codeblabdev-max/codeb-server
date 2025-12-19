# 🔧 Coolify + PowerDNS 도메인 자동화 설정 가이드

**최초 1회만 설정하면 영구 사용 가능**

---

## 🎯 설정 목표

이 가이드를 완료하면:
- **한 줄 명령어**로 프로젝트 + 도메인 + 배포 완성
- **PowerDNS**로 DNS 레코드 자동 관리
- **Coolify**로 컨테이너 자동 배포
- **SSL 인증서** 자동 발급

---

## ✅ 1단계: 환경 변수 설정 (5분)

### PowerDNS API 키 설정
```bash
# 환경 변수 설정
export PDNS_API_KEY="20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5"

# 영구 저장 (터미널 재시작해도 유지)
echo 'export PDNS_API_KEY="20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5"' >> ~/.zshrc

# 즉시 적용
source ~/.zshrc
```

### Coolify API 토큰 생성 및 설정

#### 1) Coolify 웹 접속
```bash
# 브라우저에서 열기
open http://141.164.60.51:8000
```

#### 2) API 토큰 생성
1. **로그인** (기존 계정 사용)
2. **Settings** 메뉴 클릭
3. **API Tokens** 클릭
4. **"Create new token"** 버튼 클릭
5. **이름 입력**: `automation-token`
6. **생성** 후 **토큰 복사** 📋

#### 3) 토큰 설정
```bash
# 복사한 토큰을 여기에 붙여넣기
export COOLIFY_API_TOKEN="여기에-복사한-토큰-붙여넣기"

# 영구 저장
echo 'export COOLIFY_API_TOKEN="여기에-복사한-토큰-붙여넣기"' >> ~/.zshrc

# 즉시 적용
source ~/.zshrc
```

---

## ✅ 2단계: 설정 검증 (2분)

### 환경 변수 확인
```bash
# PowerDNS API 키 확인
echo $PDNS_API_KEY
# 출력: 20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5

# Coolify 토큰 확인
echo $COOLIFY_API_TOKEN
# 출력: your-actual-token (실제 토큰 값)
```

### 연결 테스트
```bash
# 프로젝트 디렉토리 이동
cd /Users/admin/new_project/codeb-server

# 통합 테스트 실행
./scripts/automation/test-deployment.sh
```

**성공 시 출력 예시:**
```
✅ SSH 연결 정상
✅ PowerDNS API 접근 성공
✅ Coolify 상태: 통과
🎉 모든 테스트 통과! 자동 배포 준비 완료
```

---

## ✅ 3단계: 첫 번째 테스트 배포 (3분)

### 테스트 웹사이트 생성
```bash
# 테스트 프로젝트 배포
./scripts/automation/coolify-auto-deploy.sh test

# 기대되는 결과:
# ✅ DNS 레코드 생성됨: test.one-q.kr → 141.164.60.51
# ✅ Docker 컨테이너 배포됨
# ✅ 웹사이트 접속 가능: http://test.one-q.kr
```

### 결과 확인
```bash
# 1) DNS 확인
dig +short test.one-q.kr
# 출력: 141.164.60.51

# 2) 웹 접속 확인
curl -I http://test.one-q.kr
# 출력: HTTP/1.1 200 OK

# 3) 브라우저에서 접속
open http://test.one-q.kr
```

---

## ✅ 4단계: SSL 테스트 (5분)

### SSL 포함 웹사이트 생성
```bash
# SSL 인증서 자동 발급 포함 배포
./scripts/automation/coolify-auto-deploy.sh --ssl secure-test

# 기대되는 결과:
# ✅ DNS 레코드 생성됨
# ✅ Let's Encrypt SSL 인증서 발급됨  
# ✅ HTTPS 접속 가능: https://secure-test.one-q.kr
```

### SSL 결과 확인
```bash
# HTTPS 접속 확인
curl -I https://secure-test.one-q.kr
# 출력: HTTP/2 200 OK

# 브라우저에서 확인
open https://secure-test.one-q.kr
# → 🔒 자물쇠 아이콘 확인
```

---

## ✅ 5단계: Git 저장소 배포 테스트 (5분)

### 실제 프로젝트 배포
```bash
# 예시: 간단한 HTML 프로젝트 배포
./scripts/automation/coolify-auto-deploy.sh \
  --type git \
  --repo https://github.com/your-username/your-html-project \
  --domain myproject.one-q.kr \
  --ssl \
  myproject

# 또는 React 프로젝트
./scripts/automation/coolify-auto-deploy.sh \
  --type git \
  --repo https://github.com/your-username/react-app \
  --domain app.one-q.kr \
  --ssl \
  react-app
```

---

## 🎉 설정 완료!

### 이제 사용할 수 있는 것들:

#### ⚡ 즉시 배포
```bash
# 기본 웹사이트
./scripts/automation/coolify-auto-deploy.sh myblog
# → http://myblog.one-q.kr

# SSL 포함
./scripts/automation/coolify-auto-deploy.sh --ssl myapp  
# → https://myapp.one-q.kr

# Git 저장소 배포
./scripts/automation/coolify-auto-deploy.sh \
  -t git -r https://github.com/user/repo \
  -d custom.one-q.kr --ssl myproject
```

#### 🛠️ 관리 도구
```bash
# DNS 관리
ssh root@141.164.60.51 "/opt/coolify-automation/scripts/dns-manager.sh list-zones"

# 프로젝트 상태 확인
ssh root@141.164.60.51 "docker ps"

# Coolify 웹 관리
open http://141.164.60.51:8000
```

---

## 🔧 문제 해결

### 자주 발생하는 문제

#### 문제: "환경 변수가 없습니다"
```bash
# 해결: 환경 변수 다시 설정
export PDNS_API_KEY="20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5"
export COOLIFY_API_TOKEN="your-token"
source ~/.zshrc
```

#### 문제: "PowerDNS API 접근 실패"
```bash
# 해결: PowerDNS 재시작
ssh root@141.164.60.51 "systemctl restart pdns"

# API 테스트
curl -H "X-API-Key: $PDNS_API_KEY" http://141.164.60.51:8081/api/v1/servers
```

#### 문제: "Coolify 토큰 오류"
1. http://141.164.60.51:8000 접속
2. Settings → API Tokens
3. 기존 토큰 삭제 후 새로 생성
4. 환경 변수 다시 설정

#### 문제: "도메인 접속 안됨"
```bash
# DNS 전파 확인
dig @8.8.8.8 your-domain.one-q.kr

# 로컬 DNS 캐시 삭제
sudo dscacheutil -flushcache

# 5분 정도 대기 후 재시도
```

---

## 📋 설정 완료 체크리스트

- [ ] PowerDNS API 키 설정됨 (`echo $PDNS_API_KEY`)
- [ ] Coolify 토큰 설정됨 (`echo $COOLIFY_API_TOKEN`)
- [ ] 환경 변수 영구 저장됨 (`~/.zshrc`에 추가)
- [ ] 통합 테스트 통과 (`test-deployment.sh`)
- [ ] 첫 번째 테스트 배포 성공 (`test.one-q.kr`)
- [ ] SSL 테스트 성공 (`secure-test.one-q.kr`)
- [ ] Git 저장소 배포 테스트 성공

---

## 🎯 다음 단계

### 본격 사용하기
1. **[프로젝트 도메인 자동 생성 메뉴얼](PROJECT_DOMAIN_AUTO_GENERATION_MANUAL.md)** 읽기
2. **[치트시트](DOMAIN_AUTO_GENERATION_CHEATSHEET.md)** 북마크
3. **실제 프로젝트 배포** 시작!

### 고급 기능
- 환경별 배포 (dev/staging/prod)
- 마이크로서비스 아키텍처
- CI/CD 파이프라인 연동
- 모니터링 및 로깅

---

**🎊 축하합니다! 이제 단 한 줄로 웹사이트를 만들 수 있습니다!**

```bash
./scripts/automation/coolify-auto-deploy.sh 당신의첫번째프로젝트
```

---

**작성일**: 2025-08-15  
**소요 시간**: 약 20분  
**난이도**: ⭐⭐☆☆☆ (초급)