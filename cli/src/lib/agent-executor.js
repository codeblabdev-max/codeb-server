/**
 * Agent Executor - Hybrid Architecture Implementation
 *
 * CLI에서 7-Agent 시스템을 실행하는 핵심 모듈
 *
 * 아키텍처:
 * 1. MCP Server 우선: analyze_server, security_scan 등 MCP 도구 호출
 * 2. Claude Code Task Tool: 복잡한 분석이 필요한 경우 Task subagent 위임
 * 3. Fallback: MCP 연결 실패 시 기본 응답 (에러 아님, 제한된 기능)
 *
 * @module agent-executor
 */

import { mcpClient } from './mcp-client.js';
import chalk from 'chalk';

/**
 * Agent Type → MCP Tool Mapping
 * 각 에이전트가 사용하는 MCP 도구 정의
 */
const AGENT_MCP_TOOLS = {
  'master-orchestrator': {
    primary: 'analyze_server',
    secondary: ['ssot_get', 'list_projects', 'port_summary'],
    description: 'Project-wide orchestration and status analysis',
  },
  'api-contract-guardian': {
    primary: 'analyze_server',
    secondary: ['healthcheck', 'get_project'],
    description: 'API contract validation and endpoint analysis',
  },
  'frontend-specialist': {
    primary: 'analyze_server',
    secondary: ['check_domain_status'],
    description: 'Frontend and UI analysis',
  },
  'db-schema-architect': {
    primary: 'analyze_server',
    secondary: ['ssot_get_project'],
    description: 'Database schema and connection analysis',
  },
  'e2e-test-strategist': {
    primary: 'healthcheck',
    secondary: ['analyze_server', 'check_domain_status'],
    description: 'End-to-end testing and validation',
  },
  'admin-panel-builder': {
    primary: 'analyze_server',
    secondary: ['list_projects', 'monitoring'],
    description: 'Admin dashboard and monitoring setup',
  },
  'security-specialist': {
    primary: 'security_scan',
    secondary: ['analyze_server'],
    description: 'Security vulnerability scanning',
  },
};

/**
 * Focus Area → MCP Tool Mapping
 */
const FOCUS_TOOL_MAPPING = {
  security: 'security_scan',
  performance: 'analyze_server',
  quality: 'analyze_server',
  architecture: 'analyze_server',
  all: 'analyze_server',
};

/**
 * Execute agent with MCP tool integration
 *
 * @param {Object} params - Execution parameters
 * @param {string} params.type - Agent type (e.g., 'master-orchestrator')
 * @param {string} params.task - Task description
 * @param {Object} params.context - Analysis context
 * @param {Object} params.options - Additional options
 * @returns {Promise<Object>} Analysis result
 */
export async function executeAgent(params) {
  const { type, task, context, options = {} } = params;

  const startTime = Date.now();
  const agentConfig = AGENT_MCP_TOOLS[type] || AGENT_MCP_TOOLS['master-orchestrator'];

  try {
    // 1. MCP 연결 확인
    const isConnected = await mcpClient.ensureConnected();

    if (!isConnected) {
      console.log(chalk.yellow('⚠️  MCP server unavailable, using limited analysis mode'));
      return createLimitedResult(type, task, context, startTime);
    }

    // 2. Focus 영역에 따른 도구 선택
    const focusAreas = context?.focus || ['all'];
    const primaryFocus = Array.isArray(focusAreas) ? focusAreas[0] : focusAreas;

    // Security focus면 security_scan 사용
    if (primaryFocus === 'security' || focusAreas.includes('security')) {
      return await executeSecurityAnalysis(params, startTime);
    }

    // 3. Primary MCP 도구 호출
    const analysisResult = await executePrimaryAnalysis(agentConfig, context, options);

    // 4. Secondary 도구들로 추가 정보 수집
    const supplementaryData = await executeSecondaryAnalysis(agentConfig, context);

    // 5. 결과 통합 및 포맷팅
    return formatAgentResult({
      type,
      task,
      primaryResult: analysisResult,
      supplementaryData,
      context,
      startTime,
      agentConfig,
    });

  } catch (error) {
    console.log(chalk.yellow(`⚠️  Analysis error: ${error.message}`));
    return createErrorResult(type, task, error, startTime);
  }
}

/**
 * Execute primary MCP analysis tool
 */
