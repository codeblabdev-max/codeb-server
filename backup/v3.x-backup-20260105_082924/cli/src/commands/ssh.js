/**
 * SSH Key Management Command
 *
 * Vultr API를 통한 팀원 SSH 키 자동 등록/관리
 * - register: 새 SSH 키 등록
 * - list: 등록된 SSH 키 목록
 * - remove: SSH 키 삭제
 * - sync: 서버와 SSH 키 동기화
 *
 * ⚠️  SECURITY WARNING - 보안 경고 ⚠️
 * =====================================
 * 이 파일은 SSH 키 관리 API (/ssh-keys)만 사용합니다.
 *
 * 절대 추가하지 말 것 (서버 손실 위험):
 * - /instances/* 엔드포인트 (서버 관리)
 * - reinstall, reboot, halt, destroy 등의 서버 조작 API
 * - 서버 재설치/포맷/삭제 관련 모든 기능
 *
 * 2024년 Vultr API로 인한 서버 포맷 사고 방지를 위해
 * SSH 키 관리 기능만 유지합니다.
 * =====================================
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import axios from 'axios';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Vultr API Configuration
const VULTR_API_BASE = 'https://api.vultr.com/v2';

/**
 * Vultr API 클라이언트 생성
 */
function createVultrClient(apiKey) {
  return axios.create({
    baseURL: VULTR_API_BASE,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });
}

/**
 * API 키 가져오기 (환경변수 또는 설정파일)
 */
function getVultrApiKey() {
  // 1. 환경변수에서 확인
  if (process.env.VULTR_API_KEY) {
    return process.env.VULTR_API_KEY;
  }

  // 2. 설정 파일에서 확인
  const configPaths = [
    join(homedir(), '.vultr.json'),
    join(homedir(), '.config', 'vultr', 'config.json'),
    join(process.cwd(), '.vultr.json')
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        if (config.api_key) return config.api_key;
      } catch (e) {
        // 설정 파일 파싱 실패, 계속 진행
      }
    }
  }

  return null;
}

/**
 * 로컬 SSH 공개키 읽기
 */
function readLocalSSHKey(keyPath) {
  const defaultPaths = [
    join(homedir(), '.ssh', 'id_ed25519.pub'),
    join(homedir(), '.ssh', 'id_rsa.pub'),
    join(homedir(), '.ssh', 'id_ecdsa.pub')
  ];

  const pathsToCheck = keyPath ? [keyPath] : defaultPaths;

  for (const path of pathsToCheck) {
    if (existsSync(path)) {
      return {
        path,
        content: readFileSync(path, 'utf-8').trim()
      };
    }
  }

  return null;
}

/**
 * SSH 키 등록
 */
async function registerKey(client, name, sshKey) {
  const response = await client.post('/ssh-keys', {
    name,
    ssh_key: sshKey
  });
  return response.data.ssh_key;
}

/**
 * SSH 키 목록 조회
 */
async function listKeys(client) {
  const response = await client.get('/ssh-keys');
  return response.data.ssh_keys || [];
}

/**
 * SSH 키 삭제
 */
async function deleteKey(client, keyId) {
  await client.delete(`/ssh-keys/${keyId}`);
}

/**
 * SSH 키 상세 조회
 */
async function getKey(client, keyId) {
  const response = await client.get(`/ssh-keys/${keyId}`);
  return response.data.ssh_key;
}

/**
 * Main SSH Command Handler
 */
