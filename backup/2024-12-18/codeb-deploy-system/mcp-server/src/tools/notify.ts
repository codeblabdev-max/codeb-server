/**
 * CodeB Deploy MCP - Notify Tool
 * Slack, PagerDuty 등 알림 시스템 통합
 */

import { z } from 'zod';

// Notify 입력 스키마
export const notifyInputSchema = z.object({
  channel: z.enum(['slack', 'pagerduty', 'email', 'webhook']).describe('알림 채널'),
  type: z.enum(['deployment', 'rollback', 'healthcheck', 'security', 'custom']).describe('알림 유형'),
  severity: z.enum(['info', 'warning', 'error', 'critical']).describe('심각도'),
  projectName: z.string().describe('프로젝트 이름'),
  environment: z.enum(['staging', 'production', 'preview']).optional().describe('환경'),
  title: z.string().describe('알림 제목'),
  message: z.string().describe('알림 메시지'),
  details: z.record(z.unknown()).optional().describe('추가 상세 정보'),
  webhookUrl: z.string().optional().describe('커스텀 웹훅 URL'),
});

export type NotifyInput = z.infer<typeof notifyInputSchema>;

interface NotifyResult {
  success: boolean;
  channel: string;
  messageId?: string;
  timestamp: string;
  error?: string;
}

// Slack 메시지 색상 매핑
const SLACK_COLORS: Record<string, string> = {
  info: '#36a64f',      // 녹색
  warning: '#ff9800',   // 주황색
  error: '#f44336',     // 빨간색
  critical: '#9c27b0',  // 보라색
};

// Slack 이모지 매핑
const SLACK_EMOJIS: Record<string, string> = {
  deployment: '🚀',
  rollback: '⏪',
  healthcheck: '💓',
  security: '🔐',
  custom: '📢',
};

/**
 * Slack 알림 전송
 */
