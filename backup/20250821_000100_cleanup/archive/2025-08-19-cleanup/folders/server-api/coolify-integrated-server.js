#!/usr/bin/env node

/**
 * 🚀 실제 Coolify API 연동 배포 서버
 * Coolify 웹 대시보드에 표시되는 진짜 프로젝트 생성
 */

const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const app = express();
const port = 3003;

app.use(express.json());

// 서버 설정
const CONFIG = {
    SERVER_IP: '141.164.60.51',
    COOLIFY_URL: 'http://141.164.60.51:8000',
    POWERDNS_URL: 'http://141.164.60.51:8081',
    BASE_DOMAIN: 'one-q.xyz',
    API_KEYS: {
        PDNS: process.env.PDNS_API_KEY || '20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5',
        COOLIFY: process.env.COOLIFY_API_TOKEN || '7|hhVQUT7DdQEBUD3Ac992z9Zx2OVkaGjXye3f7BtEb0fb5881'
    }
};

// 로그 함수
const log = (level, message, data = null) => {
    const timestamp = new Date().toISOString();
    const logData = data ? JSON.stringify(data, null, 2) : '';
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message} ${logData}`);
};

// PowerDNS 관리자
class PowerDNSManager {
    constructor() {
        this.baseURL = `${CONFIG.POWERDNS_URL}/api/v1/servers/localhost`;
        this.headers = {
            'X-API-Key': CONFIG.API_KEYS.PDNS,
            'Content-Type': 'application/json'
        };
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
                headers: this.headers,
                timeout: 10000
            });

            log('info', `DNS record created: ${name}.${zone} -> ${content}`);
            return { success: true, record: recordData.rrsets[0] };
        } catch (error) {
            log('error', `Failed to create DNS record: ${name}.${zone}`, {
                error: error.response?.data || error.message
            });
            throw error;
        }
    }
}

// 실제 Coolify API 관리자
class CoolifyAPIManager {
    constructor() {
        this.baseURL = `${CONFIG.COOLIFY_URL}/api/v1`;
        this.headers = {
            'Authorization': `Bearer ${CONFIG.API_KEYS.COOLIFY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }

    // 프로젝트 생성
    async createProject(name, description = '') {
        try {
            const projectData = {
                name: name,
                description: description || `Auto-deployed project: ${name}`
            };

            log('info', `Creating Coolify project: ${name}`, projectData);

            const response = await axios.post(`${this.baseURL}/projects`, projectData, {
                headers: this.headers,
                timeout: 30000
            });

            log('info', `Coolify project created successfully: ${name}`, response.data);
            return { success: true, project: response.data };
        } catch (error) {
            log('error', `Failed to create Coolify project: ${name}`, {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw error;
        }
    }

    // Git 저장소 기반 애플리케이션 배포
    async deployGitApplication(projectUuid, config) {
        try {
            const appData = {
                project_uuid: projectUuid,
                server_uuid: config.server_uuid || 'io0ok40oo0448k80g888ock8', // 실제 서버 UUID
                environment_name: config.environment_name || 'production',
                git_repository: config.gitRepository,
                git_branch: config.gitBranch || 'main',
                build_pack: config.buildPack || 'nixpacks', // nixpacks, dockerfile, static
                name: config.name,
                description: config.description || `Auto-deployed app: ${config.name}`,
                fqdn: config.fqdn,
                ports_exposes: config.port || '3000'
            };

            log('info', `Deploying Git application: ${config.name}`, appData);

            const response = await axios.post(`${this.baseURL}/applications/public`, appData, {
                headers: this.headers,
                timeout: 60000
            });

            log('info', `Git application deployed: ${config.name}`, response.data);
            return { success: true, application: response.data };
        } catch (error) {
            log('error', `Failed to deploy Git application: ${config.name}`, {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw error;
        }
    }

    // Docker Compose 애플리케이션 배포
    async deployDockerComposeApplication(projectUuid, config) {
        try {
            // Docker Compose 내용을 base64로 인코딩
            const dockerComposeBase64 = Buffer.from(config.dockerComposeContent).toString('base64');
            
            const appData = {
                project_uuid: projectUuid,
                server_uuid: config.server_uuid || 'io0ok40oo0448k80g888ock8', // 실제 서버 UUID
                environment_name: config.environment_name || 'production',
                docker_compose_raw: dockerComposeBase64,
                name: config.name,
                description: config.description || `Docker Compose app: ${config.name}`
            };

            log('info', `Deploying Docker Compose application: ${config.name}`, {
                name: appData.name,
                fqdn: appData.fqdn
            });

            const response = await axios.post(`${this.baseURL}/applications/dockercompose`, appData, {
                headers: this.headers,
                timeout: 60000
            });

            log('info', `Docker Compose application deployed: ${config.name}`, response.data);
            return { success: true, application: response.data };
        } catch (error) {
            log('error', `Failed to deploy Docker Compose application: ${config.name}`, {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw error;
        }
    }

    // 데이터베이스 생성
    async createDatabase(projectUuid, dbConfig) {
        try {
            const baseData = {
                project_uuid: projectUuid,
                server_uuid: dbConfig.server_uuid || '0', // 기본 서버 UUID
                environment_name: dbConfig.environment_name || 'production',
                name: dbConfig.name,
                description: dbConfig.description || `Database: ${dbConfig.name}`
            };

            let dbData = { ...baseData };
            let endpoint = '';
            
            switch (dbConfig.type) {
                case 'postgresql':
                    endpoint = '/databases/postgresql';
                    dbData.postgres_password = dbConfig.password || this.generatePassword();
                    dbData.postgres_user = dbConfig.user || 'admin';
                    dbData.postgres_db = dbConfig.database || dbConfig.name;
                    break;
                case 'mysql':
                    endpoint = '/databases/mysql';
                    dbData.mysql_root_password = dbConfig.password || this.generatePassword();
                    dbData.mysql_user = dbConfig.user || 'admin';
                    dbData.mysql_password = dbConfig.password || this.generatePassword();
                    dbData.mysql_database = dbConfig.database || dbConfig.name;
                    break;
                case 'redis':
                    endpoint = '/databases/redis';
                    dbData.redis_password = dbConfig.password || this.generatePassword();
                    break;
                case 'mongodb':
                    endpoint = '/databases/mongodb';
                    dbData.mongo_initdb_root_username = dbConfig.user || 'admin';
                    dbData.mongo_initdb_root_password = dbConfig.password || this.generatePassword();
                    break;
                default:
                    throw new Error(`Unsupported database type: ${dbConfig.type}`);
            }

            log('info', `Creating ${dbConfig.type} database: ${dbConfig.name}`, {
                name: dbData.name,
                endpoint: endpoint
            });

            const response = await axios.post(`${this.baseURL}${endpoint}`, dbData, {
                headers: this.headers,
                timeout: 60000
            });

            log('info', `Database created: ${dbConfig.name}`, response.data);
            return { success: true, database: response.data };
        } catch (error) {
            log('error', `Failed to create database: ${dbConfig.name}`, {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw error;
        }
    }

    // 환경 변수 설정
    async setEnvironmentVariables(resourceUuid, variables) {
        try {
            const envData = variables.map(variable => ({
                key: variable.key,
                value: variable.value,
                is_preview: variable.isPreview || false,
                is_build_time: variable.isBuildTime || false
            }));

            log('info', `Setting environment variables for resource: ${resourceUuid}`, envData);

            const response = await axios.post(`${this.baseURL}/applications/${resourceUuid}/envs/bulk`, {
                environment_variables: envData
            }, {
                headers: this.headers,
                timeout: 30000
            });

            log('info', `Environment variables set for resource: ${resourceUuid}`);
            return { success: true, variables: response.data };
        } catch (error) {
            log('error', `Failed to set environment variables: ${resourceUuid}`, {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw error;
        }
    }

    // 애플리케이션 시작
    async startApplication(applicationUuid) {
        try {
            log('info', `Starting application: ${applicationUuid}`);

            const response = await axios.post(`${this.baseURL}/applications/${applicationUuid}/start`, {}, {
                headers: this.headers,
                timeout: 60000
            });

            log('info', `Application started: ${applicationUuid}`);
            return { success: true, result: response.data };
        } catch (error) {
            log('error', `Failed to start application: ${applicationUuid}`, {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw error;
        }
    }

    // 프로젝트 목록 조회
    async getProjects() {
        try {
            const response = await axios.get(`${this.baseURL}/projects`, {
                headers: this.headers,
                timeout: 30000
            });

            return { success: true, projects: response.data };
        } catch (error) {
            log('error', 'Failed to get projects', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw error;
        }
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
const coolifyManager = new CoolifyAPIManager();

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
                headers: { 'X-API-Key': CONFIG.API_KEYS.PDNS },
                timeout: 5000
            });
            health.services.powerdns = true;
        } catch (error) {
            log('warn', 'PowerDNS health check failed', error.message);
        }

        // Coolify 체크
        if (CONFIG.API_KEYS.COOLIFY) {
            try {
                await axios.get(`${CONFIG.COOLIFY_URL}/api/v1/projects`, {
                    headers: { 'Authorization': `Bearer ${CONFIG.API_KEYS.COOLIFY}` },
                    timeout: 5000
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

// 🚀 완전 통합 프로젝트 배포 (Coolify 웹 대시보드에 표시됨)
app.post('/api/deploy', async (req, res) => {
    const {
        projectName,
        domain,
        gitRepository,
        gitBranch = 'main',
        buildPack = 'nixpacks',
        port = '3000',
        databases = [],
        environmentVariables = [],
        dockerComposeContent
    } = req.body;

    if (!CONFIG.API_KEYS.COOLIFY) {
        return res.status(400).json({
            error: 'Coolify API token not configured',
            message: 'Please set COOLIFY_API_TOKEN environment variable'
        });
    }

    const deploymentId = uuidv4();
    const fullDomain = domain || `${projectName}.${CONFIG.BASE_DOMAIN}`;

    try {
        log('info', `Starting complete deployment: ${projectName}`, {
            deploymentId,
            domain: fullDomain,
            gitRepository,
            databases: databases.length
        });

        // 1. DNS 레코드 생성
        log('info', `Creating DNS record for: ${fullDomain}`);
        try {
            await dnsManager.createRecord(CONFIG.BASE_DOMAIN, projectName, 'A', CONFIG.SERVER_IP);
        } catch (dnsError) {
            log('warn', 'DNS creation failed, continuing with deployment', dnsError.message);
        }

        // 2. Coolify 프로젝트 생성
        log('info', `Creating Coolify project: ${projectName}`);
        const projectResult = await coolifyManager.createProject(
            projectName,
            `Auto-deployed project: ${projectName} (${new Date().toISOString()})`
        );

        const projectUuid = projectResult.project.uuid;
        log('info', `Project created with UUID: ${projectUuid}`);

        // 3. 데이터베이스 생성
        const deployedDatabases = [];
        for (const dbConfig of databases) {
            log('info', `Creating database: ${dbConfig.name} (${dbConfig.type})`);
            try {
                const dbResult = await coolifyManager.createDatabase(projectUuid, {
                    name: `${projectName}-${dbConfig.name}`,
                    type: dbConfig.type,
                    description: `Database for ${projectName}`,
                    ...dbConfig
                });

                deployedDatabases.push({
                    name: dbConfig.name,
                    type: dbConfig.type,
                    uuid: dbResult.database.uuid,
                    status: 'created'
                });
            } catch (dbError) {
                log('error', `Database creation failed: ${dbConfig.name}`, dbError.message);
                deployedDatabases.push({
                    name: dbConfig.name,
                    type: dbConfig.type,
                    status: 'failed',
                    error: dbError.message
                });
            }
        }

        // 4. 애플리케이션 배포
        let applicationResult;
        let deploymentType = 'simple';

        if (dockerComposeContent) {
            // Docker Compose 배포
            deploymentType = 'docker-compose';
            log('info', `Deploying Docker Compose application: ${projectName}`);
            
            applicationResult = await coolifyManager.deployDockerComposeApplication(projectUuid, {
                name: projectName,
                dockerComposeContent: dockerComposeContent,
                fqdn: fullDomain,
                environmentVariables: environmentVariables
            });
        } else if (gitRepository) {
            // Git 저장소 배포
            deploymentType = 'git';
            log('info', `Deploying Git application: ${projectName}`, {
                repository: gitRepository,
                branch: gitBranch
            });
            
            applicationResult = await coolifyManager.deployGitApplication(projectUuid, {
                name: projectName,
                gitRepository: gitRepository,
                gitBranch: gitBranch,
                buildPack: buildPack,
                fqdn: fullDomain,
                port: port,
                environmentVariables: environmentVariables
            });
        } else {
            // 간단한 Nginx 배포 (Docker Compose 사용)
            const simpleNginxCompose = `version: '3.8'
services:
  web:
    image: nginx:alpine
    ports:
      - "80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
    restart: unless-stopped
    labels:
      - "coolify.managed=true"
      - "coolify.version=4.0"`;

            applicationResult = await coolifyManager.deployDockerComposeApplication(projectUuid, {
                name: projectName,
                dockerComposeContent: simpleNginxCompose,
                fqdn: fullDomain,
                environmentVariables: environmentVariables
            });
        }

        // 5. 환경 변수 설정 (있다면)
        if (environmentVariables.length > 0 && applicationResult.application.uuid) {
            log('info', `Setting environment variables for application: ${applicationResult.application.uuid}`);
            try {
                await coolifyManager.setEnvironmentVariables(applicationResult.application.uuid, environmentVariables);
            } catch (envError) {
                log('warn', 'Environment variable setting failed', envError.message);
            }
        }

        // 6. 애플리케이션 시작
        if (applicationResult.application.uuid) {
            log('info', `Starting application: ${applicationResult.application.uuid}`);
            try {
                await coolifyManager.startApplication(applicationResult.application.uuid);
            } catch (startError) {
                log('warn', 'Application start failed', startError.message);
            }
        }

        // 7. 배포 완료 응답
        const response = {
            success: true,
            deploymentId,
            projectName,
            domain: fullDomain,
            url: `http://${fullDomain}`,
            deploymentType,
            coolify: {
                projectUuid: projectUuid,
                applicationUuid: applicationResult.application.uuid,
                dashboardUrl: `${CONFIG.COOLIFY_URL}/project/${projectUuid}`
            },
            databases: deployedDatabases,
            application: {
                uuid: applicationResult.application.uuid,
                name: applicationResult.application.name,
                status: 'deployed'
            },
            deployedAt: new Date().toISOString()
        };

        log('info', `Deployment completed successfully: ${projectName}`, {
            projectUuid,
            applicationUuid: applicationResult.application.uuid,
            domain: fullDomain
        });

        res.json(response);

    } catch (error) {
        log('error', `Deployment failed: ${projectName}`, {
            error: error.message,
            stack: error.stack
        });
        
        res.status(500).json({
            error: 'Deployment failed',
            deploymentId,
            details: error.message,
            projectName,
            domain: fullDomain
        });
    }
});

// 📋 프로젝트 목록 조회 (Coolify에서)
app.get('/api/projects', async (req, res) => {
    try {
        if (!CONFIG.API_KEYS.COOLIFY) {
            return res.status(400).json({
                error: 'Coolify API token not configured'
            });
        }

        const projectsResult = await coolifyManager.getProjects();

        res.json({
            success: true,
            projects: projectsResult.projects,
            coolifyDashboard: CONFIG.COOLIFY_URL,
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

// 🌐 DNS 레코드 생성
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
    log('info', `🚀 Coolify Integrated Deployment Server running on http://localhost:${port}`);
    log('info', `📋 Available endpoints:`);
    log('info', `   GET  /api/health       - Health check`);
    log('info', `   POST /api/deploy       - Deploy project (shows in Coolify dashboard)`);
    log('info', `   GET  /api/projects     - List projects from Coolify`);
    log('info', `   POST /api/dns/records  - Create DNS record`);
    log('info', `🔧 Server Configuration:`);
    log('info', `   PowerDNS:     ${CONFIG.POWERDNS_URL}`);
    log('info', `   Coolify:      ${CONFIG.COOLIFY_URL}`);
    log('info', `   Coolify Web:  ${CONFIG.COOLIFY_URL} (projects will show here)`);
    log('info', `   Domain:       ${CONFIG.BASE_DOMAIN}`);
    log('info', `   API Keys:     PDNS=${!!CONFIG.API_KEYS.PDNS} COOLIFY=${!!CONFIG.API_KEYS.COOLIFY}`);
    
    if (!CONFIG.API_KEYS.COOLIFY) {
        log('warn', `⚠️  COOLIFY_API_TOKEN not set! Generate token at ${CONFIG.COOLIFY_URL}/settings/api-tokens`);
    }
});