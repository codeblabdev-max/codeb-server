# CodeB v7.0 - 알려진 문제점 및 해결 방안

> **문서 버전**: 8.0.0
> **최종 업데이트**: 2026-02-06

---

## 목차

1. [버전 동기화 문제](#1-버전-동기화-문제)
2. [we:quick 스킬 순서 문제](#2-wequick-스킬-순서-문제)
3. [we:deploy 스킬 문제](#3-wedeploy-스킬-문제)
4. [domain_setup 의존성 문제](#4-domain_setup-의존성-문제)
5. [GitHub Actions 워크플로우 미확인](#5-github-actions-워크플로우-미확인)
6. [올바른 배포 플로우](#6-올바른-배포-플로우)

---

## 1. 버전 동기화 문제

### 현상

`deploy-all.sh` 실행 후 루트 `package.json` 버전이 동기화되지 않음.

```
VERSION:                7.0.66 ✅
mcp-server/package.json: 7.0.66 ✅
cli/package.json:        7.0.66 ✅
package.json (루트):     7.0.59 ❌  ← 미동기화!
```

### 원인

`scripts/deploy-all.sh` 51-56라인에서 루트 `package.json` 누락:

```bash
# 현재 (문제)
for PKG in "mcp-server/package.json" "cli/package.json"; do
  # 루트 package.json 없음!
```

### 해결 방안

```bash
# 수정 후
for PKG in "package.json" "mcp-server/package.json" "cli/package.json"; do
  jq --arg v "$NEW_VERSION" '.version = $v' "$PKG" > "$PKG.tmp" && mv "$PKG.tmp" "$PKG"
done
```

### 상태

- [x] ✅ 수정 완료 (v7.0.66)
  - `scripts/deploy-all.sh` 51번 라인에 루트 `package.json` 추가됨
  - 루트 `package.json` 버전 7.0.66으로 동기화 완료

---

## 2. we:quick 스킬 순서 문제

### 현상

`/we:quick` 실행 시 `domain_setup` 단계에서 실패.

```
we:quick 현재 흐름:
  헬스체크 → workflow_scan → workflow_init → domain_setup → deploy
                                                  ↑
                                            슬롯 정보 없음 → 실패!
```

### 원인

1. `domain_setup`은 슬롯 정보(배포 후 생성됨)가 필요
2. 하지만 `workflow_init`은 이미 Caddy + PowerDNS 설정을 처리함
3. **중복이며 순서 오류**

### `workflow_init`이 이미 처리하는 것들

`mcp-server/src/tools/project.ts` 296-320라인:

```typescript
// Caddy 도메인 설정 (workflow_init에서 이미 처리)
const caddySnippet = `${domain} { reverse_proxy ... }`;
await appSSH.exec(`echo '${caddySnippet}' | sudo tee ${caddyPath}`);
await appSSH.exec(`sudo systemctl reload caddy || true`);

// PowerDNS A 레코드 (codeb.kr 서브도메인)
if (domain.endsWith('.codeb.kr')) {
  await appSSH.exec(`pdnsutil add-record codeb.kr ${subdomain} A 300 ${SERVERS.app.ip}`);
}
```

### 해결 방안

`cli/skills/we/quick.md` 수정:

```markdown
# 현재 (문제)
### 4단계: 도메인 설정
domain_setup { ... }  ← 불필요!

# 수정 후
### 4단계: (삭제됨)
# workflow_init이 이미 도메인 설정 처리
# domain_setup은 커스텀 도메인 추가 시에만 사용
```

### 올바른 we:quick 흐름

```
헬스체크 → workflow_scan → workflow_init (도메인 포함) → deploy_project
```

### 상태

- [ ] cli/skills/we/quick.md 수정 필요

---

## 3. we:deploy 스킬 문제

### 현상

`/we:deploy` 호출 시 GitHub Actions 워크플로우 존재 여부를 확인하지 않고 직접 `deploy_project` API를 호출함.

### 문제점

1. workb 같은 프로젝트는 `git push`로 배포해야 함 (Self-Hosted Runner + Minio Cache)
2. 직접 `deploy_project` 호출하면 이미지가 없어서 실패
3. GitHub Actions가 빌드해야 이미지가 Private Registry에 존재

### 현재 we:deploy 스킬 (문제)

```markdown
### 1단계: package.json 읽기
### 2단계: workflow_scan (DB SSOT 확인)
### 3단계: deploy_project 직접 호출  ← 문제!
```

### deploy_project API의 이미지 처리

`mcp-server/src/tools/deploy.ts` 231-235라인:

```typescript
const imageUrl = input.image
  ? input.image
  : `${PRIVATE_REGISTRY}/${projectName}:${version}`;
// → 64.176.226.119:5000/projectName:latest
// → GitHub Actions가 빌드하지 않았으면 이미지 없음!
```

### 해결 방안

`cli/skills/we/deploy.md` 수정:

```markdown
### 1단계: GitHub Actions 워크플로우 확인
Glob: .github/workflows/*.yml
→ 있으면: "git push로 배포하세요" 안내
→ 없으면: 2단계로 진행

### 2단계: 워크플로우 없는 경우
→ workflow_generate 호출 제안
→ 또는 수동 이미지 지정 (--image 옵션)
```

### 상태

- [ ] cli/skills/we/deploy.md 수정 필요

---

## 4. domain_setup 의존성 문제

### 현상

`domain_setup` 도구가 슬롯 정보 없이 동작하지 않음.

### 원인

`mcp-server/src/tools/domain.ts` 236-239라인:

```typescript
const slotInfo = await getSlotInfo(projectName, environment);
if (!slotInfo) {
  return { success: false, error: `Project ${projectName} not found or not deployed` };
}
```

### 문제점

- 배포 전에는 슬롯 정보가 없음
- 커스텀 도메인을 먼저 설정하고 싶어도 불가능

### 해결 방안

슬롯 없어도 동작하도록 수정:

```typescript
const slotInfo = await getSlotInfo(projectName, environment);
if (!slotInfo) {
  // 배포 전이면 DB에서 프로젝트 정보와 슬롯 레지스트리 조회
  const project = await ProjectRepo.findByName(projectName);
  if (!project) {
    return { success: false, error: `Project ${projectName} not found` };
  }
  const slots = await SlotRepo.findByProject(projectName, environment);
  if (!slots) {
    return { success: false, error: `Run workflow_init first` };
  }
  // 슬롯 레지스트리에서 포트 사용
  slotInfo = { activePort: slots.blue.port, standbyPort: slots.green.port, ... };
}
```

### 상태

- [ ] mcp-server/src/tools/domain.ts 수정 필요

---

## 5. GitHub Actions 워크플로우 미확인

### 현상

Skills가 `.github/workflows/` 존재 여부를 확인하지 않음.

### 올바른 배포 방식 (workb 기준)

```yaml
# workb/.github/workflows/deploy.yml
name: workb CI/CD

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: [self-hosted, docker]  # ← Self-Hosted Runner

    steps:
      - name: Build and Push (Minio S3 Cache)
        run: |
          docker buildx build \
            --cache-from "type=s3,bucket=docker-cache,endpoint_url=http://64.176.226.119:9000,..." \
            --cache-to "type=s3,bucket=docker-cache,..." \
            --push \
            .

      - name: Deploy via MCP API
        run: |
          curl -X POST "https://api.codeb.kr/api/tool" \
            -H "X-API-Key: ${{ secrets.CODEB_API_KEY }}" \
            -d '{"tool": "deploy", "params": {..., "image": "64.176.226.119:5000/workb:${{ github.sha }}"}}'
```

### 핵심 포인트

1. **Self-Hosted Runner** - GitHub Actions가 CodeB 서버에서 실행
2. **Minio S3 Cache** - Docker BuildKit S3 캐시로 빌드 속도 극대화
3. **Private Registry** - `64.176.226.119:5000`에 이미지 푸시
4. **MCP API 호출** - 빌드된 이미지로 배포

### Skills가 확인해야 할 것

```markdown
### we:deploy 호출 시
1. .github/workflows/*.yml 존재 확인
2. 있으면: "git push로 배포하세요"
3. 없으면: workflow_generate 제안

### we:init / we:quick 호출 시
1. workflow_init 실행 (서버 리소스 생성)
2. .github/workflows/deploy.yml 생성 제안
3. GitHub Secrets 설정 안내 (CODEB_API_KEY)
```

### 상태

- [ ] Skills 업데이트 필요

---

## 6. 올바른 배포 플로우

### 신규 프로젝트

```
┌─────────────────────────────────────────────────────────────────┐
│                     신규 프로젝트 초기화                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. /we:init 또는 /we:quick                                      │
│     └→ workflow_init 실행                                       │
│        ├─ DB SSOT 등록                                          │
│        ├─ 포트 할당 (Blue-Green)                                │
│        ├─ PostgreSQL DB/User 생성                               │
│        ├─ Redis DB 번호 할당                                    │
│        ├─ ENV 파일 생성                                         │
│        ├─ Caddy 도메인 설정                                     │
│        └─ PowerDNS A 레코드 (codeb.kr 서브도메인)               │
│                                                                 │
│  2. .github/workflows/deploy.yml 생성                           │
│     └→ workflow_generate 또는 템플릿 복사                       │
│                                                                 │
│  3. GitHub Secrets 설정                                         │
│     ├─ CODEB_API_KEY                                           │
│     ├─ MINIO_ACCESS_KEY                                        │
│     └─ MINIO_SECRET_KEY                                        │
│                                                                 │
│  4. git push origin main                                        │
│     └→ GitHub Actions 실행                                      │
│        ├─ Docker 빌드 (Minio S3 Cache)                         │
│        ├─ Private Registry 푸시                                 │
│        └─ MCP API 호출 (deploy_project with image)             │
│                                                                 │
│  5. /we:promote                                                 │
│     └→ 트래픽 전환                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 기존 프로젝트 (GitHub Actions 있음)

```
┌─────────────────────────────────────────────────────────────────┐
│                기존 프로젝트 배포 (workb 방식)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  /we:deploy 호출 시                                              │
│  ┌─────────────────────────────────────────┐                   │
│  │ .github/workflows/*.yml 확인            │                   │
│  │                                         │                   │
│  │ ✅ 있음 → "git push로 배포하세요"       │                   │
│  │          안내 메시지 출력               │                   │
│  │                                         │                   │
│  │ ❌ 없음 → workflow_generate 제안        │                   │
│  └─────────────────────────────────────────┘                   │
│                                                                 │
│  배포 흐름:                                                     │
│  1. 코드 수정                                                   │
│  2. git add && git commit && git push                          │
│  3. GitHub Actions 자동 실행                                    │
│     ├─ Self-Hosted Runner에서 빌드                             │
│     ├─ Minio S3 캐시 활용                                      │
│     ├─ Private Registry 푸시                                   │
│     └─ MCP API 호출 → Preview URL 반환                        │
│  4. /we:promote → 트래픽 전환                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### codeb-server 자체 배포 (수동)

```
┌─────────────────────────────────────────────────────────────────┐
│                codeb-server 수동 배포 (예외)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  codeb-server는 인프라 자체이므로 GitHub Actions 미사용          │
│                                                                 │
│  배포 명령:                                                     │
│  ./scripts/deploy-all.sh [version]                             │
│                                                                 │
│  배포 대상:                                                     │
│  ├─ [1/5] 로컬 파일 버전 동기화                                │
│  ├─ [2/5] Git 커밋 & 푸시 (백업용)                             │
│  ├─ [3/5] API Server (Docker → Systemd)                        │
│  ├─ [4/5] CLI Package (tarball → Minio)                        │
│  └─ [5/5] SSOT Registry 업데이트                               │
│                                                                 │
│  주의: GitHub Actions 워크플로우 추가 금지!                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 수정 우선순위

| 순서 | 파일 | 수정 내용 | 심각도 |
|------|------|----------|--------|
| 1 | `scripts/deploy-all.sh` | 루트 package.json 동기화 추가 | 🟡 중간 |
| 2 | `cli/skills/we/quick.md` | domain_setup 단계 제거 | 🔴 높음 |
| 3 | `cli/skills/we/deploy.md` | GitHub Actions 확인 로직 추가 | 🔴 높음 |
| 4 | `cli/skills/we/init.md` | 워크플로우 생성 제안 추가 | 🟡 중간 |
| 5 | `mcp-server/src/tools/domain.ts` | 슬롯 없이도 동작하도록 수정 | 🟡 중간 |

---

## 관련 문서

- [deployment-guide.md](./deployment-guide.md) - 배포 가이드
- [DEPLOY-FLOW.md](./DEPLOY-FLOW.md) - 배포 플로우 상세
- [PRIVATE-REGISTRY.md](./PRIVATE-REGISTRY.md) - Private Registry 가이드
- [../CLAUDE.md](../CLAUDE.md) - Claude Code 규칙
