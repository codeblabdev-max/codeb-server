# CodeB Server API 설계

## 개요

Coolify 스타일의 서버 관리 시스템 (API Only, No Web UI)
- MCP/CLI가 HTTP API를 호출
- Protection Layer로 실수 방지
- SQLite로 상태 관리

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                        Control Plane                             │
│                      (141.164.60.51)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  PowerDNS   │  │    Caddy    │  │    CodeB API Server     │  │
│  │  (DNS)      │  │  (Reverse   │  │  ┌───────────────────┐  │  │
│  │             │  │   Proxy)    │  │  │ Protection Layer  │  │  │
│  └─────────────┘  └─────────────┘  │  ├───────────────────┤  │  │
│                                     │  │ SQLite State DB   │  │  │
│                                     │  ├───────────────────┤  │  │
│                                     │  │ API Endpoints     │  │  │
│                                     │  ├───────────────────┤  │  │
│                                     │  │ SSH Executor      │  │  │
│                                     │  └───────────────────┘  │  │
│                                     └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           │                  │                  │
           ▼                  ▼                  ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   App Server    │  │   DB Server     │  │  Cache Server   │
│ 158.247.203.55  │  │ 141.164.42.213  │  │ 64.176.226.119  │
│                 │  │                 │  │                 │
│ Podman+Quadlet  │  │ Podman+Quadlet  │  │ Podman+Quadlet  │
│ - project1-app  │  │ - project1-db   │  │ - project1-redis│
│ - project2-app  │  │ - project2-db   │  │ - project2-redis│
│ - ...           │  │ - ...           │  │ - ...           │
└─────────────────┘  └─────────────────┘  └─────────────────┘
                              │
                              ▼ WAL Streaming
                     ┌─────────────────┐
                     │ Storage Server  │
                     │ 141.164.37.63   │
                     │                 │
                     │ - MinIO         │
                     │ - WAL Receiver  │
                     │ - DB Backups    │
                     │ - Redis AOF     │
                     └─────────────────┘
```

## Protection Layer

### 위험 등급 분류

```typescript
enum DangerLevel {
  SAFE = 0,       // 읽기 작업 - 즉시 실행
  LOW = 1,        // 컨테이너 시작/재시작 - 확인 후 실행
  MEDIUM = 2,     // 컨테이너 중지 - 경고 + 확인
  HIGH = 3,       // 볼륨 삭제 - 이중 확인 + 백업 확인
  CRITICAL = 4    // 서버 삭제 - 관리자 승인 필요
}
```

### Protection Rules

```typescript
const PROTECTION_RULES = {
  // 볼륨 삭제 방지
  'volume_delete': {
    level: DangerLevel.HIGH,
    requires: ['backup_exists', 'user_confirmation', 'cooldown_24h'],
    message: '볼륨 삭제는 24시간 쿨다운 후 가능합니다. 먼저 백업을 확인하세요.'
  },

  // 컨테이너 삭제 방지
  'container_remove': {
    level: DangerLevel.MEDIUM,
    requires: ['container_stopped', 'user_confirmation'],
    message: '컨테이너를 먼저 중지하고 확인이 필요합니다.'
  },

  // 데이터베이스 DROP 방지
  'db_drop': {
    level: DangerLevel.CRITICAL,
    requires: ['backup_verified', 'admin_approval', 'cooldown_48h'],
    message: '데이터베이스 삭제는 관리자 승인과 48시간 쿨다운이 필요합니다.'
  },

  // Production 배포
  'deploy_production': {
    level: DangerLevel.MEDIUM,
    requires: ['staging_tested', 'health_check_passed'],
    message: 'Staging 테스트 후 Production 배포가 가능합니다.'
  }
};
```

### Confirmation Flow

```
MCP/CLI Request
      │
      ▼
┌─────────────────┐
│ Protection      │
│ Layer Check     │
└────────┬────────┘
         │
    ┌────┴────┐
    │ Level?  │
    └────┬────┘
         │
   ┌─────┼─────┬─────┐
   ▼     ▼     ▼     ▼
 SAFE   LOW  MEDIUM HIGH/CRITICAL
   │     │     │     │
   │     │     │     ▼
   │     │     │  ┌──────────────┐
   │     │     │  │ Queue for    │
   │     │     │  │ Confirmation │
   │     │     │  └──────────────┘
   │     │     ▼
   │     │  ┌──────────────┐
   │     │  │ Return       │
   │     │  │ Warning +    │
   │     │  │ Confirm Token│
   │     │  └──────────────┘
   │     ▼
   │  ┌──────────────┐
   │  │ Log + Execute│
   │  └──────────────┘
   ▼
