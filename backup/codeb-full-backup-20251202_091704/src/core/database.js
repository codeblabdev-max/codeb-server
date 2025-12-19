/**
 * CodeB JSON DB 추상화
 * Wave 1 최적화: 중복된 loadDB/saveDB 함수들을 하나로 통합
 */

const fs = require('fs').promises;
const path = require('path');
const { CONFIG, UTILS } = require('./config');

class CodeBDatabase {
    constructor() {
        this.dbPath = path.join(CONFIG.baseDir, 'codeb-database.json');
        this.backupPath = path.join(CONFIG.backupDir, 'database-backups');
        this.cache = new Map();
        this.isLoaded = false;
    }

    // 📖 데이터베이스 로드
    async loadDB() {
        try {
            if (this.isLoaded && this.cache.has('projects')) {
                return this.cache.get('projects');
            }

            const data = await fs.readFile(this.dbPath, 'utf-8');
            const db = JSON.parse(data);
            
            // 캐시에 저장
            this.cache.set('projects', db.projects || []);
            this.cache.set('metadata', db.metadata || {});
            this.isLoaded = true;
            
            console.log(`📖 [DB 로드] ${db.projects?.length || 0}개 프로젝트 로드 완료`);
            return this.cache.get('projects');
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('📝 [DB 생성] 새로운 데이터베이스 파일 생성');
                const emptyDB = {
                    projects: [],
                    metadata: {
                        created: new Date().toISOString(),
                        version: '3.6.0-unified',
                        optimization: 'Wave 1 완료'
                    }
                };
                await this.saveDB(emptyDB.projects);
                return emptyDB.projects;
            }
            
            console.error('❌ [DB 로드 실패]', error);
            throw error;
        }
    }

    // 💾 데이터베이스 저장
    async saveDB(projects, createBackup = true) {
        try {
            // 백업 생성
            if (createBackup && await this.dbExists()) {
                await this.createBackup();
            }

            const db = {
                projects: projects || [],
                metadata: {
                    lastUpdated: new Date().toISOString(),
                    version: '3.6.0-unified',
                    optimization: 'Wave 1 완료',
                    totalProjects: (projects || []).length
                }
            };

            await fs.writeFile(this.dbPath, JSON.stringify(db, null, 2));
            
            // 캐시 업데이트
            this.cache.set('projects', db.projects);
            this.cache.set('metadata', db.metadata);
            
            console.log(`💾 [DB 저장] ${db.projects.length}개 프로젝트 저장 완료`);
            return true;
            
        } catch (error) {
            console.error('❌ [DB 저장 실패]', error);
            throw error;
        }
    }

    // 🔍 프로젝트 찾기
    async findProject(name) {
        const projects = await this.loadDB();
        return projects.find(project => project.name === name);
    }

    // ➕ 프로젝트 추가
    async addProject(projectData) {
        const projects = await this.loadDB();
        
        // 중복 확인
        if (projects.find(p => p.name === projectData.name)) {
            throw new Error(`프로젝트 '${projectData.name}'이 이미 존재합니다`);
        }

        projects.push({
            ...projectData,
            id: UTILS.generatePassword(8),
            created: new Date().toISOString(),
            version: '3.6.0-unified'
        });

        await this.saveDB(projects);
        console.log(`✅ [프로젝트 추가] ${projectData.name} 추가 완료`);
        return projects[projects.length - 1];
    }

    // 🔄 프로젝트 업데이트
    async updateProject(name, updates) {
        const projects = await this.loadDB();
        const index = projects.findIndex(p => p.name === name);
        
        if (index === -1) {
            throw new Error(`프로젝트 '${name}'을 찾을 수 없습니다`);
        }

        projects[index] = {
            ...projects[index],
            ...updates,
            lastUpdated: new Date().toISOString()
        };

        await this.saveDB(projects);
        console.log(`🔄 [프로젝트 업데이트] ${name} 업데이트 완료`);
        return projects[index];
    }

    // 🗑️ 프로젝트 삭제 (소프트 삭제)
    async deleteProject(name) {
        const projects = await this.loadDB();
        const index = projects.findIndex(p => p.name === name);
        
        if (index === -1) {
            throw new Error(`프로젝트 '${name}'을 찾을 수 없습니다`);
        }

        // 소프트 삭제 (deleted 플래그 추가)
        projects[index].deleted = true;
        projects[index].deletedAt = new Date().toISOString();

        await this.saveDB(projects);
        console.log(`🗑️ [프로젝트 삭제] ${name} 삭제 완료 (복구 가능)`);
        return projects[index];
    }

    // 💿 백업 생성
    async createBackup() {
        try {
            await fs.mkdir(this.backupPath, { recursive: true });
            
            const timestamp = UTILS.getTimestamp();
            const backupFile = path.join(this.backupPath, `database_${timestamp}.backup`);
            
            await fs.copyFile(this.dbPath, backupFile);
            console.log(`💿 [DB 백업] 백업 파일 생성: ${backupFile}`);
            
            return backupFile;
        } catch (error) {
            console.error('❌ [백업 생성 실패]', error);
            throw error;
        }
    }

    // 📋 데이터베이스 존재 확인
    async dbExists() {
        try {
            await fs.access(this.dbPath);
            return true;
        } catch {
            return false;
        }
    }

    // 📊 통계 정보
    async getStats() {
        const projects = await this.loadDB();
        const metadata = this.cache.get('metadata') || {};
        
        return {
            totalProjects: projects.length,
            activeProjects: projects.filter(p => !p.deleted).length,
            deletedProjects: projects.filter(p => p.deleted).length,
            lastUpdated: metadata.lastUpdated,
            version: metadata.version,
            optimization: metadata.optimization
        };
    }
}

// 싱글톤 인스턴스
let dbInstance = null;

function getDatabase() {
    if (!dbInstance) {
        dbInstance = new CodeBDatabase();
    }
    return dbInstance;
}

module.exports = {
    CodeBDatabase,
    getDatabase
};