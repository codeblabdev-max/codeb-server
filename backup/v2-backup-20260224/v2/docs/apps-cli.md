# @codeb/cli

> Commander 기반 CLI 도구 - `we` 명령으로 배포/관리

## 역할

터미널에서 `we deploy`, `we health`, `we domain` 등의 명령으로
CodeB 플랫폼을 조작하는 CLI 도구.

## 디렉토리 구조

```
apps/cli/
├── bin/
│   └── we.ts              ← #!/usr/bin/env tsx 엔트리포인트
├── src/
│   ├── index.ts           ← Commander Program 정의 (6개 명령)
│   ├── commands/
│   │   ├── deploy.cmd.ts  ← deploy, promote, rollback, slot
│   │   ├── health.cmd.ts  ← health [--watch]
│   │   ├── init.cmd.ts    ← init [apiKey]
│   │   ├── workflow.cmd.ts← workflow init/scan
│   │   ├── env.cmd.ts     ← env scan/pull/push
│   │   └── domain.cmd.ts  ← domain setup/list/delete
│   ├── lib/
│   │   ├── api-client.ts  ← HTTP API 클라이언트 (fetch 기반)
│   │   ├── config.ts      ← 설정 로드 (~/.codeb/config.json)
│   │   └── formatter.ts   ← 출력 포맷팅 (chalk, table)
│   └── tui/
│       └── dashboard.ts   ← TUI 대시보드 (실험적)
└── package.json
```

## 명령어 목록 (6개)

### 1. deploy - Blue-Green 배포

```bash
we deploy <project> [env]           # 배포
we deploy promote <project> [env]   # 트래픽 전환
we deploy rollback <project> [env]  # 롤백
we deploy slot <project> [env]      # 슬롯 상태
```

### 2. health - 시스템 상태

```bash
we health                           # 전체 헬스체크
we health --watch                   # 실시간 모니터링
we health --server app              # 특정 서버
```

### 3. init - 프로젝트 초기화

```bash
we init [apiKey]                    # API Key 설정 + 초기화
we init config                      # 설정만 업데이트
we init mcp                         # MCP 설정 업데이트
```

### 4. workflow - CI/CD

```bash
we workflow init <project>          # 워크플로우 생성
we workflow scan <project>          # 설정 스캔
```

### 5. env - 환경변수

```bash
we env scan [project]               # 로컬 ↔ 서버 비교
we env pull [project]               # 서버 → 로컬
we env push [project]               # 로컬 → 서버
```

### 6. domain - 도메인

```bash
we domain setup <domain>            # 도메인 설정
we domain list                      # 목록
we domain delete <domain>           # 삭제
```

## API Client

```typescript
// lib/api-client.ts
// HTTP API (api.codeb.kr)에 요청을 보내는 클라이언트
// - API Key 자동 로드 (config.ts에서)
// - chalk + ora로 진행 상태 표시
// - 에러 핸들링 + 포맷팅
```

## API Key 로드 우선순위

1. 프로젝트 `.env` 파일 (`CODEB_API_KEY=...`)
2. 환경변수 `CODEB_API_KEY`
3. `~/.codeb/config.json` (`{ "CODEB_API_KEY": "..." }`)

## 의존성

- `commander` - CLI 프레임워크
- `chalk` - 컬러 출력
- `ora` - 스피너
- `@codeb/shared` - 타입, 상수
