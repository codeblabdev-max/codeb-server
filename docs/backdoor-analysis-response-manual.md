# CodeB 백도어 분석 및 대응 매뉴얼

> 작성일: 2026-02-10
> 대상 서버: 141.164.60.51 (warehouse-web), 158.247.203.55 (misopin)
> 상태: 감염 확인 / noexec로 실행 차단 중 / 감염 경로 추적 진행 중

---

## 1. 사고 개요

### 1.1 무엇이 발생했는가

CodeB 인프라의 Docker/Podman 컨테이너 내부에서 **암호화폐 채굴 악성코드**가 반복적으로 다운로드 및 실행되는 현상이 발견되었습니다. 8시간 이상, 4회 이상의 제거 시도에도 불구하고 **좀비처럼 되살아나는** 패턴을 보였습니다.

### 1.2 영향 범위

| 서버 | 컨테이너 | 악성코드 | 상태 |
|------|----------|----------|------|
| 141.164.60.51 | warehouse-web | dbus_daemon (4MB) | noexec로 실행 차단 |
| 141.164.60.51 | warehouse-web | XXmOKKAJ | 삭제 완료 |
| 158.247.203.55 | heeling-green | eBiuuDYv | 삭제 완료 |
| 158.247.203.55 | misopin-blue | n_bin | 삭제 완료 |

### 1.3 공격자 프로필

| 구분 | 상세 |
|------|------|
| 공격 유형 | npm 공급망 공격 (Supply Chain Attack) |
| 목적 | Monero 암호화폐 채굴 (XMRig) |
| 채굴 풀 | gulf.moneroocean.stream:10128, pool.supportxmr.com:3333 |
| 지갑 주소 1 | `42Y5J2gN...H1WU4yqS` (MoneroOcean) |
| 지갑 주소 2 | `492zTyp9...Jtnewy` (SupportXMR) |
| C2 서버 | 72.62.186.16:4449 (reverse shell) |

---

## 2. 감염 메커니즘 (How It Works)

### 2.1 감염 경로

```
[공격자]
  │
  ▼
npm 레지스트리에 악성 패키지 업로드 (또는 기존 패키지 탈취)
  │
  ▼
Docker build → npm install 실행
  │
  ▼
악성 패키지의 postinstall 또는 빌드 스크립트가 코드 주입
  │
  ▼
.next/standalone 빌드 출력에 난독화된 코드 삽입
  │
  ▼
Next.js 서버 시작 → 난독화 코드 즉시 실행
  │
  ▼
/tmp/dbus_daemon 다운로드 시도 → 실행 시도 → 반복
```

### 2.2 핵심 특징: 빌드 시점 주입 (Build-time Injection)

**소스 코드에는 악성 코드가 없습니다.** 감염은 Docker 이미지 빌드 중 `npm install` 단계에서 발생합니다.

```
소스 코드 (GitHub) ─── CLEAN ✅
       │
       ▼
Docker build: npm install  ← ★ 이 시점에서 감염 발생
       │
       ▼
.next/standalone 빌드     ← 난독화된 악성 코드 포함
       │
       ▼
Container 실행            ← 서버 시작과 동시에 악성코드 활성화
```

### 2.3 난독화 기법

악성 코드는 다음과 같은 기법으로 추적을 회피합니다:

1. **런타임 복호화**: `dbus_daemon` 같은 문자열이 디스크에 평문으로 존재하지 않음
2. **코드 분산**: webpack/turbopack 번들에 분산 주입되어 단일 파일에서 발견 불가
3. **합법적 이름 위장**: `dbus_daemon`은 Linux D-Bus 시스템 데몬으로 위장
4. **비표준 Error 필드**: `digest` 필드를 Error 객체에 추가 (일반 Node.js에서 발생하지 않음)

### 2.4 동작 로그 분석

컨테이너 로그에서 관찰된 공격 시퀀스:

```
[시작] Next.js 서버 시작 → "Ready in 116ms"
  │
  ▼
[1단계] TypeError: Cannot read properties of undefined (reading 'aa')
        → digest: '1626360549'
        → 난독화된 코드의 초기화 시도 (에러 발생하지만 계속 진행)
  │
  ▼
[2단계] /bin/sh: /tmp/dbus_daemon: Permission denied
        → noexec로 인해 실행 차단됨 ✅
  │
  ▼
[3단계] Error: Command failed: ps aux | grep dbus_daemon | grep -v grep
        → digest: '1843232444'
        → 이미 실행 중인지 확인 (실행 안 됐으므로 에러)
  │
  ▼
[4단계] Error: Command failed: command -v curl
        → digest: '2375525276'
        → curl 존재 여부 확인 (다시 다운로드 시도)
  │
  ▼
[반복] → 1단계로 돌아감 (무한 루프)
```

