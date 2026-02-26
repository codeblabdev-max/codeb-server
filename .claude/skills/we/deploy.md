---
name: we:deploy
description: "배포", "deploy", "릴리즈", "프로덕션 올려" 등의 요청 시 자동 활성화. Blue-Green 무중단 배포를 수행합니다.
---

# we:deploy - Blue-Green 무중단 배포

## 활성화 키워드
- 배포, deploy, release
- 프로덕션에 올려, 서버에 올려
- 릴리즈, publish

## 사용 도구
- `mcp__codeb-deploy__deploy_project` - 비활성 슬롯에 배포
- `mcp__codeb-deploy__slot_promote` - 트래픽 전환
- `mcp__codeb-deploy__slot_status` - 슬롯 상태 확인

## 배포 절차

### 1단계: 프로젝트 정보 확인
```
Read: package.json
→ name 필드에서 프로젝트명 추출
```

### 2단계: DB SSOT 확인
```
mcp__codeb-deploy__workflow_scan { "projectName": "프로젝트명" }
→ 프로젝트가 등록되어 있는지 확인
→ 미등록 시 we:init 먼저 실행
```

### 3단계: Blue-Green 배포 실행
```
mcp__codeb-deploy__deploy_project {
  "projectName": "프로젝트명",
  "environment": "production"
}
```
- 비활성 슬롯(blue/green)에 Docker 컨테이너 배포
- Preview URL 반환

### 4단계: 트래픽 전환 (선택)
```
mcp__codeb-deploy__slot_promote {
  "projectName": "프로젝트명",
  "environment": "production"
}
```
- Caddy 설정 변경으로 무중단 전환
- 이전 슬롯은 grace 상태 (48시간 유지)

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
- `we:rollback` - 즉시 롤백
- `we:health` - 배포 후 상태 확인
- `we:domain` - 도메인 연결
