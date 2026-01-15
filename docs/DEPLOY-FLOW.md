# CodeB v7.0 - 배포 플로우 가이드

> Blue-Green 배포 시스템의 전체 흐름과 각 단계별 동작

---

## 배포 흐름 개요

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CodeB v7.0 배포 플로우                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   /we:deploy                /we:promote               /we:rollback          │
│       │                         │                         │                 │
│       ▼                         ▼                         ▼                 │
│  ┌─────────┐              ┌─────────┐              ┌─────────┐             │
│  │ Preview │    검증 후   │ Active  │   문제 시   │ Rollback│             │
│  │   URL   │ ───────────▶ │  전환   │ ◀────────── │         │             │
│  └─────────┘              └─────────┘              └─────────┘             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. 배포 단계 (`/we:deploy`)

### 1.1 흐름도

```
┌──────────────────┐
│  /we:deploy      │
│  projectName     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     실패
│ 1. MCP 인증      │────────────▶ Access Denied
│    (API Key)     │
└────────┬─────────┘
         │ 성공
         ▼
┌──────────────────┐     신규 프로젝트
│ 2. Slot Registry │────────────────────────┐
│    조회          │                        │
└────────┬─────────┘                        │
         │ 기존 프로젝트                    │
         ▼                                  ▼
┌──────────────────┐              ┌──────────────────┐
│ 3. 반대 슬롯     │              │ 3. 포트 할당     │
│    선택          │              │    (SSOT)        │
│ (blue↔green)     │              │ prod: 4100-4499  │
└────────┬─────────┘              └────────┬─────────┘
         │                                 │
         └─────────────┬───────────────────┘
                       ▼
         ┌──────────────────┐     실패
         │ 4. Docker Pull   │────────────▶ 롤백
         │    (이미지)      │
         └────────┬─────────┘
                  │ 성공
                  ▼
         ┌──────────────────┐
         │ 5. 기존 컨테이너 │
         │    정리          │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐     실패
         │ 6. Docker Run    │────────────▶ 롤백
         │    (새 컨테이너) │
         └────────┬─────────┘
                  │ 성공
                  ▼
         ┌──────────────────┐     실패 (60초 타임아웃)
         │ 7. Health Check  │────────────▶ 컨테이너 정리
         │    - Docker      │
         │    - curl /health│
         └────────┬─────────┘
                  │ 성공
                  ▼
         ┌──────────────────┐
         │ 8. Registry      │
         │    업데이트      │
         │  (File + DB)     │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ ✅ Preview URL   │
         │ 반환             │
         └──────────────────┘
```

### 1.2 상세 설명

| 단계 | 파일 | 함수 | 설명 |
|------|------|------|------|
| 1 | index.ts | authMiddleware | API Key 검증, 팀/프로젝트 권한 확인 |
| 2 | slot.ts | getSlotRegistry | 파일 기반 slot registry 조회 |
| 3 | deploy.ts | allocateBasePort | SSOT + Docker + ss 3중 확인 |
| 4 | deploy.ts | executeDeploy | `docker pull` 실행 |
| 5 | deploy.ts | executeDeploy | `docker stop/rm` 기존 컨테이너 |
| 6 | deploy.ts | executeDeploy | `docker run` 새 컨테이너 |
| 7 | deploy.ts | waitForHealthy | 3단계 헬스체크 |
| 8 | slot.ts | updateSlotRegistry | 파일 + PostgreSQL 동기화 |

### 1.3 헬스체크 순서

```
1. Docker healthcheck 상태 확인 (가장 신뢰성 있음)
   docker inspect --format '{{.State.Health.Status}}'

2. 컨테이너 내부 curl (네트워크 우회)
   docker exec {container} curl -sf http://localhost:3000/health

3. 호스트에서 직접 curl (fallback)
   curl -sf http://localhost:{port}/health
```

---

## 2. 프로모트 단계 (`/we:promote`)

### 2.1 흐름도

```
┌──────────────────┐
│  /we:promote     │
│  projectName     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     실패
│ 1. Slot Registry │────────────▶ Error
│    조회          │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     state != 'deployed'
│ 2. 배포 상태     │────────────▶ "Run deploy first"
│    확인          │
└────────┬─────────┘
         │ state == 'deployed'
         ▼
┌──────────────────┐     HTTP 2xx/3xx 아님
│ 3. Final Health  │────────────▶ Health Check Failed
│    Check         │
└────────┬─────────┘
         │ 성공
         ▼
┌──────────────────┐
│ 4. Caddy 설정    │
│    생성          │
│  (caddy.ts)      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 5. Caddy Reload  │  ◀── 무중단 (0초 다운타임)
│  (systemctl)     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 6. Slot 상태     │
│    업데이트      │
│ - 새 슬롯: active│
│ - 이전: grace    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ ✅ Production    │
│    URL 반환      │
└──────────────────┘
```

### 2.2 Caddy 설정 구조

```caddyfile
# /etc/caddy/sites/{projectName}-{environment}.caddy

project.codeb.kr {
  reverse_proxy localhost:4100 localhost:4101 {
    lb_policy first       # 첫 번째 포트 우선 (active)
    fail_duration 10s     # 실패 시 10초간 두 번째로 전환
    health_uri /health
    health_interval 10s
    health_timeout 5s
  }
  encode gzip
  header {
    X-CodeB-Project {projectName}
    X-CodeB-Version {version}
    X-CodeB-Slot {activeSlot}
    X-CodeB-Environment {environment}
    -Server
  }
  log {
    output file /var/log/caddy/{projectName}.log
  }
}
```

