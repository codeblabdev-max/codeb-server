#!/usr/bin/env node

/**
 * 🎯 CodeB Wave 2 성능 분석기
 * 59+ 에이전트 시스템을 위한 정밀 성능 분석
 */

const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

class CodeBPerformanceAnalyzer {
    constructor() {
        this.metrics = {
            bundle: {
                currentSize: 0,
                targetReduction: 0.5, // 50% 감소 목표
                dependencies: [],
                duplicates: []
            },
            memory: {
                currentUsage: 0,
                targetReduction: 0.6, // 60% 감소 목표
                leaks: [],
                hotspots: []
            },
            loadTime: {
                currentTime: 0,
                targetImprovement: 0.4, // 30-50% 개선 목표
                bottlenecks: []
            }
        };
    }

    // 📊 전체 성능 분석 실행
    async analyzeAll() {
        console.log('🎯 ==========================================');
        console.log('🎯 CodeB Wave 2 성능 분석 시작');
        console.log('🎯 ==========================================');

        const startTime = performance.now();

        try {
            // 1. 번들 크기 분석
            console.log('📦 [1/4] 번들 크기 분석 중...');
            await this.analyzeBundleSize();
            
            // 2. 메모리 사용량 분석
            console.log('💾 [2/4] 메모리 사용량 분석 중...');
            await this.analyzeMemoryUsage();
            
            // 3. 로딩 시간 분석
            console.log('⚡ [3/4] 로딩 시간 분석 중...');
            await this.analyzeLoadTime();
            
            // 4. 종합 보고서 생성
            console.log('📋 [4/4] 종합 보고서 생성 중...');
            const report = await this.generateReport();
            
            const endTime = performance.now();
            console.log(`✅ 분석 완료 (${Math.round(endTime - startTime)}ms)`);
            
            return report;
            
        } catch (error) {
            console.error('❌ 성능 분석 실패:', error.message);
            throw error;
        }
    }

