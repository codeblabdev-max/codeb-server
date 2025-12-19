# CodeB Deploy System - 설치 가이드

## 목차
1. [시스템 요구사항](#시스템-요구사항)
2. [MCP 서버 설치](#mcp-서버-설치)
3. [서버 환경 설정](#서버-환경-설정)
4. [Claude Code 연동](#claude-code-연동)
5. [환경 변수 설정](#환경-변수-설정)

---

## 시스템 요구사항

### 개발 환경 (로컬)
- **Node.js**: v18.0.0 이상
- **npm**: v9.0.0 이상
- **Claude Code**: 최신 버전
- **SSH 키**: 서버 접속용 키 페어

### 서버 환경
- **OS**: Ubuntu 22.04 LTS 권장
- **메모리**: 최소 4GB (권장 8GB 이상)
- **디스크**: 최소 50GB
- **Podman**: v3.4 이상
- **네트워크**: 포트 접근 가능 (3000-5999, 9090, 9093, 3000)

---

## MCP 서버 설치

### 1. 소스 코드 클론

```bash
# 프로젝트 디렉토리 이동
cd /path/to/codeb-deploy-system

# 의존성 설치
cd mcp-server
npm install
```

### 2. TypeScript 빌드

```bash
# 빌드 실행
npm run build

# 빌드 확인
ls -la dist/
# 출력: index.js, tools/, lib/ 등
```

### 3. 빌드 스크립트 (package.json)

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch"
  }
}
```

---

## 서버 환경 설정

### 1. GitHub Self-hosted Runner 설치

```bash
# 서버에서 실행
sudo ./server-scripts/setup-runner.sh \
  --owner YOUR_GITHUB_ORG \
  --repo YOUR_REPO_NAME \
  --token YOUR_RUNNER_TOKEN

# 토큰 발급: GitHub Repo > Settings > Actions > Runners > New self-hosted runner
```

**설치 확인:**
```bash
systemctl status actions-runner
# Active: active (running) 확인
```

### 2. 컨테이너 레지스트리 설치

```bash
# 서버에서 실행
sudo ./server-scripts/setup-registry.sh

# 설치 확인
curl http://localhost:5000/v2/_catalog
# 출력: {"repositories":[]}
```

### 3. 모니터링 스택 설치

```bash
# 서버에서 실행
sudo ./server-scripts/setup-monitoring.sh

# 서비스 확인
systemctl status prometheus
systemctl status grafana-server
systemctl status alertmanager
systemctl status node_exporter
```

**접속 URL:**
- Prometheus: `http://YOUR_SERVER:9090`
- Grafana: `http://YOUR_SERVER:3000` (기본 계정: admin/admin)
- Alertmanager: `http://YOUR_SERVER:9093`

---

## Claude Code 연동

### 1. MCP 설정 파일 생성

프로젝트 루트에 `.mcp.json` 파일 생성:

```json
{
  "mcpServers": {
    "codeb-deploy": {
      "command": "node",
      "args": ["/absolute/path/to/codeb-deploy-system/mcp-server/dist/index.js"],
      "env": {
        "CODEB_SERVER_HOST": "YOUR_SERVER_IP",
        "CODEB_SERVER_USER": "root",
        "CODEB_SSH_KEY_PATH": "~/.ssh/id_rsa"
      }
    }
  }
}
```

### 2. SSH 키 설정

```bash
# SSH 키 생성 (없는 경우)
ssh-keygen -t rsa -b 4096 -C "codeb-deploy"

# 서버에 공개키 복사
ssh-copy-id -i ~/.ssh/id_rsa.pub root@YOUR_SERVER_IP

# 연결 테스트
ssh -i ~/.ssh/id_rsa root@YOUR_SERVER_IP "echo 'Connection successful'"
```

### 3. Claude Code 재시작

MCP 서버 인식을 위해 Claude Code 재시작:
- VSCode: Command Palette → "Claude: Restart Claude Code"
- CLI: claude code 명령 재실행

---

## 환경 변수 설정

### 필수 환경 변수

```bash
# 서버 연결 (필수)
CODEB_SERVER_HOST=141.164.60.51      # 서버 IP
CODEB_SERVER_USER=root                # SSH 사용자
CODEB_SSH_KEY_PATH=~/.ssh/id_rsa     # SSH 키 경로
```

### 알림 환경 변수 (선택)

```bash
# Slack 알림
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx

# PagerDuty 알림
PAGERDUTY_ROUTING_KEY=your_routing_key

# 이메일 알림 (SendGrid)
SENDGRID_API_KEY=SG.xxx
ALERT_EMAIL_TO=alerts@yourcompany.com
ALERT_EMAIL_FROM=noreply@yourcompany.com
```

### 레지스트리 환경 변수 (선택)

```bash
# 커스텀 레지스트리
REGISTRY_URL=localhost:5000
```

### 환경 변수 설정 방법

**방법 1: .mcp.json에 직접 설정**
```json
{
  "mcpServers": {
    "codeb-deploy": {
      "env": {
        "CODEB_SERVER_HOST": "141.164.60.51",
        "SLACK_WEBHOOK_URL": "https://hooks.slack.com/..."
      }
    }
  }
}
```

**방법 2: 시스템 환경 변수**
```bash
# ~/.bashrc 또는 ~/.zshrc에 추가
export CODEB_SERVER_HOST=141.164.60.51
export SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

---

## 설치 확인

### 1. MCP 서버 동작 확인

Claude Code에서 다음 명령 실행:
```
"서버 상태 분석해줘"
```

성공 시 서버 시스템 정보, 컨테이너 목록, 포트 상태 등이 표시됩니다.

### 2. 전체 시스템 체크리스트

| 항목 | 확인 방법 | 정상 상태 |
|------|----------|----------|
| MCP 서버 | Claude Code에서 도구 호출 | 응답 수신 |
| SSH 연결 | `ssh root@SERVER` | 로그인 성공 |
| Runner | `systemctl status actions-runner` | active (running) |
| Registry | `curl localhost:5000/v2/` | HTTP 200 |
| Prometheus | `curl localhost:9090/-/healthy` | Healthy |
| Grafana | 브라우저에서 3000 포트 접속 | 로그인 화면 |

---

## 문제 해결

### MCP 서버가 인식되지 않음
1. `.mcp.json` 경로 확인 (절대 경로 사용)
2. 빌드 완료 확인 (`dist/index.js` 존재)
3. Claude Code 재시작

### SSH 연결 실패
1. SSH 키 권한 확인: `chmod 600 ~/.ssh/id_rsa`
2. 서버 SSH 설정 확인: `/etc/ssh/sshd_config`
3. 방화벽 확인: `ufw status`

### Runner 연결 안됨
1. 토큰 만료 확인 (토큰은 1시간 유효)
2. GitHub에서 새 토큰 발급 후 재설정
3. 서비스 재시작: `systemctl restart actions-runner`

---

## 다음 단계

설치가 완료되면 다음 가이드를 참조하세요:
- [MCP 도구 레퍼런스](02-MCP-TOOLS-REFERENCE.md)
- [배포 전략 가이드](03-DEPLOYMENT-STRATEGIES.md)
- [모니터링 및 알림 가이드](04-MONITORING-ALERTING.md)
