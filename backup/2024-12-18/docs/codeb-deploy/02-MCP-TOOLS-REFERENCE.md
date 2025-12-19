# CodeB Deploy System - MCP 도구 레퍼런스

## 목차
1. [도구 개요](#도구-개요)
2. [서버 분석 도구](#서버-분석-도구)
3. [프로젝트 관리 도구](#프로젝트-관리-도구)
4. [배포 도구](#배포-도구)
5. [헬스체크 및 롤백 도구](#헬스체크-및-롤백-도구)
6. [알림 도구](#알림-도구)
7. [보안 스캔 도구](#보안-스캔-도구)
8. [Preview 환경 도구](#preview-환경-도구)
9. [모니터링 도구](#모니터링-도구)

---

## 도구 개요

CodeB Deploy MCP 서버는 12개의 도구를 제공합니다:

| 도구 | 용도 | 카테고리 |
|------|------|----------|
| `analyze_server` | 서버 상태 분석 | 분석 |
| `init_project` | 프로젝트 초기화 | 설정 |
| `deploy` | 배포 실행 | 배포 |
| `healthcheck` | 서비스 상태 확인 | 모니터링 |
| `rollback` | 버전 롤백 | 배포 |
| `get_version_history` | 버전 히스토리 조회 | 배포 |
| `notify` | 알림 전송 | 알림 |
| `security_scan` | 보안 스캔 | 보안 |
| `generate_sbom` | SBOM 생성 | 보안 |
| `preview` | Preview 환경 관리 | 환경 |
| `monitoring` | 모니터링 설정/조회 | 모니터링 |
| `port_summary` | 포트 할당 현황 | 분석 |

---

## 서버 분석 도구

### analyze_server

서버의 전체 상태를 분석합니다.

**파라미터:**
```typescript
{
  includeContainers?: boolean;  // 컨테이너 정보 포함 (기본: true)
  includePm2?: boolean;         // PM2 프로세스 정보 포함 (기본: true)
  includePorts?: boolean;       // 포트 정보 포함 (기본: true)
  includeDatabases?: boolean;   // 데이터베이스 정보 포함 (기본: true)
  includeRegistry?: boolean;    // 레지스트리 정보 포함 (기본: true)
}
```

**사용 예시:**
```
"서버 상태 분석해줘"
"컨테이너와 포트 정보만 분석해줘"
"데이터베이스 연결 상태 확인해줘"
```

**응답 예시:**
```json
{
  "system": {
    "hostname": "codeb-server",
    "uptime": "15 days",
    "memory": { "total": "16GB", "used": "8GB", "free": "8GB" },
    "disk": { "total": "100GB", "used": "45GB", "available": "55GB" }
  },
  "containers": [
    { "name": "myapp-staging", "status": "running", "port": "3001" }
  ],
  "ports": {
    "staging": { "allocated": [3001, 3002], "available": 498 },
    "production": { "allocated": [4001], "available": 499 }
  }
}
```

### port_summary

환경별 포트 할당 현황을 조회합니다.

**파라미터:** 없음

**사용 예시:**
```
"포트 할당 현황 보여줘"
```

**포트 범위:**
| 환경 | 앱 포트 | DB 포트 | Redis 포트 |
|------|---------|---------|------------|
| Staging | 3000-3499 | 5432-5449 | 6379-6399 |
| Production | 4000-4499 | 5450-5469 | 6400-6419 |
| Preview | 5000-5999 | - | - |

---

## 프로젝트 관리 도구

### init_project

새 프로젝트를 초기화하고 CI/CD 파이프라인을 설정합니다.

**파라미터:**
```typescript
{
  projectName: string;          // 프로젝트 이름 (필수)
  projectType: 'nextjs' | 'remix' | 'nodejs' | 'static';  // 프로젝트 유형 (필수)
  gitRepo?: string;             // GitHub 저장소 URL
  domain?: string;              // 기본 도메인
  services?: {
    database?: boolean;         // PostgreSQL 사용
    redis?: boolean;            // Redis 사용
  }
}
```

**사용 예시:**
```
"myapp 프로젝트 초기화해줘. Next.js 프로젝트야."
"remix-app 프로젝트 만들어줘. PostgreSQL이랑 Redis 필요해."
```

**생성되는 파일:**
```
project/
├── deploy/
│   ├── config.yml              # 배포 설정
│   ├── scripts/
│   │   ├── build.sh           # 빌드 스크립트
│   │   ├── deploy.sh          # 배포 스크립트
│   │   └── healthcheck.sh     # 헬스체크 스크립트
│   └── Dockerfile             # 컨테이너 빌드용
└── .github/
    └── workflows/
        ├── ci.yml             # CI 파이프라인
        ├── deploy-staging.yml # Staging 배포
        ├── deploy-production.yml # Production 배포
        └── preview.yml        # PR Preview
```

---

## 배포 도구

### deploy

프로젝트를 지정된 환경에 배포합니다.

**파라미터:**
```typescript
{
  projectName: string;          // 프로젝트 이름 (필수)
  environment: 'staging' | 'production' | 'preview';  // 배포 환경 (필수)
  version?: string;             // 배포할 버전 태그
  strategy?: 'rolling' | 'blue-green' | 'canary';  // 배포 전략
  canaryWeight?: number;        // Canary 트래픽 비율 (%)
  skipTests?: boolean;          // 테스트 스킵
  skipHealthcheck?: boolean;    // 헬스체크 스킵
  prNumber?: string;            // Preview용 PR 번호
}
```

**사용 예시:**
```
"myapp staging에 배포해줘"
"myapp production에 blue-green 배포해줘"
"myapp production에 canary 배포 10%로 시작해줘"
"myapp PR-123 preview 배포해줘"
```

**배포 전략 설명:**

| 전략 | 설명 | 다운타임 | 롤백 속도 |
|------|------|----------|----------|
| Rolling | 순차적 교체 | 없음 | 보통 |
| Blue-Green | 완전 교체 후 스위치 | 없음 | 빠름 |
| Canary | 점진적 트래픽 이동 | 없음 | 빠름 |

---

## 헬스체크 및 롤백 도구

### healthcheck

배포된 서비스의 상태를 확인합니다.

**파라미터:**
```typescript
{
  projectName: string;          // 프로젝트 이름 (필수)
  environment: 'staging' | 'production' | 'preview';  // 환경 (필수)
  checks?: ('http' | 'container' | 'database' | 'redis' | 'custom')[];
  httpEndpoint?: string;        // HTTP 체크 엔드포인트 (기본: /health)
  timeout?: number;             // 타임아웃 초 (기본: 30)
  retries?: number;             // 재시도 횟수 (기본: 3)
  autoRollback?: boolean;       // 실패 시 자동 롤백 (기본: false)
}
```

**사용 예시:**
```
"myapp staging 헬스체크 해줘"
"myapp production 전체 헬스체크하고 실패하면 롤백해줘"
```

**응답 예시:**
```json
{
  "status": "healthy",
  "checks": {
    "http": { "status": "pass", "responseTime": 45 },
    "container": { "status": "pass", "uptime": "2h" },
    "database": { "status": "pass", "connections": 5 },
    "redis": { "status": "pass", "memory": "50MB" }
  }
}
```

### rollback

이전 버전으로 롤백합니다.

**파라미터:**
```typescript
{
  projectName: string;          // 프로젝트 이름 (필수)
  environment: 'staging' | 'production' | 'preview';  // 환경 (필수)
  targetVersion?: string;       // 롤백할 특정 버전
  reason?: string;              // 롤백 사유
  notify?: boolean;             // 알림 발송 여부
  dryRun?: boolean;             // 시뮬레이션 모드
}
```

**사용 예시:**
```
"myapp production 롤백해줘"
"myapp staging을 v1.2.0으로 롤백해줘"
"myapp 롤백 시뮬레이션 해줘"
```

### get_version_history

배포 버전 히스토리를 조회합니다.

**파라미터:**
```typescript
{
  projectName: string;          // 프로젝트 이름 (필수)
  environment: 'staging' | 'production' | 'preview';  // 환경 (필수)
  limit?: number;               // 조회할 버전 수 (기본: 10)
}
```

**사용 예시:**
```
"myapp production 배포 히스토리 보여줘"
"myapp staging 최근 5개 버전 보여줘"
```

---

## 알림 도구

### notify

다양한 채널로 알림을 전송합니다.

**파라미터:**
```typescript
{
  channel: 'slack' | 'pagerduty' | 'email' | 'webhook';  // 채널 (필수)
  type: 'deployment' | 'rollback' | 'healthcheck' | 'security' | 'custom';  // 유형 (필수)
  severity: 'info' | 'warning' | 'error' | 'critical';  // 심각도 (필수)
  projectName: string;          // 프로젝트 이름 (필수)
  environment?: 'staging' | 'production' | 'preview';
  title: string;                // 알림 제목 (필수)
  message: string;              // 알림 메시지 (필수)
  details?: object;             // 추가 상세 정보
  webhookUrl?: string;          // 커스텀 웹훅 URL
}
```

**사용 예시:**
```
"Slack으로 배포 완료 알림 보내줘"
"PagerDuty에 critical 알림 보내줘"
```

**환경 변수 요구사항:**
- Slack: `SLACK_WEBHOOK_URL`
- PagerDuty: `PAGERDUTY_ROUTING_KEY`
- Email: `SENDGRID_API_KEY`, `ALERT_EMAIL_TO`

---

## 보안 스캔 도구

### security_scan

이미지 취약점과 시크릿을 스캔합니다.

**파라미터:**
```typescript
{
  projectName: string;          // 프로젝트 이름 (필수)
  scanType: 'image' | 'secrets' | 'all';  // 스캔 유형 (필수)
  imageTag?: string;            // 스캔할 이미지 태그
  repoPath?: string;            // 스캔할 저장소 경로
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';  // 최소 심각도
  failOnVulnerability?: boolean;  // 취약점 발견 시 실패 처리
}
```

**사용 예시:**
```
"myapp 이미지 보안 스캔해줘"
"myapp 시크릿 스캔해줘"
"myapp 전체 보안 스캔하고 CRITICAL만 보여줘"
```

**스캔 도구:**
- **Trivy**: 컨테이너 이미지 취약점 스캔
- **gitleaks**: 하드코딩된 시크릿 검출

### generate_sbom

SBOM (Software Bill of Materials)을 생성합니다.

**파라미터:**
```typescript
{
  projectName: string;          // 프로젝트 이름 (필수)
  imageTag?: string;            // 이미지 태그
  format?: 'spdx-json' | 'cyclonedx' | 'github';  // SBOM 형식
}
```

**사용 예시:**
```
"myapp SBOM 생성해줘"
"myapp CycloneDX 형식으로 SBOM 만들어줘"
```

---

## Preview 환경 도구

### preview

PR 기반 Preview 환경을 관리합니다.

**파라미터:**
```typescript
{
  action: 'create' | 'update' | 'delete' | 'list' | 'get';  // 액션 (필수)
  projectName: string;          // 프로젝트 이름 (필수)
  prNumber?: string;            // PR 번호
  gitRef?: string;              // Git 참조
  ttlHours?: number;            // 자동 삭제까지 시간 (기본: 72)
}
```

**사용 예시:**
```
"myapp PR-123 preview 환경 만들어줘"
"myapp preview 환경 목록 보여줘"
"myapp PR-123 preview 삭제해줘"
```

**Preview URL 형식:**
```
https://pr-123.myapp.preview.codeb.dev
```

---

## 모니터링 도구

### monitoring

Prometheus + Grafana 모니터링을 설정하고 조회합니다.

**파라미터:**
```typescript
{
  action: 'setup' | 'status' | 'metrics' | 'alerts' | 'configure';  // 액션 (필수)
  projectName?: string;         // 프로젝트 이름
  environment?: 'staging' | 'production' | 'preview';
  metric?: string;              // 조회할 메트릭 이름
  timeRange?: string;           // 시간 범위 (예: '1h', '24h')
}
```

**사용 예시:**
```
"myapp 모니터링 설정해줘"
"모니터링 상태 확인해줘"
"myapp production 메트릭 보여줘"
"현재 알림 목록 보여줘"
```

**제공 메트릭:**
- 시스템: CPU, 메모리, 디스크 사용률
- 애플리케이션: 요청 수, 응답 시간, 에러율
- 컨테이너: 상태, 리소스 사용량

**자동 생성 알림 규칙:**
- 서비스 다운 (1분 이상)
- 높은 에러율 (>5%)
- 높은 지연 시간 (p95 >2s)
- 높은 CPU/메모리 사용률 (>85%)

---

## 다음 단계

- [배포 전략 가이드](03-DEPLOYMENT-STRATEGIES.md) - 배포 전략 상세 설명
- [모니터링 및 알림 가이드](04-MONITORING-ALERTING.md) - 모니터링 설정 상세
- [보안 스캔 가이드](05-SECURITY-SCANNING.md) - 보안 스캔 상세
