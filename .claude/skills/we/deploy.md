---
name: we:deploy
description: "배포", "deploy", "릴리즈", "프로덕션 올려" 등의 요청 시 자동 활성화. Git Push 기반 CI/CD 자동 배포를 수행합니다.
---

# we:deploy - Git Push 기반 Blue-Green 배포

## 활성화 키워드
- 배포, deploy, release
- 프로덕션에 올려, 서버에 올려
- 릴리즈, publish

## 배포 원칙 (중요)
- **배포 = git push**. MCP `deploy_project`를 직접 호출하지 않는다.
- git push → GitHub Actions가 자동으로 빌드 → 레지스트리 Push → MCP API 배포
- `we:deploy`의 역할은 커밋, 푸시, Actions 모니터링이다.

## 사용 도구
- `Bash(git)` - 커밋 & 푸시
- `Bash(gh)` - GitHub Actions 실행 상태 모니터링
- `mcp__codeb-deploy__slot_status` - 배포 결과 슬롯 확인
- `mcp__codeb-deploy__slot_promote` - 트래픽 전환 (선택)

## 배포 절차

### 1단계: 변경사항 확인
```bash
git status
git diff --stat HEAD
```
- 변경사항 없으면 배포할 것 없다고 안내
- 커밋되지 않은 변경이 있으면 커밋 먼저 진행

### 2단계: 커밋 & 푸시
```bash
git add <변경 파일들>
git commit -m "<커밋 메시지>"
git push origin main
```
- 커밋 메시지는 conventional commits 규칙 따름
- push하면 GitHub Actions 자동 트리거됨

### 3단계: GitHub Actions 모니터링
```bash
# 최신 workflow run 확인
gh run list --limit 3

# 진행 중인 run 실시간 확인
gh run watch <run-id>
```
- Actions가 완료될 때까지 상태 추적
- 실패 시 로그 확인하여 원인 보고

### 4단계: 배포 결과 확인
```
mcp__codeb-deploy__slot_status {
  "projectName": "프로젝트명",
  "environment": "production"
}
```
- 비활성 슬롯에 새 버전이 배포되었는지 확인
- Preview URL 안내

### 5단계: 트래픽 전환 (사용자 확인 후)
```
mcp__codeb-deploy__slot_promote {
  "projectName": "프로젝트명",
  "environment": "production"
}
```
- 사용자가 Preview URL 테스트 후 promote 요청 시 실행
- 자동 promote하지 않음

## CI/CD 파이프라인 구조
```
git push main
  → GitHub Actions (self-hosted runner)
  → Docker Buildx + Minio S3 캐시 (64.176.226.119:9000)
  → 이미지 Push → Private Registry (64.176.226.119:5000)
  → MCP API deploy (커밋 SHA 태그로 배포)
  → Preview URL 반환
```

## 프로젝트별 워크플로우 트리거 경로
- 워크플로우의 `paths` 필드를 확인해서 해당 경로의 변경만 트리거됨
- 예: `apps/web/**` 변경 시에만 빌드 & 배포 실행

## 주의사항
- **`deploy_project` MCP를 직접 호출하면 안 됨** (이전 이미지로 배포됨)
- workflow_dispatch로 수동 트리거도 가능: `gh workflow run <workflow> -f action=deploy`
- force build 필요 시: `gh workflow run <workflow> -f action=deploy -f force_build=true`

## Blue-Green 슬롯 상태
```
┌──────────┐  deploy   ┌──────────┐  promote  ┌──────────┐
│  empty   │ ───────→  │ deployed │ ────────→ │  active  │
└──────────┘           └──────────┘           └──────────┘
                                                   │
                                                   │ promote (다른 슬롯)
                                                   ▼
                                             ┌──────────┐
                                             │  grace   │
                                             │ (48시간) │
                                             └──────────┘
```

## 관련 스킬
- `we:promote` - 트래픽 전환 (MCP 직접 호출 OK)
- `we:rollback` - 즉시 롤백 (MCP 직접 호출 OK)
- `we:health` - 배포 후 상태 확인
- `we:workflow` - CI/CD 워크플로우 생성/수정
