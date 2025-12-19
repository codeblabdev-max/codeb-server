#!/usr/bin/env node

/**
 * CodeB API Server v2
 * 프로젝트별 Podman Pod 관리 + 도메인 자동 설정 + 스토리지 자동 마운트
 */

const http = require('http');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const execAsync = promisify(exec);

// 설정
const CONFIG = {
    SERVER_IP: '141.164.60.51',
    BASE_DOMAIN: 'one-q.xyz',
    PROJECT_BASE: '/var/lib/codeb/projects',
    STORAGE_BASE: '/mnt/blockstorage/projects',  // 블록 스토리지 경로
    PORT_RANGE_START: 4000,
    PORT_RANGE_END: 4999,
    API_PORT: 3008,
    CADDY_CONFIG: '/etc/caddy/Caddyfile'
};

// 데이터베이스 (간단한 JSON 파일)
const DB_FILE = '/var/lib/codeb/projects.json';

// 프로젝트 템플릿
const TEMPLATES = {
    nextjs: {
        image: 'node:18-alpine',
        initScript: `npx create-next-app@latest . --typescript --tailwind --app --no-eslint --import-alias "@/*" --use-npm --yes && npm install`,
        startCmd: 'npm run dev -- --port 3000'
    },
    remix: {
        image: 'node:18-alpine',
        initScript: `npx create-remix@latest . --template remix-run/remix/templates/remix --no-install --yes && npm install`,
        startCmd: 'npm run dev -- --port 3000'
    }
};

// 로깅 함수
const log = (level, message, data = null) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level}: ${message}`, data || '');
};

// 데이터베이스 로드/저장
async function loadDB() {
    try {
        const data = await fs.readFile(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { projects: [], portAllocations: {} };
    }
}

async function saveDB(data) {
    await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

// 사용 가능한 포트 찾기
async function getNextAvailablePort() {
    const db = await loadDB();
    const usedPorts = Object.values(db.portAllocations);
    
    for (let port = CONFIG.PORT_RANGE_START; port <= CONFIG.PORT_RANGE_END; port++) {
        if (!usedPorts.includes(port)) {
            try {
                const { stdout } = await execAsync(`netstat -tlnp | grep :${port}`);
                if (!stdout) return port;
            } catch {
                return port;
            }
        }
    }
    throw new Error('No available ports');
}

// Caddy 설정 업데이트
async function updateCaddyConfig(projectName, port) {
    const domain = `${projectName}.codeb.${CONFIG.BASE_DOMAIN}`;
    const caddyConfig = `