┌──────────────┐
│ Execute      │
│ Immediately  │
└──────────────┘
```

## SQLite State Manager

### Schema

```sql
-- 프로젝트 테이블
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL, -- nextjs, remix, nodejs, static
  git_repo TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'active' -- active, archived, deleted
);

-- 환경 테이블
CREATE TABLE environments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL, -- staging, production, preview
  app_port INTEGER,
  db_port INTEGER,
  redis_port INTEGER,
  redis_db INTEGER,
  domain TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, name)
);

-- 컨테이너 테이블
CREATE TABLE containers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  environment TEXT NOT NULL,
  server_type TEXT NOT NULL, -- app, db, redis
  server_ip TEXT NOT NULL,
  container_name TEXT NOT NULL,
  image TEXT NOT NULL,
  port_external INTEGER,
  port_internal INTEGER,
  status TEXT DEFAULT 'created', -- created, running, stopped, removed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 백업 테이블
CREATE TABLE backups (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  environment TEXT NOT NULL,
  type TEXT NOT NULL, -- full, incremental, wal
  size_bytes INTEGER,
  location TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  verified_at DATETIME,
  status TEXT DEFAULT 'completed' -- in_progress, completed, failed, verified
);

-- 작업 로그 테이블
CREATE TABLE operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT REFERENCES projects(id),
  operation TEXT NOT NULL,
  danger_level INTEGER NOT NULL,
  requested_by TEXT NOT NULL, -- mcp, cli, api
  status TEXT NOT NULL, -- pending, approved, rejected, executed, failed
  details JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  executed_at DATETIME
);

