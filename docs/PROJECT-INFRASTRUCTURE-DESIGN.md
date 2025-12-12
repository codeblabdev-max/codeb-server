# CodeB 프로젝트 인프라 관리 설계

## 개요

프로젝트별 격리된 서버 리소스 관리 시스템.
- **신규 프로젝트**: `we workflow init` → 서버 리소스 자동 생성
- **기존 프로젝트**: `we workflow scan` → 누락 리소스 감지 → `we workflow add-resource`

## 서버 인프라 구조

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         서버 (141.164.60.51)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      공유 인프라 서비스                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │   │
│  │  │  PostgreSQL  │  │    Redis     │  │       Storage            │  │   │
│  │  │  Container   │  │  Container   │  │    /opt/codeb/data/      │  │   │
│  │  │  :5432       │  │  :6379       │  │                          │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    프로젝트별 격리 리소스                            │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  project-a                                                          │   │
│  │  ├── DB: project_a (user: project_a_user)                          │   │
│  │  ├── Redis: db:0 또는 prefix "project-a:"                          │   │
│  │  ├── Storage: /opt/codeb/data/project-a/                           │   │
│  │  │   ├── uploads/                                                  │   │
│  │  │   ├── cache/                                                    │   │
│  │  │   └── temp/                                                     │   │
│  │  └── ENV: /opt/codeb/envs/project-a-{env}.env                      │   │
│  │                                                                     │   │
│  │  project-b                                                          │   │
│  │  ├── DB: project_b (user: project_b_user)                          │   │
│  │  ├── Redis: db:1 또는 prefix "project-b:"                          │   │
│  │  ├── Storage: /opt/codeb/data/project-b/                           │   │
│  │  └── ENV: /opt/codeb/envs/project-b-{env}.env                      │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      프로젝트 레지스트리                             │   │
│  │              /opt/codeb/config/project-registry.json                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 프로젝트 레지스트리 스키마

```json
{
  "version": "2.0",
  "updated_at": "2025-01-15T10:00:00Z",
  "infrastructure": {
    "postgres": {
      "host": "codeb-postgres",
      "port": 5432,
      "admin_user": "postgres"
    },
    "redis": {
      "host": "codeb-redis",
      "port": 6379,
      "max_databases": 16
    },
    "storage": {
      "base_path": "/opt/codeb/data"
    }
  },
  "projects": {
    "my-app": {
      "created_at": "2025-01-15T10:00:00Z",
      "type": "nextjs",
      "resources": {
        "database": {
          "enabled": true,
          "name": "my_app",
          "user": "my_app_user",
          "port": 5432
        },
        "redis": {
          "enabled": true,
          "db_index": 0,
          "prefix": "my-app:"
        },
        "storage": {
          "enabled": true,
          "path": "/opt/codeb/data/my-app",
          "directories": ["uploads", "cache", "temp"]
        }
      },
      "environments": {
        "production": {
          "port": 3000,
          "domain": "my-app.one-q.xyz",
          "env_file": "/opt/codeb/envs/my-app-production.env"
        },
        "staging": {
          "port": 3001,
          "domain": "my-app-staging.one-q.xyz",
          "env_file": "/opt/codeb/envs/my-app-staging.env"
        }
      }
    }
  }
}
```

## CLI 명령어 플로우

### 1. 신규 프로젝트 초기화

```bash
we workflow init my-app --database --redis --storage
```

**실행 순서:**
1. 포트 할당 (앱, DB 외부포트)
2. PostgreSQL: DB + User 생성
3. Redis: DB 인덱스 할당 또는 prefix 설정
4. Storage: 디렉토리 생성
5. ENV 파일 생성 (서버 + 로컬)
6. Quadlet 파일 생성
7. 레지스트리 등록

```
┌─────────────────────────────────────────────────────────────────┐
│                   we workflow init my-app                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Step 1: 포트 할당                                              │
│  ├── App Port: 3000 (production), 3001 (staging)               │
│  ├── DB External Port: 5440 (production), 5441 (staging)       │
│  └── Redis External Port: 6380 (production), 6381 (staging)    │
│                                                                 │
│  Step 2: PostgreSQL 설정                                        │
│  ├── CREATE DATABASE my_app;                                   │
│  ├── CREATE USER my_app_user WITH PASSWORD '***';              │
│  └── GRANT ALL PRIVILEGES ON DATABASE my_app TO my_app_user;   │
│                                                                 │
│  Step 3: Redis 설정                                             │
│  └── Assign DB index: 0 (or prefix: "my-app:")                 │
│                                                                 │
│  Step 4: Storage 설정                                           │
│  ├── mkdir -p /opt/codeb/data/my-app/uploads                   │
│  ├── mkdir -p /opt/codeb/data/my-app/cache                     │
│  └── mkdir -p /opt/codeb/data/my-app/temp                      │
│                                                                 │
│  Step 5: ENV 파일 생성                                          │
│  ├── Server: /opt/codeb/envs/my-app-production.env             │
│  ├── Server: /opt/codeb/envs/my-app-staging.env                │
│  └── Local: .env.local (서버 DB 연결)                           │
│                                                                 │
│  Step 6: Quadlet 파일 생성                                      │
│  ├── quadlet/my-app.container                                  │
│  ├── quadlet/my-app-staging.container                          │
│  └── (DB/Redis는 공유 컨테이너 사용)                             │
│                                                                 │
│  Step 7: 레지스트리 등록                                        │
│  └── Update /opt/codeb/config/project-registry.json            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2. 기존 프로젝트 스캔

```bash
we workflow scan my-app
```

**출력 예시:**
```
📊 Project Resource Scan: my-app