**`digest` 필드 값은 악성 코드의 식별 서명입니다.** 정상적인 Node.js Error 객체에는 이 필드가 없습니다.

---

## 3. 왜 삭제해도 되살아나는가

### 3.1 좀비 메커니즘

```
┌──────────────────────────────────────────────────────────┐
│                   좀비 부활 메커니즘                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  .next 번들 내 난독화 코드 (삭제 불가 - 서버 일부)        │
│       │                                                  │
│       ├─→ /tmp/dbus_daemon 다운로드                      │
│       │       │                                          │
│       │       ├─→ 실행 시도 → (noexec) 차단              │
│       │       │                                          │
│       │       └─→ ps aux로 확인 → 실행 안됨              │
│       │               │                                  │
│       │               └─→ curl 확인 → 재다운로드 시도     │
│       │                       │                          │
│       └───────────────────────┘  (무한 루프)             │
│                                                          │
│  ★ dbus_daemon을 삭제해도 코드 자체가 재다운로드함        │
│  ★ 코드는 .next 빌드에 포함되어 있어 컨테이너            │
│    재시작만으로는 제거 불가                                │
│  ★ 동일 이미지로 재배포해도 같은 결과                     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 3.2 핵심 이유

1. **악성 코드가 애플리케이션의 일부**: `.next/standalone` 번들에 포함되어 있으므로 Next.js 서버가 시작하면 자동 실행
2. **바이너리 삭제는 의미 없음**: `dbus_daemon`을 삭제해도 다운로더 코드가 다시 받아옴
3. **컨테이너 재시작도 의미 없음**: 같은 이미지에서 시작하므로 같은 결과
4. **같은 Docker 이미지로 재배포도 의미 없음**: 이미지 자체가 감염됨

### 3.3 유일한 해결법

**감염된 Docker 이미지를 폐기하고, 클린 빌드로 교체해야 합니다.**

---

## 4. 감사(Audit) 결과 요약

### 4.1 소스 코드 감사

| 프로젝트 | 리포지토리 | 결과 |
|---------|-----------|------|
| warehouse-rental | github.com/codeb-dev-run/warehouse-rental | **CLEAN** ✅ |
| Heeling | github.com/codeb-dev-run/Heeling | **CLEAN** ✅ |

검사 항목:
- [x] `child_process`, `exec`, `spawn`, `execSync` 사용 여부
- [x] `eval()`, `Function()`, `new Function()` 패턴
- [x] `Buffer.from()` + `toString()` 난독화 패턴
- [x] `atob()`, `String.fromCharCode()` 인코딩 패턴
- [x] `postinstall`, `preinstall` 스크립트
- [x] 의심스러운 URL/IP 하드코딩
- [x] `.npmrc`, `.yarnrc` 변조 여부

### 4.2 npm 패키지 감사

| 패키지 | 버전 | 의심 수준 | 결과 |
|--------|------|----------|------|
| bcryptjs | 3.0.3 | 높음 (초기 의심) | **CLEAN** ✅ |

bcryptjs 검증 방법:
```bash
# npm 레지스트리에서 직접 tarball 다운로드
curl -sL https://registry.npmjs.org/bcryptjs/-/bcryptjs-3.0.3.tgz -o bcryptjs-3.0.3.tgz

# integrity hash 비교
sha512sum bcryptjs-3.0.3.tgz
# → 공식 레지스트리 해시와 일치 확인

# postinstall 스크립트 확인
tar -xf bcryptjs-3.0.3.tgz
cat package/package.json | jq '.scripts'
# → postinstall 없음
```

### 4.3 Docker 이미지 감사

| 이미지 | 빌드 시간 | 감염 여부 |
|--------|----------|----------|
| warehouse-web (141서버) | 2026-02-10 11:27 | **INFECTED** ❌ |

감염 징후:
- `.next/server/edge/chunks/[root-of-the-server]__26319148._.js`에서 4건의 의심 패턴 발견
- 런타임에 `dbus_daemon` 문자열이 복호화되어 사용됨
- 정상 Node.js에 없는 `digest` 필드가 Error 객체에 존재

---

## 5. 대응 절차 (Step-by-Step)

### 5.1 긴급 대응 (즉시)

#### Step 1: 컨테이너 격리
```bash
# 컨테이너 네트워크 연결 차단
docker network disconnect <network> <container>

