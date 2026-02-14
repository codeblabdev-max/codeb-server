# CodeB Server v2 - Architecture Documentation

> Turborepo + pnpm 워크스페이스 기반 FSD(Feature-Sliced Design) 모노레포

## Overview

```
v2/
├── packages/     ← 공유 인프라 레이어 (5개)
│   ├── shared    ← 타입, 스키마, 상수, 에러
│   ├── db        ← PostgreSQL 커넥션 풀 + 리포지토리
│   ├── ssh       ← SSH 커넥션 풀 + 원격 실행
│   ├── auth      ← API Key 인증 + RBAC + Rate Limiting
│   └── logger    ← Winston 구조화 로깅 + 감사 추적
│
├── features/     ← 비즈니스 도메인 레이어 (6개)
│   ├── deployment  ← Blue-Green 배포, Promote, Rollback, Slot
│   ├── domain      ← 도메인 관리, PowerDNS, SSL
│   ├── environment ← 환경변수 동기화, 백업/복원
│   ├── project     ← 프로젝트 초기화, 스캔, 워크플로우
│   ├── team        ← 팀/멤버/토큰 관리
│   └── monitoring  ← 헬스체크, Prometheus, 로그 스트림
│
├── apps/         ← 애플리케이션 레이어 (3개)
│   ├── api       ← Express HTTP API 서버 (port 9101)
│   ├── cli       ← Commander CLI 도구 (`we` 명령)
│   └── mcp       ← MCP Stdio 서버 (Claude Code 연동)
│
├── docs/         ← 이 문서
├── turbo.json    ← Turborepo 빌드 파이프라인
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## 의존성 그래프

```
                    ┌─────────┐
                    │ shared  │  ← 모든 패키지가 의존
                    └────┬────┘
                         │
            ┌────────────┼────────────┐
            │            │            │
       ┌────┴───┐  ┌────┴───┐  ┌────┴────┐
       │   db   │  │  ssh   │  │  auth   │
       └────┬───┘  └────┬───┘  └────┬────┘
            │            │            │       ┌────────┐
            └────────────┼────────────┘       │ logger │
                         │                    └────┬───┘
         ┌───────────────┼───────────────┐         │
         │               │               │         │
   ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐   │
   │deployment │  │  domain   │  │environment│   │
   │ project   │  │   team    │  │monitoring │   │
   └─────┬─────┘  └─────┬─────┘  └─────┬─────┘   │
         │               │               │         │
         └───────────────┼───────────────┘         │
                         │                         │
                    ┌────┴────┐                    │
                    │   api   │────────────────────┘
                    │   cli   │
                    │   mcp   │
                    └─────────┘
```

## 빌드 & 실행

```bash
# 전체 빌드 (14/14 패키지)
cd v2 && pnpm install && turbo build

# 개발 모드
pnpm dev:api          # API 서버 (port 9101)
pnpm dev:cli          # CLI 개발

# 개별 빌드
turbo build --filter=@codeb/api
turbo build --filter=@codeb/feature-deployment
```

## 기술 스택

| 영역 | 기술 |
|------|------|
| Runtime | Node.js ≥ 20 |
| Language | TypeScript 5.7+ (strict, ES2022, NodeNext) |
| Monorepo | Turborepo + pnpm 9 |
| API Server | Express + Helmet + CORS |
| CLI | Commander + Chalk + Ora |
| MCP | @modelcontextprotocol/sdk (Stdio) |
| Database | PostgreSQL (pg) |
| SSH | ssh2 |
| Auth | SHA-256 API Key + RBAC |
| Logging | Winston (JSON structured) |

## 패키지 목록 (14개)

| 레이어 | 패키지명 | 설명 | 문서 |
|--------|---------|------|------|
| packages | `@codeb/shared` | 타입, 스키마, 상수, 에러 | [shared.md](./packages-shared.md) |
| packages | `@codeb/db` | PostgreSQL DB 레이어 | [db.md](./packages-db.md) |
| packages | `@codeb/ssh` | SSH 클라이언트 + 커넥션 풀 | [ssh.md](./packages-ssh.md) |
| packages | `@codeb/auth` | 인증, 권한, Rate Limiting | [auth.md](./packages-auth.md) |
| packages | `@codeb/logger` | 구조화 로깅 | [logger.md](./packages-logger.md) |
| features | `@codeb/feature-deployment` | Blue-Green 배포 | [deployment.md](./features-deployment.md) |
| features | `@codeb/feature-domain` | 도메인/DNS/SSL | [domain.md](./features-domain.md) |
| features | `@codeb/feature-env` | 환경변수 관리 | [environment.md](./features-environment.md) |
| features | `@codeb/feature-project` | 프로젝트 초기화 | [project.md](./features-project.md) |
| features | `@codeb/feature-team` | 팀/멤버/토큰 | [team.md](./features-team.md) |
| features | `@codeb/feature-monitoring` | 모니터링 | [monitoring.md](./features-monitoring.md) |
| apps | `@codeb/api` | HTTP API 서버 | [api.md](./apps-api.md) |
| apps | `@codeb/cli` | CLI 도구 | [cli.md](./apps-cli.md) |
| apps | `@codeb/mcp` | MCP Stdio 서버 | [mcp.md](./apps-mcp.md) |
