/**
 * Health Command
 *
 * Checks system health via MCP full_health_check
 * Supports: verbose output, JSON format, watch mode
 */

import chalk from 'chalk';
import ora from 'ora';
import { mcpClient } from '../lib/mcp-client.js';
import { formatHealthReport } from '../lib/formatters.js';

const HEALTH_THRESHOLDS = {
  cpu: { warning: 70, critical: 90 },
  memory: { warning: 80, critical: 95 },
  disk: { warning: 85, critical: 95 },
  response: { warning: 200, critical: 500 } // ms
};

export async function health(options) {
  const { verbose, json, watch, interval } = options;

  if (watch) {
    return watchHealth(interval, verbose, json);
  }

  await performHealthCheck(verbose, json);
}

async function performHealthCheck(verbose = false, json = false) {
  const spinner = ora('Checking system health...').start();

  try {
    // Call MCP full_health_check
    const healthData = await mcpClient.fullHealthCheck();

    spinner.succeed('Health check completed');

    if (json) {
      console.log(JSON.stringify(healthData, null, 2));
      return;
    }

    // Overall status
    const overallStatus = calculateOverallStatus(healthData);
    const statusIcon = getStatusIcon(overallStatus);
    const statusColor = getStatusColor(overallStatus);

    console.log(chalk[statusColor].bold(`\n${statusIcon} System Status: ${overallStatus.toUpperCase()}\n`));

    // Component status
    console.log(chalk.cyan('📦 Components:'));
    displayComponentStatus(healthData.components, verbose);

    // Resource usage
    console.log(chalk.cyan('\n💻 Resources:'));
    displayResourceUsage(healthData.resources);

    // Network status
    console.log(chalk.cyan('\n🌐 Network:'));
    displayNetworkStatus(healthData.network);

    // Services
    if (healthData.services) {
      console.log(chalk.cyan('\n🔧 Services:'));
      displayServicesStatus(healthData.services, verbose);
    }

    // Warnings/Errors
    if (healthData.warnings?.length > 0) {
      console.log(chalk.yellow('\n⚠️  Warnings:'));
      healthData.warnings.forEach(warn => {
        console.log(chalk.yellow(`  • ${warn}`));
      });
    }

    if (healthData.errors?.length > 0) {
      console.log(chalk.red('\n❌ Errors:'));
      healthData.errors.forEach(err => {
        console.log(chalk.red(`  • ${err}`));
      });
    }

    console.log();

  } catch (error) {
    spinner.fail('Health check failed');
    console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
    process.exit(1);
  }
}

async function watchHealth(interval, verbose, json) {
  console.log(chalk.cyan(`\n👁️  Watching health status (updating every ${interval}s)...\n`));
  console.log(chalk.gray('Press Ctrl+C to stop\n'));

  const checkInterval = setInterval(async () => {
    console.clear();
    console.log(chalk.cyan.bold(`🔄 Last updated: ${new Date().toLocaleTimeString()}\n`));
    await performHealthCheck(verbose, json);
  }, interval * 1000);

  // Initial check
  await performHealthCheck(verbose, json);

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(checkInterval);
    console.log(chalk.gray('\n\nMonitoring stopped\n'));
    process.exit(0);
  });
}

function displayComponentStatus(components, verbose) {
  Object.entries(components).forEach(([name, status]) => {
    const icon = status.healthy ? '✅' : '❌';
    const color = status.healthy ? 'green' : 'red';

    console.log(chalk[color](`  ${icon} ${name}: ${status.status}`));

    if (verbose && status.details) {
      console.log(chalk.gray(`     ${status.details}`));
    }
  });
}

function displayResourceUsage(resources) {
  const { cpu, memory, disk } = resources;

  // CPU
  const cpuStatus = getThresholdStatus(cpu.usage, HEALTH_THRESHOLDS.cpu);
  console.log(chalk[getStatusColor(cpuStatus)](`  CPU: ${cpu.usage.toFixed(1)}%`));

  // Memory
  const memStatus = getThresholdStatus(memory.usage, HEALTH_THRESHOLDS.memory);
  console.log(chalk[getStatusColor(memStatus)](`  Memory: ${memory.usage.toFixed(1)}% (${memory.used}/${memory.total})`));

  // Disk
  const diskStatus = getThresholdStatus(disk.usage, HEALTH_THRESHOLDS.disk);
  console.log(chalk[getStatusColor(diskStatus)](`  Disk: ${disk.usage.toFixed(1)}% (${disk.used}/${disk.total})`));
}

function displayNetworkStatus(network) {
  if (!network) {
    console.log(chalk.gray('  No network data available'));
    return;
  }
  const internetIcon = network.internet ? '🟢' : '🔴';
  console.log(chalk.gray(`  Internet: ${internetIcon} ${network.internet ? 'Connected' : 'Disconnected'}`));
  if (network.latency && network.latency !== 'N/A') {
    console.log(chalk.gray(`  Latency: ${network.latency}ms`));
  }
  if (network.throughput && network.throughput !== 'N/A') {
    console.log(chalk.gray(`  Throughput: ${network.throughput}`));
  }
  console.log(chalk.gray(`  Active Connections: ${network.activeConnections || 0}`));
}

function displayServicesStatus(services, verbose) {
  Object.entries(services).forEach(([name, service]) => {
    const icon = service.running ? '🟢' : '🔴';
    console.log(chalk.gray(`  ${icon} ${name} (${service.status})`));

    if (verbose && service.port) {
      console.log(chalk.gray(`     Port: ${service.port}`));
    }
  });
}

function calculateOverallStatus(healthData) {
  const hasErrors = healthData.errors?.length > 0;
  const hasCritical = Object.values(healthData.components).some(c => !c.healthy);

  if (hasErrors || hasCritical) return 'critical';
  if (healthData.warnings?.length > 0) return 'warning';
  return 'healthy';
}

function getThresholdStatus(value, thresholds) {
  if (value >= thresholds.critical) return 'critical';
  if (value >= thresholds.warning) return 'warning';
  return 'healthy';
}

function getStatusIcon(status) {
  switch (status) {
    case 'healthy': return '✅';
    case 'warning': return '⚠️';
    case 'critical': return '❌';
    default: return '❓';
  }
}

function getStatusColor(status) {
  switch (status) {
    case 'healthy': return 'green';
    case 'warning': return 'yellow';
    case 'critical': return 'red';
    default: return 'gray';
  }
}
