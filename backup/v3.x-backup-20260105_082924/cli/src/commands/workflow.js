/**
 * Workflow Command - Slim Orchestrator
 *
 * Main entry point for workflow commands. Routes to modular handlers.
 * All heavy lifting is done in workflow/ submodules:
 * - scan.js: Project scanning and analysis
 * - migrate.js: Project migration
 * - init.js: Project initialization
 * - services.js: Service management (add-resource, add-service, fix-network, sync)
 * - templates.js: Configuration templates (CLAUDE.md, DEPLOYMENT_RULES.md)
 *
 * @module workflow
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync, readdirSync } from 'fs';
import { getServerHost, getServerUser, getDbPassword, getCliVersion } from '../lib/config.js';
import { mcpClient } from '../lib/mcp-client.js';
import {
  getPodmanVersion,
  validateQuadletContent,
  convertQuadletForCompatibility,
  validateQuadlet,
  getVersionInfo
} from '../lib/quadlet-validator.js';

// Import all modular components
import {
  // Scan module
  scanBlueGreen,
  scanLegacy,
  fullPreDeployScan,
  analyzeGitHubActions,
  DEPLOY_METHODS,
  // Migrate module
  migrate,
  // Init module
  initWorkflow,
  // Services module
  addResourceWorkflow,
  addServiceWorkflow,
  fixNetworkWorkflow,
  syncWorkflow,
  // Template generators
  generateGitHubActionsWorkflow,
  generateDockerfile,
  generateQuadletTemplate,
  generateProjectSet,
  // Registry management
  readProjectRegistry,
  writeProjectRegistry,
  // Port utilities
  PORT_RANGES,
  scanServerPorts,
  validatePort,
  findSafePort,
  autoScanAndValidatePorts
} from './workflow/index.js';

// Export fullPreDeployScan for use in other commands (deploy.js, etc.)
export { fullPreDeployScan };

// ============================================================================
// Main Command Handler
// ============================================================================

export async function workflow(action, target, options) {
  console.log(chalk.blue.bold(`\n CodeB Workflow Generator\n`));

  switch (action) {
    case 'init':
      await initWorkflow(target, options);
      break;
    case 'quadlet':
      await generateQuadletCommand(target, options);
      break;
    case 'github-actions':
    case 'gh':
      await generateGitHubActionsCommand(target, options);
      break;
    case 'dockerfile':
    case 'docker':
      await generateDockerfileCommand(target, options);
      break;
    case 'update':
      await updateWorkflow(target, options);
      break;
    case 'scan':
      // Use scanLegacy if --fix is specified (has CLAUDE.md and deploy.yml auto-fix)
      // Otherwise use Blue-Green Slot API (v3.1.1+) by default
      if (options.fix) {
        await scanLegacy(target, { ...options, autoFix: true });
      } else {
        await scanBlueGreen(target, options);
      }
      break;
    case 'scan-legacy':
      // Legacy scan (Quadlet/SSH based) - for backward compatibility
      await scanLegacy(target, options);
      break;
    case 'migrate':
      await migrate(target, options);
      break;
    case 'sync':
      await syncWorkflow(target, options);
      break;
    case 'add-service':
      await addServiceWorkflow(target, options);
      break;
    case 'add-resource':
      await addResourceWorkflow(target, options);
      break;
    case 'fix-network':
      await fixNetworkWorkflow(target, options);
      break;
    case 'port-validate':
    case 'port':
      await portValidateWorkflow(target, options);
      break;
    case 'port-drift':
    case 'drift':
      await portDriftWorkflow(target, options);
      break;
    case 'validate':
    case 'check':
      await validateQuadletWorkflow(target, options);
      break;
    case 'secrets':
      await registerGitHubSecrets(target, options);
      break;
    default:
      console.log(chalk.red(`Unknown action: ${action}`));
      console.log(chalk.gray('\nAvailable actions:'));
      console.log(chalk.gray('  init         - Initialize complete workflow + server resources (DB, Redis, Storage)'));
      console.log(chalk.gray('  quadlet      - Generate Quadlet .container file'));
      console.log(chalk.gray('  github-actions - Generate GitHub Actions workflow'));
      console.log(chalk.gray('  dockerfile   - Generate optimized Dockerfile'));
      console.log(chalk.gray('  update       - Update existing workflow configurations'));
      console.log(chalk.gray('  scan         - Scan project resources (DB, Redis, Storage, ENV)'));
      console.log(chalk.gray('  migrate      - Migrate existing project to new CLI structure'));
      console.log(chalk.gray('  sync         - Sync workflow changes to server'));
      console.log(chalk.gray('  add-service  - Add container service (PostgreSQL/Redis container)'));
      console.log(chalk.gray('  add-resource - Add missing resources to existing project (DB user, Redis DB, Storage)'));
      console.log(chalk.gray('  fix-network  - Fix network issues (migrate to codeb-network)'));
      console.log(chalk.gray('  port-validate- Validate port allocation before deployment (GitOps PortGuard)'));
      console.log(chalk.gray('  port-drift   - Detect drift between manifest and actual server state'));
      console.log(chalk.gray('  validate     - Validate Quadlet files for Podman version compatibility'));
      console.log(chalk.gray('  secrets      - Register GitHub Secrets (SSH_HOST, SSH_USER, SSH_PRIVATE_KEY)'));
  }
}

// ============================================================================
// Quadlet Generation
// ============================================================================

async function generateQuadletCommand(projectName, options) {
  const spinner = ora('Generating Quadlet configuration...').start();

  try {
    const serverHost = options.host || getServerHost();
    const serverUser = options.user || getServerUser();

    // Check target server's Podman version for compatibility
    let podmanVersion = { major: 5, minor: 0, patch: 0, full: '5.0.0' };
    if (serverHost) {
      spinner.text = 'Checking server Podman version...';
      podmanVersion = await getPodmanVersion(serverHost, serverUser);
      const versionInfo = getVersionInfo(podmanVersion);
      console.log(chalk.gray(`\n   Server Podman: ${podmanVersion.full}`));
      if (podmanVersion.major < 5) {
        console.log(chalk.yellow(`    ${versionInfo.recommendation}`));
      }
    }

    const config = {
      projectName: projectName || options.name || 'my-project',
      containerName: options.container || projectName,
      image: options.image || `localhost/${projectName}:latest`,
      port: parseInt(options.containerPort) || 3000,
      hostPort: parseInt(options.port) || 3000,
      environment: options.environment || 'production',
      envVars: options.env ? JSON.parse(options.env) : {},
      volumes: options.volumes ? options.volumes.split(',') : [],
      dependencies: options.depends ? options.depends.split(',') : []
    };

    let content = generateQuadletTemplate(config);

    // Validate and auto-convert for Podman compatibility
    const validation = validateQuadletContent(content, podmanVersion.major);

    if (!validation.valid && podmanVersion.major < 5) {
      const { converted, changes } = convertQuadletForCompatibility(content, podmanVersion.major);
      if (changes.length > 0) {
        console.log(chalk.cyan(`\n   Auto-converting for Podman ${podmanVersion.major}.x:`));
        changes.forEach(change => console.log(chalk.gray(`   - ${change}`)));
        content = converted;
      }
    }

    const outputDir = options.output || '.';
    const quadletDir = join(outputDir, 'quadlet');
    await mkdir(quadletDir, { recursive: true });

    const filename = `${config.containerName}.container`;
    const filePath = join(quadletDir, filename);
    await writeFile(filePath, content);

    spinner.succeed(`Quadlet file generated: ${filePath}`);

    console.log(chalk.green('\n Quadlet Generation Complete\n'));
    console.log(chalk.gray('Generated file:'));
    console.log(chalk.cyan(`  - ${filePath}`));

    console.log(chalk.yellow('\n Next steps:'));
    console.log(chalk.gray('  1. Copy to server: scp quadlet/*.container root@server:/etc/containers/systemd/'));
    console.log(chalk.gray('  2. Reload daemon: systemctl daemon-reload'));
    console.log(chalk.gray('  3. Start service: systemctl start ' + filename.replace('.container', '.service')));
    console.log();

  } catch (error) {
    spinner.fail('Quadlet generation failed');
    console.log(chalk.red(`\n Error: ${error.message}\n`));
    process.exit(1);
  }
}

// ============================================================================
// GitHub Actions Generation
// ============================================================================

async function generateGitHubActionsCommand(projectName, options) {
  const spinner = ora('Generating GitHub Actions workflow...').start();

  try {
    const config = {
      projectName: projectName || options.name || 'my-project',
      projectType: options.type || 'nextjs',
      ports: {
        staging: parseInt(options.stagingPort) || 3001,
        production: parseInt(options.productionPort) || 3000
      },
      domains: {
        staging: options.stagingDomain || `${projectName}-staging.codeb.kr`,
        production: options.productionDomain || `${projectName}.codeb.kr`
      },
      includeTests: options.tests !== false,
      includeLint: options.lint !== false,
      useQuadlet: options.quadlet !== false
    };

    const content = generateGitHubActionsWorkflow(config);

    const outputDir = options.output || '.';
    const ghDir = join(outputDir, '.github', 'workflows');
    await mkdir(ghDir, { recursive: true });

    const filePath = join(ghDir, 'deploy.yml');
    await writeFile(filePath, content);

    spinner.succeed(`GitHub Actions workflow generated: ${filePath}`);

    console.log(chalk.green('\n GitHub Actions Generation Complete\n'));
    console.log(chalk.gray('Generated file:'));
    console.log(chalk.cyan(`  - ${filePath}`));

    console.log(chalk.yellow('\n Next steps:'));
    console.log(chalk.gray('  1. Add GitHub Secrets: SSH_HOST, SSH_USER, SSH_PRIVATE_KEY'));
    console.log(chalk.gray('  2. Push to GitHub to trigger deployment'));
    console.log();

  } catch (error) {
    spinner.fail('GitHub Actions generation failed');
    console.log(chalk.red(`\n Error: ${error.message}\n`));
    process.exit(1);
  }
}

// ============================================================================
// Dockerfile Generation
// ============================================================================

async function generateDockerfileCommand(projectType, options) {
  const spinner = ora('Generating Dockerfile...').start();

  try {
    const type = projectType || options.type || 'nextjs';
    const content = generateDockerfile({ projectType: type });

    const outputDir = options.output || '.';
    const filePath = join(outputDir, 'Dockerfile');

    if (existsSync(filePath) && !options.force) {
      spinner.fail('Dockerfile already exists');
      console.log(chalk.yellow('\nUse --force to overwrite'));
      return;
    }

    await writeFile(filePath, content);

    spinner.succeed(`Dockerfile generated: ${filePath}`);

    console.log(chalk.green('\n Dockerfile Generation Complete\n'));
    console.log(chalk.gray(`Project type: ${type}`));
    console.log(chalk.gray('Generated file:'));
    console.log(chalk.cyan(`  - ${filePath}`));
    console.log();

  } catch (error) {
    spinner.fail('Dockerfile generation failed');
    console.log(chalk.red(`\n Error: ${error.message}\n`));
    process.exit(1);
  }
}

// ============================================================================
// Update Workflow
// ============================================================================

async function updateWorkflow(projectName, options) {
  const spinner = ora('Updating workflow configuration...').start();

  try {
    // Read existing files and update as needed
    const quadletDir = 'quadlet';
    const ghPath = '.github/workflows/deploy.yml';

    let updated = [];

    // Update Quadlet files if they exist
    if (existsSync(quadletDir)) {
      const files = readdirSync(quadletDir).filter(f => f.endsWith('.container'));
      for (const file of files) {
        const filePath = join(quadletDir, file);
        const content = await readFile(filePath, 'utf-8');

        // Add version comment if missing
        if (!content.includes('Generated by CodeB CLI')) {
          const newContent = `# Generated by CodeB CLI v${getCliVersion()}\n${content}`;
          await writeFile(filePath, newContent);
          updated.push(filePath);
        }
      }
    }

    // Update GitHub Actions if it exists
    if (existsSync(ghPath)) {
      const content = await readFile(ghPath, 'utf-8');

      // Check if it's an old version
      const versionMatch = content.match(/Generated by CodeB CLI v([\d.]+)/);
      const currentVersion = getCliVersion();

      if (!versionMatch || versionMatch[1] !== currentVersion) {
        console.log(chalk.yellow(`\n Found older workflow version: ${versionMatch?.[1] || 'unknown'}`));
        console.log(chalk.gray(`   Current version: ${currentVersion}`));
        console.log(chalk.gray('   Consider running "we workflow migrate" to update\n'));
      }
    }

    spinner.succeed('Update check complete');

    if (updated.length > 0) {
      console.log(chalk.green('\n Files Updated:\n'));
      updated.forEach(f => console.log(chalk.cyan(`  - ${f}`)));
    } else {
      console.log(chalk.green('\n All files are up to date\n'));
    }

  } catch (error) {
    spinner.fail('Update failed');
    console.log(chalk.red(`\n Error: ${error.message}\n`));
    process.exit(1);
  }
}

// ============================================================================
// Port Validation (GitOps PortGuard)
// ============================================================================

async function portValidateWorkflow(target, options) {
  const spinner = ora('Validating port allocation...').start();

  try {
    const serverHost = options.host || getServerHost();
    const serverUser = options.user || getServerUser();
    const { execSync } = await import('child_process');

    // Parse target: project:port:environment format or just project
    let projectName = target;
    let port = options.port ? parseInt(options.port) : null;
    let environment = options.environment || 'staging';

    if (target && target.includes(':')) {
      const parts = target.split(':');
      projectName = parts[0];
      port = parts[1] ? parseInt(parts[1]) : port;
      environment = parts[2] || environment;
    }

    spinner.text = 'Loading port manifest from server...';

    // Get port manifest from server
    let manifest = { ports: {} };
    try {
      const manifestCmd = `ssh ${serverUser}@${serverHost} "cat /opt/codeb/config/port-manifest.yaml 2>/dev/null"`;
      const output = execSync(manifestCmd, { encoding: 'utf-8', timeout: 30000 });
      // Simple YAML parsing
      const lines = output.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*(\d+):\s*(.+)$/);
        if (match) {
          manifest.ports[parseInt(match[1])] = match[2].trim();
        }
      }
    } catch { /* manifest not found */ }

    // Scan actual port usage
    spinner.text = 'Scanning actual port usage...';
    const portScan = await scanServerPorts(serverHost, serverUser);

    spinner.stop();

    console.log(chalk.blue.bold('\n Port Validation Results\n'));

    if (port) {
      // Validate specific port
      const result = validatePort(port, projectName, environment, manifest, portScan);

      if (result.valid) {
        console.log(chalk.green(` Port ${port} is available for ${projectName} (${environment})`));
      } else {
        console.log(chalk.red(` Port ${port} conflict:`));
        console.log(chalk.gray(`   ${result.reason}`));

        // Find alternative
        const alternative = findSafePort(environment, projectName, manifest, portScan);
        if (alternative) {
          console.log(chalk.yellow(`   Suggested alternative: ${alternative}`));
        }
      }
    } else {
      // Show port summary
      const ranges = PORT_RANGES[environment] || PORT_RANGES.staging;
      console.log(chalk.gray(`Environment: ${environment}`));
      console.log(chalk.gray(`Port range: ${ranges.app.start}-${ranges.app.end}`));
      console.log(chalk.gray(`Used ports: ${portScan.usedPorts.length}`));

      if (Object.keys(manifest.ports).length > 0) {
        console.log(chalk.gray('\nManifest allocations:'));
        for (const [p, owner] of Object.entries(manifest.ports)) {
          const inUse = portScan.usedPorts.includes(parseInt(p));
          const status = inUse ? chalk.green('') : chalk.red('');
          console.log(chalk.gray(`  ${p}: ${owner} ${status}`));
        }
      }
    }

    console.log();

  } catch (error) {
    spinner.fail('Port validation failed');
    console.log(chalk.red(`\n Error: ${error.message}\n`));
    process.exit(1);
  }
}