# Project: ${projectName}
${domain} {
    reverse_proxy localhost:${port}
    encode gzip
    header {
        X-Real-IP {remote_host}
        X-Forwarded-For {remote_host}
        X-Forwarded-Proto {scheme}
    }
}
`;
    
    try {
        // Caddy 설정 추가
        await execAsync(`echo '${caddyConfig}' >> ${CONFIG.CADDY_CONFIG}`);
        
        // Caddy 재로드
        await execAsync('systemctl reload caddy || caddy reload');
        
        log('INFO', `Caddy config updated for ${domain}`);
        return domain;
    } catch (error) {
        log('ERROR', 'Failed to update Caddy config', error);
        throw error;
    }
}

// 스토리지 디렉토리 생성
async function createStorageDirectories(projectName) {
    const dirs = {
        project: path.join(CONFIG.PROJECT_BASE, projectName),
        storage: path.join(CONFIG.STORAGE_BASE, projectName),
        config: path.join(CONFIG.PROJECT_BASE, projectName, 'config'),
        app: path.join(CONFIG.PROJECT_BASE, projectName, 'app'),
        data: path.join(CONFIG.STORAGE_BASE, projectName, 'data'),
        postgres: path.join(CONFIG.STORAGE_BASE, projectName, 'data', 'postgres'),
        redis: path.join(CONFIG.STORAGE_BASE, projectName, 'data', 'redis'),
        uploads: path.join(CONFIG.STORAGE_BASE, projectName, 'uploads'),
        logs: path.join(CONFIG.STORAGE_BASE, projectName, 'logs')
    };
    
    // 모든 디렉토리 생성
    for (const [key, dir] of Object.entries(dirs)) {
        try {
            await execAsync(`mkdir -p "${dir}"`);
            log('INFO', `Created directory: ${dir}`);
        } catch (err) {
            log('WARN', `Error creating directory ${dir}:`, err);
        }
    }
    
    return dirs;
}

// createProject 함수 - 프로젝트 생성 로직
async function createProject(data) {
    const { 
        name, 
        template = 'nextjs', 
        enablePostgres = true, 
        enableRedis = true,
        gitUrl = null 
    } = data;
    
    // 이름 검증
    if (!/^[a-z0-9-]+$/.test(name)) {
        throw new Error('Project name must contain only lowercase letters, numbers, and hyphens');
    }
    
    // 중복 체크
    const db = await loadDB();
    if (db.projects.find(p => p.name === name)) {
        throw new Error('Project already exists');
    }
    
    log('INFO', `Creating project: ${name}`);
    
    // 포트 할당
    const appPort = await getNextAvailablePort();
    
    // 스토리지 디렉토리 생성
    const dirs = await createStorageDirectories(name);
    
    // Pod 생성 (포트 매핑 포함)
    await execAsync(`podman pod create --name project-${name} -p ${appPort}:3000`);
    
    // PostgreSQL 컨테이너 생성
    let pgPassword = null;
    if (enablePostgres) {
        pgPassword = crypto.randomBytes(16).toString('hex');
        await fs.writeFile(path.join(dirs.config, 'postgres_password'), pgPassword);
        
        await execAsync(`
            podman run -d \
                --pod project-${name} \
                --name ${name}-postgres \
                -e POSTGRES_DB=${name} \
                -e POSTGRES_USER=${name} \
                -e POSTGRES_PASSWORD=${pgPassword} \
                -v ${dirs.postgres}:/var/lib/postgresql/data \
                docker.io/postgres:15-alpine
        `);
        log('INFO', `PostgreSQL container created for ${name}`);
    }
    
    // Redis 컨테이너 생성
    let redisPassword = null;
    if (enableRedis) {
        redisPassword = crypto.randomBytes(16).toString('hex');
        await fs.writeFile(path.join(dirs.config, 'redis_password'), redisPassword);
        
        await execAsync(`
            podman run -d \
                --pod project-${name} \
                --name ${name}-redis \
                -v ${dirs.redis}:/data \
                docker.io/redis:7-alpine \
                redis-server --requirepass ${redisPassword}
        `);
        log('INFO', `Redis container created for ${name}`);
    }
    
    // 템플릿 설정
    const templateConfig = TEMPLATES[template] || TEMPLATES.nextjs;
    
    // 앱 컨테이너 생성
    await execAsync(`
        podman run -d \
            --pod project-${name} \
            --name ${name}-app \
            -v ${dirs.app}:/app \
            -v ${dirs.uploads}:/uploads \
            -v ${dirs.logs}:/logs \
            -w /app \
            docker.io/${templateConfig.image} \
            sh -c "while true; do sleep 3600; done"
    `);
    
    // 템플릿 초기화
    if (!gitUrl) {
        const initCmd = templateConfig.initScript.replace(/\n/g, ' ');
        await execAsync(`podman exec ${name}-app sh -c "cd /app && ${initCmd}"`);
    } else {
        // Git 클론
        await execAsync(`
            podman exec ${name}-app sh -c "cd /app && git clone ${gitUrl} . || git pull"
        `);
    }
    
    // 앱 시작
    await execAsync(`podman exec -d ${name}-app sh -c "cd /app && ${templateConfig.startCmd}"`);
    
    log('INFO', `App container created and started for ${name}`);
    
    // Caddy 설정 업데이트 (도메인 자동 설정)
    const domain = await updateCaddyConfig(name, appPort);
    
    // 환경 변수 파일 생성
    const envContent = `
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://${name}:${pgPassword}@localhost:5432/${name}
REDIS_URL=redis://:${redisPassword}@localhost:6379
STORAGE_PATH=/uploads
LOG_PATH=/logs
PROJECT_NAME=${name}
DOMAIN=${domain}
`;
    await fs.writeFile(path.join(dirs.config, '.env'), envContent);
    
    // 프로젝트 정보 저장
    const project = {
        id: crypto.randomUUID(),
        name,
        template,
        appPort,
        domain,
        storageBase: dirs.storage,
        gitUrl,
        enablePostgres,
        enableRedis,
        createdAt: new Date().toISOString(),
        status: 'running'
    };
    
    db.projects.push(project);
    db.portAllocations[name] = appPort;
    await saveDB(db);
    
    log('INFO', `Project created successfully: ${name}`);
    
    return {
        success: true,
        project,
        access: {
            url: `http://${CONFIG.SERVER_IP}:${appPort}`,
            domain: `https://${domain}`,
            database: enablePostgres ? {
                host: 'localhost',
                port: 5432,
                database: name,
                user: name,
                password: '***'
            } : null,
            redis: enableRedis ? {
                host: 'localhost',
                port: 6379,
                password: '***'
            } : null,
            storage: {
                uploads: '/uploads',
                logs: '/logs',
                data: dirs.storage
            }
        },
        commands: {
            logs: `podman logs ${name}-app`,
            exec: `podman exec -it ${name}-app sh`,
            restart: `podman pod restart project-${name}`
        }
    };
}

