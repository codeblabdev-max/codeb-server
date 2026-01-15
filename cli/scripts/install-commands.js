#!/usr/bin/env node

/**
 * /we: Claude Code 자동 설치 스크립트
 * 버전은 VERSION 파일에서 관리됩니다 (SSOT)
 *
 * npm install -g @codeblabdev-max/we-cli 시 자동으로 실행됩니다.
 *
 * 설치 항목:
 * 1. MCP Server: ~/.claude/settings.json에 codeb-deploy 등록 (전역 명령어 사용)
 * 2. Slash Commands: ~/.claude/commands/we/ 디렉토리에 명령어 파일 복사
 * 3. Rule Files: ~/.claude/CLAUDE.md 복사 (기존 파일 백업)
 * 4. Skills: ~/.claude/skills/ 디렉토리에 스킬 파일 복사
 * 5. Hooks: ~/.claude/hooks/ 디렉토리에 pre-bash.py 설치
 * 6. API Key Dir: ~/.codeb/ 디렉토리 생성
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { existsSync } from 'fs';

// Fix cwd issue during npm postinstall (cwd may be deleted)
try {
  process.cwd();
} catch {
  process.chdir(os.homedir());
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const PACKAGE_ROOT = path.join(__dirname, '..');
const HOME_DIR = os.homedir();
const CLAUDE_DIR = path.join(HOME_DIR, '.claude');
const CLAUDE_SETTINGS = path.join(CLAUDE_DIR, 'settings.json');

// Source directories
const COMMANDS_SOURCE = path.join(PACKAGE_ROOT, 'commands', 'we');
const RULES_SOURCE = path.join(PACKAGE_ROOT, 'rules');
const SKILLS_SOURCE = path.join(PACKAGE_ROOT, 'skills');

// Target directories
const CLAUDE_COMMANDS_DIR = path.join(CLAUDE_DIR, 'commands', 'we');
const CLAUDE_HOOKS_DIR = path.join(CLAUDE_DIR, 'hooks');
const CLAUDE_SKILLS_DIR = path.join(CLAUDE_DIR, 'skills');

// ================================================================
// 1. Install MCP Server (claude mcp add 명령어 사용)
// ================================================================
async function installMcpServer() {
  console.log('\n🔌 1. MCP Server 등록 (claude mcp add)...');

  try {
    const { execSync } = await import('child_process');

    // Get the installed package path
    const mcpPath = path.join(PACKAGE_ROOT, 'bin', 'codeb-mcp.js');

    // Check if already registered
    try {
      const listOutput = execSync('claude mcp list 2>&1', { encoding: 'utf-8', timeout: 30000 });
      if (listOutput.includes('codeb-deploy')) {
        // Remove existing registration first (may be old path)
        console.log('   📋 기존 MCP 설정 제거 중...');
        try {
          execSync('claude mcp remove codeb-deploy -s user 2>&1', { encoding: 'utf-8', timeout: 10000 });
        } catch {
          // Ignore if not found in user scope
        }
        try {
          execSync('claude mcp remove codeb-deploy -s project 2>&1', { encoding: 'utf-8', timeout: 10000 });
        } catch {
          // Ignore if not found in project scope
        }
      }
    } catch {
      // claude mcp list failed - Claude Code CLI may not be available
      console.log('   ⚠️  Claude Code CLI를 찾을 수 없습니다. 수동 등록이 필요합니다.');
      console.log('   📋 수동 등록: claude mcp add codeb-deploy -s user -e CODEB_API_URL=https://api.codeb.kr -- node ' + mcpPath);
      return { registered: false, updated: false, manual: true };
    }

    // Register MCP server using claude mcp add
    const addCommand = `claude mcp add codeb-deploy -s user -e CODEB_API_URL=https://api.codeb.kr -- node "${mcpPath}"`;

    try {
      execSync(addCommand, { encoding: 'utf-8', timeout: 30000 });
      console.log('   ✅ codeb-deploy MCP 서버 등록 완료');
      console.log('   📍 명령어: node ' + mcpPath);
      console.log('   📍 범위: user (모든 프로젝트에서 사용 가능)');
      return { registered: true, updated: false };
    } catch (err) {
      console.error('   ❌ MCP 등록 실패:', err.message);
      console.log('   📋 수동 등록: ' + addCommand);
      return { registered: false, updated: false };
    }

  } catch (err) {
    console.error('   ❌ MCP 서버 등록 오류:', err.message);
    return { registered: false, updated: false };
  }
}

// ================================================================
// 2. Install Slash Commands
// ================================================================
async function installCommands() {
  console.log('\n📦 2. Slash Commands 설치...');

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
// 3. Install Rule Files (CLAUDE.md)
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
    return { installed, skipped };

  } catch (err) {
    console.error('   ❌ 규칙 파일 설치 오류:', err.message);
    return { installed: 0, skipped: 0 };
  }
}

// ================================================================
// 4. Install Skills (Auto-activation)
// ================================================================
async function installSkills() {
  console.log('\n🎯 4. Skills 설치 (자동 활성화)...');

  try {
    // Check source directory
    try {
      await fs.access(SKILLS_SOURCE);
    } catch {
      console.log('   ⚠️  Skills 소스 디렉토리가 없습니다. 건너뜁니다.');
      return { installed: 0, skipped: 0 };
    }

    // Create target directory
    await fs.mkdir(CLAUDE_SKILLS_DIR, { recursive: true });

    // Get skill directories
    const skillDirs = await fs.readdir(SKILLS_SOURCE);
    let installed = 0;
    let skipped = 0;

    for (const skillName of skillDirs) {
      const srcSkillDir = path.join(SKILLS_SOURCE, skillName);
      const destSkillDir = path.join(CLAUDE_SKILLS_DIR, skillName);

      // Check if it's a directory
      const stat = await fs.stat(srcSkillDir);
      if (!stat.isDirectory()) continue;

      // Check for SKILL.md
      const skillMdPath = path.join(srcSkillDir, 'SKILL.md');
      if (!existsSync(skillMdPath)) continue;

      try {
        // Create skill directory
        await fs.mkdir(destSkillDir, { recursive: true });

        // Copy SKILL.md
        const destSkillMd = path.join(destSkillDir, 'SKILL.md');
        await fs.copyFile(skillMdPath, destSkillMd);

        installed++;
        console.log(`   ✅ ${skillName}`);
      } catch (err) {
        console.log(`   ❌ ${skillName}: ${err.message}`);
        skipped++;
      }
    }

    console.log(`   📍 위치: ~/.claude/skills/`);
    return { installed, skipped };

  } catch (err) {
    console.error('   ❌ Skills 설치 오류:', err.message);
    return { installed: 0, skipped: 0 };
  }
}

// ================================================================
// 5. Install Hooks
// ================================================================
async function installHooks() {
  console.log('\n🪝 5. Hooks 설치...');

  try {
    // Create hooks directory
    await fs.mkdir(CLAUDE_HOOKS_DIR, { recursive: true });

    // Create pre-bash.py hook
    const preBashHook = `#!/usr/bin/env python3
"""
CodeB Pre-Bash Hook v7.0
Blocks dangerous commands to protect infrastructure.
"""

import sys
import re

BLOCKED_PATTERNS = [
    # Direct container deletion
    r'docker\\s+rm\\s+-f',
    r'docker\\s+system\\s+prune\\s+-a',
    r'docker\\s+volume\\s+prune',

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
// 6. Setup API Key Directory
// ================================================================
async function setupApiKeyDir() {
  console.log('\n🔑 6. API 키 디렉토리 설정...');

  try {
    const codebDir = path.join(HOME_DIR, '.codeb');
    const configPath = path.join(codebDir, 'config.json');
    const examplePath = path.join(codebDir, 'config.example.json');

    // Create ~/.codeb directory
    await fs.mkdir(codebDir, { recursive: true });

    // Create example config file
    const exampleContent = {
      "CODEB_API_URL": "https://api.codeb.kr",
      "CODEB_API_KEY": "codeb_팀ID_역할_토큰"
    };

    await fs.writeFile(examplePath, JSON.stringify(exampleContent, null, 2));
    console.log('   ✅ config.example.json 생성');

    // Check if config already exists
    if (existsSync(configPath)) {
      console.log('   ℹ️  config.json 파일이 이미 존재합니다');
    } else {
      console.log('   ⚠️  API 키 설정 필요: we init <YOUR_API_KEY>');
    }

    console.log(`   📍 위치: ~/.codeb/`);
    return { created: true };

  } catch (err) {
    console.error('   ❌ API 키 디렉토리 설정 오류:', err.message);
    return { created: false };
  }
}

// ================================================================
// Main Installation
// ================================================================
async function install() {
  // VERSION 파일에서 버전 읽기 (SSOT)
  let version = 'latest';
  try {
    const versionPaths = [
      path.join(__dirname, '..', 'VERSION'),
      path.join(__dirname, '..', '..', 'VERSION'),
    ];
    for (const p of versionPaths) {
      if (existsSync(p)) {
        const { readFileSync } = await import('fs');
        version = readFileSync(p, 'utf-8').trim();
        break;
      }
    }
  } catch {}

  console.log('\n' + '═'.repeat(60));
  console.log(`🚀 @codeblabdev-max/we-cli 설치 (v${version})`);
  console.log('═'.repeat(60));

  const results = {
    mcp: await installMcpServer(),
    commands: await installCommands(),
    rules: await installRuleFiles(),
    skills: await installSkills(),
    hooks: await installHooks(),
    apiKey: await setupApiKeyDir()
  };

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 설치 요약');
  console.log('═'.repeat(60));

  console.log(`\n   MCP:       ${results.mcp.registered ? '✅ 등록 완료 (codeb-mcp)' : 'ℹ️  이미 등록됨'}`);
  console.log(`   Commands:  ${results.commands.installed}개 설치`);
  console.log(`   Rules:     ${results.rules.installed}개 설치`);
  console.log(`   Skills:    ${results.skills.installed}개 설치`);
  console.log(`   Hooks:     ${results.hooks.installed}개 설치`);
  console.log(`   API Key:   ${results.apiKey.created ? '디렉토리 준비됨' : '설정 필요'}`);

  console.log('\n' + '─'.repeat(60));
  console.log('📋 다음 단계:');
  console.log('─'.repeat(60));
  console.log('\n   1. API 키 설정 (필수):');
  console.log('      we init codeb_팀ID_역할_토큰');
  console.log('');
  console.log('   2. Claude Code 재시작 (MCP 로드):');
  console.log('      VSCode: Cmd+Shift+P → "Claude: Restart"');
  console.log('');
  console.log('   3. 사용 가능한 명령어:');
  console.log('      /we:quick     - 팀원용 통합 명령어');
  console.log('      /we:deploy    - Blue-Green 배포');
  console.log('      /we:health    - 시스템 상태 확인');

  console.log('\n' + '═'.repeat(60));
  console.log('✅ 설치 완료!');
  console.log('═'.repeat(60) + '\n');
}

// Run installation
install().catch(err => {
  console.error('❌ 설치 중 오류 발생:', err.message);
  // Don't exit with error - allow npm install to continue
  process.exit(0);
});
