# 🚀 Commerce 프로젝트 서버 배포 가이드

## 📌 현재 상황
- ✅ 로컬 개발 완료
- ✅ GitHub 저장소 동기화 완료 (https://github.com/dungeun/e-market.git)
- ⚠️ 서버 API 접근은 가능하나 프로젝트 생성 권한 문제 발생
- ⚠️ SSH 인증 정보 없음

## 🎯 서버에서 직접 실행해야 할 명령어

### 방법 1: CLI v2를 사용한 배포 (권장)
```bash
# 서버(141.164.60.51)에 SSH로 접속 후
cd ~/codeb-projects

# 1. 프로젝트 생성 (최초 1회만)
sudo mkdir -p /mnt/blockstorage/projects/commerce/app
sudo chown -R $(whoami):$(whoami) /mnt/blockstorage/projects/commerce
./codeb-cli-v2.sh create commerce nodejs

# 2. 코드 배포
./codeb-cli-v2.sh deploy commerce https://github.com/dungeun/e-market.git main

# 3. 상태 확인
./codeb-cli-v2.sh status commerce
./codeb-cli-v2.sh logs commerce app 50
```

### 방법 2: 수동 Podman 배포
```bash
# 서버에서 직접 실행
cd ~
git clone https://github.com/dungeun/e-market.git commerce-app
cd commerce-app

# Podman Pod 생성
podman pod create --name commerce-pod -p 4001:3000

# PostgreSQL 컨테이너
podman run -d \
  --pod commerce-pod \
  --name commerce-postgres \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=admin123 \
  -e POSTGRES_DB=commerce_plugin \
  postgres:15-alpine

# Redis 컨테이너  
podman run -d \
  --pod commerce-pod \
  --name commerce-redis \
  redis:7-alpine

# 데이터베이스 초기화
sleep 10
podman exec commerce-postgres psql -U admin -d commerce_plugin < database/schema.sql
podman exec commerce-postgres psql -U admin -d commerce_plugin < database/sample-data.sql

# Next.js 애플리케이션 컨테이너
podman run -d \
  --pod commerce-pod \
  --name commerce-app \
  -v $(pwd):/app \
  -w /app \
  node:20-alpine \
  sh -c "npm install --legacy-peer-deps && npm run build && npm run start"

# 상태 확인
podman pod ps
podman ps --pod
```

### 방법 3: API 서버 직접 사용
```bash
# 서버에서 codeb-api-server.js가 실행중인 경우
curl -X POST "http://localhost:3008/api/projects" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "commerce",
    "type": "nodejs",
    "port": 4001
  }'

# 배포
curl -X POST "http://localhost:3008/api/projects/commerce/deploy" \
  -H "Content-Type: application/json" \
  -d '{
    "gitRepo": "https://github.com/dungeun/e-market.git",
    "branch": "main"
  }'
```

## 📊 배포 후 확인사항

### 접속 URL
- **로컬 접속**: http://141.164.60.51:4001
- **도메인 접속**: https://commerce.codeb.one-q.xyz
- **관리자**: https://commerce.codeb.one-q.xyz/admin

### 헬스체크
```bash
curl http://141.164.60.51:4001/api/health
```

### 로그 확인
```bash
# CLI를 통한 로그 확인
./codeb-cli-v2.sh tail commerce app

# Podman 직접 확인
podman logs -f commerce-app
```

## 🔧 문제 해결

### 스토리지 권한 문제
```bash
sudo mkdir -p /mnt/blockstorage/projects/commerce
sudo chown -R $(whoami):$(whoami) /mnt/blockstorage/projects/commerce
```

### 포트 충돌
```bash
# 사용중인 포트 확인
netstat -tlnp | grep :4001

# 필요시 기존 컨테이너 정지
podman pod stop commerce-pod
podman pod rm commerce-pod
```

### 데이터베이스 연결 실패
```bash
# PostgreSQL 재시작
podman restart commerce-postgres

# 연결 테스트
podman exec commerce-postgres psql -U admin -d commerce_plugin -c "SELECT 1;"
```

## 📝 참고사항

- 서버와 로컬 모두 동일한 Podman 환경 사용
- PostgreSQL 15 + Redis 7 구성
- PM2를 통한 프로세스 관리
- Caddy를 통한 자동 SSL 인증서 발급

## 🚨 중요

서버에 **직접 SSH 접속**하여 위의 명령어들을 실행해야 합니다.
로컬에서는 API 접근은 가능하지만 파일시스템 권한 문제로 인해 프로젝트 생성이 불가능합니다.