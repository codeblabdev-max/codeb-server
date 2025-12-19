/**
 * CodeB 프로젝트 관리 서비스
 * Wave 1 최적화: 3개 서버의 프로젝트 로직을 하나로 통합
 */

const path = require('path');
const fs = require('fs').promises;
const { getDatabase } = require('../core/database');
const { getPodmanManager } = require('../core/podman');
const { CONFIG, UTILS } = require('../core/config');

class ProjectService {
    constructor() {
        this.db = getDatabase();
        this.podman = getPodmanManager();
    }

    // 🆕 새 프로젝트 생성
    async createProject(projectData) {
        const { name, template = 'nextjs' } = projectData;

        try {
            // 프로젝트 이름 검증
            if (!UTILS.validateProjectName(name)) {
                throw new Error('프로젝트 이름은 소문자, 숫자, 하이픈만 사용 가능합니다 (최대 50자)');
            }

            // 기존 프로젝트 확인
            const existing = await this.db.findProject(name);
            if (existing && !existing.deleted) {
                throw new Error(`프로젝트 '${name}'이 이미 존재합니다`);
            }

            console.log(`🆕 [프로젝트 생성 시작] ${name} (템플릿: ${template})`);

            // Podman 초기화
            await this.podman.initialize();

            // 포트 할당
            const ports = {
                db: this.podman.findAvailablePort('db'),
                redis: this.podman.findAvailablePort('redis'),
                app: this.podman.findAvailablePort('app')
            };

            // 데이터베이스 자격 증명 생성
            const dbCredentials = {
                user: `user_${name}`,
                password: UTILS.generatePassword(),
                database: `db_${name}`
            };

            // 프로젝트 디렉토리 생성
            const projectDir = path.join(CONFIG.baseDir, name);
            const storageDir = path.join(CONFIG.storageDir, name);
            
            await fs.mkdir(projectDir, { recursive: true });
            await fs.mkdir(storageDir, { recursive: true });
            await fs.mkdir(path.join(projectDir, 'pgdata'), { recursive: true });
            await fs.mkdir(path.join(projectDir, 'redis'), { recursive: true });
            await fs.mkdir(path.join(projectDir, 'app'), { recursive: true });

            console.log(`📁 [디렉토리 생성 완료] ${projectDir}`);

            // 컨테이너 생성
            const containers = {};
            
            // PostgreSQL 컨테이너
            containers.db = await this.podman.createPostgreSQLContainer(
                name, ports.db, dbCredentials
            );

            // Redis 컨테이너
            containers.redis = await this.podman.createRedisContainer(
                name, ports.redis
            );

            // 환경 변수 구성
            const envConfig = {
                // 데이터베이스 연결
                DATABASE_URL: `postgresql://${dbCredentials.user}:${dbCredentials.password}@${UTILS.getServerIP()}:${ports.db}/${dbCredentials.database}`,
                
                // Redis 연결
                REDIS_URL: `redis://${UTILS.getServerIP()}:${ports.redis}`,
                
                // 프로젝트 설정
                PROJECT_NAME: name,
                PROJECT_TEMPLATE: template,
                APP_PORT: ports.app,
                
                // 스토리지 설정
                STORAGE_PATH: '/storage',
                STORAGE_URL: `http://${UTILS.getServerIP()}:${ports.app}/storage`,
                
                // API 설정
                NEXT_PUBLIC_API_URL: `http://${UTILS.getServerIP()}:${ports.app}/api`,
                
                // 환경 설정
                NODE_ENV: 'production',
                
                // CodeB 설정
                CODEB_VERSION: '3.6.0-unified',
                CODEB_OPTIMIZATION: 'Wave 1 완료'
            };

            // 프로젝트 정보 객체
            const projectInfo = {
                name,
                template,
                status: 'created',
                
                // 컨테이너 정보
                containers: {
                    db: containers.db.name,
                    redis: containers.redis.name,
                    app: `${CONFIG.appPrefix}${name}`
                },
                
                // 포트 정보
                ports,
                
                // 자격 증명
                credentials: {
                    database: {
                        host: UTILS.getServerIP(),
                        port: ports.db,
                        user: dbCredentials.user,
                        password: dbCredentials.password,
                        database: dbCredentials.database,
                        url: envConfig.DATABASE_URL
                    },
                    redis: {
                        host: UTILS.getServerIP(),
                        port: ports.redis,
                        url: envConfig.REDIS_URL
                    }
                },
                
                // 경로 정보
                paths: {
                    project: projectDir,
                    storage: storageDir,
                    app: path.join(projectDir, 'app')
                },
                
                // 환경 변수
                env: envConfig,
                
                // 메타데이터
                metadata: {
                    created: new Date().toISOString(),
                    version: '3.6.0-unified',
                    optimization: 'Wave 1 완료'
                }
            };

            // 데이터베이스에 저장
            await this.db.addProject(projectInfo);

            // 프로젝트 정보 파일 저장
            await fs.writeFile(
                path.join(projectDir, 'project.json'),
                JSON.stringify(projectInfo, null, 2)
            );

            // 환경 변수 파일 생성
            const envFile = Object.entries(envConfig)
                .map(([key, value]) => `${key}="${value}"`)
                .join('\n');
            
            await fs.writeFile(path.join(projectDir, '.env'), envFile);
            await fs.writeFile(path.join(projectDir, '.env.local'), envFile);

            console.log(`✅ [프로젝트 생성 완료] ${name}`);
            console.log(`📊 [프로젝트 정보] DB포트: ${ports.db}, Redis포트: ${ports.redis}, 앱포트: ${ports.app}`);

            return {
                success: true,
                project: projectInfo,
                message: `프로젝트 '${name}' 생성 완료`,
                nextSteps: [
                    '앱 컨테이너 배포를 위해 Git 저장소를 설정하세요',
                    'POST /api/projects/:name/deploy로 앱을 배포하세요',
                    `http://${UTILS.getServerIP()}:${ports.app}에서 앱에 접근할 수 있습니다`
                ]
            };

        } catch (error) {
            console.error(`❌ [프로젝트 생성 실패] ${name}:`, error.message);
            
            // 실패 시 정리 작업
            await this.cleanupFailedProject(name);
            
            throw error;
        }
    }

