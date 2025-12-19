#!/usr/bin/env node

/**
 * 🚀 Coolify 배포 CLI - 로컬 명령줄 도구
 * 한 줄 명령으로 프로젝트, 도메인, DB, 환경변수 설정
 */

const axios = require('axios');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// 설정
const CONFIG = {
    API_URL: process.env.DEPLOY_API_URL || 'http://141.164.60.51:3005/api',
    DEFAULT_DOMAIN: 'one-q.xyz'
};

// 색상 코드
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

// 로그 헬퍼
const log = {
    info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
    success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
    error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
    warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
    step: (msg) => console.log(`${colors.cyan}→${colors.reset} ${msg}`)
};

// 배포 설정 파일 읽기
function loadDeployConfig(filePath) {
    try {
        const configPath = path.resolve(filePath);
        if (!fs.existsSync(configPath)) {
            log.error(`Configuration file not found: ${configPath}`);
            process.exit(1);
        }
        
        const configContent = fs.readFileSync(configPath, 'utf8');
        
        // JSON 또는 JavaScript 파일 지원
        if (filePath.endsWith('.json')) {
            return JSON.parse(configContent);
        } else if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
            // YAML 지원 (yaml 패키지 필요)
            log.error('YAML files not yet supported. Use JSON format.');
            process.exit(1);
        }
        
        return JSON.parse(configContent);
    } catch (error) {
        log.error(`Failed to load configuration: ${error.message}`);
        process.exit(1);
    }
}

// 빠른 배포 함수
async function quickDeploy(options) {
    const {
        name,
        git,
        branch = 'main',
        domain,
        port = '3000',
        databases = [],
        env = [],
        compose,
        config: configFile
    } = options;

    let deployConfig;

    // 설정 파일에서 로드
    if (configFile) {
        deployConfig = loadDeployConfig(configFile);
        deployConfig.projectName = name || deployConfig.projectName;
    } else {
        // 명령줄 옵션에서 구성
        deployConfig = {
            projectName: name,
            gitRepository: git,
            gitBranch: branch,
            domain: domain || `${name}.${CONFIG.DEFAULT_DOMAIN}`,
            port: port,
            databases: parseDatabases(databases),
            environmentVariables: parseEnvVars(env),
            dockerComposeContent: compose ? fs.readFileSync(compose, 'utf8') : null
        };
    }

    if (!deployConfig.projectName) {
        log.error('Project name is required (use --name <name>)');
        process.exit(1);
    }

    console.log(`\n${colors.bright}🚀 Deploying Project: ${deployConfig.projectName}${colors.reset}`);
    log.step(`Domain: ${deployConfig.domain || deployConfig.projectName + '.' + CONFIG.DEFAULT_DOMAIN}`);
    
    if (deployConfig.gitRepository) {
        log.step(`Git Repository: ${deployConfig.gitRepository}`);
        log.step(`Branch: ${deployConfig.gitBranch}`);
    }
    
    if (deployConfig.databases.length > 0) {
        log.step(`Databases: ${deployConfig.databases.map(db => `${db.type}(${db.name})`).join(', ')}`);
    }
    
    if (deployConfig.environmentVariables.length > 0) {
        log.step(`Environment Variables: ${deployConfig.environmentVariables.length} variables`);
    }

    console.log('');

    try {
        log.info('Connecting to deployment server...');
        
        const response = await axios.post(`${CONFIG.API_URL}/deploy/complete`, deployConfig, {
            timeout: 120000 // 2분 타임아웃
        });

        const result = response.data;

        if (result.success) {
            console.log(`\n${colors.green}${colors.bright}✅ Deployment Successful!${colors.reset}\n`);
            
            console.log(`${colors.bright}Project Details:${colors.reset}`);
            console.log(`  📦 Name: ${result.projectName}`);
            console.log(`  🌐 URL: ${colors.cyan}${result.url}${colors.reset}`);
            console.log(`  🎯 Domain: ${result.domain}`);
            console.log(`  📊 Dashboard: ${colors.blue}${result.coolify.dashboardUrl}${colors.reset}`);
            
            if (result.databases.length > 0) {
                console.log(`\n${colors.bright}Databases:${colors.reset}`);
                result.databases.forEach(db => {
                    console.log(`  💾 ${db.name} (${db.type}): ${db.status}`);
                    if (db.credentials) {
                        console.log(`     User: ${db.credentials.user}`);
                        console.log(`     Pass: ${db.credentials.password}`);
                        console.log(`     DB: ${db.credentials.database}`);
                    }
                });
            }

            console.log(`\n${colors.bright}Deployment Log:${colors.reset}`);
            result.deploymentLog.forEach(log => {
                const icon = log.status === 'completed' ? '✓' : 
                           log.status === 'failed' ? '✗' : '→';
                const color = log.status === 'completed' ? colors.green : 
                             log.status === 'failed' ? colors.red : colors.yellow;
                console.log(`  ${color}${icon}${colors.reset} ${log.step}: ${log.details || log.status}`);
            });

            console.log(`\n${colors.bright}Next Steps:${colors.reset}`);
            console.log(`  1. ${result.instructions.access}`);
            console.log(`  2. ${result.instructions.dashboard}`);
            console.log(`  3. ${result.instructions.dns}`);
            
            console.log(`\n${colors.magenta}Deployment ID: ${result.deploymentId}${colors.reset}`);
        }

    } catch (error) {
        console.error(`\n${colors.red}${colors.bright}❌ Deployment Failed${colors.reset}\n`);
        
        if (error.response?.data) {
            const errorData = error.response.data;
            console.error(`Error: ${errorData.error}`);
            console.error(`Details: ${errorData.details}`);
            
            if (errorData.deploymentLog) {
                console.log(`\n${colors.bright}Deployment Log:${colors.reset}`);
                errorData.deploymentLog.forEach(log => {
                    const icon = log.status === 'completed' ? '✓' : 
                               log.status === 'failed' ? '✗' : '→';
                    const color = log.status === 'completed' ? colors.green : 
                                 log.status === 'failed' ? colors.red : colors.yellow;
                    console.log(`  ${color}${icon}${colors.reset} ${log.step}: ${log.details || log.error || log.status}`);
                });
            }
        } else {
            console.error(`Error: ${error.message}`);
        }
        
        process.exit(1);
    }
}

