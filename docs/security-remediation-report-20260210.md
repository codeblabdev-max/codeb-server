# CodeB Infrastructure Security Remediation Report

**Date**: 2026-02-10
**Severity**: Critical (P0)
**Status**: Remediated
**Author**: CodeB Security Team (Automated via Claude Code)

---

## 1. Executive Summary

CodeB 인프라 5개 서버에 대한 포괄적 보안 분석 및 대응을 수행했습니다. 분석 결과 **3개 서버에서 활성/잔여 침해 흔적**이 발견되었으며, 즉시 대응 조치를 완료했습니다.

| 서버 | IP | 상태 | 위협 수준 |
|------|-----|------|----------|
| **App** | 158.247.203.55 | **활성 크립토 마이너 발견 → 제거 완료** | Critical |
| **141 (Extra)** | 141.164.60.51 | **공격 도구 잔여물 발견 → 제거 완료** | High |
| **Storage** | 64.176.226.119 | **방화벽 미설정 (DB 노출) → 차단 완료** | High |
| **Streaming** | 141.164.42.213 | Clean | Low |
| **Backup** | 141.164.37.63 | Clean | Low |

---

## 2. App Server (158.247.203.55) - Critical

### 2.1 발견된 위협

#### 활성 크립토 마이너 (XMRig 변종)
```
프로세스: /tmp/n_bin (PID 889550)
CPU 사용률: ~100% (1코어 점유)
연결 대상: gulf.moneroocean.stream:10128
Monero 지갑: 42Y5J2gN1rsCKM8x4eGFMa5L58XXK9evrEFznyLThwXaGTvtG6ayikdVCdFZsMAtwDcVSd4LgP5RiVzLSdnnqy6H1WU4yqS
```

#### 공격 벡터
- `misopin-blue` Docker 컨테이너 내부에서 실행
- npm 공급망 공격 (bcryptjs@3.0.3 의심)으로 RCE 획득
- 마이너 프로세스 환경변수에서 **misopin DB 자격증명 유출** 확인:
  - `DATABASE_URL=postgresql://misopin_user:IbgV1bQntGe2lKTDDhWSBLgOH9ssap69@...`

#### 방화벽 취약점
- UFW **비활성화** 상태
- PostgreSQL(5432), Redis(6379), cAdvisor(8080), Prometheus(9090) 등 전체 공개

### 2.2 수행한 조치

| # | 조치 | 상태 |
|---|------|------|
| 1 | 마이너 프로세스(PID 889550) kill | Completed |
| 2 | `/tmp/n_bin` 악성 바이너리 삭제 | Completed |
| 3 | `misopin-blue` 컨테이너 중지 (DB 보존) | Completed |
| 4 | 좀비 프로세스 정리 | Completed |
| 5 | UFW 활성화 + Default deny incoming | Completed |
| 6 | SSH(22), HTTP(80), HTTPS(443)만 공개 허용 | Completed |
| 7 | CodeB 내부 서버 IP 화이트리스트 등록 | Completed |
| 8 | DB(5432), Redis(6379), cAdvisor(8080), Prometheus(9090) 차단 | Completed |
| 9 | 공격자 IP 4개 DENY 등록 | Completed |
| 10 | `/tmp` tmpfs noexec,nosuid,nodev 마운트 (4GB) | Completed |
| 11 | `/etc/fstab`에 영구 등록 | Completed |

### 2.3 최종 상태
```
UFW: active (deny incoming, allow outgoing)
/tmp: tmpfs (rw,nosuid,nodev,noexec,relatime,size=4194304k)
CPU: 정상 (cadvisor 6.6%, node 3.0% — 마이너 제거 후 안정)
Memory: 3.0G/15G used (정상)
마이너: 없음
```

---

## 3. 141 Server (141.164.60.51) - High

### 3.1 발견된 위협

#### 공격 도구 #1: hunter_go (SSH/암호화폐 키 브루트포서)
```
경로: /var/tmp/hunter_go
크기: 6.3MB (ELF 64-bit Go binary)
MD5: a685520640ab39dc4053527083610fc8
기능: SSH 브루트포스 + 암호화폐 개인키 무차별 대입
공격 대상: http://157.245.194.118:8000
공격 속도: ~30,000 keys/sec
```

#### 공격 도구 #2: master_go.bf (공격 페이로드 데이터베이스)
```
경로: /var/tmp/master_go.bf
크기: 128MB
MD5: 8adf36f67387c3f666ae4b33de309c7b
내용: Bitcoin/Ethereum 개인키 + SSH 키 데이터베이스
```

