/**
 * Dangerous Files Scanner Module
 *
 * 위험 파일 감지 및 백업 기능
 * - 차단된 서버 IP가 하드코딩된 파일
 * - 구버전 배포 스크립트
 * - 잘못된 설정 파일
 *
 * @module scan-dangerous
 * @version 3.0.8
 */

import chalk from 'chalk';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { promises as fsPromises } from 'fs';
import { join, dirname } from 'path';

// ================================================================
// 위험 파일 패턴 정의
// ================================================================

/**
 * 위험 콘텐츠 패턴
 */
export const DANGEROUS_FILE_PATTERNS = [
  {
    pattern: /141\.164\.60\.51/,
    reason: '차단된 서버 IP (141.164.60.51) 하드코딩',
    severity: 'critical',
  },
  {
    pattern: /158\.247\.211\.45/,
    reason: '잘못된 서버 IP (158.247.211.45) - 158.247.203.55 사용 필요',
    severity: 'warning',
  },
  {
    pattern: /socket\.io/i,
    reason: 'Socket.IO 사용 - Centrifugo로 교체 필요',
    severity: 'warning',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx'],
  },
];

/**
 * 위험 파일명 패턴
 */
export const DANGEROUS_FILE_NAMES = [
  { pattern: /^deploy\.sh$/, reason: '직접 배포 스크립트 - MCP 배포 권장' },
  { pattern: /^deploy-.*\.sh$/, reason: '커스텀 배포 스크립트 - 검토 필요' },
  { pattern: /docker-compose\.yml$/i, reason: 'docker-compose - Quadlet 사용 권장', severity: 'info' },
];

/**
 * 스캔에서 제외할 파일 (차단 로직 정의용 또는 문서)
 */
export const SCAN_EXCLUDE_FILES = [
  'src/commands/scan.js',
  'src/commands/scan-dangerous.js',
  'src/lib/config.js',
  '.env.example',
  'CLAUDE.md',
  'NOTIFICATION_README.md',
  'commands/we/deploy.md',
];

// ================================================================
// 위험 파일 스캔 함수
// ================================================================

/**
 * 프로젝트 디렉토리에서 위험 파일 스캔
 */
export async function scanDangerousFiles(projectPath = process.cwd()) {
  const result = {
    scanned: 0,
    dangerous: [],
    warnings: [],
    backupNeeded: [],
  };

  // 스캔할 파일 확장자
  const scanExtensions = ['.sh', '.js', '.ts', '.jsx', '.tsx', '.yml', '.yaml', '.env', '.md'];

  // 제외할 디렉토리
  const excludeDirs = ['node_modules', '.git', 'backup', '.next', 'dist', 'build', '.claude'];

  async function scanDirectory(dir) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relativePath = fullPath.replace(projectPath + '/', '');

        if (entry.isDirectory()) {
          // 제외 디렉토리 건너뛰기
          if (excludeDirs.includes(entry.name)) continue;
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          // 확장자 체크
          const ext = entry.name.substring(entry.name.lastIndexOf('.'));
          if (!scanExtensions.includes(ext) && !entry.name.startsWith('.env')) continue;

          result.scanned++;

          // 제외 파일 체크
          const isExcluded = SCAN_EXCLUDE_FILES.some(excludeFile => {
            return relativePath === excludeFile ||
                   relativePath.endsWith('/' + excludeFile) ||
                   entry.name === excludeFile;
          });
          if (isExcluded) continue;

          // 파일명 패턴 검사
          for (const namePattern of DANGEROUS_FILE_NAMES) {
            if (namePattern.pattern.test(entry.name)) {
              result.warnings.push({
                file: relativePath,
                reason: namePattern.reason,
                severity: namePattern.severity || 'warning',
              });
            }
          }

          // 파일 내용 검사
          try {
            const content = readFileSync(fullPath, 'utf-8');

            for (const pattern of DANGEROUS_FILE_PATTERNS) {
              // 파일 타입 필터
              if (pattern.fileTypes && !pattern.fileTypes.includes(ext)) continue;

              if (pattern.pattern.test(content)) {
                const item = {
                  file: relativePath,
                  fullPath,
                  reason: pattern.reason,
                  severity: pattern.severity,
                };

                if (pattern.severity === 'critical') {
                  result.dangerous.push(item);
                  result.backupNeeded.push(item);
                } else {
                  result.warnings.push(item);
                }
              }
            }
          } catch (readErr) {
            // 바이너리 파일 등 읽기 실패 무시
          }
        }
      }
    } catch (err) {
      // 디렉토리 접근 실패 무시
    }
  }

  await scanDirectory(projectPath);

  return result;
}

/**
 * 위험 파일을 백업 폴더로 이동
 */
