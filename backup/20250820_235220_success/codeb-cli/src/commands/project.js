/**
 * Project Commands
 * 프로젝트 관리 관련 명령어 구현
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const ora = require('ora');
const inquirer = require('inquirer');
const api = require('../lib/api');
const config = require('../lib/config');
const { formatDate, formatBytes, formatStatus } = require('../utils/format');

// 프로젝트 목록 조회
async function list(options) {
  const spinner = ora('Loading projects...').start();
  
  try {
    const response = await api.get('/projects', {
      params: { all: options.all }
    });
    
    spinner.stop();
    
    if (options.json) {
      console.log(JSON.stringify(response.data, null, 2));
      return;
    }
    
    const projects = response.data;
    
    if (projects.length === 0) {
      console.log(chalk.yellow('No projects found. Create one with "codeb create <name>"'));
      return;
    }
    
    // Table display
    const table = new Table({
      head: [
        chalk.cyan('Name'),
        chalk.cyan('Status'),
        chalk.cyan('Domain'),
        chalk.cyan('Port'),
        chalk.cyan('Created'),
        chalk.cyan('Size')
      ],
      style: {
        head: [],
        border: ['grey']
      }
    });
    
    projects.forEach(project => {
      table.push([
        chalk.white(project.name),
        formatStatus(project.status),
        project.domain || '-',
        project.port || '-',
        formatDate(project.created_at),
        formatBytes(project.size || 0)
      ]);
    });
    
    console.log(table.toString());
    console.log(chalk.gray(`\nTotal: ${projects.length} project(s)`));
    
  } catch (error) {
    spinner.fail(chalk.red('Failed to list projects'));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 프로젝트 생성
async function create(name, options) {
  const spinner = ora(`Creating project ${name}...`).start();
  
  try {
    // Validate name
    if (!/^[a-z0-9-]+$/.test(name)) {
      throw new Error('Project name must contain only lowercase letters, numbers, and hyphens');
    }
    
    const projectData = {
      name,
      git: options.git,
      domain: options.domain,
      template: options.template || 'node',
      database: options.db,
      cache: options.cache,
      ssl: options.ssl
    };
    
    spinner.text = 'Setting up project structure...';
    const response = await api.post('/projects', projectData);
    
    spinner.text = 'Creating containers...';
    await api.post(`/projects/${name}/containers`);
    
    if (options.db !== 'none') {
      spinner.text = 'Setting up database...';
      await api.post(`/projects/${name}/database`);
    }
    
    if (options.cache) {
      spinner.text = 'Setting up Redis cache...';
      await api.post(`/projects/${name}/cache`);
    }
    
    if (options.domain) {
      spinner.text = 'Configuring domain and SSL...';
      await api.post(`/projects/${name}/domain`, {
        domain: options.domain,
        ssl: options.ssl
      });
    }
    
    if (options.git) {
      spinner.text = 'Cloning repository...';
      await api.post(`/projects/${name}/git/clone`, {
        url: options.git
      });
    }
    
    spinner.succeed(chalk.green(`Project ${name} created successfully!`));
    
    // Show access information
    console.log(chalk.cyan('\n📋 Project Information:'));
    console.log(chalk.white(`  Name: ${name}`));
    console.log(chalk.white(`  Status: ${formatStatus('running')}`));
    
    if (options.domain) {
      console.log(chalk.white(`  URL: ${options.ssl ? 'https' : 'http'}://${options.domain}`));
    } else {
      console.log(chalk.white(`  Local URL: http://localhost:${response.data.port}`));
    }
    
    if (options.db !== 'none') {
      console.log(chalk.white(`  Database: ${options.db}://localhost:${response.data.db_port}`));
    }
    
    if (options.cache) {
      console.log(chalk.white(`  Redis: redis://localhost:${response.data.redis_port}`));
    }
    
    console.log(chalk.gray('\n💡 Next steps:'));
    console.log(chalk.gray(`  1. View status: codeb status ${name}`));
    console.log(chalk.gray(`  2. View logs: codeb logs ${name}`));
    console.log(chalk.gray(`  3. Deploy: codeb deploy ${name}`));
    
  } catch (error) {
    spinner.fail(chalk.red(`Failed to create project ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 프로젝트 삭제
async function deleteProject(name, options) {
  try {
    if (!options.force) {
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to delete project "${name}"? This action cannot be undone.`,
          default: false
        }
      ]);
      
      if (!answer.confirm) {
        console.log(chalk.yellow('Deletion cancelled'));
        return;
      }
    }
    
    const spinner = ora(`Deleting project ${name}...`).start();
    
    if (!options.keepData) {
      spinner.text = 'Creating backup...';
      await api.post(`/projects/${name}/backup`);
    }
    
    spinner.text = 'Stopping containers...';
    await api.post(`/projects/${name}/stop`);
    
    spinner.text = 'Removing containers...';
    await api.delete(`/projects/${name}/containers`);
    
    if (!options.keepData) {
      spinner.text = 'Removing data...';
      await api.delete(`/projects/${name}/data`);
    }
    
    spinner.text = 'Removing project...';
    await api.delete(`/projects/${name}`);
    
    spinner.succeed(chalk.green(`Project ${name} deleted successfully`));
    
    if (options.keepData) {
      console.log(chalk.yellow('\n⚠️  Project data was preserved at:'));
      console.log(chalk.gray(`  /mnt/blockstorage/projects/${name}/`));
    }
    
  } catch (error) {
    console.error(chalk.red(`Failed to delete project ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 프로젝트 복제
async function clone(source, target, options) {
  const spinner = ora(`Cloning ${source} to ${target}...`).start();
  
  try {
    spinner.text = 'Checking source project...';
    await api.get(`/projects/${source}`);
    
    spinner.text = 'Creating target project...';
    const cloneData = {
      source,
      target,
      skipData: options.skipData,
      newDomain: options.newDomain
    };
    
    await api.post('/projects/clone', cloneData);
    
    if (!options.skipData) {
      spinner.text = 'Copying database...';
      await api.post(`/projects/${target}/database/copy`, { source });
      
      spinner.text = 'Copying files...';
      await api.post(`/projects/${target}/files/copy`, { source });
    }
    
    spinner.text = 'Starting new project...';
    await api.post(`/projects/${target}/start`);
    
    spinner.succeed(chalk.green(`Project cloned successfully!`));
    
    console.log(chalk.cyan('\n📋 Cloned Project:'));
    console.log(chalk.white(`  Source: ${source}`));
    console.log(chalk.white(`  Target: ${target}`));
    
    if (options.newDomain) {
      console.log(chalk.white(`  Domain: ${options.newDomain}`));
    }
    
  } catch (error) {
    spinner.fail(chalk.red(`Failed to clone project`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 프로젝트 상태 조회
async function status(name, options) {
  try {
    let projects = [];
    
    if (name) {
      const response = await api.get(`/projects/${name}/status`);
      projects = [response.data];
    } else {
      const response = await api.get('/projects/status');
      projects = response.data;
    }
    
    if (options.detailed) {
      // Detailed view
      for (const project of projects) {
        console.log(chalk.cyan(`\n━━━ Project: ${project.name} ━━━`));
        console.log(chalk.white(`  Status: ${formatStatus(project.status)}`));
        console.log(chalk.white(`  Created: ${formatDate(project.created_at)}`));
        console.log(chalk.white(`  Domain: ${project.domain || 'N/A'}`));
        console.log(chalk.white(`  Git: ${project.git_repository || 'N/A'}`));
        
        console.log(chalk.cyan('\n  Containers:'));
        project.containers?.forEach(container => {
          console.log(chalk.white(`    • ${container.name}: ${formatStatus(container.status)}`));
          console.log(chalk.gray(`      CPU: ${container.cpu}% | Memory: ${formatBytes(container.memory)}`));
        });
        
        console.log(chalk.cyan('\n  Resources:'));
        console.log(chalk.white(`    Disk: ${formatBytes(project.disk_usage)}`));
        console.log(chalk.white(`    Network I/O: ↑${formatBytes(project.network_tx)} ↓${formatBytes(project.network_rx)}`));
      }
    } else {
      // Simple table view
      const table = new Table({
        head: [
          chalk.cyan('Project'),
          chalk.cyan('Status'),
          chalk.cyan('Containers'),
          chalk.cyan('CPU'),
          chalk.cyan('Memory'),
          chalk.cyan('Uptime')
        ]
      });
      
      projects.forEach(project => {
        table.push([
          project.name,
          formatStatus(project.status),
          `${project.containers_running}/${project.containers_total}`,
          `${project.cpu_usage}%`,
          formatBytes(project.memory_usage),
          project.uptime || '-'
        ]);
      });
      
      console.log(table.toString());
    }
    
    // Watch mode
    if (options.watch) {
      setInterval(async () => {
        console.clear();
        await status(name, { ...options, watch: false });
      }, 2000);
    }
    
  } catch (error) {
    console.error(chalk.red('Failed to get project status'));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 프로젝트 시작
async function start(name) {
  const spinner = ora(`Starting project ${name}...`).start();
  
  try {
    await api.post(`/projects/${name}/start`);
    spinner.succeed(chalk.green(`Project ${name} started successfully`));
  } catch (error) {
    spinner.fail(chalk.red(`Failed to start project ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 프로젝트 중지
async function stop(name, options) {
  const spinner = ora(`Stopping project ${name}...`).start();
  
  try {
    await api.post(`/projects/${name}/stop`, {
      graceful: options.graceful
    });
    spinner.succeed(chalk.green(`Project ${name} stopped successfully`));
  } catch (error) {
    spinner.fail(chalk.red(`Failed to stop project ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 프로젝트 재시작
async function restart(name, options) {
  const spinner = ora(`Restarting project ${name}...`).start();
  
  try {
    await api.post(`/projects/${name}/restart`, {
      hard: options.hard
    });
    spinner.succeed(chalk.green(`Project ${name} restarted successfully`));
  } catch (error) {
    spinner.fail(chalk.red(`Failed to restart project ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 프로젝트 로그 조회
async function logs(name, options) {
  try {
    const params = {
      follow: options.follow,
      tail: options.tail,
      container: options.container
    };
    
    if (options.follow) {
      // Stream logs
      const stream = await api.stream(`/projects/${name}/logs`, params);
      stream.on('data', (data) => {
        process.stdout.write(data);
      });
    } else {
      // Get logs
      const response = await api.get(`/projects/${name}/logs`, { params });
      console.log(response.data);
    }
  } catch (error) {
    console.error(chalk.red(`Failed to get logs for project ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// Execute command in container
async function exec(name, command, options) {
  try {
    const response = await api.post(`/projects/${name}/exec`, {
      container: options.container,
      command: command.join(' ')
    });
    
    console.log(response.data.output);
  } catch (error) {
    console.error(chalk.red(`Failed to execute command`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// System info
async function info() {
  try {
    const response = await api.get('/system/info');
    const info = response.data;
    
    console.log(chalk.cyan('\n━━━ CodeB System Information ━━━'));
    console.log(chalk.white(`  Server: ${info.server_url}`));
    console.log(chalk.white(`  Version: ${info.version}`));
    console.log(chalk.white(`  Podman: ${info.podman_version}`));
    console.log(chalk.white(`  Projects: ${info.projects_count}`));
    console.log(chalk.white(`  Storage: ${formatBytes(info.storage_used)} / ${formatBytes(info.storage_total)}`));
    console.log(chalk.white(`  Memory: ${formatBytes(info.memory_used)} / ${formatBytes(info.memory_total)}`));
    console.log(chalk.white(`  CPU: ${info.cpu_usage}%`));
    
    return info;
  } catch (error) {
    console.error(chalk.red('Failed to get system info'));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

module.exports = {
  list,
  create,
  delete: deleteProject,
  clone,
  status,
  start,
  stop,
  restart,
  logs,
  exec,
  info
};