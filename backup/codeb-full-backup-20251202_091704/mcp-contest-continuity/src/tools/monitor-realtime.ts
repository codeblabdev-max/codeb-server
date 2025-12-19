/**
 * Monitor Real-time Tool
 * 
 * 실시간 코드 변경 감지 및 모니터링 도구
 */

import { RealTimeCodeMonitor } from '../lib/real-time-monitor.js';

interface MonitorRealtimeArgs {
  operation: 'start' | 'stop' | 'status' | 'history' | 'statistics';
  project_path?: string;
  config?: {
    watch_patterns?: string[];
    ignore_patterns?: string[];
    debounce_ms?: number;
    analysis_depth?: 'basic' | 'detailed' | 'comprehensive';
    auto_actions?: {
      generate_tests?: boolean;
      update_documentation?: boolean;
      extract_patterns?: boolean;
      validate_dependencies?: boolean;
    };
    notification_settings?: {
      real_time?: boolean;
      batch_summary?: boolean;
      batch_interval_minutes?: number;
    };
  };
  history_filter?: {
    since?: string;
    file_type?: string;
    change_type?: string;
    limit?: number;
  };
}

export class MonitorRealtimeTool {
  private monitor: RealTimeCodeMonitor;
  private isMonitoring: boolean = false;
  private monitoredProjects: Set<string> = new Set();

  constructor() {
    this.monitor = new RealTimeCodeMonitor();
    this.setupEventListeners();
  }

  async execute(args: MonitorRealtimeArgs) {
    try {
      switch (args.operation) {
        case 'start':
          return await this.startMonitoring(args);
        
        case 'stop':
          return await this.stopMonitoring(args);
        
        case 'status':
          return await this.getStatus();
        
        case 'history':
          return await this.getHistory(args);
        
        case 'statistics':
          return await this.getStatistics();
        
        default:
          throw new Error(`Unknown operation: ${args.operation}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }

  private async startMonitoring(args: MonitorRealtimeArgs) {
    if (!args.project_path) {
      throw new Error('project_path is required for start operation');
    }

    console.log(`[MonitorRealtime] Starting monitoring for: ${args.project_path}`);

    // 설정이 제공된 경우 새 모니터 인스턴스 생성
    if (args.config) {
      this.monitor = new RealTimeCodeMonitor(args.config);
      this.setupEventListeners();
    }

    await this.monitor.startMonitoring(args.project_path);
    this.monitoredProjects.add(args.project_path);
    this.isMonitoring = true;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'start',
            results: {
              project_path: args.project_path,
              monitoring_started: true,
              config: args.config || 'default',
              monitored_projects: Array.from(this.monitoredProjects)
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  private async stopMonitoring(args: MonitorRealtimeArgs) {
    console.log(`[MonitorRealtime] Stopping monitoring`);

    await this.monitor.cleanup();
    this.isMonitoring = false;
    
    if (args.project_path) {
      this.monitoredProjects.delete(args.project_path);
    } else {
      this.monitoredProjects.clear();
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'stop',
            results: {
              monitoring_stopped: true,
              remaining_projects: Array.from(this.monitoredProjects)
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  private async getStatus() {
    const statistics = this.monitor.getStatistics();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'status',
            results: {
              is_monitoring: this.isMonitoring,
              monitored_projects: Array.from(this.monitoredProjects),
              statistics
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  private async getHistory(args: MonitorRealtimeArgs) {
    // 실제 구현에서는 monitor에서 이벤트 히스토리를 가져와야 함
    // 현재는 시뮬레이션 데이터 반환
    const mockHistory = [
      {
        id: 'change_001',
        timestamp: new Date(Date.now() - 300000).toISOString(),
        file_path: '/src/components/Button.tsx',
        change_type: 'modify',
        file_type: 'code',
        language: 'typescript',
        summary: 'Added new prop to Button component'
      },
      {
        id: 'change_002', 
        timestamp: new Date(Date.now() - 600000).toISOString(),
        file_path: '/src/utils/helpers.ts',
        change_type: 'create',
        file_type: 'code',
        language: 'typescript',
        summary: 'Created new helper functions'
      }
    ];

    // 필터 적용
    let filteredHistory = mockHistory;
    
    if (args.history_filter) {
      const { since, file_type, change_type, limit = 50 } = args.history_filter;
      
      if (since) {
        const sinceDate = new Date(since);
        filteredHistory = filteredHistory.filter(event => 
          new Date(event.timestamp) >= sinceDate
        );
      }
      
      if (file_type) {
        filteredHistory = filteredHistory.filter(event => 
          event.file_type === file_type
        );
      }
      
      if (change_type) {
        filteredHistory = filteredHistory.filter(event => 
          event.change_type === change_type
        );
      }
      
      filteredHistory = filteredHistory.slice(0, limit);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'history',
            results: {
              total_events: filteredHistory.length,
              events: filteredHistory,
              filter_applied: args.history_filter
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  private async getStatistics() {
    const statistics = this.monitor.getStatistics();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'statistics',
            results: {
              ...statistics,
              monitoring_status: {
                is_active: this.isMonitoring,
                monitored_projects: this.monitoredProjects.size,
                uptime: this.isMonitoring ? 'active' : 'inactive'
              }
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  private setupEventListeners() {
    this.monitor.on('code_changed', (event) => {
      console.log(`[MonitorRealtime] Code changed: ${event.file_path} (${event.change_type})`);
    });

    this.monitor.on('auto_action_completed', (data) => {
      console.log(`[MonitorRealtime] Auto action completed: ${data.action} for ${data.event.file_path}`);
    });

    this.monitor.on('batch_summary', (summary) => {
      console.log(`[MonitorRealtime] Batch summary: ${summary.total_changes} changes in ${summary.period}`);
    });

    this.monitor.on('monitoring_started', (data) => {
      console.log(`[MonitorRealtime] Monitoring started for: ${data.projectPath}`);
    });
  }
}