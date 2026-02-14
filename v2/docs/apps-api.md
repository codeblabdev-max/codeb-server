# @codeb/api

> Express HTTP API 서버 - MCP Tool 프록시 + RESTful 엔드포인트

## 역할

CodeB 플랫폼의 중앙 API 서버. MCP 도구 실행, 인증, Rate Limiting,
로그 스트리밍, 감사 로그를 제공한다. Port 9101에서 실행.

## 디렉토리 구조

```
apps/api/src/
├── index.ts                ← Express 앱 부트스트랩 + 라우트 등록
├── router.ts               ← Feature 기반 라우터 + TOOL_REGISTRY
├── handlers/
│   ├── tool.handler.ts     ← POST /api/tool (MCP 도구 실행)
│   ├── health.handler.ts   ← GET /health
│   ├── audit.handler.ts    ← GET /api/audit
│   └── stream.handler.ts   ← GET /api/logs/stream (SSE)
└── middleware/
    ├── auth.ts             ← API Key 인증 미들웨어
    ├── cors.ts             ← CORS 설정
    ├── rate-limit.ts       ← 요청 속도 제한
    └── metrics.ts          ← Prometheus 메트릭 수집
```

## 엔드포인트

### Public (인증 불필요)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/health` | 서버 헬스체크 (version, uptime, status) |
| GET | `/api` | API 정보 (도구 목록, 기능 목록) |
| GET | `/metrics` | Prometheus 메트릭 (text format) |

### Protected (API Key 필요)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/tool` | MCP 도구 실행 (tool + params) |
| GET | `/api/logs/stream` | 실시간 로그 스트림 (SSE) |
| GET | `/api/audit` | 감사 로그 조회 |
| * | `/api/*` | Feature 라우터 (deploy, domain 등) |

### Tool Execution (POST /api/tool)

```json
// Request
{
  "tool": "deploy",
  "params": {
    "projectName": "myapp",
    "environment": "production",
    "image": "64.176.226.119:5000/myapp:abc123"
  }
}

// Response
{
  "success": true,
  "projectName": "myapp",
  "slot": "green",
  "previewUrl": "https://myapp-preview.codeb.kr"
}
```

## TOOL_REGISTRY

router.ts에서 feature 서비스를 도구명에 매핑:

| Tool Name | Feature Service | 메서드 |
|-----------|----------------|--------|
| `deploy` | DeployService | `deploy()` |
| `promote` / `slot_promote` | PromoteService | `promote()` |
| `rollback` | RollbackService | `rollback()` |
| `slot_status` | SlotService | `getStatus()` |
| `domain_setup` | DomainService | `setup()` |
| `domain_list` | DomainService | `list()` |
| `domain_delete` | DomainService | `delete()` |
| `workflow_init` | InitService | `init()` |
| `workflow_scan` | ScanService | `scan()` |
| `health_check` | HealthService | `check()` |
| `env_scan` | EnvService | `scan()` |
| `env_restore` | BackupService | `restore()` |

## Middleware Stack

```
Request
  → helmet()              ← 보안 헤더
  → cors()                ← CORS 허용
  → express.json(10mb)    ← Body 파싱
  → metrics()             ← 요청 메트릭 기록
  → auth()                ← API Key 검증 → AuthContext
  → rateLimit()           ← 속도 제한 (role별 차등)
  → handler()             ← 실제 처리
```

## 인증 흐름

```
X-API-Key 헤더
  → parseApiKey() → {teamId, role, token}
  → hashApiKey() → SHA-256
  → 레지스트리 조회 (api-keys.json)
  → 만료 확인
  → AuthContext 생성 → req.auth에 주입
```

## 의존성

- `express`, `helmet` - HTTP 서버
- `@codeb/shared` - 타입
- `@codeb/auth` - 인증, Rate Limiting
- `@codeb/logger` - 요청/감사 로깅
- `@codeb/feature-*` - 전체 feature 서비스
