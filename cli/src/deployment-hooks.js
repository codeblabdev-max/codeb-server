#!/usr/bin/env node

/**
 * CodeB Deployment Hooks
 * Automatically sends notifications during deployment lifecycle
 *
 * Usage:
 *   deployment-hooks.js started <project> <environment>
 *   deployment-hooks.js success <project> <environment> [version] [duration]
 *   deployment-hooks.js failed <project> <environment> [error]
 */

const notifier = require('./notifier');

class DeploymentHooks {
  /**
   * Deployment started
   */
  static async started(project, environment = 'production', data = {}) {
    return await notifier.notify({
      event: 'deployment.started',
      project,
      environment,
      severity: 'info',
      data: {
        startTime: new Date().toISOString(),
        deployer: data.deployer || process.env.USER || 'system',
        branch: data.branch || 'main',
        commit: data.commit || 'unknown',
        ...data
      }
    });
  }

  /**
   * Deployment succeeded
   */
  static async success(project, environment = 'production', data = {}) {
    return await notifier.notify({
      event: 'deployment.success',
      project,
      environment,
      severity: 'info',
      data: {
        completedAt: new Date().toISOString(),
        version: data.version || '1.0.0',
        duration: data.duration || 'unknown',
        deployer: data.deployer || process.env.USER || 'system',
        url: data.url || `https://${project}.codeb.dev`,
        ...data
      }
    });
  }

  /**
   * Deployment failed
   */
  static async failed(project, environment = 'production', data = {}) {
    return await notifier.notify({
      event: 'deployment.failed',
      project,
      environment,
      severity: 'error',
      data: {
        failedAt: new Date().toISOString(),
        error: data.error || 'Unknown error',
        stage: data.stage || 'unknown',
        deployer: data.deployer || process.env.USER || 'system',
        ...data
      }
    });
  }

  /**
   * Server status changed
   */
  static async serverStatus(status, data = {}) {
    const event = status === 'up' ? 'server.up' : 'server.down';
    const severity = status === 'up' ? 'info' : 'critical';

    return await notifier.notify({
      event,
      project: data.server || 'unknown',
      environment: 'production',
      severity,
      data: {
        server: data.server || 'unknown',
        ip: data.ip || 'unknown',
        timestamp: new Date().toISOString(),
        ...data
      }
    });
  }

  /**
   * Healthcheck failed
   */
  static async healthcheckFailed(project, environment = 'production', data = {}) {
    return await notifier.notify({
      event: 'healthcheck.failed',
      project,
      environment,
      severity: 'warning',
      data: {
        endpoint: data.endpoint || '/health',
        statusCode: data.statusCode || 500,
        attempts: data.attempts || 1,
        lastError: data.error || 'Unknown error',
        timestamp: new Date().toISOString(),
        ...data
      }
    });
  }

  /**
   * Resource threshold exceeded
   */
  static async resourceThreshold(resource, value, threshold, data = {}) {
    return await notifier.notify({
      event: 'resource.threshold',
      project: data.project || 'system',
      environment: 'production',
      severity: value >= threshold * 1.1 ? 'critical' : 'warning',
      data: {
        resource,
        currentValue: value,
        threshold,
        percentage: ((value / threshold) * 100).toFixed(2),
        server: data.server || 'unknown',
        timestamp: new Date().toISOString(),
        ...data
      }
    });
  }

  /**
   * Backup completed
   */
  static async backupCompleted(project, data = {}) {
    return await notifier.notify({
      event: 'backup.completed',
      project,
      environment: 'production',
      severity: 'info',
      data: {
        backupType: data.type || 'full',
        size: data.size || 'unknown',
        duration: data.duration || 'unknown',
        location: data.location || 'unknown',
        timestamp: new Date().toISOString(),
        ...data
      }
    });
  }

  /**
   * Backup failed
   */
  static async backupFailed(project, data = {}) {
    return await notifier.notify({
      event: 'backup.failed',
      project,
      environment: 'production',
      severity: 'error',
      data: {
        backupType: data.type || 'full',
        error: data.error || 'Unknown error',
        timestamp: new Date().toISOString(),
        ...data
      }
    });
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  const project = process.argv[3];
  const environment = process.argv[4] || 'production';
  const extraData = {};

  // Parse additional arguments
  for (let i = 5; i < process.argv.length; i += 2) {
    const key = process.argv[i];
    const value = process.argv[i + 1];
    if (key && value) {
      extraData[key] = value;
    }
  }

  (async () => {
    try {
      await notifier.initialize();

      let result;

      switch (command) {
        case 'started':
          result = await DeploymentHooks.started(project, environment, extraData);
          break;

        case 'success':
          result = await DeploymentHooks.success(project, environment, extraData);
          break;

        case 'failed':
          result = await DeploymentHooks.failed(project, environment, extraData);
          break;

        case 'server-up':
          result = await DeploymentHooks.serverStatus('up', { server: project, ...extraData });
          break;

        case 'server-down':
          result = await DeploymentHooks.serverStatus('down', { server: project, ...extraData });
          break;

        case 'healthcheck-failed':
          result = await DeploymentHooks.healthcheckFailed(project, environment, extraData);
          break;

        case 'resource-threshold':
          const resource = process.argv[3];
          const value = parseFloat(process.argv[4]);
          const threshold = parseFloat(process.argv[5]);
          result = await DeploymentHooks.resourceThreshold(resource, value, threshold, extraData);
          break;

        case 'backup-completed':
          result = await DeploymentHooks.backupCompleted(project, extraData);
          break;

        case 'backup-failed':
          result = await DeploymentHooks.backupFailed(project, extraData);
          break;

        default:
          console.log('CodeB Deployment Hooks');
          console.log('');
          console.log('Usage:');
          console.log('  deployment-hooks.js started <project> [environment]');
          console.log('  deployment-hooks.js success <project> [environment] [key value...]');
          console.log('  deployment-hooks.js failed <project> [environment] [key value...]');
          console.log('  deployment-hooks.js server-up <server> [key value...]');
          console.log('  deployment-hooks.js server-down <server> [key value...]');
          console.log('  deployment-hooks.js healthcheck-failed <project> [environment]');
          console.log('  deployment-hooks.js resource-threshold <resource> <value> <threshold>');
          console.log('  deployment-hooks.js backup-completed <project> [key value...]');
          console.log('  deployment-hooks.js backup-failed <project> [key value...]');
          process.exit(1);
      }

      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = DeploymentHooks;
