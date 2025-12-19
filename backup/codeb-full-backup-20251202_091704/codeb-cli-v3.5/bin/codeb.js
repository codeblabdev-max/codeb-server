#!/usr/bin/env node

/**
 * CodeB CLI v3.5
 * 로컬 개발환경과 서버 환경을 분리한 프로젝트 생성 도구
 */

const { Command } = require('commander');
const chalk = require('chalk');
const CodeB = require('../lib/index.js');

const program = new Command();

program
  .name('codeb')
  .description('CodeB CLI v3.5 - 로컬/서버 환경 분리형 프로젝트 생성 도구')
  .version('3.5.0');

// 프로젝트 생성 명령
program
  .command('create <project-name>')
  .description('새 프로젝트 생성')
  .option('-t, --type <type>', '프로젝트 타입 (nextjs, remix, react, vue)', 'nextjs')
  .option('-m, --mode <mode>', '환경 모드 (local, server)', 'local')
  .option('--db <database>', '데이터베이스 타입 (postgresql, mysql)', 'postgresql')
  .option('--cache <cache>', '캐시 시스템 (redis, memcached)', 'redis')
  .option('--storage <storage>', '스토리지 타입 (local, s3, gcs)', 'local')
  .action(async (projectName, options) => {
    console.log(chalk.blue.bold('🚀 CodeB CLI v3.5 - 프로젝트 생성 시작!'));
    console.log(chalk.gray(`프로젝트: ${projectName}`));
    console.log(chalk.gray(`타입: ${options.type}`));
    console.log(chalk.gray(`모드: ${options.mode}`));
    
    try {
      const codeb = new CodeB();
      await codeb.createProject(projectName, options);
      console.log(chalk.green.bold('✅ 프로젝트 생성 완료!'));
    } catch (error) {
      console.error(chalk.red.bold('❌ 프로젝트 생성 실패:'), error.message);
      process.exit(1);
    }
  });

// 환경 설정 명령
program
  .command('config')
  .description('환경 설정 관리')
  .option('-s, --set <key=value>', '설정 값 지정')
  .option('-g, --get <key>', '설정 값 조회')
  .option('-l, --list', '모든 설정 조회')
  .action(async (options) => {
    const codeb = new CodeB();
    await codeb.manageConfig(options);
  });

// 로컬 환경 시작
program
  .command('dev')
  .description('로컬 개발 환경 시작')
  .option('-p, --port <port>', '포트 번호', '3000')
  .option('--db-only', 'DB/Redis만 시작')
  .action(async (options) => {
    console.log(chalk.blue.bold('🔧 로컬 개발 환경 시작...'));
    const codeb = new CodeB();
    await codeb.startDev(options);
  });

// 서버 배포 명령
program
  .command('deploy')
  .description('서버에 프로젝트 배포')
  .option('-e, --env <environment>', '배포 환경 (staging, production)', 'staging')
  .option('--build-only', '빌드만 수행')
  .action(async (options) => {
    console.log(chalk.blue.bold('🚀 서버 배포 시작...'));
    const codeb = new CodeB();
    await codeb.deploy(options);
  });

// 상태 확인 명령
program
  .command('status')
  .description('프로젝트 상태 확인')
  .action(async () => {
    const codeb = new CodeB();
    await codeb.checkStatus();
  });

// DB 관리 명령
program
  .command('db')
  .description('데이터베이스 관리')
  .option('-c, --create', '데이터베이스 생성')
  .option('-m, --migrate', '마이그레이션 실행')
  .option('-s, --seed', '시드 데이터 생성')
  .option('-r, --reset', '데이터베이스 리셋')
  .action(async (options) => {
    const codeb = new CodeB();
    await codeb.manageDatabase(options);
  });

// 에러 핸들링
program.exitOverride();

try {
  program.parse();
} catch (err) {
  if (err.code === 'commander.helpDisplayed') {
    process.exit(0);
  }
  console.error(chalk.red.bold('❌ CLI 에러:'), err.message);
  process.exit(1);
}

// 명령어가 없을 때 도움말 표시
if (!process.argv.slice(2).length) {
  program.outputHelp();
}