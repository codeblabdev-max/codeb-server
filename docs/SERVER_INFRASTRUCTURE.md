# CodeB Server Infrastructure

> Last Updated: 2025-12-20

## Overview

CodeB는 4대의 Vultr 서버로 구성된 분산 인프라입니다.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CodeB Infrastructure                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│   │  App Server  │    │   Storage    │    │  Streaming   │         │
│   │ 158.247.203  │    │  64.176.226  │    │ 141.164.42   │         │
│   │              │    │              │    │              │         │
│   │ • Next.js    │◄──►│ • PostgreSQL │◄──►│ • Centrifugo │         │
│   │ • Caddy      │    │ • Redis      │    │ • WebSocket  │         │
│   │ • PowerDNS   │    │              │    │              │         │
│   └──────────────┘    └──────────────┘    └──────────────┘         │
│          │                   │                   │                  │
│          └───────────────────┼───────────────────┘                  │
│                              │                                      │
│                    ┌──────────────┐                                 │
│                    │   Backup     │                                 │
│                    │ 141.164.37   │                                 │
│                    │              │                                 │
│                    │ • ENV Backup │                                 │
│                    │ • Files      │                                 │
│                    │ • Monitoring │                                 │
│                    └──────────────┘                                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Server Details

### 1. App Server (app.codeb.kr)

| Property | Value |
|----------|-------|
| **IP** | 158.247.203.55 |
| **Domain** | app.codeb.kr |
| **Vultr ID** | 00bad969-1751-4ff7-b0ba-26e9359c0d88 |
| **Vultr Label** | videopick-phase2-app |
| **Region** | Seoul (ICN) |
| **Spec** | 6 vCPU / 16GB RAM / 320GB SSD |

#### OS & Software
| Software | Version |
|----------|---------|
| Ubuntu | 22.04.5 LTS |
| Kernel | 5.15.0-156-generic |
| Podman | 4.6.2 |
| Docker | 28.2.2 |
| Caddy | 2.10.2 |
| PowerDNS | 4.5.3 |
| Node.js | 18.20.8 |

#### Running Containers
| Container | Port | Description |
|-----------|------|-------------|
| codeb-dashboard | 3100 | Management Dashboard |
| codeb-cms | 3202 | CMS Application |
| codeb-cms-postgres | 5433 | CMS Database |
| codeb-cms-redis | 6380 | CMS Cache |
| powerdns-postgres | 5434 | DNS Database |

#### Port Ranges
| Service | Port Range |
|---------|------------|
| DNS | 53 |
| HTTP/HTTPS | 80, 443 |
| Production Apps | 4000-4499 |
| Staging Apps | 4500-4999 |
| PowerDNS API | 8081 |

#### Nameservers
- n1.codeb.kr → 158.247.203.55
- n2.codeb.kr → 158.247.203.55

---

### 2. Storage Server (db.codeb.kr)

| Property | Value |
|----------|-------|
| **IP** | 64.176.226.119 |
| **Domain** | db.codeb.kr, storage.codeb.kr |
| **Vultr ID** | 5b3c19bf-a6ac-4b36-8e3a-bbef72b2c8d1 |
| **Vultr Label** | videopick-phase2-storage |
| **Region** | Seoul (ICN) |
| **Spec** | 6 vCPU / 16GB RAM / 320GB SSD |

#### OS & Software
| Software | Version |
|----------|---------|
| Ubuntu | 22.04.5 LTS |
| Kernel | 5.15.0-153-generic |
| Podman | 4.6.2 |

#### Running Containers
| Container | Port | Version | Description |
|-----------|------|---------|-------------|
| codeb-postgres | 5432 | 15.15 | Shared PostgreSQL |
| codeb-redis | 6379 | 7.4.7 | Shared Redis |

#### Database Info
```
PostgreSQL 15.15
├── Port: 5432
├── Data: /opt/codeb/postgres-data
└── Shared by all projects

Redis 7.4.7
├── Port: 6379
├── Data: /opt/codeb/redis-data
└── DB isolation by index (0-15) or prefix
```

#### Disk Usage
- Total: 320GB
- Used: 30GB (11%)
- Available: 257GB

---

### 3. Streaming Server (ws.codeb.kr)

| Property | Value |
|----------|-------|
| **IP** | 141.164.42.213 |
| **Domain** | ws.codeb.kr, streaming.codeb.kr |
| **Vultr ID** | 56797584-ce45-4d5c-bb0f-6e47db0d2ed4 |
| **Vultr Label** | videopick-phase2-streaming |
| **Region** | Seoul (ICN) |
| **Spec** | 6 vCPU / 16GB RAM / 320GB SSD |

