#!/usr/bin/env node

/**
 * CodeB 통합 API 서버 - Express 앱 & 공통 미들웨어
 * Wave 1 최적화: 3개 서버 → 1개 통합 서버
 */

const { json: expressJson, Router } = require('express');
const express = require('express');
const cors = require('cors');
const { CONFIG } = require('./config');

const app = express();

// 🔧 공통 미들웨어
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// 📊 요청 로깅 미들웨어
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`🌐 [${timestamp}] ${req.method} ${req.path}`);
    next();
});

// 🔐 API 키 인증 미들웨어
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        console.log(`🚨 [인증 실패] IP: ${req.ip}, Path: ${req.path}`);
        return res.status(401).json({ 
            error: 'Unauthorized',
            message: 'Valid API key required',
            timestamp: new Date().toISOString()
        });
    }
    next();
};

// ⚡ 성능 모니터링 미들웨어
app.use((req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        if (duration > 1000) {
            console.log(`⚠️ [느린 요청] ${req.method} ${req.path} - ${duration}ms`);
        }
    });
    
    next();
});

// 🔄 헬스 체크 엔드포인트
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        version: '3.6.0-unified',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        optimization: 'Wave 1 완료 - 중복 제거'
    });
});

// 📈 시스템 상태 엔드포인트
app.get('/status', authenticate, (req, res) => {
    res.json({
        server: 'CodeB 통합 서버',
        config: {
            baseDir: CONFIG.baseDir,
            network: CONFIG.network,
            maxProjects: CONFIG.maxProjects
        },
        performance: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage()
        }
    });
});

module.exports = { app, authenticate };