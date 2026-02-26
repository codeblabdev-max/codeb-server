# 감염 Docker 이미지 대응 가이드 (클린빌드 불가 시)

> 작성일: 2026-02-20 (업데이트: 2026-02-20 포렌식 분석 완료)
> 대상: warehouse-rental:latest (141.164.60.51)
> 위협: ~~npm supply chain~~ → **CVE-2025-66478 / CVE-2025-55182 (React2Shell RCE)**
>
> **근본 원인 규명 완료**: Docker 이미지 자체는 깨끗했음. Next.js 15.5.4의
> React Server Components RCE 취약점(CVSS 10.0)을 통해 외부 공격자가
> 컨테이너 내부에서 원격 코드 실행 → rbot/dbus_daemon 다운로드 및 실행.
> **해결**: Next.js 15.5.7 + React 19.1.5 패치 + 5중 방어 적용 완료.

---

## 1. 위협 모델 요약

```
┌─────────────────────────────────────────────────────────────────┐
│                    감염 이미지 위협 모델                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [npm install] → 악성 패키지가 .next 번들에 코드 삽입           │
│       │                                                         │
│       ▼                                                         │
│  [Docker Image] → .next/server 내 JS에 다운로더 코드 포함       │
│       │                                                         │
│       ▼                                                         │
│  [Container 시작] → next-server 실행                            │
│       │                                                         │
│       ▼                                                         │
│  [다운로더 활성화] → wget/curl로 C2에서 바이너리 다운로드        │
│       │                                                         │
│       ▼                                                         │
│  [/tmp에 저장] → rbot, rbot.x86_64, dbus_daemon 등             │
│       │                                                         │
│       ▼                                                         │
│  [실행 시도] → exec → 봇넷/마이너 활동 시작                     │
│       │                                                         │
│       ▼                                                         │
│  [C2 연결] → 84.247.128.162:8443 등으로 명령 수신               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**핵심 문제**: 소스코드는 깨끗하지만, `npm install` 과정에서 감염된 의존성이 빌드 결과물(.next 번들)에 악성 코드를 삽입. 바이너리를 삭제해도 다운로더가 재생성.

---

## 2. 대응 전략 5단계 (NIST SP 800-61r3 기반)

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ 1.격리   │ → │ 2.분석   │ → │ 3.봉쇄   │ → │ 4.근절   │ → │ 5.예방   │
│ Isolate  │   │ Analyze  │   │ Contain  │   │Eradicate │   │ Prevent  │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

---

## 3. 단계별 실행 로직

### STEP 1: 격리 (Isolate) — 즉시 실행

#### 1-1. 네트워크 격리 (C2 차단)

```bash
# UFW로 알려진 C2 IP 차단
ufw deny out to 84.247.128.162   # rbot C2
ufw deny out to 72.62.186.16     # reverse shell C2
ufw deny out to 141.94.96.144    # Monero pool
ufw deny out to 185.202.239.150  # XMRig server
ufw deny out to 77.110.110.55    # dropper

# iptables DOCKER-USER 체인으로 컨테이너 egress 완전 차단
# (Docker는 INPUT/OUTPUT 체인이 아닌 FORWARD → DOCKER-USER 체인 사용)
iptables -I DOCKER-USER -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -I DOCKER-USER -d 127.0.0.0/8 -j ACCEPT        # localhost (DB 등)
iptables -I DOCKER-USER -d 172.17.0.0/16 -j ACCEPT       # docker internal
iptables -A DOCKER-USER -j DROP                           # 나머지 전부 차단
```

**중요**: Docker 컨테이너 트래픽은 `INPUT`/`OUTPUT` 체인을 통과하지 않고 `FORWARD` → `DOCKER-USER` 체인만 통과합니다. UFW만으로는 부족할 수 있으므로 `iptables DOCKER-USER` 규칙이 필수입니다.

#### 1-2. 감염 컨테이너 즉시 중지

```bash
docker stop warehouse-web
docker rm warehouse-web
```

#### 1-3. 좀비 프로세스 정리

```bash
# 컨테이너 중지 후에도 남은 좀비 확인
ps aux | awk '$8 ~ /Z/'

