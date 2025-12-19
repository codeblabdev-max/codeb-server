/**
 * Environment Commands
 * 환경변수 관리 명령어 구현
 */

const chalk = require('chalk');
const Table = require('cli-table3');
const ora = require('ora');
const inquirer = require('inquirer');
const api = require('../lib/api');
const config = require('../lib/config');
const { formatDate } = require('../utils/format');

// 환경변수 목록 조회
async function list(name, options) {
  try {
    const response = await api.get(`/projects/${name}/env`, {
      params: {
        environment: options.env || config.get('defaultEnvironment'),
        includeSystem: options.system,
        masked: !options.show
      }
    });
    
    const variables = response.data;
    
    if (options.json) {
      console.log(JSON.stringify(variables, null, 2));
      return;
    }
    
    if (variables.length === 0) {
      console.log(chalk.yellow(`No environment variables found for ${name}`));
      console.log(chalk.gray('Add variables: codeb env:set ' + name + ' KEY=value'));
      return;
    }
    
    const environment = options.env || config.get('defaultEnvironment');
    console.log(chalk.cyan(`\n🔧 Environment Variables: ${name} (${environment})\n`));
    
    const table = new Table({
      head: [
        chalk.cyan('Key'),
        chalk.cyan('Value'),
        chalk.cyan('Type'),
        chalk.cyan('Updated')
      ],
      style: {
        head: [],
        border: ['grey']
      },
      colWidths: [30, 50, 15, 20]
    });
    
    variables.forEach(env => {
      const value = options.show ? env.value : maskValue(env.value, env.type);
      const typeColor = getTypeColor(env.type);
      
      table.push([
        chalk.white(env.key),
        chalk.white(value),
        typeColor(env.type || 'custom'),
        formatDate(env.updated_at)
      ]);
    });
    
    console.log(table.toString());
    console.log(chalk.gray(`\nTotal: ${variables.length} variable(s)`));
    
    // Show usage info
    if (!options.show) {
      console.log(chalk.gray('Use --show to reveal values'));
    }
    
    // Show environment info
    const systemVars = variables.filter(v => v.type === 'system').length;
    const customVars = variables.filter(v => v.type === 'custom').length;
    
    if (systemVars > 0 || customVars > 0) {
      console.log(chalk.cyan('\n📊 Summary:'));
      if (customVars > 0) console.log(chalk.white(`  Custom variables: ${customVars}`));
      if (systemVars > 0) console.log(chalk.white(`  System variables: ${systemVars}`));
    }
    
  } catch (error) {
    console.error(chalk.red(`Failed to list environment variables for ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 환경변수 설정
async function set(name, pairs, options) {
  if (!pairs || pairs.length === 0) {
    console.error(chalk.red('Please specify environment variables'));
    console.error(chalk.gray('Usage: codeb env:set <project> KEY=value [KEY2=value2...]'));
    process.exit(1);
  }
  
  try {
    // Parse key=value pairs
    const variables = {};
    const invalidPairs = [];
    
    pairs.forEach(pair => {
      const equalIndex = pair.indexOf('=');
      if (equalIndex === -1) {
        invalidPairs.push(pair);
        return;
      }
      
      const key = pair.substring(0, equalIndex);
      const value = pair.substring(equalIndex + 1);
      
      if (!key) {
        invalidPairs.push(pair);
        return;
      }
      
      variables[key] = value;
    });
    
    if (invalidPairs.length > 0) {
      console.error(chalk.red(`Invalid format: ${invalidPairs.join(', ')}`));
      console.error(chalk.gray('Use KEY=value format'));
      process.exit(1);
    }
    
    const variableCount = Object.keys(variables).length;
    const environment = options.env || config.get('defaultEnvironment');
    const spinner = ora(`Setting ${variableCount} variable(s) for ${name}...`).start();
    
    try {
      const response = await api.post(`/projects/${name}/env`, {
        variables,
        environment,
        restart: options.restart !== false,
        description: options.description
      });
      
      spinner.succeed(chalk.green(`Successfully set ${variableCount} environment variable(s)!`));
      
      console.log(chalk.cyan(`\n🔧 Updated Variables (${environment}):`));
      
      Object.entries(variables).forEach(([key, value]) => {
        const maskedValue = maskValue(value);
        console.log(chalk.white(`  ${key} = ${maskedValue}`));
      });
      
      // Show restart info
      if (options.restart !== false && response.data.restarted) {
        console.log(chalk.cyan('\n🔄 Project restarted to apply changes'));
      } else if (options.restart === false) {
        console.log(chalk.yellow('\n⚠️  Variables set but project not restarted'));
        console.log(chalk.gray('Restart to apply: codeb restart ' + name));
      }
      
      // Show warnings if any
      if (response.data.warnings?.length > 0) {
        console.log(chalk.yellow('\n⚠️  Warnings:'));
        response.data.warnings.forEach(warning => {
          console.log(chalk.yellow(`  • ${warning}`));
        });
      }
      
    } catch (error) {
      spinner.fail(chalk.red('Failed to set environment variables'));
      throw error;
    }
    
  } catch (error) {
    console.error(chalk.red(`Failed to set environment variables for ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    
    if (error.response?.status === 400) {
      console.log(chalk.gray('\n💡 Check variable names and values for invalid characters'));
    }
    
    process.exit(1);
  }
}

// 환경변수 삭제
async function unset(name, keys, options) {
  if (!keys || keys.length === 0) {
    console.error(chalk.red('Please specify environment variable keys to delete'));
    console.error(chalk.gray('Usage: codeb env:unset <project> KEY1 [KEY2...]'));
    process.exit(1);
  }
  
  try {
    // Show current values before deletion
    if (!options.force) {
      const currentResponse = await api.get(`/projects/${name}/env`);
      const currentVars = currentResponse.data;
      
      const varsToDelete = currentVars.filter(v => keys.includes(v.key));
      
      if (varsToDelete.length === 0) {
        console.log(chalk.yellow(`No matching variables found: ${keys.join(', ')}`));
        return;
      }
      
      console.log(chalk.yellow(`\n⚠️  Variables to be deleted:`));
      varsToDelete.forEach(v => {
        console.log(chalk.white(`  ${v.key} = ${maskValue(v.value)}`));
      });
      
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Delete ${varsToDelete.length} environment variable(s)?`,
          default: false
        }
      ]);
      
      if (!answer.confirm) {
        console.log(chalk.yellow('Deletion cancelled'));
        return;
      }
    }
    
    const environment = options.env || config.get('defaultEnvironment');
    const spinner = ora(`Deleting ${keys.length} variable(s) from ${name}...`).start();
    
    const response = await api.delete(`/projects/${name}/env`, {
      data: {
        keys,
        environment,
        restart: options.restart !== false
      }
    });
    
    const deletedCount = response.data.deleted || keys.length;
    spinner.succeed(chalk.green(`Successfully deleted ${deletedCount} environment variable(s)!`));
    
    console.log(chalk.cyan(`\n🗑️  Deleted Variables (${environment}):`));
    keys.forEach(key => {
      console.log(chalk.white(`  ${key}`));
    });
    
    // Show restart info
    if (options.restart !== false && response.data.restarted) {
      console.log(chalk.cyan('\n🔄 Project restarted to apply changes'));
    } else if (options.restart === false) {
      console.log(chalk.yellow('\n⚠️  Variables deleted but project not restarted'));
      console.log(chalk.gray('Restart to apply: codeb restart ' + name));
    }
    
    // Show not found keys
    if (response.data.notFound?.length > 0) {
      console.log(chalk.yellow(`\n⚠️  Variables not found: ${response.data.notFound.join(', ')}`));
    }
    
  } catch (error) {
    console.error(chalk.red(`Failed to delete environment variables for ${name}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 환경변수 동기화
async function sync(source, target, options) {
  if (!source || !target) {
    console.error(chalk.red('Please specify source and target projects'));
    console.error(chalk.gray('Usage: codeb env:sync <source-project> <target-project>'));
    process.exit(1);
  }
  
  const spinner = ora(`Syncing environment variables from ${source} to ${target}...`).start();
  
  try {
    // Get source variables
    spinner.text = 'Loading source variables...';
    const sourceResponse = await api.get(`/projects/${source}/env`, {
      params: {
        environment: options.sourceEnv || config.get('defaultEnvironment'),
        includeSystem: false // Don't sync system variables
      }
    });
    
    const sourceVars = sourceResponse.data;
    
    if (sourceVars.length === 0) {
      spinner.fail(chalk.yellow(`No environment variables found in ${source}`));
      return;
    }
    
    // Get target variables for comparison
    spinner.text = 'Loading target variables...';
    let targetVars = [];
    try {
      const targetResponse = await api.get(`/projects/${target}/env`, {
        params: {
          environment: options.targetEnv || options.sourceEnv || config.get('defaultEnvironment')
        }
      });
      targetVars = targetResponse.data;
    } catch (error) {
      // Target might not exist yet, that's okay
      if (error.response?.status !== 404) throw error;
    }
    
    // Compare variables
    const targetVarMap = new Map(targetVars.map(v => [v.key, v.value]));
    const toAdd = [];
    const toUpdate = [];
    const conflicts = [];
    
    sourceVars.forEach(sourceVar => {
      const targetValue = targetVarMap.get(sourceVar.key);
      
      if (targetValue === undefined) {
        toAdd.push(sourceVar);
      } else if (targetValue !== sourceVar.value) {
        if (options.overwrite || options.force) {
          toUpdate.push({ ...sourceVar, oldValue: targetValue });
        } else {
          conflicts.push({ ...sourceVar, targetValue });
        }
      }
    });
    
    // Handle conflicts
    if (conflicts.length > 0 && !options.force) {
      spinner.stop();
      
      console.log(chalk.yellow(`\n⚠️  Variable conflicts found:`));
      conflicts.forEach(conflict => {
        console.log(chalk.white(`  ${conflict.key}:`));
        console.log(chalk.gray(`    Source:  ${maskValue(conflict.value)}`));
        console.log(chalk.gray(`    Target:  ${maskValue(conflict.targetValue)}`));
      });
      
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `Overwrite ${conflicts.length} conflicting variable(s)?`,
          default: false
        }
      ]);
      
      if (answer.overwrite) {
        toUpdate.push(...conflicts);
      }
      
      spinner.start('Syncing variables...');
    }
    
    const totalChanges = toAdd.length + toUpdate.length;
    
    if (totalChanges === 0) {
      spinner.succeed(chalk.green('Environment variables are already in sync'));
      return;
    }
    
    // Apply changes
    spinner.text = `Applying ${totalChanges} changes...`;
    
    const variablesToSync = {};
    [...toAdd, ...toUpdate].forEach(variable => {
      variablesToSync[variable.key] = variable.value;
    });
    
    const syncResponse = await api.post(`/projects/${target}/env`, {
      variables: variablesToSync,
      environment: options.targetEnv || options.sourceEnv || config.get('defaultEnvironment'),
      restart: options.restart !== false,
      description: `Synced from ${source}`
    });
    
    spinner.succeed(chalk.green(`Successfully synced ${totalChanges} environment variable(s)!`));
    
    console.log(chalk.cyan('\n🔄 Sync Summary:'));
    console.log(chalk.white(`  Source: ${source} (${options.sourceEnv || config.get('defaultEnvironment')})`));
    console.log(chalk.white(`  Target: ${target} (${options.targetEnv || options.sourceEnv || config.get('defaultEnvironment')})`));
    
    if (toAdd.length > 0) {
      console.log(chalk.green(`  Added: ${toAdd.length} variable(s)`));
      if (options.verbose) {
        toAdd.forEach(v => console.log(chalk.gray(`    + ${v.key}`)));
      }
    }
    
    if (toUpdate.length > 0) {
      console.log(chalk.yellow(`  Updated: ${toUpdate.length} variable(s)`));
      if (options.verbose) {
        toUpdate.forEach(v => console.log(chalk.gray(`    ~ ${v.key}`)));
      }
    }
    
    // Show restart info
    if (options.restart !== false && syncResponse.data.restarted) {
      console.log(chalk.cyan('\n🔄 Target project restarted to apply changes'));
    } else if (options.restart === false) {
      console.log(chalk.yellow('\n⚠️  Variables synced but target project not restarted'));
      console.log(chalk.gray('Restart to apply: codeb restart ' + target));
    }
    
  } catch (error) {
    spinner.fail(chalk.red('Failed to sync environment variables'));
    console.error(chalk.red(error.response?.data?.message || error.message));
    
    if (error.response?.status === 404) {
      console.log(chalk.gray('\n💡 Make sure both projects exist'));
    }
    
    process.exit(1);
  }
}

// 환경변수 파일에서 로드
async function load(name, filePath, options) {
  const fs = require('fs');
  const path = require('path');
  
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(chalk.red(`File not found: ${filePath}`));
      process.exit(1);
    }
    
    // Read and parse file
    const content = fs.readFileSync(filePath, 'utf8');
    const variables = {};
    const errors = [];
    
    content.split('\n').forEach((line, index) => {
      line = line.trim();
      
      // Skip empty lines and comments
      if (!line || line.startsWith('#')) return;
      
      const equalIndex = line.indexOf('=');
      if (equalIndex === -1) {
        errors.push(`Line ${index + 1}: Invalid format`);
        return;
      }
      
      const key = line.substring(0, equalIndex).trim();
      let value = line.substring(equalIndex + 1).trim();
      
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      if (!key) {
        errors.push(`Line ${index + 1}: Empty key`);
        return;
      }
      
      variables[key] = value;
    });
    
    if (errors.length > 0) {
      console.error(chalk.red('File parsing errors:'));
      errors.forEach(error => console.error(chalk.red(`  ${error}`)));
      
      if (!options.force) {
        console.log(chalk.gray('Use --force to ignore errors and load valid variables'));
        process.exit(1);
      }
    }
    
    const variableCount = Object.keys(variables).length;
    
    if (variableCount === 0) {
      console.log(chalk.yellow('No valid environment variables found in file'));
      return;
    }
    
    // Confirmation
    if (!options.force) {
      console.log(chalk.cyan(`\n📁 Loading from: ${path.resolve(filePath)}`));
      console.log(chalk.white(`Found ${variableCount} variable(s):`));
      
      Object.keys(variables).forEach(key => {
        console.log(chalk.gray(`  ${key}`));
      });
      
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Load these variables into ${name}?`,
          default: true
        }
      ]);
      
      if (!answer.confirm) {
        console.log(chalk.yellow('Load cancelled'));
        return;
      }
    }
    
    // Load variables
    const environment = options.env || config.get('defaultEnvironment');
    const spinner = ora(`Loading ${variableCount} variable(s) into ${name}...`).start();
    
    const response = await api.post(`/projects/${name}/env`, {
      variables,
      environment,
      restart: options.restart !== false,
      description: `Loaded from ${path.basename(filePath)}`
    });
    
    spinner.succeed(chalk.green(`Successfully loaded ${variableCount} environment variable(s)!`));
    
    console.log(chalk.cyan(`\n📁 Load Summary:`));
    console.log(chalk.white(`  File: ${path.resolve(filePath)}`));
    console.log(chalk.white(`  Project: ${name} (${environment})`));
    console.log(chalk.white(`  Variables: ${variableCount}`));
    
    // Show restart info
    if (options.restart !== false && response.data.restarted) {
      console.log(chalk.cyan('\n🔄 Project restarted to apply changes'));
    }
    
  } catch (error) {
    console.error(chalk.red(`Failed to load environment variables from ${filePath}`));
    console.error(chalk.red(error.response?.data?.message || error.message));
    process.exit(1);
  }
}

// 유틸리티 함수들
function maskValue(value, type = 'custom') {
  if (!value) return '';
  
  // Don't mask public values
  if (type === 'public' || value.toLowerCase().includes('public') || 
      value.startsWith('http') || value.match(/^\d+$/)) {
    return value;
  }
  
  // Mask sensitive values
  if (value.length <= 4) return '*'.repeat(value.length);
  return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.slice(-2);
}

function getTypeColor(type) {
  const colors = {
    system: chalk.blue,
    secret: chalk.red,
    public: chalk.green,
    custom: chalk.white
  };
  
  return colors[type] || chalk.white;
}

module.exports = {
  list,
  set,
  unset,
  sync,
  load
};