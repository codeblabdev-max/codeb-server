/**
 * Dependency Analyzer
 * 
 * 중복 의존성 자동 탐지 및 제거 시스템
 * - package.json 분석 및 중복 의존성 탐지
 * - 실제 사용되지 않는 의존성 식별
 * - 버전 충돌 해결 제안
 * - 자동 정리 및 최적화
 */

import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { z } from 'zod';
import semver from 'semver';

// 의존성 분석 결과 스키마
const DependencyAnalysisSchema = z.object({
  project_path: z.string(),
  analysis_date: z.string(),
  duplicates: z.array(z.object({
    package_name: z.string(),
    versions: z.array(z.string()),
    locations: z.array(z.string()),
    recommended_version: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical'])
  })),
  unused: z.array(z.object({
    package_name: z.string(),
    declared_in: z.string(),
    confidence: z.number() // 0-1, 1이 확실히 미사용
  })),
  conflicts: z.array(z.object({
    package_name: z.string(),
    conflicting_versions: z.array(z.string()),
    resolution_strategy: z.string()
  })),
  recommendations: z.array(z.object({
    type: z.enum(['remove', 'upgrade', 'downgrade', 'consolidate']),
    package_name: z.string(),
    current_version: z.string().optional(),
    target_version: z.string().optional(),
    reason: z.string()
  }))
});

export type DependencyAnalysis = z.infer<typeof DependencyAnalysisSchema>;

interface PackageInfo {
  name: string;
  version: string;
  location: string; // package.json 위치
  type: 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies';
}

interface UsageInfo {
  package_name: string;
  import_count: number;
  files: string[];
  import_patterns: string[];
}

export class DependencyAnalyzer {
  private cacheDir: string;

  constructor(cacheDir = '.mcp-cache/dependency-analysis') {
    this.cacheDir = cacheDir;
  }

  /**
   * 프로젝트의 의존성 분석 실행
   */
  async analyzeDependencies(projectPath: string): Promise<DependencyAnalysis> {
    console.log(`[DependencyAnalyzer] Analyzing dependencies in: ${projectPath}`);

    // 1. 모든 package.json 파일 찾기
    const packageJsonFiles = await this.findPackageJsonFiles(projectPath);
    
    // 2. 의존성 정보 추출
    const allDependencies = await this.extractDependencies(packageJsonFiles);
    
    // 3. 실제 사용량 분석
    const usageInfo = await this.analyzeUsage(projectPath, allDependencies);
    
    // 4. 중복 탐지
    const duplicates = this.detectDuplicates(allDependencies);
    
    // 5. 미사용 의존성 탐지
    const unused = this.detectUnused(allDependencies, usageInfo);
    
    // 6. 버전 충돌 탐지
    const conflicts = this.detectVersionConflicts(allDependencies);
    
    // 7. 최적화 제안 생성
    const recommendations = this.generateRecommendations(duplicates, unused, conflicts);

    const analysis: DependencyAnalysis = {
      project_path: projectPath,
      analysis_date: new Date().toISOString(),
      duplicates,
      unused,
      conflicts,
      recommendations
    };

    // 결과 캐싱
    await this.cacheAnalysis(projectPath, analysis);

    return analysis;
  }

  /**
   * 프로젝트 내 모든 package.json 파일 찾기
   */
  private async findPackageJsonFiles(projectPath: string): Promise<string[]> {
    const pattern = path.join(projectPath, '**/package.json');
    const files = await glob(pattern, {
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
    });
    
    return files;
  }

  /**
   * package.json 파일들에서 의존성 정보 추출
   */
  private async extractDependencies(packageJsonFiles: string[]): Promise<PackageInfo[]> {
    const allDeps: PackageInfo[] = [];

    for (const file of packageJsonFiles) {
      try {
        const content = await fs.readJson(file);
        const depTypes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;

        for (const type of depTypes) {
          const deps = content[type] || {};
          for (const [name, version] of Object.entries(deps)) {
            allDeps.push({
              name,
              version: version as string,
              location: file,
              type
            });
          }
        }
      } catch (error) {
        console.warn(`[DependencyAnalyzer] Failed to read ${file}:`, error);
      }
    }

    return allDeps;
  }

