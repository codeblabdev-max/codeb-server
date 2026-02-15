/**
 * @codeb/cli - Update Command
 *
 * `we update` 실행 시:
 * 1. releases.codeb.kr에서 최신 tarball 다운로드
 * 2. CLAUDE.md → 현재 프로젝트 디렉토리 (기존 백업)
 * 3. Skills → ~/.claude/skills/we/
 * 4. Hooks → ~/.claude/hooks/
 * 5. Global CLAUDE.md → ~/.claude/CLAUDE.md
 *
 * install.sh 없이도 프로젝트별 최신 파일 다운로드 가능.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'node:child_process';
import { access, copyFile, readFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { getVersion } from '@codeb/shared';

// ============================================================================
// Constants
// ============================================================================

const RELEASES_URL = process.env.CODEB_RELEASES_URL || 'https://releases.codeb.kr';
const CLAUDE_DIR = join(homedir(), '.claude');

// ============================================================================
// Command Factory
// ============================================================================

export function createUpdateCommand(): Command {
  const updateCmd = new Command('update')
    .description('Download latest CLAUDE.md, skills, hooks from server')
    .option('-p, --path <path>', 'Target project path (default: current directory)')
    .option('--global-only', 'Update global files only (~/.claude/)')
    .option('--project-only', 'Update project CLAUDE.md only')
    .option('--no-backup', 'Skip backup of existing files')
    .action(async (options) => {
      await updateFiles(options);
    });

  return updateCmd;
}

// ============================================================================
// Update Files
// ============================================================================

async function updateFiles(options: {
  path?: string;
  globalOnly?: boolean;
  projectOnly?: boolean;
  backup?: boolean;
}): Promise<void> {
  console.log(chalk.blue.bold('\n-- CodeB Update --\n'));

  const projectDir = options.path || process.cwd();
  const doBackup = options.backup !== false;
  const spinner = ora('Checking latest version...').start();

  try {
    // Step 1: Get latest version info
    const versionJson = execSync(`curl -sf "${RELEASES_URL}/cli/version.json"`, {
      encoding: 'utf-8',
      timeout: 10000,
    }).trim();

    const versionInfo = JSON.parse(versionJson);
    const latestVersion = versionInfo.version;
    const currentVersion = getVersion();

    spinner.succeed(`Server: v${latestVersion} / Local: v${currentVersion}`);

    // Step 2: Download and extract tarball
    spinner.start('Downloading latest tarball...');
    const tarballUrl = `${RELEASES_URL}/cli/codeb-cli-${latestVersion}.tar.gz`;
    const tmpFile = join(tmpdir(), 'codeb-cli-update.tar.gz');
    const extractDir = join(tmpdir(), `codeb-cli-${latestVersion}`);

    execSync(`curl -fSL "${tarballUrl}" -o "${tmpFile}"`, {
      timeout: 30000,
      stdio: 'pipe',
    });

    execSync(`rm -rf "${extractDir}" && tar -xzf "${tmpFile}" -C "${tmpdir()}"`, {
      timeout: 10000,
      stdio: 'pipe',
    });

    spinner.succeed('Downloaded and extracted');

    let updatedCount = 0;

    // Step 3: Update project-level CLAUDE.md
    if (!options.globalOnly) {
      console.log('');
      console.log(chalk.bold('Project files:'));

      const claudeMdSrc = join(extractDir, 'CLAUDE.md');
      const claudeMdDest = join(projectDir, 'CLAUDE.md');

      try {
        await access(claudeMdSrc);

        if (doBackup) {
          try {
            await access(claudeMdDest);
            await copyFile(claudeMdDest, `${claudeMdDest}.bak`);
            console.log(chalk.gray(`  Backup: CLAUDE.md -> CLAUDE.md.bak`));
          } catch {
            // No existing file to backup
          }
        }

        await copyFile(claudeMdSrc, claudeMdDest);
        console.log(chalk.green(`  CLAUDE.md`) + chalk.gray(` -> ${projectDir}/`));
        updatedCount++;
      } catch {
        console.log(chalk.yellow('  CLAUDE.md not found in tarball'));
      }
    }

    // Step 4: Update global files (~/.claude/)
    if (!options.projectOnly) {
      console.log('');
      console.log(chalk.bold('Global files (~/.claude/):'));

      // CLAUDE.md (global)
      const globalClaudeSrc = join(extractDir, 'CLAUDE.md');
      const globalClaudeDest = join(CLAUDE_DIR, 'CLAUDE.md');
      try {
        await access(globalClaudeSrc);
        await mkdir(CLAUDE_DIR, { recursive: true });

        if (doBackup) {
          try {
            await access(globalClaudeDest);
            await copyFile(globalClaudeDest, `${globalClaudeDest}.bak`);
          } catch {
            // No existing file
          }
        }

        await copyFile(globalClaudeSrc, globalClaudeDest);
        console.log(chalk.green('  CLAUDE.md') + chalk.gray(' -> ~/.claude/'));
        updatedCount++;
      } catch {
        // Skip
      }

      // Skills
      const skillsSrc = join(extractDir, 'skills', 'we');
      const skillsDest = join(CLAUDE_DIR, 'skills', 'we');
      try {
        await access(skillsSrc);
        await mkdir(skillsDest, { recursive: true });

        const skillFiles = (await readdir(skillsSrc)).filter((f) => f.endsWith('.md'));
        for (const file of skillFiles) {
          await copyFile(join(skillsSrc, file), join(skillsDest, file));
        }

        if (skillFiles.length > 0) {
          console.log(
            chalk.green(`  Skills: ${skillFiles.length} files`) +
              chalk.gray(' -> ~/.claude/skills/we/'),
          );
          updatedCount += skillFiles.length;
        }
      } catch {
        console.log(chalk.gray('  Skills: (not found in tarball)'));
      }

      // Hooks
      const hooksSrc = join(extractDir, 'hooks');
      const hooksDest = join(CLAUDE_DIR, 'hooks');
      try {
        await access(hooksSrc);
        await mkdir(hooksDest, { recursive: true });

        const hookFiles = await readdir(hooksSrc);
        for (const file of hookFiles) {
          await copyFile(join(hooksSrc, file), join(hooksDest, file));
        }

        if (hookFiles.length > 0) {
          console.log(
            chalk.green(`  Hooks: ${hookFiles.length} files`) +
              chalk.gray(' -> ~/.claude/hooks/'),
          );
          updatedCount += hookFiles.length;
        }
      } catch {
        console.log(chalk.gray('  Hooks: (not found in tarball)'));
      }
    }

    // Cleanup
    execSync(`rm -rf "${extractDir}" "${tmpFile}"`, { stdio: 'pipe' });

    // Summary
    console.log('');
    if (updatedCount > 0) {
      console.log(chalk.green.bold(`  ${updatedCount} files updated to v${latestVersion}`));
    } else {
      console.log(chalk.yellow('  No files were updated'));
    }
    console.log('');
  } catch (error) {
    spinner.fail('Update failed');
    console.log(
      chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`),
    );
  }
}
