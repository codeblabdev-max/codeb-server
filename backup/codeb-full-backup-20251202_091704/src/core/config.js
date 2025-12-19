/**
 * CodeB 통합 설정 관리
 * Wave 1 최적화: 모든 서버의 설정을 하나로 통합
 */

const path = require('path');
const crypto = require('crypto');

// 🔧 통합 설정 객체
const CONFIG = Object.freeze({
    // 📁 디렉토리 설정
    baseDir: process.env.PROJECTS_DIR || '/opt/codeb-projects',
    storageDir: process.env.STORAGE_DIR || '/opt/codeb-storage',
    backupDir: process.env.BACKUP_DIR || '/opt/codeb-backups',

    // 🌐 네트워크 설정
    network: 'codeb-network',
    serverIP: process.env.SERVER_IP || '141.164.60.51',

    // 🏷️ 컨테이너 접두사
    dbPrefix: 'codeb-db-',
    redisPrefix: 'codeb-redis-',
    appPrefix: 'codeb-app-',
    storagePrefix: 'codeb-storage-',

    // 🔢 포트 범위 설정
    ports: {
        db: {
            start: 5432,
            max: 100
        },
        redis: {
            start: 6379,
            max: 100
        },
        app: {
            start: 3000,
            max: 1000
        }
    },

    // 📊 제한 설정
    maxProjects: 100,
    maxContainersPerProject: 10,

    // 🔐 보안 설정
    security: {
        saltRounds: 12,
        tokenExpiry: '24h',
        maxRequestSize: '10mb'
    },

    // ⚙️ 성능 설정
    performance: {
        connectionTimeout: 30000,
        requestTimeout: 60000,
        maxRetries: 3
    },

    // 📝 로깅 설정
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: 'combined',
        maxSize: '10m',
        maxFiles: 5
    }
});

// 🔑 유틸리티 함수들
const UTILS = Object.freeze({
    // 랜덤 패스워드 생성
    generatePassword(length = 16) {
        return crypto.randomBytes(length).toString('hex');
    },

    // 안전한 프로젝트 이름 검증
    validateProjectName(name) {
        return /^[a-z0-9-]{1,50}$/.test(name);
    },

    // 포트 범위 검증
    isValidPort(port, type) {
        const range = CONFIG.ports[type];
        if (!range) return false;
        return port >= range.start && port < (range.start + range.max);
    },

    // 서버 IP 가져오기
    getServerIP() {
        return CONFIG.serverIP;
    },

    // 타임스탬프 생성
    getTimestamp() {
        return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    },

    // 백업 파일명 생성
    generateBackupName(originalPath) {
        const timestamp = this.getTimestamp();
        const parsed = path.parse(originalPath);
        return path.join(parsed.dir, `${parsed.name}_${timestamp}.backup`);
    }
});

// 🏃‍♂️ 초기화 함수
async function initializeConfig() {
    const fs = require('fs').promises;

    try {
        // 필요한 디렉토리들 생성
        await fs.mkdir(CONFIG.baseDir, { recursive: true });
        await fs.mkdir(CONFIG.storageDir, { recursive: true });
        await fs.mkdir(CONFIG.backupDir, { recursive: true });

        console.log('✅ [설정 초기화] 모든 디렉토리가 생성되었습니다');
        return true;
    } catch (error) {
        console.error('❌ [설정 초기화 실패]', error);
        return false;
    }
}

module.exports = {
    CONFIG,
    UTILS,
    initializeConfig
};
