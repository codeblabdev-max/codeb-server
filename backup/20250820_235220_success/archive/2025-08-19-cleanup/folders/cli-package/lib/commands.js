const axios = require('axios');
const chalk = require('chalk');
const ora = require('ora');
const Conf = require('conf');
const { execSync } = require('child_process');
const path = require('path');

// Configuration management
const config = new Conf({
  projectName: 'codeb-cli',
  defaults: {
    serverUrl: 'http://141.164.60.51:3007',
    apiTimeout: 600000 // 10 minutes (to match server timeout)
  }
});

// API client
const createApiClient = () => {
  return axios.create({
    baseURL: config.get('serverUrl'),
    timeout: config.get('apiTimeout'),
    headers: {
      'Content-Type': 'application/json'
    }
  });
};

// Helper functions
const log = {
  info: (msg) => console.log(chalk.blue('ℹ'), msg),
  success: (msg) => console.log(chalk.green('✅'), msg),
  error: (msg) => console.log(chalk.red('❌'), msg),
  warning: (msg) => console.log(chalk.yellow('⚠️'), msg),
  title: (msg) => console.log(chalk.bold.cyan(`\n🚀 ${msg}\n`))
};

const getCurrentGitRepo = () => {
  try {
    const remote = execSync('git config --get remote.origin.url', { encoding: 'utf8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    return { repository: remote, branch };
  } catch (error) {
    throw new Error('현재 디렉토리가 Git 저장소가 아니거나 원격 저장소가 설정되지 않았습니다.');
  }
};

const validateProjectName = (name) => {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error('프로젝트 이름은 영문 소문자, 숫자, 하이픈(-)만 사용 가능합니다.');
  }
  if (name.length > 63) {
    throw new Error('프로젝트 이름은 63자를 초과할 수 없습니다.');
  }
  return true;
};

const parseDatabases = (databases) => {
  const validTypes = ['postgresql', 'mysql', 'redis', 'mongodb'];
  return databases?.map(db => {
    if (typeof db === 'string' && validTypes.includes(db)) {
      return { name: 'main', type: db };
    }
    throw new Error(`지원하지 않는 데이터베이스 타입: ${db}. 지원 타입: ${validTypes.join(', ')}`);
  }) || [];
};

const parseEnvVars = (envVars) => {
  return envVars?.reduce((acc, envVar) => {
    const [key, ...valueParts] = envVar.split('=');
    if (!key || valueParts.length === 0) {
      throw new Error(`잘못된 환경변수 형식: ${envVar}. KEY=VALUE 형식을 사용하세요.`);
    }
    acc[key] = valueParts.join('=');
    return acc;
  }, {}) || {};
};

// Commands
const deploy = async (name, repository, options) => {
  log.title('CodeB 배포 시작');
  
  try {
    validateProjectName(name);
    
    // If no repository provided, try to get from current git repo
    if (!repository) {
      try {
        const gitInfo = getCurrentGitRepo();
        repository = gitInfo.repository;
        options.branch = options.branch || gitInfo.branch;
        log.info(`현재 Git 저장소 사용: ${repository} (${options.branch} 브랜치)`);
      } catch (error) {
        log.error(error.message);
        log.info('💡 팁: Git URL을 직접 지정하려면 "codeb init <project-name> <git-url>" 형식을 사용하세요.');
        process.exit(1);
      }
    } else {
      log.info(`지정된 Git 저장소 사용: ${repository} (${options.branch} 브랜치)`);
    }
    
    const databases = parseDatabases(options.db);
    const environmentVariables = parseEnvVars(options.env);
    
    const deploymentData = {
      projectName: name,
      gitRepository: repository,
      gitBranch: options.branch,
      buildPack: options.type,
      port: options.port,
      databases,
      environmentVariables: environmentVariables || {}
    };
    
    log.info(`프로젝트: ${chalk.bold(name)}`);
    log.info(`저장소: ${repository}`);
    log.info(`브랜치: ${options.branch}`);
    if (databases.length > 0) {
      log.info(`데이터베이스: ${databases.map(db => db.type).join(', ')}`);
    }
    
    let spinner = ora('배포 시작 중...').start();
    let progressTimer;
    
    const api = createApiClient();
    
    // Progress tracking
    const startTime = Date.now();
    progressTimer = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      if (elapsed < 30) {
        spinner.text = `배포 진행 중... (${elapsed}초 경과 - 프로젝트 생성)`;
      } else if (elapsed < 60) {
        spinner.text = `배포 진행 중... (${elapsed}초 경과 - 데이터베이스 설정)`;
      } else if (elapsed < 120) {
        spinner.text = `배포 진행 중... (${elapsed}초 경과 - Git 복제 및 빌드)`;
      } else {
        spinner.text = `배포 진행 중... (${elapsed}초 경과 - 애플리케이션 시작)`;
      }
    }, 5000);
    
    const response = await api.post('/api/deploy/complete', deploymentData);
    clearInterval(progressTimer);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    spinner.succeed(`배포 완료! (총 ${elapsed}초 소요)`);
    
    const data = response.data;
    const applicationUuid = data.coolify?.applicationUuid || data.applicationUuid;
    const fqdn = data.url || data.domain || data.fqdn;
    const createdDatabases = data.databases || [];
    
    log.success(`애플리케이션 UUID: ${applicationUuid}`);
    log.success(`URL: ${chalk.bold.green(fqdn)}`);
    
    if (createdDatabases.length > 0) {
      log.success('생성된 데이터베이스:');
      createdDatabases.forEach(db => {
        log.info(`  - ${db.type}: ${db.name}`);
      });
    }
    
    log.info('\n🎉 배포가 완료되었습니다!');
    log.info(`💡 SSL 인증서 발급까지 1-2분 정도 소요될 수 있습니다.`);
    log.info(`📊 상태 확인: ${chalk.cyan(`codeb status ${name}`)}`);
    log.info(`📋 로그 확인: ${chalk.cyan(`codeb logs ${name}`)}`);
    
  } catch (error) {
    if (typeof progressTimer !== 'undefined') {
      clearInterval(progressTimer);
    }
    if (typeof spinner !== 'undefined') {
      spinner.fail('배포 실패!');
    }
    
    // More detailed error logging
    if (error.response) {
      log.error(`HTTP ${error.response.status}: ${error.response.statusText}`);
      if (error.response.data) {
        log.error(`응답: ${JSON.stringify(error.response.data, null, 2)}`);
      }
    } else if (error.request) {
      log.error('서버 응답 없음. 네트워크 연결을 확인하세요.');
      log.error(`요청 URL: ${error.config?.url || 'N/A'}`);
    } else {
      log.error(`오류: ${error.message}`);
    }
    
    log.info('\n🔍 문제 해결 도움말:');
    log.info('  1. 서버 상태 확인: codeb health');
    log.info('  2. 설정 확인: codeb config --show');
    log.info('  3. 매뉴얼 확인: codeb doc troubleshoot');
    
    process.exit(1);
  }
};