// ============================================================================
// Port Drift Detection
// ============================================================================

async function portDriftWorkflow(target, options) {
  const spinner = ora('Detecting port drift...').start();

  try {
    const serverHost = options.host || getServerHost();
    const serverUser = options.user || getServerUser();

    // Scan server and compare with manifest
    const portScan = await scanServerPorts(serverHost, serverUser);

    spinner.stop();

    console.log(chalk.blue.bold('\n Port Drift Analysis\n'));

    const drifts = [];

    // Check for ports in manifest but not in use
    if (portScan.manifest) {
      for (const [port, owner] of Object.entries(portScan.manifest)) {
        const portNum = parseInt(port);
        if (!portScan.usedPorts.includes(portNum)) {
          drifts.push({ type: 'unused', port: portNum, owner, message: `Port ${port} allocated to ${owner} but not in use` });
        }
      }
    }

    // Check for ports in use but not in manifest
    for (const port of portScan.usedPorts) {
      if (port >= 3000 && port < 6000) { // App port range
        const owner = portScan.manifest?.[port];
        if (!owner) {
          const process = portScan.processes?.[port] || 'unknown';
          drifts.push({ type: 'untracked', port, process, message: `Port ${port} in use by ${process} but not in manifest` });
        }
      }
    }

    if (drifts.length === 0) {
      console.log(chalk.green(' No drift detected - manifest matches actual state\n'));
    } else {
      console.log(chalk.yellow(` ${drifts.length} drift(s) detected:\n`));

      for (const drift of drifts) {
        if (drift.type === 'unused') {
          console.log(chalk.yellow(`   Port ${drift.port}: Allocated to "${drift.owner}" but not in use`));
        } else {
          console.log(chalk.red(`   Port ${drift.port}: In use by "${drift.process}" but not in manifest`));
        }
      }

      console.log(chalk.gray('\nRecommendation: Update manifest or investigate untracked services'));
    }

    console.log();

  } catch (error) {
    spinner.fail('Drift detection failed');
    console.log(chalk.red(`\n Error: ${error.message}\n`));
    process.exit(1);
  }
}

