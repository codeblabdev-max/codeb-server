#!/usr/bin/env node

/**
 * 🛡️ 보안 배포 API Gateway
 * SSH 없이 HTTP API로 배포 관리
 */

const express = require('express');
const axios = require('axios');
const app = express();
const port = 3000;

app.use(express.json());

// 환경 변수
const PDNS_API_KEY = process.env.PDNS_API_KEY;
const COOLIFY_API_TOKEN = process.env.COOLIFY_API_TOKEN;
const SERVER_IP = '141.164.60.51';

// 🔐 토큰 기반 인증
const validateToken = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token || token !== process.env.DEPLOY_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// 📊 서버 상태 확인
app.get('/api/status', validateToken, async (req, res) => {
    try {
        // PowerDNS 상태 확인
        const pdnsResponse = await axios.get(`http://${SERVER_IP}:8081/api/v1/servers`, {
            headers: { 'X-API-Key': PDNS_API_KEY }
        });
        
        // Coolify 상태 확인
        const coolifyResponse = await axios.get(`http://${SERVER_IP}:8000/api/v1/projects`, {
            headers: { 'Authorization': `Bearer ${COOLIFY_API_TOKEN}` }
        });

        res.json({
            status: 'healthy',
            pdns: pdnsResponse.status === 200,
            coolify: coolifyResponse.status === 200,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Service check failed',
            details: error.message 
        });
    }
});

// 🌐 DNS 레코드 생성
app.post('/api/dns/create', validateToken, async (req, res) => {
    const { zone, name, type, content } = req.body;
    
    try {
        const response = await axios.patch(`http://${SERVER_IP}:8081/api/v1/servers/localhost/zones/${zone}`, {
            rrsets: [{
                name: name,
                type: type,
                records: [{ content: content, disabled: false }]
            }]
        }, {
            headers: { 'X-API-Key': PDNS_API_KEY }
        });

        res.json({
            success: true,
            message: `DNS record created: ${name} → ${content}`,
            data: response.data
        });
    } catch (error) {
        res.status(500).json({
            error: 'DNS record creation failed',
            details: error.response?.data || error.message
        });
    }
});

// 🚀 프로젝트 배포
app.post('/api/deploy', validateToken, async (req, res) => {
    const { 
        name, 
        domain, 
        type = 'docker-compose',
        repo,
        ssl = false 
    } = req.body;

    try {
        // 1. DNS 레코드 생성
        await axios.patch(`http://${SERVER_IP}:8081/api/v1/servers/localhost/zones/one-q.kr`, {
            rrsets: [{
                name: domain,
                type: 'A',
                records: [{ content: SERVER_IP, disabled: false }]
            }]
        }, {
            headers: { 'X-API-Key': PDNS_API_KEY }
        });

        // 2. Coolify 프로젝트 생성
        const projectData = {
            name: name,
            description: `Auto-deployed project: ${name}`,
            environment_id: 1 // 기본 환경
        };

        const projectResponse = await axios.post(`http://${SERVER_IP}:8000/api/v1/projects`, 
            projectData, {
            headers: { 'Authorization': `Bearer ${COOLIFY_API_TOKEN}` }
        });

        res.json({
            success: true,
            message: `Project deployed successfully`,
            data: {
                name: name,
                domain: domain,
                project_id: projectResponse.data.uuid,
                url: `http${ssl ? 's' : ''}://${domain}`
            }
        });

    } catch (error) {
        res.status(500).json({
            error: 'Deployment failed',
            details: error.response?.data || error.message
        });
    }
});

// 📋 배포된 프로젝트 목록
app.get('/api/projects', validateToken, async (req, res) => {
    try {
        const response = await axios.get(`http://${SERVER_IP}:8000/api/v1/projects`, {
            headers: { 'Authorization': `Bearer ${COOLIFY_API_TOKEN}` }
        });

        res.json({
            success: true,
            projects: response.data.data || []
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch projects',
            details: error.message
        });
    }
});

app.listen(port, () => {
    console.log(`🛡️ Secure Deployment API running on http://localhost:${port}`);
    console.log(`📖 Endpoints:`);
    console.log(`   GET  /api/status    - 서버 상태 확인`);
    console.log(`   POST /api/dns/create - DNS 레코드 생성`);
    console.log(`   POST /api/deploy     - 프로젝트 배포`);
    console.log(`   GET  /api/projects   - 프로젝트 목록`);
});