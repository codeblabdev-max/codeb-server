# CodeB v7.0 - 데이터베이스 스키마 및 API 레퍼런스

> PostgreSQL 기반 데이터 관리 시스템

---

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   데이터베이스 아키텍처 (v7.0.54+)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────┐     ┌─────────────────────┐                   │
│  │  Primary Source     │     │  Secondary Source   │                   │
│  │  (File Registry)    │     │  (PostgreSQL)       │                   │
│  │                     │     │                     │                   │
│  │  /opt/codeb/        │ ──▶ │  db.codeb.kr:5432   │                   │
│  │  registry/*.json    │sync │  codeb database     │                   │
│  └─────────────────────┘     └─────────────────────┘                   │
│                                                                         │
│  설계 원칙:                                                              │
│  - 파일 레지스트리가 Primary Source (배포 안정성)                         │
│  - PostgreSQL은 조회 최적화 및 분석용                                     │
│  - 동기화 실패 시에도 배포 작업 계속 진행                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 데이터베이스 연결

### 환경 변수

```bash
# 연결 설정
CODEB_DB_HOST=db.codeb.kr      # 호스트 (default: db.codeb.kr)
CODEB_DB_PORT=5432             # 포트 (default: 5432)
CODEB_DB_NAME=codeb            # 데이터베이스명 (default: codeb)
CODEB_DB_USER=codeb            # 사용자 (default: codeb)
CODEB_DB_PASSWORD=***          # 비밀번호 (required)
```

### 연결 풀 설정

```typescript
const DB_CONFIG = {
  max: 20,                      // 최대 연결 수
  idleTimeoutMillis: 30000,     // 유휴 연결 타임아웃 (30초)
  connectionTimeoutMillis: 5000, // 연결 타임아웃 (5초)
};
```

---

## 스키마 다이어그램

```
┌────────────────────┐       ┌────────────────────┐
│       teams        │       │     api_keys       │
├────────────────────┤       ├────────────────────┤
│ id (PK)            │◀──────│ team_id (FK)       │
│ name               │       │ id (PK)            │
│ slug (UNIQUE)      │       │ key_hash (UNIQUE)  │
│ owner              │       │ key_prefix         │
│ plan               │       │ name               │
│ settings (JSONB)   │       │ role               │
│ created_at         │       │ scopes (JSONB)     │
│ updated_at         │       │ created_at         │
└────────────────────┘       │ expires_at         │
         │                   └────────────────────┘
         │
         ▼
┌────────────────────┐       ┌────────────────────┐
│     projects       │       │   project_slots    │
├────────────────────┤       ├────────────────────┤
│ name (PK)          │◀──────│ project_name (FK)  │
│ team_id (FK)       │       │ id (PK)            │
│ type               │       │ environment        │
│ database_name      │       │ active_slot        │
│ database_port      │       │ blue_* (상태정보)   │
│ redis_db           │       │ green_* (상태정보)  │
│ redis_port         │       │ grace_expires_at   │
│ created_at         │       │ updated_at         │
│ updated_at         │       └────────────────────┘
└────────────────────┘
         │
         ▼
┌────────────────────┐       ┌────────────────────┐
│   deployments      │       │    audit_logs      │
├────────────────────┤       ├────────────────────┤
│ id (PK)            │       │ id (PK)            │
│ project_name (FK)  │       │ team_id            │
│ environment        │       │ user_id            │
│ slot               │       │ action             │
│ version            │       │ resource           │
│ status             │       │ params (JSONB)     │
│ deployed_by        │       │ success            │
│ promoted_at        │       │ timestamp          │
│ rolled_back_at     │       │ duration           │
│ created_at         │       │ error              │
└────────────────────┘       └────────────────────┘
```

---

## 테이블 상세

### 1. teams (팀)

팀/조직 정보를 관리합니다.

```sql
CREATE TABLE teams (
  id VARCHAR(32) PRIMARY KEY,           -- 팀 고유 ID
  name VARCHAR(255) NOT NULL,           -- 팀 표시명
  slug VARCHAR(100) UNIQUE NOT NULL,    -- URL-safe 식별자
  owner VARCHAR(255) NOT NULL,          -- 소유자 이메일
  plan VARCHAR(20) DEFAULT 'free',      -- 요금제 (free/pro/enterprise)
  settings JSONB DEFAULT '{}',          -- 팀 설정
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**settings JSONB 구조:**
```json
{
  "notifications": {
    "slack": "https://hooks.slack.com/...",
    "discord": "https://discord.com/api/webhooks/..."
  },
  "deploymentDefaults": {
    "autoPromote": false,
    "healthCheckTimeout": 30
  }
}
```

---

### 2. team_members (팀 멤버)

팀 멤버십 및 권한을 관리합니다.

```sql
CREATE TABLE team_members (
  id VARCHAR(32) PRIMARY KEY,
  team_id VARCHAR(32) REFERENCES teams(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(20) NOT NULL,             -- owner/admin/member/viewer
  invited_by VARCHAR(255),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  UNIQUE(team_id, email)
);
```

**역할 계층:**
```
owner  - 팀 삭제, 모든 작업
admin  - 멤버 관리, 토큰 관리
member - 배포, promote, rollback
viewer - 조회만
```

---

### 3. api_keys (API 키)

API 인증 키를 관리합니다. 키는 SHA-256 해시로 저장됩니다.

```sql
CREATE TABLE api_keys (
  id VARCHAR(32) PRIMARY KEY,
  key_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 해시
  key_prefix VARCHAR(20) NOT NULL,       -- 식별용 접두사 (codeb_xxx...)
  name VARCHAR(255) NOT NULL,            -- 키 설명
  team_id VARCHAR(32) REFERENCES teams(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,             -- 키에 부여된 역할
  scopes JSONB DEFAULT '[]',             -- 허용된 스코프
  rate_limit JSONB,                      -- 요청 제한 설정
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ                 -- 만료일 (null = 무기한)
);
```

**키 형식:**
```
codeb_{teamId(8자)}_{role}_{random(24자 base64url)}

예: codeb_abc12345_member_xyzABC123...
```

---

### 4. projects (프로젝트)

프로젝트 메타데이터를 관리합니다.

```sql
CREATE TABLE projects (
  name VARCHAR(100) PRIMARY KEY,         -- 프로젝트명 (하이픈 정규화)
  team_id VARCHAR(32) REFERENCES teams(id) ON DELETE CASCADE,
  type VARCHAR(50) DEFAULT 'nextjs',     -- nextjs/remix/nodejs/python/go
  database_name VARCHAR(100),            -- 전용 DB명 (옵션)
  database_port INTEGER,                 -- 전용 DB 포트
  redis_db INTEGER,                      -- Redis DB 번호
  redis_port INTEGER,                    -- Redis 포트
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 5. project_slots (배포 슬롯)

Blue-Green 배포 슬롯 상태를 관리합니다.

```sql
CREATE TABLE project_slots (
  id SERIAL PRIMARY KEY,
  project_name VARCHAR(100) REFERENCES projects(name) ON DELETE CASCADE,
  environment VARCHAR(20) NOT NULL,      -- production/staging/preview
  active_slot VARCHAR(10) NOT NULL DEFAULT 'blue',  -- blue/green

  -- Blue 슬롯
  blue_state VARCHAR(20) DEFAULT 'empty',       -- empty/deployed/active/grace
  blue_port INTEGER,                            -- 컨테이너 포트
  blue_version VARCHAR(100),                    -- 배포된 버전
  blue_image VARCHAR(500),                      -- Docker 이미지
  blue_deployed_at TIMESTAMPTZ,
  blue_deployed_by VARCHAR(255),
  blue_health_status VARCHAR(20) DEFAULT 'unknown',

  -- Green 슬롯
  green_state VARCHAR(20) DEFAULT 'empty',
  green_port INTEGER,
  green_version VARCHAR(100),
  green_image VARCHAR(500),
  green_deployed_at TIMESTAMPTZ,
  green_deployed_by VARCHAR(255),
  green_health_status VARCHAR(20) DEFAULT 'unknown',

  grace_expires_at TIMESTAMPTZ,                 -- Grace 기간 만료
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(project_name, environment)
);
```

**슬롯 상태 전이:**
```
empty → deployed → active → grace → empty
          ↑          │
          └──────────┘ (rollback)
```

---

### 6. deployments (배포 이력)

모든 배포 작업의 이력을 추적합니다.

```sql
CREATE TABLE deployments (
  id VARCHAR(32) PRIMARY KEY,
  project_name VARCHAR(100) REFERENCES projects(name) ON DELETE CASCADE,
  environment VARCHAR(20) NOT NULL,
  slot VARCHAR(10) NOT NULL,
  version VARCHAR(100),
  image VARCHAR(500),
  status VARCHAR(20) DEFAULT 'pending',  -- pending/running/success/failed
  deployed_by VARCHAR(255),
  promoted_at TIMESTAMPTZ,
  promoted_by VARCHAR(255),
  rolled_back_at TIMESTAMPTZ,
  rolled_back_by VARCHAR(255),
  rollback_reason TEXT,
  steps JSONB DEFAULT '[]',              -- 배포 단계별 로그
  duration INTEGER,                      -- 소요시간 (ms)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

---

### 7. audit_logs (감사 로그)

모든 API 호출을 기록합니다.

```sql
CREATE TABLE audit_logs (
  id VARCHAR(32) PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  team_id VARCHAR(32),
  key_id VARCHAR(32),
  user_id VARCHAR(255),
  role VARCHAR(20),
  action VARCHAR(100) NOT NULL,          -- API 액션명
  resource VARCHAR(100),                 -- 리소스 타입
  resource_id VARCHAR(255),              -- 리소스 ID
  params JSONB,                          -- 요청 파라미터
  success BOOLEAN DEFAULT true,
  duration INTEGER,                      -- 응답 시간 (ms)
  ip VARCHAR(45),                        -- 클라이언트 IP
  user_agent TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 인덱스

```sql
-- 감사 로그 검색 최적화
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_team ON audit_logs(team_id, timestamp DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- 배포 이력 검색
CREATE INDEX idx_deployments_project ON deployments(project_name, created_at DESC);

-- API 키 검색
CREATE INDEX idx_api_keys_team ON api_keys(team_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
```

---

## Repository API 레퍼런스

### TeamRepo

팀 CRUD 작업을 제공합니다.

```typescript
import { TeamRepo } from './lib/database.js';

// 팀 생성
const team = await TeamRepo.create({
  id: 'team_abc123',
  name: 'My Team',
  slug: 'my-team',
  owner: 'owner@example.com',
  plan: 'free',
  settings: {}
});

// ID로 조회
const team = await TeamRepo.findById('team_abc123');

// Slug로 조회
const team = await TeamRepo.findBySlug('my-team');

// 전체 목록
const teams = await TeamRepo.list();

// 업데이트
const updated = await TeamRepo.update('team_abc123', {
  name: 'Updated Name',
  plan: 'pro'
});

// 삭제
const deleted = await TeamRepo.delete('team_abc123');
```

---

### ApiKeyRepo

API 키 관리를 제공합니다.

```typescript
import { ApiKeyRepo, generateApiKey, hashApiKey } from './lib/database.js';

// 키 생성
const { key, prefix } = generateApiKey('member', 'team_abc123');
await ApiKeyRepo.create({
  id: 'key_xyz789',
  keyHash: hashApiKey(key),
  keyPrefix: prefix,
  name: 'Deploy Key',
  teamId: 'team_abc123',
  role: 'member',
  scopes: ['deploy', 'promote'],
  createdBy: 'admin@example.com'
});

// 해시로 조회 (인증용)
const apiKey = await ApiKeyRepo.findByHash(hashApiKey(inputKey));

// 팀 키 목록
const keys = await ApiKeyRepo.findByTeam('team_abc123');

// 사용 기록 업데이트
await ApiKeyRepo.updateLastUsed('key_xyz789');

// 키 취소
await ApiKeyRepo.revoke('key_xyz789');
```

---

### ProjectRepo

프로젝트 메타데이터를 관리합니다.

```typescript
import { ProjectRepo } from './lib/database.js';

// 프로젝트 생성
const project = await ProjectRepo.create({
  name: 'my-app',
  teamId: 'team_abc123',
  type: 'nextjs',
  databaseName: 'my_app_db',
  databasePort: 5433
});

// 이름으로 조회
const project = await ProjectRepo.findByName('my-app');

// 팀 프로젝트 목록
const projects = await ProjectRepo.findByTeam('team_abc123');

// Upsert (존재하면 업데이트)
await ProjectRepo.upsert({
  name: 'my-app',
  teamId: 'team_abc123',
  type: 'nextjs'
});

// 업데이트
await ProjectRepo.update('my-app', {
  type: 'remix',
  redisDb: 1
});

// 삭제
await ProjectRepo.delete('my-app');
```

---

### SlotRepo

Blue-Green 슬롯 상태를 관리합니다.

```typescript
import { SlotRepo } from './lib/database.js';

// 프로젝트/환경으로 조회
const slots = await SlotRepo.findByProject('my-app', 'production');

// Upsert (파일 레지스트리와 동기화)
await SlotRepo.upsert({
  projectName: 'my-app',
  environment: 'production',
  activeSlot: 'blue',
  blue: {
    name: 'blue',
    state: 'active',
    port: 4100,
    version: '1.0.0',
    deployedAt: '2025-01-15T00:00:00Z'
  },
  green: {
    name: 'green',
    state: 'empty'
  }
});

// 전체 슬롯 목록
const allSlots = await SlotRepo.listAll();

// 팀별 슬롯 조회
const teamSlots = await SlotRepo.listByTeam('team_abc123');

// 여러 프로젝트 조회
const slots = await SlotRepo.listByProjects(['app-a', 'app-b']);
```

---

### AuditLogRepo

감사 로그 기록 및 조회를 제공합니다.

```typescript
import { AuditLogRepo } from './lib/database.js';

// 로그 기록
await AuditLogRepo.create({
  timestamp: new Date().toISOString(),
  teamId: 'team_abc123',
  userId: 'user@example.com',
  action: 'deploy_project',
  resource: 'project',
  resourceId: 'my-app',
  details: { environment: 'production', version: '1.0.0' },
  success: true,
  duration: 5420,
  ip: '192.168.1.1'
});

// 로그 조회
const { logs, total } = await AuditLogRepo.find({
  teamId: 'team_abc123',
  action: 'deploy_project',
  since: new Date('2025-01-01'),
  limit: 50,
  offset: 0
});

// 오래된 로그 정리 (90일 기준)
const deletedCount = await AuditLogRepo.cleanup(90);
```

---

### DeploymentRepo

배포 이력을 관리합니다.

```typescript
import { DeploymentRepo } from './lib/database.js';

// 배포 기록 생성
await DeploymentRepo.create({
  id: 'deploy_abc123',
  projectName: 'my-app',
  environment: 'production',
  slot: 'blue',
  version: '1.0.0',
  image: 'my-app:1.0.0',
  deployedBy: 'user@example.com'
});

// 상태 업데이트
await DeploymentRepo.updateStatus('deploy_abc123', 'success', {
  duration: 45000,
  steps: [
    { name: 'pull', status: 'success', duration: 5000 },
    { name: 'start', status: 'success', duration: 3000 },
    { name: 'health', status: 'success', duration: 10000 }
  ]
});

// Promote 기록
await DeploymentRepo.markPromoted('deploy_abc123', 'admin@example.com');

// Rollback 기록
await DeploymentRepo.markRolledBack('deploy_abc123', 'admin@example.com', 'Health check failed');

// 프로젝트 배포 이력
const deployments = await DeploymentRepo.findByProject('my-app', {
  environment: 'production',
  limit: 20
});
```

---

## 트랜잭션 헬퍼

복잡한 작업을 트랜잭션으로 묶습니다.

```typescript
import { withTransaction } from './lib/database.js';

await withTransaction(async (client) => {
  // 팀 생성
  await client.query(
    'INSERT INTO teams (id, name, slug, owner) VALUES ($1, $2, $3, $4)',
    ['team_new', 'New Team', 'new-team', 'owner@example.com']
  );

  // 기본 API 키 생성
  await client.query(
    'INSERT INTO api_keys (id, key_hash, ...) VALUES (...)',
    [...]
  );

  // 실패 시 자동 롤백
});
```

---

## 마이그레이션

스키마 버전 관리 및 자동 마이그레이션을 지원합니다.

```typescript
import { runMigrations } from './lib/database.js';

// 서버 시작 시 자동 실행
await runMigrations();

// 콘솔 출력:
// Applying migration v1...
// ✅ Database schema at v1
```

**마이그레이션 추가:**
```typescript
const MIGRATIONS: Record<number, string[]> = {
  1: [/* 기존 스키마 */],
  2: [
    // 새 컬럼 추가
    'ALTER TABLE projects ADD COLUMN description TEXT',
    // 새 인덱스
    'CREATE INDEX idx_projects_type ON projects(type)'
  ]
};

