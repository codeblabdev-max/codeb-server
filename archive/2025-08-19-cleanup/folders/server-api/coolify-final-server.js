#!/usr/bin/env node

/**
 * 🚀 Coolify + PowerDNS 완벽 통합 배포 서버 (최종 수정)
 * 웹 검색을 통해 확인한 정확한 API 엔드포인트 사용
 */

const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const app = express();
const port = 3007;

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

// PowerDNS 관리자 (수정됨)
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
            // PowerDNS는 zone 이름에 trailing dot이 필요
            const zoneName = zone.endsWith('.') ? zone : `${zone}.`;
            const recordName = `${name}.${zone}.`; // 레코드 이름도 trailing dot 필요
            
            const recordData = {
                rrsets: [{
                    name: recordName,
                    type: type,
                    changetype: 'REPLACE',
                    records: [{
                        content: `"${content}"`, // A 레코드는 따옴표 없이
                        disabled: false
                    }],
                    ttl: ttl
                }]
            };

            // A 레코드는 따옴표 없이
            if (type === 'A') {
                recordData.rrsets[0].records[0].content = content;
            }

            log('info', `Creating DNS record: ${recordName} -> ${content}`);

            const response = await axios.patch(`${this.baseURL}/zones/${zoneName}`, recordData, {
                headers: this.headers,
                timeout: 10000
            });

            log('info', `DNS record created: ${name}.${zone} -> ${content}`);
            return { success: true, record: recordData.rrsets[0] };
        } catch (error) {
            log('error', `Failed to create DNS record: ${name}.${zone}`, {
                status: error.response?.status,
                error: error.response?.data || error.message
            });
            return { success: false, error: error.message };
        }
    }
}