# 또는 컨테이너 중지 (서비스 중단 감수)
docker stop <container>
```

#### Step 2: 증거 보존
```bash
# 컨테이너 로그 저장
docker logs <container> > /tmp/evidence/container-logs-$(date +%Y%m%d).txt 2>&1

# 컨테이너 파일시스템 스냅샷
docker export <container> > /tmp/evidence/container-fs-$(date +%Y%m%d).tar

# 의심 파일 해시 기록
docker exec <container> md5sum /tmp/dbus_daemon 2>/dev/null
docker exec <container> ls -la /tmp/ 2>/dev/null
```

#### Step 3: /tmp noexec 확인
```bash
# 호스트 /tmp noexec 확인
mount | grep /tmp
# 기대 출력: tmpfs on /tmp type tmpfs (rw,nosuid,nodev,noexec,...)

# 컨테이너 /tmp noexec 확인
docker exec <container> mount | grep /tmp
```

#### Step 4: 악성 IP 차단
```bash
# UFW로 차단
sudo ufw deny out to 72.62.186.16    # C2 서버
sudo ufw deny out to 141.94.96.144   # 채굴 풀
sudo ufw deny out to 185.202.239.150 # XMRig 다운로드
sudo ufw deny out to 77.110.110.55   # 드로퍼
```

### 5.2 근본 원인 제거

#### Step 5: 클린 빌드 생성 및 비교

이 단계가 **가장 중요**합니다. 소스 코드가 클린하므로, 클린 빌드와 감염 이미지를 비교하면 정확한 감염 코드를 식별할 수 있습니다.

```bash
# 1. 감염 이미지에서 .next 추출
docker create --name infected-extract <infected-image>
docker cp infected-extract:/app/.next /tmp/evidence/infected-next
docker rm infected-extract

# 2. 클린 소스에서 새로 빌드
git clone <repo> /tmp/clean-build
cd /tmp/clean-build

# package-lock.json 사용하여 정확한 버전 고정
npm ci

# .next 빌드
npm run build

# 3. diff 비교
diff -rq /tmp/evidence/infected-next /tmp/clean-build/.next > /tmp/evidence/diff-report.txt

# 4. 변경된 파일 상세 비교
for f in $(diff -rq /tmp/evidence/infected-next /tmp/clean-build/.next | grep "differ" | awk '{print $2}'); do
  echo "=== $f ==="
  diff "$f" "${f/infected-next/clean-build\/.next}"
done > /tmp/evidence/diff-detail.txt
```

#### Step 6: 감염 npm 패키지 식별

```bash
# 1. 감염 이미지의 node_modules 해시 추출
docker cp infected-extract:/app/node_modules /tmp/evidence/infected-modules

# 2. 클린 빌드의 node_modules 해시와 비교
cd /tmp/clean-build
find node_modules -name "*.js" -exec md5sum {} \; | sort > /tmp/evidence/clean-hashes.txt

cd /tmp/evidence/infected-modules
find . -name "*.js" -exec md5sum {} \; | sort > /tmp/evidence/infected-hashes.txt

# 3. 해시 불일치 파일 = 감염된 패키지
diff /tmp/evidence/clean-hashes.txt /tmp/evidence/infected-hashes.txt > /tmp/evidence/package-diff.txt
```

#### Step 7: 클린 이미지로 교체

```bash
# 감염 이미지 삭제
docker rmi <infected-image>

# 클린 소스에서 새 이미지 빌드
docker build -t <project>:clean-$(date +%Y%m%d) .

# 보안 강화 옵션으로 실행
docker run -d \
  --name <project> \
  --read-only \
  --tmpfs /tmp:noexec,nosuid,nodev,size=100m \
  --cap-drop=ALL \
  --no-new-privileges \
  --security-opt no-new-privileges:true \
  <project>:clean-$(date +%Y%m%d)
```

### 5.3 재발 방지

#### Step 8: 지속적 모니터링

```bash
# /tmp 파일 감시 (cron으로 5분마다)
*/5 * * * * find /tmp -type f -executable 2>/dev/null | logger -t tmp-monitor

# 컨테이너 내 의심 프로세스 감시
*/5 * * * * docker exec <container> ps aux 2>/dev/null | grep -E '(miner|xmrig|dbus_daemon)' | logger -t container-monitor