export async function ssh(action, target, options) {
  console.log(chalk.cyan('\n🔐 SSH Key Manager - Vultr API Integration\n'));

  // help는 API 키 없이도 표시
  if (action === 'help' || action === '--help' || action === '-h') {
    showHelp();
    return;
  }

  // API 키 확인
  let apiKey = options.apiKey || getVultrApiKey();

  if (!apiKey) {
    console.log(chalk.yellow('⚠️  Vultr API 키가 설정되지 않았습니다.\n'));
    console.log(chalk.gray('설정 방법:'));
    console.log(chalk.gray('  1. 환경변수: export VULTR_API_KEY=your_api_key'));
    console.log(chalk.gray('  2. 설정파일: ~/.vultr.json에 {"api_key": "your_key"} 저장'));
    console.log(chalk.gray('  3. 명령옵션: --api-key your_api_key\n'));

    // 대화형으로 API 키 입력 받기
    if (!options.noInteractive) {
      const { inputApiKey } = await inquirer.prompt([{
        type: 'password',
        name: 'inputApiKey',
        message: 'Vultr API Key를 입력하세요:',
        mask: '*'
      }]);
      apiKey = inputApiKey;
    }

    if (!apiKey) {
      console.log(chalk.red('❌ API 키가 필요합니다.'));
      process.exit(1);
    }
  }

  const client = createVultrClient(apiKey);

  try {
    switch (action) {
      case 'register':
      case 'add':
        await handleRegister(client, target, options);
        break;

      case 'list':
      case 'ls':
        await handleList(client, options);
        break;

      case 'remove':
      case 'rm':
      case 'delete':
        await handleRemove(client, target, options);
        break;

      case 'show':
      case 'get':
        await handleShow(client, target, options);
        break;

      case 'sync':
        await handleSync(client, options);
        break;

      default:
        showHelp();
    }
  } catch (error) {
    handleError(error);
  }
}

/**
 * SSH 키 등록 핸들러
 */
async function handleRegister(client, keyPath, options) {
  const spinner = ora('SSH 키 정보 확인 중...').start();

  try {
    // 로컬 SSH 키 읽기
    const localKey = readLocalSSHKey(keyPath);

    if (!localKey) {
      spinner.fail('SSH 공개키를 찾을 수 없습니다.');
      console.log(chalk.gray('\n확인된 경로:'));
      console.log(chalk.gray('  - ~/.ssh/id_ed25519.pub'));
      console.log(chalk.gray('  - ~/.ssh/id_rsa.pub'));
      console.log(chalk.gray('  - ~/.ssh/id_ecdsa.pub'));
      console.log(chalk.yellow('\n💡 SSH 키가 없다면: ssh-keygen -t ed25519 -C "your_email@example.com"'));
      return;
    }

    spinner.text = '키 등록 중...';

    // 키 이름 결정
    let keyName = options.name;
    if (!keyName) {
      spinner.stop();
      const { inputName } = await inquirer.prompt([{
        type: 'input',
        name: 'inputName',
        message: 'SSH 키 이름을 입력하세요 (팀원 이름 권장):',
        default: `${process.env.USER || 'developer'}-${Date.now()}`
      }]);
      keyName = inputName;
      spinner.start('키 등록 중...');
    }

    // 중복 확인
    const existingKeys = await listKeys(client);
    const duplicate = existingKeys.find(k => k.ssh_key.trim() === localKey.content);

    if (duplicate) {
      spinner.warn('이미 등록된 SSH 키입니다.');
      console.log(chalk.gray(`  이름: ${duplicate.name}`));
      console.log(chalk.gray(`  ID: ${duplicate.id}`));
      return;
    }

    // 등록
    const newKey = await registerKey(client, keyName, localKey.content);

    spinner.succeed('SSH 키가 성공적으로 등록되었습니다!');
    console.log('');
    console.log(chalk.green('✅ 등록 정보:'));
    console.log(chalk.gray(`   이름: ${newKey.name}`));
    console.log(chalk.gray(`   ID: ${newKey.id}`));
    console.log(chalk.gray(`   등록일: ${new Date(newKey.date_created).toLocaleString()}`));
    console.log('');
    console.log(chalk.cyan('💡 이제 이 SSH 키로 서버에 접속할 수 있습니다.'));
    console.log(chalk.gray('   새 서버 생성 시 자동으로 이 키가 적용됩니다.'));

  } catch (error) {
    spinner.fail('SSH 키 등록 실패');
    throw error;
  }
}

/**
 * SSH 키 목록 핸들러
 */
