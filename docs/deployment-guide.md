# CodeB 배포 및 버전 관리 가이드

> **SSOT (Single Source of Truth) 기반 통합 배포 시스템**

---

## 1. 버전 관리 원칙

### 1.1 Single Source of Truth

```
VERSION 파일이 모든 버전의 기준
```

| 파일 | 역할 |
|------|------|
| `VERSION` | **SSOT** - 모든 버전의 단일 기준 |
| `mcp-server/package.json` | API 서버 버전 (자동 동기화) |
| `cli/package.json` | CLI 패키지 버전 (자동 동기화) |
| `cli/mcp-proxy/package.json` | MCP Proxy 버전 (자동 동기화) |
| `CLAUDE.md` | 문서 버전 (자동 동기화) |

### 1.2 버전 형식

```
MAJOR.MINOR.PATCH
  7    .0   .50

MAJOR: 대규모 변경 (Breaking Changes)
MINOR: 기능 추가 (Features)
PATCH: 버그 수정, 소규모 개선 (Fixes)
```

---

## 2. 배포 대상

### 2.1 3가지 배포 대상

```
┌─────────────────────────────────────────────────────────────┐
│                    배포 대상 3종                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Git Repository (백업용)                                  │
│     └─→ github.com/codeblabdev-max/codeb-server             │
│     └─→ CI/CD 트리거 (GitHub Actions)                       │
│                                                             │
│  2. API Server (Docker)                                     │
│     └─→ 158.247.203.55:9101                                 │
│     └─→ https://api.codeb.kr                                │
│     └─→ MCP API 22개 Tool 제공                              │
│                                                             │
│  3. CLI Package (Minio)                                     │
│     └─→ releases.codeb.kr/cli/                              │
│     └─→ codeb-cli-latest.tar.gz                             │
│     └─→ install.sh, project-update.sh                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 각 대상의 역할

| 대상 | 역할 | URL/경로 |
|------|------|----------|
| **Git** | 소스 백업, 버전 히스토리 | github.com/codeblabdev-max/codeb-server |
| **API Server** | MCP API 서비스 (22개 Tool) | https://api.codeb.kr |
| **CLI Package** | 사용자 설치용 패키지 | https://releases.codeb.kr/cli/ |

---

## 3. 통합 배포 스크립트

### 3.1 사용법

```bash
# 현재 VERSION 파일 버전으로 배포
./scripts/deploy-all.sh

# 새 버전으로 배포 (VERSION 파일도 업데이트)
./scripts/deploy-all.sh <NEW_VERSION>
```

### 3.2 배포 흐름

```
┌─────────────────────────────────────────────────────────────┐
│              deploy-all.sh 실행 흐름                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [1/5] 로컬 파일 버전 동기화                                 │
│        └─→ package.json, CLAUDE.md 버전 업데이트            │
│                                                             │
│  [2/5] Git commit & push                                    │
│        └─→ "chore: release v7.0.x" 커밋                     │
│        └─→ main 브랜치에 푸시                               │
│                                                             │
│  [3/5] API Server Docker 배포                               │
│        └─→ TypeScript 빌드                                  │
│        └─→ tarball 생성 및 서버 전송                        │
│        └─→ Docker 이미지 빌드 및 컨테이너 실행              │
│        └─→ 헬스체크 (api.codeb.kr/health)                   │
│                                                             │
│  [4/5] CLI Package Minio 업로드                             │
│        └─→ tarball 생성 (bin, src, commands, rules)         │
│        └─→ codeb-cli-{version}.tar.gz 업로드                │
│        └─→ codeb-cli-latest.tar.gz 심볼릭                   │
│        └─→ version.json, install.sh 업로드                  │
│                                                             │
│  [5/5] SSOT Registry 업데이트                               │
│        └─→ /opt/codeb/registry/versions.json                │
│        └─→ 모든 컴포넌트 버전 기록                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 배포 결과 검증

```bash
# 배포 후 자동 검증 (VERSION 파일의 버전과 일치해야 함)
Git Repository:  v<VERSION> (커밋 메시지에서 확인)
API Server:      <VERSION>  (curl api.codeb.kr/health)
CLI Package:     <VERSION>  (Minio version.json)

# 수동 검증
cat VERSION                                        # 로컬 버전
curl -s https://api.codeb.kr/health | jq '.version'  # 서버 버전
```

---

## 4. 버전 동기화 스크립트

### 4.1 sync-version.sh (간단)

```bash
# VERSION 파일 기준으로 모든 package.json 동기화
./scripts/sync-version.sh

# 새 버전으로 동기화
./scripts/sync-version.sh <NEW_VERSION>
```

**동기화 대상:**
- `cli/package.json`
- `mcp-server/package.json`
- `cli/mcp-proxy/package.json`
- `cli/install.sh` (배너 버전)
- `CLAUDE.md` (헤더 버전)
- `~/.claude/CLAUDE.md` (글로벌)
- `cli/rules/CLAUDE.md` (배포용)

### 4.2 sync-versions.js (고급)

```bash
# version.json 기반 버전 확인
node scripts/sync-versions.js --check

# version.json 기준으로 동기화
node scripts/sync-versions.js

# 특정 버전으로 동기화
node scripts/sync-versions.js <NEW_VERSION>

# 버전 범프 (현재 VERSION 기준으로 자동 계산)
node scripts/sync-versions.js --bump patch   # x.y.z → x.y.(z+1)
node scripts/sync-versions.js --bump minor   # x.y.z → x.(y+1).0
node scripts/sync-versions.js --bump major   # x.y.z → (x+1).0.0
```

---

## 5. CI/CD vs 직접 배포

