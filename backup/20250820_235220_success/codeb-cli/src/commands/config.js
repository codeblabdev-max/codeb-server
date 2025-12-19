/**
 * Config Commands
 * CLI 설정 명령어 구현
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const ora = require('ora');
const inquirer = require('inquirer');
const api = require('../lib/api');
const config = require('../lib/config');

// 초기 설정
async function init() {
  console.log(chalk.cyan('🔧 CodeB CLI Configuration Setup\n'));
  
  try {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'serverUrl',
        message: 'Server URL:',
        default: 'http://localhost:3000',
        validate: (input) => {
          if (!input) return 'Server URL is required';
          if (!input.match(/^https?:\/\/.+/)) return 'Please enter a valid URL';
          return true;
        }
      },
      {
        type: 'password',
        name: 'apiKey',
        message: 'API Key (required for authentication):',
        mask: '*',
        validate: (input) => {
          if (!input) return 'API Key is required for server access';
          if (!input.startsWith('cb_')) return 'Invalid API Key format';
          return true;
        }
      },
      {
        type: 'list',
        name: 'environment',
        message: 'Default environment:',
        choices: ['production', 'staging', 'development'],
        default: 'production'
      },
      {
        type: 'list',
        name: 'outputFormat',
        message: 'Default output format:',
        choices: ['table', 'json', 'yaml'],
        default: 'table'
      }
    ]);

    // Save configuration
    config.set('server', answers.serverUrl);
    config.set('apiKey', answers.apiKey);
    config.set('defaultEnvironment', answers.environment);
    config.set('outputFormat', answers.outputFormat);

    // Test connection
    const spinner = ora('Testing connection...').start();
    try {
      // Reinitialize API client with new config
      api.init();
      await api.get('/system/ping');
      spinner.succeed(chalk.green('Connection successful!'));
      
      console.log(chalk.cyan('\n✅ Configuration saved successfully!'));
      console.log(chalk.gray(`Config file: ${config.getConfigPath()}`));
      
    } catch (error) {
      spinner.warn(chalk.yellow('Warning: Could not connect to server'));
      console.log(chalk.gray('Configuration saved, but server is not reachable'));
      console.log(chalk.gray('You can test the connection later with: codeb config:test'));
    }
    
  } catch (error) {
    console.error(chalk.red('Failed to initialize configuration'));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

// 설정 조회
async function show(options) {
  try {
    const configData = config.getAll();
    
    if (options.json) {
      console.log(JSON.stringify(configData, null, 2));
      return;
    }
    
    console.log(chalk.cyan('📋 Current Configuration\n'));
    
    const table = new Table({
      style: {
        head: [],
        border: ['grey']
      }
    });
    
    table.push(
      [chalk.cyan('Server URL'), chalk.white(configData.server || 'Not set')],
      [chalk.cyan('API Token'), chalk.white(configData.token ? '***' + configData.token.slice(-4) : 'Not set')],
      [chalk.cyan('Environment'), chalk.white(configData.defaultEnvironment || 'production')],
      [chalk.cyan('Output Format'), chalk.white(configData.outputFormat || 'table')],
      [chalk.cyan('Current Server'), chalk.white(configData.currentServer || 'default')],
      [chalk.cyan('Config Path'), chalk.gray(config.getConfigPath())]
    );
    
    console.log(table.toString());
    
    // Show server profiles
    const servers = config.listServers();
    if (Object.keys(servers).length > 0) {
      console.log(chalk.cyan('\n🌐 Server Profiles\n'));
      
      const serverTable = new Table({
        head: [
          chalk.cyan('Name'),
          chalk.cyan('URL'),
          chalk.cyan('Status'),
          chalk.cyan('Current')
        ],
        style: {
          head: [],
          border: ['grey']
        }
      });
      
      for (const [name, server] of Object.entries(servers)) {
        const isCurrent = configData.currentServer === name;
        serverTable.push([
          chalk.white(name),
          chalk.white(server.url),
          server.token ? chalk.green('● Configured') : chalk.yellow('● No token'),
          isCurrent ? chalk.green('✓') : chalk.gray('-')
        ]);
      }
      
      console.log(serverTable.toString());
    }
    
  } catch (error) {
    console.error(chalk.red('Failed to show configuration'));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

// 설정 업데이트
async function set(key, value) {
  if (!key) {
    console.error(chalk.red('Please specify a key to set'));
    process.exit(1);
  }
  
  try {
    const validKeys = ['server', 'token', 'defaultEnvironment', 'outputFormat'];
    
    if (!validKeys.includes(key)) {
      console.error(chalk.red(`Invalid key. Valid keys: ${validKeys.join(', ')}`));
      process.exit(1);
    }
    
    // Validate values
    if (key === 'server' && value && !value.match(/^https?:\/\/.+/)) {
      console.error(chalk.red('Server URL must be a valid URL'));
      process.exit(1);
    }
    
    if (key === 'defaultEnvironment' && value && !['production', 'staging', 'development'].includes(value)) {
      console.error(chalk.red('Environment must be one of: production, staging, development'));
      process.exit(1);
    }
    
    if (key === 'outputFormat' && value && !['table', 'json', 'yaml'].includes(value)) {
      console.error(chalk.red('Output format must be one of: table, json, yaml'));
      process.exit(1);
    }
    
    config.set(key, value);
    
    // Re-initialize API client if server or token changed
    if (key === 'server' || key === 'token') {
      api.init();
    }
    
    console.log(chalk.green(`✅ Set ${chalk.cyan(key)} = ${chalk.white(value || 'null')}`));
    
  } catch (error) {
    console.error(chalk.red(`Failed to set configuration`));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

// 설정 초기화
async function reset(options) {
  try {
    if (!options.force) {
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Are you sure you want to reset all configuration? This cannot be undone.',
          default: false
        }
      ]);
      
      if (!answer.confirm) {
        console.log(chalk.yellow('Reset cancelled'));
        return;
      }
    }
    
    config.clear();
    console.log(chalk.green('✅ Configuration reset successfully'));
    console.log(chalk.gray('Run "codeb config:init" to set up new configuration'));
    
  } catch (error) {
    console.error(chalk.red('Failed to reset configuration'));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

// 연결 테스트
async function test() {
  const spinner = ora('Testing server connection...').start();
  
  try {
    const startTime = Date.now();
    const response = await api.get('/system/ping');
    const responseTime = Date.now() - startTime;
    
    spinner.succeed(chalk.green('Connection successful!'));
    
    console.log(chalk.cyan('\n📊 Connection Details:'));
    console.log(chalk.white(`  Server: ${config.get('server')}`));
    console.log(chalk.white(`  Response time: ${responseTime}ms`));
    
    if (response.data) {
      console.log(chalk.white(`  Server version: ${response.data.version || 'Unknown'}`));
      console.log(chalk.white(`  Status: ${response.data.status || 'OK'}`));
    }
    
  } catch (error) {
    spinner.fail(chalk.red('Connection failed'));
    
    console.log(chalk.red('\n❌ Connection Details:'));
    console.log(chalk.white(`  Server: ${config.get('server')}`));
    console.log(chalk.red(`  Error: ${error.message}`));
    
    if (error.response) {
      console.log(chalk.red(`  Status: ${error.response.status}`));
      console.log(chalk.red(`  Response: ${error.response.data?.message || 'No message'}`));
    }
    
    console.log(chalk.gray('\n💡 Troubleshooting:'));
    console.log(chalk.gray('  1. Check if the server is running'));
    console.log(chalk.gray('  2. Verify the server URL is correct'));
    console.log(chalk.gray('  3. Check your network connection'));
    console.log(chalk.gray('  4. Verify your API token (if required)'));
    
    process.exit(1);
  }
}

// 서버 프로필 추가
async function addServer(name, url, token) {
  if (!name || !url) {
    console.error(chalk.red('Please specify server name and URL'));
    console.error(chalk.gray('Usage: codeb config:server:add <name> <url> [token]'));
    process.exit(1);
  }
  
  try {
    // Validate URL
    if (!url.match(/^https?:\/\/.+/)) {
      console.error(chalk.red('Please enter a valid URL'));
      process.exit(1);
    }
    
    config.addServer(name, url, token);
    console.log(chalk.green(`✅ Server profile "${name}" added successfully`));
    console.log(chalk.gray(`Use "codeb config:server:use ${name}" to switch to this server`));
    
  } catch (error) {
    console.error(chalk.red('Failed to add server profile'));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

// 서버 프로필 사용
async function useServer(name) {
  if (!name) {
    console.error(chalk.red('Please specify server name'));
    console.error(chalk.gray('Usage: codeb config:server:use <name>'));
    process.exit(1);
  }
  
  try {
    const success = config.useServer(name);
    
    if (!success) {
      console.error(chalk.red(`Server profile "${name}" not found`));
      console.log(chalk.gray('Use "codeb config show" to list available servers'));
      process.exit(1);
    }
    
    // Re-initialize API client
    api.init();
    
    console.log(chalk.green(`✅ Switched to server profile "${name}"`));
    
    // Test connection
    const spinner = ora('Testing connection...').start();
    try {
      await api.get('/system/ping');
      spinner.succeed(chalk.green('Connection successful!'));
    } catch (error) {
      spinner.warn(chalk.yellow('Warning: Could not connect to server'));
      console.log(chalk.gray('Server profile switched, but connection failed'));
    }
    
  } catch (error) {
    console.error(chalk.red('Failed to switch server profile'));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

// 서버 프로필 목록
async function listServers() {
  try {
    const servers = config.listServers();
    const currentServer = config.get('currentServer');
    
    if (Object.keys(servers).length === 0) {
      console.log(chalk.yellow('No server profiles found'));
      console.log(chalk.gray('Use "codeb config:server:add" to add a server profile'));
      return;
    }
    
    console.log(chalk.cyan('🌐 Server Profiles\n'));
    
    const table = new Table({
      head: [
        chalk.cyan('Name'),
        chalk.cyan('URL'),
        chalk.cyan('Token'),
        chalk.cyan('Current')
      ],
      style: {
        head: [],
        border: ['grey']
      }
    });
    
    for (const [name, server] of Object.entries(servers)) {
      const isCurrent = currentServer === name;
      table.push([
        isCurrent ? chalk.green.bold(name) : chalk.white(name),
        chalk.white(server.url),
        server.token ? chalk.green('✓') : chalk.gray('-'),
        isCurrent ? chalk.green('✓') : chalk.gray('-')
      ]);
    }
    
    console.log(table.toString());
    console.log(chalk.gray(`\nUse "codeb config:server:use <name>" to switch servers`));
    
  } catch (error) {
    console.error(chalk.red('Failed to list server profiles'));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

// 서버 프로필 제거
async function removeServer(name, options) {
  if (!name) {
    console.error(chalk.red('Please specify server name'));
    process.exit(1);
  }
  
  try {
    const servers = config.listServers();
    
    if (!servers[name]) {
      console.error(chalk.red(`Server profile "${name}" not found`));
      process.exit(1);
    }
    
    if (!options.force) {
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to remove server profile "${name}"?`,
          default: false
        }
      ]);
      
      if (!answer.confirm) {
        console.log(chalk.yellow('Removal cancelled'));
        return;
      }
    }
    
    delete servers[name];
    config.set('servers', servers);
    
    // If this was the current server, reset to default
    if (config.get('currentServer') === name) {
      config.delete('currentServer');
      console.log(chalk.yellow('⚠️  This was the current server. Switched back to default configuration.'));
    }
    
    console.log(chalk.green(`✅ Server profile "${name}" removed successfully`));
    
  } catch (error) {
    console.error(chalk.red('Failed to remove server profile'));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

module.exports = {
  init,
  show,
  set,
  reset,
  test,
  addServer,
  useServer,
  listServers,
  removeServer
};