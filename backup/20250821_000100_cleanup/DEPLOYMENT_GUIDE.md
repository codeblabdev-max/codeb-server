# Git 배포 가이드

> GitHub/GitLab 저장소에서 CodeB 서버로 자동 배포

## 🚀 빠른 시작

```bash
# 1. 프로젝트 생성 및 배포
curl -X POST http://141.164.60.51:3008/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-app",
    "template": "nextjs",
    "gitUrl": "https://github.com/username/repo.git"
  }'

# 2. 접속
https://my-app.codeb.one-q.xyz
```

## 📋 지원 프레임워크

### Next.js
```json
{
  "template": "nextjs",
  "buildCommand": "npm run build",
  "startCommand": "npm start"
}
```

### Node.js/Express
```json
{
  "template": "nodejs",
  "buildCommand": "npm install",
  "startCommand": "node server.js"
}
```

### Python/Django
```json
{
  "template": "python",
  "buildCommand": "pip install -r requirements.txt",
  "startCommand": "python manage.py runserver 0.0.0.0:3000"
}
```

### 정적 웹사이트
```json
{
  "template": "static",
  "buildCommand": "npm run build",
  "startCommand": "npx serve -s build -p 3000"
}
```

## 🔧 배포 프로세스

### 1. 자동 감지 배포

CodeB는 프로젝트 구조를 자동으로 감지합니다:

```bash
# package.json이 있는 경우
- Next.js: next.config.js 확인
- React: react-scripts 확인
- Vue: vue.config.js 확인

# requirements.txt가 있는 경우
- Django: manage.py 확인
- Flask: app.py 확인

# 자동 빌드 명령
- npm install && npm run build
- pip install -r requirements.txt
```

### 2. 수동 설정 배포

#### package.json 설정
```json
{
  "scripts": {
    "build": "next build",
    "start": "next start",
    "dev": "next dev"
  },
  "codeb": {
    "buildCommand": "npm run build",
    "startCommand": "npm start",
    "port": 3000
  }
}
```

#### codeb.json 설정
```json
{
  "name": "my-app",
  "template": "nextjs",
  "build": "npm run build",
  "start": "npm start",
  "env": {
    "NODE_ENV": "production"
  },
  "postgres": true,
  "redis": true
}
```

## 📊 데이터베이스 설정

### Prisma (자동 설정)
```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

배포 시 자동으로:
1. `npx prisma generate` 실행
2. `npx prisma db push` 실행
3. DATABASE_URL 환경변수 설정

### 마이그레이션
```bash
# API로 실행
curl -X POST http://141.164.60.51:3008/api/projects/my-app/exec \
  -H "Content-Type: application/json" \
  -d '{
    "container": "app",
    "command": "npx prisma migrate deploy"
  }'
```

## 🔐 환경변수

### 자동 제공 변수
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
REDIS_URL=redis://localhost:6379
NODE_ENV=production
PORT=3000
DOMAIN=https://my-app.codeb.one-q.xyz
```

### 커스텀 변수 설정
```bash
# .env.production 파일
NEXT_PUBLIC_API_URL=https://api.example.com
JWT_SECRET=your-secret-key
NEXTAUTH_URL=https://my-app.codeb.one-q.xyz
```

## 🎯 실전 예제

### 1. Next.js + Prisma 프로젝트

**프로젝트 구조:**
```
my-nextjs-app/
├── prisma/
│   └── schema.prisma
├── pages/
├── package.json
└── next.config.js
```

**배포:**
```bash
# CLI 사용
codeb create my-nextjs-app --template nextjs \
  --git https://github.com/user/my-nextjs-app.git \
  --postgres

# 또는 API 사용
curl -X POST http://141.164.60.51:3008/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-nextjs-app",
    "template": "nextjs",
    "gitUrl": "https://github.com/user/my-nextjs-app.git",
    "enablePostgres": true
  }'
```

### 2. Node.js API 서버

**프로젝트 구조:**
```
api-server/
├── src/
│   └── index.js
├── package.json
└── .env.example
```

**package.json:**
```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  }
}
```

**배포:**
```bash
codeb create api-server --template nodejs \
  --git https://github.com/user/api-server.git \
  --postgres --redis
```

### 3. Python Django 프로젝트

**requirements.txt:**
```
Django==4.2.0
psycopg2-binary==2.9.6
redis==4.5.4
gunicorn==20.1.0
```

**배포:**
```bash
codeb create django-app --template python \
  --git https://github.com/user/django-app.git \
  --postgres --redis
```

## 🔄 지속적 배포 (CI/CD)

### GitHub Actions
```yaml
name: Deploy to CodeB

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to CodeB
        run: |
          curl -X POST http://141.164.60.51:3008/api/projects/my-app/deploy \
            -H "Content-Type: application/json" \
            -d '{
              "gitUrl": "${{ github.server_url }}/${{ github.repository }}.git",
              "branch": "main"
            }'
```

### Webhook 설정
```bash
# GitHub Webhook URL
http://141.164.60.51:3008/webhook/github/my-app

# 자동 배포 트리거:
- push to main
- release published
```

## 🐳 컨테이너 구성

### 생성되는 컨테이너
```
my-app/
├── my-app-app (포트 3000)     # 애플리케이션
├── my-app-postgres (포트 5432) # PostgreSQL
└── my-app-redis (포트 6379)    # Redis
```

### 네트워크 구성
- 모든 컨테이너는 host 네트워크 사용
- 내부 통신은 localhost 사용
- 외부 접근은 Caddy 프록시 통해

## 📝 배포 체크리스트

- [ ] Git 저장소 public 또는 토큰 설정
- [ ] package.json에 build/start 스크립트 정의
- [ ] 환경변수 필요 시 .env.example 파일 생성
- [ ] Prisma 사용 시 schema.prisma 파일 포함
- [ ] 포트는 3000번 사용 (또는 PORT 환경변수)
- [ ] 정적 파일은 public/ 폴더에 배치

## 🔥 트러블슈팅

### 빌드 실패
```bash
# 로그 확인
codeb logs my-app --container app

# 수동 빌드 테스트
codeb exec my-app "npm run build"
```

### 데이터베이스 연결 실패
```bash
# DATABASE_URL 확인
codeb env my-app

# Prisma 재설정
codeb exec my-app "npx prisma db push --force-reset"
```

### 포트 충돌
```bash
# 포트 확인
ssh root@141.164.60.51 "netstat -tlnp | grep 3000"

# 다른 포트 사용
codeb env my-app set PORT=3001
```