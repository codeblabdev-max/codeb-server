/**
 * Pre-Deploy Scan Module
 *
 * Full pre-deployment scan comparing local and server state
 * - Server resources (PostgreSQL, Redis, containers, ports)
 * - Local files (env, quadlet, GitHub Actions, Dockerfile)
 * - Issue detection and suggestions
 *
 * @module workflow/pre-deploy-scan
 */

import chalk from 'chalk';
import { readFile } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { getServerHost, getServerUser } from '../../lib/config.js';
import { mcpClient } from '../../lib/mcp-client.js';
import { analyzeGitHubActions } from './scan.js';

/**
 * Full pre-deploy scan - compares local and server state
 * @param {string} projectName - Project name
 * @param {Object} options - Scan options
 * @returns {Promise<Object>} Scan result
 */
export async function fullPreDeployScan(projectName, options = {}) {
  const { execSync } = await import('child_process');
  const serverHost = options.host || getServerHost();
  const serverUser = options.user || getServerUser();
  const silent = options.silent || false;

  if (!silent) {
    console.log(chalk.cyan('\n Full Pre-Deploy Scan\n'));
  }

  const result = {
    timestamp: new Date().toISOString(),
    projectName,
    server: {
      reachable: false,
      postgres: { containerExists: false, containerRunning: false, databases: [], users: [] },
      redis: { containerExists: false, containerRunning: false, dbIndexes: [] },
      containers: [],
      ports: { used: [], available: [] },
      registry: null
    },
    local: {
      envFiles: {},
      quadlet: [],
      githubActions: null,
      dockerfile: false,
      packageJson: null,
      database: null,
      redis: null
    },
    comparison: {
      issues: [],
      warnings: [],
      suggestions: []
    }
  };

  // ================================================================
  // 1. Server Scan
  // ================================================================
  if (serverHost) {
    if (!silent) console.log(chalk.gray('  Scanning server...'));

    // 1.1 Server reachability
    try {
      execSync(`ssh -o ConnectTimeout=5 ${serverUser}@${serverHost} "echo ok"`, {
        encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe']
      });
      result.server.reachable = true;
    } catch (e) {
      result.comparison.issues.push({
        type: 'server_unreachable',
        severity: 'critical',
        message: `Cannot reach server ${serverHost}`
      });
      if (!silent) console.log(chalk.red('   Server unreachable'));
      return result;
    }

    // 1.2 PostgreSQL container
    try {
      const pgStatus = execSync(
        `ssh ${serverUser}@${serverHost} "podman ps -a --filter name=codeb-postgres --format '{{.Names}}|{{.Status}}'" 2>/dev/null`,
        { encoding: 'utf-8', timeout: 30000 }
      ).trim();

      if (pgStatus) {
        result.server.postgres.containerExists = true;
        result.server.postgres.containerRunning = pgStatus.includes('Up');

        if (result.server.postgres.containerRunning) {
          // Get databases
          const dbList = execSync(
            `ssh ${serverUser}@${serverHost} "podman exec codeb-postgres psql -U postgres -t -c \\"SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres';\\"" 2>/dev/null`,
            { encoding: 'utf-8', timeout: 30000 }
          ).trim();
          result.server.postgres.databases = dbList.split('\n').map(d => d.trim()).filter(Boolean);

          // Get users
          const userList = execSync(
            `ssh ${serverUser}@${serverHost} "podman exec codeb-postgres psql -U postgres -t -c \\"SELECT usename FROM pg_user WHERE usename != 'postgres';\\"" 2>/dev/null`,
            { encoding: 'utf-8', timeout: 30000 }
          ).trim();
          result.server.postgres.users = userList.split('\n').map(u => u.trim()).filter(Boolean);
        }
      }
    } catch (e) { /* ignore */ }

    // 1.3 Redis container
    try {
      const redisStatus = execSync(
        `ssh ${serverUser}@${serverHost} "podman ps -a --filter name=codeb-redis --format '{{.Names}}|{{.Status}}'" 2>/dev/null`,
        { encoding: 'utf-8', timeout: 30000 }
      ).trim();

      if (redisStatus) {
        result.server.redis.containerExists = true;
        result.server.redis.containerRunning = redisStatus.includes('Up');

        if (result.server.redis.containerRunning) {
          const keyspace = execSync(
            `ssh ${serverUser}@${serverHost} "podman exec codeb-redis redis-cli INFO keyspace" 2>/dev/null`,
            { encoding: 'utf-8', timeout: 30000 }
          ).trim();
          const dbMatches = keyspace.match(/db(\d+):/g);
          if (dbMatches) {
            result.server.redis.dbIndexes = dbMatches.map(m => parseInt(m.replace('db', '').replace(':', '')));
          }
        }
      }
    } catch (e) { /* ignore */ }

    // 1.4 All running containers
    try {
      const containers = execSync(
        `ssh ${serverUser}@${serverHost} "podman ps --format '{{.Names}}|{{.Ports}}|{{.Status}}'" 2>/dev/null`,
        { encoding: 'utf-8', timeout: 30000 }
      ).trim();

      result.server.containers = containers.split('\n').filter(Boolean).map(line => {
        const [name, ports, status] = line.split('|');
        return { name, ports, status };
      });
    } catch (e) { /* ignore */ }

    // 1.5 Used ports
    try {
      const portsOutput = execSync(
        `ssh ${serverUser}@${serverHost} "ss -tlnp | grep LISTEN | awk '{print \\$4}' | rev | cut -d: -f1 | rev | sort -n | uniq" 2>/dev/null`,
        { encoding: 'utf-8', timeout: 30000 }
      ).trim();
      result.server.ports.used = portsOutput.split('\n').filter(Boolean).map(p => parseInt(p)).filter(p => !isNaN(p));
    } catch (e) { /* ignore */ }

    // 1.6 Project registry - Try MCP first
    try {
      const mcpConnected = await mcpClient.ensureConnected();
      if (mcpConnected) {
        const ssotData = await mcpClient.callTool('ssot_get', {});
        if (ssotData && !ssotData.error) {
          result.server.registry = ssotData;
          // Check if this project is already registered
          if (ssotData.projects?.[projectName]) {
            result.server.projectInfo = ssotData.projects[projectName];
            if (!silent) console.log(chalk.green(`   Project '${projectName}' found in registry`));
          } else {
            if (!silent) console.log(chalk.yellow(`   Project '${projectName}' not in registry`));
          }
        }
      }
    } catch (e) {
      // SSH fallback
      try {
        const registryPath = '/opt/codeb/config/project-registry.json';
        const registryOutput = execSync(
          `ssh ${serverUser}@${serverHost} "cat ${registryPath}" 2>/dev/null`,
          { encoding: 'utf-8', timeout: 30000 }
        );
        result.server.registry = JSON.parse(registryOutput);
        if (result.server.registry?.projects?.[projectName]) {
          result.server.projectInfo = result.server.registry.projects[projectName];
          if (!silent) console.log(chalk.green(`   Project '${projectName}' found in registry`));
        }
      } catch { /* ignore */ }
    }

    // Server status summary
    if (!silent) {
      console.log(chalk.gray(`  PostgreSQL: ${result.server.postgres.containerRunning ? chalk.green('Running') : chalk.yellow('Stopped')}`));
      if (result.server.postgres.databases.length > 0) {
        console.log(chalk.gray(`    DBs: ${result.server.postgres.databases.join(', ')}`));
      }
      console.log(chalk.gray(`  Redis: ${result.server.redis.containerRunning ? chalk.green('Running') : chalk.yellow('Stopped')}`));
      console.log(chalk.gray(`  Containers: ${result.server.containers.length} running`));
      console.log(chalk.gray(`  Ports in use: ${result.server.ports.used.length}`));
    }
  }

  // ================================================================
  // 2. Local Scan
  // ================================================================
  if (!silent) console.log(chalk.gray('\n  Scanning local files...'));

  // 2.1 package.json
  const pkgPath = join(process.cwd(), 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
      result.local.packageJson = { name: pkg.name, version: pkg.version };
    } catch (e) { /* ignore */ }
  }

  // 2.2 .env files
  const envFiles = ['.env', '.env.local', '.env.development', '.env.production'];
  for (const envFile of envFiles) {
    const envPath = join(process.cwd(), envFile);
    if (existsSync(envPath)) {
      try {
        const content = await readFile(envPath, 'utf-8');
        const parsed = {};

        content.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;
          const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=["']?(.*)["']?$/i);
          if (match) parsed[match[1]] = match[2].replace(/["']$/, '');
        });

        result.local.envFiles[envFile] = {
          path: envPath,
          hasDbUrl: !!parsed.DATABASE_URL,
          hasRedisUrl: !!parsed.REDIS_URL,
          parsed
        };

        // Extract DB info
        if (parsed.DATABASE_URL && !result.local.database) {
          const dbMatch = parsed.DATABASE_URL.match(/postgresql:\/\/([^:]+):([^@]+)@([^:\/]+):?(\d+)?\/([^?]+)/);
          if (dbMatch) {
            result.local.database = {
              user: dbMatch[1],
              password: dbMatch[2],
              host: dbMatch[3],
              port: dbMatch[4] || '5432',
              database: dbMatch[5].split('?')[0],
              sourceFile: envFile
            };
          }
        }

        // Extract Redis info
        if (parsed.REDIS_URL && !result.local.redis) {
          const redisMatch = parsed.REDIS_URL.match(/redis:\/\/([^:\/]+):?(\d+)?\/(\d+)?/);
          if (redisMatch) {
            result.local.redis = {
              host: redisMatch[1],
              port: redisMatch[2] || '6379',
              dbIndex: redisMatch[3] || '0',
              sourceFile: envFile
            };
          }
        }
      } catch (e) { /* ignore */ }
    }
  }

  // 2.3 Quadlet files
  const quadletDir = join(process.cwd(), 'quadlet');
  if (existsSync(quadletDir)) {
    try {
      result.local.quadlet = readdirSync(quadletDir).filter(f => f.endsWith('.container'));
    } catch (e) { /* ignore */ }
  }

  // 2.4 GitHub Actions
  const ghPath = join(process.cwd(), '.github', 'workflows', 'deploy.yml');
  if (existsSync(ghPath)) {
    try {
      const content = await readFile(ghPath, 'utf-8');
      result.local.githubActions = analyzeGitHubActions(content);
    } catch (e) { /* ignore */ }
  }

  // 2.5 Dockerfile
  result.local.dockerfile = existsSync(join(process.cwd(), 'Dockerfile'));

  // Local summary
  if (!silent) {
    console.log(chalk.gray(`  .env files: ${Object.keys(result.local.envFiles).join(', ') || 'none'}`));
    console.log(chalk.gray(`  Quadlet: ${result.local.quadlet.length} files`));
    console.log(chalk.gray(`  GitHub Actions: ${result.local.githubActions ? 'yes' : 'no'}`));
    console.log(chalk.gray(`  Dockerfile: ${result.local.dockerfile ? 'yes' : 'no'}`));
  }

  // ================================================================
  // 3. Comparison & Issue Detection
  // ================================================================
  if (!silent) console.log(chalk.gray('\n  Analyzing...'));

  // 3.1 DB host mismatch
  if (result.local.database) {
    const localHost = result.local.database.host;
    if ((localHost === 'localhost' || localHost === '127.0.0.1') && result.server.postgres.containerRunning) {
      result.comparison.issues.push({
        type: 'db_host_mismatch',
        severity: 'error',
        message: 'DATABASE_URL points to localhost but server has running PostgreSQL',
        fix: 'Run "we env pull" to get server credentials'
      });
    }

    // DB exists check
    if (result.server.postgres.databases.length > 0) {
      if (!result.server.postgres.databases.includes(result.local.database.database)) {
        result.comparison.warnings.push({
          type: 'db_not_found',
          message: `Database '${result.local.database.database}' not found on server`,
          availableDbs: result.server.postgres.databases
        });
      }
    }

    // Password mismatch with registry
    const regDb = result.server.projectInfo?.resources?.database;
    if (regDb?.password && result.local.database.password !== regDb.password) {
      result.comparison.issues.push({
        type: 'db_password_mismatch',
        severity: 'error',
        message: 'Database password mismatch between local .env and server registry',
        fix: 'Run "we env pull" to sync credentials'
      });
    }
  }

  // 3.2 Redis host mismatch
  if (result.local.redis) {
    const localHost = result.local.redis.host;
    if ((localHost === 'localhost' || localHost === '127.0.0.1') && result.server.redis.containerRunning) {
      result.comparison.issues.push({
        type: 'redis_host_mismatch',
        severity: 'error',
        message: 'REDIS_URL points to localhost but server has running Redis',
        fix: 'Run "we env pull" to get server credentials'
      });
    }
  }

  // 3.3 No local env files but server has resources
  if (Object.keys(result.local.envFiles).length === 0 && result.server.projectInfo) {
    result.comparison.warnings.push({
      type: 'no_local_env',
      message: 'No local .env files but project is registered on server',
      fix: 'Run "we env pull" to create .env.local'
    });
  }

  // 3.4 Quadlet but no GitHub Actions
  if (result.local.quadlet.length > 0 && !result.local.githubActions) {
    result.comparison.warnings.push({
      type: 'missing_github_actions',
      message: 'Quadlet files exist but no deploy.yml workflow'
    });
  }

  // 3.5 Suggestions
  if (!result.server.postgres.containerRunning && !result.server.redis.containerRunning) {
    result.comparison.suggestions.push('Server infrastructure not running. Run "we workflow init --provision" to set up.');
  }

  if (!result.server.projectInfo && result.server.reachable) {
    result.comparison.suggestions.push(`Project '${projectName}' not registered. Init will create server resources.`);
  }

  // ================================================================
  // 4. Output Summary
  // ================================================================
  if (!silent) {
    console.log('');
    if (result.comparison.issues.length > 0) {
      console.log(chalk.red.bold('--- Issues ---'));
      for (const issue of result.comparison.issues) {
        console.log(chalk.red(`   ${issue.message}`));
        if (issue.fix) console.log(chalk.yellow(`    Fix: ${issue.fix}`));
      }
    }

    if (result.comparison.warnings.length > 0) {
      console.log(chalk.yellow.bold('--- Warnings ---'));
      for (const warning of result.comparison.warnings) {
        console.log(chalk.yellow(`   ${warning.message}`));
      }
    }

    if (result.comparison.issues.length === 0 && result.comparison.warnings.length === 0) {
      console.log(chalk.green('   No issues detected'));
    }

    if (result.comparison.suggestions.length > 0) {
      console.log(chalk.cyan.bold('\n--- Suggestions ---'));
      for (const suggestion of result.comparison.suggestions) {
        console.log(chalk.cyan(`   ${suggestion}`));
      }
    }
    console.log('');
  }

  return result;
}