-- 포트 할당 테이블
CREATE TABLE port_allocations (
  port INTEGER PRIMARY KEY,
  server_type TEXT NOT NULL, -- app, db, redis
  environment TEXT NOT NULL, -- staging, production, preview
  project_id TEXT REFERENCES projects(id),
  allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 보호 큐 테이블
CREATE TABLE protection_queue (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  danger_level INTEGER NOT NULL,
  project_id TEXT REFERENCES projects(id),
  details JSON NOT NULL,
  confirm_token TEXT UNIQUE,
  expires_at DATETIME NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, confirmed, expired, cancelled
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

### Projects

```
POST   /api/projects              - 프로젝트 생성 (자동 .env 생성)
GET    /api/projects              - 프로젝트 목록
GET    /api/projects/:id          - 프로젝트 상세
PUT    /api/projects/:id          - 프로젝트 수정
DELETE /api/projects/:id          - 프로젝트 삭제 (Protection Layer)
```

### Environments

```
POST   /api/projects/:id/environments           - 환경 생성
GET    /api/projects/:id/environments           - 환경 목록
GET    /api/projects/:id/environments/:env      - 환경 상세
DELETE /api/projects/:id/environments/:env      - 환경 삭제 (Protection Layer)
```

### Containers

```
POST   /api/containers/deploy     - 컨테이너 배포
GET    /api/containers            - 컨테이너 목록
GET    /api/containers/:id        - 컨테이너 상세
POST   /api/containers/:id/start  - 컨테이너 시작
POST   /api/containers/:id/stop   - 컨테이너 중지
POST   /api/containers/:id/restart- 컨테이너 재시작
DELETE /api/containers/:id        - 컨테이너 삭제 (Protection Layer)
```

### Domains

```
POST   /api/domains               - 도메인 설정
GET    /api/domains               - 도메인 목록
DELETE /api/domains/:domain       - 도메인 삭제
GET    /api/domains/:domain/status- 도메인 상태 확인
```

### Backups

```
POST   /api/backups               - 백업 생성
GET    /api/backups               - 백업 목록
GET    /api/backups/:id           - 백업 상세
POST   /api/backups/:id/restore   - 백업 복원
DELETE /api/backups/:id           - 백업 삭제 (Protection Layer)
```

### Protection

```
GET    /api/protection/queue      - 대기 중인 작업 목록
POST   /api/protection/confirm    - 작업 확인/승인
POST   /api/protection/cancel     - 작업 취소
GET    /api/protection/logs       - 작업 로그
```

### Health & Monitoring

```
GET    /api/health                - API 서버 상태
GET    /api/servers               - 서버 목록 및 상태
GET    /api/servers/:ip/stats     - 서버 리소스 통계
GET    /api/metrics               - 전체 메트릭
```

### Auto Scaling (Vultr API)

```
POST   /api/scaling/check         - 스케일링 필요 여부 확인
POST   /api/scaling/up            - 서버 추가
POST   /api/scaling/down          - 서버 제거
GET    /api/scaling/history       - 스케일링 이력
```

## 프로젝트 생성 시 자동 .env 생성

### Flow

```
POST /api/projects
{
  "name": "my-project",
  "type": "nextjs",
  "git_repo": "https://github.com/user/repo"
}

Response:
{
  "project": { ... },
  "environments": {
    "staging": {
      "app_port": 3001,
      "db_port": 15432,
      "redis_port": 16379,
      "redis_db": 0
    },
    "production": {
      "app_port": 4001,
      "db_port": 25432,
      "redis_port": 26379,
      "redis_db": 0
    }
  },
  "env_files": {
    "local": "... .env.local 내용 ...",
    "staging": "... staging .env 내용 ...",
    "production": "... production .env 내용 ..."
  }
}
```

### 자동 생성되는 .env 내용

```env
# .env.local (로컬 개발용)
NODE_ENV=development
PORT=3000

# Database (로컬 Docker 사용 권장)
DATABASE_URL=postgresql://my_project:generated_password@localhost:5432/my_project_dev
DIRECT_URL=postgresql://my_project:generated_password@localhost:5432/my_project_dev

# Redis (로컬 Docker 사용 권장)
REDIS_URL=redis://localhost:6379/0

# .env.staging (서버 Staging용)
NODE_ENV=staging
PORT=3001

DATABASE_URL=postgresql://my_project:generated_password@141.164.42.213:15432/my_project_staging
DIRECT_URL=postgresql://my_project:generated_password@141.164.42.213:15432/my_project_staging
REDIS_URL=redis://:redis_password@64.176.226.119:16379/0

# .env.production (서버 Production용)
NODE_ENV=production
PORT=4001

DATABASE_URL=postgresql://my_project:generated_password@141.164.42.213:25432/my_project_prod
DIRECT_URL=postgresql://my_project:generated_password@141.164.42.213:25432/my_project_prod
REDIS_URL=redis://:redis_password@64.176.226.119:26379/0
```

## 기술 스택

### API Server
- **Runtime**: Node.js 20+ / Bun
- **Framework**: Hono (경량, 빠름)
- **Database**: SQLite (better-sqlite3)
- **Validation**: Zod
- **SSH**: ssh2 라이브러리

### 인증
- API Key 기반 (MCP/CLI용)
- 각 요청에 `X-API-Key` 헤더 필요

### 배포
- Control 서버(141)에 Systemd 서비스로 실행
- 또는 Podman 컨테이너로 실행

## 디렉토리 구조

```
codeb-api-server/
├── src/
│   ├── index.ts              # 진입점
│   ├── config.ts             # 설정
│   ├── db/
│   │   ├── schema.sql        # SQLite 스키마
│   │   ├── index.ts          # DB 연결
│   │   └── migrations/       # 마이그레이션
│   ├── protection/
│   │   ├── index.ts          # Protection Layer
│   │   ├── rules.ts          # 보호 규칙
│   │   └── queue.ts          # 확인 대기열
│   ├── services/
│   │   ├── ssh.ts            # SSH 실행기
│   │   ├── podman.ts         # Podman 명령
│   │   ├── caddy.ts          # Caddy 설정
│   │   ├── dns.ts            # PowerDNS 설정
│   │   ├── backup.ts         # 백업 관리
│   │   └── vultr.ts          # Vultr API
│   ├── routes/
│   │   ├── projects.ts
│   │   ├── containers.ts
│   │   ├── domains.ts
│   │   ├── backups.ts
│   │   ├── protection.ts
│   │   └── health.ts
│   └── utils/
│       ├── env-generator.ts  # .env 생성기
│       ├── port-allocator.ts # 포트 할당
│       └── password.ts       # 비밀번호 생성
├── package.json
├── tsconfig.json
└── .env                      # API 서버 설정
```

## MCP 전환

### 현재 (Direct SSH)
```typescript
// MCP가 직접 SSH 실행
mcp__codeb-deploy__deploy({
  projectName: 'my-project',
  environment: 'staging'
})
// → SSH로 직접 서버에 명령 실행
```

### 변경 후 (API 호출)
```typescript
// MCP가 API 호출
mcp__codeb-api__deploy({
  projectName: 'my-project',
  environment: 'staging'
})
// → HTTP POST /api/containers/deploy
// → Protection Layer 체크
// → 승인 시 SSH 실행
```

## 구현 순서

1. **Phase 1: Core API**
   - [ ] 프로젝트 구조 생성
   - [ ] SQLite 스키마 및 연결
   - [ ] Protection Layer 구현
   - [ ] 기본 API 엔드포인트

2. **Phase 2: Services**
   - [ ] SSH Executor
   - [ ] Podman Service
   - [ ] Port Allocator
   - [ ] Env Generator

3. **Phase 3: Integration**
   - [ ] Caddy 연동
   - [ ] PowerDNS 연동
   - [ ] Backup 서비스

4. **Phase 4: MCP Migration**
   - [ ] 기존 MCP를 API Client로 전환
   - [ ] CLI 업데이트
