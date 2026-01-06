/**
 * /we setup - 통합 설치 명령어
 *
 * 모든 CodeB 규칙, MCP, CLI, Hooks를 한 번에 설치
 * Admin/Developer 권한 분리 지원
 */

import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import inquirer from 'inquirer';
import ora from 'ora';

// =============================================================================
// 설정
// =============================================================================

// App 서버가 메인 서버 (PowerDNS + Caddy 포함)
const CODEB_SERVER = '158.247.203.55';
const CODEB_USER = 'root';

// 허용된 서버 목록
// 아키텍처:
// - 158.247.203.55 (App): Next.js + Dashboard + PowerDNS + Caddy
// - 141.164.42.213 (Streaming): Centrifugo WebSocket
// - 64.176.226.119 (Storage): PostgreSQL + Redis
// - 141.164.37.63 (Backup): 백업 + 모니터링
// 배포 흐름: Git Push → GitHub Actions (build/test) → GHCR push → 서버 pull/restart
const ALLOWED_SERVERS = {
  ips: [
    '158.247.203.55',   // App (app.codeb.kr) - 메인 서버
    '141.164.42.213',   // Streaming (ws.codeb.kr)
    '64.176.226.119',   // Storage (db.codeb.kr)
    '141.164.37.63',    // Backup (backup.codeb.kr)
  ],
  hostnames: [
    'app.codeb.kr',
    'ws.codeb.kr',
    'db.codeb.kr',
    'backup.codeb.kr',
    'localhost',
    '127.0.0.1',
  ],
  // 서버별 역할 정의
  roles: {
    '158.247.203.55': {
      name: 'Videopick App',
      services: ['app', 'postgres', 'redis'],
      description: '메인 애플리케이션 서버'
    },
    '141.164.42.213': {
      name: 'Videopick Streaming',
      services: ['streaming', 'media-processing'],
      description: '스트리밍 서버'
    },
    '64.176.226.119': {
      name: 'Videopick Storage',
      services: ['minio', 'backup'],
      description: '오브젝트 스토리지'
    },
    '141.164.37.63': {
      name: 'Videopick Backup',
      services: ['backup', 'replication'],
      description: '백업 서버'
    }
  }
};

// Claude Code Hooks 설정 (글로벌 경로 사용)
const GLOBAL_HOOKS_CONFIG = {
  PreToolUse: [
    {
      matcher: 'Bash',
      hooks: [
        {
          type: 'command',
          command: `python3 ${path.join(os.homedir(), '.claude', 'hooks', 'pre-bash.py')}`,
          timeout: 5,
          statusMessage: 'Validating deployment rules...'
        }
      ]
    }
  ]
};

// 허용/거부 권한 설정
const PERMISSIONS_CONFIG = {
  allow: [
    'Bash(ssh:*)',
    'Bash(curl:*)',
    'Bash(cat:*)',
    'Bash(git push:*)',
    'Bash(find:*)',
    'Bash(we:*)',
    'Bash(we *)',
    'Bash(podman ps:*)',
    'Bash(podman ps *)',
    'Bash(podman logs:*)',
    'Bash(podman logs *)',
    'Bash(podman inspect:*)',
    'Bash(podman inspect *)'
  ],
  deny: [
    'Bash(podman rm:*)',
    'Bash(podman rm *)',
    'Bash(podman volume rm:*)',
    'Bash(podman volume rm *)',
    'Bash(docker rm:*)',
    'Bash(docker rm *)',
    'Bash(docker volume rm:*)',
    'Bash(docker volume rm *)',
    'Bash(docker-compose down -v*)',
    'Bash(podman-compose down -v*)'
  ],
  ask: [
    'Bash(podman stop:*)',
    'Bash(podman stop *)',
    'Bash(docker stop:*)',
    'Bash(docker stop *)'
  ]
};

// =============================================================================
// Hooks 스크립트
// =============================================================================

