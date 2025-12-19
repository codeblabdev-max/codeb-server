#!/usr/bin/env node

const chalk = require('chalk');

console.log(chalk.yellow(`
👋 CodeB CLI 제거 완료

설정 파일을 수동으로 제거하려면:
  ${chalk.cyan('codeb config --reset')}  # 설정 초기화 (제거 전에 실행)

감사합니다! 🙏
`));