async function handleList(client, options) {
  const spinner = ora('SSH 키 목록 조회 중...').start();

  try {
    const keys = await listKeys(client);
    spinner.stop();

    if (keys.length === 0) {
      console.log(chalk.yellow('📭 등록된 SSH 키가 없습니다.'));
      console.log(chalk.gray('\n💡 키 등록: we ssh register'));
      return;
    }

    console.log(chalk.cyan(`📋 등록된 SSH 키 (${keys.length}개)\n`));

    if (options.json) {
      console.log(JSON.stringify(keys, null, 2));
      return;
    }

    // 테이블 형식 출력
    console.log(chalk.gray('─'.repeat(80)));
    console.log(
      chalk.bold.white('ID'.padEnd(40)) +
      chalk.bold.white('이름'.padEnd(25)) +
      chalk.bold.white('등록일')
    );
    console.log(chalk.gray('─'.repeat(80)));

    for (const key of keys) {
      const date = new Date(key.date_created).toLocaleDateString();
      console.log(
        chalk.gray(key.id.padEnd(40)) +
        chalk.white(key.name.substring(0, 23).padEnd(25)) +
        chalk.gray(date)
      );
    }

    console.log(chalk.gray('─'.repeat(80)));
    console.log('');
    console.log(chalk.gray('💡 상세 정보: we ssh show <key-id>'));
    console.log(chalk.gray('💡 키 삭제: we ssh remove <key-id>'));

  } catch (error) {
    spinner.fail('목록 조회 실패');
    throw error;
  }
}

/**
 * SSH 키 삭제 핸들러
 */
async function handleRemove(client, keyId, options) {
  if (!keyId) {
    // 대화형으로 선택
    const keys = await listKeys(client);

    if (keys.length === 0) {
      console.log(chalk.yellow('📭 삭제할 SSH 키가 없습니다.'));
      return;
    }

    const { selectedKey } = await inquirer.prompt([{
      type: 'list',
      name: 'selectedKey',
      message: '삭제할 SSH 키를 선택하세요:',
      choices: keys.map(k => ({
        name: `${k.name} (${k.id.substring(0, 8)}...)`,
        value: k.id
      }))
    }]);

    keyId = selectedKey;
  }

  // 확인
  if (!options.force) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: chalk.yellow(`정말로 SSH 키를 삭제하시겠습니까? (ID: ${keyId})`),
      default: false
    }]);

    if (!confirm) {
      console.log(chalk.gray('취소되었습니다.'));
      return;
    }
  }

  const spinner = ora('SSH 키 삭제 중...').start();

  try {
    await deleteKey(client, keyId);
    spinner.succeed('SSH 키가 삭제되었습니다.');
  } catch (error) {
    spinner.fail('SSH 키 삭제 실패');
    throw error;
  }
}

/**
 * SSH 키 상세 정보 핸들러
 */
async function handleShow(client, keyId, options) {
  if (!keyId) {
    console.log(chalk.red('❌ SSH 키 ID를 입력하세요.'));
    console.log(chalk.gray('사용법: we ssh show <key-id>'));
    return;
  }

  const spinner = ora('SSH 키 정보 조회 중...').start();

  try {
    const key = await getKey(client, keyId);
    spinner.stop();

    console.log(chalk.cyan('🔑 SSH 키 상세 정보\n'));
    console.log(chalk.white('이름:     ') + chalk.green(key.name));
    console.log(chalk.white('ID:       ') + chalk.gray(key.id));
    console.log(chalk.white('등록일:   ') + chalk.gray(new Date(key.date_created).toLocaleString()));
    console.log(chalk.white('공개키:'));
    console.log(chalk.gray('  ' + key.ssh_key.substring(0, 60) + '...'));

  } catch (error) {
    spinner.fail('정보 조회 실패');
    throw error;
  }
}

/**
 * 서버 SSH 키 동기화 핸들러
 */
async function handleSync(client, options) {
  const spinner = ora('SSH 키 동기화 확인 중...').start();

  try {
    // Vultr에 등록된 키 조회
    const vultrKeys = await listKeys(client);

    // 로컬 키 확인
    const localKey = readLocalSSHKey(null);

    spinner.stop();

    console.log(chalk.cyan('🔄 SSH 키 동기화 상태\n'));

    console.log(chalk.white('Vultr 등록 키:'), chalk.green(`${vultrKeys.length}개`));

    if (localKey) {
      const isRegistered = vultrKeys.some(k => k.ssh_key.trim() === localKey.content);

      console.log(chalk.white('로컬 키:      '), chalk.gray(localKey.path));
      console.log(chalk.white('등록 상태:    '), isRegistered
        ? chalk.green('✅ 등록됨')
        : chalk.yellow('⚠️  미등록')
      );

      if (!isRegistered) {
        console.log('');
        const { shouldRegister } = await inquirer.prompt([{
          type: 'confirm',
          name: 'shouldRegister',
          message: '로컬 SSH 키를 Vultr에 등록하시겠습니까?',
          default: true
        }]);

        if (shouldRegister) {
          await handleRegister(client, localKey.path, options);
        }
      }
    } else {
      console.log(chalk.white('로컬 키:      '), chalk.red('없음'));
      console.log(chalk.yellow('\n💡 SSH 키 생성: ssh-keygen -t ed25519 -C "your_email@example.com"'));
    }

  } catch (error) {
    spinner.fail('동기화 확인 실패');
    throw error;
  }
}