    // 📋 프로젝트 목록 조회
    async listProjects(includeDeleted = false) {
        try {
            const projects = await this.db.loadDB();
            
            let filtered = projects;
            if (!includeDeleted) {
                filtered = projects.filter(p => !p.deleted);
            }

            // 컨테이너 상태 확인
            const projectsWithStatus = await Promise.all(
                filtered.map(async (project) => {
                    const containerStatus = await this.podman.getProjectContainerStatus(project.name);
                    
                    return {
                        name: project.name,
                        template: project.template,
                        created: project.metadata?.created || project.created,
                        status: project.status,
                        ports: project.ports,
                        containers: containerStatus,
                        deleted: project.deleted || false,
                        url: project.ports ? `http://${UTILS.getServerIP()}:${project.ports.app}` : null
                    };
                })
            );

            console.log(`📋 [프로젝트 목록] ${projectsWithStatus.length}개 프로젝트 조회`);
            return projectsWithStatus;

        } catch (error) {
            console.error('❌ [프로젝트 목록 조회 실패]:', error);
            throw error;
        }
    }

    // 🔍 프로젝트 상세 조회
    async getProject(name) {
        try {
            const project = await this.db.findProject(name);
            if (!project) {
                throw new Error(`프로젝트 '${name}'을 찾을 수 없습니다`);
            }

            if (project.deleted) {
                throw new Error(`프로젝트 '${name}'은 삭제된 상태입니다`);
            }

            // 컨테이너 상태 확인
            const containerStatus = await this.podman.getProjectContainerStatus(name);

            // 실시간 정보 추가
            const detailedProject = {
                ...project,
                containers: {
                    ...project.containers,
                    status: containerStatus
                },
                urls: {
                    app: `http://${UTILS.getServerIP()}:${project.ports.app}`,
                    health: `http://${UTILS.getServerIP()}:${project.ports.app}/health`,
                    api: `http://${UTILS.getServerIP()}:${project.ports.app}/api`
                },
                system: {
                    uptime: process.uptime(),
                    version: '3.6.0-unified',
                    optimization: 'Wave 1 완료'
                }
            };

            console.log(`🔍 [프로젝트 조회] ${name} - 상태: ${project.status}`);
            return detailedProject;

        } catch (error) {
            console.error(`❌ [프로젝트 조회 실패] ${name}:`, error.message);
            throw error;
        }
    }