  /**
   * 실제 코드에서의 의존성 사용량 분석
   */
  private async analyzeUsage(projectPath: string, dependencies: PackageInfo[]): Promise<UsageInfo[]> {
    const usageMap = new Map<string, UsageInfo>();
    
    // 분석할 파일 패턴
    const codeFiles = await glob(path.join(projectPath, '**/*.{js,ts,jsx,tsx,vue}'), {
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
    });

    for (const file of codeFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        
        // import/require 패턴 매칭
        const importRegexes = [
          /import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g,
          /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
          /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
          /from\s+['"`]([^'"`]+)['"`]/g
        ];

        for (const regex of importRegexes) {
          let match;
          while ((match = regex.exec(content)) !== null) {
            const importPath = match[1];
            
            // 외부 패키지인지 확인 (상대 경로가 아닌 경우)
            if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
              const packageName = this.extractPackageName(importPath);
              
              if (!usageMap.has(packageName)) {
                usageMap.set(packageName, {
                  package_name: packageName,
                  import_count: 0,
                  files: [],
                  import_patterns: []
                });
              }

              const usage = usageMap.get(packageName)!;
              usage.import_count++;
              if (!usage.files.includes(file)) {
                usage.files.push(file);
              }
              if (!usage.import_patterns.includes(importPath)) {
                usage.import_patterns.push(importPath);
              }
            }
          }
        }
      } catch (error) {
        console.warn(`[DependencyAnalyzer] Failed to analyze ${file}:`, error);
      }
    }

    return Array.from(usageMap.values());
  }

  /**
   * import 경로에서 패키지 이름 추출
   */
  private extractPackageName(importPath: string): string {
    // @scope/package/path → @scope/package
    // package/path → package
    if (importPath.startsWith('@')) {
      const parts = importPath.split('/');
      return parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
    } else {
      return importPath.split('/')[0];
    }
  }

  /**
   * 중복 의존성 탐지
   */
  private detectDuplicates(dependencies: PackageInfo[]): DependencyAnalysis['duplicates'] {
    const packageMap = new Map<string, PackageInfo[]>();

    // 패키지별로 그룹화
    for (const dep of dependencies) {
      if (!packageMap.has(dep.name)) {
        packageMap.set(dep.name, []);
      }
      packageMap.get(dep.name)!.push(dep);
    }

    const duplicates: DependencyAnalysis['duplicates'] = [];

    // 중복 탐지
    for (const [packageName, deps] of packageMap) {
      const versions = [...new Set(deps.map(d => d.version))];
      
      if (versions.length > 1) {
        // 권장 버전 결정 (가장 높은 호환 버전)
        const recommendedVersion = this.selectRecommendedVersion(versions);
        
        // 심각도 평가
        const severity = this.assessDuplicateSeverity(versions);

        duplicates.push({
          package_name: packageName,
          versions,
          locations: deps.map(d => d.location),
          recommended_version: recommendedVersion,
          severity
        });
      }
    }

    return duplicates;
  }

  /**
   * 미사용 의존성 탐지
   */
  private detectUnused(dependencies: PackageInfo[], usageInfo: UsageInfo[]): DependencyAnalysis['unused'] {
    const usageMap = new Map(usageInfo.map(u => [u.package_name, u]));
    const unused: DependencyAnalysis['unused'] = [];

    for (const dep of dependencies) {
      const usage = usageMap.get(dep.name);
      
      if (!usage) {
        // 전혀 사용되지 않음
        unused.push({
          package_name: dep.name,
          declared_in: dep.location,
          confidence: 0.9 // TypeScript 타입 등 간접 사용 가능성 고려
        });
      } else if (usage.import_count === 0) {
        // 선언되어 있지만 import되지 않음
        unused.push({
          package_name: dep.name,
          declared_in: dep.location,
          confidence: 0.8
        });
      }
    }

    return unused;
  }

  /**
   * 버전 충돌 탐지
   */
  private detectVersionConflicts(dependencies: PackageInfo[]): DependencyAnalysis['conflicts'] {
    const conflicts: DependencyAnalysis['conflicts'] = [];
    const packageMap = new Map<string, PackageInfo[]>();

    // 패키지별 그룹화
    for (const dep of dependencies) {
      if (!packageMap.has(dep.name)) {
        packageMap.set(dep.name, []);
      }
      packageMap.get(dep.name)!.push(dep);
    }

    for (const [packageName, deps] of packageMap) {
      const versions = [...new Set(deps.map(d => d.version))];
      
      if (versions.length > 1) {
        // 호환성 검사
        const hasConflicts = this.checkVersionCompatibility(versions);
        
        if (hasConflicts) {
          conflicts.push({
            package_name: packageName,
            conflicting_versions: versions,
            resolution_strategy: this.suggestResolutionStrategy(versions)
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * 최적화 제안 생성
   */
  private generateRecommendations(
    duplicates: DependencyAnalysis['duplicates'],
    unused: DependencyAnalysis['unused'],
    conflicts: DependencyAnalysis['conflicts']
  ): DependencyAnalysis['recommendations'] {
    const recommendations: DependencyAnalysis['recommendations'] = [];

    // 미사용 의존성 제거 제안
    for (const unusedDep of unused) {
      if (unusedDep.confidence > 0.8) {
        recommendations.push({
          type: 'remove',
          package_name: unusedDep.package_name,
          reason: `Unused dependency with ${(unusedDep.confidence * 100).toFixed(0)}% confidence`
        });
      }
    }

    // 중복 의존성 통합 제안
    for (const duplicate of duplicates) {
      if (duplicate.severity === 'high' || duplicate.severity === 'critical') {
        recommendations.push({
          type: 'consolidate',
          package_name: duplicate.package_name,
          target_version: duplicate.recommended_version,
          reason: `Multiple versions detected (${duplicate.versions.join(', ')}). Consolidate to ${duplicate.recommended_version}`
        });
      }
    }

    // 버전 충돌 해결 제안
    for (const conflict of conflicts) {
      recommendations.push({
        type: 'upgrade',
        package_name: conflict.package_name,
        reason: `Version conflicts detected. ${conflict.resolution_strategy}`
      });
    }

    return recommendations;
  }

  /**
   * 권장 버전 선택
   */
  private selectRecommendedVersion(versions: string[]): string {
    // 유효한 semver 버전들만 필터링
    const validVersions = versions.filter(v => semver.valid(v));
    
    if (validVersions.length === 0) {
      return versions[0]; // fallback
    }

    // 가장 높은 버전 반환
    return semver.maxSatisfying(validVersions, '*') || validVersions[0];
  }

  /**
   * 중복 심각도 평가
   */
  private assessDuplicateSeverity(versions: string[]): 'low' | 'medium' | 'high' | 'critical' {
    // Major 버전이 다르면 critical
    const majorVersions = new Set(versions.map(v => {
      const parsed = semver.parse(v);
      return parsed ? parsed.major : 0;
    }));

    if (majorVersions.size > 1) {
      return 'critical';
    }

    // Minor 버전이 다르면 high
    const minorVersions = new Set(versions.map(v => {
      const parsed = semver.parse(v);
      return parsed ? `${parsed.major}.${parsed.minor}` : '0.0';
    }));

    if (minorVersions.size > 1) {
      return 'high';
    }

    // Patch 버전만 다르면 medium
    if (versions.length > 2) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * 버전 호환성 검사
   */
  private checkVersionCompatibility(versions: string[]): boolean {
    // 간단한 호환성 검사 - 실제로는 더 복잡한 로직 필요
    const validVersions = versions.filter(v => semver.valid(v));
    
    if (validVersions.length < 2) {
      return false;
    }

    // Major 버전이 다르면 호환성 문제
    const majorVersions = new Set(validVersions.map(v => semver.major(v)));
    return majorVersions.size > 1;
  }

  /**
   * 해결 전략 제안
   */
  private suggestResolutionStrategy(versions: string[]): string {
    const validVersions = versions.filter(v => semver.valid(v));
    
    if (validVersions.length === 0) {
      return 'Manual review required for invalid versions';
    }

    const latest = semver.maxSatisfying(validVersions, '*');
    return `Upgrade all to latest compatible version: ${latest}`;
  }

  /**
   * 분석 결과 캐싱
   */
  private async cacheAnalysis(projectPath: string, analysis: DependencyAnalysis): Promise<void> {
    try {
      await fs.ensureDir(this.cacheDir);
      const fileName = path.basename(projectPath) + '_dependency_analysis.json';
      const filePath = path.join(this.cacheDir, fileName);
      await fs.writeJson(filePath, analysis, { spaces: 2 });
    } catch (error) {
      console.warn('[DependencyAnalyzer] Failed to cache analysis:', error);
    }
  }

  /**
   * 자동 정리 실행 (신중하게 사용)
   */
  async autoCleanup(projectPath: string, analysis: DependencyAnalysis, options = { 
    dryRun: true, 
    removeUnused: true, 
    consolidateDuplicates: true 
  }): Promise<{ applied: string[], skipped: string[] }> {
    const applied: string[] = [];
    const skipped: string[] = [];

    console.log(`[DependencyAnalyzer] ${options.dryRun ? 'Simulating' : 'Applying'} cleanup...`);

    for (const rec of analysis.recommendations) {
      if (rec.type === 'remove' && options.removeUnused) {
        if (options.dryRun) {
          applied.push(`Would remove ${rec.package_name}`);
        } else {
          // 실제 제거 로직 (매우 신중하게 구현)
          skipped.push(`Skipping removal of ${rec.package_name} - requires manual review`);
        }
      } else if (rec.type === 'consolidate' && options.consolidateDuplicates) {
        if (options.dryRun) {
          applied.push(`Would consolidate ${rec.package_name} to ${rec.target_version}`);
        } else {
          skipped.push(`Skipping consolidation of ${rec.package_name} - requires manual review`);
        }
      }
    }

    return { applied, skipped };
  }
}