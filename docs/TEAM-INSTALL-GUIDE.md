# CodeB v8.0 - 팀원 설치 가이드

> 팀원이 CodeB CLI와 MCP를 설치하고 Claude Code에서 사용하는 방법

> **문서 버전**: 8.0.0
> **최종 업데이트**: 2026-02-06

---

## 목차

1. [사전 요구사항](#1-사전-요구사항)
2. [CLI 설치](#2-cli-설치)
3. [설치 확인](#3-설치-확인)
4. [Claude Code 재시작](#4-claude-code-재시작)
5. [MCP 연결 테스트](#5-mcp-연결-테스트)
6. [트러블슈팅](#6-트러블슈팅)

---

## 1. 사전 요구사항

### 1.1 필수 소프트웨어

```bash
# Node.js 18 이상
node --version  # v18.0.0 이상

# npm 9 이상
npm --version   # 9.0.0 이상

# Claude Code CLI
claude --version  # 설치 확인
```

### 1.2 API Key

팀 관리자에게 API Key를 발급받으세요:

```
형식: codeb_{teamId}_{role}_{randomToken}
예시: codeb_myteam_member_a1b2c3d4e5f6...
```

---

## 2. CLI 설치

### 2.1 One-Line 설치 (권장)

```bash
# API Key와 함께 설치
curl -fsSL https://releases.codeb.kr/cli/install.sh | bash -s -- YOUR_API_KEY
```

### 2.2 API Key 없이 설치 후 나중에 설정

```bash
# 먼저 설치
curl -fsSL https://releases.codeb.kr/cli/install.sh | bash

# 나중에 API Key 설정
claude mcp remove codeb-deploy -s user 2>/dev/null
claude mcp add codeb-deploy -s user \
  -e CODEB_API_URL=https://api.codeb.kr \
  -e CODEB_API_KEY=YOUR_API_KEY \
  -- node ~/.codeb/src/mcp/index.js
```

### 2.3 설치되는 항목

```
설치 완료 시 구조:

~/.codeb/                      # CLI 패키지
├── bin/we.js                  # we 명령어
├── src/mcp/index.js           # MCP Proxy 서버
└── config.json                # API Key 저장

~/.claude/                     # Claude Code 설정
├── CLAUDE.md                  # 글로벌 규칙
├── commands/we/               # we 명령어
├── skills/we/                 # Skills 시스템
└── settings.json              # MCP 서버 설정 (codeb-deploy)
```

---

## 3. 설치 확인

### 3.1 CLI 버전 확인

```bash
# we 명령어 확인
we --version
# 또는
cat ~/.codeb/VERSION
```

### 3.2 MCP 설정 확인

```bash
# MCP 서버 목록 확인
claude mcp list

# codeb-deploy가 있어야 함:
# codeb-deploy: node ~/.codeb/src/mcp/index.js - ✓ Connected
```

### 3.3 API Key 확인

```bash
cat ~/.codeb/config.json
# apiKey 필드가 있어야 함
```

---

## 4. Claude Code 재시작

**중요**: 설치 후 Claude Code를 반드시 재시작해야 MCP가 연결됩니다.

### 4.1 터미널에서 재시작

```bash
# Claude Code 종료 후 재시작
# macOS
pkill -f "claude" && claude

# 또는 새 터미널 열고
claude
```

### 4.2 VSCode에서

1. Command Palette 열기 (`Cmd+Shift+P`)
2. "Developer: Reload Window" 실행

---

## 5. MCP 연결 테스트

### 5.1 Claude Code에서 확인

```bash
# Claude Code 실행 후
/mcp

# codeb-deploy가 Connected로 표시되어야 함
```

### 5.2 헬스체크

```bash
# Claude Code에서 실행
/we:health

# 또는 직접 MCP 도구 호출
mcp__codeb-deploy__health_check
```

### 5.3 예상 결과

```
✅ App Server (158.247.203.55): healthy
✅ Storage Server (64.176.226.119): healthy
✅ Streaming Server (141.164.42.213): healthy
✅ Backup Server (141.164.37.63): healthy
```

---

## 6. 트러블슈팅

### 6.1 MCP가 연결되지 않음

```bash
# 1. MCP 설정 확인
cat ~/.claude/settings.json | jq '.mcpServers["codeb-deploy"]'

# 2. MCP 스크립트 존재 확인
ls -la ~/.codeb/src/mcp/index.js

# 3. 수동으로 MCP 재등록
claude mcp remove codeb-deploy -s user
claude mcp add codeb-deploy -s user \
  -e CODEB_API_URL=https://api.codeb.kr \
  -e CODEB_API_KEY=YOUR_API_KEY \
  -- node ~/.codeb/src/mcp/index.js

# 4. Claude Code 재시작
```

### 6.2 API Key 오류

```bash
# 1. config.json 확인
cat ~/.codeb/config.json

# 2. API Key 재설정
cat > ~/.codeb/config.json << EOF
{
  "apiKey": "YOUR_API_KEY",
  "apiUrl": "https://api.codeb.kr",
  "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# 3. MCP 환경변수에도 추가
claude mcp remove codeb-deploy -s user
claude mcp add codeb-deploy -s user \
  -e CODEB_API_URL=https://api.codeb.kr \
  -e CODEB_API_KEY=YOUR_API_KEY \
  -- node ~/.codeb/src/mcp/index.js
```

### 6.3 we 명령어가 없음

```bash
# PATH 확인
echo $PATH | grep -E "\.local/bin|homebrew/bin"

# PATH에 추가 (zsh)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# PATH에 추가 (bash)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### 6.4 Node.js 버전 문제

```bash
# 버전 확인
node --version

# 18 미만이면 업그레이드
# macOS (Homebrew)
brew install node@20

# nvm 사용
nvm install 20
nvm use 20
```

### 6.5 재설치

```bash
# 완전 삭제 후 재설치
rm -rf ~/.codeb
claude mcp remove codeb-deploy -s user 2>/dev/null

# 재설치
curl -fsSL https://releases.codeb.kr/cli/install.sh | bash -s -- YOUR_API_KEY
```

---

## 7. 사용 가능한 명령어

설치 완료 후 Claude Code에서 사용할 수 있는 명령어:

| 명령어 | 설명 |
|--------|------|
| `/we:health` | 시스템 헬스체크 |
| `/we:init` | 신규 프로젝트 초기화 |
| `/we:deploy` | Blue-Green 배포 |
| `/we:promote` | 트래픽 전환 |
| `/we:rollback` | 즉시 롤백 |
| `/we:domain` | 도메인 관리 |

---

## 관련 문서

- [SKILLS-GUIDE.md](./SKILLS-GUIDE.md) - Skills 사용 가이드
- [deployment-guide.md](./deployment-guide.md) - 배포 가이드
- [API-REFERENCE.md](./API-REFERENCE.md) - MCP API 도구 문서
- [KNOWN-ISSUES.md](./KNOWN-ISSUES.md) - 알려진 문제점