// deleteProject 함수 - 프로젝트 삭제 로직
async function deleteProject(name) {
    const db = await loadDB();
    
    const projectIndex = db.projects.findIndex(p => p.name === name);
    if (projectIndex === -1) {
        throw new Error('Project not found');
    }
    
    log('INFO', `Deleting project: ${name}`);
    
    // Pod 및 컨테이너 삭제
    await execAsync(`podman pod stop project-${name} 2>/dev/null || true`);
    await execAsync(`podman pod rm -f project-${name} 2>/dev/null || true`);
    
    // Caddy 설정에서 제거
    const domain = `${name}.codeb.${CONFIG.BASE_DOMAIN}`;
    await execAsync(`sed -i '/${domain}/,/^}/d' ${CONFIG.CADDY_CONFIG}`);
    await execAsync('systemctl reload caddy || caddy reload');
    
    // 디렉토리 삭제 (백업 옵션)
    const backupDir = `/backup/projects/${name}-${Date.now()}`;
    await execAsync(`mkdir -p /backup/projects`);
    await execAsync(`mv ${CONFIG.PROJECT_BASE}/${name} ${backupDir} 2>/dev/null || true`);
    await execAsync(`mv ${CONFIG.STORAGE_BASE}/${name} ${backupDir}/storage 2>/dev/null || true`);
    
    // DB에서 제거
    db.projects.splice(projectIndex, 1);
    delete db.portAllocations[name];
    await saveDB(db);
    
    log('INFO', `Project deleted: ${name}`);
    
    return { 
        success: true, 
        message: `Project ${name} deleted`,
        backup: backupDir 
    };
}

// listProjects 함수 - 프로젝트 목록 조회
async function listProjects() {
    const db = await loadDB();
    const projects = [];
    
    for (const project of db.projects) {
        const status = await getProjectStatus(project.name);
        projects.push({
            ...project,
            ...status,
            url: `http://${CONFIG.SERVER_IP}:${project.appPort}`,
            domain: `https://${project.domain}`
        });
    }
    
    return { success: true, projects };
}

// Helper 함수
async function getProjectStatus(name) {
    try {
        const { stdout } = await execAsync(`podman pod ps --filter name=project-${name} --format json`);
        const pods = JSON.parse(stdout || '[]');
        
        if (pods.length === 0) {
            return { status: 'not_found', running: false };
        }
        
        const pod = pods[0];
        const { stdout: containers } = await execAsync(`podman ps -a --filter pod=project-${name} --format json`);
        const containerList = JSON.parse(containers || '[]');
        
        return {
            status: pod.Status,
            running: pod.Status === 'Running',
            containers: containerList.map(c => ({
                name: c.Names[0],
                state: c.State,
                status: c.Status
            }))
        };
    } catch (error) {
        return { status: 'error', running: false, error: error.message };
    }
}

// parseBody 함수 - POST 요청 바디 파싱
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(JSON.parse(body || '{}'));
            } catch (error) {
                reject(error);
            }
        });
    });
}