✅ Database: my_app (PostgreSQL)
   - Connection: OK
   - Tables: 15

❌ Redis: NOT CONFIGURED
   - Recommendation: we workflow add-resource my-app --redis

❌ Storage: NOT CONFIGURED
   - Recommendation: we workflow add-resource my-app --storage

✅ ENV Files:
   - Production: /opt/codeb/envs/my-app-production.env
   - Staging: /opt/codeb/envs/my-app-staging.env

⚠️  Missing Resources Detected!
   Run: we workflow add-resource my-app --redis --storage
```

### 3. 기존 프로젝트에 리소스 추가

```bash
we workflow add-resource my-app --redis --storage
```

**실행 순서:**
1. 현재 리소스 상태 확인
2. 누락된 리소스만 생성
3. ENV 파일 업데이트 (새 연결 정보 추가)
4. 레지스트리 업데이트

## ENV 파일 구조

### 서버 ENV (프로덕션)
`/opt/codeb/envs/my-app-production.env`

```env
# my-app - Production Environment
# Generated by CodeB CLI v2.5.0

NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0

# PostgreSQL (컨테이너 DNS)
DATABASE_URL=postgresql://my_app_user:***@codeb-postgres:5432/my_app?schema=public
POSTGRES_HOST=codeb-postgres
POSTGRES_PORT=5432
POSTGRES_USER=my_app_user
POSTGRES_PASSWORD=***
POSTGRES_DB=my_app

# Redis (컨테이너 DNS)
REDIS_URL=redis://codeb-redis:6379/0
REDIS_HOST=codeb-redis
REDIS_PORT=6379
REDIS_DB=0
REDIS_PREFIX=my-app:

# Storage
STORAGE_PATH=/data
UPLOAD_PATH=/data/uploads
CACHE_PATH=/data/cache

# Socket.IO (Redis Adapter)
SOCKETIO_REDIS_HOST=codeb-redis
SOCKETIO_REDIS_PORT=6379
SOCKETIO_REDIS_PREFIX=my-app:socket:
```

### 로컬 ENV (개발용)
`.env.local`

```env
# my-app - Local Development Environment
# Generated by CodeB CLI v2.5.0
# ⚠️  WARNING: This connects to REAL server data!

NODE_ENV=development
PORT=3000

# PostgreSQL (서버 외부 포트로 연결)
DATABASE_URL=postgresql://my_app_user:***@141.164.60.51:5440/my_app?schema=public

# Redis (서버 외부 포트로 연결)
REDIS_URL=redis://141.164.60.51:6380/0
REDIS_PREFIX=my-app:

# Storage (로컬 개발 시 로컬 경로 사용)
STORAGE_PATH=./data
UPLOAD_PATH=./data/uploads
CACHE_PATH=./data/cache

# Socket.IO (개발 시 서버 Redis 사용)
SOCKETIO_REDIS_HOST=141.164.60.51
SOCKETIO_REDIS_PORT=6380
SOCKETIO_REDIS_PREFIX=my-app:socket:
```

## Quadlet 볼륨 매핑

```ini
# my-app.container
[Container]
...
# Storage 볼륨 매핑
Volume=/opt/codeb/data/my-app:/data:Z

# 환경 파일 참조
EnvironmentFile=/opt/codeb/envs/my-app-production.env
```

## MCP 연동

`mcp__codeb-deploy` 도구와 연동:

```javascript
// CLI에서 MCP 호출
await mcp.init_project({
  projectName: 'my-app',
  projectType: 'nextjs',
  services: {
    database: true,
    redis: true,
    storage: true
  }
});

// 리소스 추가
await mcp.add_resource({
  projectName: 'my-app',
  resources: ['redis', 'storage']
});
```

## 명령어 요약

| 명령어 | 설명 |
|--------|------|
| `we workflow init <name>` | 신규 프로젝트 + 서버 리소스 생성 |
| `we workflow scan <name>` | 프로젝트 리소스 상태 스캔 |
| `we workflow add-resource <name>` | 기존 프로젝트에 리소스 추가 |
| `we workflow sync <name>` | Quadlet + ENV 서버 동기화 |

## 옵션 플래그

| 플래그 | 설명 | 기본값 |
|--------|------|--------|
| `--database` | PostgreSQL DB 포함 | true |
| `--redis` | Redis 포함 | true |
| `--storage` | Storage 디렉토리 포함 | true |
| `--no-database` | PostgreSQL 제외 | - |
| `--no-redis` | Redis 제외 | - |
| `--no-storage` | Storage 제외 | - |
| `--redis-prefix` | Redis key prefix 사용 | true |
| `--redis-db <n>` | 특정 Redis DB 번호 | auto |
