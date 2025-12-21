/**
 * Team Management Command
 *
 * 팀원 관리 - 추가/삭제/목록/권한 설정
 * Admin만 SSH 접속 가능, 나머지는 MCP API만 사용
 *
 * Commands:
 * - we team list           팀원 목록
 * - we team add            팀원 추가
 * - we team remove <id>    팀원 삭제
 * - we team role <id>      역할 변경
 * - we team status         팀 현황 요약
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Config path - 프로젝트 루트의 config 폴더
const CONFIG_PATH = join(__dirname, '..', '..', '..', 'config', 'team-members.json');
const API_KEYS_PATH = join(__dirname, '..', '..', '..', 'config', 'api-keys.json');

/**
 * Generate secure API Key
 * Format: codeb_{role}_{random}
 */
function generateApiKey(role) {
  const prefix = role === 'admin' ? 'codeb_admin' : role === 'developer' ? 'codeb_dev' : 'codeb_view';
  const random = randomBytes(16).toString('hex');
  return `${prefix}_${random}`;
}

/**
 * Update api-keys.json for middleware
 */
function updateApiKeys(config) {
  const activeApiKeys = config.members
    .filter(m => m.active && m.apiKey)
    .map(m => m.apiKey);

  const configDir = dirname(API_KEYS_PATH);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  writeFileSync(API_KEYS_PATH, JSON.stringify({
    keys: activeApiKeys,
    updatedAt: new Date().toISOString()
  }, null, 2));
}

// ============================================================================
// Config Management
// ============================================================================

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    // 기본 설정 생성
    const defaultConfig = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      members: [
        {
          id: 'admin',
          name: 'Admin',
          email: 'admin@codeb.kr',
          role: 'admin',
          permissions: {
            ssh: true,
            deploy: true,
            envManage: true,
            teamManage: true,
            serverConfig: true
          },
          createdAt: new Date().toISOString(),
          active: true
        }
      ],
      roles: {
        admin: {
          description: '전체 관리자 - SSH 직접 접속 가능',
          defaultPermissions: {
            ssh: true,
            deploy: true,
            envManage: true,
            teamManage: true,
            serverConfig: true
          }
        },
        developer: {
          description: '개발자 - MCP API만 사용 (SSH 금지)',
          defaultPermissions: {
            ssh: false,
            deploy: true,
            envManage: false,
            teamManage: false,
            serverConfig: false
          }
        },
        viewer: {
          description: '뷰어 - 읽기 전용',
          defaultPermissions: {
            ssh: false,
            deploy: false,
            envManage: false,
            teamManage: false,
            serverConfig: false
          }
        }
      }
    };

    // config 디렉토리 생성
    const configDir = dirname(CONFIG_PATH);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    saveConfig(defaultConfig);
    return defaultConfig;
  }

  const content = readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(content);
}

function saveConfig(config) {
  config.updatedAt = new Date().toISOString();

  const configDir = dirname(CONFIG_PATH);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

  // Update api-keys.json for middleware
  updateApiKeys(config);
}

// ============================================================================
// Commands
// ============================================================================

/**
 * we team list - 팀원 목록
 */
export async function teamList(options = {}) {
  const config = loadConfig();

  console.log(chalk.cyan('\n👥 Team Members\n'));

  // 테이블 헤더
  console.log(chalk.gray('─'.repeat(80)));
  console.log(
    chalk.bold(
      padRight('ID', 12) +
      padRight('Name', 18) +
      padRight('Role', 12) +
      padRight('SSH', 6) +
      padRight('Deploy', 8) +
      padRight('Status', 10)
    )
  );
  console.log(chalk.gray('─'.repeat(80)));

  // 멤버 목록
  for (const member of config.members) {
    const roleColor = member.role === 'admin' ? chalk.red :
                      member.role === 'developer' ? chalk.blue : chalk.gray;

    const sshIcon = member.permissions.ssh ? chalk.green('✓') : chalk.red('✗');
    const deployIcon = member.permissions.deploy ? chalk.green('✓') : chalk.red('✗');
    const statusText = member.active ? chalk.green('Active') : chalk.red('Inactive');

    console.log(
      chalk.white(padRight(member.id, 12)) +
      padRight(member.name, 18) +
      roleColor(padRight(member.role, 12)) +
      padRight(sshIcon, 6) +
      padRight(deployIcon, 8) +
      statusText
    );
  }

  console.log(chalk.gray('─'.repeat(80)));
  console.log(chalk.gray(`\nTotal: ${config.members.length} members`));
  console.log(chalk.gray(`Config: ${CONFIG_PATH}`));
}