# 부모 프로세스가 없는 좀비는 init이 수거, 시간이 걸릴 수 있음
# 급하면 부모 프로세스 kill
kill -9 $(ps -eo pid,ppid,stat | awk '$3 ~ /Z/ {print $2}' | sort -u)
```

---

### STEP 2: 분석 (Analyze) — 감염 코드 특정

#### 2-1. Docker 이미지 레이어 분석 (핵심)

```bash
# 방법 1: docker save로 이미지 tar 추출
docker save warehouse-rental:latest -o warehouse-image.tar
mkdir warehouse-layers && cd warehouse-layers
tar xf ../warehouse-image.tar

# manifest.json에서 레이어 순서 확인
cat manifest.json | jq '.[0].Layers'

# 각 레이어 diff에서 의심스러운 파일 검색
for layer in */layer.tar; do
    echo "=== $layer ==="
    tar tf "$layer" | grep -E '\.(js|mjs|cjs)$' | grep -i -E 'chunk|server|page'
done

# 방법 2: dive 도구로 시각적 분석 (추천)
# dive warehouse-rental:latest
# → 각 레이어에서 추가/변경된 파일을 빨간색(추가)/노란색(변경)으로 표시
```

#### 2-2. .next 번들 내 악성 코드 시그니처 검색

```bash
# 감염 이미지에서 .next 번들 추출
docker create --name temp-extract warehouse-rental:latest
docker cp temp-extract:/app/.next ./infected-next-bundle
docker rm temp-extract

# 알려진 시그니처 검색
# 1) dbus_daemon 관련 문자열 (런타임 복호화이므로 직접 문자열은 없을 수 있음)
grep -r "dbus" ./infected-next-bundle/ 2>/dev/null

# 2) 비정상 Error 객체의 digest 필드 (핵심 시그니처!)
grep -rn "digest" ./infected-next-bundle/server/ | grep -E "[0-9]{10}"

# 3) wget/curl/exec 관련 패턴
grep -rn "child_process\|execSync\|spawnSync\|wget\|curl" ./infected-next-bundle/server/

# 4) Base64 인코딩된 payload
grep -rn "Buffer.from.*base64\|atob\|btoa" ./infected-next-bundle/server/

# 5) 네트워크 요청 패턴
grep -rn "http://\|https://\|socket\|net.connect" ./infected-next-bundle/server/ \
  | grep -v "node_modules" | grep -v "localhost"

# 6) 난독화 패턴 (eval, Function constructor)
grep -rn "eval(\|new Function\|String.fromCharCode" ./infected-next-bundle/server/
```

> **핵심 인사이트**: 이전 분석에서 `digest` 필드(값: 1626360549, 1843232444, 2375525276)가 있는 Error 객체가 감염 시그니처로 확인됨. 이 패턴이 다운로더 코드의 식별자.

#### 2-3. 클린 소스 vs 감염 이미지 Diff (결정적 증거)

```bash
# 1) 클린 소스에서 로컬 빌드 (격리된 환경에서!)
cd /opt/warehouse-rental
npm ci --ignore-scripts   # lifecycle scripts 무시 = 감염 방지
npm run build

# 2) 클린 빌드 결과물과 감염 이미지 결과물 비교
diff -rq ./clean-next-bundle/server/ ./infected-next-bundle/server/ > diff-report.txt

# 3) 차이나는 파일 = 감염된 파일
cat diff-report.txt
# → 여기서 나오는 파일이 정확히 악성 코드가 삽입된 위치
```

---

### STEP 3: 봉쇄 (Contain) — 클린빌드 불가 시 런타임 방어

클린빌드가 당장 불가능한 경우, 아래 **4중 방어** 를 적용합니다.

#### 방어 Layer 1: Read-Only 파일시스템 + noexec tmpfs

```bash
docker run -d \
  --name warehouse-web \
  --read-only \
  --tmpfs /tmp:noexec,nosuid,nodev,size=100m \
  --tmpfs /app/public/uploads:size=500m \
  --tmpfs /app/.next/cache:size=200m \
  warehouse-rental:latest
