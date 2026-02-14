# @codeb/auth

> 인증, 권한, Rate Limiting - API Key 기반 RBAC 시스템

## 역할

API Key 생성/검증, 역할 기반 접근 제어(RBAC), 요청 속도 제한을 담당한다.
현재 파일 기반 레지스트리(`/opt/codeb/registry/api-keys.json`)를 사용한다.

## 디렉토리 구조

```
packages/auth/src/
├── permissions.ts   ← 역할 계층 + 권한 매핑
├── rate-limiter.ts  ← 토큰 버킷 Rate Limiting
├── file-store.ts    ← 파일 기반 Key/Team 레지스트리
└── index.ts         ← Key 생성/검증/관리 + re-export
```

## API Key 시스템

### Key 형식

```
codeb_{teamId}_{role}_{randomToken}
```

예: `codeb_codeb-admin_owner_aBcDeFgHiJkLmNoPqRsT`

### Key Lifecycle

```
generateApiKey(teamId, role)
  → codeb_{teamId}_{role}_{base64url(18bytes)}
  → hashApiKey() → SHA-256 해시로 저장
  → parseApiKey() → teamId, role, token 파싱
```

## Exports

### Key Management

| 함수 | 설명 |
|------|------|
| `generateApiKey(teamId, role)` | 새 API Key 생성 |
| `hashApiKey(key)` | SHA-256 해시 |
| `parseApiKey(key)` | Key 파싱 → `{teamId, role, token}` |
| `verifyApiKey(key)` | Key 검증 → `AuthContext \| null` |
| `createApiKey(input, createdBy)` | Key 생성 + 레지스트리 저장 |
| `revokeApiKey(keyId)` | Key 삭제 |
| `listApiKeys(teamId)` | 팀 Key 목록 (민감 데이터 제외) |

### Permissions (RBAC)

| 함수/상수 | 설명 |
|----------|------|
| `ROLE_HIERARCHY` | `owner > admin > member > viewer` |
| `PERMISSIONS` | 역할별 허용 액션 매핑 |
| `hasPermission(role, action)` | 권한 확인 (boolean) |
| `checkPermission(role, action)` | 권한 확인 (throw on fail) |
| `getPermissions(role)` | 역할의 전체 권한 목록 |

### 역할 계층

| Role | 권한 |
|------|------|
| `owner` | 팀 삭제, 모든 작업 |
| `admin` | 멤버 관리, 토큰 관리 |
| `member` | 배포, promote, rollback |
| `viewer` | 조회만 |

### Rate Limiting

| export | 설명 |
|--------|------|
| `checkRateLimit(key, config?)` | 요청 제한 확인 → `RateLimitResult` |
| `rateLimitStore` | 인메모리 Rate Limit 저장소 |
| `RateLimitConfig` | `{windowMs, maxRequests}` |

### File Store

| 함수 | 설명 |
|------|------|
| `loadApiKeysRegistry()` | Key 레지스트리 로드 |
| `saveApiKeysRegistry(data)` | Key 레지스트리 저장 |
| `loadTeamsRegistry()` | Team 레지스트리 로드 |
| `saveTeamsRegistry(data)` | Team 레지스트리 저장 |

파일 경로: `/opt/codeb/registry/api-keys.json`, `teams.json`

## 의존성

- `@codeb/shared` - `ApiKey`, `AuthContext`, `TeamRole` 타입
- Node.js `crypto` - SHA-256, randomBytes