// parseQuery 함수 - URL 쿼리 파라미터 파싱
function parseQuery(url) {
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) return {};
    
    const queryString = url.substring(queryIndex + 1);
    const params = {};
    queryString.split('&').forEach(param => {
        const [key, value] = param.split('=');
        params[key] = decodeURIComponent(value || '');
    });
    return params;
}

// 서버 시작
const server = http.createServer(async (req, res) => {
    // CORS 헤더
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // URL 파싱
    const [pathname, queryString] = req.url.split('?');
    const query = parseQuery(req.url);
    const method = req.method;
    
    try {
        // 헬스체크
        if (pathname === '/api/health' && method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: '2.0.0',
                server: CONFIG.SERVER_IP,
                features: ['domain-auto', 'storage-auto', 'templates']
            }));
            return;
        }
        
        // 프로젝트 목록
        if (pathname === '/api/projects' && method === 'GET') {
            const result = await listProjects();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }
        
        // 프로젝트 생성
        if (pathname === '/api/projects' && method === 'POST') {
            const data = await parseBody(req);
            const result = await createProject(data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }
        
        // 프로젝트 삭제 (DELETE /api/projects/:name)
        const deleteMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)$/);
        if (deleteMatch && method === 'DELETE') {
            const name = deleteMatch[1];
            const result = await deleteProject(name);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }
        
        // 프로젝트 액션 (POST /api/projects/:name/:action)
        const actionMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/(start|stop|restart)$/);
        if (actionMatch && method === 'POST') {
            const [, name, action] = actionMatch;
            
            log('INFO', `${action} project: ${name}`);
            await execAsync(`podman pod ${action} project-${name}`);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: true, 
                message: `Project ${name} ${action}ed` 
            }));
            return;
        }
        
        // 프로젝트 상태 (GET /api/projects/:name/status)
        const statusMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/status$/);
        if (statusMatch && method === 'GET') {
            const name = statusMatch[1];
            const status = await getProjectStatus(name);
            
            // 스토리지 사용량 확인
            const { stdout: storageUsage } = await execAsync(
                `du -sh ${CONFIG.STORAGE_BASE}/${name} 2>/dev/null || echo "0"`
            );
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: true, 
                ...status,
                storage: storageUsage.trim()
            }));
            return;
        }
        
        // 프로젝트 로그 (GET /api/projects/:name/logs)
        const logsMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/logs$/);
        if (logsMatch && method === 'GET') {
            const name = logsMatch[1];
            const container = query.container || 'app';
            const lines = query.lines || 100;
            
            const containerName = `${name}-${container}`;
            const { stdout } = await execAsync(
                `podman logs --tail ${lines} ${containerName} 2>&1`
            );
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                container: containerName,
                logs: stdout.split('\n')
            }));
            return;
        }
        
        // 템플릿 목록
        if (pathname === '/api/templates' && method === 'GET') {
            const templates = Object.keys(TEMPLATES).map(key => ({
                id: key,
                name: key.charAt(0).toUpperCase() + key.slice(1),
                description: `${key} project template`,
                image: TEMPLATES[key].image
            }));
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, templates }));
            return;
        }
        
        // 404
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        
    } catch (error) {
        log('ERROR', 'Request error', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            success: false, 
            error: error.message 
        }));
    }
});

server.listen(CONFIG.API_PORT, '0.0.0.0', () => {
    log('INFO', `CodeB API Server v2 started on port ${CONFIG.API_PORT}`);
    console.log(`
    ╔══════════════════════════════════════════════════════╗
    ║           CodeB API Server v2.0                      ║
    ║                                                       ║
    ║   Features:                                           ║
    ║   ✅ Domain Auto-Configuration (Caddy)               ║
    ║   ✅ Storage Auto-Mount (/mnt/blockstorage)          ║
    ║   ✅ Project Templates (Next.js, Remix)              ║
    ║   ✅ PostgreSQL + Redis per Project                  ║
    ║                                                       ║
    ║   API URL: http://${CONFIG.SERVER_IP}:${CONFIG.API_PORT}           ║
    ║   Health: http://${CONFIG.SERVER_IP}:${CONFIG.API_PORT}/api/health ║
    ╚══════════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    log('INFO', 'Shutting down server...');
    process.exit(0);
});