---

## 3. 롤백 단계 (`/we:rollback`)

### 3.1 흐름도

```
┌──────────────────┐
│  /we:rollback    │
│  projectName     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     grace 슬롯 없음
│ 1. Grace 슬롯    │────────────▶ "No grace slot"
│    확인          │
└────────┬─────────┘
         │ grace 슬롯 존재
         ▼
┌──────────────────┐     HTTP 2xx/3xx 아님
│ 2. Grace 슬롯    │────────────▶ "Grace slot unhealthy"
│    헬스체크      │
└────────┬─────────┘
         │ 성공
         ▼
┌──────────────────┐
│ 3. Caddy 설정    │  ◀── promote와 동일
│    업데이트      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 4. Slot 상태     │
│    스왑          │
│ - grace → active │
│ - active → grace │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ ✅ Rollback      │
│    완료          │
└──────────────────┘
```

---

## 4. 포트 할당 전략

### 4.1 포트 범위

| 환경 | 범위 | 예시 |
|------|------|------|
| Production | 4100-4499 | blue: 4100, green: 4101 |
| Staging | 4500-4999 | blue: 4500, green: 4501 |
| Preview | 5000-5499 | blue: 5000, green: 5001 |

### 4.2 SSOT 구조

```json
// /opt/codeb/registry/ssot.json
{
  "ports": {
    "used": [4100, 4101, 4102, 4103],
    "allocated": {
      "4100": "project-a",
      "4101": "project-a",
      "4102": "project-b",
      "4103": "project-b"
    }
  }
}
```

### 4.3 포트 할당 로직

```
1. SSOT 파일에서 등록된 포트 조회
2. 실행 중인 Docker 컨테이너 포트 조회
3. ss/netstat으로 리스닝 포트 조회
4. 모든 소스 결합 → 다음 사용 가능한 짝수 포트 할당
   (blue: 짝수, green: 홀수)
```

---

## 5. Slot 상태 전이

```
┌─────────┐     deploy      ┌──────────┐    promote     ┌────────┐
│  empty  │ ───────────────▶│ deployed │ ──────────────▶│ active │
└─────────┘                 └──────────┘                └────────┘
     ▲                                                       │
     │                                                       │
     │                    ┌─────────┐                        │
     │    cleanup         │  grace  │◀───────────────────────┘
     └────────────────────│(48시간) │       promote (다른 슬롯)
                          └─────────┘
```

| 상태 | 설명 | 전이 조건 |
|------|------|----------|
| empty | 빈 슬롯 | cleanup 완료 |
| deployed | 배포됨 (대기) | deploy 성공 |
| active | 프로덕션 트래픽 | promote 성공 |
| grace | 롤백 대기 (48h) | 다른 슬롯 promote |

---

## 6. 데이터 흐름

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           데이터 저장소                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐        ┌─────────────────┐                        │
│  │   파일 시스템    │        │   PostgreSQL    │                        │
│  │   (Primary)     │ ─────▶ │   (Secondary)   │                        │
│  └─────────────────┘  동기화 └─────────────────┘                        │
│          │                          │                                   │
│          │                          │                                   │
│  /opt/codeb/registry/        teams, api_keys,                          │
│  ├── ssot.json               projects, project_slots,                  │
│  └── slots/                  deployments, audit_logs                   │
│      ├── project-a-prod.json                                           │
│      └── project-b-staging.json                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.1 동기화 전략

- **Write**: 파일 먼저 → DB 동기화 (실패해도 계속)
- **Read**: 파일 기반 (Primary Source)
- **Query**: DB 사용 (팀별 조회, 검색 등)

---

## 7. 관련 파일

| 파일 | 역할 |
|------|------|
| `mcp-server/src/tools/deploy.ts` | 배포 실행 |
| `mcp-server/src/tools/promote.ts` | 트래픽 전환 |
| `mcp-server/src/tools/rollback.ts` | 롤백 실행 |
| `mcp-server/src/tools/slot.ts` | Slot 레지스트리 관리 |
| `mcp-server/src/lib/caddy.ts` | Caddy 설정 통합 관리 |
| `mcp-server/src/lib/database.ts` | PostgreSQL 연동 |
| `mcp-server/src/lib/ssh.ts` | SSH 연결 관리 |

---

## 8. 에러 처리

### 8.1 배포 실패 시

```
1. Docker 이미지 pull 실패 → 즉시 종료, 이전 상태 유지
2. 컨테이너 시작 실패 → 컨테이너 정리, 이전 상태 유지
3. 헬스체크 실패 → 컨테이너 정리, 이전 상태 유지
```

### 8.2 프로모트 실패 시

```
1. 슬롯 상태 불일치 → "Run deploy first" 반환
2. 헬스체크 실패 → 프로모트 중단, 이전 트래픽 유지
3. Caddy 설정 실패 → 백업에서 복원
```

---

## 버전

- **문서 버전**: v7.0.54
- **최종 업데이트**: 2026-01-15
