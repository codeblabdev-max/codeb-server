# @codeb/logger

> Winston 기반 구조화 로깅 - JSON 포맷, 감사 추적, 민감 데이터 마스킹

## 역할

모든 API 요청, 배포 이벤트, 감사 로그를 구조화된 JSON 형식으로 기록한다.
프로덕션에서는 파일 로테이션, 개발 환경에서는 컬러 콘솔 출력.

## 디렉토리 구조

```
packages/logger/src/
├── transports.ts   ← Winston Transport 생성 (콘솔, 파일, 감사)
├── sanitizer.ts    ← 민감 데이터 마스킹 (API Key, 비밀번호 등)
└── index.ts        ← Logger 싱글톤 + ContextualLogger + HTTP 로깅
```

## Exports

### Logger Instance

| export | 설명 |
|--------|------|
| `logger` (default) | Winston Logger 싱글톤 |

### Contextual Logging

| 함수/클래스 | 설명 |
|------------|------|
| `createContextualLogger(ctx)` | 요청 컨텍스트 포함 로거 생성 |
| `generateCorrelationId()` | 16자리 hex 상관 ID 생성 |

#### ContextualLogger 메서드

| 메서드 | 설명 |
|--------|------|
| `info(msg, meta?)` | 정보 로그 |
| `error(msg, meta?)` | 에러 로그 |
| `warn(msg, meta?)` | 경고 로그 |
| `debug(msg, meta?)` | 디버그 로그 |
| `audit(action, meta)` | 감사 로그 (`type: 'audit'`) |
| `deploy(phase, meta)` | 배포 로그 (`type: 'deploy'`) |

### HTTP Request Logging

| 함수 | 설명 |
|------|------|
| `logHttpRequest(meta)` | HTTP 요청 로그 (method, url, status, duration) |

### Data Sanitization

| export | 설명 |
|--------|------|
| `SENSITIVE_KEYS` | 마스킹 대상 키 목록 (password, apiKey, token 등) |
| `maskSensitiveData(data)` | 민감 필드 자동 마스킹 |

## Transport 구성

| Transport | 환경 | 파일 | 설명 |
|-----------|------|------|------|
| Console | 전체 | - | 개발: 컬러, 프로덕션: JSON |
| Error File | production | `logs/error.log` | error 레벨만, 일별 로테이션 |
| Combined File | production | `logs/combined.log` | 전체 레벨, 크기 제한 |
| Audit File | production | `logs/audit.log` | 감사 로그 전용 |

## RequestContext 인터페이스

```typescript
interface RequestContext {
  correlationId: string;
  teamId?: string;
  keyId?: string;
  role?: string;
  ip?: string;
  userAgent?: string;
}
```

## 의존성

- `winston` - 로깅 프레임워크
- Node.js `crypto` - Correlation ID 생성
