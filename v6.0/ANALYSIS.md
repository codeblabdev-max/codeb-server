# CodeB v6.0 CLI & MCP Server 상세 분석 보고서

> 분석 일시: 2026-01-11
> 분석 대상: v6.0/cli, v6.0/mcp-server

---

## 1. 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLI Client (we-cli)                          │
│  Framework: Commander.js + Ink React TUI                        │
│  Package: @codeblabdev-max/we-cli@6.0.4                        │
└────────────┬────────────────────────────────────────────────────┘
             │
             │ HTTPS + X-API-Key (Team-based)
             ↓
┌─────────────────────────────────────────────────────────────────┐
│                  MCP Server (HTTP API)                           │
│  Framework: Express.js + TypeScript + Zod                       │
│  Package: @codeblabdev-max/mcp-server@6.0.4                    │
│  Port: 9101 (https://api.codeb.kr/api)                         │
└────────────┬────────────────────────────────────────────────────┘
             │
             │ SSH (Private Key) - Connection Pool
             ↓
┌─────────────────────────────────────────────────────────────────┐
│                  App Server (158.247.203.55)                     │
│  - Caddy (Reverse Proxy)                                        │
│  - Podman + Quadlet (Container Management)                      │
│  - systemd (Service Management)                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 파일 구조

### 2.1 CLI (v6.0/cli/)

```
v6.0/cli/
├── src/
│   ├── index.tsx              # 엔트리포인트 (Commander.js)
│   ├── lib/
│   │   ├── config.ts          # 설정 저장 (Conf 라이브러리)
│   │   └── api-client.ts      # HTTP API 클라이언트
│   ├── commands/
│   │   ├── login.tsx          # 로그인 UI
│   │   ├── deploy.tsx         # 배포 UI
│   │   ├── promote.tsx        # Promote UI
│   │   ├── rollback.tsx       # Rollback UI
│   │   ├── whoami.tsx         # 사용자 정보
│   │   └── migrate.tsx        # 마이그레이션 명령어
│   └── components/
│       ├── DeployProgress.tsx # 실시간 진행률 컴포넌트
│       ├── SlotStatus.tsx     # Slot 상태 시각화
│       ├── LogViewer.tsx      # 로그 스트리밍
│       └── InteractiveApp.tsx # Full-screen TUI
└── package.json
```

### 2.2 MCP Server (v6.0/mcp-server/)

```
v6.0/mcp-server/
├── src/
│   ├── index.ts               # Express 서버 엔트리포인트
│   ├── lib/
│   │   ├── auth.ts            # 인증/인가 시스템
│   │   ├── types.ts           # TypeScript 타입 정의
│   │   ├── ssh.ts             # SSH 연결 풀
│   │   ├── servers.ts         # 서버 설정
│   │   ├── database.ts        # PostgreSQL 연결
│   │   ├── logger.ts          # Winston 로거
│   │   ├── metrics.ts         # Prometheus 메트릭
│   │   ├── log-stream.ts      # SSE 로그 스트리밍
│   │   ├── edge-types.ts      # Edge Function 타입
│   │   ├── analytics-types.ts # Analytics 타입
│   │   └── legacy-adapter.ts  # 레거시 시스템 호환
│   └── tools/
│       ├── deploy.ts          # Blue-Green 배포
│       ├── promote.ts         # 트래픽 전환
│       ├── rollback.ts        # 롤백
│       ├── slot.ts            # Slot 관리
│       ├── team.ts            # 팀 관리
│       ├── edge.ts            # Edge Functions
│       ├── analytics.ts       # Analytics
│       ├── domain.ts          # 도메인 관리
│       ├── workflow.ts        # 프로젝트 초기화
│       ├── migrate.ts         # 마이그레이션
│       ├── migrate-safe.ts    # 안전 마이그레이션
│       └── env-migrate.ts     # ENV 마이그레이션
└── package.json
```

---

## 3. 구현 상태 분석

### 3.1 완전히 구현됨 (Production Ready)

| 기능 | 파일 | 상태 | 설명 |
|------|------|------|------|
| **인증 시스템** | `lib/auth.ts` | ✅ 완료 | Team-based API Key, RBAC, Rate Limiting |
| **Deploy** | `tools/deploy.ts` | ✅ 완료 | Quadlet 생성, systemd 관리, Health Check |
| **Promote** | `tools/promote.ts` | ✅ 완료 | Caddy 설정 생성, Zero-downtime 전환 |
| **Rollback** | `tools/rollback.ts` | ✅ 완료 | Grace Slot 복원 |
| **Slot 관리** | `tools/slot.ts` | ✅ 완료 | 상태 조회, Cleanup |
| **SSH 연결 풀** | `lib/ssh.ts` | ✅ 완료 | 연결 재사용, Idle Timeout, Path Validation |
| **Prometheus 메트릭** | `lib/metrics.ts` | ✅ 완료 | Request/Tool 메트릭 수집 |
| **Audit Logging** | `lib/database.ts` | ✅ 완료 | PostgreSQL 저장, SSE 브로드캐스트 |

### 3.2 부분적 구현 (Needs Improvement)

| 기능 | 파일 | 상태 | 문제점 |
|------|------|------|--------|
| **Edge Functions** | `tools/edge.ts` | ⚠️ 부분 | Edge Runtime 서버 미구현 (Port 9200) |
| **Analytics** | `tools/analytics.ts` | ⚠️ 부분 | Prometheus 메트릭 미수집, 더미 데이터 다수 |
| **CLI Deploy UI** | `commands/deploy.tsx` | ⚠️ 부분 | 실제 API 호출 전 단계 시뮬레이션 |
| **Team 관리** | `tools/team.ts` | ⚠️ 부분 | Registry 파일 기반, DB 미연동 |

### 3.3 미구현 (TODO)

| 기능 | 파일 | 상태 | 설명 |
|------|------|------|------|
| **실시간 진행률** | CLI | ❌ 미구현 | SSE/WebSocket 기반 실제 진행률 |
| **logs 명령어** | `index.tsx:484` | ❌ 미구현 | "coming soon" 상태 |
| **edge 명령어** | `index.tsx:405` | ❌ 미구현 | "coming soon" 상태 |
| **team 명령어** | `index.tsx:469` | ❌ 미구현 | "coming soon" 상태 |
| **link 명령어** | `index.tsx:148` | ❌ 미구현 | TODO 주석 |
| **Analytics SDK** | - | ❌ 미구현 | 클라이언트 수집 SDK 없음 |

---

## 4. 상세 코드 분석

### 4.1 인증 시스템 (lib/auth.ts)

**강점:**
- API Key 형식: `codeb_{teamId}_{role}_{token}` - 파싱 용이
- SHA256 해시로 저장 (평문 저장 안함)
- Role Hierarchy: `viewer < member < admin < owner`
- 50+ 권한 정의 (세분화됨)
- In-memory Rate Limiting (100 req/60s)

**문제점:**
```typescript
// 개발 모드에서 모든 권한 부여 - 보안 위험
if (process.env.NODE_ENV === 'development') {
  return {
    ...
    scopes: ['*'],
    projects: ['*'], // All projects in dev mode
  };
}
```

**개선 필요:**
- Rate Limiting이 In-memory (서버 재시작 시 초기화)
- Redis 기반 분산 Rate Limiting 필요

---

### 4.2 Deploy Tool (tools/deploy.ts)

**흐름:**
1. Team 권한 검증 → 2. Slot 상태 조회/초기화 → 3. 비활성 Slot 선택
4. Quadlet 파일 생성 → 5. systemd daemon-reload → 6. Container 시작
7. Health Check (60초) → 8. Registry 업데이트

**Quadlet 생성 예시:**
```ini
[Container]
Image=ghcr.io/codeb/myapp:v1.0.0
ContainerName=myapp-staging-green
PublishPort=3001:3000
EnvironmentFile=/opt/codeb/projects/myapp/.env.staging
HealthCmd=curl -f http://localhost:3000/health || exit 1
PodmanArgs=--memory=512m --cpus=1
```

**강점:**
- 포트 충돌 방지 (SSOT + podman ps + ss 명령어로 3중 체크)
- Health Check 실패 시 자동 롤백 (컨테이너 중지)

**문제점:**
```typescript
// 이미지 기본값이 하드코딩됨
const imageUrl = input.image || `ghcr.io/codeb/${projectName}:${version}`;
```

---

### 4.3 SSH 연결 풀 (lib/ssh.ts)

**설정:**
- 최대 5개 연결/호스트
- Idle Timeout: 60초
- Connection Timeout: 30초

**보안:**
```typescript
// Path Traversal 방지
private validatePath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (path.includes('..')) return false;

  const allowedPaths = [
    '/opt/codeb/',
    '/etc/caddy/',
    '/var/log/',
    '/tmp/',
  ];
  return allowedPaths.some(base => path.startsWith(base));
}
```

**강점:**
- 연결 재사용으로 성능 향상
- Path Whitelist로 보안 강화
- Heredoc 사용으로 Shell Injection 방지

---

### 4.4 CLI Deploy UI (commands/deploy.tsx)

**문제점:**
```typescript
// API 호출 전에 가짜 진행률 표시
updateStep('get_slot_status', { status: 'running' });
await sleep(300);  // 실제 작업이 아닌 고정 대기
updateStep('get_slot_status', { status: 'success', duration: 300 });

// ... 중간 단계 모두 시뮬레이션 ...

// 실제 API는 한 번만 호출
const result = await client.deploy({...});
```

**개선 필요:**
- MCP 서버에서 SSE로 실제 진행 상황 스트리밍
- CLI에서 실시간 업데이트 수신

---

### 4.5 Edge Functions (tools/edge.ts)

**구현된 부분:**
- 함수 파일 생성/삭제
- Manifest 관리
- Caddy 라우팅 설정

**미구현:**
```typescript
// Edge Runtime 서버가 없음 - curl이 실패할 것
await ssh.exec(
  `curl -sf -X POST http://localhost:${EDGE_RUNTIME_PORT}/reload?project=${projectName} || true`
);
// EDGE_RUNTIME_PORT = 9200 서버 없음
```

---

### 4.6 Analytics (tools/analytics.ts)

**구현된 부분:**
- Prometheus 쿼리 헬퍼
- Web Vitals 점수 계산 로직
- Speed Insights 권장사항 생성

**미구현:**
```typescript
// 실제 메트릭이 수집되지 않아 0 반환
const pageViews = await queryPrometheus(`sum(...codeb_analytics_pageviews_total...)`);
// → Prometheus에 해당 메트릭 없음

