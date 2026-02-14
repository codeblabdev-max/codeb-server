# @codeb/mcp

> MCP Stdio 서버 - Claude Code와 HTTP API 간 프록시

## 역할

Claude Code가 stdin/stdout JSON-RPC로 도구를 호출하면,
HTTP API (api.codeb.kr)로 중계하는 순수 프록시 서버.

```
Claude Code (stdin/stdout)
       ↕ JSON-RPC
  MCP Stdio Server (@codeb/mcp)
       ↕ HTTP
  API Server (@codeb/api, port 9101)
```

## 디렉토리 구조

```
apps/mcp/
├── bin/
│   └── codeb-mcp.ts     ← #!/usr/bin/env tsx 엔트리포인트
└── src/
    ├── index.ts          ← MCP Server 부트스트랩 + Stdio Transport
    ├── tools.ts          ← 13개 도구 스키마 정의 + API 매핑
    └── api-client.ts     ← HTTP API 프록시 (fetch)
```

## 통신 프로토콜

### ListTools (도구 목록 조회)

```
Claude Code → ListToolsRequest
  → MCP Server → TOOLS 배열 반환
```

### CallTool (도구 실행)

```
Claude Code → CallToolRequest { name, arguments }
  → API_TOOL_MAP으로 이름 변환
  → POST api.codeb.kr/api/tool { tool, params }
  → 결과 → ContentBlock으로 변환
  → Claude Code
```

## 도구 목록 (13개)

| MCP Tool Name | → API Tool Name | 카테고리 |
|--------------|-----------------|---------|
| `deploy_project` | `deploy` | 배포 |
| `slot_promote` | `promote` | 배포 |
| `rollback` | `rollback` | 배포 |
| `slot_status` | `slot_status` | 배포 |
| `workflow_init` | `workflow_init` | 프로젝트 |
| `workflow_scan` | `workflow_scan` | 프로젝트 |
| `domain_setup` | `domain_setup` | 도메인 |
| `domain_list` | `domain_list` | 도메인 |
| `domain_delete` | `domain_delete` | 도메인 |
| `health_check` | `health_check` | 모니터링 |
| `scan` | `workflow_scan` | 프로젝트 |
| `env_scan` | `env_scan` | 환경변수 |
| `env_restore` | `env_restore` | 환경변수 |

## API Tool Name 매핑

이름이 다른 도구만 매핑 (나머지는 동일):

```typescript
const API_TOOL_MAP = {
  deploy_project: 'deploy',
  slot_promote: 'promote',
  scan: 'workflow_scan',
};
```

## API Client

```typescript
// API Key 로드 우선순위:
// 1. 프로젝트 .env (CODEB_API_KEY)
// 2. 환경변수 CODEB_API_KEY
// 3. ~/.codeb/config.json
// 4. ~/.codeb/.env (legacy)

// 모든 요청:
// POST ${API_URL}/api/tool
// Headers: Content-Type: application/json, X-API-Key: ${key}
// Body: { tool: string, params: Record<string, unknown> }
```

## Claude Code 설정

`~/.claude/settings.json`에 MCP 서버 등록:

```json
{
  "mcpServers": {
    "codeb-deploy": {
      "command": "tsx",
      "args": ["/path/to/v2/apps/mcp/bin/codeb-mcp.ts"],
      "env": {
        "CODEB_API_KEY": "codeb_..."
      }
    }
  }
}
```

## 핵심 특성

- **순수 프록시**: Feature 의존성 없음 (HTTP만 사용)
- **의존성 최소화**: `@modelcontextprotocol/sdk` + `@codeb/shared`만
- **무상태**: 세션/연결 상태 없음, 요청별 독립 처리

## 의존성

- `@modelcontextprotocol/sdk` - MCP 프로토콜 SDK
- `@codeb/shared` - VERSION 상수