#### 공격 로그: hunt.log
```
경로: /var/tmp/hunt.log
크기: 4,926 lines
내용: 브루트포스 결과 로그 (키 시도 → 실패/성공 기록)
기간: 수 시간 연속 실행
```

#### 공격 도구 #3: XMRig 설정 파일
```
경로: /var/tmp/config.json
마이닝 풀: pool.supportxmr.com:3333
Monero 지갑: 492zTyp9mMSZK9FbXJzruWUZNmovsaES4CuEgAUw8MhhF9QrfYMbdUWPATRGDyDJCW4Yqc1fJTFkGPvKR9Xm4riNJTtnewy
```

#### 지속성 메커니즘: system-check
```
경로: /var/tmp/system-check
속성: chattr +i (immutable — rm 차단)
기능: 악성 프로세스 자동 복원 스크립트
```

#### 근본 원인
- UFW에 PostgreSQL(5432), Redis(6379)가 0.0.0.0으로 노출되어 있었음
- PM2가 root 권한으로 Next.js 실행 → RCE = root shell
- `pm2-root.service` (systemd) → 리부트 시 자동 resurrect

### 3.2 수행한 조치

| # | 조치 | 상태 |
|---|------|------|
| 1 | `hunter_go` 삭제 | Completed |
| 2 | `master_go.bf` (128MB) 삭제 | Completed |
| 3 | `hunt.log` 삭제 | Completed |
| 4 | `config.json` (XMRig 설정) 삭제 | Completed |
| 5 | `system-check` immutable 해제 (chattr -i) 후 삭제 | Completed |
| 6 | `system-check.log` 삭제 | Completed |
| 7 | buildah 임시 디렉토리 정리 | Completed |
| 8 | `pm2-root.service` disable + mask | Completed |
| 9 | `/tmp` tmpfs noexec,nosuid,nodev 마운트 (2GB) | Completed |
| 10 | `/var/tmp` 퍼미션 1733으로 변경 | Completed |
| 11 | UFW 화이트리스트 (이전 세션에서 설정 완료) | Completed |

### 3.3 최종 상태
```
UFW: active (CodeB 내부 IP만 허용)
/tmp: tmpfs (rw,nosuid,nodev,noexec,relatime,size=2097152k)
/var/tmp: drwx-wx-wt (1733)
pm2-root.service: masked
CPU: 정상 (systemd 1.1%, dockerd 0.9%)
Memory: 746M/15G used (정상)
악성 파일: 없음
```

---

## 4. Storage Server (64.176.226.119) - High

### 4.1 발견된 위협

#### 방화벽 완전 비활성화
- UFW **비활성화** 상태에서 운영
- PostgreSQL(5432), Redis(6379), MinIO(9000:9001), TUS(1080) 전체 인터넷 노출
- **데이터베이스가 전 세계에서 접근 가능한 상태**

### 4.2 수행한 조치

| # | 조치 | 상태 |
|---|------|------|
| 1 | UFW 활성화 + Default deny incoming | Completed |
| 2 | SSH(22), HTTP(80), HTTPS(443), DNS(53) 허용 | Completed |
| 3 | CodeB 내부 서버 IP 4개 화이트리스트 (Anywhere 허용) | Completed |
| 4 | 공격자 IP 4개 DENY 등록 | Completed |
| 5 | v4 ALLOW 규칙 삭제 (5432, 6379, 9000:9001, 1080) | Completed |
| 6 | **v6 ALLOW 규칙 삭제** (5432, 6379, 9000:9001, 1080) | Completed |
| 7 | `/tmp` tmpfs noexec,nosuid,nodev 마운트 (2GB) | Completed |
| 8 | `/etc/fstab`에 영구 등록 | Completed |

### 4.3 최종 UFW 규칙
```
[ 1] 22/tcp                     ALLOW IN    Anywhere               # SSH
[ 2] 53/tcp                     ALLOW IN    Anywhere               # DNS TCP
[ 3] 53/udp                     ALLOW IN    Anywhere               # DNS UDP
[ 4] 80/tcp                     ALLOW IN    Anywhere               # HTTP
[ 5] 443/tcp                    ALLOW IN    Anywhere               # HTTPS
[ 6] Anywhere                   ALLOW IN    158.247.203.55         # App Server
[ 7] Anywhere                   ALLOW IN    141.164.42.213         # Streaming
[ 8] Anywhere                   ALLOW IN    141.164.37.63          # Backup
[ 9] Anywhere                   ALLOW IN    141.164.60.51          # Extra
[10] Anywhere                   DENY IN     72.62.186.16           # Attacker
[11] Anywhere                   DENY IN     141.94.96.144          # Attacker
[12] Anywhere                   DENY IN     185.202.239.150        # Attacker
[13] Anywhere                   DENY IN     77.110.110.55          # Attacker
[14-18] v6: SSH, DNS, HTTP, HTTPS만 허용
```

