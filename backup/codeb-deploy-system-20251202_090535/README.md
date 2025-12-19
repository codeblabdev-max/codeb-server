# CodeB Deploy System v1.0

완전한 CI/CD 파이프라인 + MCP 배포 시스템 (100% 구현)

## 📁 프로젝트 구조

```
codeb-deploy-system/
├── mcp-server/                    # MCP 배포 서버
│   ├── src/
│   │   ├── tools/                 # MCP 도구들
│   │   │   ├── analyze-server.ts  # 서버 상태 분석
│   │   │   ├── init-project.ts    # 프로젝트 초기화 + GitHub Actions
│   │   │   ├── deploy.ts          # 배포 실행 (Rolling/Blue-Green/Canary)
│   │   │   ├── healthcheck.ts     # 헬스체크 + 자동 롤백
│   │   │   ├── rollback.ts        # 버전 롤백
│   │   │   ├── notify.ts          # Slack/PagerDuty/Email 알림
│   │   │   ├── security-scan.ts   # Trivy + gitleaks 보안 스캔
│   │   │   ├── preview.ts         # PR Preview 환경 관리
│   │   │   └── monitoring.ts      # Prometheus + Grafana 모니터링
│   │   ├── lib/                   # 공통 라이브러리
│   │   │   ├── ssh-client.ts      # SSH 클라이언트
│   │   │   ├── port-registry.ts   # 환경별 포트 관리
│   │   │   └── types.ts           # 타입 정의
│   │   └── index.ts               # MCP 서버 진입점
│   ├── package.json
│   └── tsconfig.json
├── server-scripts/                # 서버 설정 스크립트
│   ├── setup-runner.sh            # GitHub Self-hosted Runner 설정
│   ├── setup-registry.sh          # 컨테이너 레지스트리 설정
│   └── setup-monitoring.sh        # Prometheus + Grafana 설정
└── README.md
```

## 🎯 기능 목표 (100% 완료)

### Phase 1: 기본 CI/CD ✅
- [x] CI 파이프라인 (린트/테스트/빌드)
- [x] 환경 분리 (staging/production/preview)
- [x] GitHub Actions + Self-hosted Runner
- [x] 헬스체크 + 자동 롤백
- [x] 포트 자동 할당 (환경별 분리)
- [x] 이미지 버전 관리

### Phase 2: 고급 기능 ✅
- [x] E2E 테스트 (Playwright)
- [x] 이미지 취약점 스캔 (Trivy)
- [x] 시크릿 스캔 (gitleaks)
- [x] SBOM 생성
- [x] PR Preview 환경
- [x] 메트릭 (Prometheus + Grafana)
- [x] 알림 (Slack, PagerDuty, Email, Webhook)

### Phase 3: 엔터프라이즈 ✅
- [x] Blue-Green 배포
- [x] Canary 배포 (점진적 롤아웃)
- [x] 자동 스케일링 대응 포트 관리
- [x] 모니터링 대시보드 자동 생성
- [x] 알림 규칙 자동 설정

## 🚀 빠른 시작

### 1. MCP 서버 빌드

```bash
cd mcp-server
npm install
npm run build
```

### 2. Claude Code에 MCP 등록

`.mcp.json`에 추가:

```json
{
  "mcpServers": {
    "codeb-deploy": {
      "command": "node",
      "args": ["/path/to/codeb-deploy-system/mcp-server/dist/index.js"],
      "env": {
        "CODEB_SERVER_HOST": "141.164.60.51",
        "CODEB_SERVER_USER": "root",
        "CODEB_SSH_KEY_PATH": "~/.ssh/id_rsa"
      }
    }
  }
}
```

### 3. 서버 설정

```bash
# Self-hosted Runner 설치
./server-scripts/setup-runner.sh --owner myorg --repo myproject --token AXXXXXX

# 컨테이너 레지스트리 설치
./server-scripts/setup-registry.sh

# 모니터링 스택 설치
./server-scripts/setup-monitoring.sh
```

### 4. 프로젝트에서 사용

Claude Code에서:

```
"내 프로젝트 배포 설정해줘"
→ init_project 도구가 deploy/ 폴더와 GitHub Actions 워크플로우 생성

"staging에 배포해줘"
→ deploy 도구가 Rolling 배포 실행

"production에 canary 배포 10%로 시작해줘"
→ deploy 도구가 Canary 배포 실행

"서버 상태 분석해줘"
→ analyze_server 도구가 시스템 상태, 포트, 컨테이너 분석
```