export async function backupDangerousFiles(projectPath = process.cwd(), options = {}) {
  const { dryRun = false, force = false } = options;
  const scanResult = await scanDangerousFiles(projectPath);

  if (scanResult.backupNeeded.length === 0) {
    return {
      success: true,
      message: '백업이 필요한 위험 파일이 없습니다.',
      moved: [],
    };
  }

  const backupDir = join(projectPath, 'backup', `dangerous_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`);
  const moved = [];
  const errors = [];

  console.log(chalk.yellow(`\n⚠️  ${scanResult.backupNeeded.length}개의 위험 파일 감지됨\n`));

  for (const item of scanResult.backupNeeded) {
    console.log(chalk.red(`  • ${item.file}`));
    console.log(chalk.gray(`    사유: ${item.reason}`));
  }

  if (dryRun) {
    console.log(chalk.cyan('\n[Dry Run] 실제 이동은 수행되지 않았습니다.\n'));
    return {
      success: true,
      dryRun: true,
      backupNeeded: scanResult.backupNeeded,
      moved: [],
    };
  }

  // 사용자 확인 (force 옵션이 없으면)
  if (!force) {
    const inquirer = await import('inquirer');
    const { proceed } = await inquirer.default.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: `${scanResult.backupNeeded.length}개 파일을 백업 폴더로 이동하시겠습니까?`,
      default: false,
    }]);

    if (!proceed) {
      console.log(chalk.gray('\n취소되었습니다.\n'));
      return { success: false, cancelled: true, moved: [] };
    }
  }

  // 백업 디렉토리 생성
  await fsPromises.mkdir(backupDir, { recursive: true });

  for (const item of scanResult.backupNeeded) {
    try {
      const destPath = join(backupDir, item.file);
      const destDir = dirname(destPath);

      // 대상 디렉토리 생성
      await fsPromises.mkdir(destDir, { recursive: true });

      // 파일 이동
      await fsPromises.rename(item.fullPath, destPath);

      moved.push({
        from: item.file,
        to: destPath.replace(projectPath + '/', ''),
        reason: item.reason,
      });

      console.log(chalk.green(`  ✓ ${item.file} → backup/`));
    } catch (err) {
      errors.push({
        file: item.file,
        error: err.message,
      });
      console.log(chalk.red(`  ✗ ${item.file}: ${err.message}`));
    }
  }

  // 결과 요약
  console.log(chalk.cyan(`\n📁 백업 위치: ${backupDir.replace(projectPath + '/', '')}`));
  console.log(chalk.green(`\n✅ ${moved.length}개 파일 백업 완료`));

  if (errors.length > 0) {
    console.log(chalk.red(`❌ ${errors.length}개 파일 실패`));
  }

  // 백업 로그 저장
  const logPath = join(backupDir, 'backup-log.json');
  await fsPromises.writeFile(logPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    projectPath,
    moved,
    errors,
    reason: 'Dangerous files detected by we scan --cleanup',
  }, null, 2));

  return {
    success: errors.length === 0,
    backupDir: backupDir.replace(projectPath + '/', ''),
    moved,
    errors,
  };
}

/**
 * scan 명령어에 --cleanup 옵션 지원
 * MCP 연결 없이도 위험 파일 스캔/백업 가능
 */
export async function scanWithCleanup(scanFn, target, options) {
  const { cleanup, dryRun, force } = options;

  // cleanup 옵션이 있으면 먼저 위험 파일 처리
  if (cleanup) {
    console.log(chalk.cyan.bold('\n🧹 Dangerous Files Cleanup\n'));
    console.log(chalk.gray(`📁 Scanning: ${process.cwd()}\n`));

    const dangerousScan = await scanDangerousFiles(process.cwd());

    if (dangerousScan.dangerous.length === 0 && dangerousScan.warnings.length === 0) {
      console.log(chalk.green('✅ 위험 파일이 발견되지 않았습니다.\n'));
    } else {
      // 통계 출력
      console.log(chalk.white(`📊 스캔 결과:`));
      console.log(chalk.white(`   • 스캔된 파일: ${dangerousScan.scanned}개`));
      console.log(chalk.red(`   • 위험 파일: ${dangerousScan.dangerous.length}개`));
      console.log(chalk.yellow(`   • 경고: ${dangerousScan.warnings.length}개\n`));

      // 경고 출력
      if (dangerousScan.warnings.length > 0) {
        console.log(chalk.yellow.bold(`⚠️  경고 파일 (${dangerousScan.warnings.length}개):\n`));
        for (const warn of dangerousScan.warnings) {
          console.log(chalk.yellow(`  • ${warn.file}`));
          console.log(chalk.gray(`    ${warn.reason}`));
          if (warn.matches && warn.matches.length > 0) {
            for (const match of warn.matches.slice(0, 3)) {
              console.log(chalk.gray(`    Line ${match.line}: ${match.content.substring(0, 60)}...`));
            }
          }
          console.log();
        }
      }

      // 위험 파일 백업
      if (dangerousScan.dangerous.length > 0) {
        await backupDangerousFiles(process.cwd(), { dryRun, force });
      }
    }
  }

  // 기본 MCP 스캔은 선택적으로 수행
  let scanResult = null;
  try {
    scanResult = await scanFn(target, { ...options, cleanup: false });
  } catch (error) {
    if (!cleanup) {
      throw error;
    }
    console.log(chalk.gray('\n📡 MCP 스캔 스킵됨 (연결 불가)\n'));
  }

  return scanResult;
}

export default {
  scanDangerousFiles,
  backupDangerousFiles,
  scanWithCleanup,
  DANGEROUS_FILE_PATTERNS,
  DANGEROUS_FILE_NAMES,
  SCAN_EXCLUDE_FILES,
};