const PRE_BASH_HOOK = `#!/usr/bin/env python3
"""
CodeB Deployment Hooks - Bash Command Validator
JSON 출력 방식으로 Claude Code와 통신

허용된 서버/명령어는 SSOT (서버)에서 관리
로컬 캐시: ~/.codeb/ssot-cache.json
"""

import sys
import json
import re
import os
from pathlib import Path
from datetime import datetime, timedelta

# ============================================================================
# 설정
# ============================================================================

# 로컬 SSOT 캐시 경로
SSOT_CACHE_PATH = Path.home() / '.codeb' / 'ssot-cache.json'

# 캐시 만료 시간 (분)
CACHE_TTL_MINUTES = 30

# 기본 허용 서버 (캐시 없을 때 폴백)
DEFAULT_ALLOWED_IPS = [
    "158.247.203.55",   # App (app.codeb.kr)
    "141.164.42.213",   # Streaming (ws.codeb.kr)
    "64.176.226.119",   # Storage (db.codeb.kr)
    "141.164.37.63",    # Backup (backup.codeb.kr)
]

DEFAULT_ALLOWED_HOSTNAMES = [
    "app.codeb.kr",
    "ws.codeb.kr",
    "db.codeb.kr",
    "backup.codeb.kr",
    "localhost",
    "127.0.0.1",
]

# ============================================================================
# SSOT 캐시 로드
# ============================================================================

def load_ssot_cache():
    """SSOT 캐시 로드 (만료 체크 포함)"""
    try:
        if not SSOT_CACHE_PATH.exists():
            return None

        with open(SSOT_CACHE_PATH, 'r') as f:
            cache = json.load(f)

        # 만료 체크
        cached_at = cache.get('cachedAt', '')
        if cached_at:
            cached_time = datetime.fromisoformat(cached_at.replace('Z', '+00:00'))
            if datetime.now(cached_time.tzinfo) - cached_time > timedelta(minutes=CACHE_TTL_MINUTES):
                return None  # 캐시 만료

        return cache
    except Exception:
        return None

def get_allowed_servers():
    """허용된 서버 목록 가져오기 (SSOT 캐시 우선)"""
    cache = load_ssot_cache()

    if cache and 'servers' in cache:
        return (
            cache['servers'].get('ips', DEFAULT_ALLOWED_IPS),
            cache['servers'].get('hostnames', DEFAULT_ALLOWED_HOSTNAMES)
        )

    return DEFAULT_ALLOWED_IPS, DEFAULT_ALLOWED_HOSTNAMES

# ============================================================================
# 검증 규칙
# ============================================================================

# 절대 금지 명령어 패턴
FORBIDDEN_PATTERNS = [
    # 컨테이너 강제 삭제
    (r'podman\\s+rm\\s+(-f|--force)', "직접 컨테이너 삭제 금지. 사용: we workflow stop <project>"),
    (r'docker\\s+rm\\s+(-f|--force)', "직접 컨테이너 삭제 금지. 사용: we workflow stop <project>"),

    # 볼륨 삭제
    (r'podman\\s+volume\\s+rm', "직접 볼륨 삭제 금지. 사용: we workflow cleanup <project>"),
    (r'docker\\s+volume\\s+rm', "직접 볼륨 삭제 금지. 사용: we workflow cleanup <project>"),

    # docker-compose down -v
    (r'docker-compose\\s+down\\s+.*-v', "볼륨 포함 삭제 금지. 사용: we workflow stop <project>"),
    (r'podman-compose\\s+down\\s+.*-v', "볼륨 포함 삭제 금지. 사용: we workflow stop <project>"),

    # 프로젝트 폴더 삭제
    (r'rm\\s+(-rf|-fr|--recursive)\\s+.*(/opt/codeb|codeb)', "CodeB 폴더 직접 삭제 금지"),

    # systemctl stop (서비스 중지)
    (r'systemctl\\s+stop\\s+.*codeb', "서비스 직접 중지 금지. 사용: we workflow stop <project>"),

    # 위험한 prune 명령
    (r'podman\\s+(system|volume)\\s+prune\\s+(-a|--all)', "전체 정리 금지. 프로젝트별로 정리하세요."),
    (r'docker\\s+(system|volume)\\s+prune\\s+(-a|--all)', "전체 정리 금지. 프로젝트별로 정리하세요."),
]

# 허용 패턴 (조회 명령) - 항상 허용
ALLOWED_PATTERNS = [
    r'^we\\s+',           # we CLI 명령
    r'podman\\s+ps',
    r'podman\\s+logs',
    r'podman\\s+inspect',
    r'podman\\s+images',
    r'podman\\s+volume\\s+ls',
    r'podman\\s+network\\s+ls',
    r'docker\\s+ps',
    r'docker\\s+logs',
    r'docker\\s+inspect',
]

# ============================================================================
# JSON 응답 헬퍼
# ============================================================================

def deny(reason: str):
    """명령 거부 (JSON 출력)"""
    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason
        }
    }
    print(json.dumps(output))
    sys.exit(0)

def allow():
    """명령 허용"""
    sys.exit(0)

def ask(reason: str):
    """사용자 확인 요청"""
    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "ask",
            "permissionDecisionReason": reason
        }
    }
    print(json.dumps(output))
    sys.exit(0)

# ============================================================================
# 검증 함수
# ============================================================================

def check_ssh_target(command: str):
    """SSH 접속 대상 서버 검증"""
    allowed_ips, allowed_hostnames = get_allowed_servers()

    # SSH/SCP/RSYNC 명령어 패턴
    ssh_patterns = [
        r'ssh\\s+(?:-[^\\s]+\\s+)*(?:(\\w+)@)?(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})',
        r'ssh\\s+(?:-[^\\s]+\\s+)*(?:(\\w+)@)?([\\w\\-\\.]+)\\s',
        r'scp\\s+.*?(?:(\\w+)@)?(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})',
        r'rsync\\s+.*?(?:(\\w+)@)?(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})',
    ]

    for pattern in ssh_patterns:
        match = re.search(pattern, command)
        if match:
            target = match.group(2)

            # IP 주소 검증
            if re.match(r'^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$', target):
                if target not in allowed_ips:
                    deny(f"허용되지 않은 서버 IP: {target}\\n\\n허용된 IP:\\n" +
                         "\\n".join(f"  - {ip}" for ip in allowed_ips) +
                         "\\n\\n서버 목록 업데이트: we ssot sync")
            # 호스트명 검증
            elif target not in allowed_hostnames:
                if not any(h in target for h in allowed_hostnames):
                    deny(f"허용되지 않은 서버: {target}\\n\\n허용된 호스트: {', '.join(allowed_hostnames)}")

def check_forbidden_commands(command: str):
    """금지 명령어 패턴 체크"""
    command_lower = command.lower()

    for pattern, message in FORBIDDEN_PATTERNS:
        if re.search(pattern, command_lower):
            deny(f"🚫 {message}")

def check_allowed_commands(command: str) -> bool:
    """허용 명령어 패턴 체크 (허용되면 True)"""
    for pattern in ALLOWED_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            return True
    return False

def check_project_isolation(command: str):
    """프로젝트 격리 검증"""
    current_project = os.environ.get('CODEB_PROJECT', '')
    if not current_project:
        return

    container_ops = ['rm', 'stop', 'restart', 'kill']
    for op in container_ops:
        pattern = rf'(podman|docker)\\s+{op}\\s+(\\S+)'
        match = re.search(pattern, command)
        if match:
            container_name = match.group(2)
            if current_project not in container_name and 'codeb' in container_name.lower():
                deny(f"다른 프로젝트({container_name})의 컨테이너 조작 금지\\n\\n현재 프로젝트: {current_project}")

# ============================================================================
# 메인
# ============================================================================

def main():
    # stdin에서 hook input 읽기
    try:
        input_data = sys.stdin.read()
        if input_data.strip():
            hook_input = json.loads(input_data)
        else:
            hook_input = {}
    except json.JSONDecodeError:
        hook_input = {}

    # Bash 도구의 command 파라미터 추출
    tool_input = hook_input.get('tool_input', {})
    command = tool_input.get('command', '')

    if not command:
        allow()

    # 1. 허용 패턴 먼저 체크 (we CLI, 조회 명령)
    if check_allowed_commands(command):
        allow()

    # 2. SSH 대상 서버 검증
    check_ssh_target(command)

    # 3. 금지 명령어 체크
    check_forbidden_commands(command)

    # 4. 프로젝트 격리 체크
    check_project_isolation(command)

    # 기본: 허용
    allow()

if __name__ == "__main__":
    main()
`;

