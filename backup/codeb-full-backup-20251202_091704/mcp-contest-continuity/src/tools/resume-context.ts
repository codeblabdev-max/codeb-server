/**
 * MCP Contest Continuity - Resume Context Tool
 * 
 * Resumes development from a previously captured context
 */

import { z } from 'zod';
import { ContestContextManager } from '../lib/context-manager.js';
import type { MCPTool, CapturedContext } from '../types/index.js';

const ResumeContextSchema = z.object({
  contextId: z.string().describe('ID of the context to resume'),
  projectPath: z.string().describe('Current project path'),
  generateRecommendations: z.boolean().default(true).describe('Generate development recommendations'),
  updateContext: z.boolean().default(false).describe('Update context with current state')
});

export class ResumeContextTool implements MCPTool {
  name = 'resume_context' as const;
  description = 'Resume development from a captured context';
  inputSchema = ResumeContextSchema;
  
  private contextManager: ContestContextManager;
  
  constructor() {
    this.contextManager = new ContestContextManager();
  }
  
  async execute(args: z.infer<typeof ResumeContextSchema>): Promise<{
    success: boolean;
    context?: CapturedContext;
    recommendations: string[];
    continuity_plan: string;
    missing_components?: string[];
    error?: string;
  }> {
    try {
      const { contextId, projectPath, generateRecommendations, updateContext } = args;
      
      // Resume context using ContextManager
      const result = await this.contextManager.resumeContext(contextId, projectPath);
      
      if (!result.success || !result.context) {
        return {
          success: false,
          recommendations: [],
          continuity_plan: 'Unable to resume context',
          error: result.error || 'Failed to load context'
        };
      }
      
      const { context, missingComponents } = result;
      
      // Generate recommendations if requested
      const recommendations = generateRecommendations 
        ? this.generateRecommendations(context, missingComponents)
        : [];
      
      // Create continuity plan
      const continuityPlan = this.createContinuityPlan(context, missingComponents);
      
      // Update context if requested
      if (updateContext) {
        await this.contextManager.captureContext(projectPath, `${contextId}_updated`);
      }
      
      return {
        success: true,
        context,
        recommendations,
        continuity_plan: continuityPlan,
        missing_components: missingComponents
      };
      
    } catch (error) {
      return {
        success: false,
        recommendations: [],
        continuity_plan: 'Context resume failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  private generateRecommendations(context: CapturedContext, missingComponents: string[]): string[] {
    const recommendations: string[] = [];
    
    // Check for missing components
    if (missingComponents.length > 0) {
      recommendations.push(`Restore missing components: ${missingComponents.join(', ')}`);
    }
    
    // Framework-specific recommendations
    if (context.projectStructure.framework === 'Next.js') {
      recommendations.push('Verify Next.js configuration and dependencies');
      if (context.codePatterns.components?.some(c => c.type === 'page')) {
        recommendations.push('Review page routing and API endpoints');
      }
    } else if (context.projectStructure.framework === 'Remix') {
      recommendations.push('Check Remix routes and loader functions');
      recommendations.push('Verify action functions and form handling');
    }
    
    // Test recommendations
    if (context.testInfo?.coverage && context.testInfo.coverage < 80) {
      recommendations.push(`Improve test coverage (current: ${context.testInfo.coverage}%)`);
    }
    
    // Pattern-based recommendations
    const components = context.codePatterns.components || [];
    const untested = components.filter(c => !c.hasTests);
    if (untested.length > 0) {
      recommendations.push(`Add tests for components: ${untested.map(c => c.name).join(', ')}`);
    }
    
    // Performance recommendations
    const largeComponents = components.filter(c => (c.complexity || 0) > 10);
    if (largeComponents.length > 0) {
      recommendations.push(`Consider refactoring complex components: ${largeComponents.map(c => c.name).join(', ')}`);
    }
    
    return recommendations;
  }
  
  private createContinuityPlan(context: CapturedContext, missingComponents: string[]): string {
    const timestamp = new Date().toISOString();
    const framework = context.projectStructure.framework || 'Unknown';
    const componentCount = context.codePatterns.components?.length || 0;
    
    let plan = `# Contest Continuity Plan - ${timestamp}\n\n`;
    plan += `## Context Summary\n`;
    plan += `- Framework: ${framework}\n`;
    plan += `- Components: ${componentCount}\n`;
    plan += `- Last captured: ${new Date(context.timestamp).toISOString()}\n\n`;
    
    if (missingComponents.length > 0) {
      plan += `## ⚠️ Missing Components\n`;
      missingComponents.forEach(component => {
        plan += `- ${component}\n`;
      });
      plan += `\n`;
    }
    
    plan += `## 🎯 Development Focus\n`;
    
    // Add focus areas based on context
    if (context.codePatterns.components?.some(c => !c.hasTests)) {
      plan += `- Add missing test coverage\n`;
    }
    
    if (context.testInfo?.coverage && context.testInfo.coverage < 80) {
      plan += `- Improve overall test coverage\n`;
    }
    
    plan += `- Continue with established patterns\n`;
    plan += `- Maintain architectural consistency\n\n`;
    
    plan += `## 📋 Next Steps\n`;
    plan += `1. Restore any missing components\n`;
    plan += `2. Run existing tests to verify state\n`;
    plan += `3. Continue development from last checkpoint\n`;
    plan += `4. Update context regularly for continuity\n`;
    
    return plan;
  }
}