# 아웃바운드 채굴 풀 연결 감시
*/5 * * * * ss -tnp | grep -E '(10128|3333|4449)' | logger -t mining-monitor
```

---

## 6. IOC (Indicators of Compromise) 목록

### 6.1 파일 기반 IOC

| 파일명 | 크기 | MD5 해시 | 위치 |
|--------|------|----------|------|
| dbus_daemon | ~4MB | `0183ffb97a996d80f25a63dbeda24cd2` | /tmp/ (컨테이너) |
| eBiuuDYv | 가변 | - | /tmp/ (컨테이너) |
| XXmOKKAJ | 가변 | - | /tmp/ (컨테이너) |
| n_bin | 가변 | - | /tmp/ (컨테이너) |
| .svc_370 | - | - | /tmp/, /var/tmp/ (호스트) |
| .svc_628 | - | - | /tmp/, /var/tmp/ (호스트) |
| .svc_db | - | - | /tmp/, /var/tmp/ (호스트) |
| hunter_go | 6.3MB | `a685520640ab39dc4053527083610fc8` | /var/tmp/ (호스트) |
| master_go.bf | 128MB | `8adf36f67387c3f666ae4b33de309c7b` | /var/tmp/ (호스트) |
| system-check | - | - | chattr +i (호스트) |

### 6.2 네트워크 기반 IOC

| IP/도메인 | 포트 | 용도 |
|-----------|------|------|
| 72.62.186.16 | 4449 | Reverse Shell C2 |
| 141.94.96.144 | 10128 | MoneroOcean 채굴 풀 |
| 185.202.239.150 | - | XMRig 다운로드 |
| 77.110.110.55 | - | 악성코드 드로퍼 |
| gulf.moneroocean.stream | 10128 | Monero 채굴 풀 |
| pool.supportxmr.com | 3333 | Monero 채굴 풀 |

### 6.3 행위 기반 IOC

| 패턴 | 설명 |
|------|------|
| Error 객체에 `digest` 필드 | 정상 Node.js에서 발생하지 않음 |
| `ps aux \| grep dbus_daemon` | 채굴 프로세스 확인 시도 |
| `command -v curl` | 다운로드 도구 확인 |
| `/tmp/` 내 실행 파일 생성 | 정상 앱에서 하지 않는 행동 |
| `chattr +i` 설정된 파일 | 삭제 방지 영속화 기법 |

---

## 7. 검사 체크리스트

서버를 검사할 때 아래 항목을 순서대로 확인하세요.

### 7.1 호스트 레벨

```bash
# 1. /tmp, /var/tmp에 실행 파일 확인
find /tmp -type f -executable 2>/dev/null
find /var/tmp -type f 2>/dev/null
ls -la /tmp/.* 2>/dev/null   # 숨김 파일

# 2. immutable 속성 파일 확인 (chattr +i)
lsattr /tmp/* 2>/dev/null
lsattr /var/tmp/* 2>/dev/null

# 3. 의심 프로세스 확인
ps aux | grep -E '(miner|xmrig|dbus|svc_|hunter|XXm|eBi)'

# 4. 의심 네트워크 연결
ss -tnp | grep -E '(10128|3333|4449|monero|xmr)'
ss -tnp | grep -vE '(22|80|443|5432|6379)' # 알려진 포트 외 연결

# 5. systemd 영속화 확인
systemctl list-unit-files | grep -E '(pm2|miner|svc)'
systemctl status pm2-root 2>/dev/null

# 6. UFW 상태 확인
sudo ufw status numbered

# 7. crontab 확인
crontab -l 2>/dev/null
for user in $(cut -f1 -d: /etc/passwd); do
  echo "=== $user ==="
  crontab -u $user -l 2>/dev/null
done
```

### 7.2 컨테이너 레벨

```bash
# 1. 모든 컨테이너 목록
docker ps -a

# 2. 각 컨테이너 /tmp 확인
for c in $(docker ps -q); do
  echo "=== $(docker inspect --format='{{.Name}}' $c) ==="
  docker exec $c ls -la /tmp/ 2>/dev/null
  docker exec $c find /tmp -type f -executable 2>/dev/null
done

# 3. 컨테이너 로그에서 IOC 검색
for c in $(docker ps -q); do
  echo "=== $(docker inspect --format='{{.Name}}' $c) ==="
  docker logs $c 2>&1 | grep -E '(dbus_daemon|digest|Permission denied.*/tmp|miner)' | tail -5
done

# 4. 컨테이너 보안 설정 확인
for c in $(docker ps -q); do
  echo "=== $(docker inspect --format='{{.Name}}' $c) ==="
  docker inspect $c | jq '.[0].HostConfig | {ReadonlyRootfs, CapDrop, SecurityOpt, Tmpfs}'
