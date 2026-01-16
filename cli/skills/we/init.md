---
name: we:init
description: "초기화", "init", "새 프로젝트", "프로젝트 설정" 등의 요청 시 자동 활성화. 신규 프로젝트 서버 인프라를 초기화합니다.
---

# we:init - 신규 프로젝트 초기화

## 활성화 키워드
- 초기화, init, initialize
- 새 프로젝트, new project
- 프로젝트 설정, 인프라 생성

## 사용 도구
- `mcp__codeb-deploy__workflow_init` - 서버 인프라 초기화
- `mcp__codeb-deploy__workflow_scan` - 기존 설정 스캔
- `mcp__codeb-deploy__health_check` - 시스템 상태 확인

## 초기화 절차

### 1단계: API 키 확인
```
Read: .env
→ CODEB_API_KEY=codeb_xxx 확인
→ 없으면 사용자에게 API 키 요청
```

### 2단계: 프로젝트 정보 확인
```
Read: package.json
→ name 필드에서 프로젝트명 추출
```

### 3단계: DB SSOT 확인
```
mcp__codeb-deploy__workflow_scan { "projectName": "프로젝트명" }
→ 이미 등록된 프로젝트인지 확인
→ 미등록 시 팀 프로젝트 목록 제공
```

### 4단계: 서버 인프라 초기화
```
mcp__codeb-deploy__workflow_init {
  "projectName": "프로젝트명",
  "type": "nextjs",
  "database": true,
  "redis": true
}
```

## 생성되는 리소스
- DB SSOT 등록 (projects 테이블)
- Blue-Green 슬롯 (blue/green)
- 포트 자동 할당 (3001~9999)
- 환경변수 파일 (.env)
- Caddy 리버스 프록시 설정

## API 키 우선순위
1. 프로젝트 `.env` 파일 (CODEB_API_KEY)
2. 환경변수 `CODEB_API_KEY`
3. `~/.codeb/config.json`

## 관련 스킬
- `we:deploy` - 프로젝트 배포
- `we:workflow` - CI/CD 워크플로우
- `we:quick` - One-Shot 설정
