/**
 * Formatters
 *
 * Output formatting utilities
 */

import chalk from 'chalk';

/**
 * Format analysis report
 */
export function formatAnalysisReport(result, format = 'text') {
  if (format === 'markdown') {
    return formatMarkdown(result);
  }

  return formatText(result);
}

function formatText(result) {
  let output = '';

  output += chalk.bold('Analysis Report\n');
  output += chalk.gray('═'.repeat(50)) + '\n\n';

  output += chalk.cyan('Overview:\n');
  output += `  Files analyzed: ${result.filesAnalyzed}\n`;
  output += `  Issues found: ${result.issuesFound}\n`;
  output += `  Agent: ${result.agent}\n\n`;

  if (result.issuesFound > 0) {
    output += chalk.cyan('Issues by Severity:\n');
    output += chalk.red(`  Critical: ${result.critical || 0}\n`);
    output += chalk.yellow(`  High: ${result.high || 0}\n`);
    output += chalk.blue(`  Medium: ${result.medium || 0}\n`);
    output += chalk.gray(`  Low: ${result.low || 0}\n\n`);
  }

  if (result.recommendations?.length > 0) {
    output += chalk.cyan('Top Recommendations:\n');
    result.recommendations.forEach((rec, idx) => {
      output += `  ${idx + 1}. ${rec}\n`;
    });
    output += '\n';
  }

  return output;
}

function formatMarkdown(result) {
  let output = '';

  output += '# Analysis Report\n\n';
  output += '## Overview\n\n';
  output += `- **Files analyzed**: ${result.filesAnalyzed}\n`;
  output += `- **Issues found**: ${result.issuesFound}\n`;
  output += `- **Agent**: ${result.agent}\n\n`;

  if (result.issuesFound > 0) {
    output += '## Issues by Severity\n\n';
    output += `- **Critical**: ${result.critical || 0}\n`;
    output += `- **High**: ${result.high || 0}\n`;
    output += `- **Medium**: ${result.medium || 0}\n`;
    output += `- **Low**: ${result.low || 0}\n\n`;
  }

  if (result.recommendations?.length > 0) {
    output += '## Recommendations\n\n';
    result.recommendations.forEach((rec, idx) => {
      output += `${idx + 1}. ${rec}\n`;
    });
    output += '\n';
  }

  return output;
}

/**
 * Format health report
 */
export function formatHealthReport(healthData) {
  // Implementation for health report formatting
  return JSON.stringify(healthData, null, 2);
}
