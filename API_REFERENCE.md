# 📚 API 레퍼런스 - Coolify + PowerDNS 자동 배포 시스템

## 🌐 Base URL

```
http://141.164.60.51:3007/api
```

## 🔗 엔드포인트 목록

### 1. 헬스체크

```http
GET /api/health
```

**설명**: 시스템 상태 및 서비스 연결 상태 확인

**응답 예시**:
```json
{
  "status": "healthy",
  "timestamp": "2025-08-15T21:00:00.000Z",
  "services": {
    "api": true,
    "powerdns": true,
    "coolify": true
  },
  "version": "final-1.0"
}
```

### 2. 완전 통합 배포

```http
POST /api/deploy/complete
```

**설명**: Git 저장소를 완전한 웹 애플리케이션으로 배포

**Request Body**:
```json
{
  "projectName": "string (required)",
  "gitRepository": "string (optional)",
  "gitBranch": "string (optional, default: main)",
  "buildPack": "string (optional, default: nixpacks)",
  "port": "string (optional, default: 3000)",
  "generateDomain": "boolean (optional, default: true)",
  "customDomain": "string (optional)",
  "databases": [
    {
      "name": "string (required)",
      "type": "postgresql|mysql|redis|mongodb (required)"
    }
  ],
  "environmentVariables": [
    {
      "key": "string (required)",
      "value": "string (required)"
    }
  ]
}
```

**응답 예시**:
```json
{
  "success": true,
  "deploymentId": "uuid",
  "projectName": "my-app",
  "domain": "my-app.one-q.xyz",
  "url": "https://my-app.one-q.xyz",
  "coolify": {
    "projectUuid": "project-uuid",
    "applicationUuid": "app-uuid",
    "dashboardUrl": "http://141.164.60.51:8000/project/project-uuid"
  },
  "databases": [
    {
      "name": "main",
      "type": "postgresql",
      "uuid": "db-uuid",
      "status": "deployed",
      "credentials": {
        "type": "postgresql",
        "host": "my-app-main",
        "port": 5432,
        "user": "dbuser",
        "password": "generated-password",
        "database": "my_app_main"
      }
    }
  ],
  "deploymentLog": [
    {"step": "DNS", "status": "completed", "details": "DNS: my-app.one-q.xyz"},
    {"step": "Project", "status": "completed", "details": "Project UUID: ..."},
    {"step": "Application", "status": "completed", "details": "App UUID: ..."},
    {"step": "Environment Variables", "status": "completed", "details": "2 variables processed"},
    {"step": "Start Application", "status": "completed", "details": "Application started"}
  ],
  "results": {
    "dns": true,
    "project": true,
    "databases": [{"name": "main", "success": true}],
    "application": true,
    "envVars": true,
    "start": true
  },
  "deployedAt": "2025-08-15T21:00:00.000Z",
  "instructions": {
    "access": "Your application will be available at https://my-app.one-q.xyz in 1-2 minutes",
    "dashboard": "View in Coolify: http://141.164.60.51:8000/project/project-uuid",
    "dns": "DNS propagation may take up to 5 minutes"
  }
}
```

### 3. 프로젝트 목록 조회

```http
GET /api/projects
```

**설명**: 모든 Coolify 프로젝트 목록 조회

**응답 예시**:
```json
[
  {
    "id": 1,
    "uuid": "project-uuid",
    "name": "my-app",
    "description": "Auto-deployed: my-app"
  }
]
```

### 4. 프로젝트 삭제

```http
DELETE /api/projects/:uuid
```

**설명**: 프로젝트와 모든 관련 리소스 삭제 (애플리케이션, 데이터베이스 포함)

**Path Parameters**:
- `uuid`: 프로젝트 UUID

**응답 예시**:
```json
{
  "message": "Project {uuid} deleted successfully"
}
```

## 📋 요청/응답 상세

### 배포 요청 파라미터 상세

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|-------|------|
| `projectName` | string | ✅ | - | 프로젝트 이름 (도메인에 사용) |
| `gitRepository` | string | ❌ | 기본 템플릿 | Git 저장소 URL |
| `gitBranch` | string | ❌ | main | Git 브랜치 |
| `buildPack` | string | ❌ | nixpacks | 빌드 도구 (nixpacks, dockerfile) |
| `port` | string | ❌ | 3000 | 애플리케이션 포트 |
| `generateDomain` | boolean | ❌ | true | 자동 도메인 생성 여부 |
| `customDomain` | string | ❌ | null | 커스텀 도메인 |
| `databases` | array | ❌ | [] | 데이터베이스 목록 |
| `environmentVariables` | array | ❌ | [] | 환경변수 목록 |

### 데이터베이스 타입

| 타입 | 포트 | 연결 URL 형식 |
|------|------|-------------|
| `postgresql` | 5432 | `postgresql://user:pass@host:port/db` |
| `mysql` | 3306 | `mysql://user:pass@host:port/db` |
| `redis` | 6379 | `redis://host:port` |
| `mongodb` | 27017 | `mongodb://user:pass@host:port/db` |

### 환경변수 자동 생성

데이터베이스 생성 시 자동으로 생성되는 환경변수:

```
{DATABASE_NAME}_HOST=container-name
{DATABASE_NAME}_PORT=port
{DATABASE_NAME}_USER=username
{DATABASE_NAME}_PASSWORD=generated-password
{DATABASE_NAME}_DATABASE=database-name
{DATABASE_NAME}_URL=connection-url
```

예시:
```
MAIN_HOST=my-app-main
MAIN_PORT=5432
MAIN_USER=dbuser
MAIN_PASSWORD=abc123
MAIN_DATABASE=my_app_main
MAIN_URL=postgresql://dbuser:abc123@my-app-main:5432/my_app_main
```

## 🔧 빌드팩 지원

### Nixpacks (기본값)
- **지원 언어**: Node.js, Python, Go, Rust, PHP, Ruby
- **자동 감지**: package.json, requirements.txt, go.mod 등
- **특징**: 자동 빌드 환경 구성

### Dockerfile
- **사용법**: `"buildPack": "dockerfile"`
- **요구사항**: 저장소 루트에 Dockerfile 필요
- **특징**: 완전한 커스텀 빌드 환경

## 🌐 도메인 생성 규칙

### 자동 도메인 (`generateDomain: true`)
- **형식**: `{projectName}.one-q.xyz`
- **SSL**: 자동 발급 (Let's Encrypt)
- **DNS**: 자동 레코드 생성

### 커스텀 도메인 (`customDomain` 설정)
- **형식**: 사용자 지정 도메인
- **요구사항**: DNS를 서버 IP로 사전 설정 필요
- **SSL**: 자동 발급

## 🚨 에러 응답

### 일반적인 에러 형식
```json
{
  "error": "Error message",
  "details": "Detailed error description",
  "deploymentId": "uuid",
  "deploymentLog": [...],
  "results": {...}
}
```

### HTTP 상태 코드

| 코드 | 의미 | 설명 |
|------|------|------|
| 200 | 성공 | 요청 성공 |
| 400 | 잘못된 요청 | 파라미터 오류 |
| 422 | 검증 실패 | Coolify 검증 오류 |
| 500 | 서버 오류 | 내부 서버 오류 |

## 📝 사용 예제

### 1. 기본 Next.js 앱 배포
```bash
curl -X POST "http://141.164.60.51:3007/api/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "nextjs-app",
    "gitRepository": "https://github.com/username/nextjs-repo"
  }'
```

### 2. PostgreSQL 포함 풀스택 앱
```bash
curl -X POST "http://141.164.60.51:3007/api/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "fullstack-app",
    "gitRepository": "https://github.com/username/fullstack-repo",
    "databases": [
      {"name": "main", "type": "postgresql"}
    ],
    "environmentVariables": [
      {"key": "NODE_ENV", "value": "production"}
    ]
  }'
```

### 3. 여러 데이터베이스 포함
```bash
curl -X POST "http://141.164.60.51:3007/api/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "complex-app",
    "gitRepository": "https://github.com/username/complex-repo",
    "databases": [
      {"name": "postgres", "type": "postgresql"},
      {"name": "cache", "type": "redis"},
      {"name": "sessions", "type": "mongodb"}
    ]
  }'
```

### 4. 커스텀 도메인 사용
```bash
curl -X POST "http://141.164.60.51:3007/api/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "custom-domain-app",
    "gitRepository": "https://github.com/username/repo",
    "customDomain": "myapp.mydomain.com",
    "generateDomain": false
  }'
```

## 🔍 상태 모니터링

### 배포 진행 상태
배포 과정의 각 단계별 상태를 `deploymentLog`에서 확인:

1. **DNS**: DNS 레코드 생성
2. **Project**: Coolify 프로젝트 생성
3. **Application**: 애플리케이션 배포
4. **Environment Variables**: 환경변수 설정
5. **Start Application**: 애플리케이션 시작

### 결과 확인
`results` 객체에서 각 단계의 성공/실패 확인:

```json
{
  "results": {
    "dns": true,
    "project": true,
    "databases": [{"name": "main", "success": true}],
    "application": true,
    "envVars": true,
    "start": true
  }
}
```

## 🛠️ 개발자 도구

### cURL 래퍼 스크립트
편리한 배포를 위한 bash 함수:

```bash
deploy() {
    local name=$1
    local repo=$2
    curl -X POST "http://141.164.60.51:3007/api/deploy/complete" \
      -H "Content-Type: application/json" \
      -d "{
        \"projectName\": \"$name\",
        \"gitRepository\": \"$repo\"
      }"
}

# 사용법: deploy my-app https://github.com/user/repo
```

### JavaScript 클라이언트
```javascript
class CoolifyClient {
    constructor(baseUrl = 'http://141.164.60.51:3007/api') {
        this.baseUrl = baseUrl;
    }

    async deploy(config) {
        const response = await fetch(`${this.baseUrl}/deploy/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        return response.json();
    }

    async health() {
        const response = await fetch(`${this.baseUrl}/health`);
        return response.json();
    }
}

// 사용법
const client = new CoolifyClient();
const result = await client.deploy({
    projectName: 'my-app',
    gitRepository: 'https://github.com/user/repo'
});
```

---

**🚀 이 API를 사용하여 강력한 자동 배포 시스템을 구축하세요!**