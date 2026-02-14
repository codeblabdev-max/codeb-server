---
name: we:health
description: "헬스체크", "health", "상태 확인", "서버 상태" 등의 요청 시 자동 활성화. 시스템 상태를 확인합니다.
---

# we:health - 시스템 상태 확인

## 활성화 키워드
- 헬스체크, health, health check
- 상태 확인, status
- 서버 상태, 시스템 상태

## 사용 도구
- `mcp__codeb-deploy__health_check` - 전체 시스템 헬스체크
- `mcp__codeb-deploy__slot_status` - 슬롯 상태 확인

## 헬스체크 절차

### 전체 시스템 상태 확인
```
mcp__codeb-deploy__health_check { "server": "all" }
```

### 특정 서버 상태 확인
```
mcp__codeb-deploy__health_check { "server": "app" }
mcp__codeb-deploy__health_check { "server": "storage" }
mcp__codeb-deploy__health_check { "server": "streaming" }
mcp__codeb-deploy__health_check { "server": "backup" }
```

### 프로젝트 슬롯 상태 확인
```
mcp__codeb-deploy__slot_status {
  "projectName": "프로젝트명",
  "environment": "production"
}
```

## 4-Server 아키텍처
| 역할 | IP | 서비스 |
|------|-----|--------|
| **App** | 158.247.203.55 | MCP API, Caddy, Docker |
| **Streaming** | 141.164.42.213 | Centrifugo WebSocket |
| **Storage** | 64.176.226.119 | PostgreSQL, Redis |
| **Backup** | 141.164.37.63 | Prometheus, Grafana |

## 관련 스킬
- `we:deploy` - 배포 후 상태 확인
- `we:rollback` - 롤백 후 상태 확인
