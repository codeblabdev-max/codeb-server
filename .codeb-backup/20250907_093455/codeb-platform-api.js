#!/usr/bin/env node

/**
 * CodeB Platform API Server
 * 프로젝트별 컨테이너 오케스트레이션 (PostgreSQL + Redis + App + Storage)
 */

const express = require('express');
const { exec, execSync } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3010;

// 기본 설정
const CONFIG = {
    baseDir: process.env.PROJECTS_DIR || '/opt/codeb-projects',
    storageDir: process.env.STORAGE_DIR || '/opt/codeb-storage',
    network: 'codeb-network',
    dbPrefix: 'codeb-db-',
    redisPrefix: 'codeb-redis-',
    appPrefix: 'codeb-app-',
    storagePrefix: 'codeb-storage-',
    // 포트 범위
    dbPortStart: 5432,
    redisPortStart: 6379,
    appPortStart: 3000,
    maxProjects: 100
};

// 미들웨어
app.use(express.json());
app.use(cors());

// API 키 인증 미들웨어
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// 사용 중인 포트 추적
let usedPorts = {
    db: new Set(),
    redis: new Set(),
    app: new Set()
};

// 초기화: 네트워크 생성
async function initPlatform() {
    try {
        // Podman 네트워크 생성
        await execAsync(`podman network create ${CONFIG.network} 2>/dev/null || true`);
        
        // 디렉토리 생성
        await fs.mkdir(CONFIG.baseDir, { recursive: true });
        await fs.mkdir(CONFIG.storageDir, { recursive: true });
        
        // 기존 프로젝트 포트 스캔
        await scanExistingProjects();
        
        console.log('✅ Platform initialized');
    } catch (error) {
        console.error('Platform init error:', error);
    }
}

// 기존 프로젝트 스캔
async function scanExistingProjects() {
    try {
        const { stdout } = await execAsync('podman ps --format json');
        const containers = stdout.trim().split('\n')
            .filter(line => line)
            .map(line => JSON.parse(line));
        
        containers.forEach(container => {
            if (container.Names) {
                const name = container.Names[0];
                if (name.startsWith(CONFIG.dbPrefix)) {
                    const port = parseInt(container.Ports?.[0]?.host_port || 0);
                    if (port) usedPorts.db.add(port);
                } else if (name.startsWith(CONFIG.redisPrefix)) {
                    const port = parseInt(container.Ports?.[0]?.host_port || 0);
                    if (port) usedPorts.redis.add(port);
                } else if (name.startsWith(CONFIG.appPrefix)) {
                    const port = parseInt(container.Ports?.[0]?.host_port || 0);
                    if (port) usedPorts.app.add(port);
                }
            }
        });
    } catch (error) {
        console.error('Scan error:', error);
    }
}

// 사용 가능한 포트 찾기
function findAvailablePort(type) {
    let start, used;
    switch(type) {
        case 'db':
            start = CONFIG.dbPortStart;
            used = usedPorts.db;
            break;
        case 'redis':
            start = CONFIG.redisPortStart;
            used = usedPorts.redis;
            break;
        case 'app':
            start = CONFIG.appPortStart;
            used = usedPorts.app;
            break;
    }
    
    for (let port = start; port < start + CONFIG.maxProjects; port++) {
        if (!used.has(port)) {
            used.add(port);
            return port;
        }
    }
    throw new Error(`No available ${type} ports`);
}

// 랜덤 패스워드 생성
function generatePassword() {
    return crypto.randomBytes(16).toString('hex');
}

