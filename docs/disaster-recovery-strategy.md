# CodeB Disaster Recovery 전략: Immutable Infrastructure & Automated Failover

> **작성일:** 2026-02-10
> **작성 근거:** 보안 인시던트 (security-incident-report-20260210.md) 후속 대응
> **심각도:** CRITICAL
> **상태:** 전략 수립 완료 - 실행 대기

---

## 1. Executive Summary

### 현재 상황

4대 서버 중 보안 침해 발생. Docker 격리 덕분에 피해가 1개 프로젝트로 제한되었으나, PowerDNS가 동일 서버에서 운영되어 네임서버 자체가 compromise 가능성이 있는 **Single Point of Failure** 상태.

### 제안 전략

**침해 서버를 수리하지 않고, Terraform + 실시간 백업으로 완전히 새로운 서버 클러스터를 프로비저닝한 뒤 DNS 전환으로 무중단 마이그레이션**.

### 핵심 수치

| 지표 | 값 |
|------|-----|
| **RTO** (Recovery Time Objective) | 30-60분 |
| **RPO** (Recovery Point Objective) | ~1분 (WAL 기반) |
| **사용자 체감 중단** | 1-5초 (DNS 전환 시 세션 재접속) |
| **자동화 비율** | 95% (DNS 전환만 수동 확인) |

---

## 2. 현재 아키텍처 취약점 분석

### 2.1 근본 원인: DNS와 서비스의 동일 Blast Radius

