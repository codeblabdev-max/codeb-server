/**
 * Config Command
 *
 * CLI 설정 관리 (초기화, 조회, 설정)
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import {
  getConfigDir,
  getConfigFile,
  getAllConfig,
  validateConfig
} from '../lib/config.js';

/**
 * config 명령어 메인
 */
export async function config(action, options) {
  switch (action) {
    case 'init':
      await initConfig(options);
      break;
    case 'show':
    case 'list':
      showConfig();
      break;
    case 'set':
      await setConfig(options);
      break;
    case 'check':
      checkConfig();
      break;
    case 'path':
      showPath();
      break;
    default:
      showConfigHelp();
  }
}

/**
 * 설정 초기화 마법사
 */
async function initConfig(options) {
  console.log(chalk.cyan.bold('\n╔═══════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║   /we: CLI 설정 초기화                        ║'));
  console.log(chalk.cyan.bold('╚═══════════════════════════════════════════════╝\n'));

  const configDir = getConfigDir();
  const configFile = getConfigFile();

  // 기존 설정 확인
  let existingConfig = {};
  if (existsSync(configFile)) {
    try {
      existingConfig = JSON.parse(readFileSync(configFile, 'utf-8'));
      console.log(chalk.yellow('⚠️  기존 설정 파일이 있습니다. 덮어쓸 수 있습니다.\n'));
    } catch (e) {
      // ignore
    }
  }

  // Interactive mode
  if (!options.noInteractive) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'serverHost',
        message: '배포 서버 IP/호스트:',
        default: existingConfig.CODEB_SERVER_HOST || '',
        validate: (input) => input ? true : '서버 호스트를 입력하세요'
      },
      {
        type: 'input',
        name: 'serverUser',
        message: '서버 SSH 사용자:',
        default: existingConfig.CODEB_SERVER_USER || 'root'
      },
      {
        type: 'password',
        name: 'dbPassword',
        message: 'PostgreSQL 비밀번호:',
        default: existingConfig.CODEB_DB_PASSWORD || ''
      },
      {
        type: 'password',
        name: 'vultrApiKey',
        message: 'Vultr API Key (선택):',
        default: ''
      },
      {
        type: 'password',
        name: 'githubToken',
        message: 'GitHub Token (선택):',
        default: ''
      },
      {
        type: 'input',
        name: 'baseDomain',
        message: '기본 도메인:',
        default: existingConfig.CODEB_DOMAIN || 'codeb.kr'
      }
    ]);

    // 디렉토리 생성
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // 설정 저장
    const newConfig = {
      CODEB_SERVER_HOST: answers.serverHost,
      CODEB_SERVER_USER: answers.serverUser,
      CODEB_DB_PASSWORD: answers.dbPassword,
      CODEB_DOMAIN: answers.baseDomain
    };

    // 선택적 값만 추가
    if (answers.vultrApiKey) {
      newConfig.VULTR_API_KEY = answers.vultrApiKey;
    }
    if (answers.githubToken) {
      newConfig.GITHUB_TOKEN = answers.githubToken;
    }

    writeFileSync(configFile, JSON.stringify(newConfig, null, 2));

    console.log(chalk.green('\n✅ 설정 저장 완료!'));
    console.log(chalk.gray(`   위치: ${configFile}\n`));

    // .env 템플릿도 생성
    generateEnvTemplate(answers);

  } else {
    console.log(chalk.yellow('Non-interactive 모드는 --set 옵션을 사용하세요.'));
  }
}

/**
 * .env 템플릿 생성
 */
function generateEnvTemplate(config) {
  const envContent = `# CodeB CLI Configuration
# 이 파일을 프로젝트 루트에 .env로 저장하거나
# ~/.codeb/config.json에 설정하세요

CODEB_SERVER_HOST=${config.serverHost || ''}
CODEB_SERVER_USER=${config.serverUser || 'root'}
CODEB_DB_PASSWORD=${config.dbPassword || ''}
CODEB_DOMAIN=${config.baseDomain || 'codeb.kr'}

# 선택사항
VULTR_API_KEY=${config.vultrApiKey || ''}
GITHUB_TOKEN=${config.githubToken || ''}
`;

  const envPath = join(process.cwd(), '.env.codeb.example');
  writeFileSync(envPath, envContent);
  console.log(chalk.gray(`   .env 템플릿: ${envPath}`));
}

