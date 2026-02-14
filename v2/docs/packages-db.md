# @codeb/db

> PostgreSQL 데이터베이스 레이어 - 커넥션 풀, 리포지토리, 마이그레이션

## 역할

Storage 서버(64.176.226.119)의 PostgreSQL에 접속하여
프로젝트, 슬롯, 배포, 팀, 환경변수, 도메인, 감사 로그를 관리한다.

## 디렉토리 구조

```
packages/db/src/
├── pool.ts           ← 커넥션 풀 관리 (getPool, closePool, withTransaction)
├── migrations/
│   └── index.ts      ← 스키마 마이그레이션 실행
├── repos/
│   ├── index.ts      ← 리포지토리 통합 export
│   ├── project.repo.ts
│   ├── slot.repo.ts
│   ├── deployment.repo.ts
│   ├── team.repo.ts
│   ├── env.repo.ts
│   ├── domain.repo.ts
│   └── audit.repo.ts
└── index.ts
```

## Exports

### Pool Management

| 함수 | 설명 |
|------|------|
| `getPool()` | 싱글톤 pg.Pool 인스턴스 반환 |
| `closePool()` | 풀 종료 (graceful shutdown) |
| `withTransaction(fn)` | 트랜잭션 래퍼 (BEGIN → fn → COMMIT/ROLLBACK) |

### Repositories

| Repository | 테이블 | 주요 메서드 |
|-----------|--------|------------|
| `ProjectRepo` | `projects` | `findByName()`, `findByTeam()`, `create()`, `update()` |
| `SlotRepo` | `slots` | `findByProject()`, `findActive()`, `findInactive()`, `updateStatus()` |
| `DeploymentRepo` | `deployments` | `create()`, `findLatest()`, `findByProject()` |
| `TeamRepo` | `teams` | `findById()`, `create()`, `addMember()`, `removeMember()` |
| `ProjectEnvRepo` | `project_envs` | `get()`, `set()`, `delete()`, `getAll()` |
| `DomainRepo` | `domains` | `findByProject()`, `create()`, `delete()`, `findByDomain()` |
| `AuditLogRepo` | `audit_logs` | `create()`, `findByTeam()`, `findByProject()` |

### Type Exports

| 타입 | 설명 |
|------|------|
| `ProjectRecord` | DB projects 행 타입 |
| `DeploymentRecord` | DB deployments 행 타입 |
| `ProjectEnvRecord` | DB project_envs 행 타입 |

## 의존성

- `pg` - PostgreSQL 클라이언트
- `@codeb/shared` - 타입, 상수