```
┌─────────────────────────────────────────────────────────────────┐
│                    현재 아키텍처 (문제점)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   PowerDNS ──┐                                                  │
│   (4대 서버   │   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────┐ │
│    에서 운영) ├──>│App Server│ │Streaming │ │ Storage  │ │Back│ │
│              │   │158.247.  │ │141.164.  │ │ 64.176.  │ │ up │ │
│              │   │ 203.55   │ │ 42.213   │ │ 226.119  │ │    │ │
│              │   │          │ │          │ │          │ │    │ │
│              │   │ DNS +    │ │ DNS +    │ │ DNS +    │ │DNS+│ │
│              │   │  App     │ │ WebSocket│ │   DB     │ │Mon │ │
│              └──>│ COUPLED  │ │ COUPLED  │ │ COUPLED  │ │    │ │
│                  └──────────┘ └──────────┘ └──────────┘ └────┘ │
│                                                                 │
│   서버가 침해되면 DNS도 함께 침해 = 전체 인프라 신뢰 상실        │
│   DNS를 수정하려면 침해된 서버에 접속해야 함 = Catch-22          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 보안 침해 영향도 매트릭스

| 서버 | 침해 여부 | DNS 역할 | 서비스 역할 | 신뢰도 |
|------|----------|----------|------------|--------|
| App (158.247.203.55) | **침해 확인** | PowerDNS Primary | MCP API, Caddy | **0% - 재구축 필수** |
| Streaming (141.164.42.213) | 미확인 | PowerDNS Secondary | Centrifugo | **50% - 검증 필요** |
| Storage (64.176.226.119) | 미확인 | PowerDNS Secondary | PostgreSQL, Redis | **50% - 검증 필요** |
| Backup (141.164.37.63) | 미확인 | PowerDNS Secondary | Prometheus, Grafana | **50% - 검증 필요** |
| Extra (141.164.60.51) | **침해 확인** | N/A | heeling (삭제됨) | **0% - 폐기** |

**핵심 문제**: 침해된 서버에서 DNS를 운영하면, 공격자가 DNS 레코드를 조작하여 트래픽을 탈취할 수 있음 (DNS Hijacking). 따라서 **기존 서버를 "치료"하는 것이 아니라 "격리 후 포렌식"이 올바른 접근**.

---

## 3. 복원 전략: Immutable Infrastructure Recovery

### 3.1 전체 복원 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│           Immutable Infrastructure Recovery Plan                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase 1: 외부 DNS 전환점 확보 (5분)                            │
│  ════════════════════════════════                                │
│                                                                 │
│   Cloudflare/Route53 (서버 외부, 침해 불가)                      │
│       |                                                         │
│       |-- codeb.kr    -> 현재 158.247.203.55 (기존 서버)        │
│       |-- ws.codeb.kr -> 현재 141.164.42.213                    │
│       +-- db.codeb.kr -> 현재 64.176.226.119                    │
│                                                                 │
│  Phase 2: Terraform으로 새 클러스터 프로비저닝 (15-30분)         │
│  ═══════════════════════════════════════════════                  │
│                                                                 │
│   Terraform Apply                                               │
│       |-- New App Server (NEW IP)                               │
│       |-- New Streaming Server (NEW IP)                         │
│       |-- New Storage Server (NEW IP)                           │
│       +-- New Backup Server (NEW IP)                            │
│                                                                 │
│  Phase 3: 데이터 복원 (10-60분, 데이터 크기 의존)                │
│  ════════════════════════════════════════════════                 │
│                                                                 │
│   검증된 백업 --> New Storage Server                             │
│       |-- PostgreSQL: pg_basebackup + WAL replay                │
│       |-- Redis: RDB snapshot restore                           │
│       +-- Docker volumes: rsync from verified backup            │
│                                                                 │
│  Phase 4: DNS 전환 (TTL 의존, 30초~5분)                         │
│  ═══════════════════════════════════════                          │
│                                                                 │
│   Cloudflare/Route53                                            │
│       |-- codeb.kr    -> NEW App IP                             │
│       |-- ws.codeb.kr -> NEW Streaming IP                       │
│       +-- db.codeb.kr -> NEW Storage IP                         │
│                                                                 │
│  Phase 5: 기존 서버 격리 & 포렌식 (비동기, 수일)                 │
│  ═══════════════════════════════════════════════                  │
│                                                                 │
│   기존 4대 서버                                                  │
│       |-- 네트워크 격리 (outbound 차단)                          │
│       |-- 디스크 스냅샷 보존                                     │
│       +-- 포렌식 분석 -> 인시던트 리포트                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 사용자 경험 영향 분석

```
  시간축  0min     5min     15min    30min    35min    60min
  ──────|────────|────────|────────|────────|────────|──────
        |        |        |        |        |        |
  DNS   | 현재IP |        |        |        | 새IP   |
  ──────|────────|────────|────────|────────|════════|
        |        |        |        |        | ^      |
  서버  | 기존   |        | 새서버 | 데이터 | 전환   |
  ──────| 운영중 |────────| 준비됨 | 복원   |════════|
        |        |        |        |        |        |
  사용자| 정상   | 정상   | 정상   | 정상   | 세션   | 정상
  경험  | 이용   | 이용   | 이용   | 이용   | 재접속 | 이용
  ──────|────────|────────|────────|────────|─ ─ ─ ─|──────
        |        |        |        |        | 1-5초  |
        |        |        |        |        | 끊김   |
