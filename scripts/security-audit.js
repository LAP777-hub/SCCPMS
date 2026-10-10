#!/usr/bin/env node

/**
 * Security Audit Script
 * Performs basic security checks on the application
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

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

function checkFilePermissions(filePath) {
  try {
    const stats = require('fs').statSync(filePath);
    const mode = stats.mode;
    
    // Check if file is readable
    const readable = (mode & 0o444) !== 0;
    // Check if file is writable (only owner should be able to write)
    const ownerWritable = (mode & 0o200) !== 0;
    const groupWritable = (mode & 0o020) !== 0;
    const otherWritable = (mode & 0o002) !== 0;
    
    if (!readable) {
      log(`❌ ${filePath}: Not readable`, 'red');
      return false;
    }
    
    if (groupWritable || otherWritable) {
      log(`⚠️  ${filePath}: Writable by group or others`, 'yellow');
      return false;
    }
    
    log(`✅ ${filePath}: Proper permissions`, 'green');
    return true;
  } catch (error) {
    log(`❌ ${filePath}: Cannot check permissions`, 'red');
    return false;
  }
}

function checkSensitiveFiles() {
  log('\n=== Sensitive File Check ===', 'blue');
  
  const sensitiveFiles = [
    '.env',
    '.env.production',
    'server/.env',
    'server/.env.production',
  ];
  
  let allSecure = true;
  
  for (const file of sensitiveFiles) {
    const filePath = join(process.cwd(), file);
    
    if (existsSync(filePath)) {
      if (!checkFilePermissions(filePath)) {
        allSecure = false;
      }
    } else {
      log(`⚠️  ${file}: Does not exist (expected in production)`, 'yellow');
    }
  }
  
  return allSecure;
}

function checkPackageDependencies() {
  log('\n=== Dependency Security Check ===', 'blue');
  
  try {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    const serverPackageJson = JSON.parse(readFileSync('server/package.json', 'utf8'));
    
    const checkDependencies = (pkg, name) => {
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      let allGood = true;
      
      for (const [dep, version] of Object.entries(deps)) {
        // Check for obviously outdated versions
        if (version.startsWith('^') || version.startsWith('~')) {
          // This is okay for development
        } else if (version === '*') {
          log(`⚠️  ${name}/${dep}: Using wildcard version`, 'yellow');
          allGood = false;
        }
      }
      
      return allGood;
    };
    
    const frontendSecure = checkDependencies(packageJson, 'frontend');
    const backendSecure = checkDependencies(serverPackageJson, 'backend');
    
    if (frontendSecure && backendSecure) {
      log('✅ Dependencies look secure', 'green');
    }
    
    return frontendSecure && backendSecure;
  } catch (error) {
    log('❌ Cannot check package dependencies', 'red');
    return false;
  }
}

function checkCodeSecurity() {
  log('\n=== Code Security Check ===', 'blue');
  
  const securityPatterns = [
    {
      name: 'Hardcoded secrets',
      pattern: /(password|secret|api_key|token)\s*=\s*['"][^'"]+['"]/gi,
      severity: 'high',
    },
    {
      name: 'Console.log in production',
      pattern: /console\.log\(/gi,
      severity: 'medium',
    },
    {
      name: 'Debug statements',
      pattern: /debugger/gi,
      severity: 'medium',
    },
  ];
  
  const filesToCheck = [
    'server/src/index.ts',
    'server/src/api.routes.ts',
    'server/src/clinical.routes.ts',
    'server/src/scheduling.routes.ts',
  ];
  
  let allSecure = true;
  
  for (const file of filesToCheck) {
    const filePath = join(process.cwd(), file);
    
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf8');
        
        for (const pattern of securityPatterns) {
          const matches = content.match(pattern.pattern);
          if (matches) {
            log(`⚠️  ${file}: Found ${pattern.name} (${matches.length} instances)`, 'yellow');
            if (pattern.severity === 'high') {
              allSecure = false;
            }
          }
        }
      } catch (error) {
        log(`❌ ${file}: Cannot read file`, 'red');
        allSecure = false;
      }
    }
  }
  
  if (allSecure) {
    log('✅ No obvious security issues found', 'green');
  }
  
  return allSecure;
}

function checkGitSecurity() {
  log('\n=== Git Security Check ===', 'blue');
  
  try {
    const gitDir = join(process.cwd(), '.git');
    
    if (existsSync(gitDir)) {
      log('✅ Git repository found', 'green');
      
      // Check for .gitignore
      const gitignorePath = join(process.cwd(), '.gitignore');
      if (existsSync(gitignorePath)) {
        const gitignore = readFileSync(gitignorePath, 'utf8');
        
        const essentialIgnores = ['.env', 'node_modules', '.DS_Store'];
        let allIgnored = true;
        
        for (const ignore of essentialIgnores) {
          if (!gitignore.includes(ignore)) {
            log(`⚠️  ${ignore} not in .gitignore`, 'yellow');
            allIgnored = false;
          }
        }
        
        if (allIgnored) {
          log('✅ Essential patterns in .gitignore', 'green');
        }
      } else {
        log('⚠️  .gitignore not found', 'yellow');
      }
    } else {
      log('⚠️  Not a git repository', 'yellow');
    }
  } catch (error) {
    log('❌ Cannot check git security', 'red');
  }
}

function checkSSLConfiguration() {
  log('\n=== SSL Configuration Check ===', 'blue');
  
  const sslMode = process.env.DATABASE_SSL_MODE;
  
  if (sslMode === 'verify-full') {
    log('✅ Database SSL mode set to verify-full (secure)', 'green');
  } else if (sslMode === 'disable') {
    log('⚠️  Database SSL mode disabled (not secure for production)', 'yellow');
  } else {
    log('⚠️  Database SSL mode not set', 'yellow');
  }
}

function main() {
  log('SCCPMS Security Audit', 'blue');
  log('======================', 'blue');
  
  const filesSecure = checkSensitiveFiles();
  const depsSecure = checkPackageDependencies();
  const codeSecure = checkCodeSecurity();
  checkGitSecurity();
  checkSSLConfiguration();
  
  log('\n=== Audit Result ===', 'blue');
  
  if (filesSecure && depsSecure && codeSecure) {
    log('✅ Security audit passed!', 'green');
    process.exit(0);
  } else {
    log('⚠️  Security audit found issues. Please review above.', 'yellow');
    process.exit(1);
  }
}

main();