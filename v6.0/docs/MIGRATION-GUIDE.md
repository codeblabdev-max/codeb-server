# CodeB v6.0 Migration Guide

> v3.x/v5.x에서 v6.0 Blue-Green 슬롯 시스템으로 마이그레이션하는 가이드

## 개요

CodeB v6.0은 Vercel 스타일의 Blue-Green 배포 시스템을 도입했습니다. 기존 v3.x (workflow) 또는 v5.x (SSOT) 시스템에서 마이그레이션하면 다음 이점을 얻습니다:

- **무중단 배포**: Blue-Green 슬롯을 통한 즉시 롤백
- **Preview URL**: 배포 전 테스트 가능한 미리보기 URL
- **Quadlet 통합**: systemd 기반 컨테이너 관리
- **향상된 CLI**: Ink React 기반 인터랙티브 UI

## 마이그레이션 절차

### 1. 레거시 시스템 감지

먼저 현재 서버의 레거시 시스템을 감지합니다:

```bash
we migrate detect
```

출력 예시:
```
Legacy System Detection

System Type: ssot-v1 (v5.x)
SSOT Version: 1.0

Found Projects:
  myapp (staging, production)
    staging: port 3001, domain myapp-staging.codeb.dev
    production: port 4001, domain myapp.codeb.dev

  api-server (staging)
    staging: port 3002, domain api-staging.codeb.dev

Found Containers: 3
  myapp-staging (running, port 3001)
  myapp-production (running, port 4001)
  api-server-staging (running, port 3002)

Warnings:
  - 3 ports will be reassigned during migration
```

`-v` 플래그로 상세 정보 확인:

```bash
we migrate detect -v
```

### 2. 마이그레이션 계획 생성

감지된 프로젝트에 대한 마이그레이션 계획을 생성합니다:

```bash
we migrate plan
```

특정 프로젝트만 선택:

```bash
we migrate plan --projects myapp api-server
```

출력 예시:
```
Migration Plan: mig-abc123

Source: ssot-v1 (v5.x)
Target: quadlet-v6 (v6.0)
Estimated Downtime: 60 seconds

Projects:
  myapp
    Current: port 3001 → Blue: 3000, Green: 3250
    Domain: myapp.codeb.dev (unchanged)

  api-server
    Current: port 3002 → Blue: 3002, Green: 3252
    Domain: api.codeb.dev (unchanged)

Steps:
  1. Backup SSOT registry
  2. Backup Caddy configuration
  3. Create slot registry files
  4. Generate Quadlet files
  5. Migrate ENV files
  6. Deploy to Blue slot
  7. Update Caddy routing
  8. Health check
  9. Cleanup legacy containers

Rollback: Available (48 hours)
```

### 3. 마이그레이션 실행

계획을 검토한 후 마이그레이션을 실행합니다:

```bash
we migrate execute --id mig-abc123
```

확인 없이 실행 (CI/CD용):

```bash
we migrate execute --id mig-abc123 --yes
```

실행 중 화면:

```
Executing Migration: mig-abc123

[1/9] Backup SSOT registry............... ✓
[2/9] Backup Caddy configuration......... ✓
[3/9] Create slot registry files......... ✓
[4/9] Generate Quadlet files............. ✓
[5/9] Migrate ENV files.................. ✓
[6/9] Deploy to Blue slot................ ✓
[7/9] Update Caddy routing............... ✓
[8/9] Health check....................... ✓
[9/9] Cleanup legacy containers.......... ✓

Migration completed successfully!
Duration: 45 seconds
Migrated: 2 projects

Next Steps:
  1. Test your applications
  2. Use 'we deploy' for new deployments
  3. Legacy containers kept in grace period (48h)
```

### 4. 롤백 (필요시)

문제 발생 시 즉시 롤백:

```bash
we migrate rollback --id mig-abc123
```

## ENV 마이그레이션

### ENV 스캔

현재 ENV 파일 상태 확인:

```bash
we env scan
```

출력:
```
ENV Configuration Scan

Total Projects: 2
Legacy ENVs: 3
v6.0 ENVs: 1
Needs Migration: 3

Projects:
  myapp
    staging: legacy
      ! Uses deprecated SOCKET_IO_URL
      ! Missing CODEB_VERSION
    production: v6.0

  api-server
    staging: legacy
      ! Missing CODEB_VERSION
```

### ENV 마이그레이션 (Dry-run)

변경 사항 미리 확인:

```bash
we env migrate myapp --environment staging --dry-run
```

출력:
```
Migrating ENV: myapp (staging)

Changes:
  - SOCKET_IO_URL: Deprecated variable (use CENTRIFUGO_URL)
  + CENTRIFUGO_URL: Replacement for Socket.IO
  + CODEB_VERSION: Required for v6.0
  + CODEB_SLOT_SYSTEM: Required for v6.0
  + CODEB_PROJECT: Recommended for v6.0
  + CODEB_ENVIRONMENT: Recommended for v6.0

Warnings:
  ! PORT will be managed by Blue-Green slot system

(dry-run mode - no changes applied)
```