// Coolify API 관리자 (수정됨)
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
            
            // 프로젝트의 기본 environment UUID 가져오기
            let environmentUuid = null;
            if (response.data.uuid) {
                const projectDetails = await this.getProjectDetails(response.data.uuid);
                if (projectDetails && projectDetails.environments && projectDetails.environments.length > 0) {
                    environmentUuid = projectDetails.environments[0].uuid;
                    log('info', `Environment UUID: ${environmentUuid}`);
                }
            }
            
            return { 
                success: true, 
                project: response.data,
                environmentUuid: environmentUuid
            };
        } catch (error) {
            log('error', `Failed to create project: ${name}`, error.response?.data);
            throw error;
        }
    }
    
    // 프로젝트 상세 정보 가져오기
    async getProjectDetails(projectUuid) {
        try {
            const response = await axios.get(`${this.baseURL}/projects/${projectUuid}`, {
                headers: this.headers,
                timeout: 30000
            });
            return response.data;
        } catch (error) {
            log('warn', `Failed to get project details: ${projectUuid}`, error.response?.data);
            return null;
        }
    }

    // Docker Compose 애플리케이션 배포
    async deployDockerComposeApplication(projectUuid, config) {
        try {
            // Docker Compose 콘텐츠에 도메인 설정 추가
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
                description: `App: ${config.name}`,
                instant_deploy: true
            };

            log('info', `Deploying Docker Compose app: ${config.name}`);

            const response = await axios.post(`${this.baseURL}/applications/dockercompose`, appData, {
                headers: this.headers,
                timeout: 60000
            });

            log('info', `Application deployed: ${config.name}`, response.data);
            return { success: true, application: response.data };
        } catch (error) {
            log('error', `Failed to deploy application: ${config.name}`, error.response?.data);
            throw error;
        }
    }

    // 데이터베이스 생성 (수정됨 - Redis 문제 해결)
    async createDatabase(projectUuid, dbConfig) {
        try {
            const baseData = {
                project_uuid: projectUuid,
                server_uuid: CONFIG.SERVER_UUID,
                environment_name: 'production',
                name: dbConfig.name,
                description: `Database: ${dbConfig.name}`,
                instant_deploy: true
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
                    dbData.postgres_db = dbConfig.name.replace(/-/g, '_'); // 하이픈을 언더스코어로
                    credentials = {
                        type: 'postgresql',
                        host: dbConfig.name,
                        port: 5432,
                        user: 'dbuser',
                        password: pgPassword,
                        database: dbData.postgres_db
                    };
                    break;
                    
                case 'redis':
                    endpoint = '/databases/redis';
                    // Redis는 password 필드를 제외하고 생성 (버그 회피)
                    // dbData.redis_password는 제거
                    credentials = {
                        type: 'redis',
                        host: dbConfig.name,
                        port: 6379,
                        password: '' // 패스워드 없이
                    };
                    break;
                    
                case 'mysql':
                    endpoint = '/databases/mysql';
                    const mysqlPassword = this.generatePassword();
                    const mysqlRootPassword = this.generatePassword();
                    dbData.mysql_root_password = mysqlRootPassword;
                    dbData.mysql_user = 'dbuser';
                    dbData.mysql_password = mysqlPassword;
                    dbData.mysql_database = dbConfig.name.replace(/-/g, '_');
                    credentials = {
                        type: 'mysql',
                        host: dbConfig.name,
                        port: 3306,
                        user: 'dbuser',
                        password: mysqlPassword,
                        database: dbData.mysql_database,
                        rootPassword: mysqlRootPassword
                    };
                    break;
                    
                case 'mongodb':
                    endpoint = '/databases/mongodb';
                    const mongoPassword = this.generatePassword();
                    dbData.mongo_initdb_root_username = 'admin';
                    dbData.mongo_initdb_root_password = mongoPassword;
                    dbData.mongo_initdb_database = dbConfig.name.replace(/-/g, '_');
                    credentials = {
                        type: 'mongodb',
                        host: dbConfig.name,
                        port: 27017,
                        user: 'admin',
                        password: mongoPassword,
                        database: dbData.mongo_initdb_database
                    };
                    break;
                    
                default:
                    throw new Error(`Unsupported database type: ${dbConfig.type}`);
            }

            log('info', `Creating ${dbConfig.type} database: ${dbConfig.name}`, dbData);

            const response = await axios.post(`${this.baseURL}${endpoint}`, dbData, {
                headers: this.headers,
                timeout: 60000
            });

            // 데이터베이스 시작 (UUID 있을 때만)
            if (response.data.uuid) {
                setTimeout(async () => {
                    await this.startDatabase(response.data.uuid);
                }, 3000);
            }

            log('info', `Database created: ${dbConfig.name}`, response.data);
            return { 
                success: true, 
                database: response.data,
                credentials: credentials
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

            // 정확한 엔드포인트: /databases/{uuid}/start
            const response = await axios.post(`${this.baseURL}/databases/${databaseUuid}/start`, {}, {
                headers: this.headers,
                timeout: 60000
            });

            log('info', `Database started: ${databaseUuid}`);
            return { success: true };
        } catch (error) {
            log('warn', `Failed to start database: ${databaseUuid}`, {
                status: error.response?.status,
                data: error.response?.data
            });
            return { success: false, error: error.message };
        }
    }

    // 환경 변수 설정 (수정됨)
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

                    // 정확한 엔드포인트: /applications/{uuid}/envs
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

    // 애플리케이션 시작 (수정됨)
    async startApplication(applicationUuid) {
        try {
            log('info', `Starting application: ${applicationUuid}`);

            // 정확한 엔드포인트: /applications/{uuid}/start (GET 또는 POST)
            const response = await axios.get(`${this.baseURL}/applications/${applicationUuid}/start`, {
                headers: this.headers,
                timeout: 60000
            });

            log('info', `Application started: ${applicationUuid}`);
            return { success: true };
        } catch (error) {
            // POST로도 시도
            try {
                const response = await axios.post(`${this.baseURL}/applications/${applicationUuid}/start`, {}, {
                    headers: this.headers,
                    timeout: 60000
                });
                log('info', `Application started (POST): ${applicationUuid}`);
                return { success: true };
            } catch (postError) {
                log('warn', `Failed to start application: ${applicationUuid}`, {
                    getError: error.response?.status,
                    postError: postError.response?.status
                });
                return { success: false, error: error.message };
            }
        }
    }

    // Git 저장소 기반 애플리케이션 배포
    async deployGitApplication(projectUuid, environmentUuid, config) {
        try {
            // 도메인 값 계산 (별도 설정용)
            const fqdnValue = `${config.name}.${CONFIG.BASE_DOMAIN}`;

            // 애플리케이션 생성 데이터 - OpenAPI 스키마에 맞게 수정
            const appData = {
                project_uuid: projectUuid,
                server_uuid: CONFIG.SERVER_UUID,
                environment_uuid: environmentUuid, // environment_uuid 사용 (이미 전달받음)
                git_repository: config.gitRepository,
                git_branch: config.gitBranch || 'main',
                build_pack: config.buildPack || 'nixpacks',
                name: config.name,
                ports_exposes: config.port || '3000'
            };

            log('info', `Deploying Git application: ${config.name}`, appData);

            const response = await axios.post(`${this.baseURL}/applications/public`, appData, {
                headers: this.headers,
                timeout: 60000
            });

            log('info', `Git application created: ${config.name}`, response.data);
            
            const applicationUuid = response.data.uuid;
            
            // 도메인 설정 (애플리케이션 생성 후 별도 설정)
            if (fqdnValue) {
                try {
                    log('info', `Setting domain for application: ${applicationUuid} -> ${fqdnValue}`);
                    
                    // 애플리케이션에 도메인 설정
                    await axios.post(`${this.baseURL}/applications/${applicationUuid}/domains`, {
                        domain: fqdnValue
                    }, {
                        headers: this.headers,
                        timeout: 30000
                    });
                    
                    // DNS 레코드 생성 (one-q.xyz 도메인인 경우)
                    if (fqdnValue.includes(CONFIG.BASE_DOMAIN)) {
                        const subdomain = fqdnValue.split('.')[0];
                        await this.createDNSRecord(subdomain);
                    }
                    
                    log('info', `Domain set successfully: ${fqdnValue}`);
                } catch (domainError) {
                    log('warn', `Failed to set domain: ${fqdnValue}`, domainError.response?.data);
                    // 도메인 설정 실패해도 애플리케이션은 생성되었으므로 계속 진행
                }
            }
            
            return { success: true, application: response.data, domain: fqdnValue };
        } catch (error) {
            log('error', `Failed to deploy Git application: ${config.name}`, error.response?.data);
            throw error;
        }
    }
    
    // DNS 레코드 생성
    async createDNSRecord(subdomain) {
        try {
            const recordData = {
                rrsets: [{
                    name: `${subdomain}.${CONFIG.BASE_DOMAIN}.`,
                    type: 'A',
                    changetype: 'REPLACE',
                    records: [{
                        content: CONFIG.SERVER_IP,
                        disabled: false
                    }],
                    ttl: 300
                }]
            };

            const response = await axios.patch(
                `${CONFIG.POWERDNS_URL}/api/v1/servers/localhost/zones/${CONFIG.BASE_DOMAIN}.`,
                recordData,
                {
                    headers: {
                        'X-API-Key': CONFIG.API_KEYS.PDNS,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );

            log('info', `DNS record created: ${subdomain}.${CONFIG.BASE_DOMAIN}`);
            return { success: true };
        } catch (error) {
            log('warn', `Failed to create DNS record: ${subdomain}`, error.response?.data);
            return { success: false, error: error.message };
        }
    }

    // 도메인 자동 생성 (Generate Domain 기능)
    async generateDomain(applicationUuid) {
        try {
            log('info', `Generating domain for application: ${applicationUuid}`);

            // Coolify의 Generate Domain 엔드포인트 호출
            const response = await axios.post(`${this.baseURL}/applications/${applicationUuid}/generate-domain`, {}, {
                headers: this.headers,
                timeout: 30000
            });

            log('info', `Domain generated:`, response.data);
            return { success: true, domain: response.data };
        } catch (error) {
            log('warn', `Failed to generate domain: ${applicationUuid}`, error.response?.data);
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

    // 프로젝트 리스트 조회
    async listProjects() {
        try {
            const response = await axios.get(`${this.baseURL}/projects`, {
                headers: this.headers,
                timeout: 30000
            });
            return { success: true, projects: response.data };
        } catch (error) {
            log('error', 'Failed to list projects', error.response?.data);
            return { success: false, error: error.message };
        }
    }

    // 프로젝트 내 리소스 조회
    async getProjectResources(projectUuid) {
        try {
            const response = await axios.get(`${this.baseURL}/projects/${projectUuid}/resources`, {
                headers: this.headers,
                timeout: 30000
            });
            return { success: true, resources: response.data };
        } catch (error) {
            log('error', `Failed to get project resources: ${projectUuid}`, error.response?.data);
            return { success: false, error: error.message };
        }
    }

    // 애플리케이션 삭제
    async deleteApplication(applicationUuid) {
        try {
            const response = await axios.delete(`${this.baseURL}/applications/${applicationUuid}`, {
                headers: this.headers,
                timeout: 30000
            });
            log('info', `Application deleted: ${applicationUuid}`);
            return { success: true };
        } catch (error) {
            log('error', `Failed to delete application: ${applicationUuid}`, error.response?.data);
            return { success: false, error: error.message };
        }
    }

    // 데이터베이스 삭제
    async deleteDatabase(databaseUuid) {
        try {
            const response = await axios.delete(`${this.baseURL}/databases/${databaseUuid}`, {
                headers: this.headers,
                timeout: 30000
            });
            log('info', `Database deleted: ${databaseUuid}`);
            return { success: true };
        } catch (error) {
            log('error', `Failed to delete database: ${databaseUuid}`, error.response?.data);
            return { success: false, error: error.message };
        }
    }

    // 애플리케이션 상태 확인
    async getApplicationStatus(applicationUuid) {
        try {
            const response = await axios.get(`${this.baseURL}/applications/${applicationUuid}`, {
                headers: this.headers,
                timeout: 30000
            });
            return { success: true, application: response.data };
        } catch (error) {
            log('warn', `Failed to get application status: ${applicationUuid}`, error.response?.data);
            return { success: false, error: error.message };
        }
    }

    // 배포 상태 모니터링 (실제 배포 완료까지 대기)
    async waitForDeploymentCompletion(applicationUuid, maxWaitMinutes = 10) {
        const maxWaitTime = maxWaitMinutes * 60 * 1000; // 분을 밀리초로 변환
        const checkInterval = 15000; // 15초마다 체크
        const startTime = Date.now();
        
        log('info', `Waiting for deployment completion: ${applicationUuid}`);
        
        while (Date.now() - startTime < maxWaitTime) {
            try {
                const statusResult = await this.getApplicationStatus(applicationUuid);
                
                if (statusResult.success && statusResult.application) {
                    const app = statusResult.application;
                    const status = app.status || 'unknown';
                    
                    log('info', `Application ${applicationUuid} status: ${status}`);
                    
                    // 성공 상태들
                    if (status === 'running' || status === 'healthy') {
                        log('info', `✅ Deployment completed successfully: ${applicationUuid}`);
                        return { 
                            success: true, 
                            status: status,
                            application: app,
                            deploymentTime: Math.round((Date.now() - startTime) / 1000)
                        };
                    }
                    
                    // 실패 상태들
                    if (status === 'exited' || status === 'failed' || status === 'error') {
                        log('warn', `❌ Deployment failed with status: ${status}`);
                        return { 
                            success: false, 
                            status: status,
                            error: `Application deployment failed with status: ${status}`,
                            application: app
                        };
                    }
                    
                    // 진행 중 상태들: building, starting, deploying 등
                    // 계속 대기
                }
                
                // 15초 대기 후 다시 체크
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                
            } catch (error) {
                log('warn', `Error checking deployment status: ${error.message}`);
                // 에러가 발생해도 계속 시도
                await new Promise(resolve => setTimeout(resolve, checkInterval));
            }
        }
        
        // 타임아웃
        log('error', `⏰ Deployment timeout after ${maxWaitMinutes} minutes: ${applicationUuid}`);
        return { 
            success: false, 
            error: `Deployment timeout after ${maxWaitMinutes} minutes`,
            timeout: true
        };
    }

    // 프로젝트 삭제 (리소스 포함) - 개선된 버전
    async deleteProject(projectUuid) {
        try {
            log('info', `Starting project deletion: ${projectUuid}`);
            
            // 1. 프로젝트의 모든 애플리케이션 찾아서 삭제
            try {
                const appsResponse = await axios.get(`${this.baseURL}/applications`, {
                    headers: this.headers,
                    timeout: 30000
                });
                
                if (appsResponse.data && Array.isArray(appsResponse.data)) {
                    // 이 프로젝트에 속한 애플리케이션들 필터링
                    const projectApps = appsResponse.data.filter(app => 
                        app.environment_id && app.environment_id.toString().includes(projectUuid.slice(-4))
                    );
                    
                    for (const app of projectApps) {
                        log('info', `Deleting application: ${app.uuid} (${app.name})`);
                        try {
                            await axios.delete(`${this.baseURL}/applications/${app.uuid}`, {
                                headers: this.headers,
                                timeout: 30000
                            });
                            await new Promise(resolve => setTimeout(resolve, 2000)); // 2초 대기
                        } catch (appError) {
                            log('warn', `Failed to delete app ${app.uuid}: ${appError.message}`);
                        }
                    }
                }
            } catch (appsError) {
                log('warn', `Failed to query applications: ${appsError.message}`);
            }

            // 2. 프로젝트의 모든 데이터베이스 찾아서 삭제
            try {
                const dbsResponse = await axios.get(`${this.baseURL}/databases`, {
                    headers: this.headers,
                    timeout: 30000
                });
                
                if (dbsResponse.data && Array.isArray(dbsResponse.data)) {
                    // 이 프로젝트에 속한 데이터베이스들 필터링 (이름으로)
                    const projectDbs = dbsResponse.data.filter(db => 
                        db.name && db.name.includes(projectUuid.slice(-8))
                    );
                    
                    for (const db of projectDbs) {
                        log('info', `Deleting database: ${db.uuid} (${db.name})`);
                        try {
                            await axios.delete(`${this.baseURL}/databases/${db.uuid}`, {
                                headers: this.headers,
                                timeout: 30000
                            });
                            await new Promise(resolve => setTimeout(resolve, 2000)); // 2초 대기
                        } catch (dbError) {
                            log('warn', `Failed to delete db ${db.uuid}: ${dbError.message}`);
                        }
                    }
                }
            } catch (dbsError) {
                log('warn', `Failed to query databases: ${dbsError.message}`);
            }

            // 3. 최종적으로 프로젝트 삭제 시도 (여러 번 시도)
            let deleteSuccess = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 3000)); // 3초 대기
                    
                    const response = await axios.delete(`${this.baseURL}/projects/${projectUuid}`, {
                        headers: this.headers,
                        timeout: 30000
                    });
                    
                    log('info', `Project deleted successfully: ${projectUuid}`);
                    deleteSuccess = true;
                    break;
                } catch (error) {
                    log('warn', `Delete attempt ${attempt} failed: ${error.response?.data?.message || error.message}`);
                    if (attempt === 3) {
                        throw error;
                    }
                }
            }

            return { success: deleteSuccess };
        } catch (error) {
            log('error', `Failed to delete project: ${projectUuid}`, error.response?.data);
            return { success: false, error: error.response?.data?.message || error.message };
        }
    }
}

