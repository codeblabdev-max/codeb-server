#!/usr/bin/env node

import { spawn } from 'child_process';

console.log('Testing MCP Contest Continuity Server...\n');

// Start the MCP server
const serverProcess = spawn('node', ['dist/simple-server.js'], {
  stdio: ['pipe', 'pipe', 'inherit']
});

// Test MCP protocol messages
const testMessages = [
  {
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  },
  {
    id: 2,
    method: 'tools/list',
    params: {}
  }
];

let messageIndex = 0;

function sendNextMessage() {
  if (messageIndex >= testMessages.length) {
    console.log('\n✅ All test messages sent successfully!');
    serverProcess.kill();
    process.exit(0);
    return;
  }

  const message = {
    jsonrpc: '2.0',
    ...testMessages[messageIndex]
  };

  console.log(`📤 Sending message ${messageIndex + 1}:`, JSON.stringify(message, null, 2));
  serverProcess.stdin.write(JSON.stringify(message) + '\n');
  messageIndex++;

  // Wait for response before sending next message
  setTimeout(sendNextMessage, 1000);
}

// Handle server output
serverProcess.stdout.on('data', (data) => {
  const response = data.toString().trim();
  if (response.startsWith('{')) {
    try {
      const parsed = JSON.parse(response);
      console.log('📥 Server response:', JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('📥 Server response:', response);
    }
  } else {
    console.log('📥 Server output:', response);
  }
});

serverProcess.on('error', (error) => {
  console.error('❌ Server error:', error);
  process.exit(1);
});

// Start the test after a brief delay
setTimeout(sendNextMessage, 500);