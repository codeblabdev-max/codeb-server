# ⚡ 도메인 자동 생성 치트시트

## 🚀 한 줄 명령어로 웹사이트 만들기

### 기본 사용법
```bash
cd /Users/admin/new_project/codeb-server
./scripts/automation/coolify-auto-deploy.sh 프로젝트명
```
**결과**: http://프로젝트명.one-q.kr 자동 생성

---

## ⚡ 자주 사용하는 명령어

```bash
# 🌐 기본 웹사이트
./scripts/automation/coolify-auto-deploy.sh myblog
# → http://myblog.one-q.kr

# 🔒 SSL 포함 웹사이트  
./scripts/automation/coolify-auto-deploy.sh --ssl myapp
# → https://myapp.one-q.kr

# 📱 React/Vue 앱 배포
./scripts/automation/coolify-auto-deploy.sh \
  -t git -r https://github.com/user/frontend \
  -d app.one-q.kr --ssl myapp

# 🔧 API 서버 배포
./scripts/automation/coolify-auto-deploy.sh \
  -t git -r https://github.com/user/api \
  -d api.one-q.kr -p 3000 --ssl myapi

# 🛠️ 커스텀 도메인
./scripts/automation/coolify-auto-deploy.sh -d custom.one-q.kr myproject
```

---

## 🔧 필수 환경 변수

```bash
# PowerDNS (필수)
export PDNS_API_KEY="20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5"

# Coolify (필수 - 웹에서 생성)
export COOLIFY_API_TOKEN="your-token-here"

# 영구 저장
echo 'export PDNS_API_KEY="20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5"' >> ~/.zshrc
echo 'export COOLIFY_API_TOKEN="your-token-here"' >> ~/.zshrc
```

---

## 📋 옵션 치트시트

| 옵션 | 단축 | 설명 | 예시 |
|------|------|------|------|
| `--domain` | `-d` | 커스텀 도메인 | `-d api.one-q.kr` |
| `--type` | `-t` | 프로젝트 타입 | `-t git` |
| `--repo` | `-r` | Git 저장소 | `-r https://github.com/user/repo` |
| `--port` | `-p` | 앱 포트 | `-p 3000` |
| `--ssl` | - | SSL 자동 발급 | `--ssl` |
| `--no-dns` | - | DNS 생성 안함 | `--no-dns` |

---

## 🎯 프로젝트 타입

| 타입 | 언제 사용? | 예시 |
|------|-----------|------|
| `docker-compose` | 기본 웹사이트 | 블로그, 포트폴리오 |
| `git` | Git 저장소 빌드 | React, Vue, Node.js |
| `dockerfile` | 커스텀 설정 | 특별한 요구사항 |

---

## 🛠️ 관리 명령어

```bash
# 🔍 DNS 확인
ssh root@141.164.60.51 "/opt/coolify-automation/scripts/dns-manager.sh list-zones"

# ➕ DNS 레코드 추가
ssh root@141.164.60.51 "/opt/coolify-automation/scripts/dns-manager.sh create-record one-q.kr sub.one-q.kr A 141.164.60.51"

# 📊 프로젝트 상태
ssh root@141.164.60.51 "docker ps"

# 📝 로그 확인
ssh root@141.164.60.51 "docker logs 프로젝트명 -f"
```

---

## 🚨 문제 해결

```bash
# 💻 PowerDNS 재시작
ssh root@141.164.60.51 "systemctl restart pdns"

# 🔄 Coolify 재시작  
ssh root@141.164.60.51 "docker restart coolify"

# 🌐 DNS 캐시 삭제
sudo dscacheutil -flushcache

# ✅ 전체 테스트
./scripts/automation/test-deployment.sh
```

---

## 💡 실전 예시

### 📱 모바일 앱 백엔드
```bash
./scripts/automation/coolify-auto-deploy.sh \
  -t git -r https://github.com/myapp/backend \
  -d api.myapp.one-q.kr -p 3000 --ssl backend
```

### 🛒 쇼핑몰 3-tier
```bash
# 프론트엔드
./scripts/automation/coolify-auto-deploy.sh \
  -t git -r https://github.com/shop/frontend \
  -d shop.one-q.kr --ssl frontend

# API 서버
./scripts/automation/coolify-auto-deploy.sh \
  -t git -r https://github.com/shop/api \
  -d api.shop.one-q.kr -p 3000 --ssl api

# 관리자
./scripts/automation/coolify-auto-deploy.sh \
  -t git -r https://github.com/shop/admin \
  -d admin.shop.one-q.kr --ssl admin
```

### 🧪 개발/스테이징/프로덕션
```bash
# 개발
./scripts/automation/coolify-auto-deploy.sh -d dev.myapp.one-q.kr dev

# 스테이징
./scripts/automation/coolify-auto-deploy.sh -d staging.myapp.one-q.kr --ssl staging

# 프로덕션
./scripts/automation/coolify-auto-deploy.sh -d myapp.one-q.kr --ssl prod
```

---

## 🌐 사용 가능한 도메인

- **one-q.kr** (메인)
- **one-q.xyz** (서브)

---

## 📞 빠른 도움

- **Coolify 웹**: http://141.164.60.51:8000
- **전체 문서**: [PROJECT_DOMAIN_AUTO_GENERATION_MANUAL.md](PROJECT_DOMAIN_AUTO_GENERATION_MANUAL.md)
- **서버 접속**: `ssh root@141.164.60.51`

---

**💯 성공 공식: 프로젝트명 생각 → 명령어 실행 → 도메인 완성!**