// CLAUDE.md 규칙 템플릿
const CLAUDE_MD_TEMPLATE = `# CLAUDE.md - CodeB Project Rules

## Critical Rules

### 1. NEVER Run Dangerous Commands Directly

\`\`\`bash
# 절대 금지 (Hooks가 차단함)
podman rm -f <container>       # 직접 컨테이너 삭제
podman volume rm <volume>      # 직접 볼륨 삭제
docker-compose down -v         # 볼륨 포함 삭제
rm -rf /opt/codeb/projects/*   # 프로젝트 폴더 삭제
\`\`\`

### 2. ALWAYS Use CLI Commands

\`\`\`bash
# 올바른 방법
we workflow init <project>     # 프로젝트 초기화
we deploy <project>            # 배포
we workflow stop <project>     # 서비스 중지
we workflow scan <project>     # 상태 확인
we ssot sync                   # 서버 데이터 동기화
\`\`\`

### 3. SSH Only to Allowed Servers

허용된 서버만 SSH 접속 가능:
- 158.247.203.55 (App - app.codeb.kr)
- 141.164.42.213 (Streaming - ws.codeb.kr)
- 64.176.226.119 (Storage - db.codeb.kr)
- 141.164.37.63 (Backup - backup.codeb.kr)

### 4. Environment File Protection

- NEVER overwrite existing .env files without backup
- Protected variables: DATABASE_URL, REDIS_URL, POSTGRES_*

## Quick Reference

\`\`\`bash
# 프로젝트 초기화
we workflow init myapp --type nextjs --database --redis

# 서버 상태 확인
we ssot status
we ssot projects
we workflow scan myapp

# 배포
we deploy myapp --environment staging

# 도메인 설정
we domain setup myapp.codeb.dev --ssl
\`\`\`

## Permission Model

- **Admin**: SSH + deploy + server settings
- **Developer**: Git Push only → GitHub Actions → auto deploy
`;