PostgreSQL(5432), Redis(6379), MinIO(9000:9001), TUS(1080) → **CodeB 내부 IP에서만 접근 가능**

### 4.4 최종 상태
```
UFW: active (DB 포트 외부 차단)
/tmp: tmpfs (rw,nosuid,nodev,noexec,relatime,size=2097152k)
CPU: 정상 (pdns 4.0%, minio 0.8%, redis 0.8%)
Memory: 1.7G/15G used (정상)
침해 흔적: 없음 (방화벽 취약점만 존재)
```

---

## 5. Clean Servers

### 5.1 Streaming Server (141.164.42.213)
- 침해 흔적 없음
- CPU/Memory 정상
- Centrifugo WebSocket 서비스 정상 운영

### 5.2 Backup Server (141.164.37.63)
- 침해 흔적 없음
- UFW 정상 활성화 상태
- Prometheus/Grafana 정상 운영

---

## 6. Indicators of Compromise (IOC)

### 6.1 악성 파일
| 파일명 | MD5 | 유형 | 서버 |
|--------|-----|------|------|
| `/tmp/n_bin` | - | XMRig 변종 (Monero miner) | App |
| `/var/tmp/hunter_go` | `a685520640ab39dc4053527083610fc8` | Go SSH/Key Brute Forcer | 141 |
| `/var/tmp/master_go.bf` | `8adf36f67387c3f666ae4b33de309c7b` | 공격 키 DB (128MB) | 141 |
| `/var/tmp/system-check` | - | 지속성 스크립트 (chattr +i) | 141 |

### 6.2 Monero 지갑 주소
| 지갑 | 풀 | 서버 |
|------|-----|------|
| `42Y5J2gN...H1WU4yqS` | gulf.moneroocean.stream:10128 | App |
| `492zTyp9...Jtnewy` | pool.supportxmr.com:3333 | 141 |

### 6.3 C2/공격 인프라
| IP/도메인 | 용도 | 조치 |
|-----------|------|------|
| `72.62.186.16` | Reverse shell C2 | UFW DENY |
| `141.94.96.144` | Monero mining pool proxy | UFW DENY |
| `185.202.239.150` | XMRig 다운로드 서버 | UFW DENY |
| `77.110.110.55` | Crypto miner dropper | UFW DENY |
| `157.245.194.118:8000` | hunter_go 브루트포스 타겟 | IOC 기록 |
| `gulf.moneroocean.stream` | MoneroOcean 마이닝 풀 | IOC 기록 |
| `pool.supportxmr.com` | SupportXMR 마이닝 풀 | IOC 기록 |

### 6.4 유출된 자격증명
| 항목 | 상세 | 조치 필요 |
|------|------|----------|
| misopin DB password | `IbgV1bQntGe2lKTDDhWSBLgOH9ssap69` | **즉시 변경 필요** |

---

## 7. 보안 하드닝 요약

### 7.1 모든 서버에 적용된 조치
```
+-------------------------------+------+------+---------+------+--------+
|         조치                  | App  | 141  | Storage | Strm | Backup |
+-------------------------------+------+------+---------+------+--------+
| UFW 활성화                    |  ✅  |  ✅  |   ✅    |  -   |  ✅   |
| DB 포트 외부 차단              |  ✅  |  ✅  |   ✅    |  -   |  -    |
| /tmp noexec                   |  ✅  |  ✅  |   ✅    |  -   |  -    |
| 공격자 IP 차단                 |  ✅  |  ✅  |   ✅    |  -   |  -    |
| CodeB IP 화이트리스트          |  ✅  |  ✅  |   ✅    |  -   |  ✅   |
| 악성 프로세스 제거              |  ✅  |  ✅  |   N/A   |  -   |  -    |
| 악성 파일 제거                 |  ✅  |  ✅  |   N/A   |  -   |  -    |
| 지속성 메커니즘 제거           |  -   |  ✅  |   N/A   |  -   |  -    |
+-------------------------------+------+------+---------+------+--------+
```

### 7.2 /tmp noexec 마운트 상태
| 서버 | 마운트 | 크기 | 옵션 | fstab 등록 |
|------|--------|------|------|-----------|
| App (158.247.203.55) | tmpfs on /tmp | 4GB | noexec,nosuid,nodev | Yes |
| 141 (141.164.60.51) | tmpfs on /tmp | 2GB | noexec,nosuid,nodev | Yes |
| Storage (64.176.226.119) | tmpfs on /tmp | 2GB | noexec,nosuid,nodev | Yes |

---

