/**
 * MCP Contest Continuity - Manage Document Versions Tool
 * 
 * Manages document versions with automatic splitting and rollback capabilities
 */

import { z } from 'zod';
import { DocumentVersionManager } from '../lib/version-manager.js';
import type { MCPTool } from '../types/index.js';

const ManageDocumentVersionsSchema = z.object({
  action: z.enum(['backup', 'rollback', 'split', 'list', 'cleanup']).describe('Version management action'),
  documentPath: z.string().describe('Path to the document'),
  version: z.string().optional().describe('Version identifier (for rollback)'),
  reason: z.string().optional().describe('Reason for backup/rollback'),
  splitThreshold: z.number().default(500).describe('Line threshold for automatic splitting'),
  keepVersions: z.number().default(10).describe('Number of versions to keep during cleanup')
});

export class ManageDocumentVersionsTool implements MCPTool {
  name = 'manage_document_versions' as const;
  description = 'Manage document versions with backup, rollback, and splitting capabilities';
  inputSchema = ManageDocumentVersionsSchema;
  
  private versionManager: DocumentVersionManager;
  
  constructor() {
    this.versionManager = new DocumentVersionManager();
  }
  
  async execute(args: z.infer<typeof ManageDocumentVersionsSchema>): Promise<{
    success: boolean;
    action: string;
    result: any;
    message: string;
    error?: string;
  }> {
    try {
      const { action, documentPath, version, reason, splitThreshold, keepVersions } = args;
      
      switch (action) {
        case 'backup':
          return await this.handleBackup(documentPath, reason);
          
        case 'rollback':
          return await this.handleRollback(documentPath, version, reason);
          
        case 'split':
          return await this.handleSplit(documentPath, splitThreshold);
          
        case 'list':
          return await this.handleList(documentPath);
          
        case 'cleanup':
          return await this.handleCleanup(documentPath, keepVersions);
          
        default:
          return {
            success: false,
            action,
            result: null,
            message: `Unknown action: ${action}`,
            error: `Invalid action: ${action}`
          };
      }
      
    } catch (error) {
      return {
        success: false,
        action: args.action,
        result: null,
        message: 'Document version management failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  private async handleBackup(documentPath: string, reason?: string): Promise<{
    success: boolean;
    action: string;
    result: any;
    message: string;
    error?: string;
  }> {
    try {
      const backupResult = await this.versionManager.backupDocument(documentPath, reason);
      
      if (!backupResult.success) {
        return {
          success: false,
          action: 'backup',
          result: null,
          message: 'Document backup failed',
          error: backupResult.error
        };
      }
      
      return {
        success: true,
        action: 'backup',
        result: {
          version: backupResult.version,
          timestamp: backupResult.timestamp,
          reason: reason || 'Manual backup',
          path: backupResult.backupPath
        },
        message: `Document backed up as version ${backupResult.version}`
      };
      
    } catch (error) {
      return {
        success: false,
        action: 'backup',
        result: null,
        message: 'Backup operation failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  private async handleRollback(documentPath: string, version?: string, reason?: string): Promise<{
    success: boolean;
    action: string;
    result: any;
    message: string;
    error?: string;
  }> {
    try {
      if (!version) {
        return {
          success: false,
          action: 'rollback',
          result: null,
          message: 'Version is required for rollback',
          error: 'Missing version parameter'
        };
      }
      
      const rollbackResult = await this.versionManager.rollbackDocument(documentPath, version, reason);
      
      if (!rollbackResult.success) {
        return {
          success: false,
          action: 'rollback',
          result: null,
          message: 'Document rollback failed',
          error: rollbackResult.error
        };
      }
      
      return {
        success: true,
        action: 'rollback',
        result: {
          version,
          timestamp: rollbackResult.timestamp,
          reason: reason || 'Manual rollback',
          changes: rollbackResult.changes
        },
        message: `Document rolled back to version ${version}`
      };
      
    } catch (error) {
      return {
        success: false,
        action: 'rollback',
        result: null,
        message: 'Rollback operation failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  private async handleSplit(documentPath: string, splitThreshold: number): Promise<{
    success: boolean;
    action: string;
    result: any;
    message: string;
    error?: string;
  }> {
    try {
      const splitResult = await this.versionManager.checkAndSplit(documentPath, splitThreshold);
      
      if (!splitResult.wasSplit) {
        return {
          success: true,
          action: 'split',
          result: {
            wasSplit: false,
            reason: splitResult.reason,
            lineCount: splitResult.currentLines,
            threshold: splitThreshold
          },
          message: splitResult.reason || 'Document does not need splitting'
        };
      }
      
      return {
        success: true,
        action: 'split',
        result: {
          wasSplit: true,
          originalPath: documentPath,
          newParts: splitResult.newFiles,
          backupVersion: splitResult.backupVersion
        },
        message: `Document split into ${splitResult.newFiles?.length || 0} parts`
      };
      
    } catch (error) {
      return {
        success: false,
        action: 'split',
        result: null,
        message: 'Document split operation failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  private async handleList(documentPath: string): Promise<{
    success: boolean;
    action: string;
    result: any;
    message: string;
    error?: string;
  }> {
    try {
      const versions = await this.versionManager.listVersions(documentPath);
      
      return {
        success: true,
        action: 'list',
        result: {
          documentPath,
          versions: versions.map(v => ({
            version: v.version,
            timestamp: v.timestamp,
            reason: v.reason || 'No reason provided',
            size: v.size,
            changes: v.changes
          })),
          count: versions.length
        },
        message: `Found ${versions.length} versions for document`
      };
      
    } catch (error) {
      return {
        success: false,
        action: 'list',
        result: null,
        message: 'Failed to list document versions',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  private async handleCleanup(documentPath: string, keepVersions: number): Promise<{
    success: boolean;
    action: string;
    result: any;
    message: string;
    error?: string;
  }> {
    try {
      const cleanupResult = await this.versionManager.cleanupVersions(documentPath, keepVersions);
      
      return {
        success: true,
        action: 'cleanup',
        result: {
          documentPath,
          versionsRemoved: cleanupResult.removedCount,
          versionsKept: cleanupResult.keptCount,
          spaceFreed: cleanupResult.spaceFreed
        },
        message: `Cleaned up ${cleanupResult.removedCount} old versions, kept ${cleanupResult.keptCount}`
      };
      
    } catch (error) {
      return {
        success: false,
        action: 'cleanup',
        result: null,
        message: 'Version cleanup failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}