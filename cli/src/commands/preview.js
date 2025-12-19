/**
 * Preview Command
 *
 * Branch 기반 Preview 환경 관리
 * Backup 서버 (141.164.37.63)에 배포
 *
 * Commands:
 * - we preview list              현재 Preview 목록
 * - we preview deploy <branch>   수동 Preview 배포
 * - we preview delete <branch>   Preview 환경 삭제
 * - we preview logs <branch>     Preview 로그 확인
 * - we preview status            Preview 서버 상태
 */

import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import { getServerUser } from '../lib/config.js';

// Preview 서버 설정
const PREVIEW_SERVER = '141.164.37.63';
const PREVIEW_DOMAIN = 'preview.codeb.kr';
const PREVIEW_PORT_RANGE = { min: 5000, max: 5999 };

// ============================================================================
// SSH Helper
// ============================================================================

function sshExec(command, options = {}) {
  const user = getServerUser() || 'root';
  const timeout = options.timeout || 30000;

  try {
    const result = execSync(
      `ssh ${user}@${PREVIEW_SERVER} "${command}"`,
      { encoding: 'utf-8', timeout, stdio: options.silent ? 'pipe' : 'inherit' }
    );
    return { success: true, output: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function sshExecQuiet(command) {
  const user = getServerUser() || 'root';
  try {
    const result = execSync(
      `ssh ${user}@${PREVIEW_SERVER} "${command}"`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    return result.trim();
  } catch {
    return null;
  }
}

// ============================================================================
// Commands
// ============================================================================

/**
 * we preview list - 현재 Preview 목록
 */
export async function previewList(options = {}) {
  console.log(chalk.cyan('\n🔍 Preview Environments\n'));

  const spinner = ora('Fetching preview list...').start();

  try {
    // Get preview registry
    const registryOutput = sshExecQuiet('ls -1 /opt/codeb/preview/*.json 2>/dev/null | xargs -I {} cat {}');

    if (!registryOutput) {
      spinner.info('No preview environments found');
      console.log(chalk.gray('\nPreview 환경은 feature branch 푸시 시 자동 생성됩니다.'));
      return;
    }

    spinner.stop();

    // Parse JSON entries
    const entries = registryOutput.split('}{').map((entry, i, arr) => {
      if (i === 0 && arr.length > 1) return entry + '}';
      if (i === arr.length - 1 && arr.length > 1) return '{' + entry;
      if (arr.length > 1) return '{' + entry + '}';
      return entry;
    });

    const previews = [];
    for (const entry of entries) {
      try {
        previews.push(JSON.parse(entry));
      } catch {
        // Skip invalid JSON
      }
    }

    if (previews.length === 0) {
      console.log(chalk.gray('No active previews'));
      return;
    }

    // Display table
    console.log(chalk.gray('─'.repeat(90)));
    console.log(
      chalk.bold(
        padRight('Branch', 20) +
        padRight('Project', 15) +
        padRight('Port', 8) +
        padRight('Domain', 35) +
        'Created'
      )
    );
    console.log(chalk.gray('─'.repeat(90)));

    for (const p of previews) {
      const createdDate = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '-';
      console.log(
        chalk.green(padRight(p.branch || '-', 20)) +
        chalk.white(padRight(p.project || '-', 15)) +
        chalk.yellow(padRight(String(p.port || '-'), 8)) +
        chalk.cyan(padRight(p.domain || '-', 35)) +
        chalk.gray(createdDate)
      );
    }

    console.log(chalk.gray('─'.repeat(90)));
    console.log(chalk.gray(`\nTotal: ${previews.length} preview(s)`));
    console.log(chalk.gray(`Server: ${PREVIEW_SERVER}`));

  } catch (error) {
    spinner.fail('Failed to fetch preview list');
    console.error(chalk.red(error.message));
  }
}

/**
 * we preview status - Preview 서버 상태
 */
export async function previewStatus(options = {}) {
  console.log(chalk.cyan('\n📊 Preview Server Status\n'));

  const spinner = ora('Checking server status...').start();

  try {
    // Get server status
    const statusJson = sshExecQuiet('cat /opt/codeb/config/server-status.json 2>/dev/null');
    const containerCount = sshExecQuiet('podman ps --filter network=codeb-preview --format "{{.Names}}" 2>/dev/null | wc -l');
    const diskUsage = sshExecQuiet('df -h / | tail -1 | awk \'{print $5}\'');
    const memory = sshExecQuiet('free -h | grep Mem | awk \'{print $3 "/" $2}\'');

    spinner.stop();

    console.log(chalk.white('  Server:     ') + chalk.bold(PREVIEW_SERVER));
    console.log(chalk.white('  Domain:     ') + chalk.cyan(`*.${PREVIEW_DOMAIN}`));
    console.log(chalk.white('  Port Range: ') + chalk.yellow(`${PREVIEW_PORT_RANGE.min}-${PREVIEW_PORT_RANGE.max}`));
    console.log('');
    console.log(chalk.white('  Containers: ') + chalk.green(containerCount || '0'));
    console.log(chalk.white('  Disk Usage: ') + chalk.yellow(diskUsage || '-'));
    console.log(chalk.white('  Memory:     ') + chalk.yellow(memory || '-'));

    if (statusJson) {
      try {
        const status = JSON.parse(statusJson);
        console.log('');
        console.log(chalk.white('  Caddy:      ') + chalk.green(status.services?.caddy || '-'));
        console.log(chalk.white('  Podman:     ') + chalk.green(status.services?.podman || '-'));
        console.log(chalk.white('  Updated:    ') + chalk.gray(status.updatedAt || '-'));
      } catch {}
    }

  } catch (error) {
    spinner.fail('Failed to check status');
    console.error(chalk.red(error.message));
  }
}

/**
 * we preview logs <branch> - Preview 로그 확인
 */
export async function previewLogs(branch, options = {}) {
  if (!branch) {
    console.log(chalk.red('\n❌ Branch name required'));
    console.log(chalk.gray('Usage: we preview logs <branch-name>'));
    return;
  }

  const slug = slugify(branch);
  console.log(chalk.cyan(`\n📋 Logs for preview: ${slug}\n`));

  // Find container
  const container = sshExecQuiet(`ls /opt/codeb/preview/*-${slug}.json 2>/dev/null | head -1 | xargs -I {} basename {} .json`);

  if (!container) {
    console.log(chalk.red(`Preview '${slug}' not found`));
    return;
  }

  const lines = options.lines || 100;
  sshExec(`podman logs --tail ${lines} ${container}`);
}

/**
 * we preview delete <branch> - Preview 환경 삭제
 */
export async function previewDelete(branch, options = {}) {
  if (!branch) {
    console.log(chalk.red('\n❌ Branch name required'));
    console.log(chalk.gray('Usage: we preview delete <branch-name>'));
    return;
  }

  const slug = slugify(branch);
  console.log(chalk.cyan(`\n🗑️  Deleting preview: ${slug}\n`));

  const spinner = ora('Cleaning up...').start();

  try {
    // Find and delete
    const result = sshExecQuiet(`
      CONTAINER=$(ls /opt/codeb/preview/*-${slug}.json 2>/dev/null | head -1 | xargs -I {} basename {} .json)
      if [ -n "$CONTAINER" ]; then
        podman stop $CONTAINER 2>/dev/null || true
        podman rm $CONTAINER 2>/dev/null || true
        rm -f /opt/codeb/preview/$CONTAINER.json
        rm -f /etc/caddy/preview.d/$CONTAINER.caddy
        systemctl reload caddy
        echo "deleted"
      else
        echo "not_found"
      fi
    `);

    if (result === 'deleted') {
      spinner.succeed(`Preview '${slug}' deleted`);
    } else {
      spinner.warn(`Preview '${slug}' not found`);
    }

  } catch (error) {
    spinner.fail('Failed to delete preview');
    console.error(chalk.red(error.message));
  }
}

/**
 * we preview cleanup - 오래된 Preview 정리
 */
export async function previewCleanup(options = {}) {
  const days = options.days || 7;
  console.log(chalk.cyan(`\n🧹 Cleaning previews older than ${days} days\n`));

  const spinner = ora('Scanning old previews...').start();

  try {
    const result = sshExecQuiet(`
      find /opt/codeb/preview -name "*.json" -mtime +${days} -exec basename {} .json \\; 2>/dev/null
    `);

    if (!result) {
      spinner.info('No old previews to clean');
      return;
    }

    const containers = result.split('\n').filter(Boolean);
    spinner.text = `Found ${containers.length} old preview(s)`;

    for (const container of containers) {
      spinner.text = `Cleaning ${container}...`;
      sshExecQuiet(`
        podman stop ${container} 2>/dev/null || true
        podman rm ${container} 2>/dev/null || true
        rm -f /opt/codeb/preview/${container}.json
        rm -f /etc/caddy/preview.d/${container}.caddy
      `);
    }

    sshExecQuiet('systemctl reload caddy && podman image prune -f');
    spinner.succeed(`Cleaned ${containers.length} old preview(s)`);

  } catch (error) {
    spinner.fail('Cleanup failed');
    console.error(chalk.red(error.message));
  }
}

// ============================================================================
// Helpers
// ============================================================================

function padRight(str, len) {
  return (str || '').toString().padEnd(len);
}

function slugify(branch) {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
}

// ============================================================================
// Main Export
// ============================================================================

export async function preview(action, arg1, options = {}) {
  switch (action) {
    case 'list':
    case 'ls':
      await previewList(options);
      break;

    case 'status':
      await previewStatus(options);
      break;

    case 'logs':
      await previewLogs(arg1, options);
      break;

    case 'delete':
    case 'rm':
      await previewDelete(arg1, options);
      break;

    case 'cleanup':
      await previewCleanup(options);
      break;

    default:
      showUsage();
  }
}

function showUsage() {
  console.log(chalk.cyan('\n🔍 Preview Environment Management\n'));
  console.log('Commands:');
  console.log(chalk.white('  we preview list              ') + chalk.gray('현재 Preview 목록'));
  console.log(chalk.white('  we preview status            ') + chalk.gray('Preview 서버 상태'));
  console.log(chalk.white('  we preview logs <branch>     ') + chalk.gray('Preview 로그 확인'));
  console.log(chalk.white('  we preview delete <branch>   ') + chalk.gray('Preview 환경 삭제'));
  console.log(chalk.white('  we preview cleanup           ') + chalk.gray('오래된 Preview 정리'));
  console.log('');
  console.log('Notes:');
  console.log(chalk.gray('  Preview 환경은 feature branch 푸시 시 GitHub Actions로 자동 생성됩니다.'));
  console.log(chalk.gray('  PR 머지/닫힘 시 자동으로 삭제됩니다.'));
  console.log('');
  console.log('Server:');
  console.log(chalk.gray(`  ${PREVIEW_SERVER} (backup.codeb.kr)`));
  console.log(chalk.gray(`  Domain: *.${PREVIEW_DOMAIN}`));
  console.log(chalk.gray(`  Ports: ${PREVIEW_PORT_RANGE.min}-${PREVIEW_PORT_RANGE.max}`));
}

export default preview;