    // 🗑️ 프로젝트 삭제
    async deleteProject(name, permanent = false) {
        try {
            const project = await this.db.findProject(name);
            if (!project) {
                throw new Error(`프로젝트 '${name}'을 찾을 수 없습니다`);
            }

            console.log(`🗑️ [프로젝트 삭제 시작] ${name} (영구삭제: ${permanent})`);

            // 컨테이너 중지 및 제거
            if (project.containers) {
                for (const containerName of Object.values(project.containers)) {
                    await this.podman.stopContainer(containerName, false);
                    await this.podman.removeContainer(containerName, false);
                }
            }

            // 포트 해제
            if (project.ports) {
                this.podman.releasePort('db', project.ports.db);
                this.podman.releasePort('redis', project.ports.redis);
                this.podman.releasePort('app', project.ports.app);
            }

            if (permanent) {
                // 영구 삭제: 디렉토리도 삭제
                const projectDir = path.join(CONFIG.baseDir, name);
                const storageDir = path.join(CONFIG.storageDir, name);
                
                await fs.rm(projectDir, { recursive: true, force: true });
                await fs.rm(storageDir, { recursive: true, force: true });
                
                // DB에서 완전 제거
                const projects = await this.db.loadDB();
                const filtered = projects.filter(p => p.name !== name);
                await this.db.saveDB(filtered);
                
                console.log(`🗑️ [영구 삭제 완료] ${name}`);
            } else {
                // 소프트 삭제: 복구 가능
                await this.db.deleteProject(name);
                console.log(`🗑️ [소프트 삭제 완료] ${name} (복구 가능)`);
            }

            return {
                success: true,
                project: name,
                deleted: permanent ? 'permanent' : 'soft',
                message: `프로젝트 '${name}' 삭제 완료`
            };

        } catch (error) {
            console.error(`❌ [프로젝트 삭제 실패] ${name}:`, error.message);
            throw error;
        }
    }

    // 🔧 실패한 프로젝트 정리
    async cleanupFailedProject(name) {
        try {
            console.log(`🔧 [실패 프로젝트 정리] ${name}`);
            
            // 생성된 컨테이너들 정리
            const containerNames = [
                `${CONFIG.dbPrefix}${name}`,
                `${CONFIG.redisPrefix}${name}`,
                `${CONFIG.appPrefix}${name}`
            ];

            for (const containerName of containerNames) {
                await this.podman.stopContainer(containerName, false);
                await this.podman.removeContainer(containerName, false);
            }

            // 생성된 디렉토리 정리
            const projectDir = path.join(CONFIG.baseDir, name);
            const storageDir = path.join(CONFIG.storageDir, name);
            
            await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
            await fs.rm(storageDir, { recursive: true, force: true }).catch(() => {});

            console.log(`🔧 [정리 완료] ${name}`);
        } catch (error) {
            console.warn(`⚠️ [정리 경고] ${name}: ${error.message}`);
        }
    }

    // 📊 프로젝트 통계
    async getProjectStats() {
        try {
            const dbStats = await this.db.getStats();
            const podmanStats = await this.podman.getStats();

            return {
                projects: dbStats,
                containers: podmanStats,
                system: {
                    version: '3.6.0-unified',
                    optimization: 'Wave 1 완료',
                    uptime: process.uptime(),
                    memory: process.memoryUsage()
                }
            };
        } catch (error) {
            console.error('❌ [통계 조회 실패]:', error);
            throw error;
        }
    }
}

// 싱글톤 인스턴스
let projectServiceInstance = null;

function getProjectService() {
    if (!projectServiceInstance) {
        projectServiceInstance = new ProjectService();
    }
    return projectServiceInstance;
}

module.exports = {
    ProjectService,
    getProjectService
};