const init = async (name, gitUrl, options) => {
  log.title('Git 저장소 배포');
  log.info(`입력된 Git URL: ${gitUrl}`);
  await deploy(name, gitUrl, options);
};

const status = async (name) => {
  log.title('배포 상태 확인');
  
  try {
    const api = createApiClient();
    const response = await api.get('/api/projects');
    const projects = response.data.projects || [];
    
    if (projects.length === 0) {
      log.warning('배포된 프로젝트가 없습니다.');
      return;
    }
    
    // Filter by name if provided
    const filteredProjects = name 
      ? projects.filter(p => p.name === name)
      : projects;
    
    if (name && filteredProjects.length === 0) {
      log.error(`프로젝트 '${name}'을 찾을 수 없습니다.`);
      return;
    }
    
    console.log(chalk.bold('\n📊 배포된 프로젝트 목록:\n'));
    
    filteredProjects.forEach(project => {
      console.log(chalk.cyan(`🔹 ${project.name}`));
      console.log(`   UUID: ${project.uuid}`);
      console.log(`   URL: ${chalk.green(project.fqdn || 'N/A')}`);
      console.log(`   상태: ${project.status || 'N/A'}`);
      console.log(`   생성일: ${new Date(project.created_at).toLocaleString('ko-KR')}`);
      console.log('');
    });
    
  } catch (error) {
    log.error(`상태 확인 실패: ${error.response?.data?.error || error.message}`);
    process.exit(1);
  }
};

const logs = async (name, options) => {
  log.title(`로그 확인: ${name}`);
  
  try {
    // This would need to be implemented in the API server
    log.warning('로그 기능은 향후 업데이트에서 제공될 예정입니다.');
    log.info(`웹 대시보드에서 확인: ${config.get('serverUrl').replace('3007', '8000')}`);
    
  } catch (error) {
    log.error(`로그 확인 실패: ${error.message}`);
    process.exit(1);
  }
};

