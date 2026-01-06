#!/usr/bin/env node

/**
 * CodeB Version Sync Script
 *
 * 중앙 version.json에서 모든 패키지 버전을 동기화합니다.
 *
 * Usage:
 *   node scripts/sync-versions.js          # 현재 버전으로 동기화
 *   node scripts/sync-versions.js 6.1.0    # 새 버전으로 업그레이드
 *   node scripts/sync-versions.js --check  # 버전 불일치 확인만
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// 색상 출력
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function loadVersionConfig() {
  const versionPath = path.join(ROOT_DIR, 'version.json');
  if (!fs.existsSync(versionPath)) {
    log('Error: version.json not found!', 'red');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
}

function saveVersionConfig(config) {
  const versionPath = path.join(ROOT_DIR, 'version.json');
  fs.writeFileSync(versionPath, JSON.stringify(config, null, 2) + '\n');
}

function getPackageJsonPath(packagePath) {
  const fullPath = path.join(ROOT_DIR, packagePath, 'package.json');
  return fs.existsSync(fullPath) ? fullPath : null;
}

function readPackageJson(packagePath) {
  const jsonPath = getPackageJsonPath(packagePath);
  if (!jsonPath) return null;
  return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
}

function writePackageJson(packagePath, data) {
  const jsonPath = getPackageJsonPath(packagePath);
  if (!jsonPath) return false;
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n');
  return true;
}

function checkVersions(config) {
  log('\n=== CodeB Version Check ===\n', 'cyan');
  log(`Central Version: ${config.version} (${config.codename})`, 'bold');
  log('');

  const mismatches = [];

  for (const [name, pkg] of Object.entries(config.packages)) {
    const packageJson = readPackageJson(pkg.path);
    if (!packageJson) {
      log(`  [SKIP] ${name} - package.json not found at ${pkg.path}`, 'yellow');
      continue;
    }

    const currentVersion = packageJson.version;
    const expectedVersion = pkg.version;

    if (currentVersion === expectedVersion) {
      log(`  [OK] ${name}: ${currentVersion}`, 'green');
    } else {
      log(`  [MISMATCH] ${name}: ${currentVersion} → ${expectedVersion}`, 'red');
      mismatches.push({ name, path: pkg.path, current: currentVersion, expected: expectedVersion });
    }
  }

  log('');
  if (mismatches.length > 0) {
    log(`Found ${mismatches.length} version mismatch(es)`, 'yellow');
    log('Run without --check to sync versions', 'yellow');
  } else {
    log('All versions are in sync!', 'green');
  }

  return mismatches;
}

function syncVersions(config, newVersion = null) {
  // 새 버전이 지정된 경우 중앙 버전 업데이트
  if (newVersion) {
    const oldVersion = config.version;
    config.version = newVersion;

    // 모든 패키지 버전도 업데이트
    for (const pkg of Object.values(config.packages)) {
      pkg.version = newVersion;
    }

    // 변경 로그 추가
    if (!config.changelog[newVersion]) {
      config.changelog[newVersion] = {
        date: new Date().toISOString().split('T')[0],
        changes: [`Version bump from ${oldVersion}`]
      };
    }

    saveVersionConfig(config);
    log(`\nUpdated central version: ${oldVersion} → ${newVersion}`, 'green');
  }

  log('\n=== Syncing Package Versions ===\n', 'cyan');
  log(`Target Version: ${config.version}`, 'bold');
  log('');

  let updated = 0;
  let skipped = 0;

  for (const [name, pkg] of Object.entries(config.packages)) {
    const packageJson = readPackageJson(pkg.path);
    if (!packageJson) {
      log(`  [SKIP] ${name} - not found`, 'yellow');
      skipped++;
      continue;
    }

    const currentVersion = packageJson.version;
    const targetVersion = pkg.version;

    if (currentVersion === targetVersion) {
      log(`  [OK] ${name}: ${currentVersion}`, 'green');
    } else {
      packageJson.version = targetVersion;
      writePackageJson(pkg.path, packageJson);
      log(`  [UPDATED] ${name}: ${currentVersion} → ${targetVersion}`, 'blue');
      updated++;
    }
  }

  log('');
  log(`Updated: ${updated}, Skipped: ${skipped}`, 'bold');

  if (updated > 0) {
    log('\nDon\'t forget to commit the changes!', 'yellow');
  }
}

function bumpVersion(config, type) {
  const [major, minor, patch] = config.version.split('.').map(Number);

  let newVersion;
  switch (type) {
    case 'major':
      newVersion = `${major + 1}.0.0`;
      break;
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`;
      break;
    case 'patch':
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
    default:
      log(`Invalid bump type: ${type}. Use major, minor, or patch.`, 'red');
      process.exit(1);
  }

  return newVersion;
}

function showHelp() {
  log(`
CodeB Version Sync Script

Usage:
  node scripts/sync-versions.js [options] [version]

Options:
  --check         Check version mismatches only (don't update)
  --bump <type>   Bump version (major, minor, patch)
  --help          Show this help message

Examples:
  node scripts/sync-versions.js                  # Sync to current central version
  node scripts/sync-versions.js 6.1.0            # Sync to specific version
  node scripts/sync-versions.js --check          # Check only
  node scripts/sync-versions.js --bump minor     # Bump minor version
  node scripts/sync-versions.js --bump patch     # Bump patch version
`, 'cyan');
}

// Main
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

const config = loadVersionConfig();

if (args.includes('--check')) {
  checkVersions(config);
} else if (args.includes('--bump')) {
  const bumpIndex = args.indexOf('--bump');
  const bumpType = args[bumpIndex + 1];
  if (!bumpType || !['major', 'minor', 'patch'].includes(bumpType)) {
    log('Error: --bump requires type (major, minor, patch)', 'red');
    process.exit(1);
  }
  const newVersion = bumpVersion(config, bumpType);
  log(`\nBumping version: ${config.version} → ${newVersion}`, 'cyan');
  syncVersions(config, newVersion);
} else if (args.length > 0 && !args[0].startsWith('--')) {
  // 특정 버전으로 동기화
  const newVersion = args[0];
  if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
    log(`Invalid version format: ${newVersion}. Use x.y.z format.`, 'red');
    process.exit(1);
  }
  syncVersions(config, newVersion);
} else {
  // 현재 버전으로 동기화
  syncVersions(config);
}

log('\nDone!\n', 'green');
