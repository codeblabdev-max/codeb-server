/**
 * ENV Sync Module - 서버 리소스 스캔 및 동기화
 *
 * - 서버 리소스 스캔 (DB, Redis)
 * - 로컬 .env 파일 분석
 * - 서버 ↔ 로컬 비교 및 동기화
 *
 * @module env-sync
 * @version 3.0.0
 */

import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import inquirer from 'inquirer';
import { getServerHost, getServerUser } from '../lib/config.js';
import mcpClient from '../lib/mcp-client.js';

// ============================================================================
// 서버 리소스 스캔
// ============================================================================

/**
 * 서버의 PostgreSQL 데이터베이스 목록 조회
 */
export async function scanServerDatabases(serverHost, serverUser) {
  const result = {
    containerExists: false,
    containerRunning: false,
    databases: [],
    users: []
  };

  try {
    const containerCheck = execSync(
      `ssh ${serverUser}@${serverHost} "podman ps -a --filter name=codeb-postgres --format '{{.Names}}|{{.Status}}'" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim();

    if (containerCheck) {
      result.containerExists = true;
      result.containerRunning = containerCheck.includes('Up');
    }

    if (!result.containerRunning) {
      return result;
    }

    const dbList = execSync(
      `ssh ${serverUser}@${serverHost} "podman exec codeb-postgres psql -U postgres -t -c 'SELECT datname FROM pg_database WHERE datistemplate = false AND datname != \\'postgres\\';'" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim();

    result.databases = dbList.split('\n')
      .map(db => db.trim())
      .filter(db => db && db !== 'postgres');

    const userList = execSync(
      `ssh ${serverUser}@${serverHost} "podman exec codeb-postgres psql -U postgres -t -c 'SELECT usename FROM pg_user WHERE usename != \\'postgres\\';'" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim();

    result.users = userList.split('\n')
      .map(u => u.trim())
      .filter(u => u && u !== 'postgres');

  } catch (e) {
    // SSH or container not available
  }

  return result;
}

/**
 * 서버의 Redis 정보 조회
 */
export async function scanServerRedis(serverHost, serverUser) {
  const result = {
    containerExists: false,
    containerRunning: false,
    dbIndexes: []
  };

  try {
    const containerCheck = execSync(
      `ssh ${serverUser}@${serverHost} "podman ps -a --filter name=codeb-redis --format '{{.Names}}|{{.Status}}'" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim();

    if (containerCheck) {
      result.containerExists = true;
      result.containerRunning = containerCheck.includes('Up');
    }

    if (!result.containerRunning) {
      return result;
    }

    const keyspaceInfo = execSync(
      `ssh ${serverUser}@${serverHost} "podman exec codeb-redis redis-cli INFO keyspace" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim();

    const dbMatches = keyspaceInfo.match(/db(\d+):/g);
    if (dbMatches) {
      result.dbIndexes = dbMatches.map(m => parseInt(m.replace('db', '').replace(':', '')));
    }

  } catch (e) {
    // SSH or container not available
  }

  return result;
}

/**
 * 서버 레지스트리에서 프로젝트 정보 조회
 */
export async function getServerProjectInfo(serverHost, serverUser, projectName) {
  try {
    const registryJson = execSync(
      `ssh ${serverUser}@${serverHost} "cat /opt/codeb/config/project-registry.json 2>/dev/null || echo '{}'"`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim();

    const registry = JSON.parse(registryJson);
    return registry.projects?.[projectName] || null;
  } catch (e) {
    return null;
  }
}

// ============================================================================
// 로컬 ENV 파일 스캔
// ============================================================================

/**
 * 로컬 .env 파일들 스캔
 */
export function scanLocalEnvFiles(projectDir = process.cwd()) {
  const envFiles = ['.env', '.env.local', '.env.development', '.env.production'];
  const result = {
    files: {},
    database: null,
    redis: null
  };

  for (const envFile of envFiles) {
    const envPath = join(projectDir, envFile);
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, 'utf-8');
        const parsed = parseEnvFile(content);
        result.files[envFile] = {
          path: envPath,
          content,
          parsed
        };

        if (parsed.DATABASE_URL && !result.database) {
          result.database = parseDatabaseUrl(parsed.DATABASE_URL);
          result.database.sourceFile = envFile;
        }

        if (parsed.REDIS_URL && !result.redis) {
          result.redis = parseRedisUrl(parsed.REDIS_URL);
          result.redis.sourceFile = envFile;
        }
      } catch (e) {
        result.files[envFile] = { error: e.message };
      }
    }
  }

  return result;
}

/**
 * .env 파일 파싱
 */
export function parseEnvFile(content) {
  const result = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=["']?(.*)["']?$/i);
    if (match) {
      result[match[1]] = match[2].replace(/["']$/, '');
    }
  }

  return result;
}

/**
 * DATABASE_URL 파싱
 */
export function parseDatabaseUrl(url) {
  try {
    const match = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:\/]+):?(\d+)?\/([^?]+)/);
    if (match) {
      return {
        user: match[1],
        password: match[2],
        host: match[3],
        port: match[4] || '5432',
        database: match[5].split('?')[0],
        raw: url
      };
    }
  } catch (e) {}
  return { raw: url, error: 'Failed to parse' };
}

/**
 * REDIS_URL 파싱
 */
export function parseRedisUrl(url) {
  try {
    const match = url.match(/redis:\/\/([^:\/]+):?(\d+)?\/(\d+)?/);
    if (match) {
      return {
        host: match[1],
        port: match[2] || '6379',
        dbIndex: match[3] || '0',
        raw: url
      };
    }
  } catch (e) {}
  return { raw: url, error: 'Failed to parse' };
}

// ============================================================================
// 비교 및 분석
// ============================================================================

/**
 * 서버와 로컬 환경 비교
 */
export function compareEnvironments(serverInfo, localInfo, projectName) {
  const issues = [];
  const warnings = [];
  const info = [];

  const dbName = projectName.replace(/-/g, '_');

  if (localInfo.database) {
    const localDb = localInfo.database;

    if (localDb.host === 'localhost' || localDb.host === '127.0.0.1') {
      if (serverInfo.postgres?.containerRunning) {
        issues.push({
          type: 'db_host_mismatch',
          severity: 'error',
          message: 'DATABASE_URL points to localhost but server has running PostgreSQL',
          local: localDb.host,
          server: 'codeb-postgres (or server IP)',
          fix: 'Update DATABASE_URL to point to server'
        });
      }
    }

    if (serverInfo.postgres?.databases?.length > 0) {
      if (!serverInfo.postgres.databases.includes(localDb.database)) {
        warnings.push({
          type: 'db_not_found',
          severity: 'warning',
          message: `Database '${localDb.database}' not found on server`,
          availableDbs: serverInfo.postgres.databases
        });
      } else {
        info.push({
          type: 'db_exists',
          message: `Database '${localDb.database}' exists on server`
        });
      }
    }

    if (serverInfo.postgres?.users?.length > 0) {
      if (!serverInfo.postgres.users.includes(localDb.user)) {
        warnings.push({
          type: 'db_user_not_found',
          severity: 'warning',
          message: `Database user '${localDb.user}' not found on server`,
          availableUsers: serverInfo.postgres.users
        });
      }
    }
  } else if (serverInfo.postgres?.containerRunning) {
    warnings.push({
      type: 'no_local_db_config',
      severity: 'warning',
      message: 'Server has PostgreSQL but no DATABASE_URL in local .env'
    });
  }

  if (localInfo.redis) {
    const localRedis = localInfo.redis;

    if (localRedis.host === 'localhost' || localRedis.host === '127.0.0.1') {
      if (serverInfo.redis?.containerRunning) {
        issues.push({
          type: 'redis_host_mismatch',
          severity: 'error',
          message: 'REDIS_URL points to localhost but server has running Redis',
          local: localRedis.host,
          server: 'codeb-redis (or server IP)',
          fix: 'Update REDIS_URL to point to server'
        });
      }
    }
  }

  if (serverInfo.registry) {
    const regDb = serverInfo.registry.resources?.database;
    if (regDb && localInfo.database) {
      if (regDb.password && localInfo.database.password !== regDb.password) {
        issues.push({
          type: 'db_password_mismatch',
          severity: 'error',
          message: 'Database password in local .env does not match server registry',
          fix: 'Update DATABASE_URL with correct password from registry'
        });
      }
    }
  }

  return { issues, warnings, info };
}

// ============================================================================
// 메인 명령어
// ============================================================================

/**
 * we env scan - 서버와 로컬 환경 비교 분석
 */
export async function envScan(projectName, options = {}) {
  const spinner = ora('Scanning environments...').start();

  try {
    const serverHost = options.serverHost || getServerHost();
    const serverUser = options.serverUser || getServerUser();

    if (!serverHost) {
      spinner.fail('Server host not configured');
      console.log(chalk.gray('Run: we config init'));
      return;
    }

    if (!projectName) {
      const packageJsonPath = join(process.cwd(), 'package.json');
      if (existsSync(packageJsonPath)) {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        projectName = pkg.name;
      }
    }

    if (!projectName) {
      spinner.fail('Project name required');
      console.log(chalk.gray('Usage: we env scan <project-name>'));
      return;
    }

    console.log(chalk.cyan(`\n🔍 Environment Scan: ${projectName}\n`));

    spinner.text = 'Scanning server resources...';
    const serverInfo = {
      postgres: await scanServerDatabases(serverHost, serverUser),
      redis: await scanServerRedis(serverHost, serverUser),
      registry: await getServerProjectInfo(serverHost, serverUser, projectName)
    };

    spinner.text = 'Scanning local .env files...';
    const localInfo = scanLocalEnvFiles(process.cwd());

    spinner.stop();

    // 결과 출력
    printServerStatus(serverInfo);
    printLocalEnvStatus(localInfo);
    printConnectionInfo(localInfo);

    const comparison = compareEnvironments(serverInfo, localInfo, projectName);
    printComparisonResults(comparison);

    return {
      server: serverInfo,
      local: localInfo,
      comparison
    };

  } catch (error) {
    spinner.fail(`Scan failed: ${error.message}`);
    throw error;
  }
}

/**
 * we env pull - 서버에서 환경 변수 가져오기
 */
export async function envPull(projectName, options = {}) {
  const spinner = ora('Pulling environment from server...').start();

  try {
    const serverHost = options.serverHost || getServerHost();
    const serverUser = options.serverUser || getServerUser();

    if (!serverHost) {
      spinner.fail('Server host not configured');
      return;
    }

    if (!projectName) {
      const packageJsonPath = join(process.cwd(), 'package.json');
      if (existsSync(packageJsonPath)) {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        projectName = pkg.name;
      }
    }

    if (!projectName) {
      spinner.fail('Project name required');
      return;
    }

    const projectInfo = await getServerProjectInfo(serverHost, serverUser, projectName);

    if (!projectInfo) {
      spinner.fail(`Project '${projectName}' not found in server registry`);
      console.log(chalk.gray('Run: we workflow init <project> --database --redis'));
      return;
    }

    spinner.stop();

    console.log(chalk.cyan(`\n📥 Pull Environment: ${projectName}\n`));

    const dbInfo = projectInfo.resources?.database;
    const redisInfo = projectInfo.resources?.redis;

    if (!dbInfo && !redisInfo) {
      console.log(chalk.yellow('No database or Redis configured for this project'));
      return;
    }

    const envVars = {
      NODE_ENV: 'development',
      PORT: '3000'
    };

    if (dbInfo) {
      console.log(chalk.green('  ✓ Database credentials found'));
      console.log(chalk.gray(`    DB: ${dbInfo.name}, User: ${dbInfo.user}`));

      const dbPort = projectInfo.environments?.production?.db_port ||
                     projectInfo.environments?.staging?.db_port ||
                     5432;

      envVars.DATABASE_URL = `postgresql://${dbInfo.user}:${dbInfo.password}@${serverHost}:${dbPort}/${dbInfo.name}?schema=public`;
      envVars.POSTGRES_HOST = serverHost;
      envVars.POSTGRES_PORT = String(dbPort);
      envVars.POSTGRES_USER = dbInfo.user;
      envVars.POSTGRES_PASSWORD = dbInfo.password;
      envVars.POSTGRES_DB = dbInfo.name;
    }

    if (redisInfo) {
      console.log(chalk.green('  ✓ Redis config found'));
      console.log(chalk.gray(`    DB Index: ${redisInfo.db_index}, Prefix: ${redisInfo.prefix}`));

      const redisPort = projectInfo.environments?.production?.redis_port ||
                        projectInfo.environments?.staging?.redis_port ||
                        6379;

      envVars.REDIS_URL = `redis://${serverHost}:${redisPort}/${redisInfo.db_index}`;
      envVars.REDIS_HOST = serverHost;
      envVars.REDIS_PORT = String(redisPort);
      envVars.REDIS_DB = String(redisInfo.db_index);
      envVars.REDIS_PREFIX = redisInfo.prefix;
    }

    const envContent = generateEnvContent(envVars, projectName);
    const envPath = join(process.cwd(), '.env.local');

    if (existsSync(envPath)) {
      const { overwrite } = await inquirer.prompt([{
        type: 'confirm',
        name: 'overwrite',
        message: '.env.local already exists. Overwrite?',
        default: false
      }]);

      if (!overwrite) {
        const backupPath = `${envPath}.backup.${Date.now()}`;
        const existingContent = readFileSync(envPath, 'utf-8');
        writeFileSync(backupPath, existingContent);
        console.log(chalk.gray(`  Backup created: ${backupPath}`));

        const mergedContent = mergeEnvContent(existingContent, envContent);
        writeFileSync(envPath, mergedContent);
        console.log(chalk.green('\n✓ .env.local merged with server credentials'));
      } else {
        writeFileSync(envPath, envContent);
        console.log(chalk.green('\n✓ .env.local overwritten'));
      }
    } else {
      writeFileSync(envPath, envContent);
      console.log(chalk.green('\n✓ .env.local created'));
    }

    console.log(chalk.gray(`  Path: ${envPath}`));

  } catch (error) {
    spinner.fail(`Pull failed: ${error.message}`);
    throw error;
  }
}

/**
 * we env push - 로컬 ENV를 MCP API를 통해 서버에 업로드
 */
export async function envPush(projectName, options = {}) {
  const spinner = ora('Preparing ENV upload...').start();

  try {
    if (!projectName) {
      const packageJsonPath = join(process.cwd(), 'package.json');
      if (existsSync(packageJsonPath)) {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        projectName = pkg.name;
      }
    }

    if (!projectName) {
      spinner.fail('Project name required');
      console.log(chalk.gray('Usage: we env push <project-name>'));
      return;
    }

    const environment = options.environment || 'production';
    const envFile = options.file || `.env.${environment}`;
    const restart = options.restart !== false;

    const envFiles = [envFile, `.env.${environment}`, '.env.production', '.env.local', '.env'];
    let envPath = null;
    let envContent = null;

    for (const fileName of envFiles) {
      const filePath = join(process.cwd(), fileName);
      if (existsSync(filePath)) {
        envPath = filePath;
        envContent = readFileSync(filePath, 'utf-8');
        break;
      }
    }

    if (!envContent) {
      spinner.fail('No .env file found');
      console.log(chalk.gray('Expected: .env, .env.local, .env.production'));
      return;
    }

    spinner.text = 'Uploading ENV via MCP API...';

    const result = await mcpClient.envUpload({
      project: projectName,
      environment,
      content: envContent,
      restart
    });

    spinner.stop();

    if (!result.success) {
      console.log(chalk.red(`\n❌ Upload failed: ${result.error}\n`));
      return;
    }

    console.log(chalk.green(`\n✅ ENV uploaded successfully!\n`));
    console.log(chalk.gray(`Project: ${projectName}`));
    console.log(chalk.gray(`Environment: ${environment}`));
    console.log(chalk.gray(`Source: ${envPath}`));
    console.log(chalk.gray(`Backup: ${result.backupSaved ? 'saved' : 'skipped'}`));
    console.log(chalk.gray(`Service: ${restart ? 'restarted' : 'not restarted'}`));
    console.log('');

  } catch (error) {
    spinner.fail(`Push failed: ${error.message}`);
    throw error;
  }
}

/**
 * we env upload - 직접 ENV 내용 업로드 (MCP용)
 */
export async function envUpload(projectName, options = {}) {
  const spinner = ora('Uploading ENV...').start();

  try {
    if (!projectName) {
      spinner.fail('Project name required');
      console.log(chalk.gray('Usage: we env upload <project-name> --content "KEY=value..."'));
      return;
    }

    const environment = options.environment || 'production';
    const content = options.content;
    const variables = options.variables;
    const restart = options.restart !== false;

    if (!content && !variables) {
      spinner.fail('Either --content or --variables is required');
      return;
    }

    const result = await mcpClient.envUpload({
      project: projectName,
      environment,
      content,
      variables,
      restart
    });

    spinner.stop();

    if (!result.success) {
      console.log(chalk.red(`\n❌ Upload failed: ${result.error}\n`));
      return { success: false, error: result.error };
    }

    console.log(chalk.green(`\n✅ ENV uploaded successfully!\n`));
    console.log(chalk.gray(`Project: ${projectName}`));
    console.log(chalk.gray(`Environment: ${environment}`));

    return { success: true, ...result };

  } catch (error) {
    spinner.fail(`Upload failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * we env list - 환경 변수 목록
 */
export async function envList(projectName, options = {}) {
  const localInfo = scanLocalEnvFiles(process.cwd());

  console.log(chalk.cyan('\n📋 Local Environment Variables\n'));

  for (const [fileName, file] of Object.entries(localInfo.files)) {
    console.log(chalk.bold(`${fileName}:`));
    if (file.parsed) {
      for (const [key, value] of Object.entries(file.parsed)) {
        const maskedValue = key.includes('PASSWORD') || key.includes('SECRET') || key.includes('KEY')
          ? '***'
          : value.length > 50 ? value.substring(0, 50) + '...' : value;
        console.log(chalk.gray(`  ${key}=${maskedValue}`));
      }
    }
    console.log('');
  }
}

// ============================================================================
// 헬퍼 함수들
// ============================================================================

function generateEnvContent(envVars, projectName) {
  let content = `# ${projectName} - Development Environment
# Generated by CodeB CLI (we env pull)
# ${new Date().toISOString()}

`;

  for (const [key, value] of Object.entries(envVars)) {
    content += `${key}=${value}\n`;
  }

  return content;
}

function mergeEnvContent(existingContent, newContent) {
  const existingVars = parseEnvFile(existingContent);
  const newVars = parseEnvFile(newContent);

  const dbKeys = ['DATABASE_URL', 'POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB'];
  const redisKeys = ['REDIS_URL', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_DB', 'REDIS_PREFIX'];

  const merged = { ...existingVars };

  for (const key of [...dbKeys, ...redisKeys]) {
    if (newVars[key]) {
      merged[key] = newVars[key];
    }
  }

  let content = `# Updated by CodeB CLI (we env pull)
# ${new Date().toISOString()}

`;

  for (const [key, value] of Object.entries(merged)) {
    content += `${key}=${value}\n`;
  }

  return content;
}

function printServerStatus(serverInfo) {
  console.log(chalk.bold('━━━ Server Status ━━━'));

  if (serverInfo.postgres.containerRunning) {
    console.log(chalk.green('  ✓ PostgreSQL: Running'));
    console.log(chalk.gray(`    Databases: ${serverInfo.postgres.databases.join(', ') || 'none'}`));
    console.log(chalk.gray(`    Users: ${serverInfo.postgres.users.join(', ') || 'none'}`));
  } else if (serverInfo.postgres.containerExists) {
    console.log(chalk.yellow('  ⚠ PostgreSQL: Stopped'));
  } else {
    console.log(chalk.red('  ✗ PostgreSQL: Not found'));
  }

  if (serverInfo.redis.containerRunning) {
    console.log(chalk.green('  ✓ Redis: Running'));
    if (serverInfo.redis.dbIndexes.length > 0) {
      console.log(chalk.gray(`    Active DBs: ${serverInfo.redis.dbIndexes.join(', ')}`));
    }
  } else if (serverInfo.redis.containerExists) {
    console.log(chalk.yellow('  ⚠ Redis: Stopped'));
  } else {
    console.log(chalk.red('  ✗ Redis: Not found'));
  }

  if (serverInfo.registry) {
    console.log(chalk.green(`  ✓ Registry: Project registered`));
    if (serverInfo.registry.resources?.database) {
      console.log(chalk.gray(`    DB: ${serverInfo.registry.resources.database.name}`));
    }
  } else {
    console.log(chalk.yellow(`  ⚠ Registry: Project not found`));
  }
}

function printLocalEnvStatus(localInfo) {
  console.log('');
  console.log(chalk.bold('━━━ Local .env Files ━━━'));

  const envFileNames = Object.keys(localInfo.files);
  if (envFileNames.length === 0) {
    console.log(chalk.yellow('  No .env files found'));
  } else {
    for (const fileName of envFileNames) {
      console.log(chalk.cyan(`  ${fileName}:`));
      const file = localInfo.files[fileName];
      if (file.error) {
        console.log(chalk.red(`    Error: ${file.error}`));
      } else {
        const hasDb = file.parsed.DATABASE_URL ? chalk.green('✓') : chalk.gray('✗');
        const hasRedis = file.parsed.REDIS_URL ? chalk.green('✓') : chalk.gray('✗');
        console.log(chalk.gray(`    DATABASE_URL: ${hasDb}  REDIS_URL: ${hasRedis}`));
      }
    }
  }
}

function printConnectionInfo(localInfo) {
  if (localInfo.database) {
    console.log('');
    console.log(chalk.bold('━━━ Parsed Connection Info ━━━'));
    console.log(chalk.cyan('  Database:'));
    console.log(chalk.gray(`    Host: ${localInfo.database.host}`));
    console.log(chalk.gray(`    Port: ${localInfo.database.port}`));
    console.log(chalk.gray(`    User: ${localInfo.database.user}`));
    console.log(chalk.gray(`    DB:   ${localInfo.database.database}`));
    console.log(chalk.gray(`    From: ${localInfo.database.sourceFile}`));
  }

  if (localInfo.redis) {
    console.log(chalk.cyan('  Redis:'));
    console.log(chalk.gray(`    Host: ${localInfo.redis.host}`));
    console.log(chalk.gray(`    Port: ${localInfo.redis.port}`));
    console.log(chalk.gray(`    DB:   ${localInfo.redis.dbIndex}`));
    console.log(chalk.gray(`    From: ${localInfo.redis.sourceFile}`));
  }
}

function printComparisonResults(comparison) {
  if (comparison.issues.length > 0 || comparison.warnings.length > 0) {
    console.log('');
    console.log(chalk.bold('━━━ Issues Found ━━━'));

    for (const issue of comparison.issues) {
      console.log(chalk.red(`  ✗ [ERROR] ${issue.message}`));
      if (issue.fix) {
        console.log(chalk.yellow(`    Fix: ${issue.fix}`));
      }
    }

    for (const warning of comparison.warnings) {
      console.log(chalk.yellow(`  ⚠ [WARN] ${warning.message}`));
    }
  }

  if (comparison.info.length > 0) {
    console.log('');
    for (const item of comparison.info) {
      console.log(chalk.green(`  ✓ ${item.message}`));
    }
  }

  if (comparison.issues.length > 0) {
    console.log('');
    console.log(chalk.bold('━━━ Recommended Actions ━━━'));
    console.log(chalk.cyan('  Run: we env pull   - Pull credentials from server'));
    console.log(chalk.cyan('  Run: we env fix    - Auto-fix .env files'));
  }
}

export default {
  scanServerDatabases,
  scanServerRedis,
  getServerProjectInfo,
  scanLocalEnvFiles,
  parseEnvFile,
  parseDatabaseUrl,
  parseRedisUrl,
  compareEnvironments,
  envScan,
  envPull,
  envPush,
  envUpload,
  envList,
};
