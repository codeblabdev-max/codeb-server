# 🚨 도메인 연결 문제 해결 가이드

**"도메인은 생성됐는데 접속이 안 돼요!" 완벽 해결**

---

## 🔍 문제 진단 체크리스트

### 1단계: DNS 레코드 확인
```bash
# DNS 레코드가 실제로 생성되었는지 확인
dig @141.164.60.51 your-domain.one-q.kr

# 결과 예시 (정상):
# your-domain.one-q.kr.  3600  IN  A  141.164.60.51

# 결과가 없다면 → DNS 레코드 생성 실패
```

### 2단계: Docker 컨테이너 확인
```bash
# 컨테이너가 실행 중인지 확인
ssh root@141.164.60.51 "docker ps | grep your-project-name"

# 결과가 없다면 → 컨테이너 실행 안 됨
# Exited 상태라면 → 컨테이너 크래시
```

### 3단계: 포트 연결 확인
```bash
# Traefik 라우팅 확인
ssh root@141.164.60.51 "docker ps | grep traefik"

# 포트 바인딩 확인
ssh root@141.164.60.51 "netstat -tlnp | grep -E '(80|443|8000)'"
```

---

## 🛠️ 일반적인 문제와 해결법

### 문제 1: DNS 레코드는 있는데 도메인 접속 안 됨

#### 증상
```bash
dig @141.164.60.51 myapp.one-q.kr  # ✅ 결과 있음
curl http://myapp.one-q.kr         # ❌ 접속 안 됨
```

#### 원인 1: 컨테이너가 실행 안 됨
```bash
# 진단
ssh root@141.164.60.51 "docker ps --all | grep myapp"

# 해결: 컨테이너 수동 시작
ssh root@141.164.60.51 "docker start myapp"

# 또는 docker-compose로 재시작
ssh root@141.164.60.51 "cd /tmp/myapp && docker-compose up -d"
```

#### 원인 2: Traefik 라우팅 문제
```bash
# Traefik 설정 확인
ssh root@141.164.60.51 "docker inspect myapp | grep -A 10 traefik"

# 해결: Traefik 레이블 수동 추가
ssh root@141.164.60.51 << 'EOF'
docker stop myapp
docker rm myapp
docker run -d \
  --name myapp \
  --label "traefik.enable=true" \
  --label "traefik.http.routers.myapp.rule=Host(\`myapp.one-q.kr\`)" \
  --label "traefik.http.services.myapp.loadbalancer.server.port=80" \
  --network coolify \
  nginx:alpine
EOF
```

#### 원인 3: 네트워크 연결 문제
```bash
# Docker 네트워크 확인
ssh root@141.164.60.51 "docker network ls"

# 해결: coolify 네트워크에 연결
ssh root@141.164.60.51 "docker network connect coolify myapp"
```

---

### 문제 2: 컨테이너는 실행 중인데 접속 안 됨

#### 증상
```bash
ssh root@141.164.60.51 "docker ps | grep myapp"  # ✅ 실행 중
curl http://myapp.one-q.kr                       # ❌ 접속 안 됨
```

#### 원인 1: 잘못된 포트 매핑
```bash
# 진단: 컨테이너 포트 확인
ssh root@141.164.60.51 "docker port myapp"

# 해결: 올바른 포트로 재시작
ssh root@141.164.60.51 << 'EOF'
docker stop myapp
docker rm myapp
docker run -d \
  --name myapp \
  -p 80 \
  --label "traefik.enable=true" \
  --label "traefik.http.routers.myapp.rule=Host(\`myapp.one-q.kr\`)" \
  --label "traefik.http.services.myapp.loadbalancer.server.port=80" \
  --network coolify \
  nginx:alpine
EOF
```

