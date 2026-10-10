#!/usr/bin/env node

/**
 * Performance Testing Script
 * Tests API endpoints for performance and response times
 */

import { performance } from 'perf_hooks';

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

async function testEndpoint(name, url, method = 'GET', body = null) {
  const start = performance.now();
  
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    const duration = performance.now() - start;
    
    const success = response.ok;
    const status = response.status;
    
    return {
      name,
      url,
      method,
      duration,
      success,
      status,
    };
  } catch (error) {
    const duration = performance.now() - start;
    return {
      name,
      url,
      method,
      duration,
      success: false,
      status: 'ERROR',
      error: error.message,
    };
  }
}

function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function checkPerformanceThreshold(duration, threshold) {
  return duration < threshold;
}

async function runPerformanceTests(apiUrl) {
  log('SCCPMS Performance Testing', 'blue');
  log('==========================', 'blue');
  log(`Testing API: ${apiUrl}`, 'blue');
  
  const tests = [
    { name: 'Health Check', url: `${apiUrl}/healthz`, method: 'GET' },
    { name: 'Metrics', url: `${apiUrl}/metrics`, method: 'GET' },
    { name: 'Doctors List', url: `${apiUrl}/api/doctors`, method: 'GET' },
  ];
  
  const results = [];
  
  for (const test of tests) {
    log(`\nTesting: ${test.name}...`, 'blue');
    const result = await testEndpoint(test.name, test.url, test.method);
    results.push(result);
    
    const durationStr = formatDuration(result.duration);
    const statusColor = result.success ? 'green' : 'red';
    const durationColor = checkPerformanceThreshold(result.duration, 1000) ? 'green' : 'yellow';
    
    log(`Status: ${result.status} (${durationStr})`, statusColor);
    
    if (!result.success) {
      log(`Error: ${result.error || 'Unknown error'}`, 'red');
    }
  }
  
  // Summary
  log('\n=== Performance Summary ===', 'blue');
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const slow = results.filter(r => r.duration > 1000).length;
  
  log(`Total Tests: ${results.length}`, 'blue');
  log(`Successful: ${successful}`, successful === results.length ? 'green' : 'yellow');
  log(`Failed: ${failed}`, failed === 0 ? 'green' : 'red');
  log(`Slow (>1s): ${slow}`, slow === 0 ? 'green' : 'yellow');
  
  // Performance metrics
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  const maxDuration = Math.max(...results.map(r => r.duration));
  const minDuration = Math.min(...results.map(r => r.duration));
  
  log(`\nAverage Response Time: ${formatDuration(avgDuration)}`, 'blue');
  log(`Min Response Time: ${formatDuration(minDuration)}`, 'green');
  log(`Max Response Time: ${formatDuration(maxDuration)}`, maxDuration > 1000 ? 'yellow' : 'green');
  
  // Overall result
  if (failed === 0 && slow === 0) {
    log('\n✅ All performance tests passed!', 'green');
    process.exit(0);
  } else {
    log('\n⚠️  Some performance issues detected', 'yellow');
    process.exit(1);
  }
}

// Get API URL from command line or environment
const apiUrl = process.argv[2] || process.env.VITE_API_URL || 'http://localhost:4000';

runPerformanceTests(apiUrl).catch(error => {
  log(`Error running performance tests: ${error.message}`, 'red');
  process.exit(1);
});