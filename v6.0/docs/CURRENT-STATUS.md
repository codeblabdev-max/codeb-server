# CodeB v6.0 현재 상황 정리

> 작성일: 2026-01-07
> 상태: ✅ API 기반 아키텍처로 전환 완료

---

## 1. 새 아키텍처 (Vercel 방식)

### 1.1 Before vs After

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          이전 아키텍처 (문제점)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  팀원 → /we:deploy → MCP (SSH 직접 연결) → 서버                             │
│                           ↑                                                 │
│                    SSH 키 필요 (보안 위험)                                   │
│                    팀원마다 SSH 접근 권한 필요                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          새 아키텍처 (Vercel 방식)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  팀원 → /we:deploy → MCP Proxy → HTTP API → 서버                            │
│                                      ↑                                      │
│                               API Key 인증                                  │
│                               SSH 접근 불필요                                │
│                               중앙 집중 관리                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 전체 시스템 구조

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CodeB v6.0 System Architecture                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                        ┌──────────────────┐                                 │
│                        │   Claude Code    │                                 │
│                        │   (팀원의 IDE)   │                                 │
│                        └────────┬─────────┘                                 │
│                                 │                                           │
│                                 ▼                                           │
│                        ┌──────────────────┐                                 │
│                        │  /we:* Commands  │                                 │
│                        │  (Slash Skills)  │                                 │
│                        └────────┬─────────┘                                 │
│                                 │                                           │
│                                 ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        MCP Proxy Server                              │   │
│  │                    v6.0/mcp-proxy/dist/index.js                      │   │
│  │                                                                      │   │
│  │    • SSH 연결 없음 (No SSH)                                          │   │
│  │    • HTTP API 호출만 수행                                            │   │
│  │    • API Key 인증 사용                                               │   │
│  └────────────────────────────────────────────────────────────────────┬─┘   │
│                                                                       │     │
│                                   HTTPS + API Key                     │     │
│                                                                       ▼     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        HTTP API Server                               │   │
│  │                       https://api.codeb.kr                           │   │
│  │                    v6.0/mcp-server/src/index.ts                      │   │
│  │                                                                      │   │
│  │    • Team-based 인증 (API Key)                                       │   │
│  │    • Rate Limiting                                                   │   │
│  │    • Audit Logging                                                   │   │
│  │    • PostgreSQL 연동                                                 │   │
│  └────────────────────────────────────────────────────────────────────┬─┘   │
│                                                                       │     │
│                                    SSH (내부만)                        │     │
│                                                                       ▼     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        Server Infrastructure                         │   │
│  │                                                                      │   │
│  │   n1 (App)         n2 (Streaming)   n3 (Storage)    n4 (Backup)     │   │
│  │   158.247.203.55   141.164.42.213   64.176.226.119  141.164.37.63   │   │
│  │                                                                      │   │
│  │   • Podman         • Centrifugo     • PostgreSQL    • ENV Backup    │   │
│  │   • Quadlet        • WebSocket      • Redis         • Prometheus    │   │
│  │   • Caddy                                           • Grafana       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 명령어 체계

| 카테고리 | 상태 | 설명 |
|----------|------|------|
| `/we:*` | **유지** | CodeB 핵심 명령어 (deploy, workflow, health, domain, quick 등) |
| `/sc:*` | **외부** | 별도 MCP (implement, build, test, git 등) - CodeB와 무관 |
| `/cb*` | **제거** | 레거시 MCP |

---

## 3. 파일 구조

### 3.1 MCP Proxy (신규 생성)

```
v6.0/mcp-proxy/
├── package.json          # 의존성 정의
├── tsconfig.json         # TypeScript 설정
├── src/
│   └── index.ts          # MCP 서버 (HTTP API 프록시)
└── dist/
    └── index.js          # 빌드된 MCP 서버 ✅
```

### 3.2 HTTP API Server (기존)