```

**효과**: 다운로더가 바이너리를 파일시스템에 쓸 수 없고, tmpfs의 noexec로 실행도 불가.

#### 방어 Layer 2: Linux Capabilities 제거

```bash
docker run -d \
  --cap-drop=ALL \
  --security-opt no-new-privileges \
  warehouse-rental:latest
```

**효과**: 권한 상승 불가. NET_RAW(raw socket), SYS_ADMIN(mount) 등 위험 capability 제거.

#### 방어 Layer 3: Seccomp 프로필 (시스콜 필터링)

```json
// /opt/codeb/security/seccomp-warehouse.json
{
    "defaultAction": "SCMP_ACT_ALLOW",
    "syscalls": [
        {
            "names": [
                "execve",
                "execveat",
                "ptrace",
                "process_vm_readv",
                "process_vm_writev",
                "mount",
                "umount2",
                "pivot_root",
                "chroot",
                "kexec_load",
                "kexec_file_load",
                "reboot"
            ],
            "action": "SCMP_ACT_LOG"
        },
        {
            "names": [
                "kexec_load",
                "kexec_file_load",
                "reboot",
                "mount",
                "umount2",
                "pivot_root",
                "chroot",
                "ptrace"
            ],
            "action": "SCMP_ACT_ERRNO",
            "errnoRet": 1
        }
    ]
}
```

```bash
docker run -d \
  --security-opt seccomp=/opt/codeb/security/seccomp-warehouse.json \
  warehouse-rental:latest
```

**효과**: `execve`를 LOG 모드로 설정하면 어떤 프로세스가 실행되는지 추적 가능. mount/ptrace 등 위험 시스콜 차단.

> **주의**: `execve`를 완전 차단(ERRNO)하면 Node.js 자체가 실행 안 됨. LOG 모드로 감시하면서, 컨테이너 내부에서 next-server 외 다른 바이너리 실행 시 Falco로 탐지.

#### 방어 Layer 4: iptables Egress 필터링

```bash
# 컨테이너가 외부로 나갈 수 있는 포트를 최소화
# warehouse-web은 DB(5432)와 Redis만 필요 → 외부 인터넷 불필요

# Docker DOCKER-USER 체인에 규칙 추가
iptables -I DOCKER-USER 1 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -I DOCKER-USER 2 -s 172.17.0.0/16 -d 127.0.0.0/8 -j ACCEPT
iptables -I DOCKER-USER 3 -s 172.17.0.0/16 -d 172.17.0.0/16 -j ACCEPT
iptables -A DOCKER-USER -s 172.17.0.0/16 -j DROP

# 영구 저장
apt install iptables-persistent -y
netfilter-persistent save
```

**효과**: 컨테이너에서 외부 인터넷 연결 완전 차단. C2 서버 연결 불가, 바이너리 다운로드 불가.

#### 4중 방어 조합 실행 (최종 명령)

```bash
docker run -d \
  --name warehouse-web \
  --read-only \
  --tmpfs /tmp:noexec,nosuid,nodev,size=100m \
  --tmpfs /app/public/uploads:size=500m \
  --tmpfs /app/.next/cache:size=200m \
  --cap-drop=ALL \
  --security-opt no-new-privileges \
  --security-opt seccomp=/opt/codeb/security/seccomp-warehouse.json \
  --restart unless-stopped \
  --network host \
  -e DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/warehouse' \
  -e NEXTAUTH_SECRET='<변경필요>' \
  -e NEXTAUTH_URL='http://localhost:3000' \
  warehouse-rental:latest