// =============================================================================
// 설치 함수들
// =============================================================================

/**
 * SSH 연결 테스트
 */
async function testSSHConnection() {
  const spinner = ora('SSH 연결 테스트 중...').start();

  try {
    execSync(`ssh -o ConnectTimeout=5 -o BatchMode=yes ${CODEB_USER}@${CODEB_SERVER} "echo ok"`, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    spinner.succeed('SSH 연결 성공 (Admin 권한)');
    return { success: true, isAdmin: true };
  } catch (error) {
    spinner.warn('SSH 연결 실패 (Developer 모드로 설치)');
    return { success: true, isAdmin: false };
  }
}

/**
 * 글로벌 Claude Code 디렉토리 생성 (~/.claude/)
 */
function ensureGlobalClaudeDir() {
  const globalClaudeDir = path.join(os.homedir(), '.claude');
  const globalHooksDir = path.join(globalClaudeDir, 'hooks');

  if (!fs.existsSync(globalClaudeDir)) {
    fs.mkdirSync(globalClaudeDir, { recursive: true });
  }

  if (!fs.existsSync(globalHooksDir)) {
    fs.mkdirSync(globalHooksDir, { recursive: true });
  }

  return { globalClaudeDir, globalHooksDir };
}

/**
 * Hooks 설치
 */
function installHooks(hooksDir) {
  const hookPath = path.join(hooksDir, 'pre-bash.py');
  fs.writeFileSync(hookPath, PRE_BASH_HOOK);
  fs.chmodSync(hookPath, '755');
  return hookPath;
}

/**
 * 글로벌 settings.json 설치 (~/.claude/settings.json)
 */
function installGlobalSettings(globalClaudeDir) {
  const settingsPath = path.join(globalClaudeDir, 'settings.json');

  // 기존 설정 로드 및 병합
  let existingSettings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      existingSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
      // ignore
    }
  }

  const settings = {
    ...existingSettings,
    permissions: PERMISSIONS_CONFIG,
    hooks: GLOBAL_HOOKS_CONFIG,
    enableAllProjectMcpServers: true,
    enabledMcpjsonServers: [...new Set([...(existingSettings.enabledMcpjsonServers || []), 'codeb-deploy'])]
  };

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return settingsPath;
}

