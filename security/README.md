# CodeB Security System - 4-Layer Defense Architecture

## Overview

CodeB Security System은 AI 코딩 도구(Claude Code, Cursor, Windsurf)에서 위험한 명령을 **100% 차단**하는 서비스 프로세스 기반 보안 시스템입니다.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  AI IDE (Claude Code / Cursor / Windsurf / Cline)               │
│  - MCP Tools 호출                                                │
│  - Bash 명령 실행                                                │
│  - CLI 명령 실행                                                 │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: Claude Code Hooks (pre-bash.py)                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  • SSH 화이트리스트 검증                                         │
│  • 금지 명령 패턴 차단 (podman rm -f, volume rm 등)              │
│  • Protection Daemon 연동 (Unix Socket)                          │
│  • 우회 시도 탐지                                                │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: Protection Daemon (systemd service)                    │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  • Unix Socket 통신 (/var/run/codeb/protection.sock)            │
│  • 모든 명령 실시간 검증                                         │
│  • 프로덕션 컨테이너 절대 보호                                   │
│  • 감사 로그 (SQLite)                                            │
│  • Rate Limiting                                                 │
│  • 서버와 실시간 동기화                                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: MCP Proxy Gateway                                      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  • 모든 MCP Tool 호출 가로채기                                   │
│  • Protection Daemon에 검증 요청                                 │
│  • 위험 도구 차단 (deploy, rollback 등 민감 작업)               │
│  • 요청/응답 로깅                                                │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4: CLI Validator Middleware                               │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  • we CLI 내부 명령 검증                                         │
│  • Protection Daemon 필수 연동                                   │
│  • Daemon 미실행 시 위험 명령 차단                               │
│  • 프로젝트 격리 검증                                            │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Protection Daemon (`codeb-protection-daemon`)
- **Port**: Unix Socket `/var/run/codeb/protection.sock`
- **Role**: 중앙 검증 서비스 (모든 명령이 거쳐야 함)
- **Features**:
  - 프로덕션 컨테이너 절대 보호
  - 위험 명령 패턴 차단
  - 감사 로그 기록
  - SSOT 서버와 동기화

### 2. MCP Proxy Gateway (`codeb-mcp-proxy`)
- **Port**: 3199 (MCP 클라이언트 연결용)
- **Role**: MCP Tool 호출 프록시
- **Features**:
  - 모든 MCP 요청 검증
  - 위험 도구 차단
  - Protection Daemon 연동

### 3. CLI Validator (`cli/src/lib/protection-client.js`)
- **Role**: we CLI 내부 검증
- **Features**:
  - Daemon 연결 필수
  - 명령 실행 전 검증
  - 실패 시 안전 모드

### 4. Claude Code Hooks (`.claude/hooks/pre-bash.py`)
- **Role**: Bash 명령 1차 필터
- **Features**:
  - Daemon 연동
  - 금지 패턴 차단
  - 우회 시도 탐지

## Installation

```bash
cd security
./install.sh
```

## Files

```
security/
├── daemon/
│   ├── protection-daemon.js      # 핵심 보호 데몬
│   ├── audit-db.js               # SQLite 감사 로그
│   └── rules-engine.js           # 규칙 엔진
├── mcp-proxy/
│   ├── mcp-proxy-gateway.js      # MCP 프록시
│   └── tool-validator.js         # 도구 검증
├── cli/
│   └── protection-client.js      # CLI 클라이언트
├── hooks/
│   └── pre-bash.py               # Claude Code 훅
├── systemd/
│   ├── codeb-protection.service  # Daemon 서비스
│   └── codeb-mcp-proxy.service   # MCP 프록시 서비스
├── install.sh                    # 설치 스크립트
└── README.md                     # 이 문서
```

## Security Rules

### Absolutely Blocked (절대 차단)
- `podman rm -f` / `docker rm -f`
- `podman volume rm` / `docker volume rm`
- `podman system prune -a`
- `rm -rf /opt/codeb`
- 프로덕션 컨테이너 (`*-production`, `*-prod`)
- 포트 4000-4499 컨테이너

### Require Confirmation (확인 필요)
- `podman stop`
- `podman restart`
- 환경변수 변경

### Always Allowed (항상 허용)
- `we *` CLI 명령 (내부 검증 후)
- `podman ps`, `podman logs`, `podman inspect`
- 조회 명령

## Audit Log

모든 명령은 SQLite에 기록됩니다:
- 위치: `/var/lib/codeb/audit.db`
- 보존 기간: 90일
- 기록 내용: 시간, 명령, 사용자, 결과, IP

## Bypass Prevention

1. **Daemon 미실행 시**: 모든 위험 명령 자동 차단
2. **Socket 조작 시**: 권한 검증 (root/codeb 그룹만)
3. **직접 SSH 시도**: 화이트리스트 검증
4. **환경변수 조작**: 서명 검증