```

---

### STEP 4: 근절 (Eradicate) — 감염 패키지 특정 및 제거

#### 4-1. package-lock.json 감사

```bash
# 의존성 트리 전체 감사
npm audit --production

# Snyk으로 심층 스캔 (권장)
npx snyk test --all-projects

# Socket.dev로 supply chain 위험도 체크
npx socket scan
```

#### 4-2. 의존성 격리 빌드 (lifecycle scripts 차단)

```bash
# .npmrc에 lifecycle scripts 비활성화
echo "ignore-scripts=true" >> .npmrc

# 또는 npm ci에서 직접 무시
npm ci --ignore-scripts

# postinstall 등이 필요한 패키지만 선별적으로 실행
npx node-gyp rebuild  # native 모듈만 별도 빌드
```

#### 4-3. Distroless 이미지로 전환 (쉘 제거)

```dockerfile
# 기존: node:18-alpine (쉘 포함 → 공격자가 쉘 사용 가능)
# 변경: gcr.io/distroless/nodejs18-debian12 (쉘 없음)

FROM node:18-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci --ignore-scripts && npm run build

FROM gcr.io/distroless/nodejs18-debian12
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["server.js"]
```

**효과**: wget, curl, sh, bash 등이 아예 없음. 공격자가 다운로더 코드를 실행해도 도구가 없어 바이너리 다운로드 불가.

#### 4-4. SBOM 생성 및 패키지 비교

```bash
# Docker SBOM 생성
docker sbom warehouse-rental:latest > infected-sbom.json

# 클린 빌드 SBOM과 비교
diff infected-sbom.json clean-sbom.json

# Syft로 상세 SBOM
syft warehouse-rental:latest -o json > detailed-sbom.json
```

---

### STEP 5: 예방 (Prevent) — 재감염 방지

#### 5-1. Falco 런타임 탐지 배포

```yaml
# /opt/codeb/security/falco/docker-compose.yml
version: '3'
services:
  falco:
    image: falcosecurity/falco:latest
    privileged: true
    volumes:
      - /var/run/docker.sock:/host/var/run/docker.sock
      - /dev:/host/dev
      - /proc:/host/proc:ro
      - /boot:/host/boot:ro
      - /lib/modules:/host/lib/modules:ro
      - /usr:/host/usr:ro
      - /etc:/host/etc:ro
      - ./rules:/etc/falco/rules.d
    environment:
      - HOST_ROOT=/host
```

```yaml
# /opt/codeb/security/falco/rules/warehouse-rules.yaml
- rule: Suspicious Process in Warehouse Container
  desc: Detect non-Node.js processes in warehouse-web container
  condition: >
    spawned_process and
    container.name = "warehouse-web" and
    not proc.name in (node, next-server)
  output: >
    ALERT: Unexpected process in warehouse-web
    (proc=%proc.name cmd=%proc.cmdline user=%user.name container=%container.name)
  priority: CRITICAL

- rule: Outbound Connection from Warehouse
  desc: Detect outbound connections from warehouse container
  condition: >
    outbound and
    container.name = "warehouse-web" and
    not fd.sip in ("127.0.0.1") and
    not fd.sport in (5432)
  output: >
    ALERT: Outbound connection from warehouse-web
    (connection=%fd.name proc=%proc.name container=%container.name)
  priority: WARNING

- rule: Write to /tmp in Warehouse Container
  desc: Detect file writes to /tmp (potential malware drop)
  condition: >
    open_write and
    container.name = "warehouse-web" and
    fd.directory = "/tmp"
  output: >
    ALERT: File write to /tmp in warehouse-web
    (file=%fd.name proc=%proc.name user=%user.name)
  priority: CRITICAL