// 매니저 인스턴스
const dnsManager = new PowerDNSManager();
const coolifyManager = new CoolifyAPIManager();

// API 라우트들

// 데이터베이스 생성 API
app.post('/api/databases/:type', async (req, res) => {
    const { type } = req.params;
    const { projectName, name, ...config } = req.body;
    
    try {
        // 프로젝트 찾기
        const projectResult = await coolifyManager.listProjects();
        const project = projectResult.projects?.find(p => p.name === projectName);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        // 데이터베이스 생성
        const dbResult = await coolifyManager.createDatabase(project.uuid, {
            name: `${projectName}-${name}`,
            type: type,
            ...config
        });
        
        res.json(dbResult);
    } catch (error) {
        res.status(500).json({ 
            error: 'Database creation failed', 
            details: error.message 
        });
    }
});

// 환경변수 설정 API
app.post('/api/applications/:uuid/env', async (req, res) => {
    const { uuid } = req.params;
    const { environmentVariables } = req.body;
    
    try {
        const result = await coolifyManager.setEnvironmentVariables(uuid, environmentVariables);
        res.json(result);
    } catch (error) {
        res.status(500).json({ 
            error: 'Environment variables setting failed', 
            details: error.message 
        });
    }
});

// 애플리케이션 배포 시작 API
app.post('/api/applications/:uuid/deploy', async (req, res) => {
    const { uuid } = req.params;
    
    try {
        const result = await coolifyManager.startApplication(uuid);
        res.json(result);
    } catch (error) {
        res.status(500).json({ 
            error: 'Deployment start failed', 
            details: error.message 
        });
    }
});

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
            },
            version: 'final-1.0'
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
    const results = {
        dns: false,
        project: false,
        databases: [],
        application: false,
        envVars: false,
        start: false
    };

    try {
        log('info', `🚀 Starting deployment: ${projectName}`);

        // 1. DNS 레코드 생성 (옵션)
        if (req.body.generateDomain !== false) {
            deploymentLog.push({ step: 'DNS', status: 'starting' });
            const dnsResult = await dnsManager.createRecord(CONFIG.BASE_DOMAIN, projectName, 'A', CONFIG.SERVER_IP);
            results.dns = dnsResult.success;
            deploymentLog.push({ 
                step: 'DNS', 
                status: dnsResult.success ? 'completed' : 'warning',
                details: dnsResult.success ? `DNS: ${fullDomain}` : `DNS creation failed but continuing: ${dnsResult.error}`
            });
        }

        // 2. Coolify 프로젝트 생성
        deploymentLog.push({ step: 'Project', status: 'starting' });
        const projectResult = await coolifyManager.createProject(projectName);
        const projectUuid = projectResult.project.uuid;
        const environmentUuid = projectResult.environmentUuid;
        
        if (!environmentUuid) {
            throw new Error('Environment UUID not found in project. Cannot create Application.');
        }
        
        results.project = true;
        deploymentLog.push({ 
            step: 'Project', 
            status: 'completed',
            details: `Project UUID: ${projectUuid}, Environment UUID: ${environmentUuid}`
        });

        // 3. 데이터베이스 생성
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
                            value: creds.password ? `redis://:${creds.password}@${creds.host}:${creds.port}` : `redis://${creds.host}:${creds.port}`
                        });
                    } else if (creds.type === 'mongodb') {
                        dbCredentials.push({
                            key: `${prefix}_URL`,
                            value: `mongodb://${creds.user}:${creds.password}@${creds.host}:${creds.port}/${creds.database}`
                        });
                    }
                }

                results.databases.push({ name: dbConfig.name, success: true });
                deploymentLog.push({ 
                    step: `Database-${dbConfig.name}`, 
                    status: 'completed',
                    details: `${dbConfig.type} database created`
                });
            } catch (dbError) {
                results.databases.push({ name: dbConfig.name, success: false });
                deploymentLog.push({ 
                    step: `Database-${dbConfig.name}`, 
                    status: 'failed',
                    error: dbError.message
                });
            }
        }

        // 4. 애플리케이션 배포 (항상 Git 저장소 사용 - 없으면 기본 템플릿)
        deploymentLog.push({ step: 'Application Creation', status: 'starting' });
        
        let applicationResult;
        // 항상 Git 애플리케이션으로 생성 (Docker Compose 대신)
        const gitRepo = req.body.gitRepository || 'https://github.com/coollabsio/coolify-examples';
        
        applicationResult = await coolifyManager.deployGitApplication(projectUuid, environmentUuid, {
            name: projectName,
            gitRepository: gitRepo,
            gitBranch: req.body.gitBranch || 'main',
            buildPack: req.body.buildPack || 'nixpacks',
            port: req.body.port || '3000',
            generateDomain: false, // 도메인은 별도 설정
            fqdn: null // 애플리케이션 생성 시에는 도메인 설정하지 않음
        });

        deploymentLog.push({ 
            step: 'Application Creation', 
            status: 'completed',
            details: `App UUID: ${applicationResult.application.uuid}`
        });

        // 5. 환경 변수 설정
        if (applicationResult.application.uuid) {
            const allEnvVars = [...(Array.isArray(environmentVariables) ? environmentVariables : []), ...dbCredentials];
            
            if (allEnvVars.length > 0) {
                deploymentLog.push({ step: 'Environment Variables', status: 'starting' });
                
                const envResult = await coolifyManager.setEnvironmentVariables(
                    applicationResult.application.uuid,
                    allEnvVars
                );
                
                results.envVars = envResult.success;
                deploymentLog.push({ 
                    step: 'Environment Variables', 
                    status: envResult.success ? 'completed' : 'partial',
                    details: `${allEnvVars.length} variables processed`
                });
            }

            // 6. 애플리케이션 시작
            deploymentLog.push({ step: 'Start Application', status: 'starting' });
            const startResult = await coolifyManager.startApplication(applicationResult.application.uuid);
            deploymentLog.push({ 
                step: 'Start Application', 
                status: startResult.success ? 'completed' : 'failed',
                details: startResult.success ? 'Application deployment initiated' : startResult.error
            });

            // 7. 실제 배포 완료 대기 (새로 추가)
            deploymentLog.push({ step: 'Deployment Monitoring', status: 'starting' });
            log('info', `⏳ Waiting for actual deployment completion...`);
            
            const deploymentResult = await coolifyManager.waitForDeploymentCompletion(
                applicationResult.application.uuid, 
                8 // 8분 타임아웃
            );
            
            if (deploymentResult.success) {
                results.application = true;
                results.start = true;
                deploymentLog.push({ 
                    step: 'Deployment Monitoring', 
                    status: 'completed',
                    details: `Application deployed successfully in ${deploymentResult.deploymentTime}s (Status: ${deploymentResult.status})`
                });
                log('info', `🎉 Real deployment completed for ${projectName} in ${deploymentResult.deploymentTime}s`);
            } else {
                results.application = false;
                results.start = false;
                deploymentLog.push({ 
                    step: 'Deployment Monitoring', 
                    status: 'failed',
                    details: deploymentResult.error || 'Deployment monitoring failed'
                });
                
                if (!deploymentResult.timeout) {
                    // 배포 실패 시 즉시 에러 반환
                    throw new Error(`Deployment failed: ${deploymentResult.error}`);
                } else {
                    log('warn', `⚠️ Deployment timeout for ${projectName}, but application may still be building...`);
                }
            }
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
            results,
            deployedAt: new Date().toISOString(),
            instructions: {
                access: `Your application will be available at https://${fullDomain} in 1-2 minutes`,
                dashboard: `View in Coolify: ${CONFIG.COOLIFY_URL}/project/${projectUuid}`,
                dns: `DNS propagation may take up to 5 minutes`
            }
        };

        log('info', `✅ Deployment completed: ${projectName}`);
        res.json(response);

    } catch (error) {
        log('error', `❌ Deployment failed: ${projectName}`, error.message);
        
        res.status(500).json({
            error: 'Deployment failed',
            deploymentId,
            details: error.message,
            deploymentLog,
            results
        });
    }
});

