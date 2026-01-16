---
name: we:quick
description: "퀵", "quick", "원샷", "one-shot", "빠른 설정" 등의 요청 시 자동 활성화. 신규/기존 프로젝트 One-Shot 설정을 수행합니다.
---

# we:quick - One-Shot 프로젝트 설정

신규/기존 프로젝트를 한 번에 설정합니다.

## 활성화 키워드
- 퀵, quick, 원샷, one-shot
- 빠른 설정, 전체 설정
- 한번에 설정

## One-Shot 설정 흐름

```
헬스체크 → SSOT 등록 → 포트할당 → DB/Redis → ENV → 도메인
```

### 1단계: 시스템 헬스체크
```
mcp__codeb-deploy__health_check { "server": "all" }
```

### 2단계: 프로젝트 스캔 (SSOT 확인)
```
mcp__codeb-deploy__workflow_scan { "projectName": "프로젝트명" }
→ 이미 등록된 프로젝트인지 확인
→ 미등록 시 자동으로 3단계 진행
```

### 3단계: 인프라 초기화
```
mcp__codeb-deploy__workflow_init {
  "projectName": "프로젝트명",
  "type": "nextjs",
  "database": true,
  "redis": true
}
```
- 포트 자동 할당
- DB SSOT 등록
- Blue-Green 슬롯 생성

### 4단계: 도메인 설정
```
mcp__codeb-deploy__domain_setup {
  "projectName": "프로젝트명",
  "domain": "프로젝트명.codeb.kr",
  "environment": "production"
}
```
- PowerDNS A 레코드 자동 생성
- Caddy SSL 자동 발급

### 5단계: 배포
```
mcp__codeb-deploy__deploy_project {
  "projectName": "프로젝트명",
  "environment": "production"
}
```

## 관련 스킬
- `we:init` - 초기화만
- `we:deploy` - 배포만
- `we:domain` - 도메인만