async function executePrimaryAnalysis(agentConfig, context, options) {
  const toolName = agentConfig.primary;

  try {
    // analyze_server 도구 호출
    if (toolName === 'analyze_server') {
      const result = await mcpClient.callTool('analyze_server', {
        includeContainers: true,
        includePm2: true,
        includePorts: true,
        includeDatabases: true,
        includeRegistry: true,
      });
      return result;
    }

    // healthcheck 도구 호출
    if (toolName === 'healthcheck') {
      const projectName = context?.target?.split('/').pop() || 'unknown';
      const result = await mcpClient.callTool('healthcheck', {
        projectName,
        environment: options?.environment || 'staging',
        checks: ['http', 'container', 'database'],
      });
      return result;
    }

    // 기본: analyze_server
    return await mcpClient.callTool('analyze_server', {
      includeContainers: true,
      includePorts: true,
    });

  } catch (error) {
    console.log(chalk.gray(`  Primary analysis fallback: ${error.message}`));
    return null;
  }
}

/**
 * Execute secondary MCP tools for supplementary data
 */
async function executeSecondaryAnalysis(agentConfig, context) {
  const supplementaryData = {};

  for (const toolName of agentConfig.secondary || []) {
    try {
      if (toolName === 'ssot_get') {
        supplementaryData.ssot = await mcpClient.callTool('ssot_get', {
          includeIndexes: false,
        });
      } else if (toolName === 'list_projects') {
        supplementaryData.projects = await mcpClient.callTool('list_projects', {
          status: 'active',
        });
      } else if (toolName === 'port_summary') {
        supplementaryData.ports = await mcpClient.callTool('port_summary', {});
      }
    } catch {
      // Secondary tools are optional, continue on failure
    }
  }

  return supplementaryData;
}

/**
 * Execute security-focused analysis
 */
async function executeSecurityAnalysis(params, startTime) {
  const { type, task, context, options } = params;

  try {
    const projectName = extractProjectName(context?.target);

    const securityResult = await mcpClient.callTool('security_scan', {
      projectName: projectName || 'default',
      scanType: 'all',
      severity: options?.severity || 'HIGH',
      failOnVulnerability: false,
    });

    // Security 결과 포맷팅
    const vulnerabilities = securityResult?.vulnerabilities || {};
    const secrets = securityResult?.secrets || {};

    return {
      status: 'success',
      agent: type,
      task,
      filesAnalyzed: 0, // Security scan은 이미지 기반
      issuesFound: (vulnerabilities.total || 0) + (secrets.total || 0),
      critical: vulnerabilities.critical || 0,
      high: vulnerabilities.high || 0,
      medium: vulnerabilities.medium || 0,
      low: vulnerabilities.low || 0,
      recommendations: generateSecurityRecommendations(securityResult),
      artifacts: {
        files: [],
        code: null,
        docs: [],
      },
      validation: {
        tests_passed: securityResult?.passed || false,
        quality_score: calculateSecurityScore(securityResult),
        issues: extractSecurityIssues(securityResult),
      },
      next_steps: generateSecurityNextSteps(securityResult),
      summary: true,
      rawData: securityResult,
      duration: `${Math.round((Date.now() - startTime) / 1000)}s`,
    };

  } catch (error) {
    return createErrorResult(type, task, error, startTime);
  }
}

/**
 * Format agent result from MCP data
 */
function formatAgentResult({ type, task, primaryResult, supplementaryData, context, startTime, agentConfig }) {
  // 서버 상태에서 메트릭 추출
  const serverStatus = primaryResult || {};
  const containers = serverStatus.containers || [];
  const ports = serverStatus.ports || {};
  const system = serverStatus.system || {};

  // 이슈 계산
  const issues = calculateIssues(serverStatus, supplementaryData);

  // 추천사항 생성
  const recommendations = generateRecommendations(serverStatus, supplementaryData, context);

  return {
    status: 'success',
    agent: type,
    task,
    filesAnalyzed: containers.length + (supplementaryData?.projects?.length || 0),
    issuesFound: issues.total,
    critical: issues.critical,
    high: issues.high,
    medium: issues.medium,
    low: issues.low,
    recommendations: recommendations.slice(0, 10),
    artifacts: {
      files: [],
      code: null,
      docs: [],
    },
    validation: {
      tests_passed: issues.critical === 0,
      quality_score: calculateQualityScore(serverStatus),
      issues: issues.details,
    },
    next_steps: generateNextSteps(issues, context),
    summary: true,
    // Raw data for detailed inspection
    rawData: {
      server: serverStatus,
      supplementary: supplementaryData,
    },
    duration: `${Math.round((Date.now() - startTime) / 1000)}s`,
  };
}

/**
 * Calculate issues from server status
 */
