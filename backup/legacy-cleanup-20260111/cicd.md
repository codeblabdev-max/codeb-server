# AI 자동 빌드 에러 수정 — 현실적인 방법과 실제 사례

## 핵심 답변

> **현실적인 방법 3가지 존재**
> 1. GitHub Copilot Coding Agent (가장 쉬움)
> 2. Claude Code Action (가장 강력)
> 3. Self-hosted + Claude Code CLI (가장 유연)

---

## 실제 해외 개발자 사례들

### 사례 1: Lasse (데이터 엔지니어, KLM/Vattenfall)

CI가 실패하면 워크플로우가 자동으로 상세한 이슈를 생성하고 Copilot의 코딩 에이전트에게 할당한다. Copilot이 실패를 분석하고 수정 제안이 담긴 PR을 생성하는데, 의존성 업데이트, 린팅 에러, 설정 문제 같은 일반적인 이슈들을 자주 해결한다.

```
결과: CI가 오전 9시에 실패 → Copilot이 9시 5분에 수정 생성
     → 커피 마시면서 폰으로 리뷰 & 머지
```

### 사례 2: Chris Dzombak (개인 프로젝트)

GitHub MCP 서버를 Claude Code에 설치한 후, 이런 프롬프트를 작성하면 된다: "CI is failing on main. Figure out why, fix it, commit & push, and monitor to be sure your fix worked." Claude Code가 실패한 워크플로우를 확인하고 무엇이 실패하는지 상세 정보를 가져온다.

```
프롬프트 하나로:
1. CI 실패 원인 분석
2. 코드 수정
3. 커밋 & 푸시
4. CI 결과 모니터링
5. 또 실패하면 다시 수정 시도
```

### 사례 3: Simon Willison (Django 핵심 개발자)

GitHub 레포에 자동 업데이트되는 README 인덱스 기능을 추가하고 싶어서 Claude Code를 사용해 GitHub Actions 워크플로우를 빌드하는 과정을 녹화했다.

---

## 방법 1: GitHub Copilot Coding Agent

### 작동 방식

```
┌─────────────────────────────────────────────────────────────┐
│                 Copilot Coding Agent 흐름                   │
│                                                             │
│   CI 실패                                                   │
│      │                                                      │
│      ▼                                                      │
│   워크플로우가 자동으로 Issue 생성                            │
│      │                                                      │
│      ▼                                                      │
│   Issue를 Copilot에게 할당 (assignees: copilot)             │
│      │                                                      │
│      ▼                                                      │
│   Copilot이 클라우드에서 환경 생성                           │
│      │                                                      │
│      ▼                                                      │
│   에러 분석 → 수정 → PR 생성                                 │
│      │                                                      │
│      ▼                                                      │
│   개발자가 리뷰 & 머지                                       │
└─────────────────────────────────────────────────────────────┘
```

### 장단점

| 장점 | 단점 |
|------|------|
| 설정 가장 쉬움 | Copilot Pro/Business 필요 |
| GitHub 네이티브 통합 | 월 1.2M PR 처리 중 (검증됨) |
| 보안 검증됨 | Premium 요청 제한 있음 |

### 현실적 한계

이것들은 VSCode와 Github.com의 Copilot 간에 공유되므로, Claude Sonnet 4 같은 "Premium" 모델 호출은 모두 프리미엄 요청으로 계산된다(일부는 배수 적용). 따라서 레포지토리에 코딩 에이전트를 설정할 때 이를 인지해야 한다.

---

## 방법 2: Claude Code GitHub Action (추천)

### 공식 Action

PR이나 이슈에서 간단히 @claude를 멘션하면, Claude가 코드를 분석하고, PR을 생성하고, 기능을 구현하고, 버그를 수정할 수 있다 — 모두 프로젝트의 정의된 표준을 따르면서.

### 설치 방법 (가장 쉬운 방법)

```bash
# 터미널에서 Claude Code 열고
claude

# 명령어 실행
/install-github-app
```

이 액션을 설정하는 가장 쉬운 방법은 터미널에서 Claude Code를 통하는 것이다. claude를 열고 /install-github-app을 실행하면 된다. 이 명령어가 GitHub 앱과 필요한 시크릿 설정을 안내해준다.

