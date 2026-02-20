# WorkB 팀 Git 협업 가이드

## 핵심 규칙

> **main 브랜치에 직접 push 불가능 (브랜치 보호 규칙 적용됨)**
>
> 반드시 **feature 브랜치 -> PR -> Merge** 순서로 진행

---

## 작업 순서

### 1. 작업 전 - 최신 코드 받기

```bash
git checkout main
git pull
```

### 2. 내 브랜치 만들기

```bash
git checkout -b feature/내이름-작업내용

# 예시:
git checkout -b feature/철수-채팅UI수정
git checkout -b feature/영희-로그인버그
```

### 3. 코드 수정 후 커밋

```bash
git add .
git commit -m "[내이름] type: 작업 내용"

# 예시:
git commit -m "[철수] feat: 채팅 UI 다크모드 추가"
git commit -m "[영희] fix: 로그인 토큰 만료 버그 수정"
```

### 4. 푸시

```bash
git push -u origin feature/내이름-작업내용
```

### 5. GitHub에서 PR 생성 -> Merge

- GitHub 웹에서 **Pull Request** 생성
- 승인 필요 없음, 본인이 바로 **Merge** 가능

### 6. 머지 후 정리

```bash
git checkout main
git pull
git branch -d feature/내이름-작업내용
```

---

## 커밋 메시지 형식

```
[이름] type: 설명
```

### Type 목록

| Type | 설명 | 예시 |
|------|------|------|
| `feat` | 새 기능 추가 | `[철수] feat: 채팅 알림 기능` |
| `fix` | 버그 수정 | `[영희] fix: 이미지 업로드 오류` |
| `refactor` | 코드 정리 (기능 변화 없음) | `[민수] refactor: API 호출 통합` |
| `style` | UI/CSS 변경 | `[철수] style: 버튼 색상 변경` |
| `docs` | 문서 수정 | `[영희] docs: README 업데이트` |
| `chore` | 설정/빌드 변경 | `[민수] chore: 패키지 버전 업데이트` |
| `test` | 테스트 추가/수정 | `[철수] test: 로그인 테스트 추가` |

---

## 브랜치 이름 규칙

```
feature/이름-작업내용     # 새 기능
fix/이름-버그설명         # 버그 수정
refactor/이름-작업내용    # 리팩토링
```

---

## 요약 체크리스트

| 단계 | 명령어 |
|------|--------|
| 작업 시작 | `git checkout main && git pull` |
| 브랜치 생성 | `git checkout -b feature/이름-작업` |
| 커밋 | `git commit -m "[이름] type: 설명"` |
| 푸시 | `git push -u origin feature/이름-작업` |
| 배포 | GitHub에서 PR 생성 -> Merge |
| 정리 | `git checkout main && git pull && git branch -d feature/이름-작업` |

---

## Claude Code + MCP 설치 (전체 가이드)

### Step 1: Claude Code CLI 설치

```bash
npm install -g @anthropic-ai/claude-code
```

### Step 2: CodeB CLI + MCP 서버 설치

```bash
npm install -g @codeblabdev-max/we-cli
```

### Step 3: MCP 서버 등록

```bash
# 자동 등록 (권장)
claude mcp add codeb-deploy \
  --command node \
  --args "/opt/homebrew/lib/node_modules/@codeblabdev-max/we-cli/bin/codeb-mcp.js" \
  --env CODEB_API_URL=https://api.codeb.kr
```

또는 수동으로 `~/.claude/settings.json`에 추가:

```json
{
  "mcpServers": {
    "codeb-deploy": {
      "command": "node",
      "args": ["/opt/homebrew/lib/node_modules/@codeblabdev-max/we-cli/bin/codeb-mcp.js"],
      "env": {
        "CODEB_API_URL": "https://api.codeb.kr"
      }
    }
  }
}
```

### Step 4: API 키 설정

팀 리드에게 API 키를 발급받아 환경변수로 설정:

```bash
export CODEB_API_KEY=codeb_팀ID_역할_토큰

# 영구 설정 (zsh 기준)
echo 'export CODEB_API_KEY=codeb_팀ID_역할_토큰' >> ~/.zshrc
source ~/.zshrc
```

### Step 5: 설치 확인

```bash
cd your-project
claude              # Claude Code 실행
/we:health          # MCP 서버 연결 테스트
```

### 사용 가능한 명령어

```bash
# 배포
/we:deploy          # Blue-Green 배포 (git push 기반)
/we:promote myapp   # 트래픽 전환 (무중단)
/we:rollback myapp  # 즉시 롤백
/we:health          # 시스템 상태 확인

# 도메인
/we:domain setup myapp.codeb.kr

# 분석
/cb-analyze         # 코드 분석
/cb-optimize        # 최적화
```

### 문제 해결

| 증상 | 해결 |
|------|------|
| `MCP server not found` | Step 3 MCP 등록 재확인 |
| `Unauthorized` | API 키 확인 (`echo $CODEB_API_KEY`) |
| `command not found: claude` | `npm install -g @anthropic-ai/claude-code` 재설치 |
| MCP 도구 안 보임 | `claude` 재실행 또는 `/mcp` 명령으로 서버 상태 확인 |

---

## 충돌 해결

```bash
# PR에서 충돌이 발생한 경우
git checkout main
git pull
git checkout feature/내이름-작업내용
git merge main
# 충돌 파일 수정 후
git add .
git commit -m "[내이름] fix: merge conflict 해결"
git push
```

---

## 문의

- 문제 발생 시 팀 슬랙/디스코드 채널에 질문
- Git 관련 문제는 `git status`와 `git log --oneline -5` 결과를 함께 공유
