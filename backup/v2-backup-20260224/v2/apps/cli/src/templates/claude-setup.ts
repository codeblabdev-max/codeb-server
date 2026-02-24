/**
 * Claude Code Setup Template Generator
 *
 * 두 가지 용도:
 *
 * A. `we init` (프로젝트별):
 *    - CLAUDE.md만 생성 (프로젝트명, 버전 커스터마이즈)
 *    - API 키는 ~/.codeb/config.json에 저장 (init.cmd.ts에서 처리)
 *
 * B. install.sh (전역 설치):
 *    - ~/.claude/skills/we-{name}/SKILL.md (7개 스킬)
 *    - ~/.claude/hooks/pre-bash.py (위험 명령 차단 훅)
 *    - ~/.claude/settings.json (MCP 서버 + 권한 + 훅 병합)
 *    - MCP 서버 등록 (codeb-deploy)
 *
 * 핵심 원칙:
 * - install.sh 한 번 실행하면 모든 프로젝트에서 스킬/MCP/훅 사용 가능
 * - we init은 프로젝트별 CLAUDE.md + API 키 설정만
 * - 프로젝트 repo에는 CLAUDE.md만 커밋 (스킬/MCP/훅은 전역)
 */

// ============================================================================
// Types
// ============================================================================

export interface ClaudeSetupParams {
  projectName: string;
  apiKey: string;
  apiUrl: string;
  version: string;
}

export interface GeneratedFile {
  /** 상대 경로 (프로젝트 또는 전역 기준) */
  path: string;
  content: string;
}

export interface ClaudeSetupResult {
  files: GeneratedFile[];
  directories: string[];
}

// ============================================================================
// A. Project Setup (we init) — CLAUDE.md만 생성
// ============================================================================

export function generateClaudeSetup(params: ClaudeSetupParams): ClaudeSetupResult {
  const { projectName, version } = params;

  return {
    directories: [],
    files: [
      { path: 'CLAUDE.md', content: generateClaudeMd(projectName, version) },
    ],
  };
}

// ============================================================================
// B. Global Install (install.sh) — 전역 스킬/훅/설정
// ============================================================================

export interface GlobalInstallResult {
  /** ~/.claude/ 기준 상대 경로의 파일들 */
  files: GeneratedFile[];
  directories: string[];
}

export function generateGlobalInstall(): GlobalInstallResult {
  const directories = [
    'skills',
    'skills/we-deploy',
    'skills/we-promote',
    'skills/we-rollback',
    'skills/we-health',
    'skills/we-domain',
    'skills/we-init',
    'skills/we-workflow',
    'hooks',
  ];

  const files: GeneratedFile[] = [
    // Skills (디렉토리 기반 SKILL.md — 공식 Claude Code 구조)
    { path: 'skills/we-deploy/SKILL.md', content: skillDeploy() },
    { path: 'skills/we-promote/SKILL.md', content: skillPromote() },
    { path: 'skills/we-rollback/SKILL.md', content: skillRollback() },
    { path: 'skills/we-health/SKILL.md', content: skillHealth() },
    { path: 'skills/we-domain/SKILL.md', content: skillDomain() },
    { path: 'skills/we-init/SKILL.md', content: skillInit() },
    { path: 'skills/we-workflow/SKILL.md', content: skillWorkflow() },
    // Hooks
    { path: 'hooks/pre-bash.py', content: hookPreBash() },
  ];

  return { files, directories };
}

/**
 * MCP 서버 설정 JSON (settings.json에 병합할 내용)
 */
export function generateMcpSettings(mcpScriptPath: string, apiKey?: string): Record<string, unknown> {
  const env: Record<string, string> = {
    CODEB_API_URL: 'https://api.codeb.kr',
  };
  if (apiKey) {
    env.CODEB_API_KEY = apiKey;
  }

  return {
    mcpServers: {
      'codeb-deploy': {
        command: 'node',
        args: [mcpScriptPath],
        env,
      },
    },
  };
}

/**
 * 전역 CLAUDE.md (시스템 규칙 — ~/.claude/CLAUDE.md)
 */