### 5.1 CI/CD (GitHub Actions)

```yaml
# .github/workflows/ci-cd.yml
# 트리거: main 브랜치 push (cli/**, VERSION 변경 시)

역할:
- Git 히스토리 자동화 (백업용)
- GitHub Packages 발행
- Minio 업로드 (백업)
```

**중요:** CI/CD는 **백업용**입니다. 실제 배포는 `deploy-all.sh`로 직접 수행합니다.

### 5.2 직접 배포 (권장)

```bash
# 모든 배포는 이 명령 하나로!
./scripts/deploy-all.sh [version]
```

**장점:**
- 즉시 배포 (CI/CD 대기 없음)
- 배포 결과 즉시 확인
- 롤백 용이

---

## 6. 팀원 업데이트 알림

### 6.1 자동 버전 체크

팀원이 API를 호출하면 서버가 클라이언트 버전을 확인합니다.

```bash
# 클라이언트 요청 (X-Client-Version 헤더)
curl -H "X-Client-Version: <OLD_VERSION>" https://api.codeb.kr/health

# 서버 응답 (버전이 낮으면)
{
  "status": "healthy",
  "version": "<CURRENT_VERSION>",
  "updateRequired": true,
  "updateMessage": "CLI 업데이트 필요: <OLD_VERSION> → <CURRENT_VERSION>\ncurl -sSL https://releases.codeb.kr/cli/install.sh | bash",
  "latestVersion": "<CURRENT_VERSION>",
  "downloadUrl": "https://releases.codeb.kr/cli/install.sh"
}

# 현재 버전 확인: cat VERSION 또는 curl -s https://api.codeb.kr/health | jq '.version'
```

### 6.2 팀원 업데이트 방법 (단일 명령)

```bash
# 프로젝트 폴더에서 실행 - 글로벌 + 프로젝트 모두 업데이트
cd /path/to/project
curl -sSL https://releases.codeb.kr/cli/install.sh | bash
```

**install.sh 하나로 처리되는 항목:**
- ✅ 글로벌 Commands (~/.claude/commands/we/)
- ✅ 글로벌 CLAUDE.md (~/.claude/CLAUDE.md)
- ✅ MCP 설정 (~/.claude.json - 기존 유지, codeb-deploy만 추가)
- ✅ 프로젝트 CLAUDE.md (현재 디렉토리)
- ✅ 프로젝트 .env (CodeB 설정 추가, 기존 유지)
- ✅ 프로젝트 Commands (있으면 업데이트)

---

## 7. SSOT Registry

### 7.1 Registry 위치

```
서버: /opt/codeb/registry/versions.json
```

### 7.2 Registry 구조

```json
{
  "ssot_version": "<VERSION>",
  "updated": "<TIMESTAMP>",
  "components": {
    "api": {
      "version": "<VERSION>",
      "endpoint": "https://api.codeb.kr",
      "health": "https://api.codeb.kr/health"
    },
    "cli": {
      "version": "<VERSION>",
      "download": "https://releases.codeb.kr/cli/install.sh",
      "tarball": "https://releases.codeb.kr/cli/codeb-cli-latest.tar.gz"
    },
    "git": {
      "version": "<VERSION>",
      "repo": "https://github.com/codeblabdev-max/codeb-server"
    }
  }
}

# 실제 값 확인
ssh root@158.247.203.55 "cat /opt/codeb/registry/versions.json"
```

---

## 8. 롤백

### 8.1 API Server 롤백

```bash
# 이전 Docker 이미지로 롤백
ssh root@158.247.203.55 "
  docker stop codeb-mcp-api
  docker rm codeb-mcp-api
  docker run -d --name codeb-mcp-api --restart always --network host \
    -e NODE_ENV=production -e PORT=9101 \
    codeb-mcp-api:previous
"
```

### 8.2 CLI 롤백

```bash
# 특정 버전 설치 (원하는 버전으로 변경)
VERSION=<ROLLBACK_VERSION>
curl -sL https://releases.codeb.kr/cli/codeb-cli-${VERSION}.tar.gz -o /tmp/codeb-cli.tar.gz
tar -xzf /tmp/codeb-cli.tar.gz -C /tmp
# ... 수동 설치 진행
```

---

## 9. 체크리스트

### 9.1 배포 전

- [ ] VERSION 파일 버전 확인
- [ ] 로컬 테스트 완료
- [ ] mcp-server 빌드 성공 (`npm run build`)

### 9.2 배포 후

- [ ] API 헬스체크: `curl https://api.codeb.kr/health`
- [ ] 버전 확인: `jq '.version'`
- [ ] CLI 버전 확인: Minio version.json

### 9.3 문제 발생 시

1. API 서버 로그 확인: `ssh server "docker logs codeb-mcp-api"`
2. 포트 충돌 확인: `ssh server "fuser 9101/tcp"`
3. 필요시 롤백

---

## 10. 명령어 요약

```bash
# ============================================
# 관리자 (배포)
# ============================================

# 전체 배포 (Git + API + CLI)
./scripts/deploy-all.sh [version]

# 버전 동기화만 (로컬)
./scripts/sync-version.sh [version]

# 버전 확인
cat VERSION
curl -s https://api.codeb.kr/health | jq '.version'

# ============================================
# 팀원 (업데이트)
# ============================================

# 단일 명령으로 모든 것 업데이트 (글로벌 + 현재 프로젝트)
cd /path/to/project
curl -sSL https://releases.codeb.kr/cli/install.sh | bash
```

---

**문서 버전:** VERSION 파일 참조
**버전 확인:** `cat VERSION` 또는 `curl -s https://api.codeb.kr/health | jq '.version'`
