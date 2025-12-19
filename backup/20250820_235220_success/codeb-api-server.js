#!/usr/bin/env node

/**
 * CodeB API Server
 * 프로젝트별 Podman Pod 관리 시스템
 */

const express = require('express');
const fileUpload = require('express-fileupload');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Podman 전체 경로 설정 (PATH 문제 해결)
const PODMAN_PATH = '/usr/bin/podman';
const originalExecAsync = promisify(exec);
const execAsync = (cmd) => {
    // podman 명령어를 전체 경로로 변경
    const modifiedCmd = cmd.replace(/\bpodman\b/g, PODMAN_PATH);
    return originalExecAsync(modifiedCmd);
};
const app = express();
app.use(express.json());
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    useTempFiles: true,
    tempFileDir: '/tmp/'
}));

// 설정
const CONFIG = {
    SERVER_IP: '141.164.60.51',
    BASE_DOMAIN: 'one-q.xyz',
    PROJECT_BASE: '/var/lib/codeb/projects',
    PORT_RANGE_START: 4000,
    PORT_RANGE_END: 4999,
    API_PORT: 3008
};

// 데이터베이스 (간단한 JSON 파일)
const DB_FILE = '/var/lib/codeb/projects.json';

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
            // 실제로 사용 중인지 확인
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

// API 엔드포인트

// 헬스체크
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        server: CONFIG.SERVER_IP
    });
});

