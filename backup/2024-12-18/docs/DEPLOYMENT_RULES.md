# CodeB Deployment Rules v2.0

> **Last Updated**: 2025-12-18
> **정책**: 강력 (팀장급만 긴급 우회 가능)

---

## 1. 핵심 원칙

### 1.1 절대 금지 사항

```
CRITICAL: 아래 행위는 모든 상황에서 금지

1. 다른 프로젝트의 컨테이너/볼륨 삭제
2. production 환경의 DB 볼륨 삭제
3. CLI를 우회한 직접 podman/docker 명령 실행
4. .env 파일의 기존 DB 설정 덮어쓰기
5. 포트 충돌 무시 후 배포
```

### 1.2 강제 정책 (Hooks 기반)

| 정책 | 동작 | 우회 |
|------|------|------|
| **프로젝트 격리** | 다른 프로젝트 컨테이너 조작 차단 | 불가 |
| **볼륨 보호** | production DB 볼륨 삭제 차단 | 팀장급만 가능 |
| **포트 검증** | 충돌 시 배포 차단 | 불가 |
| **CLI 버전** | 서버 버전과 불일치 시 차단 | 불가 |
| **.env 보호** | 기존 DB 설정 변경 시 확인 필요 | 명시적 확인 후 가능 |

---

## 2. CLI 사용 규칙

### 2.1 필수 사용 명령어

```bash
# 신규 프로젝트 초기화 - 반드시 CLI 사용
we workflow init <project> --type nextjs --database --redis

# 배포 - 반드시 CLI 사용
we deploy <project> --environment staging

# 서비스 관리 - 반드시 CLI 사용
we workflow sync <project>
we workflow scan <project>
```

### 2.2 금지된 직접 명령어

```bash
# 절대 금지 - Hooks가 차단함
podman rm -f <container>       # 직접 컨테이너 삭제
podman volume rm <volume>      # 직접 볼륨 삭제
docker-compose down -v         # 볼륨 포함 삭제
rm -rf /opt/codeb/projects/*   # 프로젝트 폴더 삭제
```

### 2.3 허용된 조회 명령어

```bash
# 조회는 허용
podman ps                      # 컨테이너 목록
podman logs <container>        # 로그 확인
podman inspect <container>     # 상세 정보
```

---

## 3. 포트 할당 규칙

### 3.1 GitOps 포트 범위

| 환경 | App 포트 | DB 포트 | Redis 포트 |
|------|---------|---------|------------|
| **Staging** | 3000-3499 | 15432-15499 | 16379-16399 |
| **Production** | 4000-4499 | 25432-25499 | 26379-26399 |
| **Preview** | 5000-5999 | - | - |

### 3.2 Blue-Green 슬롯

| 프로젝트 | Blue 슬롯 | Green 슬롯 |
|---------|-----------|------------|
| workb | 3000/4000 | 3001/4001 |
| woori-sai | 3010/4010 | 3011/4011 |
| (신규) | 자동 할당 | 자동 할당 |

### 3.3 포트 충돌 방지

```bash
# 배포 전 필수 검증
we workflow port-validate <project>

# 포트 드리프트 감지
we workflow port-drift
```

---

## 4. 프로젝트 격리

### 4.1 컨테이너 라벨

모든 컨테이너는 필수 라벨을 가져야 함:

```yaml
labels:
  codeb.project: "<project-name>"
  codeb.environment: "<staging|production>"
  codeb.managed: "true"
  codeb.slot: "<blue|green>"
```

### 4.2 네트워크 격리

```bash
# 프로젝트별 전용 네트워크
codeb-net-<project>-<environment>

# 예시
codeb-net-workb-staging
codeb-net-workb-production
```

### 4.3 볼륨 보호

```yaml
# 보호 대상 볼륨 (삭제 차단)
patterns:
  - "*-production-*"
  - "*-prod-*"
  - "*_production_*"
  - "*_prod_*"
  - "*-db-data"
  - "*-postgres-data"
```

---

## 5. CLI 버전 관리

### 5.1 강제 업데이트 정책

```
로컬 CLI 버전 < 서버 버전 → CLI 실행 차단

예외: 긴급 배포 시 팀장급이 --force-version 플래그 사용 가능
(기록됨)
```

### 5.2 버전 확인 방법

```bash
# 로컬 버전
we --version

# 서버 버전 확인
we version check

# 업데이트
npm update -g we-cli
```

