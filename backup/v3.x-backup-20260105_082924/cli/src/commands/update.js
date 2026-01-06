/**
 * Update Command
 *
 * Downloads and updates CLAUDE.md and other rule files from CLI package
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CLI rules source directory
const RULES_SOURCE = path.join(__dirname, '../../rules');

/**
 * Update CLAUDE.md and rule files
 */
export async function update(options) {
  console.log(chalk.cyan('\n📥 CodeB Rule Files Update\n'));

  const projectRoot = options.path || process.cwd();

  // Check if valid project directory
  const hasPackageJson = existsSync(path.join(projectRoot, 'package.json'));
  const hasGit = existsSync(path.join(projectRoot, '.git'));

  if (!hasPackageJson && !hasGit) {
    console.log(chalk.yellow('⚠️  Not a valid project directory (no package.json or .git)'));
    console.log(chalk.gray(`   Path: ${projectRoot}`));
    return;
  }

  const results = {
    updated: [],
    skipped: [],
    failed: []
  };

  // 1. Update project CLAUDE.md
  if (options.claudeMd !== false) {
    const spinner = ora('Updating CLAUDE.md...').start();
    try {
      const srcPath = path.join(RULES_SOURCE, 'CLAUDE.md');
      const destPath = path.join(projectRoot, 'CLAUDE.md');

      if (!existsSync(srcPath)) {
        spinner.fail('Source CLAUDE.md not found in CLI package');
        results.failed.push('CLAUDE.md');
      } else {
        // Backup existing if exists
        if (existsSync(destPath)) {
          const backupPath = `${destPath}.backup.${Date.now()}`;
          await fs.copyFile(destPath, backupPath);
          spinner.text = 'Backed up existing CLAUDE.md...';
        }

        // Copy new version
        await fs.copyFile(srcPath, destPath);

        // Read version from first line
        const content = await fs.readFile(destPath, 'utf-8');
        const firstLine = content.split('\n')[0];
        const versionMatch = firstLine.match(/v(\d+\.\d+\.\d+)/);
        const version = versionMatch ? versionMatch[1] : 'unknown';

        spinner.succeed(`CLAUDE.md updated to v${version}`);
        results.updated.push(`CLAUDE.md (v${version})`);
      }
    } catch (err) {
      spinner.fail(`Failed to update CLAUDE.md: ${err.message}`);
      results.failed.push('CLAUDE.md');
    }
  }

  // 2. Update ~/.claude/CLAUDE.md (global)
  if (options.global !== false) {
    const spinner = ora('Updating ~/.claude/CLAUDE.md...').start();
    try {
      const srcPath = path.join(RULES_SOURCE, 'CLAUDE.md');
      const homeClaudeDir = path.join(process.env.HOME, '.claude');
      const destPath = path.join(homeClaudeDir, 'CLAUDE.md');

      // Create ~/.claude if not exists
      if (!existsSync(homeClaudeDir)) {
        await fs.mkdir(homeClaudeDir, { recursive: true });
      }

      // Backup existing if exists
      if (existsSync(destPath)) {
        const backupPath = `${destPath}.backup.${Date.now()}`;
        await fs.copyFile(destPath, backupPath);
      }

      await fs.copyFile(srcPath, destPath);
      spinner.succeed('~/.claude/CLAUDE.md updated');
      results.updated.push('~/.claude/CLAUDE.md');
    } catch (err) {
      spinner.fail(`Failed to update ~/.claude/CLAUDE.md: ${err.message}`);
      results.failed.push('~/.claude/CLAUDE.md');
    }
  }

  // 3. Update DEPLOYMENT_RULES.md if exists
  if (options.rules !== false) {
    const spinner = ora('Updating DEPLOYMENT_RULES.md...').start();
    try {
      const srcPath = path.join(RULES_SOURCE, 'DEPLOYMENT_RULES.md');
      const destPath = path.join(projectRoot, 'DEPLOYMENT_RULES.md');

      if (!existsSync(srcPath)) {
        spinner.info('DEPLOYMENT_RULES.md not in CLI package');
        results.skipped.push('DEPLOYMENT_RULES.md');
      } else if (!existsSync(destPath) && !options.force) {
        spinner.info('DEPLOYMENT_RULES.md not in project (use --force to create)');
        results.skipped.push('DEPLOYMENT_RULES.md');
      } else {
        if (existsSync(destPath)) {
          const backupPath = `${destPath}.backup.${Date.now()}`;
          await fs.copyFile(destPath, backupPath);
        }
        await fs.copyFile(srcPath, destPath);
        spinner.succeed('DEPLOYMENT_RULES.md updated');
        results.updated.push('DEPLOYMENT_RULES.md');
      }
    } catch (err) {
      spinner.fail(`Failed to update DEPLOYMENT_RULES.md: ${err.message}`);
      results.failed.push('DEPLOYMENT_RULES.md');
    }
  }

  // Summary
  console.log(chalk.cyan('\n📋 Update Summary\n'));

  if (results.updated.length > 0) {
    console.log(chalk.green('✅ Updated:'));
    results.updated.forEach(f => console.log(chalk.green(`   • ${f}`)));
  }

  if (results.skipped.length > 0) {
    console.log(chalk.yellow('\n⏭️  Skipped:'));
    results.skipped.forEach(f => console.log(chalk.yellow(`   • ${f}`)));
  }

  if (results.failed.length > 0) {
    console.log(chalk.red('\n❌ Failed:'));
    results.failed.forEach(f => console.log(chalk.red(`   • ${f}`)));
  }

  console.log(chalk.gray('\n💡 Tip: Backup files created with .backup.{timestamp} extension'));
  console.log('');
}

export default update;
