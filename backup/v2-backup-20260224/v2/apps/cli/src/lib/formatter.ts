/**
 * @codeb/cli - Output Formatters
 *
 * Format API responses for terminal output.
 * Includes health reports, deploy results, slot status, tables.
 */

import chalk from 'chalk';

// ============================================================================
// Health Report
// ============================================================================

export function formatHealthReport(
  data: Record<string, unknown>,
  verbose = false,
): string {
  const lines: string[] = [];
  const status = data.status as string || 'unknown';
  const version = data.version as string || 'unknown';
  const uptime = data.uptime as number || 0;

  const statusColor = status === 'healthy' ? 'green' : status === 'degraded' ? 'yellow' : 'red';
  const statusIcon = status === 'healthy' ? '[OK]' : status === 'degraded' ? '[!!]' : '[XX]';

  lines.push('');
  lines.push(chalk[statusColor].bold(`  ${statusIcon} System Status: ${status.toUpperCase()}`));
  lines.push('');
  lines.push(chalk.gray(`  Version:  ${version}`));
  lines.push(chalk.gray(`  Uptime:   ${formatUptime(uptime)}`));

  // Memory info
  const memory = data.memory as Record<string, number> | undefined;
  if (memory) {
    lines.push(chalk.gray(`  Memory:   ${memory.heapUsed}MB / ${memory.heapTotal}MB heap, ${memory.rss}MB RSS`));
  }

  // Timestamp
  if (data.timestamp) {
    lines.push(chalk.gray(`  Checked:  ${data.timestamp}`));
  }

  // Update notice
  if (data.updateRequired) {
    lines.push('');
    lines.push(chalk.yellow(`  Update available: ${data.latestVersion}`));
    lines.push(chalk.gray(`  ${data.downloadUrl}`));
  }

  if (verbose) {
    lines.push('');
    lines.push(chalk.gray('  Full response:'));
    lines.push(chalk.gray('  ' + JSON.stringify(data, null, 2).replace(/\n/g, '\n  ')));
  }

  lines.push('');
  return lines.join('\n');
}

// ============================================================================
// Deploy Result
// ============================================================================

export function formatDeployResult(result: Record<string, unknown>): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.green('  Blue-Green Slot Deployment Summary:'));
  lines.push(chalk.gray(`  Project:    ${result.project || result.projectName || 'unknown'}`));
  lines.push(chalk.gray(`  Slot:       ${result.slot || 'unknown'}`));
  lines.push(chalk.gray(`  Port:       ${result.port || 'unknown'}`));

  if (result.container) {
    lines.push(chalk.gray(`  Container:  ${result.container}`));
  }

  if (result.version) {
    lines.push(chalk.gray(`  Version:    ${result.version}`));
  }

  if (result.duration) {
    lines.push(chalk.gray(`  Duration:   ${result.duration}ms`));
  }

  return lines.join('\n');
}

// ============================================================================
// Slot Status
// ============================================================================

export function formatSlotStatus(
  data: Record<string, unknown> | undefined,
): string {
  if (!data) {
    return chalk.gray('\n  No slot data available\n');
  }

  const lines: string[] = [];
  const activeSlot = data.activeSlot as string;

  lines.push('');
  lines.push(chalk.blue.bold(`  Slot Status: ${data.projectName || 'unknown'}`));
  lines.push(chalk.gray(`  Environment: ${data.environment || 'production'}`));
  lines.push(chalk.gray(`  Active Slot: ${activeSlot}`));
  lines.push('');

  // Blue slot
  const blue = data.blue as Record<string, unknown> | undefined;
  if (blue) {
    const isActive = activeSlot === 'blue';
    const marker = isActive ? chalk.green('[ACTIVE]') : chalk.gray('[------]');
    lines.push(`  ${marker} ${chalk.cyan('Blue')}  - State: ${blue.state}, Port: ${blue.port}`);
    if (blue.version) lines.push(chalk.gray(`                    Version: ${blue.version}`));
  }

  // Green slot
  const green = data.green as Record<string, unknown> | undefined;
  if (green) {
    const isActive = activeSlot === 'green';
    const marker = isActive ? chalk.green('[ACTIVE]') : chalk.gray('[------]');
    lines.push(`  ${marker} ${chalk.green('Green')} - State: ${green.state}, Port: ${green.port}`);
    if (green.version) lines.push(chalk.gray(`                    Version: ${green.version}`));
  }

  if (data.lastUpdated) {
    lines.push('');
    lines.push(chalk.gray(`  Last Updated: ${data.lastUpdated}`));
  }

  lines.push('');
  return lines.join('\n');
}

// ============================================================================
// Table Formatter
// ============================================================================

export function formatTable(
  headers: string[],
  rows: string[][],
): string {
  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxRow = Math.max(...rows.map((r) => (r[i] || '').length));
    return Math.max(h.length, maxRow);
  });

  const lines: string[] = [];

  // Header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i]!)).join('  ');
  lines.push(chalk.bold(headerLine));
  lines.push(widths.map((w) => '-'.repeat(w)).join('  '));

  // Rows
  for (const row of rows) {
    const rowLine = row.map((cell, i) => (cell || '').padEnd(widths[i]!)).join('  ');
    lines.push(rowLine);
  }

  return lines.join('\n');
}

// ============================================================================
// Helpers
// ============================================================================

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);

  return parts.join(' ');
}
