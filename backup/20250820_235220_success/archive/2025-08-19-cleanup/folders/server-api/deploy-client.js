#!/usr/bin/env node

/**
 * 🚀 간단한 배포 클라이언트
 * 로컬에서 서버 API를 호출하여 프로젝트 배포
 */

const axios = require('axios');
const readline = require('readline');

// 설정
const API_BASE = process.env.DEPLOY_API_URL || 'http://localhost:3001/api';

// CLI 인터페이스
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// 색상 코드
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

const log = (color, message) => {
    console.log(`${colors[color]}${message}${colors.reset}`);
};

// 메인 메뉴
async function showMainMenu() {
    console.log(`\n${colors.bold}🚀 Deployment Server Client${colors.reset}`);
    console.log('1. 새 프로젝트 배포');
    console.log('2. 프로젝트 목록 보기');  
    console.log('3. 서버 상태 확인');
    console.log('4. DNS 레코드 추가');
    console.log('5. 프로젝트 삭제');
    console.log('0. 종료');
    
    return new Promise((resolve) => {
        rl.question('\n선택하세요 (0-5): ', resolve);
    });
}

// 1. 새 프로젝트 배포
async function deployProject() {
    log('blue', '\n🚀 새 프로젝트 배포');
    
    const projectName = await askQuestion('프로젝트 이름: ');
    const domain = await askQuestion(`도메인 (엔터: ${projectName}.one-q.xyz): `) || `${projectName}.one-q.xyz`;
    const gitRepo = await askQuestion('Git 저장소 URL (선택사항): ');
    
    // 추가 서비스 선택
    log('yellow', '\n추가 서비스를 선택하세요 (여러 개 선택시 쉼표로 구분):');
    console.log('1. PostgreSQL');
    console.log('2. Redis');
    console.log('3. MySQL');
    console.log('4. 없음');
    
    const servicesChoice = await askQuestion('서비스 선택 (1,2,3 또는 4): ');
    const services = parseServiceChoice(servicesChoice);
    
    const deployData = {
        projectName,
        domain,
        services,
        ...(gitRepo && { gitRepository: gitRepo })
    };
    
    log('yellow', '\n배포 중...');
    
    try {
        const response = await axios.post(`${API_BASE}/deploy`, deployData);
        const result = response.data;
        
        log('green', '\n✅ 배포 성공!');
        console.log(`📝 프로젝트: ${result.projectName}`);
        console.log(`🌐 URL: ${result.url}`);
        console.log(`📋 배포 ID: ${result.deploymentId}`);
        
        if (result.services.length > 0) {
            log('blue', '\n배포된 서비스:');
            result.services.forEach(service => {
                console.log(`  - ${service.name} (${service.type}): ${service.container}`);
            });
        }
        
        log('yellow', `\n⏳ DNS 전파까지 1-2분 정도 소요될 수 있습니다.`);
        
    } catch (error) {
        log('red', '\n❌ 배포 실패');
        console.error(error.response?.data?.details || error.message);
    }
}

// 2. 프로젝트 목록 보기
async function listProjects() {
    log('blue', '\n📋 프로젝트 목록');
    
    try {
        const response = await axios.get(`${API_BASE}/projects`);
        const result = response.data;
        
        if (result.success) {
            log('green', '\n실행 중인 컨테이너:');
            result.containers.forEach(container => {
                if (container.trim()) {
                    console.log(`  ${container}`);
                }
            });
            
            if (result.dns && result.dns.length > 0) {
                log('blue', '\nDNS 레코드:');
                result.dns.forEach(record => {
                    if (record.type === 'A') {
                        console.log(`  ${record.name} -> ${record.records[0]?.content}`);
                    }
                });
            }
        }
        
    } catch (error) {
        log('red', '\n❌ 목록 조회 실패');
        console.error(error.response?.data?.details || error.message);
    }
}

// 3. 서버 상태 확인
async function checkHealth() {
    log('blue', '\n🏥 서버 상태 확인');
    
    try {
        const response = await axios.get(`${API_BASE}/health`);
        const health = response.data;
        
        log('green', `\n상태: ${health.status}`);
        console.log(`시간: ${health.timestamp}`);
        
        log('blue', '\n서비스 상태:');
        Object.entries(health.services).forEach(([service, status]) => {
            const statusColor = status ? 'green' : 'red';
            const statusText = status ? '✅' : '❌';
            log(statusColor, `  ${service}: ${statusText}`);
        });
        
    } catch (error) {
        log('red', '\n❌ 서버 연결 실패');
        console.error('API 서버가 실행 중인지 확인하세요.');
        console.error(`URL: ${API_BASE}`);
    }
}

