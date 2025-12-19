# CodeB API Server v2

Coolify/Vercel 스타일의 프로젝트 관리 및 배포 오케스트레이션 API

## 📋 개요

CodeB API Server v2는 Node.js 프로젝트를 위한 완전 자동화된 배포 및 관리 시스템입니다.

**핵심 기능**:
- ✅ 자동 포트 할당 (충돌 방지)
- ✅ Podman 기반 DB/Redis 자동 프로비저닝
- ✅ PM2를 통한 애플리케이션 프로세스 관리
- ✅ Git 기반 자동 배포
- ✅ 헬스체크 및 모니터링
- ✅ PowerDNS 연동 (진행 중)

## 🏗️ 아키텍처

```
CodeB API Server (포트 3020)
    ↓
포트 관리 시스템 (자동 할당)
    ↓
Podman (DB/Redis) + PM2 (App)
    ↓
개별 프로젝트 환경
```

## 📁 디렉토리 구조

```
api-v2/
├── server.js              # 메인 서버
├── config.js              # 설정 (포트 범위, 경로)
├── routes/
│   ├── projects.js        # 프로젝트 CRUD
│   ├── deploy.js          # 배포 오케스트레이션
│   ├── ports.js           # 포트 관리
│   └── dns.js             # PowerDNS 연동
├── lib/
│   ├── ports.js           # 포트 할당 로직
│   ├── podman.js          # Podman 컨테이너 관리
│   └── pm2.js             # PM2 프로세스 관리
├── package.json
├── test-api.js            # API 테스트 스위트
└── README.md
```

## 🚀 설치 및 실행

### 1. 의존성 설치
```bash
cd api-v2
npm install
```

### 2. 서버 실행
```bash
npm start
```

### 3. 테스트
```bash
npm test
```

## 📚 API 엔드포인트

### 프로젝트 관리

**프로젝트 목록 조회**
```bash
GET /projects
```

**프로젝트 생성**
```bash
POST /projects
Content-Type: application/json

{
  "name": "my-app",
  "type": "nodejs",
  "services": {
    "postgres": { "user": "dbuser" },
    "redis": {}
  }
}
```

**프로젝트 상세 조회**
```bash
GET /projects/:name
```

**프로젝트 삭제**
```bash
DELETE /projects/:name
```

**프로젝트 상태 확인**
```bash
GET /projects/:name/status
```

### 배포

**프로젝트 배포**
```bash
POST /projects/:name/deploy
Content-Type: application/json

{
  "gitUrl": "https://github.com/user/repo.git",
  "branch": "main",
  "buildCommand": "npm run build",
  "startCommand": "npm start"
}
```

**프로젝트 시작**
```bash
POST /projects/:name/start
```

**프로젝트 중지**
```bash
POST /projects/:name/stop
```

**프로젝트 재시작**
```bash
POST /projects/:name/restart
```

**로그 조회**
```bash
GET /projects/:name/logs?lines=100&type=pm2
```

### 포트 관리

**포트 통계**
```bash
GET /ports/stats
```

**포트 할당**
```bash
POST /ports/allocate
Content-Type: application/json

{
  "projectName": "my-app",
  "services": ["app", "postgres", "redis"]
}
```

**포트 사용 가능 여부 확인**
```bash
GET /ports/check/:port
```

### DNS (PowerDNS 연동)

**도메인 등록**
```bash
POST /dns/register
Content-Type: application/json

{
  "projectName": "my-app",
  "customDomain": "my-app.example.com"
}
```

**도메인 삭제**
```bash
DELETE /dns/:projectName
```

**도메인 조회**
```bash
GET /dns/:projectName
```

## 🔧 설정

### 포트 범위 (config.js)
```javascript
ports: {
  app: { start: 3000, max: 1000 },      // 3000-3999
  postgres: { start: 5432, max: 100 },  // 5432-5531
  mysql: { start: 3306, max: 100 },     // 3306-3405
  redis: { start: 6379, max: 100 }      // 6379-6478
}
```

### 프로젝트 경로
```javascript
paths: {
  projects: '/opt/projects',
  backups: '/opt/codeb-backups',
  registry: '/opt/codeb/registry.json'
}
```

## 📊 사용 예시

### 신규 프로젝트 생성 및 배포

```bash
# 1. 프로젝트 생성
curl -X POST http://localhost:3020/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-blog",
    "services": {
      "postgres": {},
      "redis": {}
    }
  }'

# 2. 배포
curl -X POST http://localhost:3020/projects/my-blog/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "gitUrl": "https://github.com/user/my-blog.git",
    "branch": "main"
  }'

# 3. 상태 확인
curl http://localhost:3020/projects/my-blog/status
```

## 🔐 보안 고려사항

- [ ] API 인증 (JWT 또는 API Key)
- [ ] 환경변수 암호화
- [ ] DB 비밀번호 자동 생성 (32자 랜덤) ✅
- [ ] 포트 방화벽 규칙
- [ ] 로그 민감 정보 필터링

## 🗺️ 로드맵

### v2.0 (현재)
- ✅ 기본 프로젝트 관리
- ✅ 자동 포트 할당
- ✅ Podman + PM2 통합
- ✅ 배포 오케스트레이션

### v2.1 (다음)
- [ ] PowerDNS API 완전 통합
- [ ] API 인증 시스템
- [ ] 배포 히스토리 및 롤백
- [ ] 프로젝트 템플릿 시스템

### v2.2 (미래)
- [ ] 웹 UI (선택 사항)
- [ ] 실시간 로그 스트리밍
- [ ] 메트릭 수집 및 알림
- [ ] 멀티 서버 지원

## 📝 참고

- 전체 아키텍처: [SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md)
- CLI 도구: [codeb-cli](../codeb-cli/)
- 기존 API: [simple-api-server.js](../simple-api-server.js)
