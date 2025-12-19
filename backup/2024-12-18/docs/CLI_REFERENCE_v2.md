# we CLI v2.5 Reference

> Web Deploy CLI - MCP Thin Client

## Installation

```bash
cd cli
npm install
npm link
```

## Quick Start

```bash
# 1. 설정 초기화
we config init

# 2. MCP 서버 설정
we mcp setup

# 3. 새 프로젝트 초기화
we workflow init myapp --type nextjs --database --redis

# 4. 배포
we deploy myapp --environment staging
```

## Commands

### workflow - Infrastructure & CI/CD

프로젝트 인프라 및 CI/CD 워크플로우 관리

```bash
# 프로젝트 초기화 (Full Stack)
we workflow init myapp --type nextjs --database --redis

# 옵션:
#   --type         프로젝트 타입 (nextjs|remix|nodejs|static)
#   --database     PostgreSQL 포함
#   --redis        Redis 포함
#   --no-database  PostgreSQL 제외
#   --no-redis     Redis 제외
#   --staging-port <port>      Staging 앱 포트
#   --production-port <port>   Production 앱 포트
#   --no-interactive           비대화형 모드

# Quadlet 파일 생성
we workflow quadlet myapp

# GitHub Actions 워크플로우 생성
we workflow github-actions myapp

# 서버 동기화
we workflow sync myapp
we workflow sync myapp --restart  # 서비스 재시작 포함

# 리소스 스캔
we workflow scan myapp

# 서비스 추가
we workflow add-service myapp --service postgres
we workflow add-service myapp --service redis

# 포트 검증
we workflow port-validate myapp

# 포트 드리프트 감지
we workflow port-drift
```

### ssot - Single Source of Truth

중앙 집중식 인프라 레지스트리 관리

```bash
# SSOT 상태 확인
we ssot status

# 등록된 프로젝트 목록
we ssot projects
we ssot projects --status active

# 특정 프로젝트 상세 정보
we ssot project --id myapp

# 변경 이력 조회
we ssot history
we ssot history --limit 20

# SSOT 무결성 검증
we ssot validate
we ssot validate --fix  # 자동 수정

# SSOT 동기화
we ssot sync
we ssot sync --dry-run  # 미리보기

# SSOT 초기화
we ssot init
we ssot init --force    # 강제 재초기화
```

### deploy - Deployment

프로젝트 배포

```bash
# Staging 배포
we deploy myapp --environment staging

# Production 배포
we deploy myapp --environment production

# 배포 전략
we deploy myapp -e production --strategy rolling     # 기본
we deploy myapp -e production --strategy blue-green
we deploy myapp -e production --strategy canary

# 옵션
#   --force       경고 무시하고 배포
#   --dry-run     배포 계획만 표시
#   --no-cache    캐시 없이 빌드
```

### rollback - Rollback

이전 버전으로 롤백

```bash
# 이전 버전으로 롤백
we rollback myapp --environment staging

# 특정 버전으로 롤백
we rollback myapp -e production --version v1.2.3

# 사용 가능한 버전 목록
we rollback myapp --list

# 옵션
#   --force       확인 없이 롤백
#   --dry-run     롤백 계획만 표시
```

### health - Health Check

시스템 헬스체크

```bash
# 기본 헬스체크
we health

# 상세 정보
we health --verbose

# JSON 출력
we health --json

# 연속 모니터링
we health --watch
we health --watch --interval 60  # 60초 간격
```

### domain - Domain Management

도메인 설정 관리

```bash
# 도메인 설정
we domain setup myapp.codeb.dev --project myapp

# 도메인 제거
we domain remove myapp.codeb.dev

# 도메인 상태 확인
we domain check myapp.codeb.dev

# 도메인 목록
we domain list

# 옵션
#   --ssl     SSL 활성화 (기본)
#   --www     www 서브도메인 포함
#   --force   확인 없이 실행
```

### monitor - Real-time Monitoring

실시간 모니터링

```bash
# 기본 모니터링
we monitor

# 메트릭 지정
we monitor --metrics cpu,memory,disk,network

# 옵션
#   --interval <seconds>   업데이트 간격 (기본: 5)
#   --duration <minutes>   모니터링 시간 (0 = 무한)
#   --threshold <percent>  알림 임계값 (기본: 80)
```

### analyze - Project Analysis

7-Agent 시스템으로 프로젝트 분석

