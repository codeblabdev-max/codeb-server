#!/usr/bin/env node

/**
 * CodeB Security Scanner
 * Wave 3: Security Hardening & Vulnerability Assessment
 * 
 * 보안 취약점 자동 스캔 및 패치 제안 시스템
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process').promises;

class CodeBSecurityScanner {
    constructor() {
        this.vulnerabilities = [];
        this.securityScore = 100;
        this.criticalIssues = 0;
        this.highIssues = 0;
        this.mediumIssues = 0;
        this.lowIssues = 0;
        
        this.scanners = {
            dependencies: this.scanDependencies.bind(this),
            authentication: this.scanAuthentication.bind(this),
            injection: this.scanInjection.bind(this),
            secrets: this.scanSecrets.bind(this),
            headers: this.scanSecurityHeaders.bind(this),
            permissions: this.scanFilePermissions.bind(this),
            crypto: this.scanCryptography.bind(this),
            logging: this.scanLogging.bind(this)
        };
    }

    async scanDependencies() {
        console.log('🔍 Scanning dependencies for vulnerabilities...');
        const results = [];
        
        try {
            // Check for outdated packages
            const packageJson = JSON.parse(await fs.readFile('./package.json', 'utf8'));
            const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
            
            for (const [pkg, version] of Object.entries(dependencies)) {
                // Simulate vulnerability check (in production, use npm audit or similar)
                if (version.includes('^') || version.includes('~')) {
                    results.push({
                        severity: 'LOW',
                        type: 'DEPENDENCY',
                        package: pkg,
                        issue: 'Using flexible version range',
                        recommendation: 'Pin to specific version for reproducible builds',
                        file: 'package.json'
                    });
                }
                
                // Check for known vulnerable packages
                const vulnerablePackages = ['minimist<1.2.6', 'axios<0.21.1', 'lodash<4.17.21'];
                // Simplified check - in production use proper version comparison
                if (vulnerablePackages.some(vuln => vuln.includes(pkg))) {
                    results.push({
                        severity: 'HIGH',
                        type: 'DEPENDENCY',
                        package: pkg,
                        issue: 'Known vulnerability in package version',
                        recommendation: 'Update to latest secure version',
                        file: 'package.json'
                    });
                }
            }
            
            // Check for package-lock.json
            try {
                await fs.access('./package-lock.json');
            } catch {
                results.push({
                    severity: 'MEDIUM',
                    type: 'DEPENDENCY',
                    issue: 'Missing package-lock.json',
                    recommendation: 'Generate package-lock.json for dependency integrity',
                    file: 'package-lock.json'
                });
            }
        } catch (error) {
            console.error('Error scanning dependencies:', error.message);
        }
        
        return results;
    }

    async scanAuthentication() {
        console.log('🔐 Scanning authentication mechanisms...');
        const results = [];
        
        // Scan for authentication issues in source files
        const sourceFiles = await this.findFiles('./src', ['.js', '.ts']);
        
        for (const file of sourceFiles) {
            const content = await fs.readFile(file, 'utf8');
            
            // Check for hardcoded credentials
            const credentialPatterns = [
                /password\s*=\s*["'][^"']+["']/gi,
                /api[_-]?key\s*=\s*["'][^"']+["']/gi,
                /secret\s*=\s*["'][^"']+["']/gi,
                /token\s*=\s*["'][^"']+["']/gi
            ];
            
            for (const pattern of credentialPatterns) {
                if (pattern.test(content)) {
                    results.push({
                        severity: 'CRITICAL',
                        type: 'AUTHENTICATION',
                        issue: 'Potential hardcoded credentials',
                        recommendation: 'Use environment variables for sensitive data',
                        file: path.relative('.', file),
                        line: this.findLineNumber(content, pattern)
                    });
                }
            }
            
            // Check for weak authentication
            if (content.includes('md5') || content.includes('sha1')) {
                results.push({
                    severity: 'HIGH',
                    type: 'AUTHENTICATION',
                    issue: 'Weak hashing algorithm detected',
                    recommendation: 'Use bcrypt, scrypt, or argon2 for password hashing',
                    file: path.relative('.', file)
                });
            }
            
            // Check for missing authentication
            if (content.includes('app.post') || content.includes('app.put') || content.includes('app.delete')) {
                if (!content.includes('authenticate') && !content.includes('auth') && !content.includes('jwt')) {
                    results.push({
                        severity: 'MEDIUM',
                        type: 'AUTHENTICATION',
                        issue: 'API endpoint without apparent authentication',
                        recommendation: 'Implement authentication middleware for sensitive endpoints',
                        file: path.relative('.', file)
                    });
                }
            }
        }
        
        return results;
    }

    async scanInjection() {
        console.log('💉 Scanning for injection vulnerabilities...');
        const results = [];
        
        const sourceFiles = await this.findFiles('./src', ['.js', '.ts']);
        
        for (const file of sourceFiles) {
            const content = await fs.readFile(file, 'utf8');
            
            // SQL Injection
            const sqlPatterns = [
                /query\s*\(\s*['"`].*\$\{.*\}.*['"`]/gi,
                /query\s*\(\s*['"`].*\+.*['"`]/gi,
                /execute\s*\(\s*['"`].*\$\{.*\}.*['"`]/gi
            ];
            
            for (const pattern of sqlPatterns) {
                if (pattern.test(content)) {
                    results.push({
                        severity: 'CRITICAL',
                        type: 'INJECTION',
                        subtype: 'SQL',
                        issue: 'Potential SQL injection vulnerability',
                        recommendation: 'Use parameterized queries or prepared statements',
                        file: path.relative('.', file),
                        line: this.findLineNumber(content, pattern)
                    });
                }
            }
            
            // Command Injection
            if (content.includes('exec(') || content.includes('execSync(') || content.includes('spawn(')) {
                if (content.includes('${') || content.includes('+')) {
                    results.push({
                        severity: 'CRITICAL',
                        type: 'INJECTION',
                        subtype: 'COMMAND',
                        issue: 'Potential command injection vulnerability',
                        recommendation: 'Validate and sanitize all user input before executing commands',
                        file: path.relative('.', file)
                    });
                }
            }
            
            // NoSQL Injection
            if (content.includes('$where') || content.includes('mapReduce')) {
                results.push({
                    severity: 'HIGH',
                    type: 'INJECTION',
                    subtype: 'NoSQL',
                    issue: 'Potential NoSQL injection vulnerability',
                    recommendation: 'Avoid $where and validate all query parameters',
                    file: path.relative('.', file)
                });
            }
        }
        
        return results;
    }

    async scanSecrets() {
        console.log('🔑 Scanning for exposed secrets...');
        const results = [];
        
        // Pattern for common secrets
        const secretPatterns = [
            { pattern: /sk_live_[a-zA-Z0-9]{24,}/, type: 'Stripe Secret Key' },
            { pattern: /AIza[0-9A-Za-z\\-_]{35}/, type: 'Google API Key' },
            { pattern: /[0-9a-f]{40}/, type: 'Generic API Key/Token' },
            { pattern: /ghp_[a-zA-Z0-9]{36}/, type: 'GitHub Personal Access Token' },
            { pattern: /sk_test_[a-zA-Z0-9]{24,}/, type: 'Stripe Test Key' }
        ];
        
        const filesToScan = await this.findFiles('.', ['.js', '.ts', '.json', '.env', '.yml', '.yaml']);
        
        for (const file of filesToScan) {
            // Skip node_modules and other build directories
            if (file.includes('node_modules') || file.includes('dist') || file.includes('build')) {
                continue;
            }
            
            const content = await fs.readFile(file, 'utf8');
            
            for (const { pattern, type } of secretPatterns) {
                if (pattern.test(content)) {
                    results.push({
                        severity: 'CRITICAL',
                        type: 'SECRETS',
                        issue: `Potential ${type} exposed`,
                        recommendation: 'Move to environment variables and add to .gitignore',
                        file: path.relative('.', file)
                    });
                }
            }
        }
        
        // Check for .env in git
        try {
            const gitignore = await fs.readFile('./.gitignore', 'utf8');
            if (!gitignore.includes('.env')) {
                results.push({
                    severity: 'HIGH',
                    type: 'SECRETS',
                    issue: '.env file not in .gitignore',
                    recommendation: 'Add .env to .gitignore to prevent committing secrets',
                    file: '.gitignore'
                });
            }
        } catch {
            results.push({
                severity: 'MEDIUM',
                type: 'SECRETS',
                issue: 'Missing .gitignore file',
                recommendation: 'Create .gitignore file with proper exclusions',
                file: '.gitignore'
            });
        }
        
        return results;
    }

    async scanSecurityHeaders() {
        console.log('🛡️ Scanning security headers configuration...');
        const results = [];
        
        const serverFiles = await this.findFiles('./src', ['.js', '.ts']);
        
        for (const file of serverFiles) {
            const content = await fs.readFile(file, 'utf8');
            
            // Check for security headers
            const requiredHeaders = [
                { name: 'helmet', header: 'Security Headers Package' },
                { name: 'X-Frame-Options', header: 'Clickjacking Protection' },
                { name: 'X-Content-Type-Options', header: 'MIME Type Sniffing Protection' },
                { name: 'Content-Security-Policy', header: 'CSP' },
                { name: 'Strict-Transport-Security', header: 'HSTS' }
            ];
            
            for (const { name, header } of requiredHeaders) {
                if (!content.includes(name)) {
                    results.push({
                        severity: 'MEDIUM',
                        type: 'HEADERS',
                        issue: `Missing ${header}`,
                        recommendation: `Implement ${name} header for enhanced security`,
                        file: path.relative('.', file)
                    });
                }
            }
            
            // Check for CORS configuration
            if (content.includes('cors(') && content.includes('origin: true')) {
                results.push({
                    severity: 'HIGH',
                    type: 'HEADERS',
                    issue: 'Overly permissive CORS configuration',
                    recommendation: 'Restrict CORS to specific trusted origins',
                    file: path.relative('.', file)
                });
            }
        }
        
        return results;
    }

    async scanFilePermissions() {
        console.log('📁 Scanning file permissions...');
        const results = [];
        
        // Check for overly permissive file operations
        const sourceFiles = await this.findFiles('./src', ['.js', '.ts']);
        
        for (const file of sourceFiles) {
            const content = await fs.readFile(file, 'utf8');
            
            // Check for dangerous file operations
            if (content.includes('chmod') && (content.includes('777') || content.includes('0777'))) {
                results.push({
                    severity: 'HIGH',
                    type: 'PERMISSIONS',
                    issue: 'Overly permissive file permissions (777)',
                    recommendation: 'Use restrictive permissions (644 for files, 755 for directories)',
                    file: path.relative('.', file)
                });
            }
            
            // Check for path traversal vulnerability
            if (content.includes('readFile') || content.includes('writeFile')) {
                if (content.includes('../') || content.includes('..\\')) {
                    results.push({
                        severity: 'HIGH',
                        type: 'PERMISSIONS',
                        issue: 'Potential path traversal vulnerability',
                        recommendation: 'Validate and sanitize file paths, use path.join() safely',
                        file: path.relative('.', file)
                    });
                }
            }
        }
        
        return results;
    }

    async scanCryptography() {
        console.log('🔐 Scanning cryptographic implementations...');
        const results = [];
        
        const sourceFiles = await this.findFiles('./src', ['.js', '.ts']);
        
        for (const file of sourceFiles) {
            const content = await fs.readFile(file, 'utf8');
            
            // Check for weak algorithms
            const weakAlgorithms = ['des', 'rc4', 'md5', 'sha1'];
            for (const algo of weakAlgorithms) {
                if (content.toLowerCase().includes(algo)) {
                    results.push({
                        severity: 'HIGH',
                        type: 'CRYPTO',
                        issue: `Weak cryptographic algorithm: ${algo.toUpperCase()}`,
                        recommendation: 'Use strong algorithms: AES-256, SHA-256 or higher',
                        file: path.relative('.', file)
                    });
                }
            }
            
            // Check for hardcoded IVs or salts
            if (content.includes('iv:') || content.includes('salt:')) {
                if (!/crypto\.random/i.test(content)) {
                    results.push({
                        severity: 'MEDIUM',
                        type: 'CRYPTO',
                        issue: 'Potentially hardcoded IV or salt',
                        recommendation: 'Generate random IVs and salts for each operation',
                        file: path.relative('.', file)
                    });
                }
            }
        }
        
        return results;
    }

    async scanLogging() {
        console.log('📝 Scanning logging practices...');
        const results = [];
        
        const sourceFiles = await this.findFiles('./src', ['.js', '.ts']);
        
        for (const file of sourceFiles) {
            const content = await fs.readFile(file, 'utf8');
            
            // Check for sensitive data in logs
            if (content.includes('console.log') || content.includes('logger.')) {
                const sensitiveTerms = ['password', 'token', 'secret', 'key', 'credit', 'ssn'];
                
                for (const term of sensitiveTerms) {
                    if (content.toLowerCase().includes(term)) {
                        results.push({
                            severity: 'HIGH',
                            type: 'LOGGING',
                            issue: `Potential sensitive data in logs: ${term}`,
                            recommendation: 'Never log sensitive information, use data masking',
                            file: path.relative('.', file)
                        });
                        break;
                    }
                }
            }
            
            // Check for error details exposure
            if (content.includes('stack:') || content.includes('error.stack')) {
                results.push({
                    severity: 'LOW',
                    type: 'LOGGING',
                    issue: 'Stack traces may expose internal details',
                    recommendation: 'Sanitize error messages in production',
                    file: path.relative('.', file)
                });
            }
        }
        
        return results;
    }

    async findFiles(dir, extensions) {
        const files = [];
        
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    files.push(...await this.findFiles(fullPath, extensions));
                } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            console.error(`Error scanning directory ${dir}:`, error.message);
        }
        
        return files;
    }

    findLineNumber(content, pattern) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
                return i + 1;
            }
        }
        return 'unknown';
    }

    calculateSecurityScore() {
        // Deduct points based on vulnerability severity
        const deductions = {
            CRITICAL: 25,
            HIGH: 15,
            MEDIUM: 10,
            LOW: 5
        };
        
        for (const vuln of this.vulnerabilities) {
            this.securityScore -= deductions[vuln.severity] || 0;
            
            switch (vuln.severity) {
                case 'CRITICAL':
                    this.criticalIssues++;
                    break;
                case 'HIGH':
                    this.highIssues++;
                    break;
                case 'MEDIUM':
                    this.mediumIssues++;
                    break;
                case 'LOW':
                    this.lowIssues++;
                    break;
            }
        }
        
        this.securityScore = Math.max(0, this.securityScore);
    }

    async runSecurityScan() {
        console.log('🔒 CodeB Security Scanner v1.0');
        console.log('==============================');
        console.log('Starting comprehensive security scan...\n');
        
        const startTime = Date.now();
        
        // Run all scanners
        for (const [name, scanner] of Object.entries(this.scanners)) {
            const results = await scanner();
            this.vulnerabilities.push(...results);
        }
        
        // Calculate security score
        this.calculateSecurityScore();
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        // Generate report
        const report = {
            timestamp: new Date().toISOString(),
            scanDuration: `${duration}s`,
            securityScore: this.securityScore,
            grade: this.getSecurityGrade(),
            summary: {
                total: this.vulnerabilities.length,
                critical: this.criticalIssues,
                high: this.highIssues,
                medium: this.mediumIssues,
                low: this.lowIssues
            },
            vulnerabilities: this.vulnerabilities,
            recommendations: this.generateRecommendations()
        };
        
        // Display results
        console.log('\n📊 Security Scan Results:');
        console.log('========================');
        console.log(`Security Score: ${report.securityScore}/100 (${report.grade})`);
        console.log(`\nVulnerabilities Found: ${report.summary.total}`);
        console.log(`  🔴 Critical: ${report.summary.critical}`);
        console.log(`  🟠 High: ${report.summary.high}`);
        console.log(`  🟡 Medium: ${report.summary.medium}`);
        console.log(`  🟢 Low: ${report.summary.low}`);
        
        if (this.criticalIssues > 0) {
            console.log('\n⚠️ CRITICAL ISSUES FOUND - Immediate action required!');
        }
        
        // Save report
        const reportPath = `./.codeb-checkpoint/security-report-${new Date().toISOString().split('T')[0]}.json`;
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n💾 Full report saved to: ${reportPath}`);
        
        return report;
    }

    getSecurityGrade() {
        if (this.securityScore >= 90) return 'A';
        if (this.securityScore >= 80) return 'B';
        if (this.securityScore >= 70) return 'C';
        if (this.securityScore >= 60) return 'D';
        return 'F';
    }

    generateRecommendations() {
        const recommendations = [];
        
        if (this.criticalIssues > 0) {
            recommendations.push({
                priority: 'IMMEDIATE',
                action: 'Address all critical vulnerabilities before deployment'
            });
        }
        
        if (this.highIssues > 0) {
            recommendations.push({
                priority: 'HIGH',
                action: 'Fix high-severity issues within 24 hours'
            });
        }
        
        if (this.vulnerabilities.some(v => v.type === 'AUTHENTICATION')) {
            recommendations.push({
                priority: 'HIGH',
                action: 'Implement robust authentication and authorization mechanisms'
            });
        }
        
        if (this.vulnerabilities.some(v => v.type === 'SECRETS')) {
            recommendations.push({
                priority: 'IMMEDIATE',
                action: 'Remove all hardcoded secrets and use environment variables'
            });
        }
        
        recommendations.push({
            priority: 'MEDIUM',
            action: 'Set up regular security scanning in CI/CD pipeline'
        });
        
        return recommendations;
    }
}

// Run the scanner
if (require.main === module) {
    const scanner = new CodeBSecurityScanner();
    
    scanner.runSecurityScan()
        .then((report) => {
            if (report.securityScore < 70 || report.summary.critical > 0) {
                console.log('\n❌ Security scan failed - issues must be addressed');
                process.exit(1);
            } else {
                console.log('\n✅ Security scan completed');
                process.exit(0);
            }
        })
        .catch((error) => {
            console.error('Error during security scan:', error);
            process.exit(1);
        });
}

module.exports = CodeBSecurityScanner;