---

## 6. 환경 변수 보호

### 6.1 보호 대상 변수

```
# 변경 시 명시적 확인 필요
DATABASE_URL
DIRECT_URL
REDIS_URL
POSTGRES_*
DB_*
```

### 6.2 .env 파일 정책

```bash
# 기존 프로젝트에서 workflow init 실행 시:
1. 기존 .env 파일 감지
2. 보호 변수 목록 표시
3. 명시적 확인 요청
4. 백업 생성 (.env.backup.YYYYMMDD_HHMMSS)
5. MERGE (덮어쓰기 아님)
```

---

## 7. 긴급 우회 절차

### 7.1 자격 요건

```
긴급 우회 권한: 팀장급 이상

우회 가능 항목:
- 볼륨 보호 (production 제외)
- CLI 버전 강제 무시
- .env 강제 덮어쓰기

우회 불가 항목:
- production DB 볼륨 삭제
- 다른 프로젝트 컨테이너 조작
- 포트 충돌 무시
```

### 7.2 우회 절차

```bash
# 1. 긴급 우회 모드 활성화 (기록됨)
we admin emergency-mode --reason "긴급 배포 필요"

# 2. 작업 수행
we deploy <project> --force

# 3. 모드 해제 (자동 30분 후 해제)
we admin emergency-mode --disable
```

### 7.3 기록

모든 긴급 우회는 `/opt/codeb/logs/emergency.log`에 기록됨:

```json
{
  "timestamp": "2025-12-18T12:00:00Z",
  "user": "admin",
  "action": "emergency-mode-enable",
  "reason": "긴급 배포 필요",
  "ip": "192.168.1.100"
}
```

---

## 8. Claude Code 통합

### 8.1 Hooks 설정

`.claude/hooks/` 디렉토리에 검증 스크립트 배치:

```
.claude/hooks/
├── pre-bash.py          # Bash 명령 실행 전 검증
└── validate-deploy.py   # 배포 관련 명령 검증
```

### 8.2 차단 동작

```python
# exit code 2 = 명령 차단
# exit code 0 = 명령 허용

# 차단 예시
if "podman rm" in command and "-f" in command:
    print("ERROR: 직접 컨테이너 삭제는 금지됩니다.")
    print("사용하세요: we workflow stop <project>")
    sys.exit(2)
```

### 8.3 CLAUDE.md 규칙

프로젝트 루트의 `CLAUDE.md`에 반드시 포함:

```markdown
## Critical Rules

1. NEVER run `podman rm` or `docker rm` directly
2. ALWAYS use `we` CLI for deployments
3. NEVER modify .env files with existing DB settings
4. ALWAYS check port conflicts before deploying
```

---

## 9. 모니터링 및 알림

### 9.1 규칙 위반 알림

```bash
# Slack 알림 (자동)
- 프로젝트 격리 위반 시도
- 볼륨 삭제 시도
- 긴급 모드 활성화

# 이메일 알림 (자동)
- production 관련 모든 작업
```

### 9.2 일일 리포트

```bash
# 매일 09:00 자동 발송
- CLI 사용 통계
- 규칙 위반 시도 횟수
- 긴급 우회 사용 내역
```

---

## 10. 권한 분리 (Role-Based Access)

### 10.1 권한 체계

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CodeB 권한 분리 체계                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────┐    ┌─────────────────────────────────┐│
│  │       Admin (관리자)         │    │       Developer (개발자)        ││
│  ├─────────────────────────────┤    ├─────────────────────────────────┤│
│  │                             │    │                                 ││
│  │  SSH 키: 서버에 등록됨       │    │  SSH 키: 등록 안됨              ││
│  │                             │    │                                 ││
│  │  ✅ SSH 직접 접속            │    │  ❌ SSH 접속 불가               ││
│  │  ✅ 서버 설정 변경           │    │  ❌ 서버 설정 변경 불가          ││
│  │  ✅ we workflow init        │    │  ❌ we workflow init 제한       ││
│  │  ✅ we deploy (직접)        │    │  ✅ Git Push → 자동 배포         ││
│  │  ✅ SSOT 관리 (전체)        │    │  ✅ SSOT 읽기 전용              ││
│  │  ✅ 포트/도메인 할당         │    │  ❌ 포트/도메인 변경 불가        ││
│  │  ✅ 긴급 우회 모드           │    │  ❌ 긴급 우회 불가              ││
│  │                             │    │                                 ││
│  └─────────────────────────────┘    └─────────────────────────────────┘│
│                                                                          │
│                         배포 흐름                                        │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Admin: SSH → we deploy <project> → 직접 배포                     │ │
│  │  Developer: Git Push → GitHub Actions → 자동 배포                 │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.2 SSH 키 관리