const SCHEMA_VERSION = 2;  // 버전 업데이트
```

---

## 성능 최적화

### 연결 풀 모니터링

```typescript
import { getPool } from './lib/database.js';

const pool = await getPool();

// 풀 상태 확인
console.log({
  total: pool.totalCount,      // 전체 연결 수
  idle: pool.idleCount,        // 유휴 연결 수
  waiting: pool.waitingCount   // 대기 중 요청 수
});
```

### 쿼리 최적화 팁

1. **인덱스 활용**
   ```sql
   -- timestamp 범위 쿼리는 인덱스 활용
   SELECT * FROM audit_logs
   WHERE team_id = 'x' AND timestamp >= '2025-01-01'
   ORDER BY timestamp DESC;
   ```

2. **페이지네이션**
   ```sql
   -- OFFSET보다 keyset pagination 권장 (대용량)
   SELECT * FROM deployments
   WHERE project_name = 'x' AND created_at < $cursor
   ORDER BY created_at DESC
   LIMIT 20;
   ```

3. **JSONB 쿼리**
   ```sql
   -- JSONB 필드 인덱싱
   CREATE INDEX idx_teams_settings ON teams USING gin(settings);

   -- JSONB 쿼리
   SELECT * FROM teams
   WHERE settings @> '{"notifications": {"slack": true}}';
   ```

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `mcp-server/src/lib/database.ts` | DB 연결 및 Repository |
| `mcp-server/src/lib/types.ts` | TypeScript 타입 정의 |
| `mcp-server/src/tools/slot.ts` | 슬롯 레지스트리 + DB 동기화 |
| `mcp-server/src/index.ts` | 서버 초기화 (마이그레이션) |

---

## 버전

- **문서 버전**: v7.0.54
- **스키마 버전**: 1
- **최종 업데이트**: 2026-01-15
