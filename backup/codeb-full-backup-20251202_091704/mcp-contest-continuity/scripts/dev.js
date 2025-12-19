#!/usr/bin/env node

/**
 * Development script for MCP Contest Continuity Server
 * 
 * Provides development utilities and testing capabilities
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const commands = {
  build: {
    description: 'Build the TypeScript project',
    command: 'npx',
    args: ['tsc']
  },
  start: {
    description: 'Start the MCP server',
    command: 'node',
    args: ['dist/index.js']
  },
  dev: {
    description: 'Build and start in development mode',
    command: 'build_and_start'
  },
  clean: {
    description: 'Clean build artifacts',
    command: 'clean_build'
  },
  test: {
    description: 'Test MCP server functionality',
    command: 'test_server'
  }
};

async function runCommand(cmd, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      cwd: projectRoot,
      ...options
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
    
    child.on('error', reject);
  });
}

async function buildProject() {
  console.log('🔨 Building TypeScript project...');
  try {
    await runCommand('npx', ['tsc']);
    console.log('✅ Build completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    return false;
  }
}

async function startServer() {
  console.log('🚀 Starting MCP server...');
  try {
    await runCommand('node', ['dist/index.js']);
  } catch (error) {
    console.error('❌ Server failed to start:', error.message);
  }
}

async function buildAndStart() {
  const buildSuccess = await buildProject();
  if (buildSuccess) {
    await startServer();
  }
}

async function cleanBuild() {
  console.log('🧹 Cleaning build artifacts...');
  try {
    await fs.rm(join(projectRoot, 'dist'), { recursive: true, force: true });
    console.log('✅ Clean completed');
  } catch (error) {
    console.error('❌ Clean failed:', error.message);
  }
}

async function testServer() {
  console.log('🧪 Testing MCP server...');
  
  // Basic connectivity test
  console.log('Testing basic MCP server setup...');
  
  try {
    // Check if TypeScript files exist
    const srcExists = await fs.access(join(projectRoot, 'src')).then(() => true).catch(() => false);
    if (!srcExists) {
      throw new Error('Source directory not found');
    }
    
    // Check if package.json has MCP configuration
    const packageJson = JSON.parse(await fs.readFile(join(projectRoot, 'package.json'), 'utf-8'));
    if (!packageJson.mcp) {
      throw new Error('MCP configuration not found in package.json');
    }
    
    console.log('✅ MCP configuration validated');
    
    // Test build
    const buildSuccess = await buildProject();
    if (!buildSuccess) {
      throw new Error('Build test failed');
    }
    
    console.log('✅ All tests passed');
    
  } catch (error) {
    console.error('❌ Tests failed:', error.message);
  }
}

async function showHelp() {
  console.log('🏆 MCP Contest Continuity Server - Development Tools\n');
  console.log('Available commands:');
  
  Object.entries(commands).forEach(([name, config]) => {
    console.log(`  ${name.padEnd(10)} - ${config.description}`);
  });
  
  console.log('\nUsage:');
  console.log('  node scripts/dev.js <command>');
  console.log('  npm run dev:<command>');
}

// Main execution
const command = process.argv[2];

if (!command || command === 'help') {
  await showHelp();
} else if (commands[command]) {
  switch (command) {
    case 'build':
      await buildProject();
      break;
    case 'start':
      await startServer();
      break;
    case 'dev':
      await buildAndStart();
      break;
    case 'clean':
      await cleanBuild();
      break;
    case 'test':
      await testServer();
      break;
    default:
      console.log(`Unknown command: ${command}`);
      await showHelp();
  }
} else {
  console.log(`Unknown command: ${command}`);
  await showHelp();
}