### CI 실패 자동 수정 워크플로우

```yaml
# .github/workflows/auto-fix-ci.yml
name: Auto Fix CI Failures

on:
  workflow_run:
    workflows: ["CI"]  # CI 워크플로우 이름
    types: [completed]

jobs:
  auto-fix:
    # CI가 실패했을 때만 실행
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}
    runs-on: ubuntu-latest
    
    permissions:
      contents: write
      pull-requests: write
      issues: write
      actions: read
    
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_branch }}
      
      # 실패 로그 가져오기
      - name: Get CI Failure Logs
        id: logs
        uses: actions/github-script@v7
        with:
          script: |
            const logs = await github.rest.actions.downloadWorkflowRunLogs({
              owner: context.repo.owner,
              repo: context.repo.repo,
              run_id: ${{ github.event.workflow_run.id }}
            });
            return logs.data;
      
      # Claude Code로 수정
      - name: Fix CI with Claude
        uses: anthropics/claude-code-action@v1
        with:
          prompt: |
            CI 빌드가 다음 에러로 실패했습니다:
            
            ${{ steps.logs.outputs.result }}
            
            빌드 실패를 일으키는 문제를 수정해주세요.
            테스트 실패, 린팅 에러, 타입 에러에 집중해주세요.
            
            수정 후:
            1. 로컬에서 빌드 테스트
            2. 문제가 해결되면 커밋
            3. 해결 안 되면 분석 결과만 코멘트로 남기기
          
          claude_args: "--max-turns 10"
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### 핵심 기능들

이 액션은 워크플로우 컨텍스트에 따라 활성화 시점을 지능적으로 감지한다 — @claude 멘션에 응답하든, 이슈 할당이든, 명시적 프롬프트로 자동화 작업을 실행하든. 직접 Anthropic API, Amazon Bedrock, Google Vertex AI, Microsoft Foundry를 포함한 여러 인증 방법을 지원한다.

---

## 방법 3: Self-hosted Runner + Claude Code CLI

### 너의 상황에 가장 적합

```
테스트 서버에 Runner 설치 → Claude Code CLI 실행 → 내부 네트워크 접근
```

### Headless 모드 활용

Claude는 기존 데이터/처리 파이프라인에 통합될 수 있다. 예를 들어, cat build-error.txt | claude -p 'concisely explain the root cause of this build error' > output.txt. JSON 출력은 더 쉬운 자동화 처리를 위한 구조화된 데이터를 제공한다.

### Self-hosted 워크플로우

```yaml
# .github/workflows/ai-auto-fix.yml
name: AI Auto Fix (Self-hosted)

on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]

jobs:
  auto-fix:
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}
    runs-on: self-hosted  # 테스트 서버의 Runner
    
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_branch }}
          fetch-depth: 0
      
      - name: Get Failure Logs
        id: get-logs
        run: |
          gh run view ${{ github.event.workflow_run.id }} --log-failed > build-error.txt
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Analyze and Fix with Claude Code
        run: |
          # Claude Code CLI로 에러 분석 및 수정
          claude -p "
            다음 빌드 에러 로그를 분석하고 수정해주세요:
            
            $(cat build-error.txt)
            
            단계:
            1. 에러 원인 파악
            2. 관련 파일 찾기
            3. 수정 적용
            4. pnpm build로 검증
            5. 성공하면 커밋
          " --allowedTools "Edit,View,Bash,Write"
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      
      - name: Verify Fix
        run: |
          pnpm install
          pnpm build
          pnpm test
      
      - name: Commit and Push Fix
        if: success()
        run: |
          git config user.name "Claude Auto-Fix"
          git config user.email "claude@example.com"
          git add -A
          git commit -m "fix: auto-fix CI failure by Claude"
          git push
