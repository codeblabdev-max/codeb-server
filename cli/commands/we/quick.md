---
allowed-tools: [Read, Write, Edit, Bash, Glob, TodoWrite, mcp__codeb-deploy__health_check, mcp__codeb-deploy__workflow_init, mcp__codeb-deploy__deploy_project, mcp__codeb-deploy__domain_setup]
description: "신규/기존 프로젝트 One-Shot 설정 (헬스체크 → SSOT 등록 → 포트할당 → DB/Redis → ENV → 도메인)"
---

# /we:quick - Quick Mode 프로젝트 설정 (v7.0.59)

## 목적
신규 또는 기존 프로젝트를 **한 번에** 설정합니다.
질문을 최소화하고, 서버에서 자동으로 모든 인프라를 구성합니다.

## 핵심 규칙
- **모든 응답은 한글로 작성**
- **질문 없이 바로 서버 작업 실행** (기본값 사용)
- **실패 시 명확한 에러 메시지 제공**

---

## 실행 흐름 (One-Shot)

### 1단계: 프로젝트 정보 확인

```
Read 도구로 package.json 확인:
file_path: package.json
→ name 필드에서 프로젝트명 추출
→ 없으면 현재 디렉토리명 사용
```

### 2단계: 헬스체크 (서버 연결 확인)

```
mcp__codeb-deploy__health_check
{
  "server": "all"
}
```

**실패 시**: API 키 확인 요청 또는 서버 상태 안내

### 3단계: 서버 인프라 초기화 (One-Shot)

`workflow_init`이 자동으로 수행하는 작업:
1. DB에서 포트 할당 (4100-4499 범위)
2. Storage 서버: PostgreSQL DB/User 생성
3. Storage 서버: Redis DB 번호 할당
4. SSOT DB에 프로젝트 등록
5. DB에 슬롯 레지스트리 생성
6. App 서버: ENV 파일 생성
7. App 서버: Caddy 도메인 설정
8. PowerDNS A 레코드 추가

```
mcp__codeb-deploy__workflow_init
{
  "projectName": "<프로젝트명>",
  "type": "nextjs",
  "database": true,
  "redis": true
}
```

### 4단계: 로컬 파일 생성

workflow_init 응답에서 받은 템플릿으로 로컬 파일 생성:

```
Write 도구로 GitHub Actions 워크플로우 생성:
file_path: .github/workflows/deploy.yml
content: <githubActionsWorkflow 응답값>

Write 도구로 Dockerfile 생성 (없으면):
file_path: Dockerfile
content: <dockerfile 응답값>
```

### 5단계: 결과 요약 출력

```
✅ 프로젝트 초기화 완료!

📊 할당된 리소스:
   포트: Blue=4100, Green=4101
   DB: myapp_db (myapp_user@db.codeb.kr)
   Redis: DB 1
   도메인: myapp.codeb.kr

📁 생성된 파일:
   ├── .github/workflows/deploy.yml
   └── Dockerfile

🔑 GitHub Secrets 설정 필요:
   - CODEB_API_KEY: CodeB API 키

🚀 다음 단계:
   1. git add . && git commit -m "feat: add deployment config"
   2. git push origin main  (자동 배포)
   3. we promote myapp  (트래픽 전환)
```

---

## 사용 예시

```bash
/we:quick              # 현재 디렉토리에서 바로 실행
/we:quick myapp        # 특정 프로젝트명으로 실행
```

### 실행 화면 예시

```
🚀 CodeB Quick Mode - 프로젝트 초기화

📦 프로젝트: myapp (package.json에서 감지)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1/4] 서버 헬스체크...
   ✅ App Server (api.codeb.kr): 정상
   ✅ Storage Server (db.codeb.kr): 정상
   ✅ Streaming Server (ws.codeb.kr): 정상

[2/4] 인프라 초기화 중...
   ✅ 포트 할당: Blue=4100, Green=4101
   ✅ PostgreSQL DB 생성: myapp_db
   ✅ Redis DB 할당: 1
   ✅ SSOT 레지스트리 등록
   ✅ ENV 파일 생성
   ✅ Caddy 도메인 설정

[3/4] 로컬 파일 생성...
   ✅ .github/workflows/deploy.yml
   ✅ Dockerfile

[4/4] 완료!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 프로젝트 초기화 완료!

도메인: https://myapp.codeb.kr

다음 단계:
  1. GitHub Secrets에 CODEB_API_KEY 추가
  2. git push origin main (자동 배포)
  3. /we:deploy promote myapp (트래픽 전환)
```

---

## 기본값

| 항목 | 기본값 | 설명 |
|------|--------|------|
| type | nextjs | 프로젝트 타입 |
| database | true | PostgreSQL 생성 |
| redis | true | Redis DB 할당 |
| environment | production | Blue-Green만 사용 |
| domain | {projectName}.codeb.kr | 서브도메인 |

---

## 에러 처리

### API 키 오류
```
❌ API Key not configured

해결 방법:
1. .env 파일에 CODEB_API_KEY 추가
2. 또는: we init <YOUR_API_KEY>
```

### 프로젝트 중복
```
❌ Project 'myapp' already exists

해결 방법:
- /we:deploy myapp  (기존 프로젝트 배포)
- 다른 프로젝트명 사용
```

### 서버 연결 실패
```
❌ Cannot connect to CodeB servers

해결 방법:
1. 인터넷 연결 확인
2. API 키 유효성 확인
3. /we:health 로 상세 상태 확인
```

---

## 관련 명령어

- `/we:deploy` - 프로젝트 배포
- `/we:init` - API 키 설정만
- `/we:workflow` - CI/CD만 설정
- `/we:domain` - 도메인만 설정
- `/we:health` - 서버 상태 확인
