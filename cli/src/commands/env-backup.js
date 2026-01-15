/**
 * ENV Backup/Restore Module
 *
 * 백업 서버 연동 및 ENV 자동 수정
 *
 * @module env-backup
 * @version 3.0.0
 */

import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import inquirer from 'inquirer';
import { getServerHost, getServerUser } from '../lib/config.js';
import { parseEnvFile } from './env-sync.js';

// ============================================================================
// 상수 정의
// ============================================================================

export const BACKUP_SERVER = {
  host: '141.164.37.63',  // backup.codeb.kr
  user: 'root',
  envPath: '/opt/codeb/env-backup'
};

// 올바른 서버 도메인 정보
export const SERVER_CONFIG = {
  storage: {
    host: 'db.codeb.kr',
    ip: '64.176.226.119',
    postgresPort: 5432,
    redisPort: 6379
  },
  streaming: {
    host: 'ws.codeb.kr',
    ip: '141.164.42.213',
    port: 8000
  },
  app: {
    host: 'app.codeb.kr',
    ip: '158.247.203.55'
  }
};

// 잘못된 호스트 패턴 (수정 대상)
export const INVALID_HOSTS = [
  'localhost',
  '127.0.0.1',
  'codeb-postgres',
  'codeb-redis',
  'n1.codeb.kr',
  'n2.codeb.kr',
  'n3.codeb.kr',
  'n4.codeb.kr'
];

// ============================================================================
// ENV Backup/Restore
// ============================================================================

/**
 * we env restore - 백업 서버에서 ENV 복구
 */
export async function envRestore(projectName, options = {}) {
  const spinner = ora('Checking backup server...').start();

  try {
    if (!projectName) {
      const packageJsonPath = join(process.cwd(), 'package.json');
      if (existsSync(packageJsonPath)) {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        projectName = pkg.name;
      }
    }

    if (!projectName) {
      spinner.fail('Project name required');
      console.log(chalk.gray('Usage: we env restore <project-name>'));
      return;
    }

    const environment = options.environment || 'production';
    const version = options.version || 'master';

    const envDir = `${BACKUP_SERVER.envPath}/${projectName}/${environment}`;
    let targetFile;

    if (version === 'master') {
      targetFile = `${envDir}/master.env`;
    } else if (version === 'current') {
      targetFile = `${envDir}/current.env`;
    } else {
      targetFile = `${envDir}/${version}.env`;
    }

    spinner.text = `Restoring ${version} ENV from backup server...`;

    const content = execSync(
      `ssh ${BACKUP_SERVER.user}@${BACKUP_SERVER.host} "cat ${targetFile}"`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim();

    spinner.stop();

    console.log(chalk.cyan(`\n📥 ENV Restore: ${projectName}/${environment}\n`));
    console.log(chalk.gray(`Source: ${version === 'master' ? 'master.env (original)' : version}`));
    console.log(chalk.gray(`Server: backup.codeb.kr`));
    console.log('');

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Where to restore?',
      choices: [
        { name: 'Show content only (preview)', value: 'preview' },
        { name: 'Save to .env.restored', value: 'local' },
        { name: 'Push to App server', value: 'server' },
        { name: 'Cancel', value: 'cancel' }
      ]
    }]);

    if (action === 'cancel') {
      console.log(chalk.gray('Cancelled'));
      return;
    }

    if (action === 'preview') {
      console.log(chalk.bold('\n━━━ ENV Content ━━━'));
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.includes('PASSWORD') || line.includes('SECRET') || line.includes('KEY')) {
          const [key] = line.split('=');
          console.log(chalk.gray(`${key}=***`));
        } else {
          console.log(chalk.gray(line));
        }
      }
      return;
    }

    if (action === 'local') {
      const localPath = join(process.cwd(), '.env.restored');
      writeFileSync(localPath, content);
      console.log(chalk.green(`\n✅ Saved to: ${localPath}`));
      console.log(chalk.yellow('Review and rename to .env.local if needed'));
      return;
    }

    if (action === 'server') {
      const serverHost = options.serverHost || getServerHost();
      const serverUser = options.serverUser || getServerUser();

      if (!serverHost) {
        console.log(chalk.red('Server host not configured'));
        return;
      }

      const serverEnvPath = `/opt/codeb/envs/${projectName}-${environment}.env`;

      execSync(
        `ssh ${serverUser}@${serverHost} "cp ${serverEnvPath} ${serverEnvPath}.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true"`,
        { timeout: 30000 }
      );

      execSync(
        `ssh ${serverUser}@${serverHost} "cat > ${serverEnvPath}" << 'ENVEOF'
${content}
ENVEOF`,
        { timeout: 30000 }
      );

      console.log(chalk.green(`\n✅ Restored to App server: ${serverEnvPath}`));
      console.log(chalk.yellow('Restart the container to apply changes'));
    }

  } catch (error) {
    spinner.fail(`Restore failed: ${error.message}`);
    if (error.message.includes('No such file')) {
      console.log(chalk.yellow('\nNo backup found. Available backups:'));
      console.log(chalk.gray('  we env backups <project-name>'));
    }
  }
}