```

---

## 방법 비교

| 항목 | Copilot Agent | Claude Code Action | Self-hosted + CLI |
|------|---------------|-------------------|-------------------|
| **설정 난이도** | 쉬움 | 중간 | 복잡 |
| **비용** | Copilot 구독 | API 사용량 | API 사용량 |
| **자유도** | 낮음 | 중간 | 높음 |
| **내부망 접근** | ❌ | ❌ | ✅ |
| **커스터마이징** | 제한적 | 좋음 | 완전 자유 |
| **실행 환경** | GitHub 클라우드 | GitHub Runner | 너의 서버 |

---

## 너의 상황에 추천

### 하이브리드 구성

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        추천 구성                                         │
│                                                                         │
│   1단계: GitHub-hosted (빌드/테스트)                                     │
│   ─────────────────────────────────────────────────────────────────    │
│   • Lint, Type Check, Unit Test                                        │
│   • 빠르고 안정적                                                        │
│   • 병렬 실행                                                           │
│                                                                         │
│   2단계: Claude Code Action (간단한 에러)                                │
│   ─────────────────────────────────────────────────────────────────    │
│   • TypeScript 에러                                                     │
│   • ESLint 에러                                                         │
│   • Import 문제                                                         │
│   • GitHub Runner에서 실행                                              │
│                                                                         │
│   3단계: Self-hosted Runner (복잡한 에러 + 배포)                         │
│   ─────────────────────────────────────────────────────────────────    │
│   • DB 연동 테스트 실패                                                  │
│   • 복잡한 빌드 에러                                                     │
│   • 프로덕션 배포                                                        │
│   • 내부 네트워크 필요한 작업                                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## CLAUDE.md 설정 (핵심!)

리포지토리 루트에 CLAUDE.md 파일을 생성하라. 이 특별한 파일은 자동으로 Claude의 컨텍스트에 포함되어, 코드 스타일 가이드라인, 테스트 지침, 핵심 파일, 유틸리티 함수, 리포지토리 에티켓을 문서화하기에 이상적이다. Claude는 CI/CD 파이프라인에서 실행될 때도 이 파일을 존중한다.

```markdown
# CLAUDE.md

## 프로젝트 개요
BliveCMS - 엔터프라이즈급 CMS 모노레포

## 기술 스택
- Next.js 16 (App Router, standalone 모드)
- TypeScript 5.x (strict 모드)
- pnpm workspace
- Prisma + PostgreSQL
- Redis

## 빌드 명령어
```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm type-check
```

## 코드 스타일
- ESLint + Prettier 설정 따르기
- 함수형 컴포넌트 사용
- Result 타입으로 에러 핸들링

## 빌드 에러 수정 시 주의사항
- package.json 의존성 변경 금지 (사람 확인 필요)
- DB 스키마 변경 금지
- 환경 변수 추가 금지
- 타입 에러는 any 사용 금지, 올바른 타입 정의

## 테스트
- 수정 후 반드시 pnpm build && pnpm test 실행
- 테스트 실패 시 테스트 코드 수정보다 소스 코드 수정 우선
```

---

## 비용 예측

### Claude API 사용량

```
일반적인 빌드 에러 수정 1회:
• Input: ~5,000 tokens (에러 로그 + 코드)
• Output: ~2,000 tokens (수정 코드)
• 비용: ~$0.02 (Sonnet 기준)

하루 10회 × 30일 = 월 $6 정도
```

### 비교

| 방법 | 월 예상 비용 |
|------|-------------|
| Copilot Pro | $19/user |
| Copilot Business | $39/user |
| Claude API (Self-hosted) | $5~20 (사용량 따라) |

---

## 실제 적용 순서

| 순서 | 작업 | 우선순위 |
|------|------|----------|
| 1 | CLAUDE.md 작성 | 높음 |
| 2 | Claude Code Action 설치 (/install-github-app) | 높음 |
| 3 | 기본 CI 워크플로우 작성 | 높음 |
| 4 | AI 자동 수정 워크플로우 추가 | 중간 |
| 5 | Self-hosted Runner 설정 (테스트 서버) | 중간 |
| 6 | 배포 자동화 연결 | 낮음 |

---

## 요약

| 질문 | 답변 |
|------|------|
| 가장 쉬운 방법? | Claude Code Action (/install-github-app) |
| 가장 유연한 방법? | Self-hosted + Claude Code CLI |
| 실제로 쓰는 사람 있어? | ✅ 많음 (KLM, Vattenfall 등 기업 사례) |
| 내 상황에 추천? | Claude Code Action + Self-hosted 하이브리드 |
| 비용? | API 기반으로 월 $5~20 수준 |

다음으로 실제 워크플로우 파일들을 만들어볼까요?