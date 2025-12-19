#!/usr/bin/env node

/**
 * CodeB Simple Management API
 * Based on existing Podman deployment patterns (warehouse-rental + vsvs)
 */

const http = require('http');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const PORT = process.env.PORT || 3020;
const PROJECTS_FILE = '/opt/codeb/projects.json';

// 🔧 Configuration based on existing patterns
const CONFIG = {
    ports: {
        db: { start: 5432, max: 100 },
        redis: { start: 6379, max: 100 },
        app: { start: 3000, max: 1000 }
    },
    network: 'codeb-network'
};

// 📦 In-memory project registry (will persist to file)
let projects = {};

// 🔍 Load existing Podman projects
async function discoverExistingProjects() {
    try {
        const { stdout } = await execAsync('podman ps -a --format json');
        const containers = JSON.parse(stdout);

        // Group containers by pod
        const podGroups = {};
        for (const container of containers) {
            const podName = container.Pod || 'standalone';
            if (!podGroups[podName]) podGroups[podName] = [];
            podGroups[podName].push(container);
        }

        // Register discovered projects
        for (const [podName, containers] of Object.entries(podGroups)) {
            if (podName === 'standalone') continue;

            const appContainer = containers.find(c => !c.Names.includes('postgres') && !c.Names.includes('redis'));
            if (!appContainer) continue;

            const projectName = podName.replace(/^pod_/, '').replace(/^pod-/, '');

            projects[projectName] = {
                name: projectName,
                pod: podName,
                containers: containers.map(c => ({
                    name: c.Names,
                    image: c.Image,
                    status: c.Status,
                    ports: c.Ports
                })),
                status: 'running',
                discoveredAt: new Date().toISOString()
            };
        }

        console.log(`✅ Discovered ${Object.keys(projects).length} existing projects`);
    } catch (error) {
        console.error('❌ Failed to discover projects:', error.message);
    }
}

// 🔢 Find next available port
function findNextPort(type, usedPorts = new Set()) {
    const config = CONFIG.ports[type];
    for (let i = 0; i < config.max; i++) {
        const port = config.start + i;
        if (!usedPorts.has(port)) {
            return port;
        }
    }
    throw new Error(`No available ports for ${type}`);
}

// 📊 Get all used ports
async function getUsedPorts() {
    const used = new Set();
    try {
        const { stdout } = await execAsync('podman ps -a --format "{{.Ports}}"');
        const portMappings = stdout.split('\n').filter(Boolean);

        for (const mapping of portMappings) {
            const matches = mapping.matchAll(/(\d+)->(\d+)/g);
            for (const match of matches) {
                used.add(parseInt(match[1])); // host port
            }
        }
    } catch (error) {
        console.error('Warning: Could not get used ports:', error.message);
    }
    return used;
}

// 🚀 HTTP Request Handler
async function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const method = req.method;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Routes
    if (path === '/health' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
        return;
    }

    if (path === '/projects' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            count: Object.keys(projects).length,
            projects: Object.values(projects)
        }));
        return;
    }

    if (path.startsWith('/projects/') && method === 'GET') {
        const projectName = path.split('/')[2];
        const project = projects[projectName];

        if (!project) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Project not found' }));
            return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, project }));
        return;
    }

    if (path === '/ports/allocate' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { projectName, services = ['app', 'postgres', 'redis'] } = JSON.parse(body);
                const usedPorts = await getUsedPorts();

                const allocation = {};
                if (services.includes('postgres')) allocation.postgres = findNextPort('db', usedPorts);
                if (services.includes('redis')) allocation.redis = findNextPort('redis', usedPorts);
                if (services.includes('app')) allocation.app = findNextPort('app', usedPorts);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    projectName,
                    ports: allocation
                }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
        return;
    }

    if (path === '/projects/register' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { name, pod, containers, ports } = JSON.parse(body);

                if (projects[name]) {
                    res.writeHead(409, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Project already exists' }));
                    return;
                }

                projects[name] = {
                    name,
                    pod,
                    containers,
                    ports,
                    status: 'registered',
                    registeredAt: new Date().toISOString()
                };

                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, project: projects[name] }));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
            }
        });
        return;
    }

    // 404 Not Found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Not found' }));
}

// 🏃 Start Server
async function startServer() {
    console.log('🚀 CodeB Simple Management API');
    console.log('================================');

    // Discover existing projects
    await discoverExistingProjects();

    // Create server
    const server = http.createServer(handleRequest);

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
        console.log(`📊 Managing ${Object.keys(projects).length} projects`);
        console.log('\nAvailable endpoints:');
        console.log('  GET  /health');
        console.log('  GET  /projects');
        console.log('  GET  /projects/:name');
        console.log('  POST /projects/register');
        console.log('  POST /ports/allocate');
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log('\n⏹️  Shutting down gracefully...');
        server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });
    });
}

// Run
startServer().catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});