#### OS & Software
| Software | Version |
|----------|---------|
| Ubuntu | 22.04.5 LTS |
| Kernel | 5.15.0-156-generic |
| Podman | 4.6.2 |
| Centrifugo | 5.4.9 |

#### Running Containers
| Container | Port | Version | Description |
|-----------|------|---------|-------------|
| codeb-centrifugo | 8000 | 5.4.9 | Real-time messaging |

#### Centrifugo Configuration
```
Version: 5.4.9 (Go 1.23.4)
WebSocket: wss://ws.codeb.kr/connection/websocket
HTTP API: http://ws.codeb.kr:8000/api
Port: 8000
```

#### Disk Usage
- Total: 320GB
- Used: 20GB (7%)
- Available: 267GB

---

### 4. Backup Server (backup.codeb.kr) + Preview Environment

| Property | Value |
|----------|-------|
| **IP** | 141.164.37.63 |
| **Domain** | backup.codeb.kr, *.preview.codeb.kr |
| **Vultr ID** | 27f996e9-7bb7-4354-b3b5-6f6234f713d1 |
| **Vultr Label** | videopick-phase2-backup |
| **Region** | Seoul (ICN) |
| **Spec** | 4 vCPU / 8GB RAM / 160GB SSD |

#### OS & Software
| Software | Version |
|----------|---------|
| Ubuntu | 22.04.5 LTS |
| Kernel | 5.15.0-161-generic |
| Podman | 4.6.2 |
| Caddy | 2.10.2 |

#### Preview Environment (Branch Testing)
| Property | Value |
|----------|-------|
| **Domain Pattern** | `{branch}.preview.codeb.kr` |
| **Port Range** | 5000-5999 |
| **Network** | codeb-preview |
| **Registry** | /opt/codeb/preview/ |

```
Preview 흐름:
feature-branch 푸시 → 이미지 빌드 → Preview 배포 → PR 머지 → Production 배포
                                    ↓
                    https://feature-login.preview.codeb.kr
```

#### Storage Directories
| Path | Purpose |
|------|---------|
| /opt/codeb/env-backup | ENV file backups (master.env, current.env) |
| /opt/codeb/file-storage | Project uploads & media |
| /opt/codeb/backups | Database & system backups |
| /opt/codeb/logs | Centralized logs |
| /opt/codeb/preview | Preview deployment registry |
| /etc/caddy/preview.d | Preview Caddy configs |

#### ENV Backup Structure
```
/opt/codeb/env-backup/
└── {project}/
    ├── production/
    │   ├── master.env      # Original (never changes)
    │   ├── current.env     # Latest
    │   └── {timestamp}.env # History
    ├── staging/
    │   └── ...
    └── preview.env         # Shared preview env template
```

#### Disk Usage
- Total: 160GB
- Used: 19GB (14%)
- Available: 125GB

#### Block Storage (Planned)
Block storage can be added via Vultr API for expanded file storage needs.

---

## Network Configuration

### Domain Mapping
| Domain | IP | Service |
|--------|-----|---------|
| app.codeb.kr | 158.247.203.55 | App Server |
| db.codeb.kr | 64.176.226.119 | Storage Server |
| storage.codeb.kr | 64.176.226.119 | Storage Server |
| ws.codeb.kr | 141.164.42.213 | Streaming Server |
| streaming.codeb.kr | 141.164.42.213 | Streaming Server |
| backup.codeb.kr | 141.164.37.63 | Backup Server |
| **\*.preview.codeb.kr** | **141.164.37.63** | **Preview Environment** |
| n1.codeb.kr | 158.247.203.55 | Primary NS |
| n2.codeb.kr | 158.247.203.55 | Secondary NS |
| *.codeb.kr | 158.247.203.55 | Wildcard (Apps) |

### Port Allocation
| Port | Server | Service |
|------|--------|---------|
| 22 | All | SSH |
| 53 | App | PowerDNS |
| 80/443 | App, Backup | Caddy (HTTP/HTTPS) |
| 3100 | App | Dashboard |
| 4000-4499 | App | Production Apps |
| 4500-4999 | App | Staging Apps (Legacy) |
| **5000-5999** | **Backup** | **Preview Apps** |
| 5432 | Storage | PostgreSQL |
| 6379 | Storage | Redis |
| 8000 | Streaming | Centrifugo |
| 8081 | App | PowerDNS API |

