# CodeB Watchdog Monitor

실시간 파일/컨테이너 변경 감시 및 자동 복구 시스템

## Overview

Watchdog는 서버에서 발생하는 모든 파일 변경과 컨테이너 상태 변화를 감시하고,
무단 삭제/수정 시 자동으로 복구합니다.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CodeB Watchdog Monitor                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐     ┌──────────────────┐                  │
│  │  File Watcher    │     │ Container Monitor │                  │
│  │  (inotify)       │     │ (podman events)   │                  │
│  └────────┬─────────┘     └────────┬─────────┘                  │
│           │                        │                             │
│           ▼                        ▼                             │
│  ┌─────────────────────────────────────────────┐                │
│  │              Event Processor                 │                │
│  │  - 변경 감지                                  │                │
│  │  - 위협 분석                                  │                │
│  │  - 자동 복구                                  │                │
│  └────────┬────────────────────────┬───────────┘                │
│           │                        │                             │
│           ▼                        ▼                             │
│  ┌──────────────────┐     ┌──────────────────┐                  │
│  │  Backup Manager  │     │ Notification     │                  │
│  │  - 자동 백업      │     │ - Slack          │                  │
│  │  - 스냅샷         │     │ - Discord        │                  │
│  │  - 복구           │     │ - Email          │                  │
│  └──────────────────┘     └──────────────────┘                  │
│                                                                  │
│  ┌──────────────────────────────────────────────┐               │
│  │              Lock Manager                     │               │
│  │  - chattr +i (immutable)                      │               │
│  │  - 삭제 방지                                   │               │
│  └──────────────────────────────────────────────┘               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### 1. 파일 시스템 감시

- **실시간 감시**: inotify 기반 파일 변경 감지
- **해시 검증**: SHA-256 해시로 파일 무결성 확인
- **자동 백업**: 변경 전 자동 백업 생성
- **자동 복구**: 삭제된 파일 백업에서 자동 복구

### 2. 컨테이너 모니터링

- **상태 추적**: 모든 컨테이너 상태 실시간 추적
- **자동 재시작**: 중지된 보호 컨테이너 자동 재시작
- **자동 재생성**: 삭제된 컨테이너 Quadlet/Compose에서 재생성
- **이벤트 로깅**: 모든 컨테이너 이벤트 기록

### 3. 잠금 메커니즘

- **Immutable 속성**: `chattr +i`로 파일 삭제 방지
- **선택적 잠금**: 중요 파일만 선택적으로 잠금
- **임시 해제**: 수정 필요 시 임시 잠금 해제

### 4. 알림 시스템

- **Slack 연동**: Webhook을 통한 Slack 알림
- **Discord 연동**: Webhook을 통한 Discord 알림
- **심각도 구분**: info/warning/critical 레벨 구분

## Installation

```bash
cd security/monitor
sudo ./install.sh
```

## Configuration

### 환경변수

```bash
# /etc/systemd/system/codeb-watchdog.service
Environment=SLACK_WEBHOOK_URL=https://hooks.slack.com/...
Environment=DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### 감시 대상 설정

`watchdog.js`의 CONFIG 섹션에서 수정:

```javascript
const CONFIG = {
  // 감시 디렉토리
  watchDirs: [
    '/opt/codeb/projects',
    '/opt/codeb/security',
    '/etc/codeb',
  ],

  // 중요 파일 (해시 검증)
  criticalFiles: [
    '/opt/codeb/security/daemon/protection-daemon.js',
    // ...
  ],

  // 보호 컨테이너 패턴
  protectedContainers: [
    /-production$/,
    /-prod$/,
    /^codeb-/,
  ],
};
```

## CLI Commands

```bash
# 상태 확인
node /opt/codeb/security/monitor/watchdog.js --status

# 파일 백업
node /opt/codeb/security/monitor/watchdog.js --backup /path/to/file

# 파일 복구
node /opt/codeb/security/monitor/watchdog.js --restore /path/to/file

# 파일 잠금 (삭제 방지)
node /opt/codeb/security/monitor/watchdog.js --lock /path/to/file

# 파일 잠금 해제
node /opt/codeb/security/monitor/watchdog.js --unlock /path/to/file
```

## Service Management

```bash
# 서비스 상태
sudo systemctl status codeb-watchdog

# 서비스 재시작
sudo systemctl restart codeb-watchdog

# 로그 확인
sudo journalctl -u codeb-watchdog -f

# 파일 로그
tail -f /var/log/codeb/watchdog.log
```

## File Structure

```
/opt/codeb/security/monitor/
├── watchdog.js           # 메인 모니터 스크립트

/var/lib/codeb/
├── backups/              # 파일 백업
├── snapshots/            # 프로젝트 스냅샷
└── file-hashes.json      # 파일 해시 저장소

/var/log/codeb/
└── watchdog.log          # 감시 로그

/var/run/codeb/
└── watchdog.pid          # PID 파일
```

## Auto-Recovery Scenarios

### 시나리오 1: 중요 파일 삭제

```
1. /opt/codeb/security/daemon/protection-daemon.js 삭제 감지
2. 🚨 알림 전송 (Slack/Discord)
3. /var/lib/codeb/backups/에서 최신 백업 찾기
4. 자동 복구
5. ✅ 복구 완료 알림
```

### 시나리오 2: 프로덕션 컨테이너 중지

```
1. myapp-production 컨테이너 중지 감지
2. ⚠️ 알림 전송
3. podman start myapp-production 시도
4. 실패 시 최대 3회 재시도
5. 성공 시 ✅ 복구 완료 알림
```

### 시나리오 3: 컨테이너 삭제

```
1. myapp-production 컨테이너 삭제 감지
2. 🚨 알림 전송
3. Quadlet 파일 확인 → systemctl restart
4. 또는 docker-compose.yml 확인 → podman-compose up -d
5. 성공 시 ✅ 재생성 완료 알림
```

## Security

- **Root 권한 필요**: 파일 잠금 및 컨테이너 관리에 필요
- **Protection Daemon 연동**: 보안 정책 동기화
- **감사 로그**: 모든 이벤트 기록

## Troubleshooting

### Watchdog가 시작되지 않음

```bash
# 로그 확인
journalctl -u codeb-watchdog -n 50

# 수동 실행
node /opt/codeb/security/monitor/watchdog.js --start
```

### 알림이 오지 않음

```bash
# 환경변수 확인
systemctl show codeb-watchdog | grep Environment

# Webhook URL 테스트
curl -X POST -H 'Content-Type: application/json' \
  -d '{"text":"test"}' \
  https://hooks.slack.com/services/...
```

### 파일 잠금 실패

```bash
# e2fsprogs 설치 확인
which chattr

# 파일 시스템 확인 (ext4 필요)
df -T /opt/codeb
```
