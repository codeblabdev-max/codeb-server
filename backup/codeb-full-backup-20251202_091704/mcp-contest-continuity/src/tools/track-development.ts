/**
 * MCP Contest Continuity - Track Development Tool
 * 
 * Tracks development progress and captures context changes in real-time
 */

import { z } from 'zod';
import { DevelopmentTracker } from '../lib/development-tracker.js';
import type { MCPTool } from '../types/index.js';

const TrackDevelopmentSchema = z.object({
  projectPath: z.string().describe('Path to the project to track'),
  action: z.enum(['start', 'stop', 'status', 'snapshot']).describe('Tracking action to perform'),
  contextId: z.string().optional().describe('Context ID to associate with tracking'),
  watchPatterns: z.array(z.string()).default(['**/*.{js,jsx,ts,tsx,vue,py,go,rs,java}'])
    .describe('File patterns to watch for changes'),
  ignorePatterns: z.array(z.string()).default(['node_modules/**', '.git/**', 'dist/**', 'build/**'])
    .describe('Patterns to ignore'),
  snapshotInterval: z.number().default(300000).describe('Snapshot interval in milliseconds (default: 5 minutes)')
});

export class TrackDevelopmentTool implements MCPTool {
  name = 'track_development' as const;
  description = 'Track development progress and capture real-time context changes';
  inputSchema = TrackDevelopmentSchema;
  
  private tracker: DevelopmentTracker;
  
  constructor() {
    this.tracker = new DevelopmentTracker();
  }
  
  async execute(args: z.infer<typeof TrackDevelopmentSchema>): Promise<{
    success: boolean;
    action: string;
    status: string;
    data?: any;
    error?: string;
  }> {
    try {
      const { 
        projectPath, 
        action, 
        contextId, 
        watchPatterns, 
        ignorePatterns, 
        snapshotInterval 
      } = args;
      
      switch (action) {
        case 'start':
          return await this.handleStart(projectPath, {
            contextId,
            watchPatterns,
            ignorePatterns,
            snapshotInterval
          });
          
        case 'stop':
          return await this.handleStop(projectPath);
          
        case 'status':
          return await this.handleStatus(projectPath);
          
        case 'snapshot':
          return await this.handleSnapshot(projectPath, contextId);
          
        default:
          return {
            success: false,
            action,
            status: 'unknown_action',
            error: `Unknown action: ${action}`
          };
      }
      
    } catch (error) {
      return {
        success: false,
        action: args.action,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  private async handleStart(projectPath: string, options: {
    contextId?: string;
    watchPatterns: string[];
    ignorePatterns: string[];
    snapshotInterval: number;
  }): Promise<{
    success: boolean;
    action: string;
    status: string;
    data?: any;
    error?: string;
  }> {
    try {
      const isTracking = this.tracker.isTracking(projectPath);
      
      if (isTracking) {
        return {
          success: false,
          action: 'start',
          status: 'already_tracking',
          error: 'Development tracking is already active for this project'
        };
      }
      
      await this.tracker.startTracking(projectPath, options);
      
      return {
        success: true,
        action: 'start',
        status: 'tracking_started',
        data: {
          projectPath,
          contextId: options.contextId,
          watchPatterns: options.watchPatterns,
          ignorePatterns: options.ignorePatterns,
          snapshotInterval: options.snapshotInterval,
          startedAt: new Date().toISOString()
        }
      };
      
    } catch (error) {
      return {
        success: false,
        action: 'start',
        status: 'start_failed',
        error: error instanceof Error ? error.message : 'Failed to start tracking'
      };
    }
  }
  
  private async handleStop(projectPath: string): Promise<{
    success: boolean;
    action: string;
    status: string;
    data?: any;
    error?: string;
  }> {
    try {
      const isTracking = this.tracker.isTracking(projectPath);
      
      if (!isTracking) {
        return {
          success: false,
          action: 'stop',
          status: 'not_tracking',
          error: 'Development tracking is not active for this project'
        };
      }
      
      const summary = await this.tracker.stopTracking(projectPath);
      
      return {
        success: true,
        action: 'stop',
        status: 'tracking_stopped',
        data: {
          summary,
          stoppedAt: new Date().toISOString()
        }
      };
      
    } catch (error) {
      return {
        success: false,
        action: 'stop',
        status: 'stop_failed',
        error: error instanceof Error ? error.message : 'Failed to stop tracking'
      };
    }
  }
  
  private async handleStatus(projectPath: string): Promise<{
    success: boolean;
    action: string;
    status: string;
    data?: any;
    error?: string;
  }> {
    try {
      const isTracking = this.tracker.isTracking(projectPath);
      const stats = this.tracker.getTrackingStats(projectPath);
      
      return {
        success: true,
        action: 'status',
        status: isTracking ? 'tracking_active' : 'tracking_inactive',
        data: {
          isTracking,
          stats: stats || {
            filesWatched: 0,
            changesDetected: 0,
            snapshotsTaken: 0,
            lastActivity: null
          }
        }
      };
      
    } catch (error) {
      return {
        success: false,
        action: 'status',
        status: 'status_failed',
        error: error instanceof Error ? error.message : 'Failed to get tracking status'
      };
    }
  }
  
  private async handleSnapshot(projectPath: string, contextId?: string): Promise<{
    success: boolean;
    action: string;
    status: string;
    data?: any;
    error?: string;
  }> {
    try {
      const snapshot = await this.tracker.captureContextSnapshot(projectPath, contextId);
      
      if (!snapshot) {
        return {
          success: false,
          action: 'snapshot',
          status: 'snapshot_failed',
          error: 'Failed to capture development snapshot'
        };
      }
      
      return {
        success: true,
        action: 'snapshot',
        status: 'snapshot_captured',
        data: {
          snapshotId: snapshot.id,
          timestamp: snapshot.timestamp,
          changes: snapshot.changes,
          patterns: snapshot.patterns,
          summary: this.generateSnapshotSummary(snapshot)
        }
      };
      
    } catch (error) {
      return {
        success: false,
        action: 'snapshot',
        status: 'snapshot_failed',
        error: error instanceof Error ? error.message : 'Failed to capture snapshot'
      };
    }
  }
  
  private generateSnapshotSummary(snapshot: any): string {
    const changeCount = snapshot.changes?.length || 0;
    const patternCount = Object.keys(snapshot.patterns || {}).length;
    
    let summary = `Development Snapshot - ${new Date(snapshot.timestamp).toISOString()}\n`;
    summary += `- Changes detected: ${changeCount}\n`;
    summary += `- Patterns identified: ${patternCount}\n`;
    
    if (snapshot.changes && snapshot.changes.length > 0) {
      const fileChanges = snapshot.changes.reduce((acc: any, change: any) => {
        acc[change.type] = (acc[change.type] || 0) + 1;
        return acc;
      }, {});
      
      summary += `- File changes: `;
      Object.entries(fileChanges).forEach(([type, count], index) => {
        summary += `${type}: ${count}`;
        if (index < Object.entries(fileChanges).length - 1) summary += ', ';
      });
      summary += '\n';
    }
    
    return summary;
  }
}