export function generateGlobalClaudeMd(version: string): string {
  return `# CLAUDE.md — CodeB v${version} (Global)

> install.sh로 설치됨. 모든 프로젝트에 적용되는 전역 규칙.
> 프로젝트별 규칙은 프로젝트 루트의 CLAUDE.md에서 정의.

## 배포 원칙

- **배포 = git push**. \`deploy_project\` MCP를 직접 호출하지 않는다.
- promote/rollback은 MCP 직접 호출 OK

## Skills

| 명령 | 설명 |
|------|------|
| \`/we:deploy\` | git commit & push → 배포 |
| \`/we:promote\` | 트래픽 전환 (무중단) |
| \`/we:rollback\` | 즉시 롤백 |
| \`/we:health\` | 시스템 헬스체크 |
| \`/we:domain\` | 도메인 관리 |
| \`/we:init\` | 프로젝트 서버 초기화 |
| \`/we:workflow\` | CI/CD 워크플로우 생성 |

## 금지 명령

\`\`\`bash
docker system prune -a       # Docker 전체 정리
docker volume prune -a       # Docker 볼륨 전체 삭제
rm -rf /opt/codeb/*          # 프로젝트 폴더 삭제
\`\`\`

## 버전 업데이트

\`\`\`bash
we --version
curl -sSL https://releases.codeb.kr/cli/install.sh | bash
\`\`\`

## Language

Always respond in ko.
`;
}

// ============================================================================
// CLAUDE.md (프로젝트별 — we init으로 생성)
// ============================================================================

function generateClaudeMd(projectName: string, version: string): string {
  return `# CLAUDE.md — ${projectName} (CodeB v${version})

> \`we init\`으로 생성. 버전은 API 서버가 SSOT.
> 스킬/MCP/훅은 install.sh로 전역 설치됨 (~/.claude/).

## Project: ${projectName}

## 배포 원칙

- **배포 = git push**. \`deploy_project\` MCP를 직접 호출하지 않는다.
- git push → GitHub Actions → Docker Buildx (Minio S3 캐시) → Private Registry → Blue-Green 배포
- promote/rollback은 MCP 직접 호출 OK

## Skills (전역 설치됨)

| 명령 | 설명 |
|------|------|
| \`/we:deploy\` | git commit & push → Actions 모니터링 → 배포 |
| \`/we:promote\` | 트래픽 전환 (무중단) |
| \`/we:rollback\` | 즉시 이전 버전 롤백 |
| \`/we:health\` | 전체 시스템 헬스체크 |
| \`/we:domain\` | 도메인 설정/삭제/목록 |
| \`/we:init\` | 프로젝트 서버 인프라 초기화 |
| \`/we:workflow\` | CI/CD 워크플로우 생성 |

## CI/CD 파이프라인

\`\`\`
git push main
  → GitHub Actions (self-hosted runner: [self-hosted, codeb])
  → Docker Buildx + Minio S3 캐시 (64.176.226.119:9000)
  → Private Registry (64.176.226.119:5000)
  → MCP API → Blue-Green 배포
  → Preview URL → /we:promote
\`\`\`

### GitHub Secrets (필수)

| Secret | 설명 |
|--------|------|
| \`CODEB_API_KEY\` | MCP API 인증 키 |
| \`MINIO_ACCESS_KEY\` | Minio S3 Access Key |
| \`MINIO_SECRET_KEY\` | Minio S3 Secret Key |

## 팀원 온보딩

\`\`\`bash
# 1. CLI + MCP + Skills 전역 설치
curl -sSL https://releases.codeb.kr/cli/install.sh | bash

# 2. API 키 설정 (admin이 발급)
we init codeb_<teamId>_<role>_<token>

# 3. Claude Code 재시작 → /we:health 확인
\`\`\`

API 키: \`~/.codeb/config.json\` (소스코드에 포함 안 됨)

## Language

Always respond in ko.
`;
}

// ============================================================================
// Skills (전역 설치 — ~/.claude/skills/we-*/SKILL.md)
// ============================================================================

function skillDeploy(): string {
  return `---
name: we:deploy
description: Git Push 기반 Blue-Green 배포. "배포", "deploy", "릴리즈" 요청 시 활성화.
user-invocable: true
argument-hint: "[project-name]"
allowed-tools:
  - Bash
  - mcp__codeb-deploy__slot_status
  - mcp__codeb-deploy__slot_promote
---

# we:deploy - Git Push 기반 Blue-Green 배포

## 배포 원칙
- **배포 = git push**. MCP \`deploy_project\`를 직접 호출하지 않는다.
- git push → GitHub Actions → Docker Buildx (Minio S3) → Blue-Green Deploy

## 배포 절차

### 1단계: 변경사항 확인
\`\`\`bash
git status
git diff --stat HEAD
\`\`\`

### 2단계: 커밋 & 푸시
\`\`\`bash
git add <변경 파일>
git commit -m "<커밋 메시지>"
git push origin main
\`\`\`

### 3단계: GitHub Actions 모니터링
\`\`\`bash
gh run list --limit 3
gh run watch <run-id>
\`\`\`

### 4단계: 배포 결과 확인
\`\`\`
mcp__codeb-deploy__slot_status { "projectName": "<프로젝트>" }
\`\`\`

### 5단계: 트래픽 전환 (사용자 확인 후)
\`\`\`
mcp__codeb-deploy__slot_promote { "projectName": "<프로젝트>" }
\`\`\`

## 주의
- \`deploy_project\` MCP 직접 호출 금지 (이전 이미지로 배포됨)
- force build: \`gh workflow run deploy.yml -f action=deploy -f no_cache=true\`
`;
}

