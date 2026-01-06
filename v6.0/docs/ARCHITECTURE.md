# CodeB v6.0 - Unified Blue-Green Deployment System

## Overview

v6.0은 v3.x HTTP API와 v5.0 MCP를 통합한 단일 시스템입니다.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CodeB v6.0 Architecture                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Access Layer                                    │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │   Team Member                        Admin                          │   │
│  │   (API Key)                          (API Key + SSH)                │   │
│  │       │                                   │                         │   │
│  │       ▼                                   ▼                         │   │
│  │   ┌───────────────────────────────────────────────────────────┐    │   │
│  │   │              Unified HTTP API :9101                        │    │   │
│  │   │   • X-API-Key Authentication                               │    │   │
│  │   │   • Team-based RBAC                                        │    │   │
│  │   │   • Rate Limiting                                          │    │   │
│  │   │   • Audit Logging                                          │    │   │
│  │   └───────────────────────────────────────────────────────────┘    │   │
│  │                              │                                      │   │
│  └──────────────────────────────┼──────────────────────────────────────┘   │
│                                 │                                          │
│  ┌──────────────────────────────▼──────────────────────────────────────┐   │
│  │                      Core Engine                                     │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │   │
│  │   │   Deploy    │  │   Promote   │  │  Rollback   │                │   │
│  │   │  (Quadlet)  │  │   (Caddy)   │  │  (Instant)  │                │   │
│  │   └─────────────┘  └─────────────┘  └─────────────┘                │   │
│  │                                                                     │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │   │
│  │   │    Team     │  │     ENV     │  │   Domain    │                │   │
│  │   │  Manager    │  │   Manager   │  │   Manager   │                │   │
│  │   └─────────────┘  └─────────────┘  └─────────────┘                │   │
│  │                                                                     │   │
│  │   ┌─────────────────────────────────────────────────────────────┐  │   │
│  │   │              SSH Connection Pool (Admin Only)                │  │   │
│  │   └─────────────────────────────────────────────────────────────┘  │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Single SSOT Registry                            │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │   /opt/codeb/registry/                                              │   │
│  │   ├── ssot.json              # Master registry                      │   │
│  │   ├── teams.json             # Team & member management             │   │
│  │   ├── api-keys.json          # API key → team mapping               │   │
│  │   └── slots/                 # Blue-Green slot states               │   │
│  │       └── {project}-{env}.json                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Team Management (Vercel Style)

### Team 구조

```
Team (Organization)
├── Members (API Keys)
│   ├── Owner (admin)
│   ├── Member (dev)
│   └── Viewer (view)
└── Projects
    ├── Project A
    ├── Project B
    └── Project C
```

### 권한 모델

| Role | 설명 | 권한 |
|------|------|------|
| **owner** | 팀 소유자 | 모든 작업 + 팀 설정 + 멤버 관리 |
| **admin** | 관리자 | 모든 작업 + SSH 접근 |
| **member** | 개발자 | 배포, ENV, 도메인 관리 |
| **viewer** | 뷰어 | 조회만 |

### CLI 명령어 (Vercel 스타일)

```bash
# Team 관리
we team list                    # 팀 목록
we team create <name>           # 팀 생성
we team switch <name>           # 팀 전환
we team invite <email>          # 멤버 초대
we team members                 # 멤버 목록
we team remove <email>          # 멤버 제거

# API Key 관리
we token list                   # 토큰 목록
we token create <name>          # 토큰 생성
we token revoke <id>            # 토큰 폐기

# 프로젝트-팀 연결
we link                         # 현재 디렉토리를 팀 프로젝트에 연결
we unlink                       # 연결 해제
```

---

## API Key Format

```
codeb_{teamId}_{role}_{randomToken}

예시:
codeb_team1_owner_a1b2c3d4e5f6
codeb_team1_member_x9y8z7w6v5u4
codeb_team1_viewer_p0o9i8u7y6t5
```

### Key 생성 규칙

- teamId: 4-20자 영숫자
- role: owner | admin | member | viewer
- token: 24자 base64url (crypto.randomBytes)

---

## Registry Files

### teams.json

```json
{
  "version": "6.0",
  "teams": {
    "codeb-core": {
      "id": "codeb-core",
      "name": "CodeB Core Team",
      "slug": "codeb-core",
      "createdAt": "2025-01-01T00:00:00Z",
      "owner": "admin@codeb.kr",
      "plan": "pro",
      "projects": ["dashboard", "api", "docs"],
      "settings": {
        "defaultEnvironment": "staging",
        "autoPromote": false,
        "gracePeriodHours": 48
      }
    }
  }
}
```

### api-keys.json

```json
{
  "version": "6.0",
  "keys": {
    "codeb_codeb-core_owner_a1b2c3d4": {
      "id": "key_001",
      "name": "Admin Key",
      "teamId": "codeb-core",
      "role": "owner",
      "createdAt": "2025-01-01T00:00:00Z",
      "createdBy": "admin@codeb.kr",
      "lastUsed": "2025-01-06T10:00:00Z",
      "expiresAt": null,
      "scopes": ["*"]
    },
    "codeb_codeb-core_member_x9y8z7w6": {
      "id": "key_002",
      "name": "Developer 1",
      "teamId": "codeb-core",
      "role": "member",
      "createdAt": "2025-01-02T00:00:00Z",
      "createdBy": "admin@codeb.kr",
      "lastUsed": "2025-01-06T09:00:00Z",
      "expiresAt": "2026-01-02T00:00:00Z",
      "scopes": ["deploy", "env", "domain"]
    }
  }
}
```

---

## Permission Matrix

| Action | owner | admin | member | viewer |
|--------|-------|-------|--------|--------|
| team.create | ✅ | ❌ | ❌ | ❌ |
| team.delete | ✅ | ❌ | ❌ | ❌ |
| team.settings | ✅ | ✅ | ❌ | ❌ |
| member.invite | ✅ | ✅ | ❌ | ❌ |
| member.remove | ✅ | ✅ | ❌ | ❌ |
| token.create | ✅ | ✅ | ✅ | ❌ |
| token.revoke | ✅ | ✅ | own only | ❌ |
| project.create | ✅ | ✅ | ✅ | ❌ |
| project.delete | ✅ | ✅ | ❌ | ❌ |
| deploy | ✅ | ✅ | ✅ | ❌ |
| promote | ✅ | ✅ | ✅ | ❌ |
| rollback | ✅ | ✅ | ✅ | ❌ |
| env.get | ✅ | ✅ | ✅ | ✅ |
| env.set | ✅ | ✅ | ✅ | ❌ |
| domain.setup | ✅ | ✅ | ✅ | ❌ |
| ssh.access | ✅ | ✅ | ❌ | ❌ |
| logs.view | ✅ | ✅ | ✅ | ✅ |

---

## 4-Server Infrastructure

| Server | IP | Domain | Services |
|--------|-----|--------|----------|
| **App** | 158.247.203.55 | app.codeb.kr | API, Podman, Caddy, Runner |
| **Streaming** | 141.164.42.213 | ws.codeb.kr | Centrifugo |
| **Storage** | 64.176.226.119 | db.codeb.kr | PostgreSQL, Redis |
| **Backup** | 141.164.37.63 | backup.codeb.kr | ENV Backup, Prometheus |

---

## Port Allocation

| Environment | App Port Range | Blue | Green |
|-------------|---------------|------|-------|
| Staging | 3000-3499 | base | base+1 |
| Production | 4000-4499 | base | base+1 |
| Preview | 5000-5999 | base | base+1 |

---

## Version: 6.0.0
