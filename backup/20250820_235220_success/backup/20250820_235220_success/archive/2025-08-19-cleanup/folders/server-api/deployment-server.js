#!/usr/bin/env node

/**
 * 🚀 Coolify + PowerDNS + DB + Redis 통합 배포 서버 API
 * 로컬에서 MCP로 연동하여 프로젝트 생성, 도메인 설정, 서비스 배포 자동화
 */

const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const app = express();
const port = 3002;

app.use(express.json());

// 서버 설정
const CONFIG = {
    SERVER_IP: '141.164.60.51',
    COOLIFY_URL: 'http://141.164.60.51:8000',
    POWERDNS_URL: 'http://141.164.60.51:8081',
    BASE_DOMAIN: 'one-q.xyz',
    API_KEYS: {
        PDNS: process.env.PDNS_API_KEY || '20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5',
        COOLIFY: process.env.COOLIFY_API_TOKEN || ''
    }
};

// 로그 함수
const log = (level, message, data = null) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data ? JSON.stringify(data, null, 2) : '');
};

// PowerDNS API 클래스
class PowerDNSManager {
    constructor() {
        this.baseURL = `${CONFIG.POWERDNS_URL}/api/v1/servers/localhost`;
        this.headers = {
            'X-API-Key': CONFIG.API_KEYS.PDNS,
            'Content-Type': 'application/json'
        };
    }

    async createZone(zoneName) {
        try {
            const zoneData = {
                name: `${zoneName}.`,
                kind: 'Native',
                dnssec: false,
                nameservers: [`ns1.${zoneName}.`, `ns2.${zoneName}.`],
                rrsets: [
                    {
                        name: `${zoneName}.`,
                        type: 'SOA',
                        records: [{
                            content: `ns1.${zoneName}. admin.${zoneName}. 2025010101 3600 1800 604800 86400`,
                            disabled: false
                        }]
                    }
                ]
            };

            const response = await axios.post(`${this.baseURL}/zones`, zoneData, {
                headers: this.headers
            });
            
            log('info', `Zone created: ${zoneName}`, response.data);
            return { success: true, zone: response.data };
        } catch (error) {
            if (error.response?.status === 409) {
                log('info', `Zone already exists: ${zoneName}`);
                return { success: true, message: 'Zone already exists' };
            }
            log('error', `Failed to create zone: ${zoneName}`, error.response?.data);
            throw error;
        }
    }

    async createRecord(zone, name, type, content, ttl = 300) {
        try {
            const recordData = {
                rrsets: [{
                    name: `${name}.${zone}.`,
                    type: type,
                    changetype: 'REPLACE',
                    records: [{
                        content: content,
                        disabled: false
                    }],
                    ttl: ttl
                }]
            };

            const response = await axios.patch(`${this.baseURL}/zones/${zone}.`, recordData, {
                headers: this.headers
            });

            log('info', `DNS record created: ${name}.${zone} -> ${content}`);
            return { success: true, record: recordData.rrsets[0] };
        } catch (error) {
            log('error', `Failed to create DNS record: ${name}.${zone}`, error.response?.data);
            throw error;
        }
    }

    async getZoneRecords(zone) {
        try {
            const response = await axios.get(`${this.baseURL}/zones/${zone}`, {
                headers: this.headers
            });
            return { success: true, records: response.data.rrsets };
        } catch (error) {
            log('error', `Failed to get zone records: ${zone}`, error.response?.data);
            throw error;
        }
    }
}