## 8. 공격 타임라인 분석

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Attack Timeline                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Phase 1: 초기 침투 (추정)                                           │
│  ├─ App 서버: npm 공급망 공격 → misopin 컨테이너 RCE                 │
│  └─ 141 서버: 노출된 DB/Redis 포트 → PM2 root RCE                  │
│                                                                      │
│  Phase 2: 권한 상승 및 도구 배치                                     │
│  ├─ App: /tmp/n_bin 마이너 다운로드 및 실행                         │
│  ├─ 141: hunter_go + master_go.bf 배치                              │
│  ├─ 141: XMRig config.json 설정                                     │
│  └─ 141: system-check (chattr +i) 지속성 설치                      │
│                                                                      │
│  Phase 3: 수익화                                                     │
│  ├─ App: Monero 채굴 (MoneroOcean 풀)                               │
│  ├─ 141: Monero 채굴 (SupportXMR 풀)                                │
│  └─ 141: 암호화폐 개인키 브루트포스 (30k keys/s)                     │
│                                                                      │
│  Phase 4: 탐지 및 대응 (2026-02-10)                                  │
│  ├─ 전체 서버 포괄적 스캔                                            │
│  ├─ 모든 악성 프로세스/파일 제거                                     │
│  ├─ UFW 하드닝 (3개 서버)                                           │
│  ├─ /tmp noexec (3개 서버)                                          │
│  └─ 지속성 메커니즘 제거                                             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. 공격자 프로파일링

### 공격자 A (App 서버)
- **기법**: npm 공급망 공격 → 컨테이너 내 마이너 설치
- **목표**: Monero 채굴 (MoneroOcean 풀)
- **정교함**: 중간 (컨테이너 탈출 시도 없음, Docker 격리에 제한됨)

### 공격자 B (141 서버 - hunter_go)
- **기법**: 노출된 서비스 포트 → PM2 RCE → root 획득
- **목표**: 이중 수익화 (Monero 채굴 + 암호화폐 키 탈취)
- **정교함**: 높음 (커스텀 Go 바이너리, 128MB 키 DB, chattr +i 지속성)
- **특이점**: `hunter_go`는 범용 도구가 아닌 **맞춤 제작 공격 도구**로 판단

### 공격자 C (141 서버 - 이전 세션 발견)
- **기법**: Reverse shell (nc 72.62.186.16 4449)
- **목표**: 원격 접근 유지
- **상태**: 이전 세션에서 이미 제거 완료

---

## 10. 권장 후속 조치

### 즉시 (24시간 이내)
- [ ] **misopin DB 비밀번호 변경** (유출 확인됨)
- [ ] Streaming 서버 (141.164.42.213) UFW 활성화
- [ ] misopin 프로젝트 bcryptjs 종속성 감사 및 업데이트
- [ ] 모든 서버 SSH 키 갱신

### 단기 (1주 이내)
- [ ] WireGuard VPN 메시 네트워크 구축 (서버 간 통신)
- [ ] DB/Redis를 VPN 인터페이스에만 바인딩
- [ ] Docker 컨테이너 보안 강화 (read-only, no-new-privileges, cap-drop=ALL)
- [ ] 자동화된 악성코드 스캔 cron 설정

### 중기 (1개월 이내)
- [ ] PowerDNS → Cloudflare DNS 마이그레이션 (SPOF 제거)
- [ ] Terraform IaC 기반 인프라 자동화
- [ ] 실시간 백업 기반 DR 파이프라인 구축
- [ ] SIEM/IDS 도입 (Suricata, OSSEC 등)

### 장기
- [ ] Zero Trust Architecture 전환
- [ ] 정기 펜테스트 스케줄 수립
- [ ] 보안 모니터링 대시보드 (Grafana)

---

## 11. Lessons Learned

1. **방화벽은 반드시 활성화**: UFW가 비활성화된 서버에서 모든 침해가 발생
2. **DB 포트는 절대 공개 금지**: 5432, 6379가 0.0.0.0에 노출되면 수 시간 내 공격
3. **/tmp noexec 필수**: 모든 발견된 마이너가 /tmp 또는 /var/tmp에서 실행
4. **PM2 root 실행 금지**: RCE 취약점이 곧 root 권한 획득으로 이어짐
5. **npm 공급망 감사 필수**: Docker 컨테이너 내부에서도 공격이 가능
6. **chattr +i 지속성 확인**: 일반 rm으로 삭제 불가능한 악성 파일 존재
7. **다중 공격자 가능성**: 하나의 서버에 3개의 독립적 공격 도구가 발견됨

---

*Report generated: 2026-02-10T23:07:00+09:00*
*Next review: 2026-02-11 (24시간 후속 스캔 예정)*
