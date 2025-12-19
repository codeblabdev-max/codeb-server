#!/usr/bin/env node

/**
 * 🚀 완전한 Coolify + PowerDNS 배포 서버
 * 프로젝트 생성, 도메인 연결, 데이터베이스, 환경변수 설정 통합
 */

const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const app = express();
const port = 3005;

app.use(express.json());

// 서버 설정
const CONFIG = {
    SERVER_IP: '141.164.60.51',
    COOLIFY_URL: 'http://141.164.60.51:8000',
    POWERDNS_URL: 'http://141.164.60.51:8081',
    BASE_DOMAIN: 'one-q.xyz',
    SERVER_UUID: 'io0ok40oo0448k80g888ock8',
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
            return { success: false, error: error.message };
        }
    }
}

// Coolify API 관리자
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

            log('info', `Creating Coolify project: ${name}`);

            const response = await axios.post(`${this.baseURL}/projects`, projectData, {
                headers: this.headers,
                timeout: 30000
            });

            log('info', `Coolify project created: ${name}`, response.data);
            return { success: true, project: response.data };
        } catch (error) {
            log('error', `Failed to create project: ${name}`, {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw error;
        }
    }

    // Git 애플리케이션 배포
    async deployGitApplication(projectUuid, config) {
        try {
            const appData = {
                project_uuid: projectUuid,
                server_uuid: CONFIG.SERVER_UUID,
                environment_name: config.environment_name || 'production',
                git_repository: config.gitRepository,
                git_branch: config.gitBranch || 'main',
                build_pack: config.buildPack || 'nixpacks',
                name: config.name,
                description: config.description || `Auto-deployed app: ${config.name}`,
                fqdn: config.fqdn,
                ports_exposes: config.port || '3000'
            };

            log('info', `Deploying Git application: ${config.name}`);

            const response = await axios.post(`${this.baseURL}/applications/public`, appData, {
                headers: this.headers,
                timeout: 60000
            });

            log('info', `Git application deployed: ${config.name}`);
            return { success: true, application: response.data };
        } catch (error) {
            log('error', `Failed to deploy Git application: ${config.name}`, {
                status: error.response?.status,
                data: error.response?.data
            });
            throw error;
        }
    }

    // Docker Compose 애플리케이션 배포
    async deployDockerComposeApplication(projectUuid, config) {
        try {
            const dockerComposeBase64 = Buffer.from(config.dockerComposeContent).toString('base64');
            
            const appData = {
                project_uuid: projectUuid,
                server_uuid: CONFIG.SERVER_UUID,
                environment_name: config.environment_name || 'production',
                docker_compose_raw: dockerComposeBase64,
                name: config.name,
                description: config.description || `Docker Compose app: ${config.name}`
            };

            log('info', `Deploying Docker Compose application: ${config.name}`);

            const response = await axios.post(`${this.baseURL}/applications/dockercompose`, appData, {
                headers: this.headers,
                timeout: 60000
            });

            log('info', `Docker Compose application deployed: ${config.name}`);
            return { success: true, application: response.data };
        } catch (error) {
            log('error', `Failed to deploy Docker Compose application: ${config.name}`, {
                status: error.response?.status,
                data: error.response?.data
            });
            throw error;
        }
    }

    // 데이터베이스 생성
    async createDatabase(projectUuid, dbConfig) {
        try {
            const baseData = {
                project_uuid: projectUuid,
                server_uuid: CONFIG.SERVER_UUID,
                environment_name: dbConfig.environment_name || 'production',
                name: dbConfig.name,
                description: dbConfig.description || `Database: ${dbConfig.name}`,
                instant_deploy: true
            };

            let dbData = { ...baseData };
            let endpoint = '';
            
            switch (dbConfig.type) {
                case 'postgresql':
                    endpoint = '/databases/postgresql';
                    dbData.postgres_password = dbConfig.password || this.generatePassword();
                    dbData.postgres_user = dbConfig.user || 'dbuser';
                    dbData.postgres_db = dbConfig.database || dbConfig.name;
                    break;
                case 'mysql':
                    endpoint = '/databases/mysql';
                    dbData.mysql_root_password = dbConfig.rootPassword || this.generatePassword();
                    dbData.mysql_user = dbConfig.user || 'dbuser';
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
                    dbData.mongo_initdb_database = dbConfig.database || dbConfig.name;
                    break;
                default:
                    throw new Error(`Unsupported database type: ${dbConfig.type}`);
            }

            log('info', `Creating ${dbConfig.type} database: ${dbConfig.name}`);

            const response = await axios.post(`${this.baseURL}${endpoint}`, dbData, {
                headers: this.headers,
                timeout: 60000
            });

            // 데이터베이스 즉시 시작
            if (response.data.uuid) {
                await this.startDatabase(response.data.uuid);
            }

            log('info', `Database created and started: ${dbConfig.name}`);
            return { 
                success: true, 
                database: response.data,
                credentials: {
                    type: dbConfig.type,
                    user: dbData.postgres_user || dbData.mysql_user || dbData.mongo_initdb_root_username || 'default',
                    password: dbData.postgres_password || dbData.mysql_password || dbData.redis_password || dbData.mongo_initdb_root_password,
                    database: dbData.postgres_db || dbData.mysql_database || dbData.mongo_initdb_database || dbConfig.name
                }
            };
        } catch (error) {
            log('error', `Failed to create database: ${dbConfig.name}`, {
                status: error.response?.status,
                data: error.response?.data
            });
            throw error;
        }
    }

    // 데이터베이스 시작
    async startDatabase(databaseUuid) {
        try {
            log('info', `Starting database: ${databaseUuid}`);

            const response = await axios.post(`${this.baseURL}/databases/${databaseUuid}/start`, {}, {
                headers: this.headers,
                timeout: 60000
            });

            log('info', `Database started: ${databaseUuid}`);
            return { success: true };
        } catch (error) {
            log('warn', `Failed to start database: ${databaseUuid}`, error.message);
            return { success: false, error: error.message };
        }
    }

    // 환경 변수 설정
    async setEnvironmentVariables(applicationUuid, variables) {
        try {
            const envData = variables.map(variable => ({
                key: variable.key,
                value: variable.value,
                is_preview: variable.isPreview || false,
                is_build_time: variable.isBuildTime || false
            }));

            log('info', `Setting environment variables for application: ${applicationUuid}`);

            const response = await axios.post(`${this.baseURL}/applications/${applicationUuid}/envs/bulk`, {
                environment_variables: envData
            }, {
                headers: this.headers,
                timeout: 30000
            });

            log('info', `Environment variables set for application: ${applicationUuid}`);
            return { success: true, variables: response.data };
        } catch (error) {
            log('error', `Failed to set environment variables: ${applicationUuid}`, {
                status: error.response?.status,
                data: error.response?.data
            });
            return { success: false, error: error.message };
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
            return { success: true };
        } catch (error) {
            log('warn', `Failed to start application: ${applicationUuid}`, error.message);
            return { success: false, error: error.message };
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
                data: error.response?.data
            });
            throw error;
        }
    }

    generatePassword(length = 16) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}