## 📋 MCP 도구 목록

| 도구 | 설명 |
|------|------|
| `analyze_server` | 서버 상태 분석 (시스템, 컨테이너, 포트, DB, 레지스트리) |
| `init_project` | 프로젝트 초기화 (config, scripts, GitHub Actions workflows) |
| `deploy` | 배포 실행 (Rolling, Blue-Green, Canary 전략) |
| `healthcheck` | 서비스 헬스체크 (HTTP, 컨테이너, DB, Redis) + 자동 롤백 |
| `rollback` | 이전 버전 롤백 |
| `get_version_history` | 배포 버전 히스토리 조회 |
| `notify` | 알림 전송 (Slack, PagerDuty, Email, Webhook) |
| `security_scan` | 보안 스캔 (Trivy 이미지 취약점, gitleaks 시크릿) |
| `generate_sbom` | SBOM 생성 (SPDX, CycloneDX, GitHub) |
| `preview` | PR Preview 환경 관리 (생성, 업데이트, 삭제, 조회) |
| `monitoring` | 모니터링 관리 (설정, 상태, 메트릭, 알림) |
| `port_summary` | 포트 할당 현황 조회 |

## 🔧 환경별 포트 범위

| 환경 | 앱 포트 | DB 포트 | Redis 포트 |
|------|---------|---------|------------|
| Staging | 3000-3499 | 5432-5449 | 6379-6399 |
| Production | 4000-4499 | 5450-5469 | 6400-6419 |
| Preview | 5000-5999 | - | - |

## 📊 생성되는 GitHub Actions 워크플로우

### ci.yml
- 린트 (ESLint)
- 타입 체크 (TypeScript)
- 단위 테스트
- E2E 테스트 (Playwright)
- 보안 스캔 (Trivy, gitleaks)
- 빌드 & 이미지 Push

### deploy-staging.yml
- main 브랜치 push 시 자동 배포
- Rolling 배포 전략
- 헬스체크
- Slack 알림

### deploy-production.yml
- 수동 트리거 (workflow_dispatch)
- 배포 전략 선택 (Rolling/Blue-Green/Canary)
- 승인 단계 (environments)
- 헬스체크 + 자동 롤백
- Slack + PagerDuty 알림

### preview.yml
- PR 생성/업데이트 시 Preview 환경 자동 생성
- PR 닫힘 시 자동 정리
- PR 코멘트에 Preview URL 게시

## 🔒 보안 스캔

### Trivy (이미지 취약점)
- CRITICAL, HIGH 취약점 검사
- CI 파이프라인에서 자동 실행
- 심각도별 필터링 지원

### gitleaks (시크릿 검사)
- 하드코딩된 API 키, 비밀번호 검출
- PR 체크에서 자동 실행
- .gitleaksignore 지원

### SBOM (Software Bill of Materials)
- SPDX, CycloneDX, GitHub 형식 지원
- 릴리스 시 자동 생성

## 📈 모니터링

### Prometheus 메트릭
- 시스템 메트릭 (CPU, 메모리, 디스크)
- 앱 메트릭 (요청 수, 응답 시간, 에러율)
- 컨테이너 메트릭

### Grafana 대시보드
- 프로젝트별 자동 생성
- 요청률, 지연 시간, 에러율
- 시스템 리소스 게이지

### 알림 규칙
- 서비스 다운
- 높은 에러율 (>5%)
- 높은 지연 시간 (p95 >2s)
- 높은 리소스 사용률

## 🔔 알림 채널

| 채널 | 설정 필요 환경변수 |
|------|-------------------|
| Slack | `SLACK_WEBHOOK_URL` |
| PagerDuty | `PAGERDUTY_ROUTING_KEY` |
| Email | `SENDGRID_API_KEY`, `ALERT_EMAIL_TO` |
| Webhook | 도구 호출 시 `webhookUrl` 파라미터 |

## 🔧 환경 변수

```bash
# 서버 연결
CODEB_SERVER_HOST=141.164.60.51
CODEB_SERVER_USER=root
CODEB_SSH_KEY_PATH=~/.ssh/id_rsa

# 알림
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
PAGERDUTY_ROUTING_KEY=xxx
SENDGRID_API_KEY=xxx
ALERT_EMAIL_TO=alerts@example.com

# 레지스트리
REGISTRY_URL=localhost:5000
```

## 📝 라이선스

MIT
