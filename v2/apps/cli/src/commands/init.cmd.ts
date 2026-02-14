/**
 * @codeb/cli - Init Command
 *
 * `we init <apiKey>` 실행 시:
 * 1. API 키 저장 (~/.codeb/config.json)
 * 2. 서버 버전 확인 (checkServerVersion)
 * 3. 프로젝트 감지 (package.json name)
 * 4. CLAUDE.md 생성 (프로젝트 루트)
 *
 * 스킬/MCP/훅은 install.sh로 전역 설치 (~/.claude/).
 * we init은 프로젝트별 CLAUDE.md + API 키 설정만 담당.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { getVersion, checkServerVersion } from '@codeb/shared';
import { loadConfig, saveConfig } from '../lib/config.js';
import { generateClaudeSetup } from '../templates/claude-setup.js';

// ============================================================================
// Command Factory
// ============================================================================

export function createInitCommand(): Command {
  const initCmd = new Command('init')
    .description('Project initialization (API key + CLAUDE.md)')
    .argument('[apiKey]', 'API Key (format: codeb_{teamId}_{role}_{token})')
    .option('-p, --path <path>', 'Target project path (default: current directory)')
    .option('-f, --force', 'Overwrite existing CLAUDE.md')
    .option('--no-claude', 'Skip CLAUDE.md setup (API key only)')
    .action(async (apiKey, options) => {
      await initProject(apiKey, options);
    });

  // init config
  initCmd
    .command('config')
    .description('CLI config management (show|set|path)')
    .argument('[action]', 'Action (show|set|path)', 'show')
    .option('--key <key>', 'Configuration key for set action')
    .option('--value <value>', 'Configuration value for set action')
    .action(async (action, options) => {
      await configAction(action, options);
    });

  return initCmd;
}

// ============================================================================
// Init Project
// ============================================================================

async function initProject(
  apiKey?: string,
  options?: { path?: string; force?: boolean; claude?: boolean },
): Promise<void> {
  console.log(chalk.blue.bold('\n-- CodeB Project Initialization --\n'));

  if (!apiKey) {
    console.log(chalk.yellow('Usage: we init <apiKey>'));
    console.log(chalk.gray('\nAPI Key format: codeb_{teamId}_{role}_{token}'));
    console.log(chalk.gray('Example: we init codeb_myteam_admin_abc123xyz'));
    console.log(chalk.gray('\nThis will:'));
    console.log(chalk.gray('  1. Save API key to ~/.codeb/config.json'));
    console.log(chalk.gray('  2. Check server version'));
    console.log(chalk.gray('  3. Generate CLAUDE.md for this project'));
    console.log(chalk.gray('\nSkills/MCP/Hooks are installed globally via install.sh.'));
    console.log(chalk.gray('\nOptions:'));
    console.log(chalk.gray('  -f, --force     Overwrite existing CLAUDE.md'));
    console.log(chalk.gray('  --no-claude     Skip CLAUDE.md (API key only)'));
    return;
  }

  // Validate API key format
  if (!apiKey.startsWith('codeb_')) {
    console.log(chalk.red('Invalid API key format. Must start with "codeb_"'));
    return;
  }

  const projectDir = options?.path || process.cwd();
  const spinner = ora('Initializing...').start();

  try {
    // Step 1: Save API key
    spinner.text = 'Saving API key...';
    const config = await loadConfig();
    config.apiKey = apiKey;
    await saveConfig(config);

    // Step 2: Server version check
    spinner.text = 'Checking server version...';
    const version = getVersion();
    const versionCheck = await checkServerVersion(version);

    let serverInfo = '';
    if (versionCheck.serverUnreachable) {
      serverInfo = chalk.gray(' (server unreachable - offline mode)');
    } else if (versionCheck.updateRequired) {
      serverInfo = chalk.yellow(` (update: v${version} -> v${versionCheck.serverVersion})`);
    } else {
      serverInfo = chalk.green(` (server v${versionCheck.serverVersion})`);
    }

    if (!versionCheck.compatible) {
      spinner.fail('Version mismatch');
      console.error(chalk.red(`Server v${versionCheck.serverVersion} vs CLI v${version}`));
      console.error(chalk.yellow(versionCheck.message || ''));
      return;
    }

    spinner.succeed(`API key saved${serverInfo}`);

    // Step 3: Detect project
    const projectName = await detectProjectName(projectDir);
    console.log(chalk.green('  Project: ') + chalk.white(projectName));
    console.log(chalk.green('  API URL: ') + chalk.gray(config.apiUrl));
    console.log(chalk.green('  Version: ') + chalk.gray(version));

    // Step 4: Generate CLAUDE.md
    if (options?.claude !== false) {
      console.log('');
      await setupClaudeMd(projectDir, {
        projectName,
        apiKey,
        apiUrl: config.apiUrl,
        version,
        force: options?.force || false,
      });
    }

    console.log(chalk.cyan.bold('\n  Ready! Try:'));
    console.log(chalk.gray('    we health          # 시스템 상태 확인'));
    console.log(chalk.gray('    /we:deploy         # Claude Code에서 배포'));
    console.log(chalk.gray('    /we:health         # Claude Code에서 헬스체크'));
    console.log('');
  } catch (error) {
    spinner.fail('Initialization failed');
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

// ============================================================================
// CLAUDE.md Setup
// ============================================================================

async function setupClaudeMd(
  projectDir: string,
  params: {
    projectName: string;
    apiKey: string;
    apiUrl: string;
    version: string;
    force: boolean;
  },
): Promise<void> {
  const setup = generateClaudeSetup({
    projectName: params.projectName,
    apiKey: params.apiKey,
    apiUrl: params.apiUrl,
    version: params.version,
  });

  // generateClaudeSetup returns only CLAUDE.md
  const file = setup.files[0];
  if (!file) return;

  const filePath = join(projectDir, file.path);

  // Skip if exists (unless --force)
  if (!params.force) {
    try {
      await access(filePath);
      console.log(chalk.gray(`  CLAUDE.md already exists. Use --force to overwrite.`));
      return;
    } catch {
      // File doesn't exist, create it
    }
  }

  await writeFile(filePath, file.content, 'utf-8');
  console.log(chalk.green('  CLAUDE.md') + chalk.gray(' created'));
}

// ============================================================================
// Helpers
// ============================================================================

async function detectProjectName(projectDir: string): Promise<string> {
  try {
    const pkgJson = JSON.parse(await readFile(join(projectDir, 'package.json'), 'utf-8'));
    if (pkgJson.name) {
      // @scope/name → name 만 추출
      const name = pkgJson.name.replace(/^@[^/]+\//, '');
      return name;
    }
  } catch {
    // No package.json
  }

  // Fallback: directory name
  const parts = projectDir.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'my-project';
}

// ============================================================================
// Config Action
// ============================================================================

async function configAction(
  action: string,
  options: { key?: string; value?: string },
): Promise<void> {
  const config = await loadConfig();

  switch (action) {
    case 'show':
      console.log(chalk.blue.bold('\n-- CLI Configuration --\n'));
      console.log(chalk.gray(`  API URL:  ${config.apiUrl}`));
      console.log(chalk.gray(`  API Key:  ${config.apiKey ? config.apiKey.slice(0, 20) + '...' : '(not set)'}`));
      console.log(chalk.gray(`  Config:   ~/.codeb/config.json`));
      break;

    case 'set':
      if (!options.key || !options.value) {
        console.log(chalk.yellow('Usage: we init config set --key <key> --value <value>'));
        console.log(chalk.gray('Available keys: apiUrl, apiKey'));
        return;
      }
      (config as any)[options.key] = options.value;
      await saveConfig(config);
      console.log(chalk.green(`Set ${options.key} = ${options.value}`));
      break;

    case 'path':
      console.log('~/.codeb/config.json');
      break;

    default:
      console.log(chalk.red(`Unknown action: ${action}`));
      console.log(chalk.gray('Available: show, set, path'));
  }
}
