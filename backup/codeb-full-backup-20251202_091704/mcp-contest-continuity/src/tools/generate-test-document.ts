/**
 * MCP Contest Continuity - Generate Test Document Tool
 * 
 * Generates comprehensive test documents from captured context
 */

import { z } from 'zod';
import { TestDocumentGenerator } from '../lib/test-generator.js';
import { ContestContextManager } from '../lib/context-manager.js';
import type { MCPTool, TestDocument } from '../types/index.js';

const GenerateTestDocumentSchema = z.object({
  contextId: z.string().describe('Context ID to generate tests from'),
  outputPath: z.string().describe('Path where to save the test document'),
  testTypes: z.array(z.enum(['ui', 'api', 'database', 'integration', 'e2e']))
    .default(['ui', 'api', 'integration'])
    .describe('Types of tests to generate'),
  includeSetup: z.boolean().default(true).describe('Include test setup and configuration'),
  generateMockData: z.boolean().default(true).describe('Generate mock data for tests'),
  splitByComponent: z.boolean().default(false).describe('Split tests by component into separate files')
});

export class GenerateTestDocumentTool implements MCPTool {
  name = 'generate_test_document' as const;
  description = 'Generate comprehensive test documents from captured context';
  inputSchema = GenerateTestDocumentSchema;
  
  private testGenerator: TestDocumentGenerator;
  private contextManager: ContestContextManager;
  
  constructor() {
    this.testGenerator = new TestDocumentGenerator();
    this.contextManager = new ContestContextManager();
  }
  
  async execute(args: z.infer<typeof GenerateTestDocumentSchema>): Promise<{
    success: boolean;
    documents: Array<{
      path: string;
      content: string;
      type: string;
    }>;
    summary: string;
    testCount: number;
    error?: string;
  }> {
    try {
      const { 
        contextId, 
        outputPath, 
        testTypes, 
        includeSetup, 
        generateMockData, 
        splitByComponent 
      } = args;
      
      // Load context
      const contextResult = await this.contextManager.resumeContext(contextId, '.');
      
      if (!contextResult.success || !contextResult.context) {
        return {
          success: false,
          documents: [],
          summary: 'Failed to load context',
          testCount: 0,
          error: contextResult.error || 'Context not found'
        };
      }
      
      const context = contextResult.context;
      const documents: Array<{ path: string; content: string; type: string; }> = [];
      let totalTestCount = 0;
      
      if (splitByComponent && context.codePatterns.components) {
        // Generate separate test files for each component
        for (const component of context.codePatterns.components) {
          const testDoc = await this.testGenerator.generateTestDocument(
            context,
            {
              testTypes,
              includeSetup,
              generateMockData,
              targetComponent: component.name
            }
          );
          
          if (testDoc) {
            const componentPath = `${outputPath}/${component.name.toLowerCase()}.test.md`;
            documents.push({
              path: componentPath,
              content: testDoc.content,
              type: 'component-test'
            });
            totalTestCount += testDoc.testCount;
          }
        }
        
        // Generate integration tests separately
        if (testTypes.includes('integration') || testTypes.includes('e2e')) {
          const integrationDoc = await this.testGenerator.generateTestDocument(
            context,
            {
              testTypes: testTypes.filter(t => ['integration', 'e2e', 'api'].includes(t)),
              includeSetup,
              generateMockData
            }
          );
          
          if (integrationDoc) {
            documents.push({
              path: `${outputPath}/integration.test.md`,
              content: integrationDoc.content,
              type: 'integration-test'
            });
            totalTestCount += integrationDoc.testCount;
          }
        }
        
      } else {
        // Generate single comprehensive test document
        const testDoc = await this.testGenerator.generateTestDocument(
          context,
          {
            testTypes,
            includeSetup,
            generateMockData
          }
        );
        
        if (!testDoc) {
          return {
            success: false,
            documents: [],
            summary: 'Failed to generate test document',
            testCount: 0,
            error: 'Test generation returned null'
          };
        }
        
        documents.push({
          path: outputPath,
          content: testDoc.content,
          type: 'comprehensive-test'
        });
        totalTestCount = testDoc.testCount;
      }
      
      // Generate summary
      const summary = this.generateSummary({
        documents,
        testCount: totalTestCount,
        testTypes,
        context
      });
      
      return {
        success: true,
        documents,
        summary,
        testCount: totalTestCount
      };
      
    } catch (error) {
      return {
        success: false,
        documents: [],
        summary: 'Test document generation failed',
        testCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  private generateSummary(data: {
    documents: Array<{ path: string; content: string; type: string; }>;
    testCount: number;
    testTypes: string[];
    context: any;
  }): string {
    const { documents, testCount, testTypes, context } = data;
    
    const framework = context.projectStructure?.framework || 'Unknown';
    const componentCount = context.codePatterns?.components?.length || 0;
    
    let summary = `# Test Document Generation Summary\n\n`;
    summary += `- **Framework**: ${framework}\n`;
    summary += `- **Components Analyzed**: ${componentCount}\n`;
    summary += `- **Test Types**: ${testTypes.join(', ')}\n`;
    summary += `- **Documents Generated**: ${documents.length}\n`;
    summary += `- **Total Tests**: ${testCount}\n\n`;
    
    summary += `## Generated Documents\n`;
    documents.forEach((doc, index) => {
      const lines = doc.content.split('\n').length;
      summary += `${index + 1}. **${doc.path}** (${doc.type})\n`;
      summary += `   - ${lines} lines\n`;
      summary += `   - Content preview: ${doc.content.substring(0, 100)}...\n\n`;
    });
    
    if (testTypes.includes('ui')) {
      summary += `✅ UI component tests generated\n`;
    }
    if (testTypes.includes('api')) {
      summary += `✅ API endpoint tests generated\n`;
    }
    if (testTypes.includes('integration')) {
      summary += `✅ Integration tests generated\n`;
    }
    if (testTypes.includes('e2e')) {
      summary += `✅ End-to-end tests generated\n`;
    }
    
    summary += `\n📋 **Next Steps:**\n`;
    summary += `1. Review generated test documents\n`;
    summary += `2. Customize tests for specific requirements\n`;
    summary += `3. Integrate with existing test framework\n`;
    summary += `4. Run tests to verify functionality\n`;
    
    return summary;
  }
}