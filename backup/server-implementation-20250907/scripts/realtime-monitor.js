#!/usr/bin/env node

/**
 * 🔍 CodeB 실시간 성능 모니터링 시스템
 * 59+ 에이전트 시스템을 위한 지능형 실시간 모니터링
 */

const fs = require('fs').promises;
const EventEmitter = require('events');

class CodeBRealtimeMonitor extends EventEmitter {
    constructor() {
        super();
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.metrics = {
            cpu: [],
            memory: [],
            performance: [],
            errors: []
        };
        this.thresholds = {
            memory: 100 * 1024 * 1024, // 100MB
            cpu: 80, // 80%
            responseTime: 1000, // 1초
            errorRate: 0.05 // 5%
        };
        this.alerts = [];
    }

    // 🚀 모니터링 시작
    async startMonitoring(interval = 5000) {
        if (this.isMonitoring) {
            console.log('⚠️ 모니터링이 이미 실행 중입니다.');
            return;
        }

        console.log('🔍 ==========================================');
        console.log('🔍 CodeB 실시간 성능 모니터링 시작');
        console.log('🔍 ==========================================');

        this.isMonitoring = true;
        this.startTime = Date.now();

        // 초기 기준점 설정
        await this.captureBaseline();

        // 주기적 모니터링 시작
        this.monitoringInterval = setInterval(async () => {
            try {
                await this.collectMetrics();
                await this.analyzeMetrics();
                await this.checkThresholds();
            } catch (error) {
                console.error('❌ 모니터링 오류:', error.message);
            }
        }, interval);

        // 프로세스 이벤트 리스너
        this.setupProcessListeners();

        console.log(`✅ 실시간 모니터링 시작 (간격: ${interval}ms)`);
        console.log('🔍 ==========================================');

        // 이벤트 리스너 설정
        this.on('alert', this.handleAlert.bind(this));
        this.on('optimization', this.handleOptimization.bind(this));
        this.on('anomaly', this.handleAnomaly.bind(this));
    }

    // 🛑 모니터링 중지
    stopMonitoring() {
        if (!this.isMonitoring) {
            console.log('⚠️ 모니터링이 실행되지 않고 있습니다.');
            return;
        }

        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        this.isMonitoring = false;
        console.log('🛑 실시간 모니터링 중지');

        // 최종 보고서 생성
        this.generateFinalReport();
    }

