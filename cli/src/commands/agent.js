/**
 * Agent Command
 *
 * Direct invocation of 7-Agent system via Task tool
 * Supports: all agent types, context passing, async execution
 */

import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import { executeAgent } from '../lib/agent-executor.js';

const AGENT_TYPES = {
  master: {
    name: 'master-orchestrator',
    description: 'Project-wide orchestration and coordination',
    icon: '👑'
  },
  api: {
    name: 'api-contract-guardian',
    description: 'API design and contract definition',
    icon: '🔖'
  },
  frontend: {
    name: 'frontend-specialist',
    description: 'Full-stack frontend development',
    icon: '🎨'
  },
  db: {
    name: 'db-schema-architect',
    description: 'Database design and optimization',
    icon: '💾'
  },
  e2e: {
    name: 'e2e-test-strategist',
    description: 'Comprehensive test planning',
    icon: '🧪'
  },
  admin: {
    name: 'admin-panel-builder',
    description: 'Administrative interface development',
    icon: '🛡️'
  },
  all: {
    name: 'all-agents',
    description: 'Invoke all agents sequentially',
    icon: '🤖'
  }
};

export async function agent(type, task, options) {
  const { context, output, save, async } = options;

  // Validate agent type
  if (!AGENT_TYPES[type]) {
    console.log(chalk.red(`\n❌ Unknown agent type: ${type}\n`));
    console.log(chalk.yellow('Available agents:'));
    Object.entries(AGENT_TYPES).forEach(([key, agent]) => {
      console.log(chalk.gray(`  ${agent.icon} ${key.padEnd(10)} - ${agent.description}`));
    });
    console.log();
    process.exit(1);
  }

  const agentInfo = AGENT_TYPES[type];

  console.log(chalk.blue.bold(`\n${agentInfo.icon} Invoking ${agentInfo.name}\n`));
  console.log(chalk.gray(`Task: ${task}`));

  // Parse context if provided
  let contextObj = {};
  if (context) {
    try {
      contextObj = JSON.parse(context);
      console.log(chalk.gray(`Context: ${JSON.stringify(contextObj, null, 2)}`));
    } catch (error) {
      console.log(chalk.red('\n❌ Invalid JSON context\n'));
      process.exit(1);
    }
  }

  if (async) {
    console.log(chalk.yellow('\n⏳ Running in async mode...\n'));

    // Start async execution
    executeAgent({
      type: agentInfo.name,
      task: task,
      context: contextObj
    }).then(result => {
      console.log(chalk.green('✅ Agent execution completed'));
      if (save) {
        fs.writeFile(save, JSON.stringify(result, null, 2), 'utf8');
      }
    }).catch(error => {
      console.log(chalk.red(`❌ Agent execution failed: ${error.message}`));
    });

    console.log(chalk.gray('Agent is running in background'));
    console.log(chalk.gray('Results will be available when complete\n'));
    return;
  }

  const spinner = ora('Agent working...').start();

  try {
    let result;

    if (type === 'all') {
      // Execute all agents sequentially
      spinner.text = 'Executing all agents sequentially...';
      result = await executeAllAgents(task, contextObj);
    } else {
      // Execute single agent
      result = await executeAgent({
        type: agentInfo.name,
        task: task,
        context: contextObj
      });
    }

    spinner.succeed('Agent execution completed');

    // Format output
    let formattedOutput;
    if (output === 'json') {
      formattedOutput = JSON.stringify(result, null, 2);
    } else {
      formattedOutput = formatAgentOutput(result, agentInfo);
    }

    // Display result
    console.log(chalk.cyan('\n📊 Agent Output:\n'));
    console.log(formattedOutput);

    // Save if requested
    if (save) {
      spinner.start(`Saving output to ${save}...`);
      await fs.writeFile(save, formattedOutput, 'utf8');
      spinner.succeed(`Output saved to ${save}`);
    }

    // Display summary
    if (result.summary) {
      console.log(chalk.cyan('\n📈 Summary:'));
      console.log(chalk.gray(`  Status: ${result.status}`));
      console.log(chalk.gray(`  Files affected: ${result.filesAffected || 0}`));
      console.log(chalk.gray(`  Duration: ${result.duration || 'N/A'}`));
    }

    console.log();

  } catch (error) {
    spinner.fail('Agent execution failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));

    console.log(chalk.yellow('💡 Troubleshooting tips:'));
    console.log(chalk.gray('  • Verify task description is clear'));
    console.log(chalk.gray('  • Check agent availability'));
    console.log(chalk.gray('  • Try with simpler task first'));
    console.log(chalk.gray('  • Use --context for additional info'));
    console.log();

    process.exit(1);
  }
}

async function executeAllAgents(task, context) {
  const results = {};
  const agentOrder = ['master', 'api', 'db', 'frontend', 'e2e', 'admin'];

  for (const agentKey of agentOrder) {
    const agentInfo = AGENT_TYPES[agentKey];
    console.log(chalk.gray(`\n${agentInfo.icon} Running ${agentInfo.name}...`));

    try {
      results[agentKey] = await executeAgent({
        type: agentInfo.name,
        task: task,
        context: { ...context, previousResults: results }
      });
    } catch (error) {
      results[agentKey] = { error: error.message };
    }
  }

  return results;
}

function formatAgentOutput(result, agentInfo) {
  let output = '';

  output += chalk.bold(`${agentInfo.icon} ${agentInfo.name}\n`);
  output += chalk.gray('─'.repeat(50)) + '\n\n';

  if (result.status) {
    output += chalk.green(`Status: ${result.status}\n\n`);
  }

  if (result.artifacts) {
    output += chalk.cyan('📁 Artifacts:\n');
    if (result.artifacts.files) {
      output += chalk.gray(`  Files: ${result.artifacts.files.join(', ')}\n`);
    }
    if (result.artifacts.docs) {
      output += chalk.gray(`  Docs: ${result.artifacts.docs.join(', ')}\n`);
    }
    output += '\n';
  }

  if (result.validation) {
    output += chalk.cyan('✅ Validation:\n');
    output += chalk.gray(`  Tests passed: ${result.validation.tests_passed}\n`);
    output += chalk.gray(`  Quality score: ${result.validation.quality_score}\n`);

    if (result.validation.issues?.length > 0) {
      output += chalk.yellow('  Issues:\n');
      result.validation.issues.forEach(issue => {
        output += chalk.yellow(`    • ${issue}\n`);
      });
    }
    output += '\n';
  }

  if (result.next_steps) {
    output += chalk.cyan('🔜 Next Steps:\n');
    result.next_steps.forEach((step, idx) => {
      output += chalk.gray(`  ${idx + 1}. ${step}\n`);
    });
    output += '\n';
  }

  return output;
}
