# @codeb/feature-monitoring

> 인프라 헬스체크, Prometheus 메트릭, 실시간 로그 스트리밍

## 역할

4개 서버의 건강 상태를 점검하고, Prometheus 메트릭을 수집/노출하며,
배포 및 컨테이너 로그를 실시간 스트리밍한다.

## 디렉토리 구조

```
features/monitoring/src/
├── health.service.ts      ← 인프라 헬스체크 (4-Server)
├── metrics.service.ts     ← Prometheus 메트릭 수집/노출
├── log-stream.service.ts  ← 실시간 로그 스트리밍 (SSE)
└── index.ts
```

## Services

### HealthService

4개 서버의 상태를 점검한다.

| 주요 메서드 | 설명 |
|------------|------|
| `check(server?)` | 서버 상태 점검 (`'all'`, `'app'`, `'storage'` 등) |

**점검 항목:**
- SSH 연결 가능 여부
- Docker 데몬 상태
- 디스크 사용량
- 메모리/CPU
- 컨테이너 목록 (실행 중/정지)
- 서비스 상태 (Caddy, PostgreSQL, Redis 등)

**결과 타입:**

```typescript
interface InfraStatusResult {
  server: string;
  status: 'healthy' | 'degraded' | 'down';
  uptime: string;
  disk: { total: string; used: string; percent: string };
  memory: { total: string; used: string; percent: string };
  containers: ContainerInfo[];
  slots: SlotInfo[];
}
```

### MetricsService

Prometheus 형식의 메트릭을 수집/노출한다.

| 주요 메서드 | 설명 |
|------------|------|
| `collect()` | 전체 메트릭 수집 |
| `getPrometheusText()` | Prometheus text 형식 출력 |
| `recordRequest(meta)` | HTTP 요청 메트릭 기록 |
| `recordDeployment(meta)` | 배포 메트릭 기록 |

**수집 메트릭:**
- `codeb_api_requests_total` - API 요청 수
- `codeb_api_request_duration_seconds` - 요청 응답 시간
- `codeb_deployments_total` - 배포 횟수
- `codeb_active_slots` - 활성 슬롯 수

### LogStreamService

SSE(Server-Sent Events)로 로그를 실시간 스트리밍한다.

| 주요 메서드 | 설명 |
|------------|------|
| `streamLogs(filter, res)` | SSE 로그 스트림 시작 |
| `getBuildLogs(projectName, deployId)` | 빌드 로그 조회 |
| `tail(projectName, opts)` | 컨테이너 로그 tail |

**필터 옵션:**

```typescript
interface LogFilter {
  projectName?: string;
  level?: 'error' | 'warn' | 'info' | 'debug';
  type?: 'deploy' | 'http' | 'audit';
  since?: string;      // ISO date
}

interface TailOptions {
  lines?: number;      // 기본 100줄
  follow?: boolean;    // 실시간 추적
  container?: string;  // 특정 컨테이너
}
```

## 4-Server 아키텍처

| 서버 | IP | 점검 대상 |
|------|-----|----------|
| App | 158.247.203.55 | MCP API, Caddy, Docker 컨테이너 |
| Streaming | 141.164.42.213 | Centrifugo WebSocket |
| Storage | 64.176.226.119 | PostgreSQL, Redis |
| Backup | 141.164.37.63 | Prometheus, Grafana |

## 의존성

- `@codeb/shared` - 서버 상수, 타입
- `@codeb/db` - 배포 이력 조회
- `@codeb/ssh` - 원격 서버 상태 점검
- `@codeb/logger` - 로그 파일 읽기
