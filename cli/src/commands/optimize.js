/**
 * Optimize Command
 *
 * Performance and resource optimization
 * Supports: bundle, memory, database, all
 */

import chalk from 'chalk';
import ora from 'ora';
import { mcpClient } from '../lib/mcp-client.js';

export async function optimize(options) {
  const { target, aggressive, safeMode, dryRun } = options;

  console.log(chalk.blue.bold(`\n⚡ CodeB Optimization\n`));
  console.log(chalk.gray(`Target: ${target}`));
  console.log(chalk.gray(`Mode: ${aggressive ? 'aggressive' : safeMode ? 'safe' : 'normal'}`));

  if (dryRun) {
    console.log(chalk.yellow('⚠️  Dry run mode - showing plan only\n'));
  }

  const spinner = ora('Analyzing optimization opportunities...').start();

  try {
    const optimizations = await mcpClient.analyzeOptimizations(target);
    spinner.succeed('Analysis completed');

    console.log(chalk.cyan('\n📊 Optimization Opportunities:\n'));

    optimizations.forEach((opt, idx) => {
      const impact = getImpactIcon(opt.impact);
      console.log(chalk.bold(`  ${idx + 1}. ${opt.name}`));
      console.log(chalk.gray(`     ${impact} Impact: ${opt.impact}`));
      console.log(chalk.gray(`     💾 Savings: ${opt.savings}`));
      console.log(chalk.gray(`     ⏱️  Effort: ${opt.effort}`));
      console.log();
    });

    if (dryRun) {
      console.log(chalk.green('✅ Dry run completed\n'));
      return;
    }

    spinner.start('Applying optimizations...');

    const results = await mcpClient.applyOptimizations({
      target,
      aggressive,
      safeMode,
      optimizations: optimizations.map(o => o.id)
    });

    spinner.succeed('Optimizations applied');

    console.log(chalk.green('\n✅ Optimization Results:\n'));
    console.log(chalk.gray(`  Bundle size: ${results.bundleSize.before} → ${results.bundleSize.after} (${results.bundleSize.reduction})`));
    console.log(chalk.gray(`  Memory usage: ${results.memory.before} → ${results.memory.after} (${results.memory.reduction})`));
    console.log(chalk.gray(`  Load time: ${results.loadTime.before} → ${results.loadTime.after} (${results.loadTime.reduction})`));

    console.log(chalk.cyan('\n🎉 Total Savings:\n'));
    console.log(chalk.green(`  ${results.totalReduction} improvement\n`));

  } catch (error) {
    spinner.fail('Optimization failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

function getImpactIcon(impact) {
  switch (impact) {
    case 'high': return '🔥';
    case 'medium': return '⚡';
    case 'low': return '💡';
    default: return '📊';
  }
}