```

**사용자 인지: "잠깐 새로고침 했더니 다시 됨" (서비스 장애 인식 없음)**

| 항목 | 영향 | 사용자 인지 |
|------|------|------------|
| HTTP API 요청 | DNS TTL 만료 후 새 서버로 연결. 진행 중 요청 1건 실패 가능 | 거의 모름 (자동 재시도) |
| WebSocket 연결 | **끊어짐** -> 클라이언트 자동 재연결 (Centrifugo reconnect) | "일시적 연결 끊김" 1-3초 |
| 세션/인증 | JWT 기반이면 영향 없음. 서버 세션이면 재로그인 필요 | JWT: 모름 / Session: 재로그인 |
| 데이터 일관성 | 백업 시점~전환 시점 사이 쓰기 데이터 유실 가능 (RPO) | 모름 (최근 1-5분 데이터) |

---

## 4. Terraform IaC 설계

### 4.1 인프라 코드 구조

```
infrastructure/
├── terraform/
│   ├── main.tf                    # Provider, Backend
│   ├── variables.tf               # 변수 정의
│   ├── outputs.tf                 # 출력 (새 서버 IP 등)
│   │
│   ├── modules/
│   │   ├── compute/               # 서버 프로비저닝
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── outputs.tf
│   │   │
│   │   ├── network/               # VPC, Firewall, Private Network
│   │   │   ├── main.tf
│   │   │   ├── firewall.tf        # UFW 규칙 코드화
│   │   │   └── outputs.tf
│   │   │
│   │   ├── dns/                   # 외부 DNS (Cloudflare)
│   │   │   ├── main.tf
│   │   │   └── records.tf
│   │   │
│   │   └── security/              # SSH Keys, Secrets
│   │       ├── main.tf
│   │       └── vault.tf
│   │
│   ├── environments/
│   │   ├── production/
│   │   │   ├── main.tf
│   │   │   ├── terraform.tfvars
│   │   │   └── backend.tf
│   │   │
│   │   └── disaster-recovery/     # DR 환경 (이번 사용)
│   │       ├── main.tf
│   │       ├── terraform.tfvars
│   │       └── backend.tf
│   │
│   └── scripts/
│       ├── cloud-init/            # 서버 초기화 스크립트
│       │   ├── app-server.yaml
│       │   ├── streaming-server.yaml
│       │   ├── storage-server.yaml
│       │   └── backup-server.yaml
│       │
│       └── restore/               # 데이터 복원 스크립트
│           ├── restore-postgres.sh
│           ├── restore-redis.sh
│           └── restore-docker-volumes.sh
```

### 4.2 핵심 Terraform 설계 원칙

```
┌─────────────────────────────────────────────────────────────────┐
│         Terraform 설계 원칙 (Disaster Recovery)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Immutable Infrastructure                                    │
│     - 서버를 "수리"하지 않음. 항상 새로 생성                     │
│     - cloud-init으로 모든 설정 자동화                            │
│     - 수동 SSH 설정 = 설정 드리프트 = 보안 취약점                │
│                                                                 │
│  2. Blast Radius 분리                                           │
│     - DNS: 외부 서비스 (Cloudflare) <-- 서버와 분리!             │
│     - Secrets: HashiCorp Vault 또는 외부 KMS                    │
│     - Backup: 다른 클라우드 프로바이더에 보관                    │
│                                                                 │
│  3. Zero Trust Network                                          │
│     - 서버 간 통신: WireGuard VPN (Private Network)             │
│     - 외부 노출: 80, 443만 (Caddy reverse proxy)               │
│     - DB/Redis: Private Network에서만 접근 가능                 │
│     - SSH: VPN + Key-based + fail2ban                           │
│                                                                 │
│  4. State 외부 관리                                              │
│     - terraform.tfstate -> S3/GCS (암호화 + 잠금)               │
│     - 서버에 state 파일 저장 금지                                │
│                                                                 │
│  5. 자동 보안 기준선                                             │
│     - 모든 서버: unattended-upgrades 활성화                     │
│     - 모든 컨테이너: read-only, no-new-privileges               │
│     - 모든 서비스: non-root 실행                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. DNS 전략: PowerDNS -> 외부 관리형 DNS

### 5.1 현재 vs 제안 아키텍처

```
  현재 (취약)                          제안 (안전)
  ================================     ================================

  PowerDNS                             Cloudflare (외부 관리형)
  ┌──────┐ ┌──────┐                    ┌────────────────────────┐
  │Server│ │Server│  <-- 서버와        │ 200+ 글로벌 PoP       │
  │  1   │ │  2   │      동일 머신     │ DDoS 방어 내장        │
  └──────┘ └──────┘                    │ DNSSEC 자동           │
  ┌──────┐ ┌──────┐                    │ 서버 침해와 완전 분리  │
  │Server│ │Server│                    └──────────┬─────────────┘
  │  3   │ │  4   │                              |
  └──────┘ └──────┘                       ┌──────┴──────┐
                                          │ 새 서버 4대  │
  서버 침해 = DNS 침해                     │(서비스만운영)│
  DNS 조작 가능                           └─────────────┘
  SPOF
                                          서버 침해 != DNS 침해
                                          전환이 API 한 줄
                                          Anycast + 자동 페일오버
```