// 데이터베이스 파싱
function parseDatabases(dbString) {
    if (!dbString || dbString.length === 0) return [];
    
    const databases = [];
    const dbList = Array.isArray(dbString) ? dbString : dbString.split(',');
    
    dbList.forEach(db => {
        const dbTrim = db.trim().toLowerCase();
        let dbConfig = {};
        
        if (dbTrim.includes(':')) {
            const [type, name] = dbTrim.split(':');
            dbConfig = { type: type.trim(), name: name.trim() };
        } else {
            dbConfig = { 
                type: dbTrim, 
                name: dbTrim === 'postgresql' ? 'db' : 
                      dbTrim === 'redis' ? 'cache' : 
                      dbTrim === 'mysql' ? 'mysql' :
                      dbTrim === 'mongodb' ? 'mongo' : dbTrim
            };
        }
        
        databases.push(dbConfig);
    });
    
    return databases;
}

// 환경변수 파싱
function parseEnvVars(envArray) {
    if (!envArray || envArray.length === 0) return [];
    
    const variables = [];
    const envList = Array.isArray(envArray) ? envArray : [envArray];
    
    envList.forEach(env => {
        if (env.includes('=')) {
            const [key, ...valueParts] = env.split('=');
            variables.push({
                key: key.trim(),
                value: valueParts.join('=').trim()
            });
        }
    });
    
    return variables;
}

// 대화형 모드
async function interactiveMode() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const ask = (question) => new Promise(resolve => rl.question(question, resolve));

    console.log(`\n${colors.bright}${colors.cyan}🚀 Coolify Deployment CLI - Interactive Mode${colors.reset}\n`);

    const config = {};
    
    config.projectName = await ask('Project name: ');
    config.domain = await ask(`Domain (Enter for ${config.projectName}.${CONFIG.DEFAULT_DOMAIN}): `) || 
                   `${config.projectName}.${CONFIG.DEFAULT_DOMAIN}`;
    
    config.gitRepository = await ask('Git repository URL (optional): ');
    if (config.gitRepository) {
        config.gitBranch = await ask('Git branch (default: main): ') || 'main';
        config.buildPack = await ask('Build pack (nixpacks/dockerfile/static) [nixpacks]: ') || 'nixpacks';
        config.port = await ask('Application port (default: 3000): ') || '3000';
    }

    // 데이터베이스
    console.log('\nAvailable databases: postgresql, mysql, redis, mongodb');
    const dbInput = await ask('Databases to create (comma-separated, or press Enter to skip): ');
    config.databases = parseDatabases(dbInput);

    // 환경변수
    config.environmentVariables = [];
    const addEnv = await ask('\nAdd environment variables? (y/N): ');
    if (addEnv.toLowerCase() === 'y') {
        console.log('Enter environment variables (KEY=value), empty line to finish:');
        while (true) {
            const envVar = await ask('> ');
            if (!envVar) break;
            const [key, ...valueParts] = envVar.split('=');
            if (key && valueParts.length > 0) {
                config.environmentVariables.push({
                    key: key.trim(),
                    value: valueParts.join('=').trim()
                });
            }
        }
    }

    rl.close();

    // 배포 실행
    await quickDeploy(config);
}

