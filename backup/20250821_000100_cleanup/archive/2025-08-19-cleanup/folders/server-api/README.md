# 🚀 Coolify + PowerDNS 완전 자동 배포 시스템

Coolify와 PowerDNS를 활용한 완전 자동화 프로젝트 배포 시스템입니다.

## 📋 기능

- ✅ Coolify 프로젝트 자동 생성
- ✅ PowerDNS 도메인 자동 연결
- ✅ 데이터베이스 자동 생성 (PostgreSQL, MySQL, Redis, MongoDB)
- ✅ 환경변수 자동 설정
- ✅ Git 저장소 또는 Docker Compose 배포
- ✅ 로컬 명령줄에서 한 번에 배포

## 🔧 설치

### 서버 설정 (141.164.60.51)

```bash
# 서버에 SSH 접속
ssh root@141.164.60.51

# 파일 업로드
cd /root
mkdir -p server-api
cd server-api

# 서버 파일 복사
# coolify-deployment-server.js 파일 업로드

# 의존성 설치
npm install express axios uuid

# PM2 설치 (선택사항)
npm install -g pm2

# 서버 시작
node coolify-deployment-server.js
# 또는 PM2 사용
pm2 start coolify-deployment-server.js --name deploy-server
```

### 로컬 설정

```bash
# 프로젝트 디렉토리로 이동
cd /Users/admin/new_project/codeb-server/server-api

# 의존성 설치
npm install

# 실행 권한 부여
chmod +x deploy-cli.js
```

## 🚀 사용법

### 1. 간단한 배포 (한 줄 명령)

```bash
# 기본 프로젝트 배포
./deploy-cli.js --name myapp

# Git 저장소와 함께 배포
./deploy-cli.js --name myapp --git https://github.com/user/repo

# 데이터베이스와 함께 배포
./deploy-cli.js --name myapp --db postgresql --db redis

# 환경변수 포함 배포
./deploy-cli.js --name myapp --db postgresql -e NODE_ENV=production -e API_KEY=secret

# 모든 옵션 사용
./deploy-cli.js \
  --name myapp \
  --git https://github.com/user/repo \
  --branch main \
  --domain myapp.one-q.xyz \
  --port 3000 \
  --db postgresql:maindb \
  --db redis:cache \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://user:pass@db:5432/myapp
```

### 2. 설정 파일 사용

`deploy.json` 파일 생성:

```json
{
  "projectName": "myapp",
  "domain": "myapp.one-q.xyz",
  "gitRepository": "https://github.com/user/repo",
  "gitBranch": "main",
  "databases": [
    { "type": "postgresql", "name": "db" },
    { "type": "redis", "name": "cache" }
  ],
  "environmentVariables": [
    { "key": "NODE_ENV", "value": "production" },
    { "key": "API_KEY", "value": "your-secret-key" }
  ]
}
```

배포 실행:

```bash
./deploy-cli.js --config deploy.json
```

### 3. 대화형 모드

```bash
./deploy-cli.js --interactive
```

### 4. Docker Compose 배포

```bash
# Docker Compose 파일 사용
./deploy-cli.js --name myapp --compose docker-compose.yml
```

## 📦 데이터베이스 옵션

지원되는 데이터베이스:
- `postgresql` - PostgreSQL 데이터베이스
- `mysql` - MySQL 데이터베이스  
- `redis` - Redis 캐시
- `mongodb` - MongoDB NoSQL 데이터베이스

데이터베이스 이름 지정:
```bash
--db postgresql:maindb  # PostgreSQL을 'maindb'라는 이름으로 생성
--db redis:cache       # Redis를 'cache'라는 이름으로 생성
```

## 🔌 API 엔드포인트

서버 API는 다음 엔드포인트를 제공합니다:

- `GET /api/health` - 서버 상태 확인
- `POST /api/deploy/complete` - 완전 통합 배포
- `GET /api/projects` - 프로젝트 목록 조회

## 📝 배포 결과

배포가 성공하면 다음 정보를 받게 됩니다:

```
✅ Deployment Successful!

Project Details:
  📦 Name: myapp
  🌐 URL: https://myapp.one-q.xyz
  📊 Dashboard: http://141.164.60.51:8000/project/uuid

Databases:
  💾 db (postgresql): deployed
     User: appuser
     Pass: generated-password
     DB: appdb
  💾 cache (redis): deployed
     Pass: generated-password

Deployment ID: xxxx-xxxx-xxxx-xxxx
```

## 🔍 문제 해결

### 서버 연결 실패
```bash
# 서버 상태 확인
curl http://141.164.60.51:3005/api/health
```

### DNS 전파 대기
DNS 레코드가 전파되는데 1-5분 정도 걸릴 수 있습니다.

### Coolify 대시보드 확인
http://141.164.60.51:8000 에서 생성된 프로젝트를 확인할 수 있습니다.

## 🛠️ 고급 사용법

### 환경별 설정

```bash
# 개발 환경
./deploy-cli.js --config deploy.dev.json

# 스테이징 환경  
./deploy-cli.js --config deploy.staging.json

# 프로덕션 환경
./deploy-cli.js --config deploy.prod.json
```

### CI/CD 통합

GitHub Actions, GitLab CI 등에서 사용:

```yaml
- name: Deploy to Coolify
  run: |
    npx deploy-cli \
      --name ${{ github.event.repository.name }} \
      --git ${{ github.event.repository.clone_url }} \
      --branch ${{ github.ref_name }}
```

## 📞 지원

문제가 있으시면 이슈를 생성하거나 관리자에게 문의하세요.

---

Made with ❤️ by Claude Code Team