### 5.2 DNS 전환 순서 (Zero-Downtime)

| 단계 | 작업 | 상세 |
|------|------|------|
| **Step 1** | Cloudflare 존 생성 | 현재 IP로 모든 레코드 복제, TTL = 30초 |
| **Step 2** | 레지스트라 NS 변경 | 기존 PowerDNS NS -> Cloudflare NS. **이 시점에서 DNS 제어권이 서버 외부로 이동** |
| **Step 3** | TTL 전파 대기 | 30초~48시간 (실제로는 대부분 5분 내) |
| **Step 4** | DNS 레코드 변경 | Cloudflare API로 A 레코드 일괄 변경 (기존 IP -> 새 IP), Proxy 모드 활성화 |

---

## 6. 데이터 백업 & 복원 전략

### 6.1 백업 무결성 검증 (복원 전 필수)

```
┌─────────────────────────────────────────────────────────────────┐
│                  백업 무결성 검증 절차                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  침해된 서버의 백업은 오염되었을 수 있음!                        │
│                                                                 │
│  1. 백업 소스 검증                                               │
│     |-- 백업 서버(141.164.37.63) 자체 침해 여부 확인            │
│     |-- 백업 파일의 체크섬(SHA256) 검증                          │
│     +-- 백업 타임스탬프 vs 침해 최초 발견 시점 비교              │
│                                                                 │
│  2. "Clean Room" 검증                                           │
│     |-- 격리된 임시 서버에서 백업 복원                           │
│     |-- 복원된 데이터에서 악성코드 스캔                          │
│     |   |-- PostgreSQL: 저장 프로시저/트리거 검사                │
│     |   |-- Redis: 모든 키 패턴 검사 (악성 Lua 스크립트)        │
│     |   +-- Docker volumes: 파일시스템 스캔                     │
│     +-- 정상 확인 후에만 프로덕션 복원 진행                      │
│                                                                 │
│  3. RPO (Recovery Point Objective) 결정                          │
│     |-- 최신 백업: 데이터 최신이지만 오염 위험                   │
│     |-- 침해 이전 백업: 데이터 손실 있지만 안전                  │
│     +-- 권장: 침해 최초 시점 직전 백업 사용                      │
│                                                                 │
│  Timeline:                                                      │
│  |<-- 안전한 백업 -->|<-- 오염 가능 -->|                         │
│  ────────────────────┼────────────────┼──>                      │
│                   침해시작          현재                         │
│                   (추정)                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 복원 전략 (서비스별)

| 서비스 | 백업 방식 | 복원 방식 | RPO | RTO |
|--------|----------|----------|-----|-----|
| PostgreSQL | pg_basebackup + WAL 아카이브 | WAL replay를 침해 직전까지 | ~1분 | 10-30분 |
| Redis | RDB 스냅샷 (15분 주기) | RDB 파일 복사 | ~15분 | 2분 |
| Docker Config | Git 저장소 (IaC) | Terraform apply | 0 (코드) | 15분 |
| Caddy Config | Git 저장소 | 자동 프로비저닝 | 0 (코드) | 5분 |
| SSL 인증서 | Let's Encrypt 자동 갱신 | Caddy 자동 발급 | N/A | 2분 |

---

## 7. 네트워크 보안 재설계

### 7.1 Zero Trust Network Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  새 클러스터 네트워크 설계                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                        Internet                                 │
│                           |                                     │
│                    ┌──────┴──────┐                               │
│                    │  Cloudflare │ <-- DDoS 방어, WAF, Rate Limit│
│                    │  (Proxy)    │                               │
│                    └──────┬──────┘                               │
│                           | HTTPS only (443)                    │
│                           |                                     │
│   ┌───────────────────────┼────────────────────────┐            │
│   │        WireGuard VPN Mesh (10.0.0.0/24)        │            │
│   │                       |                        │            │
│   │   ┌───────────┐  ┌────┴──────┐  ┌───────────┐ │            │
│   │   │  App      │  │ Streaming │  │  Storage  │ │            │
│   │   │ 10.0.0.1  │  │ 10.0.0.2  │  │ 10.0.0.3 │ │            │
│   │   │           │  │           │  │           │ │            │
│   │   │ Caddy     │  │ Centrifugo│  │ PG: 5432  │ │            │
│   │   │ Docker    │  │ (WS)      │  │ Redis:6379│ │            │
│   │   │ MCP API   │  │           │  │           │ │            │
│   │   └───────────┘  └───────────┘  └───────────┘ │            │
│   │                       |                        │            │
│   │              ┌────────┴────────┐               │            │
│   │              │    Backup       │               │            │
│   │              │   10.0.0.4      │               │            │
│   │              │ Prometheus      │               │            │
│   │              │ Grafana         │               │            │
│   │              └─────────────────┘               │            │
│   │                                                │            │
│   │  DB/Redis: VPN 내부에서만 접근                  │            │
│   │  SSH: VPN + 키 인증 only                        │            │
│   │  Public: 443만 노출 (Cloudflare 프록시)         │            │
│   │  서버 간 통신: 암호화 (WireGuard)               │            │
│   │                                                │            │
│   └────────────────────────────────────────────────┘            │
│                                                                 │
│   Firewall Rules (UFW, 코드로 관리):                            │
│   ┌────────────────────────────────────────────────────┐        │
│   │ ALLOW IN  443/tcp from Cloudflare IPs only         │        │
│   │ ALLOW IN  51820/udp (WireGuard)                    │        │
│   │ ALLOW IN  22/tcp from VPN only (10.0.0.0/24)       │        │
│   │ DENY  IN  5432/tcp from 0.0.0.0/0  <-- 이전 취약점 │        │
│   │ DENY  IN  6379/tcp from 0.0.0.0/0  <-- 이전 취약점 │        │
│   │ DENY  OUT to known malicious IPs (blocklist)       │        │
│   └────────────────────────────────────────────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 이전 취약점 vs 새 설계 비교

| 취약점 | 이전 상태 | 새 설계 |
|--------|----------|---------|
| PostgreSQL 5432 노출 | `0.0.0.0:5432` ALLOW | VPN 내부만 (`10.0.0.0/24`) |
| Redis 6379 노출 | `0.0.0.0:6379` ALLOW | VPN 내부만 + AUTH 필수 |
| PM2 root 실행 | `pm2-root.service` | Docker non-root + read-only |
| SSH 전체 노출 | `0.0.0.0:22` ALLOW | VPN 내부에서만 접근 가능 |
| DNS 자체 호스팅 | 서버와 같은 머신 | Cloudflare 외부 관리 |
| Outbound 무제한 | 제한 없음 | Egress 필터링 (allowlist) |

---

## 8. 자동 DR (Disaster Recovery) 파이프라인

### 8.1 원클릭 복구 프로세스

```
  트리거: 보안 침해 감지 or 수동 실행

  $ terraform apply -var="environment=disaster-recovery"

  ┌─────────────────────────────────────────────────────────┐
  │ Step 1: Provision (자동, 15분)                          │
  │ |-- 4x VPS 생성 (Vultr/Hetzner API)                    │
  │ |-- WireGuard VPN mesh 구성                             │
  │ |-- UFW 방화벽 규칙 적용                                │
  │ |-- Docker + Caddy 설치                                 │
  │ +-- 보안 기준선 적용 (hardening)                        │
  └─────────────────────────┬───────────────────────────────┘
                            v
  ┌─────────────────────────────────────────────────────────┐
  │ Step 2: Restore (자동, 10-30분)                         │
  │ |-- 검증된 PostgreSQL 백업 복원                         │
  │ |-- Redis RDB 복원                                     │
  │ |-- Docker 컨테이너 배포 (GHCR 이미지)                  │
  │ |-- SSL 인증서 자동 발급 (Caddy)                        │
  │ +-- Health check 통과 대기                              │
  └─────────────────────────┬───────────────────────────────┘
                            v
  ┌─────────────────────────────────────────────────────────┐
  │ Step 3: Validate (자동, 5분)                            │
  │ |-- 모든 엔드포인트 헬스체크                             │
  │ |-- DB 연결 테스트                                      │
  │ |-- API 기능 테스트 (smoke test)                        │
  │ +-- WebSocket 연결 테스트                               │
  └─────────────────────────┬───────────────────────────────┘
                            v
  ┌─────────────────────────────────────────────────────────┐
  │ Step 4: Switch (수동 확인 후, 1분)                      │
  │ |-- Cloudflare API: DNS 레코드 일괄 변경                │
  │ |-- 기존 서버: outbound 네트워크 차단                    │
  │ +-- 모니터링: 새 서버 트래픽 유입 확인                   │
  └─────────────────────────┬───────────────────────────────┘
                            v
  ┌─────────────────────────────────────────────────────────┐
  │ Step 5: Forensics (비동기, 수일)                        │
  │ |-- 기존 서버 디스크 스냅샷                              │
  │ |-- 격리 환경에서 분석                                   │
  │ |-- IOC (Indicators of Compromise) 추출                 │
  │ |-- 공격 벡터 분석                                      │
  │ +-- 인시던트 리포트 작성                                 │
  └─────────────────────────────────────────────────────────┘

  Total RTO: 30-60분 (데이터 크기 의존)
  Total RPO: ~1분 (WAL 기반 PostgreSQL)