**SSH 키 등록 위치**: `/root/.ssh/authorized_keys` (서버)

```bash
# 현재 등록된 SSH 키 (Admin만)
# m2 macbook (cheon43@gmail.com)
# ed25519-key (ymn9639@gmail.com)
# sionyeom-macbook
# becky-macbook
# 전민준-macbook
```

**키 추가/제거 (Admin 전용)**:
```bash
# 키 추가
ssh root@141.164.60.51 "echo '<PUBLIC_KEY>' >> ~/.ssh/authorized_keys"

# 키 제거
ssh root@141.164.60.51 "sed -i '/<KEY_IDENTIFIER>/d' ~/.ssh/authorized_keys"

# 현재 키 목록 확인
ssh root@141.164.60.51 "cat ~/.ssh/authorized_keys"
```

### 10.3 Developer 배포 흐름 (Git Push 전용)

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main, staging]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build & Push Image
        run: |
          docker build -t ghcr.io/${{ github.repository }}:${{ github.sha }} .
          docker push ghcr.io/${{ github.repository }}:${{ github.sha }}

      - name: Deploy via MCP
        env:
          CODEB_API_KEY: ${{ secrets.CODEB_API_KEY }}
        run: |
          curl -X POST https://api.codeb.dev/deploy \
            -H "Authorization: Bearer $CODEB_API_KEY" \
            -d '{"project": "${{ github.repository }}", "version": "${{ github.sha }}"}'
```

### 10.4 권한별 CLI 명령어

| 명령어 | Admin | Developer | 설명 |
|--------|:-----:|:---------:|------|
| `we ssot status` | ✅ | ✅ | SSOT 상태 조회 |
| `we ssot projects` | ✅ | ✅ | 프로젝트 목록 |
| `we ssot sync` | ✅ | ✅ | 캐시 동기화 |
| `we workflow init` | ✅ | ❌ | 프로젝트 초기화 |
| `we workflow scan` | ✅ | ✅ | 서버 스캔 |
| `we deploy` | ✅ | ❌* | 직접 배포 |
| `we domain set` | ✅ | ❌ | 도메인 설정 |
| `we port allocate` | ✅ | ❌ | 포트 할당 |

*Developer는 Git Push로만 배포

### 10.5 Hooks 기반 권한 검증

```python
# .claude/hooks/pre-bash.py (발췌)

def check_developer_permissions(command: str):
    """Developer 권한 체크 (SSH 키 없는 사용자)"""
    # SSH 키가 없으면 Developer로 간주
    ssh_key_exists = Path.home().joinpath('.ssh', 'id_rsa').exists() or \
                     Path.home().joinpath('.ssh', 'id_ed25519').exists()

    if not ssh_key_exists:
        # SSH 명령 차단
        if 'ssh ' in command or 'scp ' in command:
            deny("Developer 권한으로는 SSH 접속이 불가능합니다.\n" +
                 "Git Push로 배포하세요: git push origin main")

        # 서버 설정 변경 명령 차단
        restricted_commands = ['we workflow init', 'we domain set', 'we port allocate']
        for restricted in restricted_commands:
            if restricted in command:
                deny(f"Developer 권한으로는 '{restricted}' 실행이 불가능합니다.\n" +
                     "Admin에게 요청하세요.")
```

### 10.6 Developer 온보딩

```bash
# 1. GitHub 저장소 접근 권한 부여 (Admin)
# GitHub → Settings → Collaborators → Add

# 2. CODEB_API_KEY 발급 (Admin)
we api-key generate --user "developer@example.com" --role developer

# 3. Developer 로컬 설정
git clone https://github.com/org/project.git
cd project
we ssot sync  # 읽기 전용 캐시 동기화

# 4. 개발 → 배포
git add .
git commit -m "feat: new feature"
git push origin main  # → 자동 배포 시작
```

---

## 11. 변경 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2025-12-18 | 2.0 | 강력 정책 적용, Hooks 기반 강제 |
| - | 1.0 | 초기 버전 (CLAUDE.md 안내만) |

---

**문서 담당**: Admin
**검토자**: 팀장