// ============================================================================
// Quadlet Validation
// ============================================================================

async function validateQuadletWorkflow(target, options) {
  const spinner = ora('Validating Quadlet files...').start();

  try {
    const serverHost = options.host || getServerHost();
    const serverUser = options.user || getServerUser();

    // Get server Podman version
    const podmanVersion = await getPodmanVersion(serverHost, serverUser);

    spinner.stop();

    console.log(chalk.blue.bold('\n Quadlet Validation\n'));
    console.log(chalk.gray(`Server Podman version: ${podmanVersion.full}`));

    // Find Quadlet files
    const quadletDir = 'quadlet';
    if (!existsSync(quadletDir)) {
      console.log(chalk.yellow('\n No quadlet directory found\n'));
      return;
    }

    const files = readdirSync(quadletDir).filter(f => f.endsWith('.container'));
    if (files.length === 0) {
      console.log(chalk.yellow('\n No .container files found\n'));
      return;
    }

    let allValid = true;

    for (const file of files) {
      const filePath = join(quadletDir, file);
      const content = await readFile(filePath, 'utf-8');

      const validation = validateQuadletContent(content, podmanVersion.major);

      if (validation.valid) {
        console.log(chalk.green(`  ${file}`));
      } else {
        allValid = false;
        console.log(chalk.red(`  ${file}`));

        for (const issue of validation.unsupportedKeys) {
          console.log(chalk.gray(`    Line ${issue.line}: '${issue.key}' not supported`));
          if (issue.alternative) {
            console.log(chalk.gray(`    -> Use: ${issue.alternative}`));
          }
        }
      }
    }

    if (allValid) {
      console.log(chalk.green('\n All files valid for Podman ' + podmanVersion.full + '\n'));
    } else {
      console.log(chalk.yellow('\n Some files have compatibility issues'));
      console.log(chalk.gray('   Run "we workflow sync" to auto-convert\n'));
    }

  } catch (error) {
    spinner.fail('Validation failed');
    console.log(chalk.red(`\n Error: ${error.message}\n`));
    process.exit(1);
  }
}

