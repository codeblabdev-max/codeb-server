#!/usr/bin/env node

/**
 * CodeB 간단한 데모 서버
 * 프로젝트 관리 웹 페이지 시뮬레이션용
 */

const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3010;

// 미들웨어
app.use(express.json());
app.use(cors());

// 웹 UI 정적 파일 서빙
app.use('/ui', express.static(path.join(__dirname, 'web-ui')));

// 메인 페이지 리다이렉트
app.get('/', (req, res) => {
    res.redirect('/ui/codeb-web-ui.html');
});

// 가상의 프로젝트 데이터
let projects = [
    {
        id: '1',
        name: 'demo-project',
        template: 'nextjs',
        status: 'running',
        created: new Date().toISOString(),
        ports: {
            app: 3001,
            db: 5433,
            redis: 6380
        },
        urls: {
            app: 'http://localhost:3001',
            admin: 'http://localhost:3001/admin'
        }
    },
    {
        id: '2',
        name: 'test-app',
        template: 'react',
        status: 'stopped',
        created: new Date(Date.now() - 86400000).toISOString(),
        ports: {
            app: 3002,
            db: 5434,
            redis: 6381
        },
        urls: {
            app: 'http://localhost:3002',
            admin: 'http://localhost:3002/admin'
        }
    }
];

// API 엔드포인트들

// 서버 정보
app.get('/api/info', (req, res) => {
    res.json({
        server: 'CodeB 데모 서버',
        version: '3.6.0-demo',
        status: 'running',
        timestamp: new Date().toISOString(),
        features: [
            '자동 프로젝트 생성',
            'Podman 컨테이너 관리',
            '포트 자동 할당',
            '관리 웹 인터페이스'
        ]
    });
});

// 프로젝트 목록 조회
app.get('/api/projects', (req, res) => {
    res.json({
        success: true,
        projects: projects,
        total: projects.length
    });
});

// 새 프로젝트 생성
app.post('/api/projects', (req, res) => {
    const { name, template = 'nextjs' } = req.body;

    if (!name) {
        return res.status(400).json({
            success: false,
            error: '프로젝트 이름이 필요합니다'
        });
    }

    // 중복 이름 확인
    if (projects.find(p => p.name === name)) {
        return res.status(409).json({
            success: false,
            error: '이미 존재하는 프로젝트 이름입니다'
        });
    }

    // 새 프로젝트 생성
    const newProject = {
        id: Date.now().toString(),
        name,
        template,
        status: 'creating',
        created: new Date().toISOString(),
        ports: {
            app: 3000 + projects.length + 1,
            db: 5432 + projects.length + 1,
            redis: 6379 + projects.length + 1
        }
    };

    // 실제로는 여기서 Podman 컨테이너를 생성하겠지만, 데모에서는 시뮬레이션
    setTimeout(() => {
        newProject.status = 'running';
        newProject.urls = {
            app: `http://localhost:${newProject.ports.app}`,
            admin: `http://localhost:${newProject.ports.app}/admin`
        };
    }, 2000);

    projects.push(newProject);

    res.json({
        success: true,
        project: newProject,
        message: `프로젝트 '${name}' 생성이 시작되었습니다`
    });
});

// 프로젝트 상세 조회
app.get('/api/projects/:name', (req, res) => {
    const project = projects.find(p => p.name === req.params.name);

    if (!project) {
        return res.status(404).json({
            success: false,
            error: '프로젝트를 찾을 수 없습니다'
        });
    }

    res.json({
        success: true,
        project: project
    });
});

// 프로젝트 삭제
app.delete('/api/projects/:name', (req, res) => {
    const index = projects.findIndex(p => p.name === req.params.name);

    if (index === -1) {
        return res.status(404).json({
            success: false,
            error: '프로젝트를 찾을 수 없습니다'
        });
    }

    const deletedProject = projects.splice(index, 1)[0];

    res.json({
        success: true,
        project: deletedProject.name,
        message: `프로젝트 '${deletedProject.name}' 삭제 완료`
    });
});

// 서버 통계
app.get('/api/stats', (req, res) => {
    const runningProjects = projects.filter(p => p.status === 'running').length;
    const stoppedProjects = projects.filter(p => p.status === 'stopped').length;

    res.json({
        success: true,
        stats: {
            totalProjects: projects.length,
            runningProjects,
            stoppedProjects,
            systemInfo: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                platform: process.platform,
                nodeVersion: process.version
            }
        }
    });
});

// 헬스체크
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// 404 핸들러
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'API 엔드포인트를 찾을 수 없습니다',
        path: req.originalUrl
    });
});

// 서버 시작
app.listen(PORT, () => {
    console.log('🚀 ===============================================');
    console.log('🚀 CodeB 데모 서버 시작 완료!');
    console.log('🚀 ===============================================');
    console.log(`🌐 웹 UI: http://localhost:${PORT}/ui/codeb-web-ui.html`);
    console.log(`🌐 메인 페이지: http://localhost:${PORT}/`);
    console.log(`📋 API 엔드포인트: http://localhost:${PORT}/api`);
    console.log(`🏥 헬스체크: http://localhost:${PORT}/health`);
    console.log(`📊 통계: http://localhost:${PORT}/api/stats`);
    console.log('🚀 ===============================================');
    console.log('📋 사용 가능한 API:');
    console.log('  GET  /api/projects      - 프로젝트 목록');
    console.log('  POST /api/projects      - 새 프로젝트 생성');
    console.log('  GET  /api/projects/:name - 프로젝트 상세');
    console.log('  DELETE /api/projects/:name - 프로젝트 삭제');
    console.log('  GET  /api/stats         - 서버 통계');
    console.log('🚀 ===============================================');
});

module.exports = app;