### ENV 마이그레이션 적용

```bash
we env migrate myapp --environment staging
```

### ENV 복구

문제 발생 시 master 백업에서 복구:

```bash
we env restore myapp --environment staging --version master
```

특정 시점으로 복구:

```bash
we env restore myapp --version 2024-01-15T10:30:00
```

## 레거시 명령어 매핑

| 레거시 명령어 | v6.0 명령어 | 설명 |
|-------------|------------|------|
| `we workflow init` | `we init` | 프로젝트 초기화 |
| `we workflow scan` | `we slot status` | 상태 확인 |
| `we workflow stop` | `we slot cleanup` | 정리 |
| `we ssot status` | `we registry status` | 레지스트리 상태 |
| `we ssot sync` | `we registry sync` | 동기화 |
| `we ssot projects` | `we slot list` | 프로젝트 목록 |

레거시 명령어 실행 시 자동으로 안내 메시지가 표시됩니다:

```bash
$ we workflow scan

⚠️  'we workflow' is deprecated.

Use 'we slot status' instead.

Run 'we migrate detect' to migrate to v6.0.
```

## 포트 재할당

마이그레이션 시 포트가 Blue-Green 슬롯 범위로 재할당됩니다:

### 레거시 포트 범위

| 환경 | 포트 범위 |
|-----|---------|
| Staging | 3000-3499 |
| Production | 4000-4499 |
| Preview | 5000-5999 |

### v6.0 슬롯 포트 범위

| 환경 | Blue 슬롯 | Green 슬롯 |
|-----|---------|----------|
| Staging | 3000-3249 | 3250-3499 |
| Production | 4000-4249 | 4250-4499 |
| Preview | 5000-5499 | 5500-5999 |

## Quadlet 파일 생성

마이그레이션 시 자동으로 Quadlet 파일이 생성됩니다:

```
/etc/containers/systemd/
├── myapp-staging-blue.container
├── myapp-staging-green.container
├── myapp-production-blue.container
└── myapp-production-green.container
```

Quadlet 파일 예시 (`myapp-staging-blue.container`):

```ini
[Unit]
Description=CodeB myapp (staging/blue)
After=network-online.target

[Container]
ContainerName=myapp-staging-blue
Image=ghcr.io/org/myapp:latest
PublishPort=3000:3000
EnvironmentFile=/opt/codeb/env/myapp/staging/.env
Volume=/opt/codeb/projects/myapp/data:/app/data:Z
HealthCmd=/usr/bin/curl -sf http://localhost:3000/health || exit 1

[Service]
Restart=on-failure

[Install]
WantedBy=default.target
```

## 슬롯 레지스트리

마이그레이션 후 슬롯 레지스트리가 생성됩니다:

```
/opt/codeb/slots/
├── myapp-staging.json
├── myapp-production.json
└── api-server-staging.json
```

레지스트리 파일 예시:

```json
{
  "projectName": "myapp",
  "environment": "staging",
  "activeSlot": "blue",
  "blue": {
    "state": "active",
    "port": 3000,
    "version": "v1.2.3",
    "healthStatus": "healthy"
  },
  "green": {
    "state": "empty",
    "port": 3250
  }
}
```

## 문제 해결

### 마이그레이션 실패

```bash
# 상태 확인
we migrate status --id mig-abc123

# 강제 롤백
we migrate rollback --id mig-abc123 --force
```

### 포트 충돌

```bash
# 사용 중인 포트 확인
we slot list --detailed

# 수동 포트 재할당
we slot update myapp --blue-port 3010 --green-port 3260
```

### ENV 복구 실패

```bash
# 백업 목록 확인
we env get myapp --environment staging

# master에서 복구
we env restore myapp --version master
```

### 컨테이너 시작 실패

```bash
# systemd 서비스 상태 확인
systemctl --user status myapp-staging-blue

# 로그 확인
journalctl --user -u myapp-staging-blue -f

# 수동 시작
systemctl --user start myapp-staging-blue
```

## 체크리스트

마이그레이션 전:
- [ ] 현재 서비스 백업 확인
- [ ] `we migrate detect` 실행
- [ ] 마이그레이션 계획 검토
- [ ] 팀원에게 마이그레이션 일정 공유

마이그레이션 후:
- [ ] 모든 서비스 health check 확인
- [ ] 도메인 연결 테스트
- [ ] `we deploy` 명령어 테스트
- [ ] 롤백 테스트 (staging 환경)
- [ ] 모니터링 대시보드 확인

## 지원

문제가 발생하면:

1. GitHub Issues: https://github.com/anthropics/codeb/issues
2. Discord: https://discord.gg/codeb
3. 이메일: support@codeb.dev