    // 📦 번들 크기 분석
    async analyzeBundleSize() {
        const srcPath = './src';
        let totalSize = 0;
        const dependencies = new Set();
        const duplicates = [];

        async function scanDirectory(dir) {
            const items = await fs.readdir(dir);
            
            for (const item of items) {
                const itemPath = path.join(dir, item);
                const stats = await fs.stat(itemPath);
                
                if (stats.isDirectory()) {
                    await scanDirectory(itemPath);
                } else if (item.endsWith('.js')) {
                    totalSize += stats.size;
                    
                    // require 문 분석
                    const content = await fs.readFile(itemPath, 'utf8');
                    const requireMatches = content.match(/require\(['"`]([^'"`]+)['"`]\)/g);
                    
                    if (requireMatches) {
                        requireMatches.forEach(req => {
                            const dep = req.match(/require\(['"`]([^'"`]+)['"`]\)/)[1];
                            dependencies.add(dep);
                        });
                    }
                }
            }
        }

        await scanDirectory(srcPath);

        this.metrics.bundle.currentSize = totalSize;
        this.metrics.bundle.dependencies = Array.from(dependencies);
        
        // 중복 의존성 찾기
        const depCount = {};
        this.metrics.bundle.dependencies.forEach(dep => {
            depCount[dep] = (depCount[dep] || 0) + 1;
        });
        
        this.metrics.bundle.duplicates = Object.entries(depCount)
            .filter(([dep, count]) => count > 1)
            .map(([dep, count]) => ({ dependency: dep, count }));

        console.log(`  📦 현재 번들 크기: ${Math.round(totalSize / 1024)}KB`);
        console.log(`  📦 의존성 수: ${dependencies.size}개`);
        console.log(`  📦 중복 의존성: ${this.metrics.bundle.duplicates.length}개`);
    }

    // 💾 메모리 사용량 분석
    async analyzeMemoryUsage() {
        const memUsage = process.memoryUsage();
        
        this.metrics.memory.currentUsage = {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            rss: memUsage.rss
        };

        // 메모리 핫스팟 시뮬레이션 (실제 환경에서는 더 정교한 분석 필요)
        this.metrics.memory.hotspots = [
            { module: 'podman.js', estimated: '8MB', reason: '컨테이너 상태 캐싱' },
            { module: 'database.js', estimated: '3MB', reason: '연결 풀링' },
            { module: 'server.js', estimated: '2MB', reason: '미들웨어 스택' }
        ];

        console.log(`  💾 힙 메모리: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
        console.log(`  💾 총 메모리: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
        console.log(`  💾 핫스팟: ${this.metrics.memory.hotspots.length}개`);
    }

    // ⚡ 로딩 시간 분석
    async analyzeLoadTime() {
        const startTime = performance.now();
        
        try {
            // 모듈 로딩 시간 시뮬레이션
            const modules = [
                './src/core/config.js',
                './src/core/server.js', 
                './src/core/database.js',
                './src/core/podman.js'
            ];
            
            const loadTimes = {};
            
            for (const modulePath of modules) {
                const moduleStart = performance.now();
                try {
                    delete require.cache[require.resolve(modulePath)];
                    require(modulePath);
                    loadTimes[modulePath] = performance.now() - moduleStart;
                } catch (e) {
                    loadTimes[modulePath] = -1; // 로딩 실패
                }
            }
            
            this.metrics.loadTime.currentTime = performance.now() - startTime;
            this.metrics.loadTime.bottlenecks = Object.entries(loadTimes)
                .filter(([module, time]) => time > 5) // 5ms 이상 소요되는 모듈
                .map(([module, time]) => ({ module, time: Math.round(time * 100) / 100 }));

            console.log(`  ⚡ 전체 로딩 시간: ${Math.round(this.metrics.loadTime.currentTime)}ms`);
            console.log(`  ⚡ 병목 모듈: ${this.metrics.loadTime.bottlenecks.length}개`);
            
        } catch (error) {
            console.log(`  ⚡ 로딩 시간 분석 실패: ${error.message}`);
        }
    }

    // 📋 종합 보고서 생성
    async generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            wave: 2,
            analysis: 'performance-optimization',
            current_metrics: this.metrics,
            optimization_targets: {
                bundle_reduction: `${this.metrics.bundle.currentSize}B → ${Math.round(this.metrics.bundle.currentSize * 0.5)}B (50% 감소)`,
                memory_reduction: `${Math.round(this.metrics.memory.currentUsage.heapUsed / 1024 / 1024)}MB → ${Math.round(this.metrics.memory.currentUsage.heapUsed * 0.4 / 1024 / 1024)}MB (60% 감소)`,
                load_time_improvement: `${Math.round(this.metrics.loadTime.currentTime)}ms → ${Math.round(this.metrics.loadTime.currentTime * 0.6)}ms (40% 개선)`
            },
            recommendations: [
                {
                    priority: 'HIGH',
                    action: '코드 분할 및 lazy loading 구현',
                    impact: '번들 크기 30-50% 감소'
                },
                {
                    priority: 'HIGH', 
                    action: 'Tree shaking으로 미사용 코드 제거',
                    impact: '번들 크기 20-30% 감소'
                },
                {
                    priority: 'MEDIUM',
                    action: '메모리 풀링 및 캐싱 최적화',
                    impact: '메모리 사용량 40-60% 감소'
                },
                {
                    priority: 'MEDIUM',
                    action: '모듈 로딩 순서 최적화',
                    impact: '초기 로딩 시간 20-40% 개선'
                },
                {
                    priority: 'LOW',
                    action: '실시간 성능 모니터링 구현',
                    impact: '지속적인 성능 개선'
                }
            ]
        };

        // 보고서를 체크포인트에 저장
        await fs.writeFile(
            './.codeb-checkpoint/wave2-performance-analysis.json', 
            JSON.stringify(report, null, 2)
        );

        console.log('📋 보고서 저장: .codeb-checkpoint/wave2-performance-analysis.json');
        
        return report;
    }
}

// 🚀 실행 (직접 실행 시)
if (require.main === module) {
    const analyzer = new CodeBPerformanceAnalyzer();
    analyzer.analyzeAll()
        .then(report => {
            console.log('🎯 ==========================================');
            console.log('🎯 CodeB Wave 2 성능 분석 완료');
            console.log('🎯 ==========================================');
            console.log('📊 주요 지표:');
            console.log(`  📦 번들 크기: ${Math.round(report.current_metrics.bundle.currentSize / 1024)}KB`);
            console.log(`  💾 메모리 사용: ${Math.round(report.current_metrics.memory.currentUsage.heapUsed / 1024 / 1024)}MB`);
            console.log(`  ⚡ 로딩 시간: ${Math.round(report.current_metrics.loadTime.currentTime)}ms`);
            console.log('🎯 ==========================================');
        })
        .catch(error => {
            console.error('💥 분석 실패:', error);
            process.exit(1);
        });
}

module.exports = CodeBPerformanceAnalyzer;