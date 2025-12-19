/**
 * Project Command
 *
 * Manages projects via CodeB Project Generator API
 * - Create new projects with auto-generated infrastructure
 * - List existing projects
 * - Update project configuration
 * - Delete projects
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const API_URL = process.env.CODEB_API_URL || 'http://localhost:3200';

/**
 * Main project command handler
 */
export async function project(action, name, options) {
  switch (action) {
    case 'create':
      await createProject(name, options);
      break;
    case 'list':
      await listProjects(options);
      break;
    case 'info':
      await projectInfo(name, options);
      break;
    case 'delete':
      await deleteProject(name, options);
      break;
    case 'types':
      await listTypes(options);
      break;
    default:
      console.log(chalk.red(`Unknown action: ${action}`));
      console.log(chalk.gray('Available actions: create, list, info, delete, types'));
  }
}

/**
 * Create a new project
 */
async function createProject(name, options) {
  const spinner = ora('Creating project...').start();

  try {
    // Interactive mode if no name provided
    if (!name) {
      spinner.stop();
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Project name:',
          validate: (input) => {
            if (!input) return 'Project name is required';
            if (!/^[a-z0-9-]+$/.test(input)) {
              return 'Name must be lowercase letters, numbers, and hyphens only';
            }
            return true;
          }
        },
        {
          type: 'list',
          name: 'type',
          message: 'Project type:',
          choices: [
            { name: 'Next.js 14+', value: 'nextjs' },
            { name: 'Node.js (Express/Fastify)', value: 'nodejs' },
            { name: 'Python (FastAPI/Flask)', value: 'python' },
            { name: 'Static Site (Nginx)', value: 'static' }
          ],
          default: 'nextjs'
        },
        {
          type: 'input',
          name: 'gitRepo',
          message: 'Git repository URL (optional):',
          default: ''
        },
        {
          type: 'confirm',
          name: 'database',
          message: 'Include PostgreSQL database?',
          default: true
        },
        {
          type: 'confirm',
          name: 'redis',
          message: 'Include Redis cache?',
          default: true
        },
        {
          type: 'input',
          name: 'description',
          message: 'Project description (optional):',
          default: ''
        }
      ]);

      name = answers.name;
      options.type = answers.type;
      options.gitRepo = answers.gitRepo;
      options.database = answers.database;
      options.redis = answers.redis;
      options.description = answers.description;

      spinner.start('Creating project...');
    }

    // Call Project Generator API
    const response = await fetch(`${API_URL}/api/project/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        type: options.type || 'nextjs',
        gitRepo: options.gitRepo || '',
        database: options.database !== false,
        redis: options.redis !== false,
        description: options.description || ''
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    const result = await response.json();
    spinner.succeed('Project created successfully!');

    // Display project info
    console.log('');
    console.log(chalk.cyan.bold('Project Information:'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.white(`Name:        ${result.data.project.name}`));
    console.log(chalk.white(`Type:        ${result.data.project.type}`));
    console.log(chalk.white(`Created:     ${new Date(result.data.project.createdAt).toLocaleString()}`));

    console.log('');
    console.log(chalk.cyan.bold('Port Allocations:'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.white('Staging:'));
    console.log(chalk.gray(`  App:       ${result.data.ports.staging.app}`));
    if (result.data.ports.staging.db) {
      console.log(chalk.gray(`  PostgreSQL: ${result.data.ports.staging.db}`));
    }
    if (result.data.ports.staging.redis) {
      console.log(chalk.gray(`  Redis:      ${result.data.ports.staging.redis}`));
    }

    console.log(chalk.white('Production:'));
    console.log(chalk.gray(`  App:       ${result.data.ports.production.app}`));
    if (result.data.ports.production.db) {
      console.log(chalk.gray(`  PostgreSQL: ${result.data.ports.production.db}`));
    }
    if (result.data.ports.production.redis) {
      console.log(chalk.gray(`  Redis:      ${result.data.ports.production.redis}`));
    }

    console.log('');
    console.log(chalk.cyan.bold('Deployment URLs:'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.green(`Staging:    ${result.data.deployment.staging.url}`));
    console.log(chalk.green(`Production: ${result.data.deployment.production.url}`));

    // Save files to disk if --save option provided
    if (options.save !== false) {
      spinner.start('Saving generated files...');

      const outputDir = options.output || process.cwd();
      await mkdir(outputDir, { recursive: true });

      for (const [filePath, content] of Object.entries(result.data.files)) {
        const fullPath = join(outputDir, filePath);
        const dir = join(fullPath, '..');
        await mkdir(dir, { recursive: true });
        await writeFile(fullPath, content, 'utf-8');
      }

      spinner.succeed(`Files saved to: ${outputDir}`);
    }

    console.log('');
    console.log(chalk.yellow.bold('Next Steps:'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.white('1. Copy generated files to your repository'));
    console.log(chalk.white('2. Configure environment variables'));
    console.log(chalk.white('3. Push to GitHub to trigger deployment'));
    console.log('');
    console.log(chalk.cyan('  $ git add .'));
    console.log(chalk.cyan('  $ git commit -m "Add CodeB infrastructure"'));
    console.log(chalk.cyan('  $ git push origin main'));
    console.log('');

  } catch (error) {
    spinner.fail('Failed to create project');
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

/**
 * List all projects
 */
async function listProjects(options) {
  const spinner = ora('Fetching projects...').start();

  try {
    // This would typically call SSOT API
    const ssotUrl = process.env.SSOT_URL || 'http://localhost:3102';
    const response = await fetch(`${ssotUrl}/api/projects`);

    if (!response.ok) {
      throw new Error('Failed to fetch projects');
    }

    const result = await response.json();
    spinner.succeed('Projects loaded');

    if (!result.data || result.data.length === 0) {
      console.log(chalk.yellow('\nNo projects found. Create one with:'));
      console.log(chalk.cyan('  $ we project create my-app\n'));
      return;
    }

    console.log('');
    console.log(chalk.cyan.bold('Projects:'));
    console.log(chalk.gray('─'.repeat(80)));

    result.data.forEach((project, index) => {
      console.log(chalk.white(`${index + 1}. ${project.id}`));
      console.log(chalk.gray(`   Type: ${project.type}`));
      console.log(chalk.gray(`   Status: ${project.status}`));
      console.log(chalk.gray(`   Created: ${new Date(project.createdAt).toLocaleDateString()}`));

      if (project.environments?.staging?.domain) {
        console.log(chalk.green(`   Staging: https://${project.environments.staging.domain}`));
      }
      if (project.environments?.production?.domain) {
        console.log(chalk.green(`   Production: https://${project.environments.production.domain}`));
      }
      console.log('');
    });

  } catch (error) {
    spinner.fail('Failed to fetch projects');
    console.error(chalk.red(`Error: ${error.message}`));
  }
}

