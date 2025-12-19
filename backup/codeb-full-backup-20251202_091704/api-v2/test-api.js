#!/usr/bin/env node

/**
 * CodeB API v2 Test Suite
 * Basic functionality tests for the API server
 */

const http = require('http');

const API_URL = 'http://localhost:3020';

// Test helper
async function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(API_URL + path, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Test suite
async function runTests() {
  console.log('🧪 CodeB API v2 Test Suite');
  console.log('============================\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Health check
  try {
    console.log('Test 1: Health check...');
    const res = await apiRequest('GET', '/health');

    if (res.status === 200 && res.data.status === 'healthy') {
      console.log('✅ PASS\n');
      passed++;
    } else {
      console.log('❌ FAIL: Unexpected response\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    failed++;
  }

  // Test 2: API info
  try {
    console.log('Test 2: API info...');
    const res = await apiRequest('GET', '/');

    if (res.status === 200 && res.data.name === 'CodeB API Server') {
      console.log('✅ PASS\n');
      passed++;
    } else {
      console.log('❌ FAIL: Unexpected response\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    failed++;
  }

  // Test 3: List projects (empty)
  try {
    console.log('Test 3: List projects...');
    const res = await apiRequest('GET', '/projects');

    if (res.status === 200 && Array.isArray(res.data.projects)) {
      console.log(`✅ PASS (${res.data.count} projects)\n`);
      passed++;
    } else {
      console.log('❌ FAIL: Unexpected response\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    failed++;
  }

  // Test 4: Port statistics
  try {
    console.log('Test 4: Port statistics...');
    const res = await apiRequest('GET', '/ports/stats');

    if (res.status === 200 && res.data.stats) {
      console.log('✅ PASS\n');
      console.log('Port usage:');
      for (const [type, stats] of Object.entries(res.data.stats)) {
        console.log(`  ${stats.name}: ${stats.used}/${stats.total} (${stats.utilization})`);
      }
      console.log();
      passed++;
    } else {
      console.log('❌ FAIL: Unexpected response\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    failed++;
  }

  // Test 5: Port allocation
  try {
    console.log('Test 5: Port allocation...');
    const res = await apiRequest('POST', '/ports/allocate', {
      projectName: 'test-project',
      services: ['app', 'postgres', 'redis']
    });

    if (res.status === 200 && res.data.ports) {
      console.log('✅ PASS');
      console.log('Allocated ports:', res.data.ports);
      console.log();
      passed++;
    } else {
      console.log('❌ FAIL: Unexpected response\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    failed++;
  }

  // Test 6: Check specific port
  try {
    console.log('Test 6: Check port availability...');
    const res = await apiRequest('GET', '/ports/check/9999');

    if (res.status === 200 && typeof res.data.available === 'boolean') {
      console.log(`✅ PASS (Port 9999 available: ${res.data.available})\n`);
      passed++;
    } else {
      console.log('❌ FAIL: Unexpected response\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    failed++;
  }

  // Summary
  console.log('============================');
  console.log(`Total tests: ${passed + failed}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('============================\n');

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
