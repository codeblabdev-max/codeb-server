/**
 * Format Utilities
 * 출력 포맷 유틸리티
 */

const chalk = require('chalk');

function formatDate(date) {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatStatus(status) {
  const statusColors = {
    running: chalk.green('● Running'),
    stopped: chalk.red('● Stopped'),
    starting: chalk.yellow('● Starting'),
    stopping: chalk.yellow('● Stopping'),
    error: chalk.red('● Error'),
    created: chalk.blue('● Created'),
    pending: chalk.gray('● Pending')
  };
  
  return statusColors[status.toLowerCase()] || chalk.gray(`● ${status}`);
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatPercent(value, total) {
  if (!total) return '0%';
  return Math.round((value / total) * 100) + '%';
}

function truncate(str, length = 50) {
  if (!str) return '';
  if (str.length <= length) return str;
  return str.substring(0, length - 3) + '...';
}

module.exports = {
  formatDate,
  formatBytes,
  formatStatus,
  formatDuration,
  formatPercent,
  truncate
};