---

## Server Status Files

Each server maintains a status file at `/opt/codeb/config/server-status.json`:

```bash
# View server status
ssh root@{server-ip} "cat /opt/codeb/config/server-status.json"

# Or via CLI
we server status
```

---

## Vultr Management

### API Key
```bash
export VULTR_API_KEY="LP67AR5M65XFCSUGNANWNVWWLOKGUPW2P5AA"
```

### List Servers
```bash
vultr-cli instance list
```

### Create Block Storage
```bash
# Create 100GB block storage in Seoul
vultr-cli block-storage create \
  --region icn \
  --size 100 \
  --label "codeb-file-storage"

# Attach to backup server
vultr-cli block-storage attach {block-id} --instance {backup-server-id}
```

---

## Maintenance

### System Updates
```bash
# SSH to server (Admin only)
ssh root@{server-ip}

# Update system
apt update && apt upgrade -y

# Update server-status.json after changes
vi /opt/codeb/config/server-status.json
```

### Container Updates
```bash
# Pull latest images
podman pull postgres:15
podman pull redis:7-alpine
podman pull centrifugal/centrifugo:v5

# Recreate containers (with data preservation)
# See individual container documentation
```

---

## Monitoring

### Health Check
```bash
# Via CLI
we health

# Check specific server
we server status app
we server status storage
we server status streaming
we server status backup
```

### Disk Usage Alert
- Warning: > 80%
- Critical: > 90%

### Container Status
```bash
# On any server
podman ps -a
podman stats
```

---

## Backup Strategy

### ENV Backups
- Location: backup.codeb.kr:/opt/codeb/env-backup/
- Frequency: On every ENV change
- Retention: Unlimited (timestamped)

### Database Backups
- Location: backup.codeb.kr:/opt/codeb/backups/
- Frequency: Daily
- Retention: 30 days

### File Storage
- Location: backup.codeb.kr:/opt/codeb/file-storage/
- Purpose: Project uploads, media files
- Access: Via SFTP or API

---

## Deployment Strategy (Image Promotion)

### 개요

테스트된 이미지를 그대로 Production에 배포하는 **이미지 프로모션** 전략 사용.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Image Promotion Flow                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  feature-branch 푸시                                             │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────┐                                            │
│  │  이미지 빌드     │  ghcr.io/repo:sha-abc1234                  │
│  │  (1번만 빌드)    │                                            │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │  Preview 배포   │  Backup 서버 (141.164.37.63)               │
│  │                 │  feature-login.preview.codeb.kr            │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │  테스트 & PR    │  코드 리뷰, QA 테스트                       │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │  PR 머지        │  main 브랜치로 머지                         │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │ 이미지 프로모션  │  sha-abc1234 → latest (재빌드 X)           │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │ Production 배포 │  App 서버 (158.247.203.55)                 │
│  │                 │  myapp.codeb.kr                            │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │ Preview 정리    │  자동 삭제                                  │
│  └─────────────────┘                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 핵심 원칙

1. **1번 빌드**: 이미지는 한 번만 빌드 (SHA 태그)
2. **테스트된 이미지 배포**: Preview에서 테스트한 바로 그 이미지가 Production으로
3. **환경변수 런타임 주입**: 빌드 시 환경변수 굽지 않음, 실행 시 주입
4. **자동 정리**: PR 머지/닫힘 시 Preview 환경 자동 삭제

### 서버 역할

| 환경 | 서버 | 포트 범위 | 도메인 |
|------|------|-----------|--------|
| Preview | Backup (141.164.37.63) | 5000-5999 | *.preview.codeb.kr |
| Production | App (158.247.203.55) | 4000-4499 | *.codeb.kr |

### GitHub Secrets 설정

```
SSH_PRIVATE_KEY     # 서버 접속용 SSH 키
GITHUB_TOKEN        # 자동 제공 (ghcr.io 접근용)
```

---

## Quick Reference

```bash
# SSH Access (Admin only)
ssh root@158.247.203.55  # App (Production)
ssh root@64.176.226.119  # Storage (DB/Redis)
ssh root@141.164.42.213  # Streaming (Centrifugo)
ssh root@141.164.37.63   # Backup (Preview)

# Server Status
we server status

# Health Check
we health

# Preview 목록
we preview list

# Sync server data
we ssot sync
```
