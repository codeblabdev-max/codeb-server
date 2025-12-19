#!/usr/bin/env node

/**
 * CodeB Load Testing Framework
 * Wave 3: Production Readiness & Scalability
 * 
 * 부하 테스트를 통한 확장성 검증 시스템
 */

const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');
const cluster = require('cluster');
const os = require('os');

class CodeBLoadTester {
    constructor(config = {}) {
        this.config = {
            targetUrl: config.targetUrl || 'http://localhost:3000',
            concurrentUsers: config.concurrentUsers || 100,
            requestsPerUser: config.requestsPerUser || 100,
            testDuration: config.testDuration || 60000, // 60초
            rampUpTime: config.rampUpTime || 10000, // 10초
            thinkTime: config.thinkTime || 1000, // 1초
            ...config
        };
        
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            responseTimes: [],
            errorTypes: {},
            throughput: 0,
            startTime: null,
            endTime: null
        };
        
        this.scenarios = this.defineTestScenarios();
    }

    defineTestScenarios() {
        return [
            {
                name: 'API Health Check',
                weight: 0.1,
                endpoint: '/health',
                method: 'GET'
            },
            {
                name: 'Create Project',
                weight: 0.2,
                endpoint: '/api/projects',
                method: 'POST',
                body: {
                    name: `test-project-${Date.now()}`,
                    type: 'nodejs',
                    description: 'Load test project'
                }
            },
            {
                name: 'List Projects',
                weight: 0.3,
                endpoint: '/api/projects',
                method: 'GET'
            },
            {
                name: 'Deploy Application',
                weight: 0.2,
                endpoint: '/api/applications/deploy',
                method: 'POST',
                body: {
                    projectId: 'test-project',
                    gitUrl: 'https://github.com/example/app.git',
                    branch: 'main'
                }
            },
            {
                name: 'Get Metrics',
                weight: 0.2,
                endpoint: '/api/metrics',
                method: 'GET'
            }
        ];
    }

    selectScenario() {
        const random = Math.random();
        let cumulativeWeight = 0;
        
        for (const scenario of this.scenarios) {
            cumulativeWeight += scenario.weight;
            if (random <= cumulativeWeight) {
                return scenario;
            }
        }
        
        return this.scenarios[0];
    }

    async executeRequest(scenario) {
        const startTime = performance.now();
        const url = new URL(this.config.targetUrl + scenario.endpoint);
        const protocol = url.protocol === 'https:' ? https : http;
        
        return new Promise((resolve) => {
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + url.search,
                method: scenario.method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Load-Test': 'true'
                }
            };
            
            const req = protocol.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    const responseTime = performance.now() - startTime;
                    
                    this.metrics.totalRequests++;
                    this.metrics.responseTimes.push(responseTime);
                    
                    if (res.statusCode >= 200 && res.statusCode < 400) {
                        this.metrics.successfulRequests++;
                    } else {
                        this.metrics.failedRequests++;
                        const errorType = `${res.statusCode}`;
                        this.metrics.errorTypes[errorType] = (this.metrics.errorTypes[errorType] || 0) + 1;
                    }
                    
                    resolve({
                        success: res.statusCode >= 200 && res.statusCode < 400,
                        statusCode: res.statusCode,
                        responseTime,
                        scenario: scenario.name
                    });
                });
            });
            
            req.on('error', (err) => {
                const responseTime = performance.now() - startTime;
                
                this.metrics.totalRequests++;
                this.metrics.failedRequests++;
                this.metrics.responseTimes.push(responseTime);
                
                const errorType = err.code || 'UNKNOWN';
                this.metrics.errorTypes[errorType] = (this.metrics.errorTypes[errorType] || 0) + 1;
                
                resolve({
                    success: false,
                    error: err.message,
                    responseTime,
                    scenario: scenario.name
                });
            });
            
            if (scenario.body) {
                req.write(JSON.stringify(scenario.body));
            }
            
            req.end();
        });
    }

    async simulateUser() {
        const userStartTime = Date.now();
        const results = [];
        
        while (Date.now() - userStartTime < this.config.testDuration) {
            const scenario = this.selectScenario();
            const result = await this.executeRequest(scenario);
            results.push(result);
            
            // Think time between requests
            await new Promise(resolve => setTimeout(resolve, this.config.thinkTime));
        }
        
        return results;
    }

    async runLoadTest() {
        console.log('🚀 Starting CodeB Load Test...');
        console.log(`📊 Configuration:`);
        console.log(`   - Target: ${this.config.targetUrl}`);
        console.log(`   - Concurrent Users: ${this.config.concurrentUsers}`);
        console.log(`   - Test Duration: ${this.config.testDuration / 1000}s`);
        console.log(`   - Ramp Up Time: ${this.config.rampUpTime / 1000}s`);
        
        this.metrics.startTime = Date.now();
        
        // Ramp up users gradually
        const userPromises = [];
        const rampUpInterval = this.config.rampUpTime / this.config.concurrentUsers;
        
        for (let i = 0; i < this.config.concurrentUsers; i++) {
            await new Promise(resolve => setTimeout(resolve, rampUpInterval));
            userPromises.push(this.simulateUser());
            
            if ((i + 1) % 10 === 0) {
                console.log(`   👥 ${i + 1} users ramped up...`);
            }
        }
        
        console.log('⏳ All users active, running test...');
        
        // Wait for all users to complete
        await Promise.all(userPromises);
        
        this.metrics.endTime = Date.now();
        
        return this.generateReport();
    }

    calculatePercentile(arr, percentile) {
        if (arr.length === 0) return 0;
        
        const sorted = [...arr].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        
        return sorted[index];
    }

    generateReport() {
        const duration = (this.metrics.endTime - this.metrics.startTime) / 1000;
        const throughput = this.metrics.totalRequests / duration;
        const avgResponseTime = this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length;
        const successRate = (this.metrics.successfulRequests / this.metrics.totalRequests) * 100;
        
        const report = {
            summary: {
                testDuration: `${duration.toFixed(2)}s`,
                totalRequests: this.metrics.totalRequests,
                successfulRequests: this.metrics.successfulRequests,
                failedRequests: this.metrics.failedRequests,
                successRate: `${successRate.toFixed(2)}%`,
                throughput: `${throughput.toFixed(2)} req/s`
            },
            responseTime: {
                average: `${avgResponseTime.toFixed(2)}ms`,
                min: `${Math.min(...this.metrics.responseTimes).toFixed(2)}ms`,
                max: `${Math.max(...this.metrics.responseTimes).toFixed(2)}ms`,
                p50: `${this.calculatePercentile(this.metrics.responseTimes, 50).toFixed(2)}ms`,
                p90: `${this.calculatePercentile(this.metrics.responseTimes, 90).toFixed(2)}ms`,
                p95: `${this.calculatePercentile(this.metrics.responseTimes, 95).toFixed(2)}ms`,
                p99: `${this.calculatePercentile(this.metrics.responseTimes, 99).toFixed(2)}ms`
            },
            errors: this.metrics.errorTypes,
            performance: this.evaluatePerformance(avgResponseTime, successRate, throughput)
        };
        
        console.log('\n📈 Load Test Results:');
        console.log('====================');
        console.log(JSON.stringify(report, null, 2));
        
        // Save report to file
        const fs = require('fs');
        const reportPath = `./.codeb-checkpoint/load-test-report-${new Date().toISOString().split('T')[0]}.json`;
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n💾 Report saved to: ${reportPath}`);
        
        return report;
    }

    evaluatePerformance(avgResponseTime, successRate, throughput) {
        const evaluation = {
            responseTime: 'UNKNOWN',
            reliability: 'UNKNOWN',
            scalability: 'UNKNOWN',
            overall: 'UNKNOWN',
            recommendations: []
        };
        
        // Response time evaluation
        if (avgResponseTime < 200) {
            evaluation.responseTime = 'EXCELLENT';
        } else if (avgResponseTime < 500) {
            evaluation.responseTime = 'GOOD';
        } else if (avgResponseTime < 1000) {
            evaluation.responseTime = 'ACCEPTABLE';
        } else {
            evaluation.responseTime = 'POOR';
            evaluation.recommendations.push('Optimize response times - consider caching, query optimization, or horizontal scaling');
        }
        
        // Reliability evaluation
        if (successRate >= 99.9) {
            evaluation.reliability = 'EXCELLENT';
        } else if (successRate >= 99) {
            evaluation.reliability = 'GOOD';
        } else if (successRate >= 95) {
            evaluation.reliability = 'ACCEPTABLE';
        } else {
            evaluation.reliability = 'POOR';
            evaluation.recommendations.push('Improve reliability - investigate error patterns and implement retry mechanisms');
        }
        
        // Scalability evaluation
        if (throughput >= 1000) {
            evaluation.scalability = 'EXCELLENT';
        } else if (throughput >= 500) {
            evaluation.scalability = 'GOOD';
        } else if (throughput >= 100) {
            evaluation.scalability = 'ACCEPTABLE';
        } else {
            evaluation.scalability = 'POOR';
            evaluation.recommendations.push('Enhance scalability - consider load balancing and horizontal scaling');
        }
        
        // Overall evaluation
        const scores = {
            'EXCELLENT': 4,
            'GOOD': 3,
            'ACCEPTABLE': 2,
            'POOR': 1,
            'UNKNOWN': 0
        };
        
        const avgScore = (scores[evaluation.responseTime] + scores[evaluation.reliability] + scores[evaluation.scalability]) / 3;
        
        if (avgScore >= 3.5) {
            evaluation.overall = 'PRODUCTION READY';
        } else if (avgScore >= 2.5) {
            evaluation.overall = 'NEEDS OPTIMIZATION';
        } else {
            evaluation.overall = 'NOT READY';
        }
        
        return evaluation;
    }
}

// Cluster mode for distributed load generation
if (cluster.isMaster) {
    const config = {
        targetUrl: process.env.TARGET_URL || 'http://localhost:3000',
        concurrentUsers: parseInt(process.env.CONCURRENT_USERS) || 100,
        testDuration: parseInt(process.env.TEST_DURATION) || 60000,
        rampUpTime: parseInt(process.env.RAMP_UP_TIME) || 10000
    };
    
    console.log('🎯 CodeB Load Testing Framework');
    console.log('================================');
    
    const tester = new CodeBLoadTester(config);
    
    tester.runLoadTest()
        .then((report) => {
            console.log('\n✅ Load test completed successfully!');
            
            // Check if performance meets production criteria
            if (report.performance.overall === 'PRODUCTION READY') {
                console.log('🎉 System is PRODUCTION READY!');
                process.exit(0);
            } else {
                console.log(`⚠️ System status: ${report.performance.overall}`);
                console.log('\n📋 Recommendations:');
                report.performance.recommendations.forEach((rec, i) => {
                    console.log(`   ${i + 1}. ${rec}`);
                });
                process.exit(1);
            }
        })
        .catch((error) => {
            console.error('❌ Load test failed:', error);
            process.exit(1);
        });
} else {
    // Worker process for distributed load generation
    process.exit(0);
}

module.exports = CodeBLoadTester;