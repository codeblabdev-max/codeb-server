#!/usr/bin/env node

/**
 * CodeB API Server v3.5
 * 프로젝트별 독립 Podman 컨테이너 관리 시스템
 * - PostgreSQL + Redis + App 컨테이너 per project
 * - Storage Volume 관리
 * - 로컬 개발을 위한 원격 DB/Redis 제공
 */

const express = require('express');
const fileUpload = require('express-fileupload');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');

// Podman 전체 경로 설정 (PATH 문제 해결)
const PODMAN_PATH = '/usr/bin/podman';
const originalExecAsync = promisify(exec);
const execAsync = (cmd) => {
    // podman 명령어를 전체 경로로 변경 (중복 방지)
    let modifiedCmd = cmd;
    if (!modifiedCmd.includes(PODMAN_PATH)) {
        modifiedCmd = cmd.replace(/\bpodman\b/g, PODMAN_PATH);
    }
    return originalExecAsync(modifiedCmd);
};

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    useTempFiles: true,
    tempFileDir: '/tmp/'
}));

// 설정
const CONFIG = {
    VERSION: '3.5.0',
    SERVER_IP: process.env.SERVER_IP || '141.164.60.51',
    BASE_DOMAIN: process.env.BASE_DOMAIN || 'one-q.xyz',
    PROJECT_BASE: process.env.PROJECT_BASE || '/mnt/blockstorage/projects',
    STORAGE_BASE: process.env.STORAGE_BASE || '/mnt/blockstorage',
    PORT_RANGE_START: parseInt(process.env.PORT_RANGE_START) || 4000,
    PORT_RANGE_END: parseInt(process.env.PORT_RANGE_END) || 4999,
    API_PORT: parseInt(process.env.API_PORT) || 3008,
    // v3.5 새 설정
    NETWORK: 'host',
    DB_PORT_START: 5432,
    REDIS_PORT_START: 6379,
    APP_PORT_START: 3000,
    MAX_PROJECTS: 100
};

// 데이터베이스 (간단한 JSON 파일)
const DB_FILE = process.env.DB_FILE || path.join(CONFIG.STORAGE_BASE, 'projects-v35.json');

