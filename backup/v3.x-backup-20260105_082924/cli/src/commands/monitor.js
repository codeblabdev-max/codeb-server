/**
 * Monitor Command
 *
 * Real-time system monitoring with metrics
 */

import chalk from 'chalk';
import { mcpClient } from '../lib/mcp-client.js';

export async function monitor(options) {
  const { metrics, interval, duration, threshold } = options;

  const metricsArray = metrics.split(',');
  const durationMs = parseInt(duration) * 60 * 1000;
  const startTime = Date.now();

  console.log(chalk.cyan.bold(`\n📊 Real-time Monitoring\n`));
  console.log(chalk.gray(`Metrics: ${metricsArray.join(', ')}`));
  console.log(chalk.gray(`Interval: ${interval}s`));
  console.log(chalk.gray(`Threshold: ${threshold}%`));
  console.log(chalk.gray(`Duration: ${duration === '0' ? 'infinite' : duration + ' minutes'}`));
  console.log(chalk.gray('\nPress Ctrl+C to stop\n'));

  const monitorInterval = setInterval(async () => {
    console.clear();
    console.log(chalk.cyan.bold(`🔄 Monitoring - ${new Date().toLocaleTimeString()}\n`));

    const data = await mcpClient.getMetrics(metricsArray);

    metricsArray.forEach(metric => {
      const value = data[metric];
      const color = value > threshold ? 'red' : value > threshold * 0.8 ? 'yellow' : 'green';
      console.log(chalk[color](`  ${metric}: ${value}%`));
    });

    if (durationMs > 0 && Date.now() - startTime >= durationMs) {
      clearInterval(monitorInterval);
      console.log(chalk.gray('\n\nMonitoring completed\n'));
      process.exit(0);
    }
  }, interval * 1000);

  process.on('SIGINT', () => {
    clearInterval(monitorInterval);
    console.log(chalk.gray('\n\nMonitoring stopped\n'));
    process.exit(0);
  });
}
