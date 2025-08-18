/**
 * Deploy Commands
 * 배포 관련 명령어 구현
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const ora = require('ora');
const inquirer = require('inquirer');
const api = require('../lib/api');
const config = require('../lib/config');
const { formatDate, formatDuration, formatStatus } = require('../utils/format');

// 프로젝트 배포
async function deploy(name, options) {
  const spinner = ora(`Deploying project ${name}...`).start();
  
  try {
    // Pre-deployment checks
    spinner.text = 'Running pre-deployment checks...';
    const checkResponse = await api.get(`/projects/${name}/deploy/check`);
    
    if (!checkResponse.data.ready) {
      spinner.fail(chalk.red('Pre-deployment checks failed'));
      
      console.log(chalk.red('\n❌ Deployment Issues:'));
      checkResponse.data.issues?.forEach(issue => {
        console.log(chalk.red(`  • ${issue}`));
      });
      
      if (!options.force) {
        console.log(chalk.yellow('\n💡 Fix the issues above or use --force to deploy anyway'));
        process.exit(1);
      } else {
        console.log(chalk.yellow('\n⚠️  Continuing with deployment despite issues (--force)'));
      }
    }
    
    // Build process
    if (!options.skipBuild) {
      spinner.text = 'Building application...';
      await api.post(`/projects/${name}/build`, {
        environment: options.env || config.get('defaultEnvironment'),
        cache: !options.noCache
      });
    }
    
    // Database migrations
    if (!options.skipMigrations) {
      spinner.text = 'Running database migrations...';
      try {
        await api.post(`/projects/${name}/migrations`);
      } catch (error) {
        if (!options.force) {
          spinner.fail(chalk.red('Database migrations failed'));
          console.error(chalk.red(error.response?.data?.message || error.message));
          process.exit(1);
        } else {
          console.log(chalk.yellow('\n⚠️  Database migrations failed but continuing (--force)'));
        }
      }
    }
    
    // Create deployment
    spinner.text = 'Creating deployment...';
    const deployResponse = await api.post(`/projects/${name}/deploy`, {
      environment: options.env || config.get('defaultEnvironment'),
      strategy: options.strategy || 'rolling',
      timeout: options.timeout || 300,
      rollback: options.autoRollback !== false,
      healthCheck: !options.skipHealthCheck,
      notifications: options.notifications !== false
    });
    
    const deploymentId = deployResponse.data.id;
    
    // Monitor deployment progress
    spinner.text = 'Monitoring deployment progress...';
    
    let lastStatus = null;
    const checkDeployment = async () => {
      try {
        const statusResponse = await api.get(`/projects/${name}/deploy/${deploymentId}`);
        const status = statusResponse.data;
        
        if (status.status !== lastStatus) {
          spinner.text = `${status.stage || 'Deploying'}: ${status.message || 'In progress'}`;
          lastStatus = status.status;
        }
        
        if (status.status === 'completed') {
          spinner.succeed(chalk.green(`Project ${name} deployed successfully!`));
          
          console.log(chalk.cyan('\n🚀 Deployment Summary:'));
          console.log(chalk.white(`  Deployment ID: ${deploymentId}`));
          console.log(chalk.white(`  Environment: ${status.environment}`));
          console.log(chalk.white(`  Strategy: ${status.strategy}`));
          console.log(chalk.white(`  Duration: ${formatDuration(status.duration)}`));
          console.log(chalk.white(`  Version: ${status.version || 'latest'}`));
          
          if (status.url) {
            console.log(chalk.white(`  URL: ${chalk.underline(status.url)}`));
          }
          
          if (status.changes?.length > 0) {
            console.log(chalk.cyan('\n📝 Changes deployed:'));
            status.changes.forEach(change => {
              console.log(chalk.white(`  • ${change}`));
            });
          }
          
          console.log(chalk.gray('\n💡 Next steps:'));
          console.log(chalk.gray(`  • Monitor: codeb deploy:status ${name}`));
          console.log(chalk.gray(`  • Rollback: codeb deploy:rollback ${name}`));
          console.log(chalk.gray(`  • Logs: codeb logs ${name}`));
          
          return;
          
        } else if (status.status === 'failed') {
          spinner.fail(chalk.red(`Deployment failed: ${status.error || 'Unknown error'}`));
          
          console.log(chalk.red('\n❌ Deployment Failed:'));
          console.log(chalk.white(`  Stage: ${status.stage || 'Unknown'}`));
          console.log(chalk.white(`  Error: ${status.error || 'No details available'}`));
          
          if (status.logs?.length > 0) {
            console.log(chalk.cyan('\n📋 Error logs:'));
            status.logs.forEach(log => {
              console.log(chalk.gray(`  ${log}`));
            });
          }
          
          if (options.autoRollback !== false && status.canRollback) {
            console.log(chalk.yellow('\n🔄 Auto-rollback initiated...'));
            await rollback(name, { auto: true });
          } else {
            console.log(chalk.gray('\n💡 To rollback: codeb deploy:rollback ' + name));
          }
          
          process.exit(1);
          
        } else if (status.status === 'cancelled') {
          spinner.fail(chalk.yellow('Deployment was cancelled'));
          process.exit(1);
        }
        
        // Continue monitoring
        setTimeout(checkDeployment, 2000);
        
      } catch (error) {
        spinner.fail(chalk.red('Failed to check deployment status'));
        console.error(chalk.red(error.response?.data?.message || error.message));
        process.exit(1);
      }
    };
    
    // Start monitoring
    setTimeout(checkDeployment, 1000);
    
  } catch (error) {
    spinner.fail(chalk.red(`Failed to deploy project ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    
    // Suggest troubleshooting steps
    console.log(chalk.gray('\n💡 Troubleshooting:'));
    console.log(chalk.gray('  • Check logs: codeb logs ' + name));
    console.log(chalk.gray('  • Check status: codeb status ' + name));
    console.log(chalk.gray('  • Try with --force to skip validation'));
    console.log(chalk.gray('  • View deployment history: codeb deploy:history ' + name));
    
    process.exit(1);
  }
}

// 배포 롤백
async function rollback(name, options) {
  try {
    let version = options.version;
    
    // If no version specified, show recent deployments
    if (!version && !options.auto) {
      const historyResponse = await api.get(`/projects/${name}/deploy/history`, {
        params: { limit: 5 }
      });
      
      const deployments = historyResponse.data.filter(d => d.status === 'completed');
      
      if (deployments.length === 0) {
        console.log(chalk.yellow('No successful deployments found to rollback to'));
        return;
      }
      
      const choices = deployments.map(d => ({
        name: `${d.version} (${formatDate(d.created_at)}) - ${d.description || 'No description'}`,
        value: d.version
      }));
      
      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'version',
          message: 'Select version to rollback to:',
          choices
        }
      ]);
      
      version = answer.version;
    }
    
    // Confirmation
    if (!options.force && !options.auto) {
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to rollback "${name}" to version ${version || 'previous'}?`,
          default: false
        }
      ]);
      
      if (!answer.confirm) {
        console.log(chalk.yellow('Rollback cancelled'));
        return;
      }
    }
    
    const spinner = ora(`Rolling back project ${name}...`).start();
    
    try {
      const rollbackResponse = await api.post(`/projects/${name}/rollback`, {
        version,
        reason: options.reason || (options.auto ? 'Auto-rollback after deployment failure' : 'Manual rollback'),
        skipHealthCheck: options.skipHealthCheck
      });
      
      const rollbackId = rollbackResponse.data.id;
      
      // Monitor rollback progress
      let lastStatus = null;
      const checkRollback = async () => {
        try {
          const statusResponse = await api.get(`/projects/${name}/rollback/${rollbackId}`);
          const status = statusResponse.data;
          
          if (status.status !== lastStatus) {
            spinner.text = `Rolling back: ${status.message || 'In progress'}`;
            lastStatus = status.status;
          }
          
          if (status.status === 'completed') {
            spinner.succeed(chalk.green(`Rollback completed successfully!`));
            
            console.log(chalk.cyan('\n🔄 Rollback Summary:'));
            console.log(chalk.white(`  Rolled back to: ${status.version}`));
            console.log(chalk.white(`  Duration: ${formatDuration(status.duration)}`));
            console.log(chalk.white(`  Reason: ${status.reason || 'Not specified'}`));
            
            return;
            
          } else if (status.status === 'failed') {
            spinner.fail(chalk.red(`Rollback failed: ${status.error || 'Unknown error'}`));
            console.log(chalk.red('\n❌ Rollback failed. Manual intervention may be required.'));
            process.exit(1);
          }
          
          // Continue monitoring
          setTimeout(checkRollback, 2000);
          
        } catch (error) {
          spinner.fail(chalk.red('Failed to check rollback status'));
          console.error(chalk.red(error.response?.data?.message || error.message));
          process.exit(1);
        }
      };
      
      // Start monitoring
      setTimeout(checkRollback, 1000);
      
    } catch (error) {
      spinner.fail(chalk.red('Failed to initiate rollback'));
      throw error;
    }
    
  } catch (error) {
    console.error(chalk.red(`Failed to rollback project ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 배포 상태 확인
async function status(name, options) {
  try {
    const response = await api.get(`/projects/${name}/deploy/status`);
    const status = response.data;
    
    if (options.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    
    console.log(chalk.cyan(`\n🚀 Deployment Status: ${name}\n`));
    
    console.log(chalk.white(`Current Version: ${chalk.green(status.currentVersion || 'Not deployed')}`));
    console.log(chalk.white(`Environment: ${status.environment || 'unknown'}`));
    console.log(chalk.white(`Status: ${formatStatus(status.status || 'unknown')}`));
    console.log(chalk.white(`Last Deploy: ${formatDate(status.lastDeploy)}`));
    console.log(chalk.white(`Uptime: ${status.uptime || 'N/A'}`));
    
    if (status.url) {
      console.log(chalk.white(`URL: ${chalk.underline(status.url)}`));
    }
    
    // Current deployment info
    if (status.currentDeployment) {
      const deploy = status.currentDeployment;
      console.log(chalk.cyan('\n📋 Current Deployment:'));
      console.log(chalk.white(`  ID: ${deploy.id}`));
      console.log(chalk.white(`  Strategy: ${deploy.strategy}`));
      console.log(chalk.white(`  Duration: ${formatDuration(deploy.duration)}`));
      console.log(chalk.white(`  Deployer: ${deploy.deployer || 'System'}`));
      
      if (deploy.changes?.length > 0) {
        console.log(chalk.white(`  Changes: ${deploy.changes.length} modification(s)`));
      }
    }
    
    // Health checks
    if (status.healthChecks?.length > 0) {
      console.log(chalk.cyan('\n🏥 Health Checks:'));
      status.healthChecks.forEach(check => {
        const statusIcon = check.status === 'healthy' ? '✅' : 
                          check.status === 'unhealthy' ? '❌' : '⏳';
        console.log(chalk.white(`  ${statusIcon} ${check.name}: ${check.status}`));
        if (check.message) {
          console.log(chalk.gray(`     ${check.message}`));
        }
      });
    }
    
  } catch (error) {
    console.error(chalk.red(`Failed to get deployment status for ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 배포 히스토리
async function history(name, options) {
  try {
    const response = await api.get(`/projects/${name}/deploy/history`, {
      params: {
        limit: options.limit || 10,
        environment: options.env
      }
    });
    
    const deployments = response.data;
    
    if (options.json) {
      console.log(JSON.stringify(deployments, null, 2));
      return;
    }
    
    if (deployments.length === 0) {
      console.log(chalk.yellow(`No deployment history found for ${name}`));
      return;
    }
    
    console.log(chalk.cyan(`\n📜 Deployment History: ${name}\n`));
    
    const table = new Table({
      head: [
        chalk.cyan('Version'),
        chalk.cyan('Status'),
        chalk.cyan('Environment'),
        chalk.cyan('Date'),
        chalk.cyan('Duration'),
        chalk.cyan('Deployer')
      ],
      style: {
        head: [],
        border: ['grey']
      }
    });
    
    deployments.forEach(deploy => {
      table.push([
        deploy.current ? chalk.green.bold(deploy.version) : chalk.white(deploy.version),
        formatStatus(deploy.status),
        deploy.environment || 'unknown',
        formatDate(deploy.created_at),
        deploy.duration ? formatDuration(deploy.duration) : '-',
        deploy.deployer || 'System'
      ]);
    });
    
    console.log(table.toString());
    console.log(chalk.gray(`\nShowing ${deployments.length} deployment(s)`));
    
    // Show current deployment
    const current = deployments.find(d => d.current);
    if (current) {
      console.log(chalk.cyan(`\nCurrent: ${chalk.green(current.version)} (${formatDate(current.created_at)})`));
    }
    
  } catch (error) {
    console.error(chalk.red(`Failed to get deployment history for ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 배포 취소
async function cancel(name, options) {
  try {
    // Get current deployment
    const statusResponse = await api.get(`/projects/${name}/deploy/status`);
    const currentDeploy = statusResponse.data.currentDeployment;
    
    if (!currentDeploy || currentDeploy.status === 'completed') {
      console.log(chalk.yellow(`No active deployment found for ${name}`));
      return;
    }
    
    if (!options.force) {
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to cancel the current deployment of "${name}"?`,
          default: false
        }
      ]);
      
      if (!answer.confirm) {
        console.log(chalk.yellow('Cancellation aborted'));
        return;
      }
    }
    
    const spinner = ora(`Cancelling deployment of ${name}...`).start();
    
    await api.post(`/projects/${name}/deploy/${currentDeploy.id}/cancel`, {
      reason: options.reason || 'Manual cancellation'
    });
    
    spinner.succeed(chalk.green('Deployment cancelled successfully'));
    
    console.log(chalk.cyan('\n🚫 Deployment Cancelled:'));
    console.log(chalk.white(`  Project: ${name}`));
    console.log(chalk.white(`  Deployment ID: ${currentDeploy.id}`));
    console.log(chalk.white(`  Reason: ${options.reason || 'Manual cancellation'}`));
    
  } catch (error) {
    console.error(chalk.red(`Failed to cancel deployment for ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 배포 로그
async function logs(name, deploymentId, options) {
  try {
    const params = {
      follow: options.follow,
      tail: options.tail || 100
    };
    
    if (options.follow) {
      // Stream deployment logs
      console.log(chalk.cyan(`📡 Streaming deployment logs for ${name}...\n`));
      
      const stream = await api.stream(`/projects/${name}/deploy/${deploymentId}/logs`, params);
      
      stream.on('data', (data) => {
        process.stdout.write(data);
      });
      
      stream.on('error', (error) => {
        console.error(chalk.red('\nStream error:', error.message));
        process.exit(1);
      });
      
      // Handle Ctrl+C
      process.on('SIGINT', () => {
        stream.close();
        console.log(chalk.yellow('\nStream closed'));
        process.exit(0);
      });
      
    } else {
      // Get deployment logs
      const response = await api.get(`/projects/${name}/deploy/${deploymentId}/logs`, { params });
      console.log(response.data);
    }
    
  } catch (error) {
    console.error(chalk.red(`Failed to get deployment logs for ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

module.exports = {
  deploy,
  rollback,
  status,
  history,
  cancel,
  logs
};