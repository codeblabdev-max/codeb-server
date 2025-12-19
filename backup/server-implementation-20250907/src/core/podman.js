/**
 * CodeB Podman 컨테이너 관리 추상화
 * Wave 1 최적화: 중복된 Podman 관리 로직들을 하나로 통합
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const { CONFIG, UTILS } = require('./config');

const execAsync = promisify(exec);

class PodmanManager {
    constructor() {
        this.network = CONFIG.network;
        this.usedPorts = {
            db: new Set(),
            redis: new Set(),
            app: new Set()
        };
        this.initialized = false;
    }

    // 🚀 Podman 초기화
    async initialize() {
        if (this.initialized) return true;

        try {
            console.log('🚀 [Podman 초기화] 네트워크 및 시스템 설정 중...');
            
            // Podman 네트워크 생성 (이미 존재하면 무시)
            await execAsync(`podman network create ${this.network} 2>/dev/null || true`);
            
            // 기존 컨테이너 포트 스캔
            await this.scanExistingContainers();
            
            this.initialized = true;
            console.log('✅ [Podman 초기화 완료] 네트워크 및 포트 스캔 완료');
            return true;
            
        } catch (error) {
            console.error('❌ [Podman 초기화 실패]', error.message);
            throw error;
        }
    }

    // 🔍 기존 컨테이너 스캔
    async scanExistingContainers() {
        try {
            const { stdout } = await execAsync('podman ps --format json --all');
            
            if (!stdout.trim()) {
                console.log('📋 [컨테이너 스캔] 실행 중인 컨테이너 없음');
                return;
            }

            const containers = stdout.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            let dbCount = 0, redisCount = 0, appCount = 0;

            containers.forEach(container => {
                if (!container.Names || container.Names.length === 0) return;
                
                const name = container.Names[0];
                const ports = container.Ports || [];
                
                if (name.startsWith(CONFIG.dbPrefix)) {
                    dbCount++;
                    ports.forEach(port => {
                        if (port.host_port) this.usedPorts.db.add(parseInt(port.host_port));
                    });
                } else if (name.startsWith(CONFIG.redisPrefix)) {
                    redisCount++;
                    ports.forEach(port => {
                        if (port.host_port) this.usedPorts.redis.add(parseInt(port.host_port));
                    });
                } else if (name.startsWith(CONFIG.appPrefix)) {
                    appCount++;
                    ports.forEach(port => {
                        if (port.host_port) this.usedPorts.app.add(parseInt(port.host_port));
                    });
                }
            });

            console.log(`📊 [컨테이너 스캔 완료] DB: ${dbCount}, Redis: ${redisCount}, App: ${appCount}`);
            
        } catch (error) {
            console.warn('⚠️ [컨테이너 스캔 경고] 기존 컨테이너 정보를 가져올 수 없습니다:', error.message);
        }
    }

    // 🔢 사용 가능한 포트 찾기
    findAvailablePort(type) {
        const portConfig = CONFIG.ports[type];
        if (!portConfig) {
            throw new Error(`알 수 없는 포트 타입: ${type}`);
        }

        const usedSet = this.usedPorts[type];
        const start = portConfig.start;
        const max = portConfig.max;

        for (let port = start; port < start + max; port++) {
            if (!usedSet.has(port)) {
                usedSet.add(port);
                console.log(`🔢 [포트 할당] ${type}: ${port}`);
                return port;
            }
        }

        throw new Error(`사용 가능한 ${type} 포트가 없습니다 (범위: ${start}-${start + max - 1})`);
    }

    // 🗄️ PostgreSQL 컨테이너 생성
    async createPostgreSQLContainer(projectName, port, credentials) {
        const containerName = `${CONFIG.dbPrefix}${projectName}`;
        const { user, password, database } = credentials;

        try {
            console.log(`🗄️ [PostgreSQL 생성] ${containerName} (포트: ${port})`);
            
            const command = `podman run -d \
                --name ${containerName} \
                --network ${this.network} \
                -p ${port}:5432 \
                -e POSTGRES_USER=${user} \
                -e POSTGRES_PASSWORD=${password} \
                -e POSTGRES_DB=${database} \
                -e POSTGRES_INITDB_ARGS="--encoding=UTF-8 --locale=C" \
                -v ${CONFIG.baseDir}/${projectName}/pgdata:/var/lib/postgresql/data \
                --restart unless-stopped \
                --health-cmd="pg_isready -U ${user} -d ${database}" \
                --health-interval=30s \
                --health-timeout=10s \
                --health-retries=3 \
                postgres:15-alpine`;

            await execAsync(command);
            
            console.log(`✅ [PostgreSQL 생성 완료] ${containerName}`);
            return {
                name: containerName,
                port,
                type: 'postgresql',
                credentials,
                status: 'created'
            };
            
        } catch (error) {
            console.error(`❌ [PostgreSQL 생성 실패] ${containerName}:`, error.message);
            throw error;
        }
    }

    // 🔴 Redis 컨테이너 생성
    async createRedisContainer(projectName, port) {
        const containerName = `${CONFIG.redisPrefix}${projectName}`;

        try {
            console.log(`🔴 [Redis 생성] ${containerName} (포트: ${port})`);
            
            const command = `podman run -d \
                --name ${containerName} \
                --network ${this.network} \
                -p ${port}:6379 \
                -v ${CONFIG.baseDir}/${projectName}/redis:/data \
                --restart unless-stopped \
                --health-cmd="redis-cli ping" \
                --health-interval=30s \
                --health-timeout=10s \
                --health-retries=3 \
                redis:7-alpine redis-server --appendonly yes`;

            await execAsync(command);
            
            console.log(`✅ [Redis 생성 완료] ${containerName}`);
            return {
                name: containerName,
                port,
                type: 'redis',
                status: 'created'
            };
            
        } catch (error) {
            console.error(`❌ [Redis 생성 실패] ${containerName}:`, error.message);
            throw error;
        }
    }

    // 📦 앱 컨테이너 배포
    async deployAppContainer(projectName, port, config) {
        const containerName = `${CONFIG.appPrefix}${projectName}`;

        try {
            console.log(`📦 [앱 배포] ${containerName} (포트: ${port})`);
            
            // 기존 컨테이너 중지 및 제거
            await this.stopContainer(containerName, false);
            await this.removeContainer(containerName, false);

            // 환경 변수 문자열 생성
            const envVars = Object.entries(config.env || {})
                .map(([key, value]) => `-e ${key}="${value}"`)
                .join(' ');

            const command = `podman run -d \
                --name ${containerName} \
                --network ${this.network} \
                -p ${port}:${config.containerPort || 3000} \
                ${envVars} \
                --restart unless-stopped \
                --health-cmd="curl -f http://localhost:${config.containerPort || 3000}/health || exit 1" \
                --health-interval=30s \
                --health-timeout=10s \
                --health-retries=3 \
                ${config.imageName || containerName}`;

            await execAsync(command);
            
            console.log(`✅ [앱 배포 완료] ${containerName}`);
            return {
                name: containerName,
                port,
                type: 'application',
                status: 'deployed'
            };
            
        } catch (error) {
            console.error(`❌ [앱 배포 실패] ${containerName}:`, error.message);
            throw error;
        }
    }

    // ⏹️ 컨테이너 중지
    async stopContainer(containerName, logError = true) {
        try {
            await execAsync(`podman stop ${containerName} 2>/dev/null`);
            console.log(`⏹️ [컨테이너 중지] ${containerName}`);
            return true;
        } catch (error) {
            if (logError) {
                console.warn(`⚠️ [컨테이너 중지 경고] ${containerName}: ${error.message}`);
            }
            return false;
        }
    }

    // 🗑️ 컨테이너 제거
    async removeContainer(containerName, logError = true) {
        try {
            await execAsync(`podman rm ${containerName} 2>/dev/null`);
            console.log(`🗑️ [컨테이너 제거] ${containerName}`);
            return true;
        } catch (error) {
            if (logError) {
                console.warn(`⚠️ [컨테이너 제거 경고] ${containerName}: ${error.message}`);
            }
            return false;
        }
    }

    // 📊 컨테이너 상태 확인
    async getContainerStatus(containerName) {
        try {
            const { stdout } = await execAsync(`podman inspect ${containerName} --format '{{.State.Status}}'`);
            return stdout.trim();
        } catch {
            return 'not found';
        }
    }

    // 🔍 프로젝트의 모든 컨테이너 상태
    async getProjectContainerStatus(projectName) {
        const containers = {
            db: `${CONFIG.dbPrefix}${projectName}`,
            redis: `${CONFIG.redisPrefix}${projectName}`,
            app: `${CONFIG.appPrefix}${projectName}`
        };

        const status = {};
        
        for (const [type, name] of Object.entries(containers)) {
            status[type] = await this.getContainerStatus(name);
        }

        return status;
    }

    // 🔄 포트 해제
    releasePort(type, port) {
        if (this.usedPorts[type]) {
            this.usedPorts[type].delete(port);
            console.log(`🔄 [포트 해제] ${type}: ${port}`);
        }
    }

    // 📈 Podman 통계
    async getStats() {
        try {
            const { stdout } = await execAsync('podman ps --format json');
            const containers = stdout.trim() ? stdout.trim().split('\n').map(line => JSON.parse(line)) : [];
            
            return {
                totalContainers: containers.length,
                runningContainers: containers.filter(c => c.State === 'running').length,
                network: this.network,
                usedPorts: {
                    db: Array.from(this.usedPorts.db),
                    redis: Array.from(this.usedPorts.redis),
                    app: Array.from(this.usedPorts.app)
                }
            };
        } catch (error) {
            console.error('❌ [Podman 통계 실패]', error);
            return null;
        }
    }
}

// 싱글톤 인스턴스
let podmanInstance = null;

function getPodmanManager() {
    if (!podmanInstance) {
        podmanInstance = new PodmanManager();
    }
    return podmanInstance;
}

module.exports = {
    PodmanManager,
    getPodmanManager
};