// 프로젝트 목록
app.get('/api/projects', async (req, res) => {
    try {
        const db = await loadDB();
        const projects = [];
        
        // 각 프로젝트의 실제 상태 확인
        for (const project of db.projects) {
            const status = await getProjectStatus(project.name);
            projects.push({
                ...project,
                ...status
            });
        }
        
        res.json({ success: true, projects });
    } catch (error) {
        log('ERROR', 'Failed to list projects', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 프로젝트 생성 (복원력 있는 생성 - 실패시 재개 가능)
app.post('/api/projects', async (req, res) => {
    try {
        const { name, template = 'nodejs', enablePostgres = true, enableRedis = true, resume = false } = req.body;
        
        // 이름 검증
        if (!/^[a-z0-9-]+$/.test(name)) {
            return res.status(400).json({
                success: false,
                error: 'Project name must contain only lowercase letters, numbers, and hyphens'
            });
        }
        
        // 중복 체크 - 실제 실행 중인 프로젝트 확인
        const db = await loadDB();
        const existingProject = db.projects.find(p => p.name === name);
        
        if (existingProject) {
            // 이미 데이터베이스에 있고 실행 중인 경우
            const status = await getProjectStatus(name);
            if (status.running) {
                return res.status(200).json({
                    success: true,
                    message: `프로젝트 '${name}'이 이미 실행 중입니다. Git 배포를 진행하세요.`,
                    project: existingProject,
                    nextStep: `codeb deploy ${name} <git-url>`,
                    access: {
                        url: `http://${CONFIG.SERVER_IP}:${existingProject.appPort}`,
                        domain: existingProject.domain
                    }
                });
            }
        }
        
        // Podman에서 이미 존재하는 Pod 확인 및 복구
        let podExists = false;
        let needsRepair = false;
        try {
            const { stdout } = await execAsync(`podman pod ps --filter name=project-${name} --format json`);
            const pods = JSON.parse(stdout || '[]');
            if (pods.length > 0 && !resume) {
                // Pod가 있지만 DB에 없는 경우 - 복구 필요
                if (!existingProject) {
                    needsRepair = true;
                    log('INFO', `Found orphaned pod for ${name}, will repair...`);
                } else {
                    return res.status(200).json({
                        success: true,
                        message: `프로젝트 '${name}'이 이미 생성되어 있습니다. Git 배포를 진행하세요.`,
                        nextStep: `codeb deploy ${name} <git-url>`,
                        status: pods[0].Status,
                        access: {
                            url: `http://${CONFIG.SERVER_IP}:${existingProject.appPort}`,
                            domain: existingProject.domain
                        }
                    });
                }
            }
            podExists = pods.length > 0;
        } catch (error) {
            // Pod 조회 실패시 계속 진행
            log('WARNING', 'Failed to check existing pods', error);
        }
        
        log('INFO', needsRepair ? `Repairing project: ${name}` : `Creating project: ${name}`);
        
        // 포트 할당 (기존 프로젝트가 있으면 재사용)
        const appPort = existingProject?.appPort || await getNextAvailablePort();
        const dbPort = enablePostgres ? (existingProject?.dbPort || appPort + 1000) : null;
        const redisPort = enableRedis ? (existingProject?.redisPort || appPort + 2000) : null;
        
        // 프로젝트 디렉토리 생성
        const projectDir = path.join(CONFIG.PROJECT_BASE, name);
        await execAsync(`mkdir -p ${projectDir}/{config,data,logs,app}`);
        
        // Pod 생성 (이미 있으면 스킵)
        if (!podExists) {
            try {
                // 포트 매핑 구성
                let portMappings = `-p ${appPort}:3000`;
                if (enablePostgres && dbPort) {
                    portMappings += ` -p ${dbPort}:5432`;
                }
                if (enableRedis && redisPort) {
                    portMappings += ` -p ${redisPort}:6379`;
                }
                
                await execAsync(`podman pod create --name project-${name} ${portMappings}`);
                log('INFO', `Pod created for ${name} with ports: app=${appPort}, db=${dbPort}, redis=${redisPort}`);
            } catch (error) {
                if (error.message.includes('already exists')) {
                    log('INFO', `Pod already exists for ${name}, continuing...`);
                } else {
                    throw error;
                }
            }
        } else {
            log('INFO', `Using existing pod for ${name}`);
        }
        
        // PostgreSQL 컨테이너 생성 (이미 있으면 스킵)
        if (enablePostgres) {
            try {
                const { stdout: pgExists } = await execAsync(`podman ps -a --filter name=${name}-postgres --format json`);
                const pgContainers = JSON.parse(pgExists || '[]');
                
                if (pgContainers.length === 0) {
                    const pgPassword = existingProject?.pgPassword || crypto.randomBytes(16).toString('hex');
                    await fs.writeFile(`${projectDir}/config/postgres_password`, pgPassword).catch(() => {});
                    
                    await execAsync(`
                        podman run -d \
                            --pod project-${name} \
                            --name ${name}-postgres \
                            -e POSTGRES_DB=${name} \
                            -e POSTGRES_USER=${name} \
                            -e POSTGRES_PASSWORD=${pgPassword} \
                            -v ${projectDir}/data/postgres:/var/lib/postgresql/data \
                            postgres:15-alpine
                    `);
                    log('INFO', `PostgreSQL container created for ${name}`);
                } else {
                    log('INFO', `PostgreSQL container already exists for ${name}`);
                }
            } catch (error) {
                log('WARN', `Failed to create PostgreSQL container: ${error.message}`);
            }
        }
        
        // Redis 컨테이너 생성 (이미 있으면 스킵)
        if (enableRedis) {
            try {
                const { stdout: redisExists } = await execAsync(`podman ps -a --filter name=${name}-redis --format json`);
                const redisContainers = JSON.parse(redisExists || '[]');
                
                if (redisContainers.length === 0) {
                    const redisPassword = existingProject?.redisPassword || crypto.randomBytes(16).toString('hex');
                    await fs.writeFile(`${projectDir}/config/redis_password`, redisPassword).catch(() => {});
                    
                    await execAsync(`
                        podman run -d \
                            --pod project-${name} \
                            --name ${name}-redis \
                            -v ${projectDir}/data/redis:/data \
                            redis:7-alpine \
                            redis-server --requirepass ${redisPassword}
                    `);
                    log('INFO', `Redis container created for ${name}`);
                } else {
                    log('INFO', `Redis container already exists for ${name}`);
                }
            } catch (error) {
                log('WARN', `Failed to create Redis container: ${error.message}`);
            }
        }
        
        // 앱 컨테이너 생성 (이미 있으면 스킵)
        try {
            const { stdout: appExists } = await execAsync(`podman ps -a --filter name=${name}-app --format json`);
            const appContainers = JSON.parse(appExists || '[]');
            
            if (appContainers.length === 0) {
                const appImage = getTemplateImage(template);
                // 필수 패키지 설치 후 대기
                await execAsync(`
                    podman run -d \
                        --pod project-${name} \
                        --name ${name}-app \
                        -v ${projectDir}/app:/app \
                        -w /app \
                        ${appImage} \
                        sh -c "apk add --no-cache openssl git && sleep infinity"
                `);
                log('INFO', `App container created for ${name}`);
            } else {
                log('INFO', `App container already exists for ${name}`);
                // 컨테이너가 멈춰있으면 시작
                if (appContainers[0].State !== 'running') {
                    await execAsync(`podman start ${name}-app`);
                    log('INFO', `Started existing app container for ${name}`);
                }
            }
        } catch (error) {
            log('ERROR', `Failed to create app container: ${error.message}`);
            throw error;
        }
        
        // 필수 시스템 패키지 설치 (이미 설치되어 있을 수 있음)
        if (template === 'nodejs') {
            try {
                // Git이 설치되어 있는지 확인
                const { stdout: gitCheck } = await execAsync(`podman exec ${name}-app sh -c "which git || echo 'not found'"`);
                
                if (gitCheck.includes('not found')) {
                    log('INFO', `Installing essential packages for ${name}...`);
                    await execAsync(`podman exec ${name}-app sh -c "apk add --no-cache git openssl openssl-dev && npm install -g pm2"`);
                    
                    // OpenSSL 1.1 호환성을 위한 심볼릭 링크 생성
                    await execAsync(`podman exec ${name}-app sh -c "ln -sf /usr/lib/libssl.so.3 /usr/lib/libssl.so.1.1 && ln -sf /usr/lib/libcrypto.so.3 /usr/lib/libcrypto.so.1.1"`);
                    log('INFO', `Essential packages installed for ${name}`);
                } else {
                    log('INFO', `Essential packages already installed for ${name}`);
                }
            } catch (error) {
                log('WARN', `Failed to check/install packages: ${error.message}`);
            }
        }
        
        // 도메인 설정 (이미 있을 수 있음)
        const domain = existingProject?.domain || `${name}.codeb.${CONFIG.BASE_DOMAIN}`;
        
        // Caddy 설정 추가/업데이트
        try {
            await updateCaddyConfig(name, domain, appPort);
            log('INFO', `Domain configured: ${domain}`);
        } catch (error) {
            log('WARN', `Failed to configure domain: ${error.message}`);
        }
        
        // 프로젝트 정보 저장/업데이트
        const project = {
            id: existingProject?.id || crypto.randomUUID(),
            name,
            template,
            appPort,
            dbPort,
            redisPort,
            domain,
            pgPassword: enablePostgres ? (await fs.readFile(`${projectDir}/config/postgres_password`, 'utf8').catch(() => null)) : null,
            redisPassword: enableRedis ? (await fs.readFile(`${projectDir}/config/redis_password`, 'utf8').catch(() => null)) : null,
            packagesInstalled: true,
            createdAt: existingProject?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'running'
        };
        
        // 기존 프로젝트 업데이트 또는 새로 추가
        if (existingProject) {
            const index = db.projects.findIndex(p => p.name === name);
            db.projects[index] = project;
            log('INFO', `Updated existing project: ${name}`);
        } else {
            db.projects.push(project);
            log('INFO', `Added new project: ${name}`);
        }
        
        db.portAllocations[name] = appPort;
        await saveDB(db);
        
        log('INFO', `Project created successfully: ${name}`);
        res.json({
            success: true,
            project,
            access: {
                url: `http://${CONFIG.SERVER_IP}:${appPort}`,
                domain: project.domain,
                database: enablePostgres ? `postgres://${name}:***@localhost:5432/${name}` : null,
                redis: enableRedis ? `redis://:***@localhost:6379` : null
            }
        });
        
    } catch (error) {
        log('ERROR', 'Failed to create project', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 프로젝트 삭제
app.delete('/api/projects/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const db = await loadDB();
        
        const projectIndex = db.projects.findIndex(p => p.name === name);
        if (projectIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }
        
        log('INFO', `Deleting project: ${name}`);
        
        // Pod 및 컨테이너 삭제
        await execAsync(`podman pod stop project-${name} 2>/dev/null || true`);
        await execAsync(`podman pod rm project-${name} 2>/dev/null || true`);
        
        // Caddy 설정 제거
        await removeCaddyConfig(name);
        
        // 프로젝트 디렉토리 삭제
        const projectDir = path.join(CONFIG.PROJECT_BASE, name);
        await execAsync(`rm -rf ${projectDir}`);
        
        // DB에서 제거
        db.projects.splice(projectIndex, 1);
        delete db.portAllocations[name];
        await saveDB(db);
        
        log('INFO', `Project deleted: ${name}`);
        res.json({ success: true, message: `Project ${name} deleted` });
        
    } catch (error) {
        log('ERROR', 'Failed to delete project', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 프로젝트에 코드 배포 (MUST be before :action route!)
app.post('/api/projects/:name/deploy', async (req, res) => {
    try {
        const { name } = req.params;
        const { gitUrl, branch = 'main', envVars = {}, dbBackupUrl } = req.body;
        
        log('INFO', `Deploying to project: ${name} from ${gitUrl}`);
        
        // 프로젝트 정보 가져오기
        const db = await loadDB();
        const project = db.projects.find(p => p.name === name);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }
        
        // Check if .git exists in container
        const gitExists = await execAsync(`podman exec ${name}-app sh -c "test -d /app/.git && echo 'true' || echo 'false'"`)
            .then(result => result.stdout.trim() === 'true')
            .catch(() => false);
        
        if (gitExists) {
            // Git pull in container - 브랜치 자동 감지
            try {
                // 현재 브랜치 확인
                const { stdout: currentBranch } = await execAsync(`podman exec ${name}-app sh -c "cd /app && git branch --show-current"`);
                const pullBranch = currentBranch.trim() || branch;
                await execAsync(`podman exec ${name}-app sh -c "cd /app && git pull origin ${pullBranch}"`);
                log('INFO', `Pulled from branch: ${pullBranch}`);
            } catch (error) {
                // pull 실패시 기본 브랜치 시도
                log('WARN', `Failed to pull ${branch}, trying default branch...`);
                await execAsync(`podman exec ${name}-app sh -c "cd /app && git pull"`);
            }
        } else {
            // Git clone in container - 기본 브랜치 자동 사용
            try {
                await execAsync(`podman exec ${name}-app sh -c "cd /app && git clone ${gitUrl} . || (rm -rf * && git clone ${gitUrl} .)"`);
                log('INFO', `Cloned repository from ${gitUrl}`);
            } catch (error) {
                log('ERROR', `Clone failed: ${error.message}`);
                throw error;
            }
        }
        
        // package.json 읽어서 프로젝트 타입 감지
        let projectType = 'nodejs';
        try {
            const { stdout: packageJson } = await execAsync(`podman exec ${name}-app sh -c "cat /app/package.json"`);
            const pkg = JSON.parse(packageJson);
            if (pkg.dependencies?.next || pkg.devDependencies?.next) {
                projectType = 'nextjs';
            }
            
            // 필요한 시스템 패키지 설치 (OpenSSL 등)
            await execAsync(`podman exec ${name}-app sh -c "apk add --no-cache openssl || true"`);
            log('INFO', 'System packages installed');
        } catch (e) {
            // package.json이 없거나 파싱 실패시 기본값 사용
        }
        
        // 환경 변수 템플릿 로드 및 .env 파일 생성
        const envTemplates = require('./env-templates.json');
        const template = envTemplates[projectType] || envTemplates.default;
        
        // 기본 환경 변수 생성
        const generatedEnvVars = {};
        for (const [key, value] of Object.entries(template.defaults)) {
            let processedValue = value
                .replace(/{PROJECT_NAME}/g, name)
                .replace(/{DOMAIN}/g, project.domain || `${name}.codeb.one-q.xyz`)
                .replace(/{REDIS_PASSWORD}/g, project.redisPassword || 'redis123')
                .replace(/{RANDOM_STRING}/g, crypto.randomBytes(16).toString('hex'));
            
            generatedEnvVars[key] = envVars[key] || processedValue;
        }
        
        // PostgreSQL과 Redis는 localhost 사용 (Pod 네트워크 내부)
        if (project.enablePostgres) {
            generatedEnvVars['DATABASE_URL'] = `postgresql://user:password@localhost:5432/${name}`;
            generatedEnvVars['DIRECT_URL'] = `postgresql://user:password@localhost:5432/${name}`;
        }
        if (project.enableRedis) {
            generatedEnvVars['REDIS_URL'] = `redis://:${project.redisPassword || 'redis123'}@localhost:6379`;
        }
        
        // .env 파일 생성
        const envContent = Object.entries(generatedEnvVars)
            .map(([key, value]) => `${key}=${value}`)
            .join('\\n');
        
        await execAsync(`podman exec ${name}-app sh -c "cat > /app/.env << 'EOF'
${envContent}
EOF"`);
        
        log('INFO', `Created .env file with ${Object.keys(generatedEnvVars).length} variables`);
        
        // 의존성 설치 (legacy-peer-deps 사용)
        log('INFO', 'Installing dependencies...');
        await execAsync(`podman exec ${name}-app sh -c "cd /app && npm install --legacy-peer-deps"`);
        
        // 데이터베이스 설정 (백업 복원 또는 Prisma 마이그레이션)
        if (project.enablePostgres) {
            if (dbBackupUrl) {
                // 데이터베이스 백업 복원
                log('INFO', `Restoring database from backup: ${dbBackupUrl}`);
                try {
                    // 백업 파일 다운로드
                    await execAsync(`wget -O /tmp/${name}_backup.sql "${dbBackupUrl}"`);
                    
                    // PostgreSQL 컨테이너에 복사
                    await execAsync(`podman cp /tmp/${name}_backup.sql ${name}-postgres:/tmp/backup.sql`);
                    
                    // 데이터베이스 복원
                    await execAsync(`
                        podman exec ${name}-postgres sh -c "
                            psql -U user -c 'DROP DATABASE IF EXISTS ${name};' 2>/dev/null || true
                            psql -U user -c 'CREATE DATABASE ${name};'
                            psql -U user -d ${name} < /tmp/backup.sql
                        "
                    `);
                    
                    // 임시 파일 정리
                    await execAsync(`rm -f /tmp/${name}_backup.sql`).catch(() => {});
                    await execAsync(`podman exec ${name}-postgres sh -c "rm -f /tmp/backup.sql"`).catch(() => {});
                    
                    log('INFO', 'Database restored successfully from backup');
                } catch (error) {
                    log('ERROR', 'Database backup restore failed, falling back to Prisma migration', error);
                    // 백업 복원 실패시 Prisma로 폴백
                    await execAsync(`podman exec ${name}-app sh -c "cd /app && npx prisma db push --accept-data-loss || true"`).catch(() => {});
                }
            } else {
                // Prisma 마이그레이션 실행 (기본 방식)
                try {
                    const { stdout: hasPrisma } = await execAsync(`podman exec ${name}-app sh -c "test -f /app/prisma/schema.prisma && echo 'true' || echo 'false'"`);
                    if (hasPrisma.trim() === 'true') {
                        log('INFO', 'Running database migrations...');
                        await execAsync(`podman exec ${name}-app sh -c "cd /app && npx prisma db push --accept-data-loss || true"`);
                        
                        // 시드 스크립트 실행 (있는 경우)
                        const { stdout: hasSeed } = await execAsync(`podman exec ${name}-app sh -c "test -f /app/prisma/seed-sample-data.ts && echo 'true' || echo 'false'"`);
                        if (hasSeed.trim() === 'true') {
                            log('INFO', 'Running database seed...');
                            await execAsync(`podman exec ${name}-app sh -c "cd /app && npx tsx prisma/seed-sample-data.ts || true"`);
                        }
                    }
                } catch (e) {
                    log('WARN', 'Prisma migration/seed skipped', e.message);
                }
            }
        }
        
        // 빌드 (Next.js는 빌드 필요)
        if (projectType === 'nextjs') {
            log('INFO', 'Building Next.js application...');
            await execAsync(`podman exec ${name}-app sh -c "cd /app && npm run build || echo 'Build failed but continuing...'"`);
        }
        
        // PM2로 앱 시작/재시작 (PORT=3000 설정)
        await execAsync(`podman exec ${name}-app sh -c "cd /app && pm2 restart ${name} || PORT=3000 pm2 start npm --name ${name} -- start"`);
        
        res.json({
            success: true,
            message: `Successfully deployed ${name} from ${gitUrl}`,
            url: `http://${CONFIG.SERVER_IP}:${project.appPort}`,
            domain: project.domain,
            projectType,
            envVarsGenerated: Object.keys(generatedEnvVars).length
        });
        
    } catch (error) {
        log('ERROR', 'Failed to deploy', error);
        
        // 더 자세한 에러 정보 제공
        let errorDetails = {
            success: false,
            error: error.message,
            stage: 'deployment'
        };
        
        // Git 관련 에러인 경우 추가 정보
        if (error.message.includes('git') || error.message.includes('fatal')) {
            errorDetails.suggestion = "Git 저장소를 확인하세요. 기본 브랜치가 'master'일 수 있습니다.";
            errorDetails.command = `codeb deploy ${name} ${gitUrl} master`;
        }
        
        // 빌드 관련 에러인 경우
        if (error.message.includes('npm') || error.message.includes('build')) {
            errorDetails.suggestion = "빌드 로그를 확인하세요: codeb logs " + name + " build";
            errorDetails.stage = 'build';
        }
        
        res.status(500).json(errorDetails);
    }
});

// 프로젝트 시작/중지
app.post('/api/projects/:name/:action', async (req, res) => {
    try {
        const { name, action } = req.params;
        
        if (!['start', 'stop', 'restart'].includes(action)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid action. Use start, stop, or restart'
            });
        }
        
        log('INFO', `${action} project: ${name}`);
        await execAsync(`podman pod ${action} project-${name}`);
        
        res.json({ success: true, message: `Project ${name} ${action}ed` });
        
    } catch (error) {
        log('ERROR', `Failed to ${action} project`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 프로젝트 상태 확인
app.get('/api/projects/:name/status', async (req, res) => {
    try {
        const { name } = req.params;
        const status = await getProjectStatus(name);
        res.json({ success: true, ...status });
    } catch (error) {
        log('ERROR', 'Failed to get project status', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 프로젝트 로그
app.get('/api/projects/:name/logs', async (req, res) => {
    try {
        const { name } = req.params;
        const { container = 'app', lines = 100 } = req.query;
        
        const containerName = `${name}-${container}`;
        const { stdout } = await execAsync(`podman logs --tail ${lines} ${containerName} 2>&1`);
        
        res.json({
            success: true,
            container: containerName,
            logs: stdout.split('\n')
        });
        
    } catch (error) {
        log('ERROR', 'Failed to get logs', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 빌드 로그
app.get('/api/projects/:name/logs/build', async (req, res) => {
    try {
        const { name } = req.params;
        const { lines = 50 } = req.query;
        
        const projectDir = path.join(CONFIG.PROJECT_BASE, name);
        const buildLogPath = `${projectDir}/logs/build.log`;
        
        let logs = [];
        try {
            const logContent = await fs.readFile(buildLogPath, 'utf8');
            logs = logContent.split('\n').slice(-lines);
        } catch {
            // 로그 파일이 없으면 컨테이너에서 직접 빌드 로그 실행
            const { stdout } = await execAsync(`podman exec ${name}-app sh -c 'cd /app && npm run build 2>&1 | tail -${lines}'`);
            logs = stdout.split('\n');
        }
        
        res.json({
            success: true,
            logs: logs,
            type: 'build'
        });
        
    } catch (error) {
        log('ERROR', 'Failed to get build logs', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PM2 애플리케이션 로그
app.get('/api/projects/:name/logs/pm2', async (req, res) => {
    try {
        const { name } = req.params;
        const { lines = 50 } = req.query;
        
        const { stdout } = await execAsync(`podman exec ${name}-app sh -c 'pm2 logs ${name} --lines ${lines} --nostream 2>/dev/null || echo "PM2 not running"'`);
        
        res.json({
            success: true,
            logs: stdout.split('\n'),
            type: 'pm2'
        });
        
    } catch (error) {
        log('ERROR', 'Failed to get PM2 logs', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 실시간 로그 스트림 (Server-Sent Events)
app.get('/api/projects/:name/logs/stream', async (req, res) => {
    try {
        const { name } = req.params;
        const { type = 'app' } = req.query;
        
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        
        const containerName = `${name}-${type}`;
        let logProcess;
        
        if (type === 'pm2') {
            logProcess = exec(`podman exec ${name}-app sh -c 'pm2 logs ${name} --lines 0 2>/dev/null || echo "PM2 not running"'`);
        } else {
            logProcess = exec(`podman logs -f ${containerName} 2>&1`);
        }
        
        logProcess.stdout.on('data', (data) => {
            res.write(`data: ${JSON.stringify({ log: data.toString(), timestamp: new Date().toISOString() })}\n\n`);
        });
        
        logProcess.stderr.on('data', (data) => {
            res.write(`data: ${JSON.stringify({ log: data.toString(), type: 'error', timestamp: new Date().toISOString() })}\n\n`);
        });
        
        req.on('close', () => {
            if (logProcess) {
                logProcess.kill();
            }
        });
        
    } catch (error) {
        log('ERROR', 'Failed to stream logs', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 파일 구조 확인
app.get('/api/projects/:name/files', async (req, res) => {
    try {
        const { name } = req.params;
        const { path: targetPath = '/' } = req.query;
        
        const { stdout } = await execAsync(`podman exec ${name}-app sh -c 'cd /app${targetPath} && find . -maxdepth 2 -type f -o -type d | head -50'`);
        
        const files = stdout.split('\n')
            .filter(line => line.trim())
            .map(line => {
                const isDir = line.endsWith('/') || !line.includes('.');
                return {
                    name: line.replace('./', ''),
                    type: isDir ? 'directory' : 'file',
                    path: `${targetPath}/${line.replace('./', '')}`
                };
            });
        
        res.json({
            success: true,
            path: targetPath,
            files: files
        });
        
    } catch (error) {
        log('ERROR', 'Failed to get file structure', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 빌드 실행
app.post('/api/projects/:name/build', async (req, res) => {
    try {
        const { name } = req.params;
        const { type = 'build' } = req.body; // build, dev, start
        
        log('INFO', `Building project: ${name} (type: ${type})`);
        
        const projectDir = path.join(CONFIG.PROJECT_BASE, name);
        const buildLogPath = `${projectDir}/logs/build.log`;
        
        // 로그 디렉토리 생성
        await execAsync(`mkdir -p ${projectDir}/logs`);
        
        let command;
        switch (type) {
            case 'dev':
                command = 'npm run dev';
                break;
            case 'start':
                command = 'npm start';
                break;
            default:
                command = 'npm run build';
        }
        
        // 비동기로 빌드 실행 및 로그 저장
        const buildProcess = exec(`podman exec ${name}-app sh -c 'cd /app && ${command} 2>&1'`);
        
        let buildOutput = '';
        let buildSuccess = false;
        
        buildProcess.stdout.on('data', (data) => {
            buildOutput += data;
            // 로그 파일에도 저장
            fs.appendFile(buildLogPath, data).catch(() => {});
        });
        
        buildProcess.on('close', (code) => {
            buildSuccess = code === 0;
        });
        
        // 5초 후 응답 (빌드는 백그라운드에서 계속)
        setTimeout(() => {
            res.json({
                success: true,
                message: `Build started for ${name}`,
                command: command,
                buildId: Date.now(),
                status: buildSuccess ? 'completed' : 'running'
            });
        }, 5000);
        
    } catch (error) {
        log('ERROR', 'Failed to build project', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Execute command in container
app.post('/api/projects/:name/exec', async (req, res) => {
    try {
        const { name } = req.params;
        const { command } = req.body;
        
        if (!command) {
            return res.status(400).json({ success: false, error: 'Command is required' });
        }
        
        log('INFO', `Executing command in ${name}: ${command}`);
        
        // Execute command in the app container
        const { stdout, stderr } = await execAsync(`podman exec ${name}-app sh -c "${command.replace(/"/g, '\\"')}"`);
        
        res.json({
            success: true,
            output: stdout,
            error: stderr || null
        });
        
    } catch (error) {
        log('ERROR', 'Failed to execute command', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            output: error.stdout || '',
            stderr: error.stderr || ''
        });
    }
});

// 종합 진단
app.get('/api/projects/:name/diagnose', async (req, res) => {
    try {
        const { name } = req.params;
        
        log('INFO', `Running diagnosis for project: ${name}`);
        
        const diagnosis = {
            project: name,
            timestamp: new Date().toISOString(),
            checks: {}
        };
        
        // 1. 컨테이너 상태 확인
        try {
            const { stdout: podStatus } = await execAsync(`podman pod ps --filter name=project-${name} --format json`);
            const pods = JSON.parse(podStatus || '[]');
            diagnosis.checks.container = {
                status: pods.length > 0 ? pods[0].Status : 'not_found',
                running: pods.length > 0 && pods[0].Status === 'Running'
            };
        } catch (error) {
            diagnosis.checks.container = { status: 'error', error: error.message };
        }
        
        // 2. 애플리케이션 파일 확인
        try {
            const { stdout } = await execAsync(`podman exec ${name}-app test -f /app/package.json && echo "OK" || echo "MISSING"`);
            diagnosis.checks.packageJson = stdout.trim() === 'OK';
            
            const { stdout: nodeModules } = await execAsync(`podman exec ${name}-app test -d /app/node_modules && echo "OK" || echo "MISSING"`);
            diagnosis.checks.nodeModules = nodeModules.trim() === 'OK';
        } catch (error) {
            diagnosis.checks.packageJson = false;
            diagnosis.checks.nodeModules = false;
        }
        
        // 3. 포트 상태 확인
        try {
            const db = await loadDB();
            const project = db.projects.find(p => p.name === name);
            if (project) {
                const { stdout } = await execAsync(`netstat -tlnp | grep :${project.appPort} || echo "NOT_LISTENING"`);
                diagnosis.checks.port = {
                    allocated: project.appPort,
                    listening: !stdout.includes('NOT_LISTENING')
                };
            }
        } catch (error) {
            diagnosis.checks.port = { error: error.message };
        }
        
        // 4. 최근 빌드 로그 확인
        try {
            const projectDir = path.join(CONFIG.PROJECT_BASE, name);
            const buildLogPath = `${projectDir}/logs/build.log`;
            const logContent = await fs.readFile(buildLogPath, 'utf8');
            const recentLogs = logContent.split('\n').slice(-10);
            
            diagnosis.checks.buildLogs = {
                available: true,
                recentLines: recentLogs,
                hasErrors: recentLogs.some(line => 
                    line.includes('ERROR') || 
                    line.includes('Failed') || 
                    line.includes('Module parse failed')
                )
            };
        } catch (error) {
            diagnosis.checks.buildLogs = { available: false };
        }
        
        // 5. PM2 프로세스 확인
        try {
            const { stdout } = await execAsync(`podman exec ${name}-app sh -c 'pm2 list | grep ${name}' 2>/dev/null || echo "NOT_RUNNING"`);
            diagnosis.checks.pm2 = {
                running: !stdout.includes('NOT_RUNNING'),
                status: stdout.trim()
            };
        } catch (error) {
            diagnosis.checks.pm2 = { running: false };
        }
        
        // 종합 상태 평가
        const healthScore = Object.values(diagnosis.checks).reduce((score, check) => {
            if (typeof check === 'boolean') return score + (check ? 1 : 0);
            if (check.status === 'Running' || check.running) return score + 1;
            return score;
        }, 0);
        
        diagnosis.healthScore = Math.round((healthScore / Object.keys(diagnosis.checks).length) * 100);
        diagnosis.status = diagnosis.healthScore > 70 ? 'healthy' : 
                          diagnosis.healthScore > 40 ? 'warning' : 'critical';
        
        res.json({
            success: true,
            diagnosis: diagnosis
        });
        
    } catch (error) {
        log('ERROR', 'Failed to diagnose project', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// Helper 함수들

async function updateCaddyConfig(name, domain, port) {
    try {
        const caddyConfig = `
${domain} {
    reverse_proxy localhost:${port}
    encode gzip
    
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
    }
    
    handle_errors {
        respond "{http.error.status_code} {http.error.status_text}"
    }
}`;
        
        // Caddy 설정 파일에 추가
        const caddyFile = `/etc/caddy/sites-enabled/${name}.conf`;
        await fs.writeFile(caddyFile, caddyConfig);
        
        // Caddy 재시작
        await execAsync('systemctl reload caddy');
        
        log('INFO', `Caddy config updated for ${domain}`);
        return true;
    } catch (error) {
        log('ERROR', `Failed to update Caddy config: ${error.message}`);
        // SSH로 직접 설정 시도
        try {
            await execAsync(`ssh root@${CONFIG.SERVER_IP} "echo '${domain} { reverse_proxy localhost:${port}; encode gzip }' > /etc/caddy/sites-enabled/${name}.conf && systemctl reload caddy"`);
            return true;
        } catch (sshError) {
            log('ERROR', `SSH Caddy update also failed: ${sshError.message}`);
            return false;
        }
    }
}

async function removeCaddyConfig(name) {
    try {
        const caddyFile = `/etc/caddy/sites-enabled/${name}.conf`;
        await fs.unlink(caddyFile).catch(() => {});
        await execAsync('systemctl reload caddy').catch(() => {});
    } catch (error) {
        // SSH로 시도
        await execAsync(`ssh root@${CONFIG.SERVER_IP} "rm -f /etc/caddy/sites-enabled/${name}.conf && systemctl reload caddy"`).catch(() => {});
    }
}

function getTemplateImage(template) {
    const templates = {
        nodejs: 'node:20-alpine',  // Node 20으로 업그레이드
        python: 'python:3.11-alpine',
        php: 'php:8.2-apache',
        go: 'golang:1.21-alpine',
        static: 'nginx:alpine'
    };
    return templates[template] || templates.nodejs;
}

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

// Database backup endpoint
app.get('/api/projects/:name/db/backup', async (req, res) => {
    const { name } = req.params;
    
    try {
        log('INFO', `Creating database backup for project: ${name}`);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const backupFile = `${name}_${timestamp}.sql`;
        
        // Create backup in PostgreSQL container
        await execAsync(`
            podman exec ${name}-postgres sh -c "
                pg_dump -U user -d ${name} > /tmp/${backupFile}
            "
        `);
        
        // Copy backup to host
        await execAsync(`
            podman cp ${name}-postgres:/tmp/${backupFile} /tmp/${backupFile}
        `);
        
        // Check if file exists and has content
        const stats = await fs.stat(`/tmp/${backupFile}`);
        if (stats.size === 0) {
            throw new Error('Backup file is empty');
        }
        
        // Send file to client
        res.download(`/tmp/${backupFile}`, backupFile, (err) => {
            if (err) {
                log('ERROR', 'Failed to send backup file', err);
            }
            // Clean up temp file
            fs.unlink(`/tmp/${backupFile}`, () => {});
        });
        
        log('INFO', `Database backup created successfully: ${backupFile}`);
        
    } catch (error) {
        log('ERROR', 'Database backup failed', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Database restore endpoint
app.post('/api/projects/:name/db/restore', async (req, res) => {
    const { name } = req.params;
    const { backupUrl, backupData } = req.body;
    
    try {
        log('INFO', `Restoring database for project: ${name}`);
        
        let backupFile = `/tmp/${name}_restore.sql`;
        
        // Handle different backup sources
        if (backupUrl) {
            // Download backup from URL
            log('INFO', `Downloading backup from: ${backupUrl}`);
            await execAsync(`wget -O ${backupFile} "${backupUrl}"`);
        } else if (backupData) {
            // Use uploaded backup data
            await fs.writeFile(backupFile, backupData);
        } else if (req.files && req.files.backup) {
            // Handle file upload
            const uploadedFile = req.files.backup;
            await uploadedFile.mv(backupFile);
        } else {
            return res.status(400).json({ 
                success: false, 
                error: 'No backup source provided. Use backupUrl, backupData, or upload a file.' 
            });
        }
        
        // Verify backup file exists
        const stats = await fs.stat(backupFile);
        if (stats.size === 0) {
            throw new Error('Backup file is empty');
        }
        
        // Copy backup to PostgreSQL container
        await execAsync(`
            podman cp ${backupFile} ${name}-postgres:/tmp/restore.sql
        `);
        
        // Create backup of current database before restore
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        await execAsync(`
            podman exec ${name}-postgres sh -c "
                pg_dump -U user -d ${name} > /tmp/backup_before_restore_${timestamp}.sql 2>/dev/null || true
            "
        `);
        
        // Restore database
        log('INFO', 'Restoring database...');
        const { stdout, stderr } = await execAsync(`
            podman exec ${name}-postgres sh -c "
                psql -U user -c 'DROP DATABASE IF EXISTS ${name}_old;' 2>/dev/null || true
                psql -U user -c 'ALTER DATABASE ${name} RENAME TO ${name}_old;' 2>/dev/null || true
                psql -U user -c 'CREATE DATABASE ${name};'
                psql -U user -d ${name} < /tmp/restore.sql
            "
        `);
        
        // Clean up
        await fs.unlink(backupFile).catch(() => {});
        await execAsync(`
            podman exec ${name}-postgres sh -c "rm -f /tmp/restore.sql"
        `).catch(() => {});
        
        log('INFO', 'Database restored successfully');
        res.json({ 
            success: true, 
            message: 'Database restored successfully',
            details: stdout || 'Restore completed'
        });
        
    } catch (error) {
        log('ERROR', 'Database restore failed', error);
        
        // Attempt rollback
        try {
            await execAsync(`
                podman exec ${name}-postgres sh -c "
                    psql -U user -c 'DROP DATABASE IF EXISTS ${name};' 2>/dev/null || true
                    psql -U user -c 'ALTER DATABASE ${name}_old RENAME TO ${name};' 2>/dev/null || true
                "
            `);
            log('INFO', 'Rolled back to previous database');
        } catch (rollbackError) {
            log('ERROR', 'Rollback failed', rollbackError);
        }
        
        res.status(500).json({ 
            success: false, 
            error: error.message,
            stderr: error.stderr || ''
        });
    }
});

// List database tables
app.get('/api/projects/:name/db/tables', async (req, res) => {
    const { name } = req.params;
    
    try {
        const { stdout } = await execAsync(`
            podman exec ${name}-postgres sh -c "
                psql -U user -d ${name} -c '\\dt' | grep -E '^\\s+public' | awk '{print \\$3}'
            "
        `);
        
        const tables = stdout.trim().split('\n').filter(t => t);
        
        res.json({
            success: true,
            database: name,
            tables: tables,
            count: tables.length
        });
        
    } catch (error) {
        log('ERROR', 'Failed to list tables', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Execute SQL query
app.post('/api/projects/:name/db/query', async (req, res) => {
    const { name } = req.params;
    const { query } = req.body;
    
    if (!query) {
        return res.status(400).json({ 
            success: false, 
            error: 'SQL query is required' 
        });
    }
    
    try {
        // Sanitize query (basic check for dangerous operations)
        const dangerousKeywords = ['DROP DATABASE', 'DROP SCHEMA', 'DROP TABLE', 'TRUNCATE'];
        const upperQuery = query.toUpperCase();
        
        for (const keyword of dangerousKeywords) {
            if (upperQuery.includes(keyword)) {
                return res.status(400).json({ 
                    success: false, 
                    error: `Dangerous operation detected: ${keyword}. Use restore endpoint for major changes.` 
                });
            }
        }
        
        const { stdout, stderr } = await execAsync(`
            podman exec ${name}-postgres sh -c "
                psql -U user -d ${name} -c \\"${query.replace(/"/g, '\\\\"')}\\"
            "
        `);
        
        res.json({
            success: true,
            result: stdout,
            warning: stderr || null
        });
        
    } catch (error) {
        log('ERROR', 'Failed to execute query', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            stderr: error.stderr || ''
        });
    }
});

// 서버 시작
app.listen(CONFIG.API_PORT, '0.0.0.0', () => {
    log('INFO', `CodeB API Server started on port ${CONFIG.API_PORT}`);
    console.log(`
    ╔══════════════════════════════════════════════════════╗
    ║           CodeB API Server v2.0                      ║
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