/**
 * we team add - 팀원 추가
 */
export async function teamAdd(options = {}) {
  console.log(chalk.cyan('\n➕ Add Team Member\n'));

  const config = loadConfig();

  // Interactive prompts
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Name:',
      validate: input => input.length > 0 || 'Name is required'
    },
    {
      type: 'input',
      name: 'email',
      message: 'Email:',
      validate: input => {
        if (!input.includes('@')) return 'Invalid email';
        if (config.members.some(m => m.email === input)) return 'Email already exists';
        return true;
      }
    },
    {
      type: 'list',
      name: 'role',
      message: 'Role:',
      choices: [
        { name: 'Developer (SSH 금지, MCP API만 사용)', value: 'developer' },
        { name: 'Viewer (읽기 전용)', value: 'viewer' },
        { name: 'Admin (SSH 허용 - 주의!)', value: 'admin' }
      ],
      default: 'developer'
    }
  ]);

  // Generate ID
  const id = answers.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

  // Check duplicate ID
  if (config.members.some(m => m.id === id)) {
    console.log(chalk.red(`\n❌ ID '${id}' already exists`));
    return;
  }

  // Get role default permissions
  const roleConfig = config.roles[answers.role];

  // Generate API Key
  const apiKey = generateApiKey(answers.role);

  const newMember = {
    id,
    name: answers.name,
    email: answers.email,
    role: answers.role,
    apiKey,
    permissions: { ...roleConfig.defaultPermissions },
    createdAt: new Date().toISOString(),
    active: true
  };

  config.members.push(newMember);
  saveConfig(config);

  console.log(chalk.green(`\n✅ Member added successfully!`));
  console.log(chalk.gray(`   ID: ${id}`));
  console.log(chalk.gray(`   Role: ${answers.role}`));
  console.log(chalk.gray(`   SSH: ${newMember.permissions.ssh ? 'Allowed' : 'Blocked'}`));
  console.log('');
  console.log(chalk.yellow('═'.repeat(60)));
  console.log(chalk.yellow.bold('   🔑 API Key (CODEB_API_KEY)'));
  console.log(chalk.yellow('═'.repeat(60)));
  console.log(chalk.white.bold(`   ${apiKey}`));
  console.log(chalk.yellow('═'.repeat(60)));
  console.log('');
  console.log(chalk.red('   ⚠️  이 키는 한 번만 표시됩니다!'));
  console.log(chalk.gray('   GitHub Secrets에 CODEB_API_KEY로 저장하세요.'));
}

/**
 * we team remove <id> - 팀원 삭제
 */