// 더미 데이터로 대체
deviceBreakdown: { desktop: 60, mobile: 35, tablet: 5 }, // Default estimate
```

---

## 5. 개선 권장사항

### 5.1 높은 우선순위 (Critical)

#### 1. CLI 실시간 진행률 구현
```typescript
// MCP Server: SSE 엔드포인트 확장
app.get('/api/deploy/stream/:deployId', authMiddleware, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  // 각 단계 완료 시 이벤트 전송
});

// CLI: EventSource로 수신
const es = new EventSource(`${apiUrl}/deploy/stream/${deployId}`);
es.onmessage = (event) => {
  const step = JSON.parse(event.data);
  updateStep(step.name, step);
};
```

#### 2. Redis 기반 Rate Limiting
```typescript
// 현재: In-memory (서버 재시작 시 초기화)
const rateLimitStore: Map<string, {...}> = new Map();

// 개선: Redis 사용
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

export async function checkRateLimit(keyId: string) {
  const key = `ratelimit:${keyId}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  return { allowed: count <= 100, remaining: 100 - count };
}
```

#### 3. 개발 모드 보안 강화
```typescript
// 현재: 개발 모드에서 모든 권한
if (process.env.NODE_ENV === 'development') {
  return { projects: ['*'] };
}

// 개선: 개발 모드에서도 제한적 권한
if (process.env.NODE_ENV === 'development') {
  return {
    projects: ['test-*', 'dev-*'], // 테스트 프로젝트만
    scopes: PERMISSIONS.member,    // member 권한만
  };
}
```

### 5.2 중간 우선순위 (Important)

#### 4. Analytics SDK 구현
```typescript
// @codeb/analytics-sdk
export function CodeBAnalytics({ projectId }: Props) {
  useEffect(() => {
    // Web Vitals 수집
    onLCP((metric) => sendMetric('LCP', metric));
    onCLS((metric) => sendMetric('CLS', metric));
    onINP((metric) => sendMetric('INP', metric));
  }, []);
}

async function sendMetric(name: string, metric: Metric) {
  await fetch('https://api.codeb.kr/api/analytics/collect', {
    method: 'POST',
    body: JSON.stringify({ name, value: metric.value, rating: metric.rating }),
  });
}
```

#### 5. Edge Runtime 서버 구현
```typescript
// Deno 기반 Edge Runtime
// v6.0/edge-runtime/src/index.ts
import { serve } from 'https://deno.land/std/http/server.ts';

serve(async (req) => {
  const url = new URL(req.url);
  const [, project, fn] = url.pathname.split('/');

  const code = await Deno.readTextFile(`/opt/codeb/edge-functions/${project}/functions/${fn}.ts`);
  const module = await import(`data:text/typescript,${encodeURIComponent(code)}`);

  return await module.default(req);
}, { port: 9200 });
```

### 5.3 낮은 우선순위 (Nice to Have)

#### 6. CLI 명령어 완성
- `we logs` - 실시간 로그 스트리밍
- `we edge` - Edge Function 관리
- `we team` - 팀 관리
- `we link` - 프로젝트 연결

#### 7. 테스트 커버리지 확대
현재 테스트 파일:
- `src/__tests__/database.test.ts`
- `src/__tests__/metrics.test.ts`
- `src/__tests__/log-stream.test.ts`

필요한 테스트:
- `auth.test.ts` - 인증/인가 로직
- `deploy.test.ts` - 배포 흐름
- `ssh.test.ts` - SSH 연결 풀

---

## 6. Tool 목록 (실제 46개)

### 실제 등록된 Tools (index.ts TOOLS 객체)

| 카테고리 | Tool 이름 | 권한 |
|----------|-----------|------|
| **Team** | team_create, team_list, team_get, team_delete, team_settings | owner/viewer |
| **Member** | member_invite, member_remove, member_list | admin/viewer |
| **Token** | token_create, token_revoke, token_list | member |
| **Deploy** | deploy, deploy_project, promote, slot_promote, rollback | member |
| **Slot** | slot_status, slot_cleanup, slot_list | viewer/admin |
| **Edge** | edge_deploy, edge_list, edge_logs, edge_delete, edge_invoke, edge_metrics | member/viewer |
| **Analytics** | analytics_overview, analytics_webvitals, analytics_deployments, analytics_realtime, analytics_speed_insights | viewer |
| **Migration** | migrate_detect, migrate_plan, migrate_execute, migrate_rollback | member |
| **ENV** | env_migrate, env_scan, env_restore, env_backup_list | member/viewer |
| **Safe Migration** | migrate_safe, migrate_safe_rollback, migrate_generate_workflow | member |
| **Domain** | domain_setup, domain_verify, domain_list, domain_delete, ssl_status | member/viewer |
| **Workflow** | workflow_init, workflow_scan | member |

---

## 7. 결론

### 잘 구현된 부분
1. **인증 시스템** - Team-based API Key + RBAC이 체계적
2. **Blue-Green 배포** - Quadlet + Caddy 조합이 효과적
3. **SSH 연결 풀** - 성능과 보안 모두 고려됨
4. **Prometheus 메트릭** - 기본 모니터링 인프라 갖춤

### 개선이 필요한 부분
1. **CLI 진행률** - 시뮬레이션이 아닌 실제 진행률 필요
2. **Analytics** - 실제 데이터 수집 파이프라인 없음
3. **Edge Functions** - Runtime 서버 미구현
4. **Rate Limiting** - Redis 기반으로 변경 필요

### 다음 단계
1. SSE 기반 실시간 배포 진행률 구현
2. Analytics SDK 개발 및 Prometheus 메트릭 수집
3. Edge Runtime (Deno 기반) 개발
4. CLI 미구현 명령어 완성