function calculateIssues(serverStatus, supplementaryData) {
  const issues = {
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    details: [],
  };

  // System resource issues
  const system = serverStatus.system || {};

  if (system.memory?.usagePercent > 90) {
    issues.critical++;
    issues.details.push('Critical: Memory usage > 90%');
  } else if (system.memory?.usagePercent > 80) {
    issues.high++;
    issues.details.push('High: Memory usage > 80%');
  }

  if (system.disk?.usagePercent > 90) {
    issues.critical++;
    issues.details.push('Critical: Disk usage > 90%');
  } else if (system.disk?.usagePercent > 80) {
    issues.high++;
    issues.details.push('High: Disk usage > 80%');
  }

  // Container issues
  const containers = serverStatus.containers || [];
  const unhealthyContainers = containers.filter(c =>
    c.status !== 'running' || c.health === 'unhealthy'
  );

  for (const container of unhealthyContainers) {
    if (container.health === 'unhealthy') {
      issues.high++;
      issues.details.push(`High: Container ${container.name} is unhealthy`);
    } else if (container.status === 'exited') {
      issues.medium++;
      issues.details.push(`Medium: Container ${container.name} is stopped`);
    }
  }

  // Port conflicts (from supplementary data)
  if (supplementaryData?.ports?.conflicts?.length > 0) {
    for (const conflict of supplementaryData.ports.conflicts) {
      issues.high++;
      issues.details.push(`High: Port conflict detected - ${conflict}`);
    }
  }

  issues.total = issues.critical + issues.high + issues.medium + issues.low;

  return issues;
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(serverStatus, supplementaryData, context) {
  const recommendations = [];
  const system = serverStatus.system || {};
  const containers = serverStatus.containers || [];

  // Memory recommendations
  if (system.memory?.usagePercent > 70) {
    recommendations.push('Optimize memory usage - consider increasing RAM or reducing container memory limits');
  }

  // Disk recommendations
  if (system.disk?.usagePercent > 70) {
    recommendations.push('Clean up disk space - remove unused Docker images and old logs');
  }

  // Container recommendations
  const stoppedContainers = containers.filter(c => c.status !== 'running');
  if (stoppedContainers.length > 0) {
    recommendations.push(`Review ${stoppedContainers.length} stopped container(s) and restart if needed`);
  }

  // Health check recommendations
  const unhealthyContainers = containers.filter(c => c.health === 'unhealthy');
  if (unhealthyContainers.length > 0) {
    recommendations.push('Investigate unhealthy containers - check logs and health endpoints');
  }

  // SSOT recommendations
  if (supplementaryData?.ssot?.error) {
    recommendations.push('Initialize SSOT (Single Source of Truth) for centralized configuration management');
  }

  // General best practices
  if (recommendations.length === 0) {
    recommendations.push('System looks healthy - continue monitoring');
    recommendations.push('Consider setting up automated backups if not already configured');
    recommendations.push('Review security scan results periodically');
  }

  return recommendations;
}

/**
 * Generate security-specific recommendations
 */
function generateSecurityRecommendations(securityResult) {
  const recommendations = [];
  const vulns = securityResult?.vulnerabilities || {};

  if (vulns.critical > 0) {
    recommendations.push(`URGENT: Fix ${vulns.critical} critical vulnerabilities immediately`);
  }
  if (vulns.high > 0) {
    recommendations.push(`Fix ${vulns.high} high severity vulnerabilities within 24 hours`);
  }
  if (vulns.medium > 0) {
    recommendations.push(`Address ${vulns.medium} medium severity issues in next sprint`);
  }

  if (securityResult?.secrets?.total > 0) {
    recommendations.push('CRITICAL: Remove exposed secrets from codebase immediately');
    recommendations.push('Rotate all compromised credentials');
    recommendations.push('Add .gitignore rules to prevent future secret exposure');
  }

  if (recommendations.length === 0) {
    recommendations.push('No critical security issues found');
    recommendations.push('Continue regular security scanning');
  }

  return recommendations;
}

/**
 * Generate next steps based on issues
 */
function generateNextSteps(issues, context) {
  const steps = [];

  if (issues.critical > 0) {
    steps.push('Immediately address critical issues');
    steps.push('Set up alerts for critical metrics');
  }

  if (issues.high > 0) {
    steps.push('Schedule time to fix high priority issues');
  }

  steps.push('Review and update project documentation');
  steps.push('Run comprehensive E2E tests');
  steps.push('Schedule next security audit');

  return steps;
}

/**
 * Generate security next steps
 */
function generateSecurityNextSteps(securityResult) {
  const steps = [];

  if (securityResult?.vulnerabilities?.critical > 0) {
    steps.push('Update base images to fix critical vulnerabilities');
    steps.push('Review and patch affected dependencies');
  }

  if (securityResult?.secrets?.total > 0) {
    steps.push('Remove secrets from code and use environment variables');
    steps.push('Set up pre-commit hooks to prevent secret commits');
  }

  steps.push('Schedule regular security scans in CI/CD pipeline');
  steps.push('Review security findings with team');

  return steps;
}

/**
 * Calculate quality score (0-1)
 */
function calculateQualityScore(serverStatus) {
  let score = 1.0;
  const system = serverStatus.system || {};

  // Deduct for resource usage
  if (system.memory?.usagePercent > 90) score -= 0.3;
  else if (system.memory?.usagePercent > 80) score -= 0.1;

  if (system.disk?.usagePercent > 90) score -= 0.3;
  else if (system.disk?.usagePercent > 80) score -= 0.1;

  // Deduct for unhealthy containers
  const containers = serverStatus.containers || [];
  const unhealthy = containers.filter(c => c.health === 'unhealthy').length;
  score -= unhealthy * 0.1;

  return Math.max(0, Math.min(1, score));
}

/**
 * Calculate security score
 */
function calculateSecurityScore(securityResult) {
  let score = 1.0;
  const vulns = securityResult?.vulnerabilities || {};

  score -= (vulns.critical || 0) * 0.2;
  score -= (vulns.high || 0) * 0.1;
  score -= (vulns.medium || 0) * 0.05;
  score -= (vulns.low || 0) * 0.01;

  if (securityResult?.secrets?.total > 0) {
    score -= 0.3;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Extract security issues as array
 */
function extractSecurityIssues(securityResult) {
  const issues = [];

  for (const vuln of securityResult?.vulnerabilities?.items || []) {
    issues.push(`${vuln.severity}: ${vuln.id} in ${vuln.package}`);
  }

  for (const secret of securityResult?.secrets?.items || []) {
    issues.push(`SECRET: ${secret.rule} in ${secret.file}:${secret.line}`);
  }

  return issues.slice(0, 20); // Limit to 20
}

/**
 * Extract project name from path
 */
function extractProjectName(target) {
  if (!target) return null;
  const parts = target.split('/').filter(Boolean);
  return parts[parts.length - 1];
}

/**
 * Create limited result when MCP is unavailable
 */
function createLimitedResult(type, task, context, startTime) {
  return {
    status: 'limited',
    agent: type,
    task,
    filesAnalyzed: 0,
    issuesFound: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    recommendations: [
      'MCP server connection unavailable',
      'Please check server connectivity and try again',
      'Run: we health --check-mcp to diagnose',
    ],
    artifacts: {
      files: [],
      code: null,
      docs: [],
    },
    validation: {
      tests_passed: false,
      quality_score: 0,
      issues: ['MCP server unavailable - limited analysis mode'],
    },
    next_steps: [
      'Verify MCP server is running',
      'Check SSH connection to deployment server',
      'Review .mcp.json configuration',
    ],
    summary: true,
    limited: true,
    duration: `${Math.round((Date.now() - startTime) / 1000)}s`,
  };
}

/**
 * Create error result
 */
function createErrorResult(type, task, error, startTime) {
  return {
    status: 'error',
    agent: type,
    task,
    filesAnalyzed: 0,
    issuesFound: 1,
    critical: 1,
    high: 0,
    medium: 0,
    low: 0,
    recommendations: [
      `Error during analysis: ${error.message}`,
      'Check logs for detailed error information',
      'Verify server connectivity and permissions',
    ],
    artifacts: {
      files: [],
      code: null,
      docs: [],
    },
    validation: {
      tests_passed: false,
      quality_score: 0,
      issues: [error.message],
    },
    next_steps: [
      'Review error message and fix underlying issue',
      'Check MCP server logs',
      'Retry analysis after fixing issues',
    ],
    summary: true,
    error: error.message,
    duration: `${Math.round((Date.now() - startTime) / 1000)}s`,
  };
}

/**
 * Get available agent types
 */
export function getAvailableAgents() {
  return Object.entries(AGENT_MCP_TOOLS).map(([type, config]) => ({
    type,
    description: config.description,
    primaryTool: config.primary,
  }));
}

/**
 * Check if agent type is valid
 */
export function isValidAgentType(type) {
  return type in AGENT_MCP_TOOLS;
}
