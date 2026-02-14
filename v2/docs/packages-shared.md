# @codeb/shared

> 전체 모노레포가 공유하는 타입, 스키마, 상수, 에러 클래스

## 역할

모든 패키지와 feature가 의존하는 **SSOT(Single Source of Truth)** 패키지.
비즈니스 로직 없이 순수 타입 정의와 검증 스키마만 포함한다.

## 디렉토리 구조

```
packages/shared/src/
├── types/        ← TypeScript 인터페이스/타입
│   └── index.ts
├── schemas/      ← Zod 검증 스키마
│   └── index.ts
├── constants/    ← 서버 IP, 포트, 경로 등 상수
│   └── index.ts
├── errors/       ← 커스텀 에러 클래스
│   └── index.ts
└── index.ts      ← 통합 re-export
```

## Exports

### Types (`types/`)
프로젝트 전반에서 사용하는 TypeScript 인터페이스:

| 타입 | 설명 |
|------|------|
| `Project` | 프로젝트 정보 (이름, 팀, 포트, DB 등) |
| `Slot` | Blue-Green 슬롯 (color, status, port, image) |
| `Deployment` | 배포 이력 (version, image, status, timing) |
| `TeamRole` | `'owner' \| 'admin' \| 'member' \| 'viewer'` |
| `AuthContext` | 인증 컨텍스트 (apiKey, teamId, role, scopes) |
| `ApiKey` / `ApiKeyCreateInput` | API 키 생성/관리 |
| `SSHResult` | SSH 실행 결과 (stdout, stderr, code) |
| `ToolDefinition` / `ToolResult` | MCP 도구 정의 및 결과 |
| `ServerConfig` | 서버 설정 (ip, port, role) |

### Schemas (`schemas/`)
Zod 기반 런타임 검증 스키마:

| 스키마 | 설명 |
|--------|------|
| `deployInputSchema` | 배포 입력 검증 |
| `domainInputSchema` | 도메인 설정 검증 |
| `envInputSchema` | 환경변수 입력 검증 |
| `projectNameSchema` | 프로젝트명 패턴 검증 |

### Constants (`constants/`)

| 상수 | 설명 |
|------|------|
| `SERVERS` | 4-Server IP/역할 매핑 (app, streaming, storage, backup) |
| `PATHS` | 서버 디렉토리 경로 (`/opt/codeb/`, `/etc/caddy/` 등) |
| `PORTS` | 기본 포트 범위 (3001~9999) |
| `SLOT_COLORS` | `['blue', 'green']` |
| `SLOT_STATUSES` | `['empty', 'deployed', 'active', 'grace']` |

### Errors (`errors/`)

| 에러 클래스 | HTTP | 설명 |
|------------|------|------|
| `CodeBError` | - | 베이스 에러 클래스 |
| `AuthError` | 401/403 | 인증/권한 실패 |
| `NotFoundError` | 404 | 리소스 미발견 |
| `ValidationError` | 400 | 입력 검증 실패 |
| `ConflictError` | 409 | 상태 충돌 (이미 배포 중 등) |
| `SSHError` | 500 | SSH 연결/실행 실패 |

## 의존성

- `zod` - 런타임 스키마 검증
- 외부 의존성 최소화 (순수 타입 패키지)
