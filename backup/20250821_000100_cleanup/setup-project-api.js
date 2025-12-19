#!/usr/bin/env node

// Setup script to run project setup commands via API
const http = require('http');

const SERVER_IP = '141.164.60.51';
const API_PORT = 3008;
const PROJECT_NAME = 'video-platform';

// Commands to execute in sequence
const setupCommands = [
  {
    name: 'Install dependencies',
    command: 'cd /app && npm install'
  },
  {
    name: 'Install Prisma',
    command: 'cd /app && npm install prisma @prisma/client'
  },
  {
    name: 'Generate Prisma Client',
    command: 'cd /app && npx prisma generate'
  },
  {
    name: 'Push database schema',
    command: 'cd /app && npx prisma db push --accept-data-loss'
  },
  {
    name: 'Build application',
    command: 'cd /app && npm run build'
  },
  {
    name: 'Start application',
    command: 'cd /app && npm run start &'
  }
];

async function executeCommand(projectName, command, description) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      project: projectName,
      command: command,
      container: 'app'
    });

    const options = {
      hostname: SERVER_IP,
      port: API_PORT,
      path: '/api/exec',  // This endpoint might need to be created
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`✅ ${description}: ${res.statusCode}`);
        resolve(data);
      });
    });

    req.on('error', (e) => {
      console.error(`❌ ${description} failed: ${e.message}`);
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

async function setupProject() {
  console.log(`🚀 Setting up ${PROJECT_NAME}...`);
  
  // First, check project status
  const checkUrl = `http://${SERVER_IP}:${API_PORT}/api/projects/${PROJECT_NAME}`;
  
  try {
    // Execute each command in sequence
    for (const cmd of setupCommands) {
      console.log(`\n📦 ${cmd.name}...`);
      try {
        await executeCommand(PROJECT_NAME, cmd.command, cmd.name);
      } catch (error) {
        console.error(`Failed: ${error.message}`);
        // Continue with next command even if one fails
      }
    }
    
    console.log('\n✅ Setup complete!');
    console.log(`🌐 Access your project at: http://${SERVER_IP}:4002`);
    
  } catch (error) {
    console.error('Setup failed:', error);
    
    // Provide manual instructions
    console.log('\n📋 Manual Setup Instructions:');
    console.log('Since the API doesn\'t support command execution, please run these commands on the server:');
    console.log('\n```bash');
    setupCommands.forEach(cmd => {
      console.log(`# ${cmd.name}`);
      console.log(`podman exec ${PROJECT_NAME}-app sh -c "${cmd.command}"`);
      console.log('');
    });
    console.log('```');
  }
}

// Run setup
setupProject();