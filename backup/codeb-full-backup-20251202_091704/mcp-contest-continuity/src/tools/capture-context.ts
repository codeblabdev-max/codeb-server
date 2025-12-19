/**
 * MCP Contest Continuity - Capture Context Tool
 * 
 * Captures and stores development context for contest continuity
 */

import { z } from 'zod';
import { ContestContextManager } from '../lib/context-manager.js';
import type { MCPTool, CapturedContext } from '../types/index.js';

const CaptureContextSchema = z.object({
  projectPath: z.string().describe('Path to the project directory'),
  contextName: z.string().optional().describe('Name for this context capture'),
  includeTests: z.boolean().default(true).describe('Include test files in analysis'),
  analyzePatterns: z.boolean().default(true).describe('Analyze code patterns and structures')
});

export class CaptureContextTool implements MCPTool {
  name = 'capture_context' as const;
  description = 'Capture current development context for contest continuity';
  inputSchema = CaptureContextSchema;
  
  private contextManager: ContestContextManager;
  
  constructor() {
    this.contextManager = new ContestContextManager();
  }
  
  async execute(args: z.infer<typeof CaptureContextSchema>): Promise<{
    success: boolean;
    contextId: string;
    summary: string;
    details?: CapturedContext;
    error?: string;
  }> {
    try {
      const { projectPath, contextName, includeTests, analyzePatterns } = args;
      
      // Capture the context using ContextManager
      const context = await this.contextManager.captureContext(
        projectPath,
        contextName || `context_${Date.now()}`
      );
      
      if (!context) {
        return {
          success: false,
          contextId: '',
          summary: 'Failed to capture context',
          error: 'Context capture returned null'
        };
      }
      
      // Generate summary
      const summary = this.generateSummary(context);
      
      return {
        success: true,
        contextId: context.id,
        summary,
        details: includeTests ? context : {
          ...context,
          testInfo: undefined
        }
      };
      
    } catch (error) {
      return {
        success: false,
        contextId: '',
        summary: 'Context capture failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  private generateSummary(context: CapturedContext): string {
    const {
      projectStructure,
      codePatterns,
      testInfo,
      dependencies,
      timestamp
    } = context;
    
    const fileCount = projectStructure.files?.length || 0;
    const componentCount = codePatterns.components?.length || 0;
    const utilCount = codePatterns.utilities?.length || 0;
    const testCount = testInfo?.testFiles?.length || 0;
    const depCount = dependencies.length;
    
    return `Context captured at ${new Date(timestamp).toISOString()}:
• ${fileCount} files analyzed
• ${componentCount} components found
• ${utilCount} utilities detected
• ${testCount} test files identified
• ${depCount} dependencies tracked
• Framework: ${projectStructure.framework || 'Unknown'}
• Architecture: ${projectStructure.architecture || 'Standard'}`;
  }
}