// Coolify API 클래스
class CoolifyManager {
    constructor() {
        this.baseURL = `${CONFIG.COOLIFY_URL}/api/v1`;
        this.headers = {
            'Authorization': `Bearer ${CONFIG.API_KEYS.COOLIFY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }

    async createProject(name, description = '') {
        try {
            const projectData = {
                name: name,
                description: description || `Auto-deployed project: ${name}`
            };

            const response = await axios.post(`${this.baseURL}/projects`, projectData, {
                headers: this.headers
            });

            log('info', `Coolify project created: ${name}`, response.data);
            return { success: true, project: response.data };
        } catch (error) {
            log('error', `Failed to create Coolify project: ${name}`, error.response?.data);
            throw error;
        }
    }

    async deployApplication(projectId, appConfig) {
        try {
            const appData = {
                name: appConfig.name,
                git_repository: appConfig.gitRepository,
                git_branch: appConfig.gitBranch || 'main',
                build_pack: appConfig.buildPack || 'nixpacks',
                dockerfile_location: appConfig.dockerfileLocation || 'Dockerfile',
                environment_id: 1, // Default environment
                fqdn: appConfig.fqdn,
                ports_exposes: appConfig.ports || '80',
                ...appConfig.additionalSettings
            };

            const response = await axios.post(
                `${this.baseURL}/projects/${projectId}/applications`, 
                appData, 
                { headers: this.headers }
            );

            log('info', `Application deployed: ${appConfig.name}`, response.data);
            return { success: true, application: response.data };
        } catch (error) {
            log('error', `Failed to deploy application: ${appConfig.name}`, error.response?.data);
            throw error;
        }
    }

    async deployDatabase(projectId, dbConfig) {
        try {
            const dbData = {
                name: dbConfig.name,
                type: dbConfig.type, // postgresql, mysql, mongodb, redis
                version: dbConfig.version,
                environment_id: 1,
                database_name: dbConfig.databaseName,
                database_user: dbConfig.databaseUser || 'admin',
                database_password: dbConfig.databasePassword || this.generatePassword(),
                ...dbConfig.additionalSettings
            };

            const response = await axios.post(
                `${this.baseURL}/projects/${projectId}/databases/${dbConfig.type}`, 
                dbData, 
                { headers: this.headers }
            );

            log('info', `Database deployed: ${dbConfig.name} (${dbConfig.type})`, response.data);
            return { success: true, database: response.data };
        } catch (error) {
            log('error', `Failed to deploy database: ${dbConfig.name}`, error.response?.data);
            throw error;
        }
    }

    async getApplications(projectId) {
        try {
            const response = await axios.get(`${this.baseURL}/projects/${projectId}/applications`, {
                headers: this.headers
            });
            return { success: true, applications: response.data };
        } catch (error) {
            log('error', `Failed to get applications for project: ${projectId}`, error.response?.data);
            throw error;
        }
    }

    generatePassword(length = 16) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        return Array.from(crypto.getRandomValues(new Uint8Array(length)))
            .map(byte => chars[byte % chars.length])
            .join('');
    }
}

// Docker 직접 관리 클래스 (Coolify 대안)
class DockerManager {
    constructor() {
        this.serverIP = CONFIG.SERVER_IP;
    }

    async deploySimpleWebApp(projectName, domain, options = {}) {
        try {
            const containerName = `${projectName}-web`;
            const dockerRunCmd = `
                docker run -d \\
                  --name ${containerName} \\
                  --label "traefik.enable=true" \\
                  --label "traefik.http.routers.${projectName}.rule=Host(\`${domain}\`)" \\
                  --label "traefik.http.services.${projectName}.loadbalancer.server.port=${options.port || 80}" \\
                  --network coolify \\
                  --restart unless-stopped \\
                  ${options.image || 'nginx:alpine'}
            `;

            const { exec } = require('child_process');
            return new Promise((resolve, reject) => {
                exec(`ssh root@${this.serverIP} "${dockerRunCmd}"`, (error, stdout, stderr) => {
                    if (error) {
                        log('error', `Failed to deploy container: ${projectName}`, { error: error.message, stderr });
                        reject(error);
                    } else {
                        log('info', `Container deployed: ${containerName}`, { stdout });
                        resolve({ success: true, container: containerName, output: stdout });
                    }
                });
            });
        } catch (error) {
            log('error', `Docker deployment failed: ${projectName}`, error);
            throw error;
        }
    }

    async deployDatabase(dbName, dbType, options = {}) {
        const containerName = `${dbName}-${dbType}`;
        let dockerRunCmd = '';
        
        switch (dbType) {
            case 'postgresql':
                dockerRunCmd = `
                    docker run -d \\
                      --name ${containerName} \\
                      --network coolify \\
                      --restart unless-stopped \\
                      -e POSTGRES_DB=${options.database || dbName} \\
                      -e POSTGRES_USER=${options.user || 'admin'} \\
                      -e POSTGRES_PASSWORD=${options.password || this.generatePassword()} \\
                      -v ${containerName}-data:/var/lib/postgresql/data \\
                      postgres:${options.version || '16-alpine'}
                `;
                break;
                
            case 'redis':
                dockerRunCmd = `
                    docker run -d \\
                      --name ${containerName} \\
                      --network coolify \\
                      --restart unless-stopped \\
                      -v ${containerName}-data:/data \\
                      redis:${options.version || '7-alpine'} redis-server --appendonly yes
                `;
                break;
                
            case 'mysql':
                dockerRunCmd = `
                    docker run -d \\
                      --name ${containerName} \\
                      --network coolify \\
                      --restart unless-stopped \\
                      -e MYSQL_ROOT_PASSWORD=${options.password || this.generatePassword()} \\
                      -e MYSQL_DATABASE=${options.database || dbName} \\
                      -e MYSQL_USER=${options.user || 'admin'} \\
                      -e MYSQL_PASSWORD=${options.password || this.generatePassword()} \\
                      -v ${containerName}-data:/var/lib/mysql \\
                      mysql:${options.version || '8.0'}
                `;
                break;
                
            default:
                throw new Error(`Unsupported database type: ${dbType}`);
        }

        const { exec } = require('child_process');
        return new Promise((resolve, reject) => {
            exec(`ssh root@${this.serverIP} "${dockerRunCmd}"`, (error, stdout, stderr) => {
                if (error) {
                    log('error', `Failed to deploy database: ${containerName}`, { error: error.message, stderr });
                    reject(error);
                } else {
                    log('info', `Database deployed: ${containerName}`, { stdout });
                    resolve({ success: true, database: containerName, output: stdout });
                }
            });
        });
    }

    generatePassword(length = 16) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}

// 매니저 인스턴스 생성
const dnsManager = new PowerDNSManager();
const coolifyManager = new CoolifyManager();
const dockerManager = new DockerManager();

// API 라우트들

// 🏥 헬스 체크
app.get('/api/health', async (req, res) => {
    try {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {
                api: true,
                powerdns: false,
                coolify: false
            }
        };

        // PowerDNS 체크
        try {
            await axios.get(`${CONFIG.POWERDNS_URL}/api/v1/servers/localhost`, {
                headers: { 'X-API-Key': CONFIG.API_KEYS.PDNS }
            });
            health.services.powerdns = true;
        } catch (error) {
            log('warn', 'PowerDNS health check failed', error.message);
        }

        // Coolify 체크 (선택사항)
        if (CONFIG.API_KEYS.COOLIFY) {
            try {
                await axios.get(`${CONFIG.COOLIFY_URL}/api/v1/projects`, {
                    headers: { 'Authorization': `Bearer ${CONFIG.API_KEYS.COOLIFY}` }
                });
                health.services.coolify = true;
            } catch (error) {
                log('warn', 'Coolify health check failed', error.message);
            }
        }

        res.json(health);
    } catch (error) {
        res.status(500).json({ error: 'Health check failed', details: error.message });
    }
});

// 🚀 완전 자동 프로젝트 배포
app.post('/api/deploy', async (req, res) => {
    const {
        projectName,
        domain,
        services = [],
        gitRepository,
        appType = 'simple-web'
    } = req.body;

    const deploymentId = uuidv4();
    const fullDomain = domain || `${projectName}.${CONFIG.BASE_DOMAIN}`;

    try {
        log('info', `Starting deployment: ${projectName}`, { deploymentId, domain: fullDomain });

        // 1. DNS 레코드 생성
        log('info', `Creating DNS records for: ${fullDomain}`);
        await dnsManager.createRecord(CONFIG.BASE_DOMAIN, projectName, 'A', CONFIG.SERVER_IP);

        // 2. 메인 애플리케이션 배포
        let appResult;
        if (gitRepository) {
            // Git 저장소 기반 배포 (추후 Coolify 연동)
            log('info', `Deploying from Git repository: ${gitRepository}`);
            appResult = await dockerManager.deploySimpleWebApp(projectName, fullDomain, {
                image: 'nginx:alpine', // 임시로 nginx 사용
                port: 80
            });
        } else {
            // 간단한 웹앱 배포
            log('info', `Deploying simple web application: ${projectName}`);
            appResult = await dockerManager.deploySimpleWebApp(projectName, fullDomain);
        }

        // 3. 추가 서비스 배포 (DB, Redis 등)
        const deployedServices = [];
        for (const service of services) {
            log('info', `Deploying service: ${service.name} (${service.type})`);
            
            if (['postgresql', 'mysql', 'redis', 'mongodb'].includes(service.type)) {
                const dbResult = await dockerManager.deployDatabase(
                    `${projectName}-${service.name}`,
                    service.type,
                    service.options || {}
                );
                deployedServices.push({
                    name: service.name,
                    type: service.type,
                    container: dbResult.database,
                    status: 'deployed'
                });
            }
        }

        // 4. 배포 완료 응답
        const response = {
            success: true,
            deploymentId,
            projectName,
            domain: fullDomain,
            url: `http://${fullDomain}`,
            services: deployedServices,
            application: {
                container: appResult.container,
                status: 'deployed'
            },
            deployedAt: new Date().toISOString()
        };

        log('info', `Deployment completed: ${projectName}`, response);
        res.json(response);

    } catch (error) {
        log('error', `Deployment failed: ${projectName}`, error.message);
        res.status(500).json({
            error: 'Deployment failed',
            deploymentId,
            details: error.message,
            projectName,
            domain: fullDomain
        });
    }
});

