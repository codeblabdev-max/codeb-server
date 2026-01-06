/**
 * Analyze Command
 *
 * Invokes 7-Agent system for comprehensive project analysis
 * Supports: depth levels, focus areas, agent selection
 */

import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import { executeAgent } from '../lib/agent-executor.js';
import { formatAnalysisReport } from '../lib/formatters.js';

const AGENT_TYPES = {
  master: 'master-orchestrator',
  api: 'api-contract-guardian',
  frontend: 'frontend-specialist',
  db: 'db-schema-architect',
  e2e: 'e2e-test-strategist',
  admin: 'admin-panel-builder'
};

const DEPTH_CONFIGS = {
  shallow: {
    maxFiles: 10,
    maxDepth: 2,
    detailLevel: 'summary'
  },
  normal: {
    maxFiles: 50,
    maxDepth: 5,
    detailLevel: 'standard'
  },
  deep: {
    maxFiles: 200,
    maxDepth: 10,
    detailLevel: 'comprehensive'
  }
};

const FOCUS_AREAS = {
  security: ['vulnerabilities', 'auth', 'encryption', 'permissions'],
  performance: ['bottlenecks', 'optimization', 'caching', 'queries'],
  quality: ['maintainability', 'complexity', 'duplicates', 'standards'],
  all: ['security', 'performance', 'quality', 'architecture']
};

export async function analyze(target, options) {
  const { depth, focus, agent, output, save } = options;

  console.log(chalk.blue.bold(`\n🔍 CodeB Analysis\n`));
  console.log(chalk.gray(`Target: ${target || 'current project'}`));
  console.log(chalk.gray(`Depth: ${depth}`));
  console.log(chalk.gray(`Focus: ${focus}`));
  console.log(chalk.gray(`Agent: ${agent}`));

  const spinner = ora('Initializing analysis...').start();

  try {
    // Get depth configuration
    const depthConfig = DEPTH_CONFIGS[depth] || DEPTH_CONFIGS.normal;

    // Get focus areas
    const focusAreas = FOCUS_AREAS[focus] || FOCUS_AREAS.all;

    // Prepare analysis context
    const analysisContext = {
      target: target || process.cwd(),
      depth: depthConfig,
      focus: focusAreas,
      timestamp: new Date().toISOString()
    };

    spinner.text = `Running ${agent} agent analysis...`;

    // Execute agent via Task tool
    const agentType = AGENT_TYPES[agent] || AGENT_TYPES.master;
    const analysisResult = await executeAgent({
      type: agentType,
      task: `Analyze project with focus on: ${focusAreas.join(', ')}`,
      context: analysisContext,
      options: {
        depth: depth,
        detailLevel: depthConfig.detailLevel
      }
    });

    spinner.succeed('Analysis completed');

    // Format report based on output type
    let formattedReport;
    switch (output) {
      case 'json':
        formattedReport = JSON.stringify(analysisResult, null, 2);
        break;
      case 'markdown':
        formattedReport = formatAnalysisReport(analysisResult, 'markdown');
        break;
      default:
        formattedReport = formatAnalysisReport(analysisResult, 'text');
    }

    // Display report
    console.log(chalk.cyan('\n📊 Analysis Report:\n'));
    console.log(formattedReport);

    // Save if requested
    if (save) {
      spinner.start(`Saving report to ${save}...`);
      await fs.writeFile(save, formattedReport, 'utf8');
      spinner.succeed(`Report saved to ${save}`);
    }

    // Display summary
    console.log(chalk.cyan('\n📈 Summary:'));
    console.log(chalk.gray(`  Files analyzed: ${analysisResult.filesAnalyzed}`));
    console.log(chalk.gray(`  Issues found: ${analysisResult.issuesFound}`));
    console.log(chalk.gray(`  Critical: ${analysisResult.critical || 0}`));
    console.log(chalk.gray(`  High: ${analysisResult.high || 0}`));
    console.log(chalk.gray(`  Medium: ${analysisResult.medium || 0}`));
    console.log(chalk.gray(`  Low: ${analysisResult.low || 0}`));

    // Recommendations
    if (analysisResult.recommendations?.length > 0) {
      console.log(chalk.yellow('\n💡 Recommendations:'));
      analysisResult.recommendations.slice(0, 5).forEach((rec, idx) => {
        console.log(chalk.yellow(`  ${idx + 1}. ${rec}`));
      });
    }

    console.log();

  } catch (error) {
    spinner.fail('Analysis failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));

    console.log(chalk.yellow('💡 Troubleshooting tips:'));
    console.log(chalk.gray('  • Verify target path exists'));
    console.log(chalk.gray('  • Check agent availability'));
    console.log(chalk.gray('  • Try with --depth shallow'));
    console.log(chalk.gray('  • Use --agent master for overview'));
    console.log();

    process.exit(1);
  }
}