```

---

## 9. Defense in Depth: 침해 재발 방지 (7 Layers)

### Layer 7: Supply Chain Security

- npm audit + Snyk/Socket.dev 의존성 스캔
- lockfile-lint: package-lock.json 무결성 검증
- Docker 이미지: 신뢰된 베이스 이미지만 사용
- SBOM (Software Bill of Materials) 생성

### Layer 6: Application Security

- WAF (Cloudflare) - OWASP Top 10
- Rate Limiting (API, Auth)
- CSP, HSTS, X-Frame-Options
- JWT 검증 + 짧은 만료시간

### Layer 5: Container Security

- read-only filesystem
- no-new-privileges
- cap-drop=ALL + 필요한 것만 cap-add
- non-root user (UID >= 10000)
- resource limits (CPU, Memory)
- seccomp/AppArmor 프로파일

### Layer 4: Network Security

- WireGuard VPN mesh
- UFW allowlist (코드로 관리)
- Egress 필터링
- Cloudflare Proxy (IP 은닉)

### Layer 3: Host Security

- unattended-upgrades (자동 보안 패치)
- fail2ban (SSH 브루트포스 방어)
- auditd (시스템 콜 감사)
- 파일 무결성 모니터링 (AIDE)

### Layer 2: Access Control

- SSH: 키 인증 only (비밀번호 비활성화)
- SSH: VPN 내부에서만 접근
- Secrets: 외부 KMS (Vault/SOPS)
- 최소 권한 원칙 (least privilege)

### Layer 1: Monitoring & Detection

- Prometheus + Grafana (메트릭)
- 이상 프로세스 감지 (CPU 급등, 네트워크 스파이크)
- 로그 중앙화 (Loki/ELK)
- Outbound 연결 모니터링
- 알림: Slack/Discord/PagerDuty

---

## 10. 이번 침해에서 배운 교훈 (Lessons Learned)

### 10.1 핵심 교훈 6가지

| # | 교훈 | 상세 |
|---|------|------|
| 1 | **"서버를 고치지 마라, 버려라"** | 침해된 서버는 신뢰할 수 없음. rootkit이 커널 레벨에 있을 수 있음. "깨끗한 상태"를 보장하는 유일한 방법 = 새로 만들기 |
| 2 | **"DNS는 인프라와 분리하라"** | 서버 침해 시 DNS도 함께 침해됨. 복구할 때 DNS 전환이 불가능해지는 Catch-22. 외부 관리형 DNS = 서버 독립적 제어권 |
| 3 | **"DB 포트를 인터넷에 노출하지 마라"** | PostgreSQL 5432, Redis 6379 = 자동화 공격 대상 1순위. Shodan/Censys가 수분 내에 탐지. VPN 내부 or Unix socket만 사용 |
| 4 | **"root로 서비스를 실행하지 마라"** | PM2 as root = RCE 하나면 서버 전체 장악. Container non-root + host non-root. 최소 권한: 필요한 포트만 바인딩 |
| 5 | **"Supply Chain은 새로운 공격 표면"** | bcryptjs@3.0.3 의심 = npm 패키지 변조. package-lock.json의 integrity 해시 검증 필수. CI에서 npm audit + lockfile-lint 필수 |
| 6 | **"Egress 필터링이 없으면 채굴을 못 막는다"** | Ingress만 막으면 침입은 막지만 C2 통신은 못 막음. Outbound allowlist = 마이닝풀 접속 차단. DNS 쿼리도 모니터링 (DNS tunneling 방어) |

### 10.2 접근 방식 비교

| 관점 | 기존 접근 (수리) | 제안 접근 (교체) |
|------|----------------|-----------------|
| 신뢰도 | 불확실 (rootkit 잔존 가능) | **100% (새 서버)** |
| 소요시간 | 수일~수주 (포렌식+패치) | **30-60분 (자동화)** |
| 서비스 중단 | 장시간 (서버별 순차 작업) | **1-5초 (DNS 전환)** |
| 데이터 손실 | 없음 (동일 서버) | **최소 (WAL replay)** |
| 반복 가능 | 수동 작업 | **Terraform으로 재현 가능** |
| 비용 | 기존 서버 유지비만 | **일시적 이중 비용 (4대 추가)** |

---

## 11. 실행 체크리스트

### Phase 0: 즉시 조치 (지금)

- [ ] Cloudflare 계정에 codeb.kr 존 생성
- [ ] 현재 PowerDNS 레코드를 Cloudflare로 복제
- [ ] 도메인 레지스트라에서 NS를 Cloudflare로 변경
- [ ] 기존 서버 outbound 트래픽 모니터링 강화

### Phase 1: Terraform 준비 (1-2일)

- [ ] Terraform 코드 작성 (compute, network, dns 모듈)
- [ ] cloud-init 스크립트 작성 (서버별)
- [ ] WireGuard VPN mesh 설정 자동화
- [ ] Secret 관리 방안 결정 (Vault vs SOPS)

### Phase 2: 백업 검증 (반나절)

- [ ] 격리된 임시 서버에서 PostgreSQL 백업 복원 테스트
- [ ] 복원된 데이터 악성코드 스캔
- [ ] 침해 시점 이전 백업 식별

### Phase 3: 새 클러스터 배포 (30-60분)

- [ ] `terraform apply` 실행
- [ ] 검증된 백업 데이터 복원
- [ ] 모든 서비스 헬스체크 통과 확인
- [ ] Smoke test (API, WebSocket, DB)

### Phase 4: DNS 전환 (5분)

- [ ] Cloudflare에서 A 레코드 일괄 변경
- [ ] 트래픽 유입 확인
- [ ] 모니터링 대시보드 확인

### Phase 5: 사후 처리 (수일)

- [ ] 기존 서버 네트워크 격리
- [ ] 디스크 스냅샷 보존
- [ ] 포렌식 분석
- [ ] 인시던트 리포트 작성
- [ ] 보안 정책 업데이트

---

## 12. 관련 문서

- [보안 인시던트 리포트 (2026-02-10)](security-incident-report-20260210.md)
- [SSH 보안 공지](ssh-security-notice.md)
- [아키텍처 문서](ARCHITECTURE.md)
- [배포 가이드](deployment-guide.md)

---

> **"Cattle, not Pets"** - 서버에 이름을 붙이고 SSH로 접속해서 수리하는 시대는 끝났습니다.
> 침해되면 폐기하고, 코드로 새로 만들고, 데이터만 복원하면 됩니다.