#### 원인 2: 방화벽 문제
```bash
# 방화벽 규칙 확인
ssh root@141.164.60.51 "ufw status | grep -E '(80|443)'"

# 해결: 포트 열기
ssh root@141.164.60.51 "ufw allow 80/tcp"
ssh root@141.164.60.51 "ufw allow 443/tcp"
ssh root@141.164.60.51 "ufw reload"
```

---

### 문제 3: DNS는 작동하는데 외부에서 접속 안 됨

#### 증상
```bash
dig @141.164.60.51 myapp.one-q.kr     # ✅ DNS 응답
dig @8.8.8.8 myapp.one-q.kr           # ❌ DNS 응답 없음
```

#### 원인: 네임서버 설정 문제
```bash
# 도메인 등록업체에서 네임서버 변경 필요
# one-q.kr의 네임서버를:
ns1.one-q.kr → 141.164.60.51
ns2.one-q.kr → 141.164.60.51

# 또는 A 레코드 직접 추가
myapp.one-q.kr → 141.164.60.51
```

---

## 🔧 수동으로 프로젝트 연결하기

### 방법 1: Coolify 웹 UI 사용

1. **Coolify 접속**: http://141.164.60.51:8000
2. **New Project** 클릭
3. **Docker Compose** 선택
4. **설정 입력**:
   - Name: `myapp`
   - Domain: `myapp.one-q.kr`
5. **Docker Compose 내용**:
```yaml
version: '3.8'
services:
  app:
    image: nginx:alpine
    ports:
      - "80"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.myapp.rule=Host(`myapp.one-q.kr`)"
```
6. **Deploy** 클릭

### 방법 2: 수동 Docker 실행

```bash
# SSH 접속
ssh root@141.164.60.51

# 1. DNS 레코드 생성
/opt/coolify-automation/scripts/dns-manager.sh create-record one-q.kr myapp.one-q.kr A 141.164.60.51

# 2. Docker 컨테이너 실행
docker run -d \
  --name myapp \
  --label "traefik.enable=true" \
  --label "traefik.http.routers.myapp.rule=Host(\`myapp.one-q.kr\`)" \
  --label "traefik.http.services.myapp.loadbalancer.server.port=80" \
  --network coolify \
  -p 80 \
  nginx:alpine

# 3. 확인
docker ps | grep myapp
curl -H "Host: myapp.one-q.kr" http://localhost
```

### 방법 3: Docker Compose 파일 직접 생성

```bash
# SSH 접속
ssh root@141.164.60.51

# 프로젝트 디렉토리 생성
mkdir -p /app/myapp
cd /app/myapp

# docker-compose.yml 생성
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  app:
    image: nginx:alpine
    container_name: myapp
    restart: unless-stopped
    networks:
      - coolify
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.myapp.rule=Host(`myapp.one-q.kr`)"
      - "traefik.http.services.myapp.loadbalancer.server.port=80"

networks:
  coolify:
    external: true
EOF

# 실행
docker-compose up -d

# 확인
docker-compose ps
```

---

## 🔍 진단 명령어 모음

### DNS 진단
```bash
# DNS 레코드 확인 (PowerDNS)
dig @141.164.60.51 myapp.one-q.kr

# DNS 레코드 확인 (공용 DNS)
dig @8.8.8.8 myapp.one-q.kr

# DNS 전파 확인
nslookup myapp.one-q.kr

# PowerDNS API로 확인
curl -H "X-API-Key: $PDNS_API_KEY" \
  http://141.164.60.51:8081/api/v1/servers/localhost/zones/one-q.kr | \
  jq '.rrsets[] | select(.name=="myapp.one-q.kr.")'
```

### Docker 진단
```bash
# 컨테이너 상태
ssh root@141.164.60.51 "docker ps -a | grep myapp"

# 컨테이너 로그
ssh root@141.164.60.51 "docker logs myapp --tail 50"

# 컨테이너 설정 확인
ssh root@141.164.60.51 "docker inspect myapp"

# 네트워크 확인
ssh root@141.164.60.51 "docker network inspect coolify"
```

