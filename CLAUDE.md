# CLAUDE.md v6.0 - CodeB Unified Deployment System

> **Team-based API Key Authentication + Blue-Green Deployment + Edge Functions + Analytics + Beautiful CLI DX**

---

## Vercel 수준 달성 (v6.0)

```
┌─────────────────────────────────────────────────────────────────┐
│                  CodeB v6.0 vs Vercel 비교                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Feature             │ Vercel │ CodeB v6.0 │ Rating             │
│  ────────────────────┼────────┼────────────┼──────────────────  │
│  Blue-Green Deploy   │   ✅   │     ✅     │ ⭐⭐⭐⭐⭐         │
│  Zero-Downtime       │   ✅   │     ✅     │ ⭐⭐⭐⭐⭐         │
│  Instant Rollback    │   ✅   │     ✅     │ ⭐⭐⭐⭐⭐         │
│  Team RBAC           │   ✅   │     ✅     │ ⭐⭐⭐⭐⭐         │
│  Preview URL         │   ✅   │     ✅     │ ⭐⭐⭐⭐⭐         │
│  Edge Functions      │   ✅   │     ✅     │ ⭐⭐⭐⭐⭐         │
│  Analytics/Vitals    │   ✅   │     ✅     │ ⭐⭐⭐⭐⭐         │
│  CLI DX              │   ✅   │     ✅     │ ⭐⭐⭐⭐⭐         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## v6.0 주요 변경사항

```
┌─────────────────────────────────────────────────────────────────┐
│                    CodeB v6.0 New Features                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Team-based API Key Authentication (Vercel 스타일)           │
│     └─→ API Key 형식: codeb_{teamId}_{role}_{token}             │
│     └─→ 역할: owner > admin > member > viewer                  │
│                                                                 │
│  2. Edge Functions (Deno Runtime)                               │
│     └─→ 4가지 타입: middleware, api, rewrite, redirect         │
│     └─→ Regional deployment with CDN routing                   │
│     └─→ 6개 도구: deploy, list, logs, delete, invoke, metrics  │
│                                                                 │
│  3. Real-time Analytics & Web Vitals                            │
│     └─→ Web Vitals: LCP, FID, CLS, TTFB, FCP, INP              │
│     └─→ Speed Insights: Vercel 스타일 점수 (0-100)             │
│     └─→ 실시간 방문자 및 이벤트 추적                            │
│     └─→ SDK: React, Next.js App Router, Pages Router 지원      │
│                                                                 │
│  4. Beautiful CLI DX (Ink React TUI)                            │
│     └─→ 실시간 배포 진행률 with spinners                        │
│     └─→ Interactive 프로젝트 선택                               │
│     └─→ 로그 스트리밍 with 필터링                               │
│     └─→ CI-friendly 모드 (--ci flag)                           │
│                                                                 │
│  5. TypeScript MCP Server                                       │
│     └─→ Express + TypeScript + Zod 기반 HTTP API               │
│     └─→ 30개 API Tool 지원                                     │
│     └─→ Rate limiting + Audit logging                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 핵심 원칙

### Blue-Green 배포 (Vercel 스타일)

```
┌─────────────────────────────────────────────────────────────────┐
│                    CodeB v6.0 배포 흐름                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. we deploy myapp                                             │
│     └─→ 비활성 Slot에 배포 → Preview URL 반환                    │
│         https://myapp-green.preview.codeb.dev                   │
│                                                                 │
│  2. we promote myapp                                            │
│     └─→ Caddy 설정만 변경 → 무중단 트래픽 전환                    │
│         이전 Slot → grace 상태 (48시간 유지)                     │
│                                                                 │
│  3. we rollback myapp                                           │
│     └─→ 즉시 이전 버전으로 롤백 (grace Slot 활성화)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Slot 상태 다이어그램

```
┌──────────┐    deploy    ┌──────────┐   promote   ┌──────────┐
│  empty   │ ──────────→  │ deployed │ ─────────→  │  active  │
└──────────┘              └──────────┘             └──────────┘
                                                        │
                                                        │ promote (다른 slot)
                                                        ▼
                                                  ┌──────────┐
                                                  │  grace   │
                                                  │ (48시간) │
                                                  └──────────┘
                                                        │
                                                        │ 48시간 후 또는 새 배포
                                                        ▼
                                                  ┌──────────┐
                                                  │  empty   │
                                                  └──────────┘
