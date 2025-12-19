# CodeB Server API 문서

> **Base URL**: http://141.164.60.51:3008  
> **Content-Type**: application/json

## 📋 목차

1. [프로젝트 관리](#프로젝트-관리)
2. [컨테이너 관리](#컨테이너-관리)
3. [환경변수 관리](#환경변수-관리)
4. [도메인 관리](#도메인-관리)

---

## 프로젝트 관리

### 프로젝트 목록 조회
```http
GET /api/projects
```

**응답 예시:**
```json
{
  "success": true,
  "projects": [
    {
      "id": "uuid",
      "name": "video-platform",
      "template": "nextjs",
      "appPort": 4002,
      "domain": "https://video-platform.codeb.one-q.xyz",
      "gitUrl": "https://github.com/dungeun/video_platform.git",
      "status": "Running",
      "containers": [...]
    }
  ]
}
```

### 프로젝트 생성
```http
POST /api/projects
```

**요청 본문:**
```json
{
  "name": "my-app",
  "template": "nextjs",
  "gitUrl": "https://github.com/username/repo.git",
  "enablePostgres": true,
  "enableRedis": true
}
```

**템플릿 옵션:**
- `nextjs` - Next.js 애플리케이션
- `nodejs` - Node.js 서버
- `python` - Python/Django/Flask
- `static` - 정적 웹사이트

**응답:**
```json
{
  "success": true,
  "project": {
    "id": "uuid",
    "name": "my-app",
    "appPort": 4003,
    "domain": "https://my-app.codeb.one-q.xyz"
  }
}
```

### 프로젝트 상세 조회
```http
GET /api/projects/:name
```

### 프로젝트 시작
```http
POST /api/projects/:name/start
```

### 프로젝트 중지
```http
POST /api/projects/:name/stop
```

### 프로젝트 재시작
```http
POST /api/projects/:name/restart
```

### 프로젝트 삭제
```http
DELETE /api/projects/:name
```

---

## 컨테이너 관리

### 컨테이너 로그 조회
```http
GET /api/projects/:name/logs
```

**쿼리 파라미터:**
- `container` - app, postgres, redis (기본: app)
- `lines` - 로그 줄 수 (기본: 100)

### 컨테이너 명령 실행
```http
POST /api/projects/:name/exec
```

**요청 본문:**
```json
{
  "container": "app",
  "command": "npm run build"
}
```

---

## 환경변수 관리

### 환경변수 조회
```http
GET /api/projects/:name/env
```

### 환경변수 설정
```http
POST /api/projects/:name/env
```

**요청 본문:**
```json
{
  "variables": {
    "API_KEY": "secret123",
    "DEBUG": "true"
  }
}
```

### 자동 생성되는 환경변수
- `DATABASE_URL` - PostgreSQL 연결 문자열
- `REDIS_URL` - Redis 연결 문자열
- `NODE_ENV` - production/development
- `PORT` - 애플리케이션 포트
- `DOMAIN` - 프로젝트 도메인

---

## 도메인 관리

### 도메인 정보 조회
```http
GET /api/projects/:name/domain
```

### SSL 인증서 상태
```http
GET /api/projects/:name/ssl
```

---

## 배포 프로세스

### Git 저장소에서 배포
```http
POST /api/projects/:name/deploy
```

**요청 본문:**
```json
{
  "gitUrl": "https://github.com/username/repo.git",
  "branch": "main",
  "buildCommand": "npm run build",
  "startCommand": "npm start"
}
```

### 배포 상태 확인
```http
GET /api/projects/:name/deploy/status
```

---

## 오류 코드

| 코드 | 설명 |
|------|------|
| 400 | 잘못된 요청 |
| 404 | 프로젝트를 찾을 수 없음 |
| 409 | 프로젝트가 이미 존재함 |
| 500 | 서버 오류 |

---

## 사용 예시

### 1. Next.js 프로젝트 배포
```bash
# 프로젝트 생성
curl -X POST http://141.164.60.51:3008/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-nextjs-app",
    "template": "nextjs",
    "gitUrl": "https://github.com/vercel/next-learn-starter.git"
  }'

# 프로젝트 시작
curl -X POST http://141.164.60.51:3008/api/projects/my-nextjs-app/start

# 로그 확인
curl http://141.164.60.51:3008/api/projects/my-nextjs-app/logs
```

### 2. Prisma 데이터베이스 설정
```bash
# Prisma 마이그레이션 실행
curl -X POST http://141.164.60.51:3008/api/projects/my-app/exec \
  -H "Content-Type: application/json" \
  -d '{
    "container": "app",
    "command": "npx prisma db push"
  }'
```

### 3. 환경변수 설정
```bash
curl -X POST http://141.164.60.51:3008/api/projects/my-app/env \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {
      "JWT_SECRET": "your-secret-key",
      "NEXTAUTH_URL": "https://my-app.codeb.one-q.xyz"
    }
  }'
```