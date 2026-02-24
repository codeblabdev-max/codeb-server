# @codeb/feature-env

> 환경변수 관리 - 동기화, 비교, 백업/복원

## 역할

로컬 `.env` 파일과 서버 환경변수를 비교, 동기화하고
백업/복원 기능을 제공한다.

## 디렉토리 구조

```
features/environment/src/
├── env.service.ts     ← 환경변수 스캔/비교 (로컬 ↔ 서버)
├── sync.service.ts    ← 환경변수 동기화 (push/pull)
├── backup.service.ts  ← 백업 및 복원
└── index.ts
```

## Services

### EnvService

로컬과 서버 환경변수를 비교 분석한다.

| 주요 메서드 | 설명 |
|------------|------|
| `scan(projectName, env)` | 로컬 ↔ 서버 환경변수 비교 |
| `compare(local, server)` | 두 env 객체 diff 계산 |
| `parseEnvContent(content)` | `.env` 파일 파싱 |

**비교 결과 상태:**
- `added` - 로컬에만 존재
- `removed` - 서버에만 존재
- `changed` - 값이 다름
- `same` - 동일

민감 데이터는 자동 마스킹: `abcd****efgh`

### SyncService

환경변수를 양방향 동기화한다.

| 주요 메서드 | 설명 |
|------------|------|
| `pull(projectName, env)` | 서버 → 로컬 동기화 |
| `push(projectName, env)` | 로컬 → 서버 동기화 |

### BackupService

환경변수 백업 및 복원을 관리한다.

| 주요 메서드 | 설명 |
|------------|------|
| `backup(projectName, env)` | 현재 환경변수 백업 |
| `restore(projectName, env, version)` | 백업에서 복원 (`master` \| `current`) |
| `list(projectName)` | 백업 목록 |

## 의존성

- `@codeb/shared` - 타입
- `@codeb/db` - ProjectEnvRepo
- `@codeb/ssh` - 서버 env 파일 읽기/쓰기
- `@codeb/logger` - 로깅
