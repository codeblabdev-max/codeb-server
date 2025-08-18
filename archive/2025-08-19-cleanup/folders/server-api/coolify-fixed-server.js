#!/usr/bin/env node

/**
 * 🚀 Coolify + PowerDNS 완전 통합 배포 서버 (수정 버전)
 * 모든 기능이 제대로 작동하도록 수정
 */

const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const app = express();
const port = 3006;

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
                description: description || `Auto-deployed: ${name}`
            };

            log('info', `Creating Coolify project: ${name}`);

            const response = await axios.post(`${this.baseURL}/projects`, projectData, {
                headers: this.headers,
                timeout: 30000
            });

            log('info', `Project created: ${name}`, response.data);
            return { success: true, project: response.data };
        } catch (error) {
            log('error', `Failed to create project: ${name}`, error.response?.data);
            throw error;
        }
    }

    // Docker Compose 애플리케이션 배포 (도메인 연결 포함)
    async deployDockerComposeApplication(projectUuid, config) {
        try {
            // Docker Compose에 Traefik 라벨 추가
            let dockerComposeContent = config.dockerComposeContent || `version: '3.8'
services:
  web:
    image: nginx:alpine
    ports:
      - "80"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${config.name}.rule=Host(\`${config.fqdn}\`)"
      - "traefik.http.services.${config.name}.loadbalancer.server.port=80"
      - "coolify.managed=true"
    restart: unless-stopped`;

            const dockerComposeBase64 = Buffer.from(dockerComposeContent).toString('base64');
            
            const appData = {
                project_uuid: projectUuid,
                server_uuid: CONFIG.SERVER_UUID,
                environment_name: 'production',
                docker_compose_raw: dockerComposeBase64,
                name: config.name,
                description: `Docker Compose app: ${config.name}`,
                instant_deploy: true
            };

            log('info', `Deploying Docker Compose app with domain: ${config.fqdn}`);

            const response = await axios.post(`${this.baseURL}/applications/dockercompose`, appData, {
                headers: this.headers,
                timeout: 60000
            });

            // 도메인 설정
            if (response.data.uuid && config.fqdn) {
                await this.setApplicationDomain(response.data.uuid, config.fqdn);
            }

            log('info', `Application deployed: ${config.name}`);
            return { success: true, application: response.data };
        } catch (error) {
            log('error', `Failed to deploy application: ${config.name}`, error.response?.data);
            throw error;
        }
    }

    // 애플리케이션 도메인 설정
    async setApplicationDomain(applicationUuid, fqdn) {
        try {
            const domainData = {
                fqdn: fqdn,
                settings: {
                    is_force_https_enabled: true,
                    is_www_redirect_enabled: false
                }
            };

            log('info', `Setting domain for application: ${fqdn}`);

            const response = await axios.patch(`${this.baseURL}/applications/${applicationUuid}`, domainData, {
                headers: this.headers,
                timeout: 30000
            });

            log('info', `Domain set: ${fqdn}`);
            return { success: true };
        } catch (error) {
            log('warn', `Failed to set domain: ${fqdn}`, error.response?.data);
            return { success: false, error: error.message };
        }
    }

    // 데이터베이스 생성 (즉시 시작 포함)
    async createDatabase(projectUuid, dbConfig) {
        try {
            const baseData = {
                project_uuid: projectUuid,
                server_uuid: CONFIG.SERVER_UUID,
                environment_name: 'production',
                name: dbConfig.name,
                description: `Database: ${dbConfig.name}`,
                instant_deploy: true,
                is_public: false,
                start_after_creation: true
            };

            let dbData = { ...baseData };
            let endpoint = '';
            let credentials = {};
            
            switch (dbConfig.type) {
                case 'postgresql':
                    endpoint = '/databases/postgresql';
                    const pgPassword = this.generatePassword();
                    dbData.postgres_password = pgPassword;
                    dbData.postgres_user = 'dbuser';
                    dbData.postgres_db = dbConfig.name;
                    dbData.postgres_host_auth_method = 'md5';
                    credentials = {
                        type: 'postgresql',
                        host: `${dbConfig.name}`,
                        port: 5432,
                        user: 'dbuser',
                        password: pgPassword,
                        database: dbConfig.name
                    };
                    break;
                    
                case 'redis':
                    endpoint = '/databases/redis';
                    const redisPassword = this.generatePassword();
                    dbData.redis_password = redisPassword;
                    dbData.redis_conf = '';
                    credentials = {
                        type: 'redis',
                        host: `${dbConfig.name}`,
                        port: 6379,
                        password: redisPassword
                    };
                    break;
                    
                case 'mysql':
                    endpoint = '/databases/mysql';
                    const mysqlPassword = this.generatePassword();
                    const mysqlRootPassword = this.generatePassword();
                    dbData.mysql_root_password = mysqlRootPassword;
                    dbData.mysql_user = 'dbuser';
                    dbData.mysql_password = mysqlPassword;
                    dbData.mysql_database = dbConfig.name;
                    credentials = {
                        type: 'mysql',
                        host: `${dbConfig.name}`,
                        port: 3306,
                        user: 'dbuser',
                        password: mysqlPassword,
                        database: dbConfig.name,
                        rootPassword: mysqlRootPassword
                    };
                    break;
                    
                case 'mongodb':
                    endpoint = '/databases/mongodb';
                    const mongoPassword = this.generatePassword();
                    dbData.mongo_initdb_root_username = 'admin';
                    dbData.mongo_initdb_root_password = mongoPassword;
                    dbData.mongo_initdb_database = dbConfig.name;
                    credentials = {
                        type: 'mongodb',
                        host: `${dbConfig.name}`,
                        port: 27017,
                        user: 'admin',
                        password: mongoPassword,
                        database: dbConfig.name
                    };
                    break;
                    
                default:
                    throw new Error(`Unsupported database type: ${dbConfig.type}`);
            }

            log('info', `Creating ${dbConfig.type} database: ${dbConfig.name}`);

            const response = await axios.post(`${this.baseURL}${endpoint}`, dbData, {
                headers: this.headers,
                timeout: 60000
            });

            // 데이터베이스 시작
            if (response.data.uuid) {
                setTimeout(async () => {
                    await this.startDatabase(response.data.uuid);
                }, 2000);
            }

            log('info', `Database created: ${dbConfig.name}`);
            return { 
                success: true, 
                database: response.data,
                credentials: credentials
            };
        } catch (error) {
            log('error', `Failed to create database: ${dbConfig.name}`, error.response?.data);
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
            log('warn', `Failed to start database: ${databaseUuid}`, error.response?.data);
            return { success: false, error: error.message };
        }
    }

    // 환경 변수 설정
    async setEnvironmentVariables(applicationUuid, variables) {
        try {
            // 각 변수를 개별적으로 생성
            const results = [];
            
            for (const variable of variables) {
                try {
                    const envData = {
                        key: variable.key,
                        value: variable.value,
                        is_preview: false,
                        is_build_time: false
                    };

                    const response = await axios.post(
                        `${this.baseURL}/applications/${applicationUuid}/envs`, 
                        envData, 
                        {
                            headers: this.headers,
                            timeout: 30000
                        }
                    );
                    
                    results.push({ success: true, key: variable.key });
                    log('info', `Environment variable set: ${variable.key}`);
                } catch (error) {
                    log('warn', `Failed to set env var: ${variable.key}`, error.response?.data);
                    results.push({ success: false, key: variable.key, error: error.message });
                }
            }

            return { success: true, results };
        } catch (error) {
            log('error', `Failed to set environment variables`, error.response?.data);
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
            log('warn', `Failed to start application: ${applicationUuid}`, error.response?.data);
            return { success: false, error: error.message };
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

// 🚀 완전 통합 배포
app.post('/api/deploy/complete', async (req, res) => {
    const {
        projectName,
        domain,
        databases = [],
        environmentVariables = [],
        dockerComposeContent
    } = req.body;

    const deploymentId = uuidv4();
    const fullDomain = domain || `${projectName}.${CONFIG.BASE_DOMAIN}`;
    const deploymentLog = [];

    try {
        log('info', `Starting deployment: ${projectName}`);

        // 1. DNS 레코드 생성
        deploymentLog.push({ step: 'DNS', status: 'starting' });
        const dnsResult = await dnsManager.createRecord(CONFIG.BASE_DOMAIN, projectName, 'A', CONFIG.SERVER_IP);
        deploymentLog.push({ 
            step: 'DNS', 
            status: dnsResult.success ? 'completed' : 'failed',
            details: dnsResult.success ? `DNS: ${fullDomain}` : dnsResult.error
        });

        // 2. Coolify 프로젝트 생성
        deploymentLog.push({ step: 'Project', status: 'starting' });
        const projectResult = await coolifyManager.createProject(projectName);
        const projectUuid = projectResult.project.uuid;
        deploymentLog.push({ 
            step: 'Project', 
            status: 'completed',
            details: `Project UUID: ${projectUuid}`
        });

        // 3. 데이터베이스 생성 및 자격 증명 수집
        const deployedDatabases = [];
        const dbCredentials = [];
        
        for (const dbConfig of databases) {
            deploymentLog.push({ step: `Database-${dbConfig.name}`, status: 'starting' });
            
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

                // 데이터베이스 연결 환경변수 추가
                if (dbResult.credentials) {
                    const creds = dbResult.credentials;
                    const prefix = dbConfig.name.toUpperCase().replace(/-/g, '_');
                    
                    dbCredentials.push(
                        { key: `${prefix}_HOST`, value: `${projectName}-${dbConfig.name}` },
                        { key: `${prefix}_PORT`, value: String(creds.port) },
                        { key: `${prefix}_USER`, value: creds.user },
                        { key: `${prefix}_PASSWORD`, value: creds.password }
                    );
                    
                    if (creds.database) {
                        dbCredentials.push({ key: `${prefix}_DATABASE`, value: creds.database });
                    }
                    
                    // Connection URL 생성
                    if (creds.type === 'postgresql') {
                        dbCredentials.push({
                            key: `${prefix}_URL`,
                            value: `postgresql://${creds.user}:${creds.password}@${creds.host}:${creds.port}/${creds.database}`
                        });
                    } else if (creds.type === 'mysql') {
                        dbCredentials.push({
                            key: `${prefix}_URL`,
                            value: `mysql://${creds.user}:${creds.password}@${creds.host}:${creds.port}/${creds.database}`
                        });
                    } else if (creds.type === 'redis') {
                        dbCredentials.push({
                            key: `${prefix}_URL`,
                            value: `redis://:${creds.password}@${creds.host}:${creds.port}`
                        });
                    } else if (creds.type === 'mongodb') {
                        dbCredentials.push({
                            key: `${prefix}_URL`,
                            value: `mongodb://${creds.user}:${creds.password}@${creds.host}:${creds.port}/${creds.database}`
                        });
                    }
                }

                deploymentLog.push({ 
                    step: `Database-${dbConfig.name}`, 
                    status: 'completed',
                    details: `${dbConfig.type} database created`
                });
            } catch (dbError) {
                deploymentLog.push({ 
                    step: `Database-${dbConfig.name}`, 
                    status: 'failed',
                    error: dbError.message
                });
            }
        }

        // 4. 애플리케이션 배포 (도메인 연결 포함)
        deploymentLog.push({ step: 'Application', status: 'starting' });
        
        const applicationResult = await coolifyManager.deployDockerComposeApplication(projectUuid, {
            name: projectName,
            dockerComposeContent: dockerComposeContent,
            fqdn: fullDomain
        });

        deploymentLog.push({ 
            step: 'Application', 
            status: 'completed',
            details: `App UUID: ${applicationResult.application.uuid}`
        });

        // 5. 환경 변수 설정 (사용자 변수 + DB 연결 정보)
        if (applicationResult.application.uuid) {
            const allEnvVars = [...environmentVariables, ...dbCredentials];
            
            if (allEnvVars.length > 0) {
                deploymentLog.push({ step: 'Environment Variables', status: 'starting' });
                
                const envResult = await coolifyManager.setEnvironmentVariables(
                    applicationResult.application.uuid,
                    allEnvVars
                );
                
                deploymentLog.push({ 
                    step: 'Environment Variables', 
                    status: 'completed',
                    details: `${allEnvVars.length} variables set`
                });
            }

            // 6. 애플리케이션 시작
            deploymentLog.push({ step: 'Start Application', status: 'starting' });
            const startResult = await coolifyManager.startApplication(applicationResult.application.uuid);
            deploymentLog.push({ 
                step: 'Start Application', 
                status: startResult.success ? 'completed' : 'failed'
            });
        }

        // 7. 응답
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
            deployedAt: new Date().toISOString()
        };

        log('info', `Deployment completed: ${projectName}`);
        res.json(response);

    } catch (error) {
        log('error', `Deployment failed: ${projectName}`, error.message);
        
        res.status(500).json({
            error: 'Deployment failed',
            deploymentId,
            details: error.message,
            deploymentLog
        });
    }
});

// 서버 시작
app.listen(port, () => {
    log('info', `🚀 Fixed Deployment Server running on http://localhost:${port}`);
    log('info', `📋 Endpoints:`);
    log('info', `   GET  /api/health`);
    log('info', `   POST /api/deploy/complete`);
});