export async function teamRemove(id, options = {}) {
  if (!id) {
    console.log(chalk.red('\n❌ ID required'));
    console.log(chalk.gray('Usage: we team remove <member-id>'));
    return;
  }

  if (id === 'admin') {
    console.log(chalk.red('\n❌ Cannot remove admin'));
    return;
  }

  const config = loadConfig();
  const memberIndex = config.members.findIndex(m => m.id === id);

  if (memberIndex === -1) {
    console.log(chalk.red(`\n❌ Member '${id}' not found`));
    return;
  }

  const member = config.members[memberIndex];

  // Confirm
  if (!options.force) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Remove ${member.name} (${member.email})?`,
      default: false
    }]);

    if (!confirm) {
      console.log(chalk.gray('Cancelled'));
      return;
    }
  }

  config.members.splice(memberIndex, 1);
  saveConfig(config);

  console.log(chalk.green(`\n✅ Member '${id}' removed`));
}

/**
 * we team role <id> <role> - 역할 변경
 */
export async function teamRole(id, newRole, options = {}) {
  if (!id) {
    console.log(chalk.red('\n❌ ID required'));
    console.log(chalk.gray('Usage: we team role <member-id> <role>'));
    return;
  }

  const config = loadConfig();
  const member = config.members.find(m => m.id === id);

  if (!member) {
    console.log(chalk.red(`\n❌ Member '${id}' not found`));
    return;
  }

  // Interactive if role not specified
  if (!newRole) {
    const answers = await inquirer.prompt([{
      type: 'list',
      name: 'role',
      message: `Change role for ${member.name}:`,
      choices: [
        { name: 'Developer (SSH 금지)', value: 'developer' },
        { name: 'Viewer (읽기 전용)', value: 'viewer' },
        { name: 'Admin (SSH 허용)', value: 'admin' }
      ],
      default: member.role
    }]);
    newRole = answers.role;
  }

  if (!config.roles[newRole]) {
    console.log(chalk.red(`\n❌ Invalid role: ${newRole}`));
    console.log(chalk.gray('Valid roles: admin, developer, viewer'));
    return;
  }

  // Prevent changing admin role
  if (id === 'admin' && newRole !== 'admin') {
    console.log(chalk.red('\n❌ Cannot change admin role'));
    return;
  }

  const oldRole = member.role;
  member.role = newRole;
  member.permissions = { ...config.roles[newRole].defaultPermissions };

  saveConfig(config);

  console.log(chalk.green(`\n✅ Role changed: ${oldRole} → ${newRole}`));
  console.log(chalk.gray(`   SSH: ${member.permissions.ssh ? 'Allowed' : 'Blocked'}`));
}

/**
 * we team status - 팀 현황 요약
 */
export async function teamStatus(options = {}) {
  const config = loadConfig();

  console.log(chalk.cyan('\n📊 Team Status\n'));

  const activeCount = config.members.filter(m => m.active).length;
  const adminCount = config.members.filter(m => m.role === 'admin').length;
  const devCount = config.members.filter(m => m.role === 'developer').length;
  const viewerCount = config.members.filter(m => m.role === 'viewer').length;
  const sshCount = config.members.filter(m => m.permissions.ssh).length;

  console.log(chalk.white('  Total Members: ') + chalk.bold(config.members.length));
  console.log(chalk.white('  Active:        ') + chalk.green(activeCount));
  console.log('');
  console.log(chalk.white('  By Role:'));
  console.log(chalk.red(`    Admin:     ${adminCount}`));
  console.log(chalk.blue(`    Developer: ${devCount}`));
  console.log(chalk.gray(`    Viewer:    ${viewerCount}`));
  console.log('');
  console.log(chalk.white('  SSH Access:    ') + chalk.yellow(`${sshCount} members`));
  console.log('');
  console.log(chalk.gray(`  Last Updated: ${config.updatedAt}`));
  console.log(chalk.gray(`  Config File:  ${CONFIG_PATH}`));
}

/**
 * we team toggle <id> - 활성/비활성 토글
 */
export async function teamToggle(id, options = {}) {
  if (!id) {
    console.log(chalk.red('\n❌ ID required'));
    return;
  }

  if (id === 'admin') {
    console.log(chalk.red('\n❌ Cannot deactivate admin'));
    return;
  }

  const config = loadConfig();
  const member = config.members.find(m => m.id === id);

  if (!member) {
    console.log(chalk.red(`\n❌ Member '${id}' not found`));
    return;
  }

  member.active = !member.active;
  saveConfig(config);

  console.log(chalk.green(`\n✅ ${member.name} is now ${member.active ? 'active' : 'inactive'}`));
}

// ============================================================================
// Helpers
// ============================================================================

function padRight(str, len) {
  return (str || '').toString().padEnd(len);
}

// ============================================================================
// Main Export
// ============================================================================

export async function team(action, arg1, arg2, options = {}) {
  switch (action) {
    case 'list':
    case 'ls':
      await teamList(options);
      break;

    case 'add':
      await teamAdd(options);
      break;

    case 'remove':
    case 'rm':
      await teamRemove(arg1, options);
      break;

    case 'role':
      await teamRole(arg1, arg2, options);
      break;

    case 'status':
      await teamStatus(options);
      break;

    case 'toggle':
      await teamToggle(arg1, options);
      break;

    default:
      showUsage();
  }
}

function showUsage() {
  console.log(chalk.cyan('\n👥 Team Management\n'));
  console.log('Commands:');
  console.log(chalk.white('  we team list           ') + chalk.gray('팀원 목록'));
  console.log(chalk.white('  we team add            ') + chalk.gray('팀원 추가 (interactive)'));
  console.log(chalk.white('  we team remove <id>    ') + chalk.gray('팀원 삭제'));
  console.log(chalk.white('  we team role <id>      ') + chalk.gray('역할 변경'));
  console.log(chalk.white('  we team toggle <id>    ') + chalk.gray('활성/비활성 토글'));
  console.log(chalk.white('  we team status         ') + chalk.gray('팀 현황 요약'));
  console.log('');
  console.log('Roles:');
  console.log(chalk.red('  admin      ') + chalk.gray('SSH 직접 접속 가능'));
  console.log(chalk.blue('  developer  ') + chalk.gray('MCP API만 사용 (SSH 금지)'));
  console.log(chalk.gray('  viewer     ') + chalk.gray('읽기 전용'));
  console.log('');
  console.log('Examples:');
  console.log(chalk.gray('  we team list'));
  console.log(chalk.gray('  we team add'));
  console.log(chalk.gray('  we team remove dev5'));
  console.log(chalk.gray('  we team role dev3 viewer'));
}

export default team;