/**
 * Get project information
 */
async function projectInfo(name, options) {
  if (!name) {
    console.log(chalk.red('Project name is required'));
    console.log(chalk.gray('Usage: we project info <name>'));
    return;
  }

  const spinner = ora(`Fetching project: ${name}...`).start();

  try {
    const response = await fetch(`${API_URL}/api/project/${name}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Project '${name}' not found`);
      }
      throw new Error('Failed to fetch project info');
    }

    const result = await response.json();
    spinner.succeed('Project loaded');

    const project = result.data;

    console.log('');
    console.log(chalk.cyan.bold(`Project: ${project.id}`));
    console.log(chalk.gray('═'.repeat(80)));
    console.log('');

    console.log(chalk.white.bold('General:'));
    console.log(chalk.gray(`  Type:       ${project.type}`));
    console.log(chalk.gray(`  Status:     ${project.status}`));
    console.log(chalk.gray(`  Created:    ${new Date(project.createdAt).toLocaleString()}`));
    if (project.description) {
      console.log(chalk.gray(`  Description: ${project.description}`));
    }

    if (project.environments) {
      console.log('');
      console.log(chalk.white.bold('Environments:'));

      for (const [envName, env] of Object.entries(project.environments)) {
        console.log('');
        console.log(chalk.cyan(`  ${envName.toUpperCase()}:`));
        console.log(chalk.gray(`    URL:    ${env.domain ? `https://${env.domain}` : 'Not configured'}`));
        console.log(chalk.gray(`    Status: ${env.status || 'unknown'}`));

        if (env.ports) {
          console.log(chalk.gray('    Ports:'));
          if (env.ports.app) console.log(chalk.gray(`      App:  ${env.ports.app}`));
          if (env.ports.db) console.log(chalk.gray(`      DB:   ${env.ports.db}`));
          if (env.ports.redis) console.log(chalk.gray(`      Redis: ${env.ports.redis}`));
        }
      }
    }

    if (project.resources) {
      console.log('');
      console.log(chalk.white.bold('Resources:'));
      if (project.resources.database) {
        console.log(chalk.green('  ✓ PostgreSQL'));
      }
      if (project.resources.redis) {
        console.log(chalk.green('  ✓ Redis'));
      }
      if (project.resources.storage) {
        console.log(chalk.green('  ✓ Storage'));
      }
    }

    console.log('');

  } catch (error) {
    spinner.fail('Failed to fetch project info');
    console.error(chalk.red(`Error: ${error.message}`));
  }
}