// 🗑️ 프로젝트 삭제
app.delete('/api/projects/:projectName', async (req, res) => {
    const { projectName } = req.params;
    const { removeDNS = true } = req.query;

    try {
        log('info', `Deleting project: ${projectName}`);

        // 1. Docker 컨테이너 정리
        const { exec } = require('child_process');
        const cleanupCmd = `docker stop $(docker ps -q --filter "name=${projectName}") && docker rm $(docker ps -aq --filter "name=${projectName}")`;
        
        await new Promise((resolve, reject) => {
            exec(`ssh root@${CONFIG.SERVER_IP} "${cleanupCmd}"`, (error, stdout, stderr) => {
                if (error && !error.message.includes('No such container')) {
                    log('warn', `Container cleanup warning: ${projectName}`, error.message);
                }
                resolve();
            });
        });

        // 2. DNS 레코드 삭제 (선택사항)
        if (removeDNS) {
            try {
                await dnsManager.createRecord(CONFIG.BASE_DOMAIN, projectName, 'A', '', 0); // TTL 0으로 삭제
                log('info', `DNS records removed for: ${projectName}`);
            } catch (error) {
                log('warn', `DNS cleanup failed: ${projectName}`, error.message);
            }
        }

        res.json({
            success: true,
            message: `Project ${projectName} deleted successfully`,
            removedDNS: removeDNS
        });

    } catch (error) {
        log('error', `Failed to delete project: ${projectName}`, error.message);
        res.status(500).json({
            error: 'Project deletion failed',
            details: error.message
        });
    }
});

