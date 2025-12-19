# ⚡ 빠른 참조 가이드

## 🚀 즉시 사용 가능한 명령어들

### 기본 배포
```bash
# 프로젝트 디렉토리로 이동
cd /Users/admin/new_project/codeb-server

# 간단한 웹앱 배포 (자동 도메인)
./scripts/automation/coolify-auto-deploy.sh myapp
# → 결과: http://myapp.one-q.kr

# SSL 포함 배포
./scripts/automation/coolify-auto-deploy.sh --ssl myapp
# → 결과: https://myapp.one-q.kr
```

### Git 저장소 배포
```bash
# React/Vue 앱
./scripts/automation/coolify-auto-deploy.sh \
  -t git -r https://github.com/user/frontend \
  -d app.one-q.kr --ssl frontend

# Node.js API
./scripts/automation/coolify-auto-deploy.sh \
  -t git -r https://github.com/user/api \
  -d api.one-q.kr -p 3000 --ssl backend
```

### 환경별 배포
```bash
# 개발
./scripts/automation/coolify-auto-deploy.sh -d dev.app.one-q.kr dev-app

# 스테이징  
./scripts/automation/coolify-auto-deploy.sh -d staging.app.one-q.kr --ssl staging-app

# 프로덕션
./scripts/automation/coolify-auto-deploy.sh -d app.one-q.kr --ssl prod-app
```

## 🛠️ 관리 명령어

### DNS 관리 (서버에서)
```bash
# 서버 접속
ssh root@141.164.60.51

# DNS 존 목록
/opt/coolify-automation/scripts/dns-manager.sh list-zones

# A 레코드 추가
/opt/coolify-automation/scripts/dns-manager.sh create-record one-q.kr sub.one-q.kr A 141.164.60.51

# DNS 쿼리 테스트
/opt/coolify-automation/scripts/dns-manager.sh query sub.one-q.kr
```

### 상태 확인
```bash
# 통합 테스트
./scripts/automation/test-deployment.sh

# 개별 서비스 확인
curl -I http://141.164.60.51:8000  # Coolify
curl -H "X-API-Key: $PDNS_API_KEY" http://141.164.60.51:8081/api/v1/servers  # PowerDNS
```

### 로그 확인
```bash
# PowerDNS
ssh root@141.164.60.51 "journalctl -u pdns -f"

# Coolify
ssh root@141.164.60.51 "docker logs coolify -f"

# 프로젝트 로그
ssh root@141.164.60.51 "docker logs PROJECT_NAME -f"
```

## 🔧 환경 변수 (필수)

```bash
export PDNS_API_KEY="20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5"
export COOLIFY_API_TOKEN="your-coolify-token"

# 영구 설정
echo 'export PDNS_API_KEY="20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5"' >> ~/.zshrc
echo 'export COOLIFY_API_TOKEN="your-coolify-token"' >> ~/.zshrc
```

## 🚨 문제 해결

### 서비스 재시작
```bash
# PowerDNS
ssh root@141.164.60.51 "systemctl restart pdns"

# Coolify 전체
ssh root@141.164.60.51 "docker restart coolify coolify-db coolify-redis"
```

### DNS 문제
```bash
# DNS 전파 확인
dig @8.8.8.8 your-domain.com
dig @141.164.60.51 your-domain.com

# 로컬 DNS 캐시 플러시
sudo dscacheutil -flushcache
```

## 📱 Coolify 웹 접속

- **URL**: http://141.164.60.51:8000
- **API 토큰 생성**: Settings → API Tokens

## 🌐 사용 가능한 도메인

- **one-q.kr**
- **one-q.xyz**

---

**💡 팁**: 명령어 실행 전에 `export` 변수들이 설정되어 있는지 확인하세요!