/**
 * 도움말 표시
 */
function showHelp() {
  console.log(chalk.cyan('📖 SSH Key Manager 사용법\n'));

  console.log(chalk.white('Commands:'));
  console.log(chalk.gray('  register, add    ') + '로컬 SSH 공개키를 Vultr에 등록');
  console.log(chalk.gray('  list, ls         ') + '등록된 SSH 키 목록 조회');
  console.log(chalk.gray('  remove, rm       ') + 'SSH 키 삭제');
  console.log(chalk.gray('  show, get        ') + 'SSH 키 상세 정보 조회');
  console.log(chalk.gray('  sync             ') + '로컬과 Vultr SSH 키 동기화 확인');

  console.log(chalk.white('\nExamples:'));
  console.log(chalk.gray('  we ssh register                    ') + '# 로컬 SSH 키 등록');
  console.log(chalk.gray('  we ssh register --name "홍길동"    ') + '# 이름 지정하여 등록');
  console.log(chalk.gray('  we ssh register ~/.ssh/mykey.pub   ') + '# 특정 키 파일 등록');
  console.log(chalk.gray('  we ssh list                        ') + '# 등록된 키 목록');
  console.log(chalk.gray('  we ssh remove <key-id>             ') + '# 키 삭제');
  console.log(chalk.gray('  we ssh sync                        ') + '# 동기화 상태 확인');

  console.log(chalk.white('\nOptions:'));
  console.log(chalk.gray('  --api-key <key>  ') + 'Vultr API 키 직접 지정');
  console.log(chalk.gray('  --name <name>    ') + 'SSH 키 이름 지정');
  console.log(chalk.gray('  --force          ') + '확인 없이 삭제');
  console.log(chalk.gray('  --json           ') + 'JSON 형식으로 출력');

  console.log(chalk.white('\nAPI Key 설정:'));
  console.log(chalk.gray('  1. 환경변수: export VULTR_API_KEY=your_api_key'));
  console.log(chalk.gray('  2. 설정파일: ~/.vultr.json 에 {"api_key": "your_key"} 저장'));
  console.log(chalk.gray('  3. 옵션: --api-key your_api_key'));

  console.log(chalk.cyan('\n💡 Vultr API 키 발급: https://my.vultr.com/settings/#settingsapi'));
}

/**
 * 에러 핸들러
 */
function handleError(error) {
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;

    switch (status) {
      case 401:
        console.log(chalk.red('\n❌ 인증 실패: API 키가 유효하지 않습니다.'));
        console.log(chalk.gray('💡 API 키 확인: https://my.vultr.com/settings/#settingsapi'));
        break;
      case 403:
        console.log(chalk.red('\n❌ 권한 부족: 이 작업을 수행할 권한이 없습니다.'));
        break;
      case 404:
        console.log(chalk.red('\n❌ 찾을 수 없음: 요청한 리소스가 존재하지 않습니다.'));
        break;
      case 400:
        console.log(chalk.red('\n❌ 잘못된 요청:'), data?.error || '요청 형식이 올바르지 않습니다.');
        break;
      default:
        console.log(chalk.red(`\n❌ API 오류 (${status}):`), data?.error || error.message);
    }
  } else if (error.code === 'ENOTFOUND') {
    console.log(chalk.red('\n❌ 네트워크 오류: Vultr API에 연결할 수 없습니다.'));
  } else {
    console.log(chalk.red('\n❌ 오류:'), error.message);
  }

  process.exit(1);
}

export default ssh;