// 📊 프로젝트 목록 및 상태
app.get('/api/projects', async (req, res) => {
    try {
        const { exec } = require('child_process');
        
        // Docker 컨테이너 목록 가져오기
        const containersResult = await new Promise((resolve, reject) => {
            exec(`ssh root@${CONFIG.SERVER_IP} "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'`, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        });

        // DNS 레코드 가져오기
        const dnsRecords = await dnsManager.getZoneRecords(CONFIG.BASE_DOMAIN);

        res.json({
            success: true,
            containers: containersResult.split('\n').filter(line => line.trim()),
            dns: dnsRecords.success ? dnsRecords.records : [],
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        log('error', 'Failed to get projects list', error.message);
        res.status(500).json({
            error: 'Failed to get projects',
            details: error.message
        });
    }
});

// 🌐 DNS 관리
app.post('/api/dns/records', async (req, res) => {
    const { name, type, content, ttl = 300 } = req.body;

    try {
        const result = await dnsManager.createRecord(CONFIG.BASE_DOMAIN, name, type, content, ttl);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: 'DNS record creation failed',
            details: error.message
        });
    }
});

// 서버 시작
app.listen(port, () => {
    log('info', `🚀 Deployment Server API running on http://localhost:${port}`);
    log('info', `📋 Available endpoints:`);
    log('info', `   GET  /api/health       - Health check`);
    log('info', `   POST /api/deploy       - Deploy project`);
    log('info', `   GET  /api/projects     - List projects`);
    log('info', `   POST /api/dns/records  - Create DNS record`);
    log('info', `   DELETE /api/projects/:name - Delete project`);
    log('info', `🔧 Server Configuration:`);
    log('info', `   PowerDNS: ${CONFIG.POWERDNS_URL}`);
    log('info', `   Coolify:  ${CONFIG.COOLIFY_URL}`);
    log('info', `   Domain:   ${CONFIG.BASE_DOMAIN}`);
});