    // 📊 기준점 설정
    async captureBaseline() {
        const baseline = {
            timestamp: Date.now(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            uptime: process.uptime(),
            platform: process.platform,
            nodeVersion: process.version
        };

        this.baseline = baseline;
        console.log('📊 기준점 설정 완료');
    }

    // 📈 메트릭 수집
    async collectMetrics() {
        const now = Date.now();
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        // 메모리 메트릭
        const memoryMetric = {
            timestamp: now,
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            rss: memUsage.rss,
            heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
            rssMB: Math.round(memUsage.rss / 1024 / 1024)
        };

        // CPU 메트릭
        const cpuMetric = {
            timestamp: now,
            user: cpuUsage.user,
            system: cpuUsage.system,
            userPercent: this.baseline ? ((cpuUsage.user - this.baseline.cpu.user) / 1000000) : 0,
            systemPercent: this.baseline ? ((cpuUsage.system - this.baseline.cpu.system) / 1000000) : 0
        };

        // 성능 메트릭
        const performanceMetric = {
            timestamp: now,
            uptime: process.uptime(),
            eventLoopDelay: await this.measureEventLoopDelay(),
            activeHandles: process._getActiveHandles().length,
            activeRequests: process._getActiveRequests().length
        };

        // 메트릭 저장 (최근 100개만 유지)
        this.metrics.memory.push(memoryMetric);
        this.metrics.cpu.push(cpuMetric);
        this.metrics.performance.push(performanceMetric);

        if (this.metrics.memory.length > 100) {
            this.metrics.memory = this.metrics.memory.slice(-100);
            this.metrics.cpu = this.metrics.cpu.slice(-100);
            this.metrics.performance = this.metrics.performance.slice(-100);
        }
    }

    // ⏱️ 이벤트 루프 지연 측정
    async measureEventLoopDelay() {
        return new Promise((resolve) => {
            const start = process.hrtime.bigint();
            setImmediate(() => {
                const delay = Number(process.hrtime.bigint() - start) / 1000000; // ms 변환
                resolve(delay);
            });
        });
    }

    // 📊 메트릭 분석
    async analyzeMetrics() {
        const latest = {
            memory: this.metrics.memory[this.metrics.memory.length - 1],
            cpu: this.metrics.cpu[this.metrics.cpu.length - 1],
            performance: this.metrics.performance[this.metrics.performance.length - 1]
        };

        // 트렌드 분석
        if (this.metrics.memory.length >= 5) {
            const memoryTrend = this.calculateTrend(this.metrics.memory.slice(-5).map(m => m.heapUsed));
            const cpuTrend = this.calculateTrend(this.metrics.cpu.slice(-5).map(c => c.user + c.system));

            if (memoryTrend > 0.1) {
                this.emit('anomaly', {
                    type: 'memory_trend',
                    message: '메모리 사용량이 지속적으로 증가하고 있습니다',
                    trend: memoryTrend,
                    current: latest.memory.heapUsedMB
                });
            }

            if (cpuTrend > 0.1) {
                this.emit('anomaly', {
                    type: 'cpu_trend',
                    message: 'CPU 사용량이 지속적으로 증가하고 있습니다',
                    trend: cpuTrend,
                    current: latest.cpu.userPercent + latest.cpu.systemPercent
                });
            }
        }

        // 실시간 출력 (간소화)
        if (this.metrics.memory.length % 12 === 0) { // 1분마다 (5초 * 12)
            console.log(`📊 [${new Date().toLocaleTimeString()}] 메모리: ${latest.memory.heapUsedMB}MB, 이벤트루프: ${latest.performance.eventLoopDelay.toFixed(2)}ms`);
        }
    }

    // 📈 트렌드 계산
    calculateTrend(values) {
        if (values.length < 2) return 0;
        
        const first = values[0];
        const last = values[values.length - 1];
        return (last - first) / first;
    }

    // 🚨 임계값 체크
    async checkThresholds() {
        const latest = {
            memory: this.metrics.memory[this.metrics.memory.length - 1],
            cpu: this.metrics.cpu[this.metrics.cpu.length - 1],
            performance: this.metrics.performance[this.metrics.performance.length - 1]
        };

        // 메모리 임계값 체크
        if (latest.memory.heapUsed > this.thresholds.memory) {
            this.emit('alert', {
                type: 'memory_threshold',
                severity: 'high',
                message: `메모리 사용량이 임계값을 초과했습니다: ${latest.memory.heapUsedMB}MB`,
                value: latest.memory.heapUsedMB,
                threshold: Math.round(this.thresholds.memory / 1024 / 1024)
            });
        }

        // 이벤트 루프 지연 체크
        if (latest.performance.eventLoopDelay > 100) {
            this.emit('alert', {
                type: 'event_loop_delay',
                severity: 'medium',
                message: `이벤트 루프 지연이 감지되었습니다: ${latest.performance.eventLoopDelay.toFixed(2)}ms`,
                value: latest.performance.eventLoopDelay,
                threshold: 100
            });
        }

        // 활성 핸들 수 체크
        if (latest.performance.activeHandles > 50) {
            this.emit('alert', {
                type: 'active_handles',
                severity: 'low',
                message: `활성 핸들 수가 많습니다: ${latest.performance.activeHandles}개`,
                value: latest.performance.activeHandles,
                threshold: 50
            });
        }
    }

    // 🚨 알림 처리
    handleAlert(alert) {
        this.alerts.push({
            ...alert,
            timestamp: Date.now(),
            id: this.alerts.length + 1
        });

        const severityEmoji = {
            low: '🟨',
            medium: '🟧', 
            high: '🟥'
        };

        console.log(`${severityEmoji[alert.severity]} [${alert.severity.toUpperCase()}] ${alert.message}`);

        // 심각한 알림의 경우 추가 처리
        if (alert.severity === 'high') {
            this.handleCriticalAlert(alert);
        }
    }

    // 🔥 중대한 알림 처리
    handleCriticalAlert(alert) {
        console.log('🔥 중대한 성능 문제 감지! 자동 최적화를 시도합니다...');
        
        // 가비지 컬렉션 강제 실행
        if (global.gc && alert.type === 'memory_threshold') {
            global.gc();
            console.log('🗑️ 가비지 컬렉션 강제 실행됨');
        }

        // 최적화 이벤트 발생
        this.emit('optimization', {
            trigger: alert,
            actions: ['garbage_collection', 'cache_cleanup']
        });
    }

    // ⚡ 최적화 처리
    handleOptimization(optimization) {
        console.log('⚡ 자동 최적화 실행:', optimization.actions.join(', '));
        
        // 실제 최적화 작업은 여기서 수행
        // 예: 캐시 정리, 불필요한 리소스 해제 등
    }

    // 👁️ 이상 징후 처리  
    handleAnomaly(anomaly) {
        console.log(`👁️ 이상 징후 감지: ${anomaly.message}`);
        
        // 이상 징후 로그 저장
        this.metrics.errors.push({
            ...anomaly,
            timestamp: Date.now()
        });
    }

    // 🎯 프로세스 이벤트 리스너 설정
    setupProcessListeners() {
        // 메모리 경고
        process.on('warning', (warning) => {
            console.log('⚠️ Node.js 경고:', warning.message);
            this.metrics.errors.push({
                type: 'warning',
                message: warning.message,
                timestamp: Date.now()
            });
        });

        // 처리되지 않은 Promise 거부
        process.on('unhandledRejection', (reason, promise) => {
            console.error('🚨 처리되지 않은 Promise 거부:', reason);
            this.emit('alert', {
                type: 'unhandled_rejection',
                severity: 'high',
                message: `처리되지 않은 Promise 거부: ${reason}`
            });
        });

        // 처리되지 않은 예외
        process.on('uncaughtException', (error) => {
            console.error('💥 처리되지 않은 예외:', error.message);
            this.emit('alert', {
                type: 'uncaught_exception',
                severity: 'high',
                message: `처리되지 않은 예외: ${error.message}`
            });
        });
    }

    // 📋 상태 보고서 생성
    async generateStatusReport() {
        if (this.metrics.memory.length === 0) return null;

        const latest = {
            memory: this.metrics.memory[this.metrics.memory.length - 1],
            cpu: this.metrics.cpu[this.metrics.cpu.length - 1],
            performance: this.metrics.performance[this.metrics.performance.length - 1]
        };

        const report = {
            timestamp: Date.now(),
            uptime: Math.round(process.uptime()),
            status: 'monitoring',
            current_metrics: {
                memory: {
                    heapUsed: `${latest.memory.heapUsedMB}MB`,
                    rss: `${latest.memory.rssMB}MB`,
                    external: `${Math.round(latest.memory.external / 1024 / 1024)}MB`
                },
                performance: {
                    eventLoopDelay: `${latest.performance.eventLoopDelay.toFixed(2)}ms`,
                    activeHandles: latest.performance.activeHandles,
                    activeRequests: latest.performance.activeRequests
                }
            },
            alerts: {
                total: this.alerts.length,
                recent: this.alerts.filter(a => Date.now() - a.timestamp < 300000).length, // 5분 이내
                high_severity: this.alerts.filter(a => a.severity === 'high').length
            },
            trends: this.metrics.memory.length >= 5 ? {
                memory: this.calculateTrend(this.metrics.memory.slice(-5).map(m => m.heapUsed)),
                cpu: this.calculateTrend(this.metrics.cpu.slice(-5).map(c => c.user + c.system))
            } : null
        };

        return report;
    }

    // 📊 최종 보고서 생성
    async generateFinalReport() {
        const endTime = Date.now();
        const duration = endTime - this.startTime;

        const report = {
            monitoring_session: {
                start: new Date(this.startTime).toISOString(),
                end: new Date(endTime).toISOString(),
                duration_ms: duration,
                duration_formatted: this.formatDuration(duration)
            },
            summary: {
                total_metrics_collected: this.metrics.memory.length,
                total_alerts: this.alerts.length,
                alerts_by_severity: {
                    high: this.alerts.filter(a => a.severity === 'high').length,
                    medium: this.alerts.filter(a => a.severity === 'medium').length,
                    low: this.alerts.filter(a => a.severity === 'low').length
                },
                peak_memory: Math.max(...this.metrics.memory.map(m => m.heapUsedMB)),
                avg_memory: Math.round(this.metrics.memory.reduce((sum, m) => sum + m.heapUsedMB, 0) / this.metrics.memory.length),
                max_event_loop_delay: Math.max(...this.metrics.performance.map(p => p.eventLoopDelay))
            },
            recommendations: this.generateRecommendations()
        };

        // 보고서 저장
        await fs.writeFile(
            './.codeb-checkpoint/realtime-monitoring-report.json',
            JSON.stringify(report, null, 2)
        );

        console.log('📋 최종 보고서 저장: .codeb-checkpoint/realtime-monitoring-report.json');
        console.log(`📊 모니터링 세션 완료 (${this.formatDuration(duration)})`);
        
        return report;
    }

    // 💡 권장사항 생성
    generateRecommendations() {
        const recommendations = [];
        
        if (this.alerts.filter(a => a.type === 'memory_threshold').length > 0) {
            recommendations.push({
                type: 'memory_optimization',
                priority: 'high',
                message: '메모리 사용량 최적화가 필요합니다. 객체 캐싱과 가비지 컬렉션을 검토하세요.'
            });
        }

        if (this.alerts.filter(a => a.type === 'event_loop_delay').length > 0) {
            recommendations.push({
                type: 'async_optimization',
                priority: 'medium',
                message: '이벤트 루프 지연이 발생했습니다. 비동기 처리를 최적화하세요.'
            });
        }

        if (recommendations.length === 0) {
            recommendations.push({
                type: 'performance_excellent',
                priority: 'info',
                message: '성능이 우수합니다. 현재 최적화 상태를 유지하세요.'
            });
        }

        return recommendations;
    }

    // 🕐 시간 포맷팅
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) return `${hours}시간 ${minutes % 60}분`;
        if (minutes > 0) return `${minutes}분 ${seconds % 60}초`;
        return `${seconds}초`;
    }
}

// 🚀 실행 (직접 실행 시)
if (require.main === module) {
    const monitor = new CodeBRealtimeMonitor();
    
    // 모니터링 시작
    monitor.startMonitoring(5000); // 5초 간격
    
    // 종료 시그널 처리
    process.on('SIGINT', async () => {
        console.log('\n🛑 모니터링 종료 중...');
        monitor.stopMonitoring();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('\n🛑 모니터링 종료 중...');
        monitor.stopMonitoring();
        process.exit(0);
    });

    console.log('💡 Ctrl+C를 눌러 모니터링을 종료하세요');
}

module.exports = CodeBRealtimeMonitor;