```

#### 5-2. 의존성 쿨다운 정책

```json
// .npmrc 또는 Renovate config
// 새 패키지 버전 자동 업데이트 7일 지연
{
  "extends": ["config:base"],
  "stabilityDays": 7,
  "prCreation": "not-pending"
}
```

> **통계**: 7일 쿨다운으로 2025년 주요 supply chain 공격 10건 중 8건을 사전 차단할 수 있었음 (Bastion Security 보고서)

#### 5-3. 빌드 파이프라인 보안

```yaml
# .github/workflows/secure-build.yml (추가 보안 단계)
- name: Audit Dependencies
  run: |
    npm audit --production --audit-level=high
    npx socket scan --bail-on=critical

- name: Build with Frozen Lockfile
  run: npm ci --ignore-scripts

- name: Scan Built Image
  run: |
    docker build -t warehouse-rental:${{ github.sha }} .
    # Trivy 스캔
    trivy image --severity HIGH,CRITICAL warehouse-rental:${{ github.sha }}
    # Grype 스캔
    grype warehouse-rental:${{ github.sha }}

- name: Generate SBOM
  run: |
    syft warehouse-rental:${{ github.sha }} -o spdx-json > sbom.json
    cosign attest --type spdxjson --predicate sbom.json warehouse-rental:${{ github.sha }}

- name: Sign Image
  run: cosign sign warehouse-rental:${{ github.sha }}
```

#### 5-4. 호스트 레벨 하드닝

```bash
# /tmp noexec (fstab)
echo "tmpfs /tmp tmpfs defaults,noexec,nosuid,nodev,size=2G 0 0" >> /etc/fstab

# /var/tmp 권한 강화
chmod 1733 /var/tmp

# 파일 무결성 모니터링 (AIDE)
apt install aide -y
aideinit
cp /var/lib/aide/aide.db.new /var/lib/aide/aide.db
# 크론으로 정기 검사
echo "0 3 * * * /usr/bin/aide --check | mail -s 'AIDE Report' admin@codeb.kr" | crontab -
```

---

## 4. 긴급 상황별 Runbook

### Case A: 다운로더가 다시 활성화됨 (noexec로 실행 차단됨)

```
증상: 컨테이너 로그에 다운로드 시도 흔적, 하지만 실행 실패
상태: ✅ 방어 작동 중 — 긴급도 낮음

조치:
1. docker logs warehouse-web 2>&1 | grep -E "wget|curl|exec|spawn" → 로그 확인
2. 다운로드 대상 URL/IP 추출 → UFW deny out 추가
3. 감염된 JS 파일 특정 후 수동 패치 계획 수립
```

### Case B: 알 수 없는 프로세스가 실행됨

```
증상: Falco 알림 또는 ps에서 비정상 프로세스 발견
상태: 🔴 긴급 — 새로운 공격 벡터 가능

