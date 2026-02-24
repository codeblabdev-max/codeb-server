#!/usr/bin/env tsx
/**
 * @codeb/cli - Entry Point
 *
 * /we: Web Deploy CLI
 * Blue-Green Deployment System
 *
 * 시작 시 API 서버 버전을 확인하여:
 * - 메이저 불일치 → 강제 종료 + 업데이트 안내
 * - 마이너 불일치 → 경고 + 계속 동작
 * - 서버 미응답 → 오프라인 모드로 계속
 */

import chalk from 'chalk';
import { getVersion, checkServerVersion } from '@codeb/shared';
import { createCLI } from '../src/index.js';

async function main(): Promise<void> {
  const version = getVersion();
  const check = await checkServerVersion(version);

  if (!check.compatible) {
    console.error(chalk.red.bold(`\nVersion mismatch: server v${check.serverVersion} vs CLI v${check.clientVersion}`));
    console.error(chalk.yellow(check.message || ''));
    console.error(chalk.gray('Update CLI to continue.\n'));
    process.exit(1);
  }

  if (check.updateRequired) {
    console.warn(chalk.yellow(`\nUpdate available: CLI v${check.clientVersion} -> v${check.serverVersion}`));
    console.warn(chalk.gray(check.message || ''));
    console.warn('');
  }

  if (check.serverUnreachable) {
    console.warn(chalk.gray('[offline] API server unreachable - some commands may fail\n'));
  }

  createCLI().parse(process.argv);
}

main().catch((err: Error) => {
  console.error(chalk.red('Fatal:'), err.message);
  process.exit(1);
});