/**
 * CLAUDE.md 설치
 */
function installClaudeMd(projectPath) {
  const claudeMdPath = path.join(projectPath, 'CLAUDE.md');

  // 기존 파일이 있으면 백업
  if (fs.existsSync(claudeMdPath)) {
    const backupPath = `${claudeMdPath}.backup.${Date.now()}`;
    fs.copyFileSync(claudeMdPath, backupPath);
    console.log(chalk.yellow(`  기존 CLAUDE.md 백업: ${backupPath}`));
  }

  fs.writeFileSync(claudeMdPath, CLAUDE_MD_TEMPLATE);
  return claudeMdPath;
}

/**
 * SSOT 캐시 디렉토리 생성
 */
function ensureSSOTCache() {
  const codebDir = path.join(os.homedir(), '.codeb');

  if (!fs.existsSync(codebDir)) {
    fs.mkdirSync(codebDir, { recursive: true });
  }

  const cachePath = path.join(codebDir, 'ssot-cache.json');

  // 초기 캐시 생성 (서버 목록만)
  if (!fs.existsSync(cachePath)) {
    const initialCache = {
      cachedAt: new Date().toISOString(),
      servers: ALLOWED_SERVERS,
      projects: {}
    };
    fs.writeFileSync(cachePath, JSON.stringify(initialCache, null, 2));
  }

  return cachePath;
}

/**
 * GHCR_PAT 등 credentials 설정
 * ~/.codeb/credentials.json에 저장
 */
async function ensureCredentials() {
  const codebDir = path.join(os.homedir(), '.codeb');
  const credentialsPath = path.join(codebDir, 'credentials.json');

  if (!fs.existsSync(codebDir)) {
    fs.mkdirSync(codebDir, { recursive: true });
  }

  let credentials = {};
  if (fs.existsSync(credentialsPath)) {
    try {
      credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    } catch (e) {
      // ignore
    }
  }

  // GHCR_PAT가 없으면 입력 받기
  if (!credentials.GHCR_PAT) {
    const { ghcrPat } = await inquirer.prompt([
      {
        type: 'password',
        name: 'ghcrPat',
        message: 'GitHub Container Registry PAT (write:packages 권한):',
        mask: '*',
        validate: (input) => input.startsWith('ghp_') || input === '' ? true : 'ghp_로 시작하는 PAT를 입력하세요 (건너뛰려면 Enter)'
      }
    ]);

    if (ghcrPat && ghcrPat.startsWith('ghp_')) {
      credentials.GHCR_PAT = ghcrPat;
      credentials.updatedAt = new Date().toISOString();
      fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));
      fs.chmodSync(credentialsPath, '600'); // 보안: 소유자만 읽기
      return { set: true, path: credentialsPath };
    } else {
      return { set: false, skipped: true };
    }
  }

  return { set: true, exists: true, path: credentialsPath };
}

/**
 * MCP 설정 확인/설치
 */
function checkMCPSetup() {
  const claudeConfigPath = path.join(os.homedir(), '.claude.json');

  if (fs.existsSync(claudeConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
      if (config.mcpServers && config.mcpServers['codeb-deploy']) {
        return { installed: true, path: claudeConfigPath };
      }
    } catch (error) {
      // ignore
    }
  }

  return { installed: false, path: claudeConfigPath };
}

/**
 * 서버에서 SSOT 동기화
 */