async function sendSlackNotification(input: NotifyInput): Promise<NotifyResult> {
  const {
    type,
    severity,
    projectName,
    environment,
    title,
    message,
    details,
    webhookUrl,
  } = input;

  // 환경변수에서 웹훅 URL 가져오기
  const slackWebhook = webhookUrl || process.env.SLACK_WEBHOOK_URL;

  if (!slackWebhook) {
    return {
      success: false,
      channel: 'slack',
      timestamp: new Date().toISOString(),
      error: 'Slack webhook URL not configured',
    };
  }

  const emoji = SLACK_EMOJIS[type] || '📢';
  const color = SLACK_COLORS[severity] || '#36a64f';

  // Slack 메시지 구성
  const slackMessage = {
    username: 'CodeB Deploy',
    icon_emoji: ':rocket:',
    attachments: [
      {
        color,
        pretext: `${emoji} *${title}*`,
        fields: [
          {
            title: 'Project',
            value: projectName,
            short: true,
          },
          ...(environment ? [{
            title: 'Environment',
            value: environment.toUpperCase(),
            short: true,
          }] : []),
          {
            title: 'Severity',
            value: severity.toUpperCase(),
            short: true,
          },
          {
            title: 'Type',
            value: type,
            short: true,
          },
          {
            title: 'Message',
            value: message,
            short: false,
          },
          ...(details ? [{
            title: 'Details',
            value: '```' + JSON.stringify(details, null, 2) + '```',
            short: false,
          }] : []),
        ],
        footer: 'CodeB Deploy System',
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  try {
    const response = await fetch(slackWebhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        channel: 'slack',
        timestamp: new Date().toISOString(),
        error: `Slack API error: ${response.status} - ${errorText}`,
      };
    }

    return {
      success: true,
      channel: 'slack',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      channel: 'slack',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * PagerDuty 알림 전송
 */
async function sendPagerDutyNotification(input: NotifyInput): Promise<NotifyResult> {
  const {
    type,
    severity,
    projectName,
    environment,
    title,
    message,
    details,
  } = input;

  const routingKey = process.env.PAGERDUTY_ROUTING_KEY;

  if (!routingKey) {
    return {
      success: false,
      channel: 'pagerduty',
      timestamp: new Date().toISOString(),
      error: 'PagerDuty routing key not configured',
    };
  }

  // PagerDuty 이벤트 구성
  const pagerDutyEvent = {
    routing_key: routingKey,
    event_action: severity === 'critical' || severity === 'error' ? 'trigger' : 'acknowledge',
    dedup_key: `codeb-${projectName}-${environment || 'global'}-${type}`,
    payload: {
      summary: `[${projectName}${environment ? `-${environment}` : ''}] ${title}`,
      severity: severity === 'critical' ? 'critical' :
                severity === 'error' ? 'error' :
                severity === 'warning' ? 'warning' : 'info',
      source: `codeb-deploy/${projectName}`,
      component: environment || 'global',
      group: type,
      class: 'deployment',
      custom_details: {
        message,
        project: projectName,
        environment,
        type,
        ...details,
      },
    },
    links: [
      {
        href: `https://github.com/your-org/${projectName}/actions`,
        text: 'GitHub Actions',
      },
    ],
  };

  try {
    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pagerDutyEvent),
    });

    if (!response.ok) {
      const errorData = await response.json() as { message?: string };
      return {
        success: false,
        channel: 'pagerduty',
        timestamp: new Date().toISOString(),
        error: `PagerDuty API error: ${errorData.message || response.status}`,
      };
    }

    const result = await response.json() as { dedup_key?: string };

    return {
      success: true,
      channel: 'pagerduty',
      messageId: result.dedup_key,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      channel: 'pagerduty',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 이메일 알림 전송 (SMTP 또는 SendGrid)
 */
async function sendEmailNotification(input: NotifyInput): Promise<NotifyResult> {
  const {
    type,
    severity,
    projectName,
    environment,
    title,
    message,
    details,
  } = input;

  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const emailTo = process.env.ALERT_EMAIL_TO;
  const emailFrom = process.env.ALERT_EMAIL_FROM || 'codeb-deploy@example.com';

  if (!sendgridApiKey || !emailTo) {
    return {
      success: false,
      channel: 'email',
      timestamp: new Date().toISOString(),
      error: 'Email configuration not complete (SENDGRID_API_KEY, ALERT_EMAIL_TO)',
    };
  }

  const htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: ${SLACK_COLORS[severity]};">${SLACK_EMOJIS[type]} ${title}</h2>
        <table style="border-collapse: collapse; width: 100%;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Project</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${projectName}</td>
          </tr>
          ${environment ? `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Environment</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${environment.toUpperCase()}</td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Severity</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${severity.toUpperCase()}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Type</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${type}</td>
          </tr>
        </table>
        <h3>Message</h3>
        <p style="background: #f5f5f5; padding: 15px; border-radius: 5px;">${message}</p>
        ${details ? `
        <h3>Details</h3>
        <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto;">${JSON.stringify(details, null, 2)}</pre>
        ` : ''}
        <hr>
        <p style="color: #999; font-size: 12px;">Sent by CodeB Deploy System</p>
      </body>
    </html>
  `;

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: emailTo }],
        }],
        from: { email: emailFrom, name: 'CodeB Deploy' },
        subject: `[${severity.toUpperCase()}] ${title} - ${projectName}`,
        content: [
          {
            type: 'text/html',
            value: htmlContent,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        channel: 'email',
        timestamp: new Date().toISOString(),
        error: `SendGrid API error: ${response.status} - ${errorText}`,
      };
    }

    return {
      success: true,
      channel: 'email',
      messageId: response.headers.get('X-Message-Id') || undefined,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      channel: 'email',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 커스텀 웹훅 전송
 */
async function sendWebhookNotification(input: NotifyInput): Promise<NotifyResult> {
  const {
    type,
    severity,
    projectName,
    environment,
    title,
    message,
    details,
    webhookUrl,
  } = input;

  if (!webhookUrl) {
    return {
      success: false,
      channel: 'webhook',
      timestamp: new Date().toISOString(),
      error: 'Webhook URL not provided',
    };
  }

  const payload = {
    type,
    severity,
    project: projectName,
    environment,
    title,
    message,
    details,
    timestamp: new Date().toISOString(),
    source: 'codeb-deploy',
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CodeB-Deploy/1.0',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        channel: 'webhook',
        timestamp: new Date().toISOString(),
        error: `Webhook error: ${response.status} - ${errorText}`,
      };
    }

    return {
      success: true,
      channel: 'webhook',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      channel: 'webhook',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Notify 도구 실행
 */
export async function executeNotify(input: NotifyInput): Promise<NotifyResult> {
  const { channel } = input;

  switch (channel) {
    case 'slack':
      return sendSlackNotification(input);
    case 'pagerduty':
      return sendPagerDutyNotification(input);
    case 'email':
      return sendEmailNotification(input);
    case 'webhook':
      return sendWebhookNotification(input);
    default:
      return {
        success: false,
        channel,
        timestamp: new Date().toISOString(),
        error: `Unknown channel: ${channel}`,
      };
  }
}

/**
 * 배포 알림 헬퍼
 */
export async function notifyDeployment(params: {
  projectName: string;
  environment: 'staging' | 'production' | 'preview';
  status: 'started' | 'success' | 'failed';
  version?: string;
  duration?: number;
  error?: string;
  channels?: Array<'slack' | 'pagerduty' | 'email'>;
}): Promise<NotifyResult[]> {
  const {
    projectName,
    environment,
    status,
    version,
    duration,
    error,
    channels = ['slack'],
  } = params;

  const severity = status === 'failed' ? 'error' : status === 'started' ? 'info' : 'info';
  const emoji = status === 'failed' ? '❌' : status === 'success' ? '✅' : '🚀';

  const title = `${emoji} Deployment ${status.charAt(0).toUpperCase() + status.slice(1)}`;
  const message = status === 'failed'
    ? `Deployment to ${environment} failed${error ? `: ${error}` : ''}`
    : status === 'success'
    ? `Successfully deployed ${version || 'latest'} to ${environment}${duration ? ` in ${Math.round(duration / 1000)}s` : ''}`
    : `Starting deployment to ${environment}...`;

  const results: NotifyResult[] = [];

  for (const channel of channels) {
    const result = await executeNotify({
      channel,
      type: 'deployment',
      severity,
      projectName,
      environment,
      title,
      message,
      details: { version, duration, status, error },
    });
    results.push(result);
  }

  return results;
}

/**
 * 헬스체크 알림 헬퍼
 */
export async function notifyHealthcheck(params: {
  projectName: string;
  environment: 'staging' | 'production' | 'preview';
  status: 'healthy' | 'unhealthy' | 'degraded';
  checks: Record<string, unknown>;
  channels?: Array<'slack' | 'pagerduty' | 'email'>;
}): Promise<NotifyResult[]> {
  const {
    projectName,
    environment,
    status,
    checks,
    channels = ['slack'],
  } = params;

  // healthy는 알림 안 함
  if (status === 'healthy') {
    return [];
  }

  const severity = status === 'unhealthy' ? 'error' : 'warning';
  const emoji = status === 'unhealthy' ? '🔴' : '🟡';

  const title = `${emoji} Service ${status.toUpperCase()}`;
  const message = `${projectName} in ${environment} is ${status}`;

  const results: NotifyResult[] = [];

  for (const channel of channels) {
    const result = await executeNotify({
      channel,
      type: 'healthcheck',
      severity,
      projectName,
      environment,
      title,
      message,
      details: { checks },
    });
    results.push(result);
  }

  return results;
}

/**
 * Notify 도구 정의
 */
export const notifyTool = {
  name: 'notify',
  description: 'Slack, PagerDuty, 이메일 등으로 알림을 전송합니다',
  inputSchema: notifyInputSchema,
  execute: executeNotify,
};