const deleteProject = async (name, options) => {
  log.title(`프로젝트 삭제: ${name}`);
  
  try {
    // 먼저 프로젝트 목록에서 해당 프로젝트 찾기
    const api = createApiClient();
    const response = await api.get('/api/projects');
    const projects = response.data.projects || [];
    
    const project = projects.find(p => p.name === name);
    if (!project) {
      log.error(`프로젝트 '${name}'을 찾을 수 없습니다.`);
      log.info('사용 가능한 프로젝트 목록:');
      projects.forEach(p => log.info(`  - ${p.name}`));
      return;
    }
    
    log.info(`프로젝트 정보:`);
    log.info(`  이름: ${project.name}`);
    log.info(`  UUID: ${project.uuid}`);
    log.info(`  URL: ${project.fqdn}`);
    
    if (!options.force) {
      const { default: inquirer } = await import('inquirer');
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `정말로 '${name}' 프로젝트를 삭제하시겠습니까? (복구 불가능)`,
          default: false
        }
      ]);
      
      if (!confirm) {
        log.info('삭제가 취소되었습니다.');
        return;
      }
    }
    
    const spinner = ora('프로젝트 삭제 중...').start();
    
    try {
      const deleteResponse = await api.delete(`/api/projects/${project.uuid}`);
      spinner.succeed('프로젝트 삭제 완료!');
      
      log.success(`프로젝트 '${name}'이 성공적으로 삭제되었습니다.`);
      log.info('관련된 모든 애플리케이션과 데이터베이스도 함께 삭제되었습니다.');
      
    } catch (deleteError) {
      spinner.fail('프로젝트 삭제 실패!');
      
      if (deleteError.response) {
        log.error(`삭제 실패: ${deleteError.response.data?.error || deleteError.response.statusText}`);
      } else {
        log.error(`삭제 실패: ${deleteError.message}`);
      }
      
      log.info('문제가 지속되면 웹 대시보드에서 수동 삭제하세요:');
      log.info(`${config.get('serverUrl').replace('3007', '8000')}`);
    }
    
  } catch (error) {
    log.error(`프로젝트 삭제 실패: ${error.message}`);
    
    if (error.response) {
      log.error(`서버 응답: ${error.response.status} - ${error.response.statusText}`);
    }
    
    process.exit(1);
  }
};

const healthCheck = async () => {
  log.title('서버 상태 확인');
  
  try {
    const spinner = ora('서버 연결 확인 중...').start();
    
    const api = createApiClient();
    const response = await api.get('/api/health');
    
    spinner.succeed('서버 연결 성공!');
    
    const health = response.data;
    console.log(chalk.bold('\n🏥 서버 상태:\n'));
    console.log(`서버: ${chalk.green('정상')}`);
    console.log(`Coolify: ${health.coolify ? chalk.green('연결됨') : chalk.red('연결 실패')}`);
    console.log(`PowerDNS: ${health.powerdns ? chalk.green('연결됨') : chalk.red('연결 실패')}`);
    console.log(`업타임: ${health.uptime || 'N/A'}`);
    console.log(`버전: ${health.version || 'N/A'}`);
    
  } catch (error) {
    log.error(`서버 상태 확인 실패: ${error.message}`);
    log.info(`서버 URL: ${config.get('serverUrl')}`);
    process.exit(1);
  }
};

const configManager = async (options) => {
  if (options.show) {
    log.title('현재 설정');
    console.log(chalk.bold('\n⚙️ 설정 정보:\n'));
    console.log(`서버 URL: ${config.get('serverUrl')}`);
    console.log(`API 타임아웃: ${config.get('apiTimeout')}ms`);
    console.log(`설정 파일: ${config.path}`);
    return;
  }
  
  if (options.reset) {
    config.clear();
    log.success('설정이 초기화되었습니다.');
    return;
  }
  
  if (options.server) {
    config.set('serverUrl', options.server);
    log.success(`서버 URL이 ${options.server}로 설정되었습니다.`);
    return;
  }
  
  // Interactive configuration
  const { default: inquirer } = await import('inquirer');
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'serverUrl',
      message: '서버 URL을 입력하세요:',
      default: config.get('serverUrl')
    }
  ]);
  
  config.set('serverUrl', answers.serverUrl);
  log.success('설정이 저장되었습니다.');
};

const showDocumentation = async (section, options) => {
  const manualContent = require('./manual-simple');
  const lang = options.lang || 'ko';
  const manual = manualContent[lang];
  
  if (!manual) {
    log.error(`지원하지 않는 언어: ${lang}. 지원 언어: ko, en`);
    return;
  }

  // Clear screen for better reading experience
  console.clear();
  
  if (!section) {
    // Show main manual index
    console.log(chalk.bold.cyan(manual.main.title));
    console.log('');
    
    manual.main.sections.forEach((s, index) => {
      console.log(`${s.emoji} ${chalk.cyan(`${index + 1}. ${s.name}`)} ${chalk.gray(`(codeb doc ${s.key})`)}`);
    });
    
    console.log(manual.main.footer);
    return;
  }
  
  // Show specific section
  const sectionContent = manual[section];
  if (!sectionContent) {
    log.error(`섹션을 찾을 수 없습니다: ${section}`);
    log.info('사용 가능한 섹션: install, deploy, config, examples, troubleshoot, advanced');
    return;
  }
  
  console.log(chalk.bold.cyan(sectionContent.title));
  console.log(sectionContent.content);
  
  // Navigation footer
  console.log(chalk.gray('\n──────────────────────────────────────'));
  console.log(chalk.gray('💡 메뉴로 돌아가기: codeb doc'));
  console.log(chalk.gray('💡 다른 섹션: codeb doc <섹션명>'));
  console.log(chalk.gray('💡 도움말: codeb --help'));
};

module.exports = {
  deploy,
  init,
  status,
  logs,
  config: configManager,
  deleteProject,
  healthCheck,
  showDocumentation
};