// ============================================================================
// GitHub Secrets Registration
// ============================================================================

async function registerGitHubSecrets(projectName, options) {
  const spinner = ora('Registering GitHub Secrets...').start();

  try {
    const { execSync } = await import('child_process');
    const serverHost = options.host || getServerHost();
    const serverUser = options.user || getServerUser();

    // Check gh CLI
    try {
      execSync('gh auth status', { stdio: 'pipe', timeout: 5000 });
    } catch {
      spinner.fail('GitHub CLI not authenticated');
      console.log(chalk.yellow('\nRun "gh auth login" first'));
      return;
    }

    // Get repo info
    const remoteUrl = execSync('git remote get-url origin 2>/dev/null || echo ""', { encoding: 'utf-8' }).trim();
    const repoMatch = remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);

    if (!repoMatch) {
      spinner.fail('Not a GitHub repository');
      return;
    }

    const repoFullName = repoMatch[1].replace(/\.git$/, '');
    spinner.text = `Registering secrets for ${repoFullName}...`;

    // Check existing secrets
    const existingSecrets = execSync(`gh secret list -R ${repoFullName} 2>/dev/null || echo ""`, { encoding: 'utf-8' });

    const secrets = [
      { name: 'SSH_HOST', value: serverHost || '158.247.203.55' },
      { name: 'SSH_USER', value: serverUser || 'root' }
    ];

    for (const secret of secrets) {
      if (!existingSecrets.includes(secret.name)) {
        execSync(`gh secret set ${secret.name} -R ${repoFullName} -b "${secret.value}"`, { stdio: 'pipe', timeout: 10000 });
        console.log(chalk.green(`  ${secret.name} registered`));
      } else {
        console.log(chalk.gray(`  ${secret.name} (already exists)`));
      }
    }

    // SSH key
    if (!existingSecrets.includes('SSH_PRIVATE_KEY')) {
      const sshKeyPath = process.env.HOME + '/.ssh/id_ed25519';
      if (existsSync(sshKeyPath)) {
        const sshKey = await readFile(sshKeyPath, 'utf-8');
        execSync(`gh secret set SSH_PRIVATE_KEY -R ${repoFullName} -b "${sshKey.replace(/"/g, '\\"')}"`, { stdio: 'pipe', timeout: 10000 });
        console.log(chalk.green(`   SSH_PRIVATE_KEY registered`));
      } else {
        console.log(chalk.yellow(`   SSH_PRIVATE_KEY: Key file not found`));
      }
    } else {
      console.log(chalk.gray(`   SSH_PRIVATE_KEY (already exists)`));
    }

    spinner.succeed('GitHub Secrets registered');

    console.log(chalk.green('\n Secrets Registration Complete\n'));
    console.log(chalk.gray(`Repository: ${repoFullName}`));
    console.log();

  } catch (error) {
    spinner.fail('Secrets registration failed');
    console.log(chalk.red(`\n Error: ${error.message}\n`));
    process.exit(1);
  }
}