```

---

## Critical Rules

### 1. 절대 금지 명령어

```bash
# Hooks가 자동 차단함
podman rm -f <container>       # 직접 컨테이너 삭제
podman volume rm <volume>      # 직접 볼륨 삭제
docker-compose down -v         # 볼륨 포함 삭제
rm -rf /opt/codeb/projects/*   # 프로젝트 폴더 삭제
ssh root@*                     # 직접 SSH 접속 (Admin 제외)
```

### 2. 올바른 CLI 명령어

```bash
# Blue-Green 배포
we deploy <project>            # 비활성 Slot에 배포 → Preview URL
we promote <project>           # 트래픽 전환 (무중단)
we rollback <project>          # 즉시 롤백

# Slot 관리
we slot status <project>       # Slot 상태 확인
we slot cleanup <project>      # Grace 만료 Slot 정리

# 환경 관리
we env get <project>           # ENV 조회
we env set <project> KEY=val   # ENV 설정
we env restore <project>       # master.env에서 복구

# 상태 확인
we health                      # 전체 시스템 헬스체크
we registry status             # SSOT 레지스트리 상태
```

### 3. SSH 접근 금지 (Admin 제외)

```bash
# ❌ 절대 금지 (팀원/AI)
ssh root@158.247.203.55
ssh root@app.codeb.kr

# ✅ 올바른 방법 - MCP API 사용
we deploy myapp           # MCP API로 배포
we env restore myapp      # MCP API로 ENV 복구
we health                 # MCP API로 상태 확인
```

---

## Version Management (서버가 기준)

### 단일 버전 소스 (Single Source of Truth)

```
v6.0/VERSION              # 서버 버전이 기준 (현재: 6.0.5)
```

### 버전 관리 원칙

```
┌─────────────────────────────────────────────────────────────────┐
│                    CodeB 버전 관리 원칙                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 서버가 항상 버전 기준                                        │
│     └─→ v6.0/VERSION 파일이 단일 진실 소스                       │
│     └─→ 모든 package.json은 빌드 시 VERSION에서 동기화           │
│                                                                 │
│  2. 로컬 개발 전 버전 체크                                       │
│     └─→ npm run dev 실행 시 자동으로 서버 버전 확인              │
│     └─→ 버전 불일치 시 경고 (서버 업데이트 또는 git pull 필요)   │
│                                                                 │
│  3. 버전 업데이트 절차                                           │
│     └─→ v6.0/VERSION 파일 수정                                  │
│     └─→ 커밋 & 푸시 → GitHub Actions 자동 배포                  │
│     └─→ 서버가 새 버전으로 업데이트됨                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 버전 체크 명령어

```bash
# 로컬에서 버전 체크
./v6.0/scripts/check-version.sh

# 서버 버전 확인
curl -sf https://api.codeb.kr/health | jq '.version'

# 로컬 버전 확인
cat v6.0/VERSION
```

### 버전 업데이트 방법

```bash
# 1. VERSION 파일 수정
echo "6.0.6" > v6.0/VERSION

# 2. 커밋 & 푸시
git add v6.0/VERSION
git commit -m "chore: bump version to 6.0.6"
git push origin main

# 3. GitHub Actions가 자동으로:
#    - package.json 버전 동기화
#    - Docker 이미지 빌드
#    - 서버 배포
```

---

## Self-Hosted Runner

### Runner 구성

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Actions Self-Hosted Runner             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  위치: App Server (158.247.203.55)                              │
│  경로: /opt/actions-runner                                      │
│  사용자: runner                                                  │
│  서비스: actions.runner.codeblabdev-max-codeb-server.*          │
│                                                                 │
│  라벨: self-hosted, Linux, X64, codeb, app-server               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Runner가 호스트에서 직접 실행되는 이유

```
❌ 컨테이너화된 Runner 문제점:
   - Podman-in-Podman overlay 드라이버 중첩 문제
   - 호스트 Podman 접근 불가
   - 복잡한 설정 및 불안정

✅ 호스트 systemd 서비스 장점:
   - 호스트의 Podman 직접 사용
   - 안정적이고 빠른 빌드
   - 간단한 설정 및 유지보수
```

### Runner 서비스 관리

```bash
# 상태 확인
ssh root@app.codeb.kr "cd /opt/actions-runner && ./svc.sh status"

# 서비스 재시작
ssh root@app.codeb.kr "cd /opt/actions-runner && ./svc.sh stop && ./svc.sh start"

# 로그 확인
ssh root@app.codeb.kr "journalctl -u 'actions.runner.*' -f"
```

### Runner 재등록 절차 (문제 발생 시)

```bash
# 1. 새 토큰 발급
gh api -X POST repos/codeblabdev-max/codeb-server/actions/runners/registration-token --jq '.token'

# 2. 서버에서 재등록
ssh root@app.codeb.kr "
cd /opt/actions-runner
./svc.sh uninstall
rm -f .runner .credentials .credentials_rsaparams
sudo -u runner ./config.sh --url https://github.com/codeblabdev-max/codeb-server \
  --token <NEW_TOKEN> \
  --name codeb-app-server \
  --labels self-hosted,Linux,X64,codeb,app-server \
  --unattended
./svc.sh install runner
./svc.sh start
"
```

### GitHub Actions 워크플로우 규칙

```yaml
# 모든 워크플로우는 self-hosted runner 사용
jobs:
  build:
    runs-on: self-hosted  # ✅ 올바름
    # runs-on: ubuntu-latest  # ❌ 사용 금지

  deploy:
    runs-on: self-hosted  # ✅ 올바름
```

### Runner에서 Podman 사용

```yaml
# Runner는 호스트의 Podman을 sudo로 실행
- name: Build with Podman
  run: |
    sudo podman build -t myimage .
    sudo podman push myimage

# 컨테이너 관리도 sudo 필요
- name: Deploy container
  run: |
    sudo podman stop myapp || true
    sudo podman rm myapp || true
    sudo podman run -d --name myapp myimage
```

---

## 4-Server Architecture

### 서버 구성

```
┌─────────────────────────────────────────────────────────────────┐
│                     CodeB 4-Server Architecture                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │ App Server  │     │  Streaming  │     │   Storage   │       │
│  │ 158.247.    │     │ 141.164.    │     │  64.176.    │       │
│  │   203.55    │     │   42.213    │     │   226.119   │       │
│  │             │     │             │     │             │       │
│  │ • Next.js   │     │ • Centri-   │     │ • Postgres  │       │
│  │ • MCP API   │     │   fugo      │     │ • Redis     │       │
│  │ • Caddy     │     │ • WebSocket │     │             │       │
│  │ • Podman    │     │             │     │             │       │
│  │ • Edge RT   │     │             │     │             │       │
│  └─────────────┘     └─────────────┘     └─────────────┘       │
│         │                   │                   │               │
│         └───────────────────┼───────────────────┘               │
│                             │                                   │
│                     ┌─────────────┐                             │
│                     │   Backup    │                             │
│                     │ 141.164.    │                             │
│                     │   37.63     │                             │
│                     │             │                             │
│                     │ • ENV 백업  │                             │
│                     │ • Prometheus│                             │
│                     │ • Grafana   │                             │
│                     └─────────────┘                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 서버 역할 매핑

| 역할 | IP | 도메인 | 서비스 |
|------|-----|--------|--------|
| **App** | 158.247.203.55 | app.codeb.kr, api.codeb.kr | Next.js, MCP API v6.0, Caddy, Podman, Edge Runtime |
| **Streaming** | 141.164.42.213 | ws.codeb.kr | Centrifugo (WebSocket) |
| **Storage** | 64.176.226.119 | db.codeb.kr | PostgreSQL, Redis |
| **Backup** | 141.164.37.63 | backup.codeb.kr | ENV 백업, Prometheus, Grafana |

### 포트 할당

| 환경 | App Port | Blue | Green |
|------|----------|------|-------|
| **Staging** | 3000-3499 | basePort | basePort+1 |
| **Production** | 4000-4499 | basePort | basePort+1 |
| **Preview** | 5000-5999 | basePort | basePort+1 |
| **Edge Functions** | 9200 | - | - |

---

## MCP API v6.0

### 엔드포인트

```
Primary:  https://api.codeb.kr/api
Health:   https://api.codeb.kr/health
```

### 인증 (v6.0 Team-based)

```bash
# API Key 형식 (v6.0)
X-API-Key: codeb_{teamId}_{role}_{randomToken}

# 예시
X-API-Key: codeb_team123_admin_a1b2c3d4e5f6

# 역할 계층 (높은순)
owner  - 팀 삭제, 모든 작업
admin  - 멤버 관리, 토큰 관리, 슬롯 정리
member - 배포, promote, rollback, ENV 설정
viewer - 조회만 (상태, 로그, 메트릭)
```

### Tool 목록 (30개)

#### Team Management (11개)
| Tool | 설명 | 최소 권한 |
|------|------|----------|
| `team_create` | 팀 생성 | owner |
| `team_list` | 팀 목록 조회 | viewer |
| `team_get` | 팀 상세 조회 | viewer |
| `team_delete` | 팀 삭제 | owner |
| `team_settings` | 팀 설정 변경 | admin |
| `member_invite` | 멤버 초대 | admin |
| `member_remove` | 멤버 제거 | admin |
| `member_list` | 멤버 목록 | viewer |
| `token_create` | API 토큰 생성 | admin |
| `token_revoke` | API 토큰 폐기 | member |
| `token_list` | 토큰 목록 조회 | member |

#### Blue-Green Deployment (6개)
| Tool | 설명 | 최소 권한 |
|------|------|----------|
| `deploy` / `deploy_project` | Blue-Green Slot 배포 | member |
| `promote` / `slot_promote` | 트래픽 전환 | member |
| `rollback` | 이전 버전으로 롤백 | member |
| `slot_status` | Slot 상태 조회 | viewer |
| `slot_cleanup` | Grace 만료 Slot 정리 | admin |
| `slot_list` | 전체 Slot 목록 | viewer |

#### Edge Functions (6개)
| Tool | 설명 | 최소 권한 |
|------|------|----------|
| `edge_deploy` | Edge 함수 배포 | member |
| `edge_list` | Edge 함수 목록 | viewer |
| `edge_logs` | Edge 함수 로그 | viewer |
| `edge_delete` | Edge 함수 삭제 | member |
| `edge_invoke` | Edge 함수 테스트 호출 | member |
| `edge_metrics` | Edge 함수 메트릭 | viewer |

#### Analytics (5개)
| Tool | 설명 | 최소 권한 |
|------|------|----------|
| `analytics_overview` | 트래픽 개요 | viewer |
| `analytics_webvitals` | Web Vitals (LCP, FID, CLS) | viewer |
| `analytics_deployments` | 배포별 성능 | viewer |
| `analytics_realtime` | 실시간 메트릭 | viewer |
| `analytics_speed_insights` | Speed Insights 점수 | viewer |

### API 호출 예시

```bash
# 배포
curl -X POST https://api.codeb.kr/api/tool \
  -H "X-API-Key: codeb_myteam_member_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "deploy",
    "params": {
      "projectName": "myapp",
      "environment": "staging",
      "version": "v1.2.3"
    }
  }'

# 응답
{
  "success": true,
  "result": {
    "slot": "green",
    "port": 3001,
    "previewUrl": "https://myapp-green.preview.codeb.dev",
    "duration": 45000
  }
}

# Promote
curl -X POST https://api.codeb.kr/api/tool \
  -H "X-API-Key: codeb_myteam_member_xxxxx" \
  -d '{"tool": "promote", "params": {"projectName": "myapp", "environment": "staging"}}'

# Edge Function 배포
curl -X POST https://api.codeb.kr/api/tool \
  -H "X-API-Key: codeb_myteam_member_xxxxx" \
  -d '{
    "tool": "edge_deploy",
    "params": {
      "projectName": "myapp",
      "environment": "production",
      "functions": [{
        "name": "auth-middleware",
        "code": "export default function(req) { return req; }",
        "routes": ["/api/*"],
        "type": "middleware"
      }]
    }
  }'

# Analytics 조회
curl -X POST https://api.codeb.kr/api/tool \
  -H "X-API-Key: codeb_myteam_viewer_xxxxx" \
  -d '{"tool": "analytics_webvitals", "params": {"projectName": "myapp", "period": "week"}}'
```

---

## Edge Functions

### 개요

v6.0에서 추가된 Edge Functions는 Vercel Edge Functions와 유사한 서버리스 함수 실행 환경입니다.

### 지원 타입

| Type | 설명 | 사용 사례 |
|------|------|----------|
| `middleware` | 요청 전처리 | 인증, 로깅, 헤더 수정 |
| `api` | API 엔드포인트 | REST API, Webhook |
| `rewrite` | URL 재작성 | A/B 테스트, 프록시 |
| `redirect` | 리디렉션 | 301/302 리디렉트 |

### 리소스 제한

| 리소스 | 기본값 | 최대값 |
|--------|--------|--------|
| Timeout | 10s | 30s |
| Memory | 64MB | 128MB |
| Code Size | - | 1MB |

### Edge Function 예시

```typescript
// auth-middleware.ts
export default function authMiddleware(request: Request) {
  const token = request.headers.get('Authorization');

  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 요청 계속 진행
  return request;
}
```

---

## Analytics & Web Vitals

### 수집 메트릭

| 메트릭 | 설명 | 목표값 |
|--------|------|--------|
| LCP | Largest Contentful Paint | < 2.5s |
| FID | First Input Delay | < 100ms |
| CLS | Cumulative Layout Shift | < 0.1 |
| TTFB | Time to First Byte | < 800ms |
| FCP | First Contentful Paint | < 1.8s |
| INP | Interaction to Next Paint | < 200ms |

### Speed Insights 점수

| 점수 | 등급 | 설명 |
|------|------|------|
| 90-100 | Good | 최적화됨 |
| 50-89 | Needs Improvement | 개선 필요 |
| 0-49 | Poor | 심각한 문제 |

### Analytics SDK 통합

#### Next.js App Router

```tsx
// app/layout.tsx
import { CodeBAnalytics } from '@codeb/analytics/react';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <CodeBAnalytics
          projectId="myapp"
          webVitals={true}
          speedInsights={true}
        />
      </body>
    </html>
  );
}
```

#### Next.js Pages Router

```tsx
// pages/_app.tsx
import { CodeBAnalytics } from '@codeb/analytics/react';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <CodeBAnalytics projectId="myapp" />
    </>
  );
}
```

#### React

```tsx
import { CodeBAnalytics, useWebVitals } from '@codeb/analytics/react';

function App() {
  useWebVitals(); // Hook 방식

  return (
    <>
      <MyApp />
      <CodeBAnalytics projectId="myapp" />
    </>
  );
}
```

---

## ENV 관리 시스템

### 백업 구조

```
/opt/codeb/env-backup/{project}/{environment}/
├── master.env           # 최초 생성 시 저장 (불변, 복구 기준)
├── current.env          # 현재 버전
├── 2024-01-15T10:30:00.env  # 변경 이력
├── 2024-01-14T15:20:00.env
└── ...
```

### 규칙

```bash
# 금지
직접 .env 파일 수정/삭제

# 올바른 방법
we env get myapp                          # 조회
we env set myapp DATABASE_URL="..."       # 설정
we env restore myapp --version master     # master에서 복구
we env restore myapp --version current    # 최신 백업에서 복구
we env history myapp                      # 변경 이력
```

---

## Real-time Communication

### Centrifugo (WebSocket)

```bash
# Socket.IO 사용 금지
import { Server } from 'socket.io';  # 금지

# Centrifugo 사용
Host: ws.codeb.kr (141.164.42.213)
Port: 8000
WebSocket: wss://ws.codeb.kr/connection/websocket
HTTP API: http://ws.codeb.kr:8000/api
```

### 클라이언트 연결

```javascript
import { Centrifuge } from 'centrifuge';

const centrifuge = new Centrifuge('wss://ws.codeb.kr/connection/websocket', {
  token: await getConnectionToken()
});

const sub = centrifuge.newSubscription('chat:room123');
sub.on('publication', (ctx) => console.log(ctx.data));
sub.subscribe();
centrifuge.connect();
```

---

## Registry (SSOT)

### 파일 구조 (v6.0)

```
/opt/codeb/registry/
├── ssot.json              # 단일 진실 소스
│   ├── version: "6.0"
│   ├── projects: {}       # 프로젝트별 설정
│   ├── ports: { used, reserved }
│   └── updatedAt
│
├── slots/
│   └── {project}-{env}.json   # Slot 상태
│       ├── projectName
│       ├── teamId            # NEW: 팀 ID
│       ├── activeSlot: "blue" | "green"
│       ├── blue: { state, port, version, ... }
│       └── green: { state, port, version, ... }
│
├── teams/
│   └── teams.json            # NEW: 팀 레지스트리
│       ├── teams: { teamId: { name, projects, ... } }
│       └── updatedAt
│
├── api-keys/
│   └── keys.json             # NEW: API 키 레지스트리
│       ├── keys: { keyId: { teamId, role, keyHash, ... } }
│       └── updatedAt
│
├── edge-functions/
│   └── {project}/manifest.json  # NEW: Edge 함수 매니페스트
│
└── domains/
    └── {project}.json     # 도메인 매핑
```

### Slot 레지스트리 예시 (v6.0)

```json
{
  "projectName": "myapp",
  "teamId": "team123",
  "environment": "staging",
  "activeSlot": "blue",
  "blue": {
    "name": "blue",
    "state": "active",
    "port": 3000,
    "version": "v1.2.3",
    "deployedAt": "2024-01-15T10:30:00Z",
    "deployedBy": "key_abc123",
    "promotedAt": "2024-01-15T10:35:00Z",
    "promotedBy": "key_abc123",
    "healthStatus": "healthy"
  },
  "green": {
    "name": "green",
    "state": "deployed",
    "port": 3001,
    "version": "v1.2.4",
    "deployedAt": "2024-01-15T11:00:00Z",
    "deployedBy": "key_abc123",
    "healthStatus": "healthy"
  },
  "lastUpdated": "2024-01-15T11:00:00Z"
}
```

---

## GitHub Actions Integration

### deploy.yml (v6.0)

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build & Push
        run: |
          echo "${{ secrets.GHCR_PAT }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
          docker build -t ghcr.io/${{ github.repository }}:${{ github.sha }} .
          docker push ghcr.io/${{ github.repository }}:${{ github.sha }}

      - name: Deploy via CodeB API v6.0
        run: |
          RESULT=$(curl -sf -X POST "https://api.codeb.kr/api/tool" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{
              "tool": "deploy",
              "params": {
                "projectName": "${{ github.event.repository.name }}",
                "environment": "staging",
                "version": "${{ github.sha }}",
                "image": "ghcr.io/${{ github.repository }}:${{ github.sha }}"
              }
            }')
          echo "Preview URL: $(echo $RESULT | jq -r '.result.previewUrl')"
```

### 필요한 Secrets

| Secret | 설명 |
|--------|------|
| `CODEB_API_KEY` | v6.0 Team API Key (codeb_{teamId}_{role}_{token}) |
| `GHCR_PAT` | GitHub Container Registry 토큰 |

---

## CLI DX (Developer Experience) v6.0

### 개요

v6.0 CLI는 **Ink React**를 사용한 Beautiful Terminal UI를 제공합니다.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CodeB CLI DX Features                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✨ Real-time Deploy Progress                                   │
│     └─→ Animated spinners, step indicators                     │
│     └─→ 진행률 표시 및 소요 시간                                │
│                                                                 │
│  🎨 Interactive UI                                              │
│     └─→ 프로젝트/환경 선택 메뉴                                 │
│     └─→ Blue-Green Slot 상태 시각화                            │
│                                                                 │
│  📊 Log Streaming                                               │
│     └─→ 실시간 로그 with 필터링                                 │
│     └─→ 색상 코딩된 로그 레벨                                   │
│                                                                 │
│  🤖 CI-Friendly Mode                                            │
│     └─→ --ci 플래그로 인터랙티브 비활성화                       │
│     └─→ JSON 출력 지원                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 주요 컴포넌트

| 컴포넌트 | 설명 |
|----------|------|
| `DeployProgress.tsx` | 배포 진행률 UI with spinners |
| `InteractiveApp.tsx` | Full-screen TUI 앱 |
| `SlotStatus.tsx` | Blue-Green Slot 시각화 |
| `LogViewer.tsx` | 실시간 로그 스트리밍 |

### 배포 화면 예시

```
╔════════════════════════════════════════════════════════════╗
║  CodeB Deploy                                    v6.0.0    ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  Project: myapp                                            ║
║  Environment: staging                                      ║
║  Target Slot: green (port 3001)                           ║
║                                                            ║
║  ✓ Pulling image              2.3s                        ║
║  ✓ Starting container         1.2s                        ║
║  ✓ Health check passed        0.8s                        ║
║  ● Updating registry...                                   ║
║                                                            ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  75%         ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

### Slot 상태 화면 예시

```
╔════════════════════════════════════════════════════════════╗
║  myapp - staging                                           ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  BLUE (active)         │   GREEN (deployed)               ║
║  ─────────────────────────────────────────────────────    ║
║  Port: 3000            │   Port: 3001                     ║
║  Version: v1.2.3       │   Version: v1.2.4                ║
║  Health: ✓ healthy     │   Health: ✓ healthy              ║
║  Deployed: 2h ago      │   Deployed: 5m ago               ║
║                        │                                  ║
║  [  ACTIVE  ]          │   [ PROMOTE ]                    ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

---

## CLI Quick Reference

```bash
# 인증
we login                           # API Key 입력
we whoami                          # 현재 사용자 정보
we link                            # 현재 디렉토리를 프로젝트에 연결

# 초기화
we init myapp --type nextjs --database --redis

# Blue-Green 배포 (Real-time Progress UI)
we deploy                          # 현재 프로젝트 배포 → Preview URL
we deploy myapp                    # 특정 프로젝트 배포
we deploy --ci                     # CI 모드 (non-interactive)
we promote myapp                   # → Production 전환
we rollback myapp                  # → 즉시 롤백

# 상태 확인 (Visual UI)
we slot status myapp               # Slot 상태 (그래픽 UI)
we health                          # 시스템 헬스
we registry status                 # SSOT 상태

# 로그 (Real-time Streaming)
we logs myapp                      # 실시간 로그 스트리밍
we logs myapp --filter error       # 에러만 필터링
we logs myapp --tail 100           # 최근 100줄

# ENV 관리
we env get myapp                   # 전체 조회
we env set myapp KEY=value         # 설정
we env restore myapp               # 복구
we env history myapp               # 이력

# 도메인
we domain setup myapp.codeb.dev    # 도메인 설정
we domain ssl myapp.codeb.dev      # SSL 인증서

# Edge Functions (v6.0)
we edge deploy myapp               # Edge 함수 배포
we edge list myapp                 # Edge 함수 목록
we edge logs myapp                 # Edge 함수 로그
we edge delete myapp auth-mw       # Edge 함수 삭제
we edge invoke myapp auth-mw       # Edge 함수 테스트 호출

# Analytics (v6.0)
we analytics myapp                 # 트래픽 개요
we analytics myapp --webvitals     # Web Vitals (LCP, FID, CLS, INP)
we analytics myapp --realtime      # 실시간 메트릭
we analytics myapp --speed         # Speed Insights 점수
```

---

## Permission Model (v6.0)

### 역할 계층

```
owner   ─────→ 모든 권한 + 팀 삭제
   │
admin   ─────→ 멤버 관리, 토큰 생성, 슬롯 정리
   │
member  ─────→ 배포, promote, rollback, ENV 설정
   │
viewer  ─────→ 조회만 (상태, 로그, 메트릭)
```

### 권한 매트릭스

| 작업 | owner | admin | member | viewer |
|------|:-----:|:-----:|:------:|:------:|
| team.delete | O | X | X | X |
| member.invite | O | O | X | X |
| token.create | O | O | X | X |
| slot.cleanup | O | O | X | X |
| deploy | O | O | O | X |
| promote | O | O | O | X |
| rollback | O | O | O | X |
| env.set | O | O | O | X |
| slot.view | O | O | O | O |
| logs.view | O | O | O | O |
| metrics.view | O | O | O | O |

---

## Version

- **CLAUDE.md**: v6.0.1
- **CLI**: @codeb/cli@6.0.x (Ink React TUI)
- **MCP Server**: codeb-mcp-server@6.0.0 (TypeScript + Express + Zod)
- **Analytics SDK**: @codeb/analytics@6.0.x
- **API Endpoint**: https://api.codeb.kr/api (30 tools)

### v6.0 신규 파일

```
v6.0/mcp-server/
├── src/
│   ├── index.ts                 # Express HTTP API 서버
│   ├── lib/
│   │   ├── auth.ts              # Team-based 인증
│   │   ├── types.ts             # TypeScript 타입
│   │   ├── ssh.ts               # SSH Connection Pool
│   │   └── servers.ts           # 서버 설정
│   └── tools/
│       ├── team.ts              # 팀 관리 (11개)
│       ├── deploy.ts            # 배포
│       ├── promote.ts           # 트래픽 전환
│       ├── rollback.ts          # 롤백
│       ├── slot.ts              # Slot 관리
│       ├── edge.ts              # Edge Functions (6개)
│       └── analytics.ts         # Analytics (5개)
│
├── cli/
│   ├── src/
│   │   ├── index.tsx            # Commander 엔트리
│   │   ├── commands/
│   │   │   ├── login.tsx        # 인증
│   │   │   ├── deploy.tsx       # 배포
│   │   │   ├── promote.tsx      # Promote
│   │   │   └── rollback.tsx     # Rollback
│   │   └── components/
│   │       ├── DeployProgress.tsx
│   │       ├── SlotStatus.tsx
│   │       └── LogViewer.tsx
│   └── package.json
│
└── analytics-sdk/
    ├── src/
    │   ├── core.ts              # 코어 수집 로직
    │   ├── web-vitals.ts        # Web Vitals
    │   ├── speed-insights.ts    # Speed Insights
    │   └── react/               # React 통합
    └── package.json
```

> 이 파일은 CLI 설치/업데이트 시 자동으로 최신 버전으로 교체됩니다.
