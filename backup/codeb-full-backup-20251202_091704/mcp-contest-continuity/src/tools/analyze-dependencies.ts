/**
 * Analyze Dependencies Tool
 * 
 * 중복 의존성 분석 및 자동 정리 도구
 */

import { DependencyAnalyzer } from '../lib/dependency-analyzer.js';

interface AnalyzeDependenciesArgs {
  project_path: string;
  options?: {
    auto_cleanup?: boolean;
    dry_run?: boolean;
    include_unused?: boolean;
    include_conflicts?: boolean;
  };
}

export class AnalyzeDependenciesTool {
  private analyzer: DependencyAnalyzer;

  constructor() {
    this.analyzer = new DependencyAnalyzer();
  }

  async execute(args: AnalyzeDependenciesArgs) {
    try {
      const { project_path, options = {} } = args;

      console.log(`[AnalyzeDependencies] Starting analysis for: ${project_path}`);

      // 의존성 분석 실행
      const analysis = await this.analyzer.analyzeDependencies(project_path);

      // 요약 정보 생성
      const summary = {
        total_dependencies: this.countTotalDependencies(analysis),
        duplicates_found: analysis.duplicates.length,
        unused_found: analysis.unused.length,
        conflicts_found: analysis.conflicts.length,
        recommendations: analysis.recommendations.length
      };

      let cleanupResult = null;

      // 자동 정리 옵션이 활성화된 경우
      if (options.auto_cleanup) {
        cleanupResult = await this.analyzer.autoCleanup(project_path, analysis, {
          dryRun: options.dry_run || true,
          removeUnused: options.include_unused || true,
          consolidateDuplicates: true
        });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              summary,
              analysis: this.formatAnalysisForDisplay(analysis),
              cleanup_result: cleanupResult,
              timestamp: new Date().toISOString()
            }, null, 2)
          }
        ]
      };
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

  private countTotalDependencies(analysis: any): number {
    // 간단한 의존성 개수 계산 로직
    return analysis.duplicates.length + analysis.unused.length + 50; // 예시
  }

  private formatAnalysisForDisplay(analysis: any) {
    return {
      duplicates: analysis.duplicates.map((dup: any) => ({
        package: dup.package_name,
        versions: dup.versions,
        severity: dup.severity,
        recommendation: dup.recommended_version
      })),
      unused: analysis.unused.map((unused: any) => ({
        package: unused.package_name,
        confidence: `${(unused.confidence * 100).toFixed(1)}%`,
        location: unused.declared_in
      })),
      conflicts: analysis.conflicts.map((conflict: any) => ({
        package: conflict.package_name,
        conflicting_versions: conflict.conflicting_versions,
        resolution: conflict.resolution_strategy
      })),
      top_recommendations: analysis.recommendations.slice(0, 5)
    };
  }
}