// 매니저 인스턴스
const dnsManager = new PowerDNSManager();
const coolifyManager = new CoolifyAPIManager();

// API 라우트들

// 헬스 체크
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
            log('warn', 'PowerDNS health check failed');
        }

        // Coolify 체크
        try {
            await axios.get(`${CONFIG.COOLIFY_URL}/api/v1/projects`, {
                headers: { 'Authorization': `Bearer ${CONFIG.API_KEYS.COOLIFY}` },
                timeout: 5000
            });
            health.services.coolify = true;
        } catch (error) {
            log('warn', 'Coolify health check failed');
        }

        res.json(health);
    } catch (error) {
        res.status(500).json({ error: 'Health check failed', details: error.message });
    }
});

// 🚀 완전 통합 배포 엔드포인트
app.post('/api/deploy/complete', async (req, res) => {
    const {
        projectName,
        domain,
        gitRepository,
        gitBranch = 'main',
        buildPack = 'nixpacks',
        port = '3000',
        databases = [],
        environmentVariables = [],
        dockerComposeContent,
        autoStart = true
    } = req.body;

    const deploymentId = uuidv4();
    const fullDomain = domain || `${projectName}.${CONFIG.BASE_DOMAIN}`;
    const deploymentLog = [];

    try {
        log('info', `Starting complete deployment: ${projectName}`, {
            deploymentId,
            domain: fullDomain
        });

        // 1. DNS 레코드 생성
        deploymentLog.push({ step: 'DNS', status: 'starting' });
        const dnsResult = await dnsManager.createRecord(CONFIG.BASE_DOMAIN, projectName, 'A', CONFIG.SERVER_IP);
        deploymentLog.push({ 
            step: 'DNS', 
            status: dnsResult.success ? 'completed' : 'failed',
            details: dnsResult.success ? `DNS record created: ${fullDomain}` : dnsResult.error
        });

        // 2. Coolify 프로젝트 생성
        deploymentLog.push({ step: 'Project', status: 'starting' });
        const projectResult = await coolifyManager.createProject(
            projectName,
            `Deployed via API: ${new Date().toISOString()}`
        );
        const projectUuid = projectResult.project.uuid;
        deploymentLog.push({ 
            step: 'Project', 
            status: 'completed',
            details: `Project created with UUID: ${projectUuid}`
        });

        // 3. 데이터베이스 생성
        const deployedDatabases = [];
        for (const dbConfig of databases) {
            deploymentLog.push({ 
                step: `Database-${dbConfig.name}`, 
                status: 'starting',
                type: dbConfig.type
            });
            
            try {
                const dbResult = await coolifyManager.createDatabase(projectUuid, {
                    name: `${projectName}-${dbConfig.name}`,
                    type: dbConfig.type,
                    ...dbConfig
                });

                deployedDatabases.push({
                    name: dbConfig.name,
                    type: dbConfig.type,
                    uuid: dbResult.database.uuid,
                    status: 'deployed',
                    credentials: dbResult.credentials
                });

                deploymentLog.push({ 
                    step: `Database-${dbConfig.name}`, 
                    status: 'completed',
                    details: `${dbConfig.type} database created and started`
                });
            } catch (dbError) {
                deploymentLog.push({ 
                    step: `Database-${dbConfig.name}`, 
                    status: 'failed',
                    error: dbError.message
                });
            }
        }

        // 4. 애플리케이션 배포
        let applicationResult;
        deploymentLog.push({ step: 'Application', status: 'starting' });

        if (dockerComposeContent) {
            // Docker Compose 배포
            applicationResult = await coolifyManager.deployDockerComposeApplication(projectUuid, {
                name: projectName,
                dockerComposeContent: dockerComposeContent,
                fqdn: fullDomain
            });
        } else if (gitRepository) {
            // Git 저장소 배포
            applicationResult = await coolifyManager.deployGitApplication(projectUuid, {
                name: projectName,
                gitRepository: gitRepository,
                gitBranch: gitBranch,
                buildPack: buildPack,
                fqdn: fullDomain,
                port: port
            });
        } else {
            // 기본 Nginx 배포
            const defaultCompose = `version: '3.8'
services:
  web:
    image: nginx:alpine
    ports:
      - "80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
    restart: unless-stopped`;

            applicationResult = await coolifyManager.deployDockerComposeApplication(projectUuid, {
                name: projectName,
                dockerComposeContent: defaultCompose,
                fqdn: fullDomain
            });
        }

        deploymentLog.push({ 
            step: 'Application', 
            status: 'completed',
            details: `Application deployed with UUID: ${applicationResult.application.uuid}`
        });

        // 5. 환경 변수 설정
        if (environmentVariables.length > 0 && applicationResult.application.uuid) {
            deploymentLog.push({ step: 'Environment Variables', status: 'starting' });
            
            // 데이터베이스 연결 정보를 환경 변수에 추가
            const allEnvVars = [...environmentVariables];
            
            deployedDatabases.forEach(db => {
                if (db.credentials) {
                    const prefix = db.name.toUpperCase();
                    allEnvVars.push(
                        { key: `${prefix}_HOST`, value: `${projectName}-${db.name}` },
                        { key: `${prefix}_USER`, value: db.credentials.user },
                        { key: `${prefix}_PASSWORD`, value: db.credentials.password },
                        { key: `${prefix}_DATABASE`, value: db.credentials.database }
                    );
                }
            });

            const envResult = await coolifyManager.setEnvironmentVariables(
                applicationResult.application.uuid, 
                allEnvVars
            );
            
            deploymentLog.push({ 
                step: 'Environment Variables', 
                status: envResult.success ? 'completed' : 'failed',
                details: envResult.success ? `${allEnvVars.length} variables set` : envResult.error
            });
        }

        // 6. 애플리케이션 시작
        if (autoStart && applicationResult.application.uuid) {
            deploymentLog.push({ step: 'Start Application', status: 'starting' });
            const startResult = await coolifyManager.startApplication(applicationResult.application.uuid);
            deploymentLog.push({ 
                step: 'Start Application', 
                status: startResult.success ? 'completed' : 'failed',
                details: startResult.success ? 'Application started' : startResult.error
            });
        }

        // 7. 배포 완료 응답
        const response = {
            success: true,
            deploymentId,
            projectName,
            domain: fullDomain,
            url: `https://${fullDomain}`,
            coolify: {
                projectUuid: projectUuid,
                applicationUuid: applicationResult.application.uuid,
                dashboardUrl: `${CONFIG.COOLIFY_URL}/project/${projectUuid}`
            },
            databases: deployedDatabases,
            deploymentLog,
            deployedAt: new Date().toISOString(),
            instructions: {
                access: `Your application will be available at https://${fullDomain} in 1-2 minutes`,
                dashboard: `View in Coolify: ${CONFIG.COOLIFY_URL}/project/${projectUuid}`,
                dns: `DNS propagation may take up to 5 minutes`
            }
        };

        log('info', `Deployment completed successfully: ${projectName}`);
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
            deploymentLog,
            projectName,
            domain: fullDomain
        });
    }
});

// 프로젝트 목록 조회
app.get('/api/projects', async (req, res) => {
    try {
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

// 서버 시작
app.listen(port, () => {
    log('info', `🚀 Coolify Complete Deployment Server running on http://localhost:${port}`);
    log('info', `📋 Available endpoints:`);
    log('info', `   GET  /api/health           - Health check`);
    log('info', `   POST /api/deploy/complete  - Complete project deployment`);
    log('info', `   GET  /api/projects         - List all projects`);
    log('info', `🔧 Configuration:`);
    log('info', `   Coolify:  ${CONFIG.COOLIFY_URL}`);
    log('info', `   PowerDNS: ${CONFIG.POWERDNS_URL}`);
    log('info', `   Domain:   ${CONFIG.BASE_DOMAIN}`);
    log('info', `   Server:   ${CONFIG.SERVER_UUID}`);
});