// 프로젝트 생성 API
app.post('/api/projects', authenticate, async (req, res) => {
    const { name, template = 'nextjs' } = req.body;
    
    if (!name || !name.match(/^[a-z0-9-]+$/)) {
        return res.status(400).json({ error: 'Invalid project name' });
    }
    
    try {
        // 포트 할당
        const dbPort = findAvailablePort('db');
        const redisPort = findAvailablePort('redis');
        const appPort = findAvailablePort('app');
        
        // 자격 증명 생성
        const dbPassword = generatePassword();
        const dbUser = `user_${name}`;
        const dbName = `db_${name}`;
        
        // 프로젝트 디렉토리 생성
        const projectDir = path.join(CONFIG.baseDir, name);
        const storageDir = path.join(CONFIG.storageDir, name);
        await fs.mkdir(projectDir, { recursive: true });
        await fs.mkdir(storageDir, { recursive: true });
        
        // PostgreSQL 컨테이너 생성
        const dbContainer = `${CONFIG.dbPrefix}${name}`;
        await execAsync(`
            podman run -d \
                --name ${dbContainer} \
                --network ${CONFIG.network} \
                -p ${dbPort}:5432 \
                -e POSTGRES_USER=${dbUser} \
                -e POSTGRES_PASSWORD=${dbPassword} \
                -e POSTGRES_DB=${dbName} \
                -v ${projectDir}/pgdata:/var/lib/postgresql/data \
                --restart unless-stopped \
                postgres:15-alpine
        `);
        
        // Redis 컨테이너 생성
        const redisContainer = `${CONFIG.redisPrefix}${name}`;
        await execAsync(`
            podman run -d \
                --name ${redisContainer} \
                --network ${CONFIG.network} \
                -p ${redisPort}:6379 \
                -v ${projectDir}/redis:/data \
                --restart unless-stopped \
                redis:7-alpine
        `);
        
        // 스토리지 볼륨 생성
        const storageVolume = `${CONFIG.storagePrefix}${name}`;
        await execAsync(`podman volume create ${storageVolume}`);
        
        // 환경 변수 구성
        const envConfig = {
            DATABASE_URL: `postgresql://${dbUser}:${dbPassword}@${getServerIP()}:${dbPort}/${dbName}`,
            REDIS_URL: `redis://${getServerIP()}:${redisPort}`,
            STORAGE_PATH: `/storage`,
            STORAGE_VOLUME: storageVolume,
            PROJECT_NAME: name,
            APP_PORT: appPort,
            NODE_ENV: 'production'
        };
        
        // 로컬 개발용 환경 설정
        const localEnv = {
            DATABASE_URL: `postgresql://${dbUser}:${dbPassword}@${getServerIP()}:${dbPort}/${dbName}`,
            REDIS_URL: `redis://${getServerIP()}:${redisPort}`,
            STORAGE_URL: `http://${getServerIP()}:${appPort}/storage`,
            NEXT_PUBLIC_API_URL: `http://${getServerIP()}:${appPort}/api`,
            NODE_ENV: 'development'
        };
        
        // 프로젝트 정보 저장
        const projectInfo = {
            name,
            template,
            created: new Date().toISOString(),
            containers: {
                db: dbContainer,
                redis: redisContainer,
                app: `${CONFIG.appPrefix}${name}`
            },
            ports: {
                db: dbPort,
                redis: redisPort,
                app: appPort
            },
            credentials: {
                database: {
                    host: getServerIP(),
                    port: dbPort,
                    user: dbUser,
                    password: dbPassword,
                    database: dbName
                },
                redis: {
                    host: getServerIP(),
                    port: redisPort
                }
            },
            storage: {
                volume: storageVolume,
                path: storageDir
            },
            env: envConfig,
            localEnv
        };
        
        // 프로젝트 정보 파일 저장
        await fs.writeFile(
            path.join(projectDir, 'project.json'),
            JSON.stringify(projectInfo, null, 2)
        );
        
        res.json({
            success: true,
            project: name,
            env: localEnv,
            credentials: projectInfo.credentials,
            ports: projectInfo.ports,
            message: 'Project created successfully'
        });
        
    } catch (error) {
        console.error('Project creation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 프로젝트 배포 API (앱 컨테이너 생성/업데이트)
app.post('/api/projects/:name/deploy', authenticate, async (req, res) => {
    const { name } = req.params;
    const { gitUrl, branch = 'main', buildCommand = 'npm run build', startCommand = 'npm start' } = req.body;
    
    try {
        const projectDir = path.join(CONFIG.baseDir, name);
        const projectInfo = JSON.parse(await fs.readFile(path.join(projectDir, 'project.json'), 'utf-8'));
        
        // 앱 디렉토리 준비
        const appDir = path.join(projectDir, 'app');
        await fs.mkdir(appDir, { recursive: true });
        
        // Git 클론/풀
        if (gitUrl) {
            if (await fs.access(path.join(appDir, '.git')).then(() => true).catch(() => false)) {
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
        const imageName = `${CONFIG.appPrefix}${name}`;
        await execAsync(`cd ${appDir} && podman build -t ${imageName} .`);
        
        // 기존 앱 컨테이너 중지 및 제거
        await execAsync(`podman stop ${imageName} 2>/dev/null || true`);
        await execAsync(`podman rm ${imageName} 2>/dev/null || true`);
        
        // 새 앱 컨테이너 실행
        await execAsync(`
            podman run -d \
                --name ${imageName} \
                --network ${CONFIG.network} \
                -p ${projectInfo.ports.app}:3000 \
                -v ${projectInfo.storage.volume}:/storage \
                ${Object.entries(projectInfo.env).map(([k,v]) => `-e ${k}="${v}"`).join(' ')} \
                --restart unless-stopped \
                ${imageName}
        `);
        
        res.json({
            success: true,
            project: name,
            container: imageName,
            url: `http://${getServerIP()}:${projectInfo.ports.app}`,
            message: 'Deployment successful'
        });
        
    } catch (error) {
        console.error('Deployment error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 프로젝트 상태 조회
app.get('/api/projects/:name', authenticate, async (req, res) => {
    const { name } = req.params;
    
    try {
        const projectDir = path.join(CONFIG.baseDir, name);
        const projectInfo = JSON.parse(await fs.readFile(path.join(projectDir, 'project.json'), 'utf-8'));
        
        // 컨테이너 상태 확인
        const status = {};
        for (const [type, containerName] of Object.entries(projectInfo.containers)) {
            try {
                const { stdout } = await execAsync(`podman inspect ${containerName} --format '{{.State.Status}}'`);
                status[type] = stdout.trim();
            } catch {
                status[type] = 'not found';
            }
        }
        
        res.json({
            ...projectInfo,
            status
        });
        
    } catch (error) {
        res.status(404).json({ error: 'Project not found' });
    }
});

// 프로젝트 목록
app.get('/api/projects', authenticate, async (req, res) => {
    try {
        const projects = [];
        const dirs = await fs.readdir(CONFIG.baseDir);
        
        for (const dir of dirs) {
            try {
                const projectInfo = JSON.parse(
                    await fs.readFile(path.join(CONFIG.baseDir, dir, 'project.json'), 'utf-8')
                );
                projects.push({
                    name: projectInfo.name,
                    created: projectInfo.created,
                    ports: projectInfo.ports
                });
            } catch {
                // 프로젝트 정보 파일이 없는 디렉토리는 무시
            }
        }
        
        res.json(projects);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 프로젝트 삭제
app.delete('/api/projects/:name', authenticate, async (req, res) => {
    const { name } = req.params;
    
    try {
        const projectDir = path.join(CONFIG.baseDir, name);
        const projectInfo = JSON.parse(await fs.readFile(path.join(projectDir, 'project.json'), 'utf-8'));
        
        // 모든 컨테이너 중지 및 삭제
        for (const containerName of Object.values(projectInfo.containers)) {
            await execAsync(`podman stop ${containerName} 2>/dev/null || true`);
            await execAsync(`podman rm ${containerName} 2>/dev/null || true`);
        }
        
        // 볼륨 삭제
        await execAsync(`podman volume rm ${projectInfo.storage.volume} 2>/dev/null || true`);
        
        // 디렉토리 삭제
        await fs.rm(projectDir, { recursive: true, force: true });
        await fs.rm(path.join(CONFIG.storageDir, name), { recursive: true, force: true });
        
        // 포트 해제
        usedPorts.db.delete(projectInfo.ports.db);
        usedPorts.redis.delete(projectInfo.ports.redis);
        usedPorts.app.delete(projectInfo.ports.app);
        
        res.json({ success: true, message: 'Project deleted' });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 프로젝트 시작/중지
app.post('/api/projects/:name/:action', authenticate, async (req, res) => {
    const { name, action } = req.params;
    
    if (!['start', 'stop', 'restart'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
    }
    
    try {
        const projectDir = path.join(CONFIG.baseDir, name);
        const projectInfo = JSON.parse(await fs.readFile(path.join(projectDir, 'project.json'), 'utf-8'));
        
        for (const containerName of Object.values(projectInfo.containers)) {
            await execAsync(`podman ${action} ${containerName}`);
        }
        
        res.json({ success: true, message: `Project ${action}ed` });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 서버 IP 가져오기
function getServerIP() {
    // 환경 변수에서 가져오거나 기본값 사용
    return process.env.SERVER_IP || '141.164.60.51';
}

// 헬스 체크
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', version: '1.0.0' });
});

// 서버 시작
app.listen(PORT, async () => {
    await initPlatform();
    console.log(`🚀 CodeB Platform API running on port ${PORT}`);
    console.log(`🌐 Server IP: ${getServerIP()}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down...');
    process.exit(0);
});