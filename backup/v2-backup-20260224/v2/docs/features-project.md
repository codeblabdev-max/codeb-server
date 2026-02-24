# @codeb/feature-project

> 프로젝트 초기화, 스캔, CI/CD 워크플로우 생성

## 역할

새 프로젝트를 CodeB 인프라에 등록하고, 기존 프로젝트 설정을 스캔하며,
GitHub Actions CI/CD 워크플로우를 생성한다.

## 디렉토리 구조

```
features/project/src/
├── init.service.ts      ← 프로젝트 초기화 (SSOT 등록, 포트 할당, 슬롯 생성)
├── scan.service.ts      ← 프로젝트 설정 스캔 (DB 확인, 리소스 상태)
├── workflow.service.ts  ← GitHub Actions 워크플로우 생성
└── index.ts
```

## Services

### InitService

새 프로젝트를 CodeB 플랫폼에 등록한다.

| 주요 메서드 | 설명 |
|------------|------|
| `init(projectName, opts)` | 전체 초기화 파이프라인 |

**초기화 단계:**
1. 프로젝트 DB SSOT 등록 (projects 테이블)
2. 포트 자동 할당 (3001~9999 범위, 충돌 방지)
3. Blue-Green 슬롯 생성 (blue/green)
4. 환경변수 파일 생성 (`.env`)
5. Caddy 리버스 프록시 기본 설정

**옵션:**
- `type`: `'nextjs' | 'remix' | 'nodejs' | 'python' | 'go'`
- `database`: PostgreSQL 포함 여부
- `redis`: Redis 포함 여부

### ScanService

프로젝트의 현재 인프라 상태를 스캔한다.

| 주요 메서드 | 설명 |
|------------|------|
| `scan(projectName)` | 프로젝트 설정 + 리소스 상태 스캔 |

**스캔 항목:**
- DB SSOT 등록 여부
- 컨테이너 실행 상태
- 포트 할당 상태
- 도메인 설정 상태
- 환경변수 상태

### WorkflowService

GitHub Actions 워크플로우 파일을 생성한다.

| 주요 메서드 | 설명 |
|------------|------|
| `generate(projectName, opts)` | `deploy.yml` 생성 |

**생성 파일:** `.github/workflows/deploy.yml`

**워크플로우 구성:**
- Docker Buildx + Minio S3 캐시
- Private Registry (64.176.226.119:5000) Push
- MCP API로 Blue-Green 배포
- promote / rollback workflow_dispatch

## 의존성

- `@codeb/shared` - 타입, 상수, 포트 범위
- `@codeb/db` - ProjectRepo, SlotRepo
- `@codeb/ssh` - 서버 디렉토리 생성, 설정 파일 작성
- `@codeb/logger` - 로깅
