# CodeB 프로젝트 배포 매뉴얼
## 로컬 → 원격 서버 (141.164.60.51) Podman 배포 가이드

---

## 📋 목차
1. [사전 준비사항](#사전-준비사항)
2. [로컬 프로젝트 준비](#로컬-프로젝트-준비)
3. [Docker 이미지 빌드](#docker-이미지-빌드)
4. [원격 서버로 푸시](#원격-서버로-푸시)
5. [Podman 컨테이너 배포](#podman-컨테이너-배포)
6. [DNS 및 도메인 설정](#dns-및-도메인-설정)
7. [검증 및 모니터링](#검증-및-모니터링)

---

## 1. 사전 준비사항

### 로컬 환경
```bash
# Docker 설치 확인
docker --version

# 프로젝트 디렉토리
cd /Users/admin/new_project/codeb-server
```

### 원격 서버 환경
```bash
# SSH 접속
ssh root@141.164.60.51

# Podman 설치 확인
podman --version

# 필수 서비스 확인
systemctl status powerdns
systemctl status caddy
```

---

## 2. 로컬 프로젝트 준비

### 2.1 프로젝트 구조 확인
```
codeb-server/
├── src/
│   ├── server.js
│   ├── config.js
│   └── routes/
├── web-ui/
│   └── index.html
├── package.json
├── package-lock.json
└── Dockerfile
```

### 2.2 Dockerfile 생성
```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# 의존성 설치
COPY package*.json ./
RUN npm ci --only=production

# 소스 코드 복사
COPY . .

# 포트 노출
EXPOSE 3000

# 실행 명령
CMD ["node", "src/server.js"]
```

### 2.3 .dockerignore 파일
```
node_modules
npm-debug.log
.git
.gitignore
.env.local
*.md
```

---

## 3. Docker 이미지 빌드

### 3.1 로컬에서 이미지 빌드
```bash
# 프로젝트 디렉토리에서
cd /Users/admin/new_project/codeb-server

# 이미지 빌드 (프로젝트명-버전 형식)
docker build -t codeb-server:1.0.0 .

# 빌드 확인
docker images | grep codeb-server
```

### 3.2 이미지 테스트 (옵션)
```bash
# 로컬에서 테스트 실행
docker run -p 3000:3000 codeb-server:1.0.0

# 테스트 접속
curl http://localhost:3000/api/status
```

---

## 4. 원격 서버로 푸시

### 방법 1: Docker Save & Load (권장)
```bash
# 로컬: 이미지를 tar 파일로 저장
docker save codeb-server:1.0.0 -o codeb-server-1.0.0.tar

# 로컬: SCP로 전송
scp codeb-server-1.0.0.tar root@141.164.60.51:/tmp/

# 원격: SSH 접속 후 이미지 로드
ssh root@141.164.60.51
cd /tmp
podman load -i codeb-server-1.0.0.tar

# 확인
podman images | grep codeb-server
```

### 방법 2: Registry 사용
```bash
# 로컬: Docker Hub에 푸시
docker tag codeb-server:1.0.0 yourusername/codeb-server:1.0.0
docker push yourusername/codeb-server:1.0.0

# 원격: Pull
ssh root@141.164.60.51
podman pull yourusername/codeb-server:1.0.0
```

### 방법 3: 빌드 파일 전송 후 원격 빌드
```bash
# 로컬: 소스 코드 압축
tar -czf codeb-server.tar.gz --exclude=node_modules .

# 로컬: 전송
scp codeb-server.tar.gz root@141.164.60.51:/opt/

# 원격: 압축 해제 및 빌드
ssh root@141.164.60.51
cd /opt
tar -xzf codeb-server.tar.gz -C codeb-server/
cd codeb-server
podman build -t codeb-server:1.0.0 .
```

---

## 5. Podman 컨테이너 배포

### 5.1 기본 배포
```bash
# 원격 서버에서
ssh root@141.164.60.51

# 컨테이너 실행 (자동 재시작 설정)
podman run -d \
  --name codeb-server \
  --restart always \
  -p 3000:3000 \
  -v /opt/codeb-data:/app/data \
  codeb-server:1.0.0

# 실행 확인
podman ps | grep codeb-server
podman logs codeb-server
```

### 5.2 고급 배포 (네트워크 및 볼륨 설정)
```bash
# Pod 생성 (여러 컨테이너 그룹화)
podman pod create \
  --name codeb-pod \
  -p 3000:3000 \
  -p 5432:5432 \
  -p 6379:6379

# PostgreSQL 컨테이너
podman run -d \
  --pod codeb-pod \
  --name codeb-postgres \
  -e POSTGRES_USER=codeb \
  -e POSTGRES_PASSWORD=codeb123 \
  -e POSTGRES_DB=codeb \
  -v /opt/codeb-postgres:/var/lib/postgresql/data \
  postgres:14-alpine

# Redis 컨테이너
podman run -d \
  --pod codeb-pod \
  --name codeb-redis \
  -v /opt/codeb-redis:/data \
  redis:7-alpine

# 애플리케이션 컨테이너
podman run -d \
  --pod codeb-pod \
  --name codeb-app \
  -e DATABASE_URL=postgresql://codeb:codeb123@127.0.0.1:5432/codeb \
  -e REDIS_URL=redis://127.0.0.1:6379 \
  -v /opt/codeb-data:/app/data \
  codeb-server:1.0.0
```

### 5.3 Systemd 서비스 등록 (자동 시작)
```bash
# Systemd 파일 생성
podman generate systemd --new --name codeb-server > /etc/systemd/system/codeb-server.service

# 서비스 활성화
systemctl daemon-reload
systemctl enable codeb-server.service
systemctl start codeb-server.service
systemctl status codeb-server.service
```

---

## 6. DNS 및 도메인 설정

### 6.1 PowerDNS API로 DNS 레코드 추가
```bash
# A 레코드 추가
curl -X PATCH http://localhost:8081/api/v1/servers/localhost/zones/one-q.xyz \
  -H "X-API-Key: changeme123" \
  -H "Content-Type: application/json" \
  -d '{
    "rrsets": [{
      "name": "codeb.one-q.xyz.",
      "type": "A",
      "changetype": "REPLACE",
      "records": [{
        "content": "141.164.60.51",
        "disabled": false
      }]
    }]
  }'
```

### 6.2 Caddy 리버스 프록시 설정
```bash
# /etc/caddy/Caddyfile 편집
cat >> /etc/caddy/Caddyfile << 'EOF'

codeb.one-q.xyz {
    reverse_proxy localhost:3000
}
EOF

# Caddy 재시작
systemctl reload caddy
```

---

## 7. 검증 및 모니터링

### 7.1 컨테이너 상태 확인
```bash
# 실행 중인 컨테이너
podman ps

# 컨테이너 로그
podman logs -f codeb-server

# 리소스 사용량
podman stats codeb-server
```

### 7.2 API 테스트
```bash
# 로컬 테스트
curl http://localhost:3000/api/status

# 도메인 테스트
curl https://codeb.one-q.xyz/api/status

# 헬스체크
curl https://codeb.one-q.xyz/api/health
```

### 7.3 문제 해결
```bash
# 컨테이너 재시작
podman restart codeb-server

# 컨테이너 삭제 후 재생성
podman stop codeb-server
podman rm codeb-server
podman run -d --name codeb-server --restart always -p 3000:3000 codeb-server:1.0.0

# 이미지 재빌드
podman rmi codeb-server:1.0.0
podman build -t codeb-server:1.0.0 .
```

---

## 📝 빠른 배포 스크립트

### deploy.sh (로컬에서 실행)
```bash
#!/bin/bash
PROJECT_NAME="codeb-server"
VERSION="1.0.0"
REMOTE_HOST="root@141.164.60.51"

echo "🚀 Starting deployment of $PROJECT_NAME v$VERSION"

# 1. 빌드
echo "📦 Building Docker image..."
docker build -t $PROJECT_NAME:$VERSION .

# 2. Save
echo "💾 Saving image..."
docker save $PROJECT_NAME:$VERSION -o $PROJECT_NAME-$VERSION.tar

# 3. 전송
echo "📤 Transferring to server..."
scp $PROJECT_NAME-$VERSION.tar $REMOTE_HOST:/tmp/

# 4. 원격 배포
echo "🔧 Deploying on server..."
ssh $REMOTE_HOST << EOF
  cd /tmp
  podman load -i $PROJECT_NAME-$VERSION.tar
  podman stop $PROJECT_NAME 2>/dev/null || true
  podman rm $PROJECT_NAME 2>/dev/null || true
  podman run -d \
    --name $PROJECT_NAME \
    --restart always \
    -p 3000:3000 \
    $PROJECT_NAME:$VERSION
  podman ps | grep $PROJECT_NAME
EOF

# 5. 정리
rm $PROJECT_NAME-$VERSION.tar
echo "✅ Deployment complete!"
```

### 사용법
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 🔍 자주 묻는 질문

### Q1: 포트가 이미 사용 중인 경우?
```bash
# 사용 중인 포트 확인
ss -tlnp | grep :3000

# 다른 포트로 실행
podman run -d --name codeb-server -p 3001:3000 codeb-server:1.0.0
```

### Q2: 컨테이너가 계속 재시작되는 경우?
```bash
# 로그 확인
podman logs codeb-server

# 재시작 정책 변경
podman update --restart=no codeb-server
```

### Q3: 이미지 크기를 줄이려면?
```dockerfile
# Multi-stage 빌드 사용
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
```

---

## 📞 지원 및 문의

- 서버 IP: 141.164.60.51
- 도메인: one-q.xyz
- PowerDNS API: http://141.164.60.51:8081
- 관리 페이지: https://codeb.one-q.xyz

---

*마지막 업데이트: 2025-09-24*