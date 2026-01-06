#!/usr/bin/env node

/**
 * /we: Claude Code 자동 설치 스크립트
 *
 * npm install 시 자동으로 실행됩니다.
 *
 * 설치 항목:
 * 1. Slash Commands: ~/.claude/commands/we/ 디렉토리에 명령어 파일 복사
 * 2. MCP Server: ~/.claude.json에 codeb-deploy MCP 서버 등록
 * 3. Rule Files: ~/.claude/ 디렉토리에 CLAUDE.md, DEPLOYMENT_RULES.md 복사
 * 4. Hooks: ~/.claude/hooks/ 디렉토리에 pre-bash.py 등 훅 설치
 * 5. Settings: ~/.claude/settings.json에 권한 및 훅 설정 추가
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

// Fix cwd issue during npm postinstall (cwd may be deleted)
try {
  process.cwd();
} catch {
  process.chdir(os.homedir());
}
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const PACKAGE_ROOT = path.join(__dirname, '..');
const HOME_DIR = os.homedir();
const CLAUDE_DIR = path.join(HOME_DIR, '.claude');
const CLAUDE_JSON = path.join(HOME_DIR, '.claude.json');

// Source directories
const COMMANDS_SOURCE = path.join(PACKAGE_ROOT, 'commands', 'we');
const RULES_SOURCE = path.join(PACKAGE_ROOT, 'rules');

// Target directories
const CLAUDE_COMMANDS_DIR = path.join(CLAUDE_DIR, 'commands', 'we');
const CLAUDE_HOOKS_DIR = path.join(CLAUDE_DIR, 'hooks');

// MCP Server configuration - 158 서버 4대 기준
const MCP_SERVER_CONFIG = {
  "codeb-deploy": {
    "command": "we",
    "args": ["mcp", "serve"],
    "env": {
      "CODEB_APP_SERVER": "158.247.203.55",
      "CODEB_STREAMING_SERVER": "141.164.42.213",
      "CODEB_STORAGE_SERVER": "64.176.226.119",
      "CODEB_BACKUP_SERVER": "141.164.37.63",
      "SSH_USER": "root"
    }
  }
};

// Default hooks configuration
const DEFAULT_HOOKS = {
  "PreBash": ["python3 $HOME/.claude/hooks/pre-bash.py \"$BASH_COMMAND\""]
};

// ================================================================
// 1. Install Slash Commands
// ================================================================
async function installCommands() {
  console.log('\n📦 1. Slash Commands 설치...');

  try {
    // Check source directory
    try {
      await fs.access(COMMANDS_SOURCE);
    } catch {
      console.log('   ⚠️  명령어 소스 디렉토리가 없습니다. 건너뜁니다.');
      return { installed: 0, skipped: 0 };
    }

    // Create target directory
    await fs.mkdir(CLAUDE_COMMANDS_DIR, { recursive: true });

    // Copy command files
    const files = await fs.readdir(COMMANDS_SOURCE);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    if (mdFiles.length === 0) {
      console.log('   ⚠️  설치할 명령어 파일이 없습니다.');
      return { installed: 0, skipped: 0 };
    }

    let installed = 0;
    let skipped = 0;

    for (const file of mdFiles) {
      const srcPath = path.join(COMMANDS_SOURCE, file);
      const destPath = path.join(CLAUDE_COMMANDS_DIR, file);

      try {
        await fs.copyFile(srcPath, destPath);
        installed++;
        console.log(`   ✅ ${file}`);
      } catch (err) {
        console.log(`   ❌ ${file}: ${err.message}`);
        skipped++;
      }
    }

    console.log(`   📍 위치: ~/.claude/commands/we/`);
    return { installed, skipped };

  } catch (err) {
    console.error('   ❌ 명령어 설치 오류:', err.message);
    return { installed: 0, skipped: 0 };
  }
}

// ================================================================
// 2. Install MCP Server
// ================================================================
async function installMcpServer() {
  console.log('\n🔌 2. MCP Server 등록...');

  try {
    let claudeConfig = {};

    // Read existing config
    if (existsSync(CLAUDE_JSON)) {
      try {
        const content = await fs.readFile(CLAUDE_JSON, 'utf-8');
        claudeConfig = JSON.parse(content);
      } catch {
        console.log('   ⚠️  기존 .claude.json 파싱 실패. 새로 생성합니다.');
      }
    }

    // Ensure mcpServers object exists
    if (!claudeConfig.mcpServers) {
      claudeConfig.mcpServers = {};
    }

    // Check if already registered
    if (claudeConfig.mcpServers['codeb-deploy']) {
      console.log('   ℹ️  codeb-deploy MCP 서버가 이미 등록되어 있습니다.');
      return { registered: false, updated: false };
    }

    // Add MCP server
    claudeConfig.mcpServers['codeb-deploy'] = MCP_SERVER_CONFIG['codeb-deploy'];

    // Write config
    await fs.writeFile(CLAUDE_JSON, JSON.stringify(claudeConfig, null, 2));
    console.log('   ✅ codeb-deploy MCP 서버 등록 완료');
    console.log('   📍 위치: ~/.claude.json');

    return { registered: true, updated: false };

  } catch (err) {
    console.error('   ❌ MCP 서버 등록 오류:', err.message);
    return { registered: false, updated: false };
  }
}

// ================================================================
// 3. Install Rule Files
// ================================================================
async function installRuleFiles() {
  console.log('\n📜 3. Rule Files 설치...');

  try {
    // Check source directory
    try {
      await fs.access(RULES_SOURCE);
    } catch {
      console.log('   ⚠️  규칙 파일 소스 디렉토리가 없습니다. 건너뜁니다.');
      return { installed: 0, skipped: 0 };
    }

    // Ensure .claude directory exists
    await fs.mkdir(CLAUDE_DIR, { recursive: true });

    const ruleFiles = ['CLAUDE.md', 'DEPLOYMENT_RULES.md'];
    let installed = 0;
    let skipped = 0;

    for (const file of ruleFiles) {
      const srcPath = path.join(RULES_SOURCE, file);
      const destPath = path.join(CLAUDE_DIR, file);

      // Check if source exists
      if (!existsSync(srcPath)) {
        console.log(`   ⚠️  ${file} 소스 파일 없음`);
        skipped++;
        continue;
      }

      // Check if dest already exists
      if (existsSync(destPath)) {
        // Compare files
        const srcContent = await fs.readFile(srcPath, 'utf-8');
        const destContent = await fs.readFile(destPath, 'utf-8');

        if (srcContent === destContent) {
          console.log(`   ℹ️  ${file} (동일, 건너뜀)`);
          skipped++;
          continue;
        }

        // Backup existing
        const backupPath = `${destPath}.backup.${Date.now()}`;
        await fs.copyFile(destPath, backupPath);
        console.log(`   📋 ${file} 백업: ${path.basename(backupPath)}`);
      }

      await fs.copyFile(srcPath, destPath);
      installed++;
      console.log(`   ✅ ${file}`);
    }

    console.log(`   📍 위치: ~/.claude/`);

    // Also install to current project directory if it's a git repo
    const projectClaudeMd = await installProjectClaudeMd();

    return { installed: installed + projectClaudeMd.installed, skipped: skipped + projectClaudeMd.skipped };

  } catch (err) {
    console.error('   ❌ 규칙 파일 설치 오류:', err.message);
    return { installed: 0, skipped: 0 };
  }
}

// ================================================================
// 3.5. Install CLAUDE.md to Project Directory
// ================================================================
async function installProjectClaudeMd() {
  try {
    // Find project root (where package.json or .git exists)
    let projectRoot = process.cwd();

    // Check if we're in a valid project directory
    const hasPackageJson = existsSync(path.join(projectRoot, 'package.json'));
    const hasGit = existsSync(path.join(projectRoot, '.git'));

    if (!hasPackageJson && !hasGit) {
      // Not a project directory, skip
      return { installed: 0, skipped: 0 };
    }

    const srcPath = path.join(RULES_SOURCE, 'CLAUDE.md');
    const destPath = path.join(projectRoot, 'CLAUDE.md');

    if (!existsSync(srcPath)) {
      return { installed: 0, skipped: 0 };
    }

    // Check if already exists and is same content
    if (existsSync(destPath)) {
      const srcContent = await fs.readFile(srcPath, 'utf-8');
      const destContent = await fs.readFile(destPath, 'utf-8');

      if (srcContent === destContent) {
        console.log(`   ℹ️  프로젝트 CLAUDE.md (동일, 건너뜀)`);
        return { installed: 0, skipped: 1 };
      }

      // Backup existing
      const backupPath = `${destPath}.backup.${Date.now()}`;
      await fs.copyFile(destPath, backupPath);
      console.log(`   📋 프로젝트 CLAUDE.md 백업`);
    }

    await fs.copyFile(srcPath, destPath);
    console.log(`   ✅ 프로젝트 CLAUDE.md`);
    console.log(`   📍 위치: ${projectRoot}/CLAUDE.md`);

    return { installed: 1, skipped: 0 };

  } catch (err) {
    // Silently skip if project installation fails
    return { installed: 0, skipped: 0 };
  }
}

// ================================================================
// 4. Install Hooks
// ================================================================
async function installHooks() {
  console.log('\n🪝 4. Hooks 설치...');

  try {
    // Create hooks directory
    await fs.mkdir(CLAUDE_HOOKS_DIR, { recursive: true });

    // Create pre-bash.py hook
    const preBashHook = `#!/usr/bin/env python3
"""
CodeB Pre-Bash Hook
Blocks dangerous commands to protect infrastructure.
"""

import sys
import re

BLOCKED_PATTERNS = [
    # Direct container deletion
    r'podman\\s+rm\\s+-f',
    r'docker\\s+rm\\s+-f',

    # Volume deletion
    r'podman\\s+volume\\s+rm',
    r'docker\\s+volume\\s+rm',

    # Dangerous compose commands
    r'docker-compose\\s+down\\s+-v',
    r'podman-compose\\s+down\\s+-v',

    # Project folder deletion
    r'rm\\s+-rf\\s+/opt/codeb',

    # Database drop without confirmation
    r'DROP\\s+DATABASE',
    r'DROP\\s+TABLE',
]

def check_command(cmd):
    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, cmd, re.IGNORECASE):
            return False, f"Blocked: matches pattern '{pattern}'"
    return True, None

if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(0)

    cmd = ' '.join(sys.argv[1:])
    allowed, reason = check_command(cmd)

    if not allowed:
        print(f"🚫 Command blocked by CodeB hook: {reason}", file=sys.stderr)
        print(f"   Use 'we' CLI commands instead for safe operations.", file=sys.stderr)
        sys.exit(1)

    sys.exit(0)
`;

    const hookPath = path.join(CLAUDE_HOOKS_DIR, 'pre-bash.py');

    // Check if hook already exists
    if (existsSync(hookPath)) {
      console.log('   ℹ️  pre-bash.py (이미 존재)');
    } else {
      await fs.writeFile(hookPath, preBashHook);
      await fs.chmod(hookPath, 0o755);
      console.log('   ✅ pre-bash.py');
    }

    console.log(`   📍 위치: ~/.claude/hooks/`);
    return { installed: 1, skipped: 0 };

  } catch (err) {
    console.error('   ❌ Hooks 설치 오류:', err.message);
    return { installed: 0, skipped: 0 };
  }
}

// ================================================================
// 5. Configure Settings
// ================================================================
async function configureSettings() {
  console.log('\n⚙️  5. Settings 구성...');

  try {
    const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
    let settings = {};

    // Read existing settings
    if (existsSync(settingsPath)) {
      try {
        const content = await fs.readFile(settingsPath, 'utf-8');
        settings = JSON.parse(content);
      } catch {
        console.log('   ⚠️  기존 settings.json 파싱 실패. 새로 생성합니다.');
      }
    }

    let updated = false;

    // Add hooks configuration if not exists
    if (!settings.hooks) {
      settings.hooks = DEFAULT_HOOKS;
      updated = true;
      console.log('   ✅ Hooks 설정 추가');
    }

    // Block SSH access (팀원은 MCP API만 사용)
    if (!settings.permissions) {
      settings.permissions = {
        "deny": [
          "Bash(ssh:*)",       // SSH 직접 접속 금지
          "Bash(scp:*)",       // SCP 직접 접속 금지
          "Bash(rsync:*)"      // rsync 직접 접속 금지
        ],
        "allow": [
          "Bash(we *)",        // we CLI 명령어 허용
          "Bash(npm *)",       // npm 명령어 허용
          "Bash(git *)"        // git 명령어 허용
        ]
      };
      updated = true;
      console.log('   ✅ SSH 차단 설정 추가 (MCP API만 사용)');
    }

    if (updated) {
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
      console.log(`   📍 위치: ~/.claude/settings.json`);
    } else {
      console.log('   ℹ️  설정이 이미 구성되어 있습니다.');
    }

    return { configured: updated };

  } catch (err) {
    console.error('   ❌ Settings 구성 오류:', err.message);
    return { configured: false };
  }
}

// ================================================================
// Main Installation
// ================================================================
async function install() {
  console.log('\n' + '═'.repeat(60));
  console.log('🚀 we-cli 자동 설치 시작');
  console.log('═'.repeat(60));

  const results = {
    commands: await installCommands(),
    mcp: await installMcpServer(),
    rules: await installRuleFiles(),
    hooks: await installHooks(),
    settings: await configureSettings()
  };

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 설치 요약');
  console.log('═'.repeat(60));

  console.log(`\n   Commands:  ${results.commands.installed}개 설치`);
  console.log(`   MCP:       ${results.mcp.registered ? '등록 완료' : '이미 등록됨'}`);
  console.log(`   Rules:     ${results.rules.installed}개 설치`);
  console.log(`   Hooks:     ${results.hooks.installed}개 설치`);
  console.log(`   Settings:  ${results.settings.configured ? '구성 완료' : '이미 구성됨'}`);

  console.log('\n🎯 사용 가능한 명령어:');
  console.log('   we workflow init <project>  - 프로젝트 초기화');
  console.log('   we deploy <project>         - 프로젝트 배포');
  console.log('   we health                   - 시스템 상태 점검');
  console.log('   we domain                   - 도메인 관리');
  console.log('');
  console.log('   /we:init                    - Claude Code 슬래시 명령어');
  console.log('   /we:deploy                  - Claude Code 배포 명령어');
  console.log('   /we:analyze                 - Claude Code 분석 명령어');

  console.log('\n' + '═'.repeat(60));
  console.log('✅ 설치 완료! Claude Code를 재시작하여 변경사항을 적용하세요.');
  console.log('═'.repeat(60) + '\n');
}

// Run installation
install().catch(err => {
  console.error('❌ 설치 중 오류 발생:', err.message);
  // Don't exit with error - allow npm install to continue
  process.exit(0);
});