function skillPromote(): string {
  return `---
name: we:promote
description: 트래픽 전환 (무중단). "프로모트", "promote", "트래픽 전환" 요청 시 활성화.
user-invocable: true
argument-hint: "<project-name>"
allowed-tools:
  - mcp__codeb-deploy__slot_status
  - mcp__codeb-deploy__slot_promote
---

# we:promote - 트래픽 전환 (무중단)

## 절차

### 1단계: 현재 슬롯 상태 확인
\`\`\`
mcp__codeb-deploy__slot_status { "projectName": "<프로젝트>" }
\`\`\`
- deployed 상태의 슬롯이 있는지 확인

### 2단계: Promote 실행
\`\`\`
mcp__codeb-deploy__slot_promote { "projectName": "<프로젝트>" }
\`\`\`
- Caddy 설정 변경 → 즉시 트래픽 전환
- 이전 슬롯 → grace 상태 (48시간 유지)

### 3단계: 결과 확인
\`\`\`
mcp__codeb-deploy__slot_status { "projectName": "<프로젝트>" }
\`\`\`
`;
}

function skillRollback(): string {
  return `---
name: we:rollback
description: 즉시 롤백. "롤백", "rollback", "되돌려" 요청 시 활성화.
user-invocable: true
argument-hint: "<project-name>"
allowed-tools:
  - mcp__codeb-deploy__slot_status
  - mcp__codeb-deploy__rollback
---

# we:rollback - 즉시 롤백

## 절차

### 1단계: 현재 상태 확인
\`\`\`
mcp__codeb-deploy__slot_status { "projectName": "<프로젝트>" }
\`\`\`

### 2단계: 롤백 실행
\`\`\`
mcp__codeb-deploy__rollback { "projectName": "<프로젝트>" }
\`\`\`
- grace 상태 슬롯을 active로 전환
- 즉시 이전 버전으로 복구

### 3단계: 확인
\`\`\`
mcp__codeb-deploy__slot_status { "projectName": "<프로젝트>" }
\`\`\`
`;
}

function skillHealth(): string {
  return `---
name: we:health
description: 시스템 헬스체크. "헬스체크", "health", "상태 확인" 요청 시 활성화.
user-invocable: true
allowed-tools:
  - mcp__codeb-deploy__health_check
---

# we:health - 시스템 헬스체크

## 전체 시스템 체크
\`\`\`
mcp__codeb-deploy__health_check { "server": "all" }
\`\`\`

## 개별 서버 체크
\`\`\`
mcp__codeb-deploy__health_check { "server": "app" }
mcp__codeb-deploy__health_check { "server": "storage" }
mcp__codeb-deploy__health_check { "server": "streaming" }
mcp__codeb-deploy__health_check { "server": "backup" }
\`\`\`

## 결과 해석
- **healthy**: 정상
- **degraded**: 일부 기능 제한 (주의)
- **unhealthy**: 장애 (즉시 확인 필요)
`;
}

function skillDomain(): string {
  return `---
name: we:domain
description: 도메인 관리. "도메인", "domain", "DNS" 요청 시 활성화.
user-invocable: true
argument-hint: "<setup|list|delete> [domain]"
allowed-tools:
  - mcp__codeb-deploy__domain_setup
  - mcp__codeb-deploy__domain_list
  - mcp__codeb-deploy__domain_delete
---

# we:domain - 도메인 관리

## 도메인 설정
\`\`\`
mcp__codeb-deploy__domain_setup {
  "projectName": "<프로젝트>",
  "domain": "<도메인>"
}
\`\`\`
- *.codeb.kr, *.workb.net → PowerDNS + Caddy + SSL 자동
- 커스텀 도메인 → Caddy + SSL 자동, DNS는 수동

## 도메인 목록
\`\`\`
mcp__codeb-deploy__domain_list { "projectName": "<프로젝트>" }
\`\`\`

## 도메인 삭제
\`\`\`
mcp__codeb-deploy__domain_delete {
  "projectName": "<프로젝트>",
  "domain": "<도메인>"
}
\`\`\`
`;
}

