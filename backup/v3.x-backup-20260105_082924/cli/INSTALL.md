# we-cli 설치 가이드

## 원라인 설치 (권장)

```bash
curl -fsSL https://raw.githubusercontent.com/codeblabdev-max/codeb-server/main/install.sh | bash
```

## 수동 설치

```bash
# 1. 패키지 다운로드
npm pack github:codeblabdev-max/codeb-server

# 2. 전역 설치
npm install -g we-cli-*.tgz

# 3. 정리
rm we-cli-*.tgz
```

## 자동으로 설치되는 항목

npm install 실행 시 다음이 자동으로 설치됩니다:

### 1. CLI 명령어 (`we`)
```bash
we workflow init <project>  # 프로젝트 초기화
we deploy <project>         # 배포
we health                   # 시스템 상태 점검
we domain                   # 도메인 관리
we ssot                     # SSOT 관리
```

### 2. Claude Code 슬래시 명령어
```
/we:init      - 프로젝트 초기화
/we:deploy    - 프로젝트 배포
/we:analyze   - 프로젝트 분석
/we:workflow  - CI/CD 워크플로우 생성
/we:health    - 시스템 상태 점검
/we:domain    - 도메인 관리
/we:rollback  - 배포 롤백
/we:monitor   - 실시간 모니터링
/we:ssh       - SSH 키 관리
/we:agent     - 7-Agent 직접 호출
/we:optimize  - 프로젝트 최적화
```
위치: `~/.claude/commands/we/`

### 3. MCP Server (codeb-deploy)
Claude Code에서 자동으로 사용 가능한 MCP 서버:
- 배포 자동화
- 포트/도메인 관리
- 서버 모니터링
- 보안 스캔

위치: `~/.claude.json` (mcpServers 섹션)

### 4. 규칙 파일
Claude Code가 따라야 하는 배포 규칙:
- `CLAUDE.md` - 프로젝트 기본 규칙
- `DEPLOYMENT_RULES.md` - AI 배포 규칙 (에러 우회 금지 등)

위치: `~/.claude/`

### 5. Hooks
위험한 명령어를 자동 차단하는 보안 훅:
- `pre-bash.py` - 위험 명령어 차단

위치: `~/.claude/hooks/`

### 6. Settings
SSH 권한 및 훅 설정:
- 허용된 서버 목록
- 훅 활성화 설정

위치: `~/.claude/settings.json`

## 설치 확인

```bash
# CLI 버전 확인
we --version

# Claude Code에서 확인
/we:health
```

## 업데이트

```bash
# 최신 버전 재설치
curl -fsSL https://raw.githubusercontent.com/codeblabdev-max/codeb-server/main/install.sh | bash
```

## 삭제

```bash
npm uninstall -g we-cli

# 설정 파일 수동 삭제 (선택)
rm -rf ~/.claude/commands/we/
rm ~/.claude/CLAUDE.md
rm ~/.claude/DEPLOYMENT_RULES.md
rm ~/.claude/hooks/pre-bash.py
```

## 문제 해결

### MCP 서버 연결 실패
```bash
# Claude Code 재시작
# 또는 ~/.claude.json 확인
cat ~/.claude.json | grep -A 10 codeb-deploy
```

### 권한 오류
```bash
# 전역 설치 권한 문제
sudo npm install -g github:codeblabdev-max/codeb-server

# 또는 npm prefix 변경
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

### postinstall 스크립트 실행 안됨
```bash
# 수동으로 설치 스크립트 실행
cd $(npm root -g)/we-cli
node scripts/install-commands.js
```