/**
 * we env backups - 프로젝트의 ENV 백업 목록 조회
 */
export async function envBackups(projectName, options = {}) {
  const spinner = ora('Fetching backup list...').start();

  try {
    if (!projectName) {
      const packageJsonPath = join(process.cwd(), 'package.json');
      if (existsSync(packageJsonPath)) {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        projectName = pkg.name;
      }
    }

    if (!projectName) {
      spinner.fail('Project name required');
      console.log(chalk.gray('Usage: we env backups <project-name>'));
      return;
    }

    const projectDir = `${BACKUP_SERVER.envPath}/${projectName}`;

    const output = execSync(
      `ssh ${BACKUP_SERVER.user}@${BACKUP_SERVER.host} "find ${projectDir} -name '*.env' -type f -printf '%T+ %p\n' 2>/dev/null | sort -r || echo 'empty'"`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim();

    spinner.stop();

    console.log(chalk.cyan(`\n📁 ENV Backups: ${projectName}\n`));
    console.log(chalk.gray(`Location: backup.codeb.kr:${projectDir}`));
    console.log('');

    if (output === 'empty' || !output) {
      console.log(chalk.yellow('No backups found for this project'));
      console.log(chalk.gray('\nBackups are created automatically when running:'));
      console.log(chalk.gray('  we workflow init <project> --database'));
      return;
    }

    const lines = output.split('\n').filter(l => l.trim());
    const byEnvironment = { production: [], staging: [] };

    for (const line of lines) {
      const parts = line.split(' ');
      const timestamp = parts[0];
      const path = parts[1];

      if (path.includes('/production/')) {
        byEnvironment.production.push({ timestamp, path, name: path.split('/').pop() });
      } else if (path.includes('/staging/')) {
        byEnvironment.staging.push({ timestamp, path, name: path.split('/').pop() });
      }
    }

    for (const [env, backups] of Object.entries(byEnvironment)) {
      if (backups.length > 0) {
        console.log(chalk.bold(`${env}:`));
        for (const backup of backups.slice(0, 10)) {
          const icon = backup.name === 'master.env' ? '⭐' :
                       backup.name === 'current.env' ? '📌' : '📄';
          console.log(chalk.gray(`  ${icon} ${backup.name}`));
        }
        if (backups.length > 10) {
          console.log(chalk.gray(`  ... and ${backups.length - 10} more`));
        }
        console.log('');
      }
    }

    console.log(chalk.bold('Restore commands:'));
    console.log(chalk.gray('  we env restore <project> --version master       # Original (recommended)'));
    console.log(chalk.gray('  we env restore <project> --version current      # Latest backup'));
    console.log(chalk.gray('  we env restore <project> --version <timestamp>  # Specific version'));

  } catch (error) {
    spinner.fail(`Failed to fetch backups: ${error.message}`);
  }
}

// ============================================================================
// ENV Fix - 잘못된 ENV 자동 수정
// ============================================================================

/**
 * we env fix - 잘못된 ENV 자동 수정
 */
export async function envFix(projectName, options = {}) {
  const spinner = ora('Analyzing ENV files...').start();

  try {
    if (!projectName) {
      const packageJsonPath = join(process.cwd(), 'package.json');
      if (existsSync(packageJsonPath)) {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        projectName = pkg.name;
      }
    }

    const environment = options.environment || 'production';
    const dryRun = options.dryRun || false;

    const envFiles = [
      `.env.${environment}`,
      '.env.production',
      '.env.local',
      '.env'
    ];

    const fixes = [];
    let targetFile = null;
    let originalContent = null;

    for (const fileName of envFiles) {
      const filePath = join(process.cwd(), fileName);
      if (existsSync(filePath)) {
        targetFile = filePath;
        originalContent = readFileSync(filePath, 'utf-8');

        const lines = originalContent.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith('#') || !line.includes('=')) continue;

          const [key, ...valueParts] = line.split('=');
          const value = valueParts.join('=');

          // DATABASE_URL 수정
          if (key.trim() === 'DATABASE_URL') {
            for (const invalidHost of INVALID_HOSTS) {
              if (value.includes(`@${invalidHost}:`) || value.includes(`@${invalidHost}/`)) {
                const newValue = value.replace(
                  new RegExp(`@${invalidHost.replace('.', '\\.')}(:|/)`),
                  `@${SERVER_CONFIG.storage.host}$1`
                );
                fixes.push({
                  file: fileName,
                  line: i + 1,
                  key: key.trim(),
                  oldValue: value.trim(),
                  newValue: newValue.trim(),
                  reason: `${invalidHost} → ${SERVER_CONFIG.storage.host}`
                });
                lines[i] = `${key}=${newValue}`;
                break;
              }
            }
          }

          // REDIS_URL 수정
          if (key.trim() === 'REDIS_URL') {
            for (const invalidHost of INVALID_HOSTS) {
              if (value.includes(`://${invalidHost}:`) || value.includes(`://${invalidHost}/`)) {
                const newValue = value.replace(
                  new RegExp(`://${invalidHost.replace('.', '\\.')}(:|/)`),
                  `://${SERVER_CONFIG.storage.host}$1`
                );
                fixes.push({
                  file: fileName,
                  line: i + 1,
                  key: key.trim(),
                  oldValue: value.trim(),
                  newValue: newValue.trim(),
                  reason: `${invalidHost} → ${SERVER_CONFIG.storage.host}`
                });
                lines[i] = `${key}=${newValue}`;
                break;
              }
            }
          }

          // CENTRIFUGO_URL 수정
          if (key.trim() === 'CENTRIFUGO_URL' || key.trim() === 'CENTRIFUGO_API_URL') {
            if (value.includes('n2.codeb.kr')) {
              const newValue = value.replace(/n2\.codeb\.kr/g, SERVER_CONFIG.streaming.host);
              fixes.push({
                file: fileName,
                line: i + 1,
                key: key.trim(),
                oldValue: value.trim(),
                newValue: newValue.trim(),
                reason: `n2.codeb.kr → ${SERVER_CONFIG.streaming.host}`
              });
              lines[i] = `${key}=${newValue}`;
            }
          }
        }

        if (fixes.length > 0) {
          originalContent = lines.join('\n');
        }
        break;
      }
    }

    spinner.stop();

    console.log(chalk.cyan(`\n🔧 ENV Fix: ${projectName || 'current project'}\n`));

    if (!targetFile) {
      console.log(chalk.yellow('No .env files found in current directory'));
      console.log(chalk.gray('Expected: .env, .env.local, .env.production, .env.staging'));
      return;
    }

    console.log(chalk.gray(`Target: ${targetFile}`));
    console.log('');

    if (fixes.length === 0) {
      console.log(chalk.green('✅ No issues found! ENV configuration is correct.'));
      console.log(chalk.gray(`\nExpected hosts:`));
      console.log(chalk.gray(`  PostgreSQL/Redis: ${SERVER_CONFIG.storage.host}`));
      console.log(chalk.gray(`  Centrifugo:       ${SERVER_CONFIG.streaming.host}`));
      return;
    }

    console.log(chalk.yellow(`Found ${fixes.length} issue(s) to fix:\n`));

    for (const fix of fixes) {
      console.log(chalk.red(`  ✗ ${fix.key} (line ${fix.line})`));
      console.log(chalk.gray(`    Before: ${fix.oldValue.substring(0, 60)}...`));
      console.log(chalk.green(`    After:  ${fix.newValue.substring(0, 60)}...`));
      console.log(chalk.gray(`    Reason: ${fix.reason}`));
      console.log('');
    }

    if (dryRun) {
      console.log(chalk.yellow('Dry run mode - no changes made'));
      console.log(chalk.gray('Remove --dry-run to apply fixes'));
      return { fixes, applied: false };
    }

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: 'Apply these fixes?',
      default: true
    }]);

    if (!confirm) {
      console.log(chalk.gray('Cancelled'));
      return { fixes, applied: false };
    }

    // 백업 생성
    const backupPath = `${targetFile}.backup.${Date.now()}`;
    writeFileSync(backupPath, readFileSync(targetFile, 'utf-8'));
    console.log(chalk.gray(`\nBackup: ${backupPath}`));

    // 수정 적용
    writeFileSync(targetFile, originalContent);

    console.log(chalk.green(`\n✅ Fixed ${fixes.length} issue(s) in ${targetFile}`));
    console.log(chalk.yellow('\n⚠️  Remember to:'));
    console.log(chalk.gray('  1. Verify the changes'));
    console.log(chalk.gray('  2. Restart your application'));
    console.log(chalk.gray('  3. If deploying, commit and push the changes'));

    return { fixes, applied: true };

  } catch (error) {
    spinner.fail(`Fix failed: ${error.message}`);
    throw error;
  }
}

export default {
  envRestore,
  envBackups,
  envFix,
  BACKUP_SERVER,
  SERVER_CONFIG,
  INVALID_HOSTS,
};
