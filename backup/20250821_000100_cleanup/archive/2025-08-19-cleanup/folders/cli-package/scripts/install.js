#!/usr/bin/env node

const chalk = require('chalk');

console.log(chalk.green(`
🚀 CodeB CLI 설치 완료!

사용법:
  ${chalk.cyan('codeb deploy my-app https://github.com/user/repo')}  # Git 저장소 배포
  ${chalk.cyan('codeb init my-app')}                                 # 현재 폴더 배포
  ${chalk.cyan('codeb status')}                                     # 모든 프로젝트 상태
  ${chalk.cyan('codeb logs my-app')}                                # 로그 확인
  ${chalk.cyan('codeb config --show')}                              # 설정 확인
  ${chalk.cyan('codeb health')}                                     # 서버 상태
  ${chalk.cyan('codeb --help')}                                     # 도움말

📚 자세한 사용법: https://github.com/your-username/codeb-cli
`));

// Check if server is accessible
const axios = require('axios');
const config = require('conf');
const conf = new config({ projectName: 'codeb-cli' });

(async () => {
  try {
    const serverUrl = conf.get('serverUrl', 'http://141.164.60.51:3007');
    await axios.get(`${serverUrl}/api/health`, { timeout: 5000 });
    console.log(chalk.green('✅ 서버 연결 확인됨!'));
  } catch (error) {
    console.log(chalk.yellow('⚠️  서버 연결을 확인할 수 없습니다.'));
    console.log(chalk.gray(`   서버 상태: codeb health`));
  }
})();