/**
 * 현재 설정 표시
 */
function showConfig() {
  console.log(chalk.cyan.bold('\n╔═══════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║   현재 설정                                   ║'));
  console.log(chalk.cyan.bold('╚═══════════════════════════════════════════════╝\n'));

  const config = getAllConfig();

  for (const [key, value] of Object.entries(config)) {
    const displayValue = value || chalk.gray('(미설정)');
    console.log(`  ${chalk.green(key)}: ${displayValue}`);
  }

  console.log(chalk.gray(`\n  설정 파일: ${getConfigFile()}`));
  console.log(chalk.gray('  환경변수가 설정 파일보다 우선합니다.\n'));
}

/**
 * 설정 검증
 */
function checkConfig() {
  console.log(chalk.cyan.bold('\n╔═══════════════════════════════════════════════╗'));
  console.log(chalk.cyan.bold('║   설정 검증                                   ║'));
  console.log(chalk.cyan.bold('╚═══════════════════════════════════════════════╝\n'));

  const requiredKeys = ['CODEB_SERVER_HOST', 'CODEB_SERVER_USER'];
  const result = validateConfig(requiredKeys);

  if (result.valid) {
    console.log(chalk.green('✅ 필수 설정이 모두 완료되었습니다.\n'));
  } else {
    console.log(chalk.red('❌ 다음 필수 설정이 누락되었습니다:\n'));
    for (const key of result.missing) {
      console.log(chalk.red(`   • ${key}`));
    }
    console.log(chalk.yellow('\n   "we config init" 명령으로 설정하세요.\n'));
  }

  // 선택적 설정 상태
  const optionalKeys = ['CODEB_DB_PASSWORD', 'VULTR_API_KEY', 'GITHUB_TOKEN'];
  const optionalResult = validateConfig(optionalKeys);

  if (optionalResult.missing.length > 0) {
    console.log(chalk.yellow('⚠️  다음 선택적 설정이 없습니다:'));
    for (const key of optionalResult.missing) {
      console.log(chalk.gray(`   • ${key}`));
    }
    console.log();
  }
}

/**
 * 설정 경로 표시
 */
function showPath() {
  console.log(chalk.cyan('\n설정 파일 경로:'));
  console.log(`  ${getConfigFile()}\n`);
  console.log(chalk.cyan('설정 디렉토리:'));
  console.log(`  ${getConfigDir()}\n`);
}

/**
 * 개별 설정 변경
 */
async function setConfig(options) {
  const key = options.key;
  const value = options.value;

  if (!key) {
    console.log(chalk.red('❌ --key 옵션이 필요합니다.'));
    console.log(chalk.gray('   예: we config set --key CODEB_SERVER_HOST --value 1.2.3.4'));
    return;
  }

  const configDir = getConfigDir();
  const configFile = getConfigFile();

  // 기존 설정 로드
  let existingConfig = {};
  if (existsSync(configFile)) {
    try {
      existingConfig = JSON.parse(readFileSync(configFile, 'utf-8'));
    } catch (e) {
      // ignore
    }
  }

  // 디렉토리 생성
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // 설정 업데이트
  existingConfig[key] = value || '';
  writeFileSync(configFile, JSON.stringify(existingConfig, null, 2));

  console.log(chalk.green(`\n✅ ${key} 설정 완료`));
  console.log(chalk.gray(`   값: ${value ? '***' : '(삭제됨)'}\n`));
}

/**
 * 도움말
 */
function showConfigHelp() {
  console.log(chalk.cyan.bold('\n/we: config - 설정 관리\n'));
  console.log('사용법:');
  console.log('  we config init              설정 초기화 마법사');
  console.log('  we config show              현재 설정 표시');
  console.log('  we config check             설정 검증');
  console.log('  we config path              설정 파일 경로');
  console.log('  we config set --key K --value V  개별 설정 변경');
  console.log();
}

export default config;
