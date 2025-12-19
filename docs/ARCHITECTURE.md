# CodeB Server Architecture

## Overview

CodeB Server는 Node.js 기반의 서버 관리 및 배포 자동화 플랫폼입니다. Vercel/Coolify와 유사한 기능을 제공하며, CLI와 MCP(Model Context Protocol) 서버를 통해 Claude Code와 통합됩니다.

## Tech Stack

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| CLI | Node.js | 20+ | `we` 명령어 인터페이스 |
| MCP Server | TypeScript | - | Claude Code 통합 |
| Container Runtime | Podman | 4.x | 컨테이너 관리 |
| Reverse Proxy | Caddy | 2.x | HTTPS + 리버스 프록시 |
| DNS Server | PowerDNS | 4.x | DNS 관리 |
| Service Manager | systemd + Quadlet | - | 컨테이너 서비스화 |
| CI/CD | GitHub Actions | - | 자동 빌드/배포 |

## Server Infrastructure

### Videopick Account Servers (4대)

| Server | IP | Role | Services |
|--------|-----|------|----------|
| App | 158.247.203.55 | Main Control | PowerDNS, Caddy, GitHub Runner, 앱 컨테이너 |
| Streaming | 141.164.42.213 | Media Services | Video streaming, transcoding |
| Storage | 64.176.226.119 | Data Storage | S3-compatible storage, backups |
| Backup | 141.164.37.63 | Backup & Recovery | Automated backups, disaster recovery |

### DNS Configuration

- **ns1.one-q.xyz** → 158.247.203.55
- **ns2.one-q.xyz** → 158.247.203.55
- ***.one-q.xyz** → 158.247.203.55 (Wildcard)

## Project Structure

```
codeb-server/
├── cli/                          # we CLI Tool
│   ├── bin/we.js                 # Entry point
│   └── src/
│       ├── commands/
│       │   ├── deploy.js         # 배포 명령
│       │   ├── domain.js         # 도메인 관리
│       │   ├── env.js            # 환경변수 관리
│       │   ├── health.js         # 헬스체크
│       │   ├── workflow.js       # CI/CD 워크플로우
│       │   ├── ssh.js            # SSH 키 관리
│       │   ├── ssot.js           # SSOT 관리
│       │   └── ...
│       └── lib/
│           ├── mcp-client.js     # MCP 서버 연결
│           ├── ssot-client.js    # SSOT 클라이언트
│           └── config.js         # 설정 관리
│
├── codeb-deploy-system/
│   └── mcp-server/               # MCP Server (TypeScript)
│       └── src/
│           ├── index.ts          # Entry point
│           ├── tools/            # MCP Tools
│           │   ├── deploy.ts
│           │   ├── domain.ts
│           │   ├── port.ts
│           │   └── ssot.ts
│           └── lib/
│               ├── ssot-manager.ts
│               ├── port-manifest.ts
│               └── port-registry.ts
│
├── infrastructure/
│   └── terraform/                # Vultr 서버 프로비저닝
│
└── docs/                         # 문서
```

## Core Components

### 1. we CLI

터미널 기반 서버 관리 도구:

```bash
we deploy <project>           # 프로젝트 배포
we domain setup <domain>      # 도메인 설정
we env set <key>=<value>      # 환경변수 설정
we workflow init              # CI/CD 초기화
we health check               # 헬스체크
we ssot status                # SSOT 상태 확인
```

### 2. MCP Server

Claude Code와 통합되는 Model Context Protocol 서버:

- `mcp__codeb-deploy__deploy` - 배포 실행
- `mcp__codeb-deploy__setup_domain` - 도메인 설정
- `mcp__codeb-deploy__ssot_*` - SSOT 관리
- `mcp__codeb-deploy__port_*` - 포트 관리

### 3. SSOT (Single Source of Truth)

프로젝트, 포트, 도메인 정보의 단일 진실 공급원:

```json
{
  "projects": {
    "my-app": {
      "type": "nextjs",
      "environments": {
        "staging": {
          "ports": { "app": 3001, "db": 15433 },
          "domain": "my-app-staging.one-q.xyz"
        }
      }
    }
  }
}
```

## Port Allocation Strategy

### Port Ranges by Environment

| Environment | App Ports | DB Ports | Redis Ports |
|-------------|-----------|----------|-------------|
| Staging | 3000-3499 | 15432-15499 | 16379-16399 |
| Production | 4000-4499 | 25432-25499 | 26379-26399 |
| Preview | 5000-5999 | - | - |

### GitOps Port Management

1. 포트 매니페스트에서 자동 할당
2. 서버 실제 상태와 동기화
3. 충돌 감지 및 드리프트 관리

## Deployment Flow

```
1. Project Analysis
   └── package.json 분석, Prisma 감지

2. Infrastructure Setup
   ├── 포트 자동 할당 (SSOT)
   ├── PostgreSQL 컨테이너 (Podman)
   └── Redis 컨테이너 (선택)

3. Container Deployment
   ├── GitHub Actions 빌드
   ├── ghcr.io 이미지 푸시
   └── Quadlet 서비스 배포

4. Domain Configuration
   ├── PowerDNS A 레코드
   ├── Caddy 리버스 프록시
   └── 자동 SSL (Let's Encrypt)

5. Health Check
   └── HTTP 헬스체크 + 자동 롤백
```

## Comparison with Other Platforms

| Feature | CodeB | Coolify | Vercel |
|---------|-------|---------|--------|
| Container | Podman | Docker | Proprietary |
| Proxy | Caddy | Traefik | Proprietary |
| DNS | PowerDNS | External | Proprietary |
| CLI | ✅ `we` | ❌ | ✅ `vercel` |
| Self-hosted | ✅ | ✅ | ❌ |
| MCP Integration | ✅ | ❌ | ❌ |

## Security

### Protected Operations

- `force=true` 필수: 프로젝트 삭제, 볼륨 삭제
- 보호된 볼륨: `protected:true` 레이블
- 환경변수 암호화 저장

### Protected Paths

- `/opt/codeb/` - 애플리케이션 데이터
- `/var/lib/containers/` - Podman 볼륨
- `/etc/caddy/` - Caddy 설정