```bash
# 기본 분석
we analyze

# 분석 깊이 지정
we analyze --depth shallow   # 빠른 분석
we analyze --depth normal    # 기본
we analyze --depth deep      # 심층 분석

# 분석 초점
we analyze --focus security     # 보안 분석
we analyze --focus performance  # 성능 분석
we analyze --focus quality      # 코드 품질

# 에이전트 지정
we analyze --agent master       # 전체 분석
we analyze --agent security     # 보안 전문가
we analyze --agent frontend     # 프론트엔드 전문가

# 출력 형식
we analyze --output json
we analyze --save report.md
```

### agent - Direct Agent Invocation

7-Agent 시스템 직접 호출

```bash
# 에이전트 호출
we agent master "전체 프로젝트 분석해줘"
we agent frontend "반응형 네비게이션 컴포넌트 만들어줘"
we agent db "사용자 스키마 최적화해줘"
we agent api "RESTful API 설계해줘"
we agent e2e "전체 사용자 플로우 테스트 작성해줘"
we agent admin "대시보드 페이지 만들어줘"

# 옵션
#   --context <json>   추가 컨텍스트
#   --output json      JSON 출력
#   --save <path>      파일로 저장
#   --async            비동기 실행
```

### ssh - SSH Key Management

Vultr API를 통한 SSH 키 관리

```bash
# SSH 키 등록
we ssh register ~/.ssh/id_rsa.pub --name "My Laptop"

# 등록된 키 목록
we ssh list

# 키 정보 표시
we ssh show <key-id>

# 키 제거
we ssh remove <key-id>

# 서버와 동기화
we ssh sync
```

### config - Configuration

CLI 설정 관리

```bash
# 설정 초기화
we config init

# 현재 설정 표시
we config show

# 설정 검증
we config check

# 설정 값 변경
we config set --key SERVER_HOST --value 149.28.xxx.xxx

# 설정 파일 경로
we config path
```

### mcp - MCP Server Setup

Claude Code MCP 서버 설정

```bash
# MCP 서버 설정
we mcp setup

# MCP 서버 상태
we mcp status

# MCP 서버 제거
we mcp remove

# 옵션
#   --host <ip>       서버 IP
#   --user <user>     SSH 사용자
#   --ssh-key <path>  SSH 키 경로
#   --force           기존 설정 덮어쓰기
```

### help - Documentation

상세 문서 조회

```bash
# 개요
we help overview

# 특정 주제
we help workflow
we help deploy
we help ssot

# 모든 주제 목록
we help --list

# 전체 문서
we help --all

# 빠른 참조
we help quickref
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `CODEB_SERVER_HOST` | 배포 서버 IP |
| `CODEB_SERVER_USER` | SSH 사용자 (기본: root) |
| `CODEB_SSH_KEY_PATH` | SSH 키 경로 |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `CODEB_DB_PASSWORD` | 기본 DB 비밀번호 | codeb2024! |
| `VULTR_API_KEY` | Vultr API 키 | - |
| `GITHUB_TOKEN` | GitHub 토큰 | - |

## Configuration File

`~/.we-cli/config.json`:

```json
{
  "server": {
    "host": "149.28.xxx.xxx",
    "user": "root",
    "sshKeyPath": "~/.ssh/id_rsa"
  },
  "defaults": {
    "environment": "staging",
    "projectType": "nextjs"
  },
  "mcp": {
    "enabled": true,
    "serverPath": "/path/to/mcp-server"
  }
}
```

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error |
| 3 | Connection error |
| 4 | Validation error |
| 5 | Deployment error |

## Examples

### Complete Project Setup

```bash
# 1. CLI 설정
we config init

# 2. SSH 키 등록 (Vultr)
we ssh register ~/.ssh/id_rsa.pub --name "Dev Machine"

# 3. MCP 서버 설정
we mcp setup --host 149.28.xxx.xxx --user root

# 4. 프로젝트 초기화
we workflow init myapp \
  --type nextjs \
  --database \
  --redis \
  --staging-port 3001 \
  --production-port 4001

# 5. SSOT 확인
we ssot status
we ssot projects

# 6. Staging 배포
we deploy myapp --environment staging

# 7. 헬스체크
we health --verbose

# 8. Production 배포
we deploy myapp --environment production --strategy blue-green
```

### Monitoring & Troubleshooting

```bash
# 시스템 상태 확인
we health --verbose --json

# SSOT 검증
we ssot validate

# 포트 충돌 확인
we workflow port-validate myapp

# 포트 드리프트 확인
we workflow port-drift

# 실시간 모니터링
we monitor --metrics cpu,memory,disk --threshold 90

# 문제 분석
we analyze --depth deep --focus security
```

## Version

```
/we: Web Deploy CLI v2.5.0
MCP Thin Client Architecture
```