/**
 * Delete a project
 */
async function deleteProject(name, options) {
  if (!name) {
    console.log(chalk.red('Project name is required'));
    console.log(chalk.gray('Usage: we project delete <name>'));
    return;
  }

  // Confirmation prompt
  if (!options.force) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: chalk.yellow(`Are you sure you want to delete project '${name}'? This action cannot be undone.`),
        default: false
      }
    ]);

    if (!confirm) {
      console.log(chalk.gray('Cancelled.'));
      return;
    }
  }

  const spinner = ora(`Deleting project: ${name}...`).start();

  try {
    // This would call SSOT API to deregister project
    // and optionally clean up containers/volumes

    spinner.fail('Project deletion not yet implemented');
    console.log(chalk.yellow('To manually delete:'));
    console.log(chalk.gray('1. Stop containers: we workflow stop ' + name));
    console.log(chalk.gray('2. Remove from SSOT: we ssot remove ' + name));
    console.log(chalk.gray('3. Clean volumes: podman volume rm ' + name + '-*'));

  } catch (error) {
    spinner.fail('Failed to delete project');
    console.error(chalk.red(`Error: ${error.message}`));
  }
}

/**
 * List available project types
 */
async function listTypes(options) {
  const spinner = ora('Fetching project types...').start();

  try {
    const response = await fetch(`${API_URL}/api/project/types`);

    if (!response.ok) {
      throw new Error('Failed to fetch project types');
    }

    const result = await response.json();
    spinner.succeed('Project types loaded');

    console.log('');
    console.log(chalk.cyan.bold('Available Project Types:'));
    console.log(chalk.gray('─'.repeat(80)));

    result.data.forEach((type, index) => {
      console.log('');
      console.log(chalk.white.bold(`${index + 1}. ${type.name}`));
      console.log(chalk.gray(`   ID:          ${type.id}`));
      console.log(chalk.gray(`   Default Port: ${type.port}`));
      console.log(chalk.gray(`   Health Check: ${type.healthcheck}`));
    });

    console.log('');
    console.log(chalk.yellow('Usage:'));
    console.log(chalk.cyan('  $ we project create my-app --type nextjs'));
    console.log('');

  } catch (error) {
    spinner.fail('Failed to fetch project types');
    console.error(chalk.red(`Error: ${error.message}`));
  }
}

export default project;
