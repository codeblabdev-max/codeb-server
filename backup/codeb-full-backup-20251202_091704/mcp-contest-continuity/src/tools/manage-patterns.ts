/**
 * Manage Patterns Tool
 * 
 * 패턴 라이브러리 관리 도구
 */

import { PatternLibraryManager } from '../lib/pattern-library.js';

interface ManagePatternsArgs {
  operation: 'extract' | 'search' | 'generate' | 'statistics';
  project_path?: string;
  search_query?: {
    category?: string;
    framework?: string;
    tags?: string[];
    complexity?: string;
    text?: string;
  };
  generation_config?: {
    pattern_id: string;
    variables: Record<string, string>;
    output_path: string;
  };
  extraction_config?: {
    frameworks?: string[];
    include_tests?: boolean;
    min_complexity?: 'simple' | 'moderate' | 'complex';
    extract_from?: ('components' | 'hooks' | 'utilities' | 'services' | 'apis')[];
  };
}

export class ManagePatternsTool {
  private patternManager: PatternLibraryManager;

  constructor() {
    this.patternManager = new PatternLibraryManager();
  }

  async execute(args: ManagePatternsArgs) {
    try {
      // 패턴 라이브러리 초기화
      await this.patternManager.initialize();

      switch (args.operation) {
        case 'extract':
          return await this.extractPatterns(args);
        
        case 'search':
          return await this.searchPatterns(args);
        
        case 'generate':
          return await this.generateCode(args);
        
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

  private async extractPatterns(args: ManagePatternsArgs) {
    if (!args.project_path) {
      throw new Error('project_path is required for extract operation');
    }

    const config = {
      frameworks: args.extraction_config?.frameworks || ['react'],
      include_tests: args.extraction_config?.include_tests || true,
      min_complexity: args.extraction_config?.min_complexity || 'simple',
      extract_from: args.extraction_config?.extract_from || ['components', 'hooks', 'utilities']
    };

    console.log(`[ManagePatterns] Extracting patterns from: ${args.project_path}`);
    
    const extractedPatterns = await this.patternManager.extractPatterns(args.project_path, config);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'extract',
            results: {
              patterns_extracted: extractedPatterns.length,
              patterns: extractedPatterns.map(pattern => ({
                id: pattern.id,
                name: pattern.name,
                category: pattern.category,
                framework: pattern.framework,
                complexity: pattern.complexity,
                tags: pattern.tags,
                description: pattern.description
              }))
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  private async searchPatterns(args: ManagePatternsArgs) {
    if (!args.search_query) {
      throw new Error('search_query is required for search operation');
    }

    console.log(`[ManagePatterns] Searching patterns with query:`, args.search_query);

    const searchResults = this.patternManager.searchPatterns(args.search_query);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'search',
            results: {
              total_found: searchResults.length,
              patterns: searchResults.map(result => ({
                id: result.pattern.id,
                name: result.pattern.name,
                category: result.pattern.category,
                framework: result.pattern.framework,
                complexity: result.pattern.complexity,
                confidence: result.confidence,
                adaptations_needed: result.adaptations_needed,
                description: result.pattern.description,
                tags: result.pattern.tags,
                usage_count: result.pattern.usage_count
              }))
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  private async generateCode(args: ManagePatternsArgs) {
    if (!args.generation_config) {
      throw new Error('generation_config is required for generate operation');
    }

    const { pattern_id, variables, output_path } = args.generation_config;

    console.log(`[ManagePatterns] Generating code from pattern: ${pattern_id}`);

    const result = await this.patternManager.generateCode(pattern_id, variables, output_path);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: result.success,
            operation: 'generate',
            results: {
              pattern_id,
              files_generated: result.files,
              output_path,
              variables_used: variables
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }

  private async getStatistics() {
    const statistics = this.patternManager.getStatistics();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            operation: 'statistics',
            results: statistics,
            timestamp: new Date().toISOString()
          }, null, 2)
        }
      ]
    };
  }
}