// 프로젝트 리스트 조회
app.get('/api/projects', async (req, res) => {
    try {
        const result = await coolifyManager.listProjects();
        if (result.success) {
            // CLI가 기대하는 형식으로 변환
            const projects = result.projects.map(project => ({
                name: project.name,
                uuid: project.uuid,
                fqdn: `https://${project.name}.one-q.xyz`,
                status: 'deployed', // 기본 상태
                created_at: new Date().toISOString() // 생성일
            }));
            res.json({ projects });
        } else {
            res.status(500).json({ error: result.error });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 프로젝트 삭제
app.delete('/api/projects/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        log('info', `Deleting project: ${uuid}`);
        
        const result = await coolifyManager.deleteProject(uuid);
        if (result.success) {
            res.json({ message: `Project ${uuid} deleted successfully` });
        } else {
            res.status(500).json({ error: result.error });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 서버 시작
app.listen(port, () => {
    log('info', `🚀 Final Deployment Server running on http://localhost:${port}`);
    log('info', `📋 Endpoints:`);
    log('info', `   GET  /api/health`);
    log('info', `   POST /api/deploy/complete`);
    log('info', `   GET  /api/projects`);
    log('info', `   DELETE /api/projects/:uuid`);
    log('info', `🔧 Configuration:`);
    log('info', `   Version: final-1.0`);
    log('info', `   Coolify: ${CONFIG.COOLIFY_URL}`);
    log('info', `   PowerDNS: ${CONFIG.POWERDNS_URL}`);
});