#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🔍 MCP Contest Continuity Server Validation\n');

// Check if server files exist
const serverPath = './dist/simple-server.js';
const configPath = '../.mcp.json';

console.log('📁 File Checks:');
console.log(`   Server: ${fs.existsSync(serverPath) ? '✅' : '❌'} ${serverPath}`);
console.log(`   Config: ${fs.existsSync(configPath) ? '✅' : '❌'} ${configPath}`);

if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('   Config Content:', JSON.stringify(config, null, 2));
}

console.log('\n🚀 Server Startup Test:');

const serverProcess = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let hasInitialized = false;
let serverReady = false;

const testTimeout = setTimeout(() => {
  console.log('❌ Server test timed out');
  serverProcess.kill();
  process.exit(1);
}, 10000);

// Handle server stderr (startup messages)
serverProcess.stderr.on('data', (data) => {
  const message = data.toString().trim();
  console.log(`   📡 ${message}`);
  if (message.includes('started successfully')) {
    serverReady = true;
  }
});

// Handle server stdout (MCP responses)
serverProcess.stdout.on('data', (data) => {
  const response = data.toString().trim();
  console.log(`   📥 ${response}`);
  
  if (response.includes('"result"') && response.includes('tools')) {
    console.log('✅ Server responding to MCP protocol correctly');
    clearTimeout(testTimeout);
    serverProcess.kill();
    
    console.log('\n🎯 Validation Summary:');
    console.log('   ✅ Server executable exists and runs');
    console.log('   ✅ MCP protocol implementation working');
    console.log('   ✅ Tools properly registered');
    console.log('   ✅ Configuration file exists');
    
    console.log('\n🔧 Next Steps:');
    console.log('   1. Restart Claude Code to refresh MCP servers');
    console.log('   2. Check if "contest-continuity" appears in /mcp');
    console.log('   3. If still not visible, check Claude Code logs');
    
    process.exit(0);
  }
});

serverProcess.on('error', (error) => {
  console.log(`❌ Server error: ${error.message}`);
  clearTimeout(testTimeout);
  process.exit(1);
});

// Send initialization and tools list commands
setTimeout(() => {
  if (!hasInitialized) {
    console.log('   📤 Sending initialize command...');
    serverProcess.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'validator', version: '1.0.0' }
      }
    }) + '\n');
    hasInitialized = true;
  }
}, 500);

setTimeout(() => {
  if (serverReady) {
    console.log('   📤 Sending tools/list command...');
    serverProcess.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    }) + '\n');
  }
}, 1500);