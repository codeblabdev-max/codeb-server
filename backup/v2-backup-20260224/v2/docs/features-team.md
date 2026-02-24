# @codeb/feature-team

> 팀 관리, 멤버 초대/제거, API 토큰 발급/폐기

## 역할

멀티 테넌트 팀 시스템을 관리한다. 팀 생성/삭제, 멤버 초대/제거,
API 토큰 발급/폐기를 담당한다.

## 디렉토리 구조

```
features/team/src/
├── team.service.ts    ← 팀 CRUD
├── member.service.ts  ← 멤버 관리 (초대/제거/목록)
├── token.service.ts   ← API 토큰 관리 (생성/폐기/목록)
└── index.ts
```

## Services

### TeamService

팀 생성, 조회, 삭제, 설정을 관리한다.

| 주요 메서드 | 설명 |
|------------|------|
| `create(input: TeamCreateInput)` | 팀 생성 |
| `get(teamId)` | 팀 정보 조회 |
| `list()` | 전체 팀 목록 |
| `delete(teamId)` | 팀 삭제 (owner만) |
| `updateSettings(teamId, settings)` | 팀 설정 변경 |

### MemberService

팀 멤버를 관리한다.

| 주요 메서드 | 설명 |
|------------|------|
| `invite(input: MemberInviteInput)` | 멤버 초대 (역할 지정) |
| `remove(input: MemberRemoveInput)` | 멤버 제거 |
| `list(teamId)` | 멤버 목록 |
| `updateRole(teamId, memberId, role)` | 역할 변경 |

### TokenService

API 토큰을 관리한다.

| 주요 메서드 | 설명 |
|------------|------|
| `create(input: TokenCreateInput)` | 토큰 생성 → Key 반환 (1회만 노출) |
| `revoke(tokenId)` | 토큰 폐기 |
| `list(teamId)` | 토큰 목록 (해시 제외) |

## 타입 정의

```typescript
interface TeamCreateInput {
  name: string;
  description?: string;
}

interface MemberInviteInput {
  teamId: string;
  email: string;
  role: TeamRole;      // 'admin' | 'member' | 'viewer'
}

interface TokenCreateInput {
  teamId: string;
  name: string;
  role: TeamRole;
  scopes?: string[];
  expiresAt?: string;  // ISO date
}
```

## 역할 계층

```
owner  → 팀 삭제, 모든 작업
admin  → 멤버 관리, 토큰 관리, 배포
member → 배포, promote, rollback
viewer → 조회만
```

## 의존성

- `@codeb/shared` - `TeamRole`, `AuthContext` 타입
- `@codeb/db` - TeamRepo
- `@codeb/auth` - API Key 생성/검증, 권한 확인
- `@codeb/logger` - 감사 로깅