async function syncFromServer(isAdmin) {
  if (!isAdmin) {
    console.log(chalk.yellow('  Developer 모드: 서버 동기화는 GitHub Actions를 통해 수행됩니다.'));
    return false;
  }

  const spinner = ora('서버에서 SSOT 동기화 중...').start();

  try {
    // 서버에서 프로젝트 레지스트리 가져오기
    const result = execSync(
      `ssh ${CODEB_USER}@${CODEB_SERVER} "cat /opt/codeb/config/project-registry.json 2>/dev/null || echo '{}'"`,
      { encoding: 'utf8' }
    );

    const cachePath = path.join(os.homedir(), '.codeb', 'ssot-cache.json');

    let projectRegistry = {};
    try {
      // JavaScript 객체 형태를 JSON으로 변환
      const cleanedResult = result.replace(/(\w+):/g, '"$1":').replace(/'/g, '"');
      projectRegistry = JSON.parse(cleanedResult);
    } catch (e) {
      // JSON 파싱 실패시 빈 객체 사용
    }

    const cache = {
      cachedAt: new Date().toISOString(),
      servers: ALLOWED_SERVERS,
      projects: projectRegistry.projects || {}
    };

    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));

    spinner.succeed('서버 SSOT 동기화 완료');
    return true;
  } catch (error) {
    spinner.fail('서버 동기화 실패');
    return false;
  }
}

// =============================================================================
// 메인 설치 함수
// =============================================================================