// 명령줄 파싱
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        databases: [],
        env: []
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const nextArg = args[i + 1];

        switch(arg) {
            case '--name':
            case '-n':
                options.name = nextArg;
                i++;
                break;
            case '--git':
            case '-g':
                options.git = nextArg;
                i++;
                break;
            case '--branch':
            case '-b':
                options.branch = nextArg;
                i++;
                break;
            case '--domain':
            case '-d':
                options.domain = nextArg;
                i++;
                break;
            case '--port':
            case '-p':
                options.port = nextArg;
                i++;
                break;
            case '--db':
            case '--database':
                options.databases.push(nextArg);
                i++;
                break;
            case '--env':
            case '-e':
                options.env.push(nextArg);
                i++;
                break;
            case '--compose':
            case '-c':
                options.compose = nextArg;
                i++;
                break;
            case '--config':
            case '-f':
                options.config = nextArg;
                i++;
                break;
            case '--help':
            case '-h':
                showHelp();
                process.exit(0);
            case '--interactive':
            case '-i':
                return { interactive: true };
        }
    }

    return options;
}

// 도움말
function showHelp() {
    console.log(`
${colors.bright}Coolify Deployment CLI${colors.reset}

${colors.bright}Usage:${colors.reset}
  deploy-cli [options]
  deploy-cli --interactive
  deploy-cli --config <config.json>

${colors.bright}Options:${colors.reset}
  -n, --name <name>         Project name (required)
  -g, --git <url>           Git repository URL
  -b, --branch <branch>     Git branch (default: main)
  -d, --domain <domain>     Custom domain (default: <name>.one-q.xyz)
  -p, --port <port>         Application port (default: 3000)
  --db <type[:name]>        Database to create (postgresql, mysql, redis, mongodb)
  -e, --env KEY=value       Environment variable
  -c, --compose <file>      Docker Compose file path
  -f, --config <file>       Load configuration from JSON file
  -i, --interactive         Interactive mode
  -h, --help               Show this help

${colors.bright}Examples:${colors.reset}
  # Simple deployment
  deploy-cli --name myapp

  # Git repository with PostgreSQL
  deploy-cli --name myapp --git https://github.com/user/repo --db postgresql

  # Multiple databases and env vars
  deploy-cli --name myapp --db postgresql --db redis -e NODE_ENV=production -e API_KEY=secret

  # Using config file
  deploy-cli --config deploy.json

  # Interactive mode
  deploy-cli --interactive

${colors.bright}Config File Format (deploy.json):${colors.reset}
  {
    "projectName": "myapp",
    "domain": "myapp.one-q.xyz",
    "gitRepository": "https://github.com/user/repo",
    "gitBranch": "main",
    "databases": [
      { "type": "postgresql", "name": "db" },
      { "type": "redis", "name": "cache" }
    ],
    "environmentVariables": [
      { "key": "NODE_ENV", "value": "production" },
      { "key": "API_KEY", "value": "secret" }
    ]
  }
`);
}

// 메인 실행
async function main() {
    const options = parseArgs();

    if (options.interactive) {
        await interactiveMode();
    } else if (Object.keys(options).length === 0) {
        showHelp();
        process.exit(0);
    } else {
        await quickDeploy(options);
    }
}

// 에러 핸들링
process.on('unhandledRejection', (error) => {
    log.error(`Unexpected error: ${error.message}`);
    process.exit(1);
});

// 실행
main().catch(error => {
    log.error(`Fatal error: ${error.message}`);
    process.exit(1);
});