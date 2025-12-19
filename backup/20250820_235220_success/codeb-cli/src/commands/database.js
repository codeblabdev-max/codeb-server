/**
 * Database Commands
 * 데이터베이스 관리 명령어 구현
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const ora = require('ora');
const inquirer = require('inquirer');
const api = require('../lib/api');
const config = require('../lib/config');
const { formatDate, formatBytes, formatStatus } = require('../utils/format');

// 데이터베이스 백업
async function backup(name, options) {
  const spinner = ora(`Creating backup for project ${name}...`).start();
  
  try {
    // Check if project exists and has database
    spinner.text = 'Checking project database...';
    const projectResponse = await api.get(`/projects/${name}`);
    const project = projectResponse.data;
    
    if (!project.database || project.database === 'none') {
      spinner.fail(chalk.red(`Project ${name} does not have a database`));
      process.exit(1);
    }
    
    // Create backup
    spinner.text = `Creating ${project.database} backup...`;
    const backupResponse = await api.post(`/projects/${name}/database/backup`, {
      name: options.name,
      compress: options.compress !== false,
      schema: options.schemaOnly,
      data: options.dataOnly,
      format: options.format || 'sql',
      tables: options.tables ? options.tables.split(',') : undefined
    });
    
    const backup = backupResponse.data;
    
    spinner.succeed(chalk.green(`Backup created successfully!`));
    
    console.log(chalk.cyan('\n💾 Backup Details:'));
    console.log(chalk.white(`  ID: ${backup.id}`));
    console.log(chalk.white(`  Name: ${backup.name || 'auto-generated'}`));
    console.log(chalk.white(`  Type: ${project.database}`));
    console.log(chalk.white(`  Size: ${formatBytes(backup.size)}`));
    console.log(chalk.white(`  Created: ${formatDate(backup.created_at)}`));
    console.log(chalk.white(`  Format: ${backup.format}`));
    console.log(chalk.white(`  Compressed: ${backup.compressed ? 'Yes' : 'No'}`));
    
    if (backup.tables?.length > 0) {
      console.log(chalk.white(`  Tables: ${backup.tables.join(', ')}`));
    }
    
    console.log(chalk.gray('\n💡 Next steps:'));
    console.log(chalk.gray(`  • List backups: codeb db:list ${name}`));
    console.log(chalk.gray(`  • Download: codeb db:download ${name} ${backup.id}`));
    console.log(chalk.gray(`  • Restore: codeb db:restore ${name} ${backup.id}`));
    
  } catch (error) {
    spinner.fail(chalk.red(`Failed to create backup for ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    
    if (error.response?.status === 404) {
      console.log(chalk.gray('\n💡 Make sure the project exists and has a database'));
    }
    
    process.exit(1);
  }
}

// 데이터베이스 복원
async function restore(name, backupId, options) {
  try {
    // Validate backup ID
    if (!backupId) {
      // Show available backups
      const backupsResponse = await api.get(`/projects/${name}/database/backups`);
      const backups = backupsResponse.data;
      
      if (backups.length === 0) {
        console.log(chalk.yellow(`No backups found for project ${name}`));
        console.log(chalk.gray('Create a backup first: codeb db:backup ' + name));
        return;
      }
      
      const choices = backups.map(backup => ({
        name: `${backup.name || backup.id} (${formatDate(backup.created_at)}) - ${formatBytes(backup.size)}`,
        value: backup.id
      }));
      
      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'backupId',
          message: 'Select backup to restore:',
          choices
        }
      ]);
      
      backupId = answer.backupId;
    }
    
    // Get backup details
    const backupResponse = await api.get(`/projects/${name}/database/backups/${backupId}`);
    const backup = backupResponse.data;
    
    // Confirmation
    if (!options.force) {
      console.log(chalk.yellow('\n⚠️  Database Restore Warning:'));
      console.log(chalk.white('  This will replace ALL current database data'));
      console.log(chalk.white('  This action cannot be undone'));
      console.log(chalk.white(`  Backup: ${backup.name || backup.id}`));
      console.log(chalk.white(`  Created: ${formatDate(backup.created_at)}`));
      console.log(chalk.white(`  Size: ${formatBytes(backup.size)}`));
      
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Are you sure you want to continue?',
          default: false
        }
      ]);
      
      if (!answer.confirm) {
        console.log(chalk.yellow('Restore cancelled'));
        return;
      }
      
      // Double confirmation for production
      const project = await api.get(`/projects/${name}`);
      if (project.data.environment === 'production') {
        const doubleConfirm = await inquirer.prompt([
          {
            type: 'input',
            name: 'confirm',
            message: `Type "${name}" to confirm restore in production:`,
            validate: (input) => input === name || 'Project name does not match'
          }
        ]);
      }
    }
    
    const spinner = ora(`Restoring database for ${name}...`).start();
    
    try {
      // Stop project if running
      if (!options.keepRunning) {
        spinner.text = 'Stopping project...';
        await api.post(`/projects/${name}/stop`);
      }
      
      // Create backup before restore (unless skipped)
      if (!options.skipBackup) {
        spinner.text = 'Creating pre-restore backup...';
        await api.post(`/projects/${name}/database/backup`, {
          name: `pre-restore-${Date.now()}`,
          compress: true
        });
      }
      
      // Restore database
      spinner.text = 'Restoring database...';
      const restoreResponse = await api.post(`/projects/${name}/database/restore`, {
        backupId,
        skipValidation: options.skipValidation,
        tables: options.tables ? options.tables.split(',') : undefined
      });
      
      // Start project if it was stopped
      if (!options.keepRunning) {
        spinner.text = 'Starting project...';
        await api.post(`/projects/${name}/start`);
      }
      
      spinner.succeed(chalk.green(`Database restored successfully!`));
      
      console.log(chalk.cyan('\n🔄 Restore Summary:'));
      console.log(chalk.white(`  Project: ${name}`));
      console.log(chalk.white(`  Backup: ${backup.name || backup.id}`));
      console.log(chalk.white(`  Restored: ${formatDate(new Date())}`));
      console.log(chalk.white(`  Duration: ${restoreResponse.data.duration || 'Unknown'}`));
      
      if (restoreResponse.data.warnings?.length > 0) {
        console.log(chalk.yellow('\n⚠️  Warnings:'));
        restoreResponse.data.warnings.forEach(warning => {
          console.log(chalk.yellow(`  • ${warning}`));
        });
      }
      
      console.log(chalk.gray('\n💡 Next steps:'));
      console.log(chalk.gray(`  • Check status: codeb status ${name}`));
      console.log(chalk.gray(`  • View logs: codeb logs ${name}`));
      console.log(chalk.gray(`  • Test application functionality`));
      
    } catch (error) {
      spinner.fail(chalk.red('Database restore failed'));
      throw error;
    }
    
  } catch (error) {
    console.error(chalk.red(`Failed to restore database for ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    
    console.log(chalk.gray('\n💡 Recovery options:'));
    console.log(chalk.gray(`  • Check project status: codeb status ${name}`));
    console.log(chalk.gray(`  • View recent backups: codeb db:list ${name}`));
    console.log(chalk.gray(`  • Try with --force or --skip-validation flags`));
    
    process.exit(1);
  }
}

// 데이터베이스 셸 접속
async function shell(name, options) {
  try {
    // Get project database info
    const projectResponse = await api.get(`/projects/${name}`);
    const project = projectResponse.data;
    
    if (!project.database || project.database === 'none') {
      console.error(chalk.red(`Project ${name} does not have a database`));
      process.exit(1);
    }
    
    console.log(chalk.cyan(`🔗 Connecting to ${project.database} shell for ${name}...\n`));
    
    // Get connection details
    const connectionResponse = await api.get(`/projects/${name}/database/connection`);
    const connection = connectionResponse.data;
    
    // Show connection info
    if (!options.quiet) {
      console.log(chalk.gray(`Host: ${connection.host}`));
      console.log(chalk.gray(`Port: ${connection.port}`));
      console.log(chalk.gray(`Database: ${connection.database}`));
      console.log(chalk.gray(`User: ${connection.username}`));
      console.log(chalk.gray(''));
    }
    
    // Execute shell command
    const shellResponse = await api.post(`/projects/${name}/database/shell`, {
      command: options.command,
      file: options.file,
      interactive: !options.command && !options.file
    });
    
    if (options.command || options.file) {
      // Command execution mode
      console.log(shellResponse.data.output);
      
      if (shellResponse.data.error) {
        console.error(chalk.red(shellResponse.data.error));
        process.exit(1);
      }
    } else {
      // Interactive mode
      console.log(chalk.yellow('Starting interactive database shell...'));
      console.log(chalk.gray('Type "exit" or "quit" to close the shell\n'));
      
      // Stream shell session
      const stream = await api.stream(`/projects/${name}/database/shell/interactive`);
      
      stream.on('data', (data) => {
        process.stdout.write(data);
      });
      
      stream.on('error', (error) => {
        console.error(chalk.red('\nShell error:', error.message));
        process.exit(1);
      });
      
      // Handle input
      process.stdin.setRawMode(true);
      process.stdin.on('data', (data) => {
        // Send input to server (implementation depends on streaming setup)
        // For now, show warning about interactive mode
        if (data.toString() === '\u0003') { // Ctrl+C
          console.log(chalk.yellow('\nShell session closed'));
          process.exit(0);
        }
      });
    }
    
  } catch (error) {
    console.error(chalk.red(`Failed to connect to database shell for ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    
    if (error.response?.status === 404) {
      console.log(chalk.gray('\n💡 Make sure the project exists and has a database'));
    } else if (error.response?.status === 503) {
      console.log(chalk.gray('\n💡 Database may be starting up. Try again in a few seconds.'));
    }
    
    process.exit(1);
  }
}

// 백업 목록 조회
async function list(name, options) {
  try {
    const response = await api.get(`/projects/${name}/database/backups`, {
      params: {
        limit: options.limit || 20
      }
    });
    
    const backups = response.data;
    
    if (options.json) {
      console.log(JSON.stringify(backups, null, 2));
      return;
    }
    
    if (backups.length === 0) {
      console.log(chalk.yellow(`No backups found for project ${name}`));
      console.log(chalk.gray('Create a backup: codeb db:backup ' + name));
      return;
    }
    
    console.log(chalk.cyan(`\n💾 Database Backups: ${name}\n`));
    
    const table = new Table({
      head: [
        chalk.cyan('ID'),
        chalk.cyan('Name'),
        chalk.cyan('Created'),
        chalk.cyan('Size'),
        chalk.cyan('Type'),
        chalk.cyan('Status')
      ],
      style: {
        head: [],
        border: ['grey']
      }
    });
    
    backups.forEach(backup => {
      table.push([
        backup.id.substring(0, 8) + '...',
        backup.name || 'auto',
        formatDate(backup.created_at),
        formatBytes(backup.size),
        backup.format || 'sql',
        formatStatus(backup.status || 'completed')
      ]);
    });
    
    console.log(table.toString());
    console.log(chalk.gray(`\nTotal: ${backups.length} backup(s)`));
    
    // Show storage usage
    const totalSize = backups.reduce((sum, backup) => sum + (backup.size || 0), 0);
    console.log(chalk.gray(`Storage used: ${formatBytes(totalSize)}`));
    
    console.log(chalk.gray('\n💡 Commands:'));
    console.log(chalk.gray('  • Restore: codeb db:restore ' + name + ' <backup-id>'));
    console.log(chalk.gray('  • Download: codeb db:download ' + name + ' <backup-id>'));
    console.log(chalk.gray('  • Delete: codeb db:delete ' + name + ' <backup-id>'));
    
  } catch (error) {
    console.error(chalk.red(`Failed to list backups for ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 백업 다운로드
async function download(name, backupId, options) {
  const spinner = ora(`Downloading backup ${backupId}...`).start();
  
  try {
    // Get backup info
    const backupResponse = await api.get(`/projects/${name}/database/backups/${backupId}`);
    const backup = backupResponse.data;
    
    // Download backup
    const downloadResponse = await api.get(`/projects/${name}/database/backups/${backupId}/download`, {
      responseType: 'stream'
    });
    
    const filename = options.output || `${name}-${backup.id}.${backup.format}`;
    const fs = require('fs');
    const writer = fs.createWriteStream(filename);
    
    downloadResponse.data.pipe(writer);
    
    writer.on('finish', () => {
      spinner.succeed(chalk.green(`Backup downloaded successfully!`));
      
      console.log(chalk.cyan('\n📁 Download Details:'));
      console.log(chalk.white(`  File: ${filename}`));
      console.log(chalk.white(`  Size: ${formatBytes(backup.size)}`));
      console.log(chalk.white(`  Format: ${backup.format}`));
      console.log(chalk.white(`  Created: ${formatDate(backup.created_at)}`));
    });
    
    writer.on('error', (error) => {
      spinner.fail(chalk.red('Download failed'));
      console.error(chalk.red(error.message));
      process.exit(1);
    });
    
  } catch (error) {
    spinner.fail(chalk.red(`Failed to download backup ${backupId}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 백업 삭제
async function deleteBackup(name, backupId, options) {
  try {
    // Get backup info
    const backupResponse = await api.get(`/projects/${name}/database/backups/${backupId}`);
    const backup = backupResponse.data;
    
    if (!options.force) {
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Delete backup "${backup.name || backup.id}" (${formatBytes(backup.size)})?`,
          default: false
        }
      ]);
      
      if (!answer.confirm) {
        console.log(chalk.yellow('Deletion cancelled'));
        return;
      }
    }
    
    const spinner = ora(`Deleting backup ${backupId}...`).start();
    
    await api.delete(`/projects/${name}/database/backups/${backupId}`);
    
    spinner.succeed(chalk.green('Backup deleted successfully'));
    
    console.log(chalk.cyan('\n🗑️  Deleted Backup:'));
    console.log(chalk.white(`  ID: ${backup.id}`));
    console.log(chalk.white(`  Name: ${backup.name || 'auto'}`));
    console.log(chalk.white(`  Size: ${formatBytes(backup.size)}`));
    console.log(chalk.white(`  Freed: ${formatBytes(backup.size)} disk space`));
    
  } catch (error) {
    console.error(chalk.red(`Failed to delete backup ${backupId}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 데이터베이스 상태
async function status(name, options) {
  try {
    const response = await api.get(`/projects/${name}/database/status`);
    const status = response.data;
    
    if (options.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    
    console.log(chalk.cyan(`\n🗄️  Database Status: ${name}\n`));
    
    console.log(chalk.white(`Type: ${chalk.green(status.type || 'Unknown')}`));
    console.log(chalk.white(`Status: ${formatStatus(status.status || 'unknown')}`));
    console.log(chalk.white(`Version: ${status.version || 'Unknown'}`));
    console.log(chalk.white(`Host: ${status.host || 'localhost'}`));
    console.log(chalk.white(`Port: ${status.port || 'Unknown'}`));
    console.log(chalk.white(`Database: ${status.database || 'Unknown'}`));
    
    if (status.connections !== undefined) {
      console.log(chalk.white(`Connections: ${status.connections.active}/${status.connections.max}`));
    }
    
    if (status.size) {
      console.log(chalk.white(`Size: ${formatBytes(status.size)}`));
    }
    
    if (status.uptime) {
      console.log(chalk.white(`Uptime: ${status.uptime}`));
    }
    
    // Show table information
    if (status.tables?.length > 0) {
      console.log(chalk.cyan('\n📋 Tables:'));
      const tableTable = new Table({
        head: [
          chalk.cyan('Name'),
          chalk.cyan('Rows'),
          chalk.cyan('Size'),
          chalk.cyan('Engine')
        ],
        style: {
          head: [],
          border: ['grey']
        }
      });
      
      status.tables.forEach(table => {
        tableTable.push([
          table.name,
          table.rows ? table.rows.toLocaleString() : '-',
          table.size ? formatBytes(table.size) : '-',
          table.engine || '-'
        ]);
      });
      
      console.log(tableTable.toString());
    }
    
    // Show recent backups
    if (status.backups?.length > 0) {
      console.log(chalk.cyan(`\n💾 Recent Backups (${status.backups.length}):`));
      status.backups.forEach(backup => {
        console.log(chalk.white(`  • ${backup.name || backup.id} - ${formatDate(backup.created_at)} (${formatBytes(backup.size)})`));
      });
    }
    
  } catch (error) {
    console.error(chalk.red(`Failed to get database status for ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

module.exports = {
  backup,
  restore,
  shell,
  list,
  download,
  delete: deleteBackup,
  status
};