```
v6.0/mcp-server/
├── package.json
├── src/
│   ├── index.ts          # Express HTTP API 서버
│   ├── lib/
│   │   ├── auth.ts       # API Key 인증
│   │   ├── database.ts   # PostgreSQL
│   │   ├── logger.ts     # Winston 로깅
│   │   ├── metrics.ts    # Prometheus
│   │   └── ssh.ts        # SSH Pool (서버 내부용)
│   └── tools/
│       ├── deploy.ts     # Blue-Green 배포
│       ├── promote.ts    # 트래픽 전환
│       ├── rollback.ts   # 롤백
│       ├── domain.ts     # 도메인 관리
│       └── ...
└── dist/
```

---

## 4. 설정 파일

### 4.1 .mcp.json (업데이트됨)

```json
{
  "mcpServers": {
    "codeb-deploy": {
      "command": "node",
      "args": [
        "/Users/admin/new_project/codeb-server/v6.0/mcp-proxy/dist/index.js"
      ],
      "env": {
        "CODEB_API_URL": "https://api.codeb.kr",
        "CODEB_API_KEY": "${CODEB_API_KEY}"
      }
    }
  }
}
```

### 4.2 환경변수 설정

```bash
# ~/.zshrc 또는 ~/.bashrc에 추가
export CODEB_API_KEY="codeb_myteam_member_xxxxx"
```

---

## 5. 인증 체계

### 5.1 API Key 형식 (Vercel 스타일)

```
codeb_{teamId}_{role}_{randomToken}

예: codeb_team123_member_a1b2c3d4e5f6g7h8
```

### 5.2 역할 계층

| 역할 | 배포 | Promote | Rollback | ENV 설정 | 팀 관리 |
|------|:----:|:-------:|:--------:|:--------:|:-------:|
| owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| member | ✅ | ✅ | ✅ | ✅ | ❌ |
| viewer | ❌ | ❌ | ❌ | ❌ | ❌ |

### 5.3 팀원 온보딩 플로우

```
1. Admin이 API Key 발급: we token create --role member
2. 팀원이 환경변수 설정: export CODEB_API_KEY=codeb_...
3. 팀원이 배포: /we:deploy myapp staging

→ SSH 접근 불필요
→ 모든 작업이 API를 통해 수행됨
→ 감사 로그 자동 기록
```

---

## 6. 사용 가능한 MCP Tools

| Tool | 설명 | 권한 |
|------|------|------|
| `deploy_project` | Blue-Green 배포 | member+ |
| `slot_promote` | 트래픽 전환 | member+ |
| `rollback` | 이전 버전 롤백 | member+ |
| `slot_status` | Slot 상태 조회 | viewer+ |
| `workflow_init` | CI/CD 초기화 | member+ |
| `workflow_scan` | 워크플로우 스캔 | viewer+ |
| `domain_setup` | 도메인 설정 | member+ |
| `domain_list` | 도메인 목록 | viewer+ |
| `domain_delete` | 도메인 삭제 | member+ |
| `health_check` | 헬스 체크 | viewer+ |
| `scan` | 프로젝트 스캔 | viewer+ |
| `env_scan` | ENV 비교 | viewer+ |
| `env_restore` | ENV 복구 | member+ |

---

## 7. Vercel과 비교

| 기능 | Vercel | CodeB v6.0 |
|------|:------:|:----------:|
| API Key 인증 | ✅ | ✅ |
| Team-based 권한 | ✅ | ✅ |
| SSH 접근 불필요 | ✅ | ✅ |
| Blue-Green 배포 | ✅ | ✅ |
| 즉시 롤백 | ✅ | ✅ |
| Preview URL | ✅ | ✅ |
| 감사 로그 | ✅ | ✅ |
| Rate Limiting | ✅ | ✅ |

---

## 8. 완료/남은 작업

### 8.1 완료됨 ✅
- [x] MCP Proxy 서버 생성 (HTTP API 호출)
- [x] .mcp.json 업데이트
- [x] SSH 직접 연결 제거
- [x] 아키텍처 문서화

### 8.2 남은 작업
- [ ] HTTP API 서버 배포 (api.codeb.kr)
- [ ] API Key 초기 발급
- [ ] `/cb*` 레거시 명령어 파일 제거

---

*문서 버전: 2.0.0 | 최종 업데이트: 2026-01-07*