### Traefik 진단
```bash
# Traefik 상태
ssh root@141.164.60.51 "docker ps | grep traefik"

# Traefik 로그
ssh root@141.164.60.51 "docker logs traefik --tail 50"

# Traefik 라우팅 확인
ssh root@141.164.60.51 "curl http://localhost:8080/api/http/routers"
```

### 네트워크 진단
```bash
# 포트 확인
ssh root@141.164.60.51 "netstat -tlnp | grep -E '(80|443|8000)'"

# 방화벽 확인
ssh root@141.164.60.51 "ufw status verbose"

# 연결 테스트
curl -I http://141.164.60.51
curl -H "Host: myapp.one-q.kr" http://141.164.60.51
```

---

## 🚑 긴급 복구 절차

### 전체 시스템 재시작
```bash
ssh root@141.164.60.51 << 'EOF'
# 1. PowerDNS 재시작
systemctl restart pdns

# 2. Docker 서비스 재시작
systemctl restart docker

# 3. Coolify 스택 재시작
cd /app/coolify
docker-compose down
docker-compose up -d

# 4. Traefik 재시작
docker restart traefik

# 5. 모든 앱 컨테이너 재시작
docker ps -q | xargs docker restart
EOF
```

### DNS 레코드 재생성
```bash
# 기존 레코드 삭제
ssh root@141.164.60.51 "/opt/coolify-automation/scripts/dns-manager.sh delete-record one-q.kr myapp.one-q.kr A"

# 새 레코드 생성
ssh root@141.164.60.51 "/opt/coolify-automation/scripts/dns-manager.sh create-record one-q.kr myapp.one-q.kr A 141.164.60.51"

# 확인
dig @141.164.60.51 myapp.one-q.kr
```

### 컨테이너 재배포
```bash
# 기존 컨테이너 제거
ssh root@141.164.60.51 "docker stop myapp && docker rm myapp"

# 새로 배포
./scripts/automation/coolify-auto-deploy.sh myapp
```

---

## 📋 체크리스트

도메인 연결 문제 해결 순서:

1. [ ] DNS 레코드 생성 확인 (`dig @141.164.60.51`)
2. [ ] Docker 컨테이너 실행 확인 (`docker ps`)
3. [ ] Traefik 라우팅 확인 (`docker inspect`)
4. [ ] 네트워크 연결 확인 (`docker network`)
5. [ ] 포트 바인딩 확인 (`docker port`)
6. [ ] 방화벽 규칙 확인 (`ufw status`)
7. [ ] DNS 전파 확인 (`dig @8.8.8.8`)
8. [ ] 로그 확인 (`docker logs`)

---

## 🎯 예방 조치

### 자동 배포 시 확인사항
```bash
# 배포 후 항상 확인
./scripts/automation/coolify-auto-deploy.sh myapp

# 1. DNS 확인
dig @141.164.60.51 myapp.one-q.kr

# 2. 컨테이너 확인
ssh root@141.164.60.51 "docker ps | grep myapp"

# 3. 접속 테스트
curl -I http://myapp.one-q.kr
```

### 모니터링 설정
```bash
# 상태 모니터링 스크립트
cat > check-domain.sh << 'EOF'
#!/bin/bash
DOMAIN="$1"
echo "=== DNS 확인 ==="
dig +short @141.164.60.51 $DOMAIN

echo "=== 컨테이너 확인 ==="
ssh root@141.164.60.51 "docker ps | grep ${DOMAIN%%.*}"

echo "=== HTTP 확인 ==="
curl -I http://$DOMAIN
EOF

chmod +x check-domain.sh
./check-domain.sh myapp.one-q.kr
```

---

**💡 팁**: 대부분의 문제는 Docker 컨테이너가 coolify 네트워크에 연결되지 않거나 Traefik 레이블이 없어서 발생합니다!

---

**작성일**: 2025-08-15  
**업데이트**: 지속적  
**담당**: Claude Code Team