function skillInit(): string {
  return `---
name: we:init
description: 프로젝트 서버 인프라 초기화. "초기화", "init", "새 프로젝트" 요청 시 활성화.
user-invocable: true
argument-hint: "<project-name>"
allowed-tools:
  - mcp__codeb-deploy__workflow_init
  - mcp__codeb-deploy__workflow_scan
  - mcp__codeb-deploy__health_check
---

# we:init - 프로젝트 서버 인프라 초기화

## 초기화 절차

### 1단계: 시스템 확인
\`\`\`
mcp__codeb-deploy__health_check { "server": "all" }
\`\`\`

### 2단계: 기존 등록 확인
\`\`\`
mcp__codeb-deploy__workflow_scan { "projectName": "<프로젝트>" }
\`\`\`

### 3단계: 인프라 생성
\`\`\`
mcp__codeb-deploy__workflow_init {
  "projectName": "<프로젝트>",
  "type": "nextjs",
  "database": true,
  "redis": true
}
\`\`\`

## 생성되는 리소스
- DB SSOT 등록 (projects 테이블)
- Blue-Green 슬롯 할당 (port 4100-4499)
- PostgreSQL DB + User
- Redis DB 번호
- .env 파일 (App 서버)
- Caddy 리버스 프록시
- PowerDNS A 레코드 (*.codeb.kr)
`;
}

function skillWorkflow(): string {
  return `---
name: we:workflow
description: CI/CD 워크플로우 생성. "워크플로우", "workflow", "CI/CD" 요청 시 활성화.
user-invocable: true
argument-hint: "<init|scan> <project-name>"
allowed-tools:
  - mcp__codeb-deploy__workflow_init
  - mcp__codeb-deploy__workflow_scan
  - Bash
---

# we:workflow - CI/CD 워크플로우 생성

## 워크플로우 생성
\`\`\`
mcp__codeb-deploy__workflow_init {
  "projectName": "<프로젝트>",
  "type": "nextjs"
}
\`\`\`
- .github/workflows/deploy.yml 내용 반환
- Dockerfile 내용 반환

## 워크플로우 스캔
\`\`\`
mcp__codeb-deploy__workflow_scan { "projectName": "<프로젝트>" }
\`\`\`
- 기존 워크플로우 분석 및 권장사항 제공

## GitHub Secrets 설정 필수
\`\`\`bash
gh secret set CODEB_API_KEY
gh secret set MINIO_ACCESS_KEY
gh secret set MINIO_SECRET_KEY
\`\`\`
`;
}

// ============================================================================
// Hooks (전역 설치 — ~/.claude/hooks/)
// ============================================================================

function hookPreBash(): string {
  return `#!/usr/bin/env python3
"""
CodeB Pre-Bash Hook — 위험 명령 차단

Claude Code PreToolUse Hook으로 실행됨.
stdin: JSON { "tool_name": "Bash", "tool_input": { "command": "..." } }
stdout: JSON { "decision": "allow"|"block", "reason": "..." }
"""

import json
import sys
import re

FORBIDDEN_PATTERNS = [
    # Docker 파괴
    r"docker\\s+system\\s+prune\\s+-a",
    r"docker\\s+volume\\s+prune\\s+-a",
    # 시스템 파괴
    r"rm\\s+-rf\\s+/(?!tmp)",
    r"rm\\s+-rf\\s+/opt/codeb",
    r"rm\\s+-rf\\s+/var/lib/docker",
    r"rm\\s+-rf\\s+~",
    # DB 파괴
    r"DROP\\s+DATABASE",
    r"DROP\\s+SCHEMA.*CASCADE",
    r"FLUSHALL",
    r"FLUSHDB",
    # 서비스 중단
    r"systemctl\\s+stop\\s+caddy",
    r"systemctl\\s+stop\\s+codeb",
    r"systemctl\\s+disable\\s+caddy",
    # 위험 디스크 작업
    r"mkfs\\.",
    r"dd\\s+if=.*of=/dev/",
]

def check_command(command: str) -> dict:
    for pattern in FORBIDDEN_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            return {
                "decision": "block",
                "reason": f"Blocked: matches forbidden pattern '{pattern}'"
            }
    return {"decision": "allow"}

def main():
    try:
        data = json.load(sys.stdin)
        tool_input = data.get("tool_input", {})
        command = tool_input.get("command", "")

        result = check_command(command)
        json.dump(result, sys.stdout)
    except Exception as e:
        json.dump({"decision": "allow", "reason": f"Hook error: {e}"}, sys.stdout)

if __name__ == "__main__":
    main()
`;
}