export async function setup(options) {
  console.log(chalk.cyan.bold('\n📦 CodeB 통합 설치 (글로벌)\n'));

  const globalClaudeDir = path.join(os.homedir(), '.claude');
  const projectPath = options.path || null; // 프로젝트 경로 (선택사항)

  // 1. SSH 연결 테스트 (권한 확인)
  let isAdmin = false;
  if (options.admin) {
    isAdmin = true;
  } else if (options.developer) {
    isAdmin = false;
  } else {
    const result = await testSSHConnection();
    isAdmin = result.isAdmin;
  }

  console.log(chalk.gray(`설치 모드: ${isAdmin ? chalk.green('Admin') : chalk.yellow('Developer')}`));
  console.log(chalk.gray(`글로벌 경로: ${globalClaudeDir}`));
  if (projectPath) {
    console.log(chalk.gray(`프로젝트 경로: ${projectPath}`));
  }
  console.log('');

  // 2. 확인 프롬프트 (non-interactive가 아닌 경우)
  if (!options.yes) {
    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: '글로벌 설치를 진행하시겠습니까? (한 번만 실행하면 모든 프로젝트에 적용)',
        default: true
      }
    ]);

    if (!proceed) {
      console.log(chalk.yellow('\n설치가 취소되었습니다.'));
      return;
    }
  }

  const results = {
    globalClaudeDir: null,
    hooks: null,
    settings: null,
    ssotCache: null,
    mcpSetup: null,
    serverSync: null,
    projectClaudeMd: null
  };

  // 3. 글로벌 ~/.claude 디렉토리 생성
  console.log(chalk.cyan('\n1. 글로벌 Claude Code 디렉토리 설정...'));
  const { globalClaudeDir: claudeDir, globalHooksDir } = ensureGlobalClaudeDir();
  results.globalClaudeDir = claudeDir;
  console.log(chalk.green(`  ✓ ${claudeDir}`));
  console.log(chalk.green(`  ✓ ${globalHooksDir}`));

  // 4. 글로벌 Hooks 설치
  console.log(chalk.cyan('\n2. 글로벌 Hooks 설치...'));
  results.hooks = installHooks(globalHooksDir);
  console.log(chalk.green(`  ✓ ${results.hooks}`));

  // 5. 글로벌 settings.json 설치
  console.log(chalk.cyan('\n3. 글로벌 Settings 설치...'));
  results.settings = installGlobalSettings(claudeDir);
  console.log(chalk.green(`  ✓ ${results.settings}`));

  // 6. SSOT 캐시 디렉토리 생성
  console.log(chalk.cyan('\n4. SSOT 캐시 설정...'));
  results.ssotCache = ensureSSOTCache();
  console.log(chalk.green(`  ✓ ${results.ssotCache}`));

  // 7. MCP 설정 확인
  console.log(chalk.cyan('\n5. MCP 설정 확인...'));
  results.mcpSetup = checkMCPSetup();
  if (results.mcpSetup.installed) {
    console.log(chalk.green(`  ✓ MCP codeb-deploy 설정됨`));
  } else {
    console.log(chalk.yellow(`  ⚠ MCP 설정 필요: we mcp setup`));
  }

  // 8. GHCR_PAT 설정 (GitHub Container Registry)
  console.log(chalk.cyan('\n6. GitHub Container Registry (GHCR) 설정...'));
  results.credentials = await ensureCredentials();
  if (results.credentials.exists) {
    console.log(chalk.green(`  ✓ GHCR_PAT 설정됨 (기존)`));
  } else if (results.credentials.set) {
    console.log(chalk.green(`  ✓ GHCR_PAT 저장됨: ${results.credentials.path}`));
  } else {
    console.log(chalk.yellow(`  ⚠ GHCR_PAT 건너뜀 (나중에 설정 가능)`));
  }

  // 9. 서버 동기화 (Admin만)
  if (isAdmin) {
    console.log(chalk.cyan('\n6. 서버 데이터 동기화...'));
    results.serverSync = await syncFromServer(isAdmin);
  }

  // 9. 프로젝트별 CLAUDE.md 설치 (경로가 지정된 경우)
  if (projectPath) {
    console.log(chalk.cyan('\n7. 프로젝트 CLAUDE.md 설치...'));
    results.projectClaudeMd = installClaudeMd(projectPath);
    console.log(chalk.green(`  ✓ ${results.projectClaudeMd}`));
  }

  // 10. 결과 출력
  console.log(chalk.cyan.bold('\n═══════════════════════════════════════════════'));
  console.log(chalk.green.bold('✅ CodeB 글로벌 설치 완료!\n'));

  console.log(chalk.white('설치된 항목 (글로벌 - 한 번만 설치):'));
  console.log(chalk.gray(`  • Hooks: ${results.hooks}`));
  console.log(chalk.gray(`  • Settings: ${results.settings}`));
  console.log(chalk.gray(`  • SSOT Cache: ${results.ssotCache}`));
  if (results.credentials && results.credentials.set) {
    console.log(chalk.gray(`  • GHCR_PAT: ~/.codeb/credentials.json`));
  }

  if (results.projectClaudeMd) {
    console.log(chalk.white('\n프로젝트별 설치:'));
    console.log(chalk.gray(`  • CLAUDE.md: ${results.projectClaudeMd}`));
  }

  console.log(chalk.white('\n📝 다음 단계:'));

  // MCP 설정이 필요한 경우
  if (!results.mcpSetup.installed) {
    console.log(chalk.yellow('  1. MCP 서버 설정:'));
    console.log(chalk.gray('     we mcp setup'));
    console.log('');
  }

  // 프로젝트 초기화 안내 (핵심!)
  console.log(chalk.cyan.bold('  ▶ 각 프로젝트 폴더에서 실행:'));
  console.log(chalk.white('     cd /path/to/your-project'));
  console.log(chalk.green('     we init'));
  console.log(chalk.gray('     → CLAUDE.md, slash commands, hooks 설치'));
  console.log('');

  console.log(chalk.white('📌 명령어 구분:'));
  console.log(chalk.gray('  • we setup  - 글로벌 설치 (한 번만, 완료됨 ✓)'));
  console.log(chalk.gray('  • we init   - 프로젝트별 설치 (각 프로젝트에서 실행)'));
  console.log('');

  console.log(chalk.white('🚀 사용 가능한 명령어:'));
  console.log(chalk.gray('  • we ssot status     - 서버 상태 확인'));
  console.log(chalk.gray('  • we workflow init   - 새 프로젝트 인프라 초기화'));
  console.log(chalk.gray('  • we deploy          - 프로젝트 배포'));

  if (!isAdmin) {
    console.log(chalk.yellow('\n📝 Developer 모드:'));
    console.log(chalk.gray('  • SSH 직접 접속 불가'));
    console.log(chalk.gray('  • 배포: Git Push → GitHub Actions 자동 배포'));
  }

  console.log(chalk.cyan.bold('\n═══════════════════════════════════════════════\n'));
}