// 로깅 함수
const log = (level, message, data = null) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${level}: ${message}${data ? ` ${JSON.stringify(data)}` : ''}`;
    
    console.log(logMessage);
    
    // 파일 로깅 (옵션)
    if (process.env.ENABLE_FILE_LOGGING === 'true') {
        const logDir = process.env.LOG_DIR || path.join(CONFIG.STORAGE_BASE, 'logs');
        const logFile = path.join(logDir, 'api-server.log');
        
        try {
            if (!require('fs').existsSync(logDir)) {
                require('fs').mkdirSync(logDir, { recursive: true });
            }
            require('fs').appendFileSync(logFile, logMessage + '\n');
        } catch (err) {
            // 파일 로깅 실패 시 무시
        }
    }
};

// 데이터베이스 로드/저장
async function loadDB() {
    try {
        const data = await fs.readFile(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { 
            projects: [], 
            portAllocations: {},
            dbPorts: {},
            redisPorts: {},
            appPorts: {}
        };
    }
}

async function saveDB(data) {
    await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

// 포트 할당 함수
async function allocatePort(type, projectName) {
    const db = await loadDB();
    
    let portMap, startPort;
    switch(type) {
        case 'db':
            portMap = db.dbPorts || {};
            startPort = CONFIG.DB_PORT_START;
            break;
        case 'redis':
            portMap = db.redisPorts || {};
            startPort = CONFIG.REDIS_PORT_START;
            break;
        case 'app':
            portMap = db.appPorts || {};
            startPort = CONFIG.APP_PORT_START;
            break;
        default:
            portMap = db.portAllocations || {};
            startPort = CONFIG.PORT_RANGE_START;
    }
    
    // 이미 할당된 포트가 있으면 반환
    if (portMap[projectName]) {
        return portMap[projectName];
    }
    
    // 새 포트 할당
    const usedPorts = Object.values(portMap);
    for (let port = startPort; port < startPort + CONFIG.MAX_PROJECTS; port++) {
        if (!usedPorts.includes(port)) {
            portMap[projectName] = port;
            
            // DB 업데이트
            if (type === 'db') db.dbPorts = portMap;
            else if (type === 'redis') db.redisPorts = portMap;
            else if (type === 'app') db.appPorts = portMap;
            else db.portAllocations = portMap;
            
            await saveDB(db);
            return port;
        }
    }
    
    throw new Error(`No available ${type} ports`);
}

// 랜덤 패스워드 생성
function generatePassword() {
    return crypto.randomBytes(16).toString('hex');
}

// Podman 네트워크 초기화
async function initNetwork() {
    try {
        await execAsync(`${PODMAN_PATH} network create ${CONFIG.NETWORK} 2>/dev/null || true`);
        log('INFO', 'Network initialized');
    } catch (error) {
        log('ERROR', 'Network init failed', error.message);
    }
}

// =============================================================================
// v3.5 Platform API Endpoints
// =============================================================================

/**
 * POST /api/platform/projects
 * 프로젝트별 독립 컨테이너 생성 (PostgreSQL + Redis)
 */
app.post('/api/platform/projects', async (req, res) => {
    const { name, template = 'nextjs' } = req.body;
    
    if (!name || !name.match(/^[a-z0-9-]+$/)) {
        return res.status(400).json({ error: 'Invalid project name' });
    }
    
    try {
        // 포트 할당
        const dbPort = await allocatePort('db', name);
        const redisPort = await allocatePort('redis', name);
        const appPort = await allocatePort('app', name);
        
        // 자격 증명 생성
        const dbPassword = generatePassword();
        const dbUser = `user_${name}`;
        const dbName = `db_${name}`;
        const redisPassword = generatePassword();
        
        // 프로젝트 디렉토리 생성
        const projectDir = path.join(CONFIG.PROJECT_BASE, name);
        const storageDir = path.join(CONFIG.STORAGE_BASE, 'storage', name);
        await fs.mkdir(projectDir, { recursive: true });
        await fs.mkdir(storageDir, { recursive: true });
        
        // PostgreSQL 컨테이너 생성
        const dbContainer = `codeb-db-${name}`;
        log('INFO', `Creating PostgreSQL container: ${dbContainer}`);
        
        await execAsync(`
            ${PODMAN_PATH} run -d \
                --name ${dbContainer} \
                --network ${CONFIG.NETWORK} \
                -p ${dbPort}:5432 \
                -e POSTGRES_USER=${dbUser} \
                -e POSTGRES_PASSWORD=${dbPassword} \
                -e POSTGRES_DB=${dbName} \
                -v ${projectDir}/pgdata:/var/lib/postgresql/data \
                --restart unless-stopped \
                postgres:15-alpine
        `);
        
        // Redis 컨테이너 생성
        const redisContainer = `codeb-redis-${name}`;
        log('INFO', `Creating Redis container: ${redisContainer}`);
        
        await execAsync(`
            ${PODMAN_PATH} run -d \
                --name ${redisContainer} \
                --network ${CONFIG.NETWORK} \
                -p ${redisPort}:6379 \
                -e REDIS_PASSWORD=${redisPassword} \
                -v ${projectDir}/redis:/data \
                --restart unless-stopped \
                redis:7-alpine redis-server --requirepass ${redisPassword}
        `);
        
        // 스토리지 볼륨 생성
        const storageVolume = `codeb-storage-${name}`;
        await execAsync(`${PODMAN_PATH} volume create ${storageVolume}`);
        
        // 환경 변수 구성 (로컬 개발용)
        const localEnv = {
            DATABASE_URL: `postgresql://${dbUser}:${dbPassword}@${CONFIG.SERVER_IP}:${dbPort}/${dbName}`,
            REDIS_URL: `redis://:${redisPassword}@${CONFIG.SERVER_IP}:${redisPort}`,
            STORAGE_PATH: storageDir,
            NEXT_PUBLIC_API_URL: `http://${CONFIG.SERVER_IP}:${appPort}/api`,
            NODE_ENV: 'development'
        };
        
        // 프로덕션 환경 변수
        const prodEnv = {
            DATABASE_URL: `postgresql://${dbUser}:${dbPassword}@${dbContainer}:5432/${dbName}`,
            REDIS_URL: `redis://:${redisPassword}@${redisContainer}:6379`,
            STORAGE_PATH: '/storage',
            NODE_ENV: 'production',
            PORT: appPort
        };
        
        // 프로젝트 정보 저장
        const projectInfo = {
            name,
            template,
            created: new Date().toISOString(),
            containers: {
                db: dbContainer,
                redis: redisContainer,
                app: `codeb-app-${name}`
            },
            ports: {
                db: dbPort,
                redis: redisPort,
                app: appPort
            },
            credentials: {
                database: {
                    host: CONFIG.SERVER_IP,
                    port: dbPort,
                    user: dbUser,
                    password: dbPassword,
                    database: dbName
                },
                redis: {
                    host: CONFIG.SERVER_IP,
                    port: redisPort,
                    password: redisPassword
                }
            },
            storage: {
                volume: storageVolume,
                path: storageDir
            },
            env: {
                local: localEnv,
                production: prodEnv
            }
        };
        
        // DB에 프로젝트 추가
        const db = await loadDB();
        db.projects = db.projects || [];
        db.projects.push(projectInfo);
        await saveDB(db);
        
        // 프로젝트 정보 파일 저장
        await fs.writeFile(
            path.join(projectDir, 'project.json'),
            JSON.stringify(projectInfo, null, 2)
        );
        
        log('INFO', `Project created: ${name}`);
        
        res.json({
            success: true,
            project: name,
            env: localEnv,
            credentials: projectInfo.credentials,
            ports: projectInfo.ports,
            message: 'Project containers created successfully'
        });
        
    } catch (error) {
        log('ERROR', 'Project creation failed', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/platform/projects/:name/deploy
 * 애플리케이션 컨테이너 배포
 */
app.post('/api/platform/projects/:name/deploy', async (req, res) => {
    const { name } = req.params;
    const { gitUrl, branch = 'main', buildCommand = 'npm run build', startCommand = 'npm start' } = req.body;
    
    try {
        const projectDir = path.join(CONFIG.PROJECT_BASE, name);
        const projectInfo = JSON.parse(await fs.readFile(path.join(projectDir, 'project.json'), 'utf-8'));
        
        // 앱 디렉토리 준비
        const appDir = path.join(projectDir, 'app');
        await fs.mkdir(appDir, { recursive: true });
        
        // Git 클론/풀
        if (gitUrl) {
            log('INFO', `Cloning/pulling from: ${gitUrl}`);
            const gitExists = await fs.access(path.join(appDir, '.git')).then(() => true).catch(() => false);
            
            if (gitExists) {
                await execAsync(`cd ${appDir} && git pull origin ${branch}`);
            } else {
                await execAsync(`git clone -b ${branch} ${gitUrl} ${appDir}`);
            }
        }
        
        // Dockerfile 생성
        const dockerfile = `
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install
RUN ${buildCommand}
EXPOSE ${projectInfo.ports.app}
CMD ${startCommand}
`;
        await fs.writeFile(path.join(appDir, 'Dockerfile'), dockerfile);
        
        // 컨테이너 이미지 빌드
        const imageName = `codeb-app-${name}`;
        log('INFO', `Building image: ${imageName}`);
        await execAsync(`cd ${appDir} && ${PODMAN_PATH} build -t ${imageName} .`);
        
        // 기존 앱 컨테이너 중지 및 제거
        await execAsync(`${PODMAN_PATH} stop ${imageName} 2>/dev/null || true`);
        await execAsync(`${PODMAN_PATH} rm ${imageName} 2>/dev/null || true`);
        
        // 새 앱 컨테이너 실행
        log('INFO', `Starting container: ${imageName}`);
        const envFlags = Object.entries(projectInfo.env.production)
            .map(([k, v]) => `-e ${k}="${v}"`)
            .join(' ');
        
        await execAsync(`
            ${PODMAN_PATH} run -d \
                --name ${imageName} \
                --network ${CONFIG.NETWORK} \
                -p ${projectInfo.ports.app}:3000 \
                -v ${projectInfo.storage.volume}:/storage \
                ${envFlags} \
                --restart unless-stopped \
                ${imageName}
        `);
        
        res.json({
            success: true,
            project: name,
            container: imageName,
            url: `http://${CONFIG.SERVER_IP}:${projectInfo.ports.app}`,
            message: 'Deployment successful'
        });
        
    } catch (error) {
        log('ERROR', 'Deployment failed', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/platform/projects/:name
 * 프로젝트 상태 조회
 */
app.get('/api/platform/projects/:name', async (req, res) => {
    const { name } = req.params;
    
    try {
        const db = await loadDB();
        const project = db.projects.find(p => p.name === name);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        // 컨테이너 상태 확인
        const status = {};
        for (const [type, containerName] of Object.entries(project.containers)) {
            try {
                const { stdout } = await execAsync(`${PODMAN_PATH} inspect ${containerName} --format '{{.State.Status}}'`);
                status[type] = stdout.trim();
            } catch {
                status[type] = 'not found';
            }
        }
        
        res.json({
            ...project,
            status
        });
        
    } catch (error) {
        log('ERROR', 'Status check failed', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/platform/projects
 * 전체 프로젝트 목록
 */
app.get('/api/platform/projects', async (req, res) => {
    try {
        const db = await loadDB();
        res.json(db.projects || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/platform/projects/:name
 * 프로젝트 삭제 (컨테이너 + 데이터)
 */
app.delete('/api/platform/projects/:name', async (req, res) => {
    const { name } = req.params;
    
    try {
        const db = await loadDB();
        const projectIndex = db.projects.findIndex(p => p.name === name);
        
        if (projectIndex === -1) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        const project = db.projects[projectIndex];
        
        // 모든 컨테이너 중지 및 삭제
        for (const containerName of Object.values(project.containers)) {
            log('INFO', `Removing container: ${containerName}`);
            await execAsync(`${PODMAN_PATH} stop ${containerName} 2>/dev/null || true`);
            await execAsync(`${PODMAN_PATH} rm ${containerName} 2>/dev/null || true`);
        }
        
        // 볼륨 삭제
        await execAsync(`${PODMAN_PATH} volume rm ${project.storage.volume} 2>/dev/null || true`);
        
        // 디렉토리 삭제 (옵션)
        if (req.query.removeData === 'true') {
            const projectDir = path.join(CONFIG.PROJECT_BASE, name);
            await fs.rm(projectDir, { recursive: true, force: true });
            await fs.rm(project.storage.path, { recursive: true, force: true });
        }
        
        // DB에서 제거
        db.projects.splice(projectIndex, 1);
        delete db.dbPorts[name];
        delete db.redisPorts[name];
        delete db.appPorts[name];
        await saveDB(db);
        
        log('INFO', `Project deleted: ${name}`);
        res.json({ success: true, message: 'Project deleted' });
        
    } catch (error) {
        log('ERROR', 'Deletion failed', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/platform/projects/:name/:action
 * 프로젝트 컨테이너 제어 (start/stop/restart)
 */
app.post('/api/platform/projects/:name/:action', async (req, res) => {
    const { name, action } = req.params;
    
    if (!['start', 'stop', 'restart'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
    }
    
    try {
        const db = await loadDB();
        const project = db.projects.find(p => p.name === name);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        for (const containerName of Object.values(project.containers)) {
            log('INFO', `${action} container: ${containerName}`);
            await execAsync(`${PODMAN_PATH} ${action} ${containerName}`);
        }
        
        res.json({ success: true, message: `Project ${action}ed` });
        
    } catch (error) {
        log('ERROR', `${action} failed`, error.message);
        res.status(500).json({ error: error.message });
    }
});

// =============================================================================
// 기존 v2.0 API Endpoints (호환성 유지)
// =============================================================================

// GET /api/projects - 프로젝트 목록 (v2.0 호환)
app.get('/api/projects', async (req, res) => {
    const db = await loadDB();
    const projects = db.projects || [];
    
    // v2.0 형식으로 변환
    const v2Projects = projects.map(p => ({
        name: p.name,
        status: 'active',
        port: p.ports.app,
        created: p.created,
        type: p.template || 'nodejs'
    }));
    
    res.json(v2Projects);
});

// POST /api/projects - 프로젝트 생성 (v2.0 호환)
app.post('/api/projects', async (req, res) => {
    // v3.5 platform API로 리다이렉트
    return app._router.handle({
        ...req,
        url: '/api/platform/projects',
        originalUrl: '/api/platform/projects'
    }, res);
});

// 건강 체크
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        version: CONFIG.VERSION,
        mode: 'platform',
        server: CONFIG.SERVER_IP 
    });
});

// 서버 시작
const PORT = CONFIG.API_PORT;
app.listen(PORT, async () => {
    await initNetwork();
    log('INFO', `CodeB API Server v${CONFIG.VERSION} running on port ${PORT}`);
    log('INFO', `Platform mode enabled - Per-project containers`);
    log('INFO', `Server IP: ${CONFIG.SERVER_IP}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    log('INFO', 'Shutting down...');
    process.exit(0);
});