조치:
1. docker stop warehouse-web                              # 즉시 중지
2. docker commit warehouse-web forensic-snapshot          # 포렌식 스냅샷
3. docker save forensic-snapshot -o forensic-$(date +%s).tar
4. ss -tnp | grep -v ':22 ' > network-connections.txt    # 네트워크 증거
5. 격리 후 분석 → 새로운 C2 IP 차단
```

### Case C: 클린빌드 준비 완료

```
조치:
1. npm ci --ignore-scripts                    # lifecycle 무시 빌드
2. diff 클린 .next vs 감염 .next             # 감염 파일 특정
3. 감염 패키지 lockfile에서 제거
4. Distroless 이미지로 Docker 빌드
5. Trivy + Grype 스캔 통과 확인
6. SBOM 생성 및 서명
7. 프로덕션 배포
```

---

## 5. 현재 141 서버 적용 상태

| 방어 레이어 | 상태 | 설명 |
|------------|------|------|
| Read-only FS | ✅ 적용됨 | `--read-only` |
| tmpfs noexec | ✅ 적용됨 | `/tmp:noexec,nosuid,size=100m` |
| CAP_DROP ALL | ✅ 적용됨 | `--cap-drop=ALL` |
| no-new-privileges | ✅ 적용됨 | `--security-opt no-new-privileges` |
| Host /tmp noexec | ✅ 적용됨 | fstab + mount |
| C2 IP 차단 | ✅ 적용됨 | UFW deny out |
| Seccomp 프로필 | ⬜ 미적용 | 프로필 생성 필요 |
| iptables Egress | ⬜ 미적용 | DOCKER-USER 규칙 필요 |
| Falco 탐지 | ⬜ 미적용 | 배포 필요 |
| Distroless 이미지 | ⬜ 미적용 | Dockerfile 변경 필요 |
| 클린 빌드 | ⬜ 미적용 | 감염 패키지 특정 필요 |

---

## 6. IOC (Indicators of Compromise)

### 파일 해시
| 파일명 | MD5 | 유형 |
|--------|-----|------|
| dbus_daemon | 0183ffb97a996d80f25a63dbeda24cd2 | 크립토마이너 |
| hunter_go | a685520640ab39dc4053527083610fc8 | 공격 도구 |
| master_go.bf | 8adf36f67387c3f666ae4b33de309c7b | 공격 도구 |
| rbot | 1f59571f4020cc216f93d57450dbc226 | 봇넷 |
| rbot.x86_64 | 4378a75746ee62c28752e6810d6ecefb | 봇넷 |

### C2 서버
| IP | 포트 | 용도 |
|----|------|------|
| 84.247.128.162 | 8443 | rbot C2 |
| 72.62.186.16 | 4449 | 리버스 쉘 |
| 141.94.96.144 | — | Monero 풀 |
| 185.202.239.150 | — | XMRig 다운로드 |
| 77.110.110.55 | — | 드로퍼 |

### 코드 시그니처
| 패턴 | 설명 |
|------|------|
| Error 객체 `digest` 필드 | 값: 1626360549, 1843232444, 2375525276 |
| `child_process` spawn in .next/server | 비정상 프로세스 생성 |
| Base64 encoded payload in chunk-*.js | 난독화된 다운로더 |

---

## 7. 참고 자료

- [NIST SP 800-61r3: Incident Response Recommendations](https://csrc.nist.gov/pubs/sp/800/61/r3/final)
- [CISA Cybersecurity Incident Response Playbooks](https://www.cisa.gov/sites/default/files/2024-08/Federal_Government_Cybersecurity_Incident_and_Vulnerability_Response_Playbooks_508C.pdf)
- [npm Supply Chain Attacks 2026 Defense Guide (Bastion)](https://bastion.tech/blog/npm-supply-chain-attacks-2026-saas-security-guide)
- [Shai-Hulud V2 npm Attack (Palo Alto Unit 42)](https://unit42.paloaltonetworks.com/npm-supply-chain-attack/)
- [Docker Seccomp Security Profiles](https://docs.docker.com/engine/security/seccomp/)
- [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
- [Falco Runtime Security for Docker](https://falco.org/docs/setup/container/)
- [Docker Forensics (HackTricks)](https://book.hacktricks.xyz/generic-methodologies-and-resources/basic-forensic-methodology/docker-forensics)
- [Blocking Outbound Docker Traffic (BorderGate)](https://www.bordergate.co.uk/blocking-outbound-docker-traffic/)
- [Container Runtime Security Comparative 2025 (AccuKnox)](https://accuknox.com/wp-content/uploads/Container_Runtime_Security_Tooling.pdf)
- [Security Advice for Self-hosting Next.js in Docker (Arcjet)](https://blog.arcjet.com/security-advice-for-self-hosting-next-js-in-docker/)
- [Semgrep: chalk, debug npm compromise](https://semgrep.dev/blog/2025/chalk-debug-and-color-on-npm-compromised-in-new-supply-chain-attack/)
- [Docker's Response to Shai Hulud 2.0](https://www.docker.com/blog/security-that-moves-fast-dockers-response-to-shai-hulud-2-0/)
- [Google docker-explorer Forensics Tool](https://github.com/google/docker-explorer)
- [Sysdig: 29 Docker Security Tools Compared](https://www.sysdig.com/learn-cloud-native/29-docker-security-tools)