done
```

---

## 8. 예방 가이드

### 8.1 Docker 컨테이너 보안 7계층

```bash
docker run -d \
  --read-only \                              # 1. 루트 FS 읽기전용
  --tmpfs /tmp:noexec,nosuid,nodev,size=100m \ # 2. /tmp noexec + 용량제한
  --cap-drop=ALL \                           # 3. 모든 리눅스 capability 제거
  --no-new-privileges \                      # 4. 권한 상승 방지
  --security-opt no-new-privileges:true \    # 5. seccomp 보안
  --memory=512m --cpus=1 \                   # 6. 리소스 제한 (채굴 방지)
  --network=app-network \                    # 7. 격리된 네트워크
  <image>
```

### 8.2 npm 공급망 보안

```bash
# package-lock.json 항상 커밋
git add package-lock.json

# npm ci 사용 (npm install 대신)
npm ci  # lock 파일 기준 정확한 설치

# npm audit 정기 실행
npm audit

# 알려진 악성 패키지 확인
# https://github.com/nicolecarv/bad-npm-packages
```

### 8.3 UFW 방화벽 규칙

```bash
# 기본 정책
sudo ufw default deny incoming
sudo ufw default deny outgoing  # ★ 아웃바운드도 차단

# 필수 아웃바운드만 허용
sudo ufw allow out 80/tcp   # HTTP
sudo ufw allow out 443/tcp  # HTTPS
sudo ufw allow out 53       # DNS
sudo ufw allow out 22/tcp   # SSH

# DB 포트는 내부 IP만 허용
sudo ufw allow from 158.247.203.55 to any port 5432  # App → DB
```

### 8.4 호스트 /tmp noexec

```bash
# /etc/fstab에 추가
tmpfs /tmp tmpfs defaults,noexec,nosuid,nodev,size=2G 0 0

# 즉시 적용
sudo mount -o remount,noexec,nosuid,nodev /tmp
```

---

## 9. 다음 단계 (TODO)

### 즉시 실행 (Priority 1)

- [ ] 141서버에서 warehouse-rental 클린 빌드 수행
- [ ] 감염 이미지와 클린 빌드 diff 비교로 정확한 감염 코드 식별
- [ ] 감염된 npm 패키지 식별 (node_modules 해시 비교)
- [ ] 식별된 악성 패키지를 npm security에 보고

### 단기 (Priority 2)

- [ ] misopin DB 비밀번호 교체 (환경변수 노출됨)
- [ ] Heeling 하드코딩된 자격증명 교체 (scripts/run-schedule-checker.sh)
- [ ] Streaming 서버 (141.164.42.213) UFW 설정
- [ ] 모든 프로젝트 Docker 이미지 클린 리빌드

### 중기 (Priority 3)

- [ ] WireGuard VPN 메시 구축 (서버 간 통신 암호화)
- [ ] Wazuh IDS/SIEM 도입 (141서버에서 먼저 테스트)
- [ ] DR (Disaster Recovery) 파이프라인 구축
- [ ] npm 패키지 레지스트리 미러 (Verdaccio) 검토

---

## 10. 참고 자료

### 관련 문서
- [보안 수정 보고서](./security-remediation-report-20260210.md) - 전체 수정 이력
- [141서버 보안 랩 가이드](./141-server-security-lab-guide.md) - 향후 보안 강화 가이드
- [DR 전략 문서](./disaster-recovery-strategy.md) - 재해 복구 전략

### npm 공급망 공격 관련
- npm 보안 권고: https://docs.npmjs.com/threats-and-mitigations
- Shai-Hulud 웜 (2025.09): npm lifecycle 스크립트를 통한 자동 전파
- chalk/debug 공급망 공격: 인기 패키지 메인테이너 계정 탈취

### 교훈

1. **소스가 깨끗해도 안전하지 않다**: 빌드 시점에 종속성을 통해 감염될 수 있음
2. **바이너리 삭제는 근본 해결이 아니다**: 다운로더 코드가 다시 받아옴
3. **noexec는 최후의 방어선**: 실행을 막지만 다운로드는 막지 못함
4. **Docker 이미지를 신뢰하지 마라**: 빌드할 때마다 감사해야 함
5. **UFW는 반드시 활성화**: 특히 DB/Redis 포트 (5432, 6379)
6. **PM2를 root로 실행하지 마라**: RCE 취약점이 곧 root 권한 탈취