// 4. DNS 레코드 추가
async function addDNSRecord() {
    log('blue', '\n🌐 DNS 레코드 추가');
    
    const name = await askQuestion('레코드 이름: ');
    const type = await askQuestion('레코드 타입 (A/CNAME) [A]: ') || 'A';
    const content = await askQuestion('레코드 값: ');
    const ttl = await askQuestion('TTL [300]: ') || 300;
    
    try {
        const response = await axios.post(`${API_BASE}/dns/records`, {
            name,
            type: type.toUpperCase(),
            content,
            ttl: parseInt(ttl)
        });
        
        if (response.data.success) {
            log('green', '\n✅ DNS 레코드 생성 완료');
            console.log(`${name}.one-q.xyz -> ${content}`);
        }
        
    } catch (error) {
        log('red', '\n❌ DNS 레코드 생성 실패');
        console.error(error.response?.data?.details || error.message);
    }
}

// 5. 프로젝트 삭제
async function deleteProject() {
    log('blue', '\n🗑️ 프로젝트 삭제');
    
    const projectName = await askQuestion('삭제할 프로젝트 이름: ');
    const removeDNS = await askQuestion('DNS 레코드도 삭제하시겠습니까? (y/N): ');
    
    const confirmDelete = await askQuestion(`정말로 "${projectName}"을 삭제하시겠습니까? (y/N): `);
    
    if (confirmDelete.toLowerCase() !== 'y') {
        log('yellow', '삭제가 취소되었습니다.');
        return;
    }
    
    try {
        const response = await axios.delete(`${API_BASE}/projects/${projectName}`, {
            params: { removeDNS: removeDNS.toLowerCase() === 'y' }
        });
        
        if (response.data.success) {
            log('green', '\n✅ 프로젝트 삭제 완료');
            console.log(response.data.message);
        }
        
    } catch (error) {
        log('red', '\n❌ 프로젝트 삭제 실패');
        console.error(error.response?.data?.details || error.message);
    }
}

// 유틸리티 함수들
function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

function parseServiceChoice(choice) {
    const services = [];
    const choices = choice.split(',').map(c => c.trim());
    
    choices.forEach(c => {
        switch(c) {
            case '1':
                services.push({ name: 'db', type: 'postgresql', options: {} });
                break;
            case '2':
                services.push({ name: 'cache', type: 'redis', options: {} });
                break;
            case '3':
                services.push({ name: 'db', type: 'mysql', options: {} });
                break;
        }
    });
    
    return services;
}

// 메인 실행 함수
async function main() {
    // 명령줄 인수 처리
    const args = process.argv.slice(2);
    if (args.length > 0) {
        await handleCommand(args);
        process.exit(0);
    }
    
    // 대화형 모드
    while (true) {
        const choice = await showMainMenu();
        
        switch(choice) {
            case '1':
                await deployProject();
                break;
            case '2':
                await listProjects();
                break;
            case '3':
                await checkHealth();
                break;
            case '4':
                await addDNSRecord();
                break;
            case '5':
                await deleteProject();
                break;
            case '0':
                log('green', '\n👋 안녕히 가세요!');
                rl.close();
                process.exit(0);
            default:
                log('red', '잘못된 선택입니다.');
        }
        
        await new Promise(resolve => {
            rl.question('\nEnter를 눌러 계속...', resolve);
        });
    }
}

// 명령줄 모드 처리
async function handleCommand(args) {
    const command = args[0];
    
    switch(command) {
        case 'deploy':
            if (args.length < 2) {
                console.log('사용법: node deploy-client.js deploy <project-name> [domain]');
                return;
            }
            
            const deployData = {
                projectName: args[1],
                domain: args[2] || `${args[1]}.one-q.xyz`,
                services: []
            };
            
            try {
                const response = await axios.post(`${API_BASE}/deploy`, deployData);
                log('green', '✅ 배포 완료!');
                console.log(`🌐 ${response.data.url}`);
            } catch (error) {
                log('red', '❌ 배포 실패');
                console.error(error.response?.data?.details || error.message);
            }
            break;
            
        case 'list':
            await listProjects();
            break;
            
        case 'health':
            await checkHealth();
            break;
            
        default:
            console.log('사용 가능한 명령어:');
            console.log('  deploy <name> [domain] - 프로젝트 배포');
            console.log('  list                   - 프로젝트 목록');
            console.log('  health                 - 서버 상태');
            console.log('');
            console.log('대화형 모드: node deploy-client.js');
    }
}

// 오류 처리
process.on('unhandledRejection', (error) => {
    log('red', '❌ 예상치 못한 오류 발생');
    console.error(error);
    process.exit(1);
});

// 실행
main().catch(console.error);