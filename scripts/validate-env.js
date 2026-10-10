#!/usr/bin/env node

/**
 * Environment Variable Validation Script
 * Validates that all required environment variables are set and valid
 */

import { config } from '../server/src/config.js';

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

function validateRequired(vars) {
  let allValid = true;
  
  log('\n=== Required Environment Variables ===', 'blue');
  
  for (const [key, value] of Object.entries(vars)) {
    if (!value) {
      log(`❌ ${key}: MISSING`, 'red');
      allValid = false;
    } else {
      log(`✅ ${key}: SET`, 'green');
    }
  }
  
  return allValid;
}

function validateOptional(vars) {
  log('\n=== Optional Environment Variables ===', 'blue');
  
  for (const [key, value] of Object.entries(vars)) {
    if (value) {
      log(`✅ ${key}: SET`, 'green');
    } else {
      log(`⚠️  ${key}: NOT SET (optional)`, 'yellow');
    }
  }
}

function validateFormats(vars) {
  log('\n=== Format Validation ===', 'blue');
  
  const formats = {
    DATABASE_URL: (val) => val.startsWith('postgresql://'),
    SUPABASE_URL: (val) => val.startsWith('https://'),
    FRONTEND_ORIGIN: (val) => val.startsWith('http'),
    PORT: (val) => !isNaN(parseInt(val)),
  };
  
  let allValid = true;
  
  for (const [key, validator] of Object.entries(formats)) {
    const value = vars[key];
    if (value && !validator(value)) {
      log(`❌ ${key}: INVALID FORMAT`, 'red');
      allValid = false;
    } else if (value) {
      log(`✅ ${key}: VALID FORMAT`, 'green');
    }
  }
  
  return allValid;
}

function checkSecretStrength() {
  log('\n=== Security Check ===', 'blue');
  
  const secrets = {
    OTP_HMAC_SECRET: config.OTP_HMAC_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: config.SUPABASE_SERVICE_ROLE_KEY,
  };
  
  let allSecure = true;
  
  for (const [key, value] of Object.entries(secrets)) {
    if (value && value.length < 32) {
      log(`❌ ${key}: TOO SHORT (minimum 32 characters)`, 'red');
      allSecure = false;
    } else if (value) {
      log(`✅ ${key: ADEQUATE LENGTH (${value.length} characters)`, 'green');
    } else {
      log(`⚠️  ${key}: NOT SET`, 'yellow');
    }
  }
  
  return allSecure;
}

function main() {
  log('SCCPMS Environment Variable Validation', 'blue');
  log('======================================', 'blue');
  
  // Required variables
  const requiredValid = validateRequired({
    NODE_ENV: config.NODE_ENV,
    PORT: config.PORT,
    DATABASE_URL: config.DATABASE_URL,
    SUPABASE_URL: config.SUPABASE_URL,
    SUPABASE_ANON_KEY: config.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: config.SUPABASE_SERVICE_ROLE_KEY,
    OTP_HMAC_SECRET: config.OTP_HMAC_SECRET,
    AFRICASTALKING_USERNAME: config.AFRICASTALKING_USERNAME,
    AFRICASTALKING_API_KEY: config.AFRICASTALKING_API_KEY,
    FRONTEND_ORIGIN: config.FRONTEND_ORIGIN,
  });
  
  // Optional variables
  validateOptional({
    DATABASE_SSL_MODE: config.DATABASE_SSL_MODE,
    DATABASE_SSL_CA: config.DATABASE_SSL_CA,
    AFRICASTALKING_SENDER_ID: config.AFRICASTALKING_SENDER_ID,
  });
  
  // Format validation
  const formatsValid = validateFormats({
    DATABASE_URL: config.DATABASE_URL,
    SUPABASE_URL: config.SUPABASE_URL,
    FRONTEND_ORIGIN: config.FRONTEND_ORIGIN,
    PORT: config.PORT,
  });
  
  // Security check
  const secretsSecure = checkSecretStrength();
  
  // Final result
  log('\n=== Validation Result ===', 'blue');
  
  if (requiredValid && formatsValid && secretsSecure) {
    log('✅ All validations passed!', 'green');
    process.exit(0);
  } else {
    log('❌ Some validations failed. Please fix the issues above.', 'red');
    process.exit(1);
  }
}

main();