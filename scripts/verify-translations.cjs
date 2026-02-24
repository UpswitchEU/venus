#!/usr/bin/env node

/**
 * Translation Verification Script
 * Verifies that all Dutch translations are present and match English keys
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function loadJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    log(`❌ Failed to load ${filePath}: ${error.message}`, 'red');
    process.exit(1);
  }
}

function getAllKeys(obj, prefix = '') {
  let keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys = keys.concat(getAllKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function getValueByPath(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function main() {
  log('\n================================================================================', 'cyan');
  log('🌐 VENUS TRANSLATION VERIFICATION', 'cyan');
  log('================================================================================\n', 'cyan');

  const messagesDir = path.join(__dirname, '..', 'messages');
  const enPath = path.join(messagesDir, 'en.json');
  const nlPath = path.join(messagesDir, 'nl.json');

  // Load translation files
  log('📂 Loading translation files...', 'blue');
  const en = loadJSON(enPath);
  const nl = loadJSON(nlPath);
  log('✅ Translation files loaded successfully\n', 'green');

  // Get all keys
  const enKeys = getAllKeys(en);
  const nlKeys = getAllKeys(nl);

  log(`📊 Statistics:`, 'blue');
  log(`   English keys: ${enKeys.length}`, 'reset');
  log(`   Dutch keys: ${nlKeys.length}\n`, 'reset');

  // Check for missing keys in Dutch
  const missingInNL = enKeys.filter(key => !nlKeys.includes(key));
  const extraInNL = nlKeys.filter(key => !enKeys.includes(key));

  if (missingInNL.length > 0) {
    log(`⚠️  Missing in Dutch (${missingInNL.length}):`, 'yellow');
    missingInNL.forEach(key => log(`   - ${key}`, 'yellow'));
    console.log();
  } else {
    log('✅ All English keys have Dutch translations\n', 'green');
  }

  if (extraInNL.length > 0) {
    log(`ℹ️  Extra keys in Dutch (${extraInNL.length}):`, 'cyan');
    extraInNL.forEach(key => log(`   - ${key}`, 'cyan'));
    console.log();
  }

  // Verify specific keys mentioned in the audit
  log('🔍 Verifying specific translation keys:', 'blue');
  const keysToVerify = [
    'report.toolbar.continueToDashboard',
    'report.toolbar.backToClient',
    'report.saveStatus.saving',
    'report.saveStatus.saved',
    'report.saveStatus.savingSoon',
    'report.saveStatus.savedAgo',
    'report.saveStatus.savedHoursAgo',
    'report.saveStatus.saveFailed',
    'forms.kboLookup.verifiedCompany',
    'forms.kboLookup.kboBelgium',
    'forms.kboLookup.changeCompany',
    'forms.kboLookup.active',
    'forms.kboLookup.registration',
    'forms.kboLookup.type',
    'forms.kboLookup.address',
  ];

  let allPresent = true;
  keysToVerify.forEach(key => {
    const enValue = getValueByPath(en, key);
    const nlValue = getValueByPath(nl, key);
    
    if (!enValue) {
      log(`   ❌ ${key}: Missing in English`, 'red');
      allPresent = false;
    } else if (!nlValue) {
      log(`   ❌ ${key}: Missing in Dutch`, 'red');
      allPresent = false;
    } else {
      log(`   ✅ ${key}`, 'green');
      log(`      EN: "${enValue}"`, 'reset');
      log(`      NL: "${nlValue}"`, 'reset');
    }
  });

  console.log();

  // Final summary
  log('================================================================================', 'cyan');
  if (allPresent && missingInNL.length === 0) {
    log('✅ VERIFICATION PASSED', 'green');
    log('   All required translations are present and correct.', 'green');
    log('   Production deployment can proceed.', 'green');
  } else {
    log('⚠️  VERIFICATION FAILED', 'yellow');
    log('   Some translations are missing or incorrect.', 'yellow');
    log('   Please review the issues above.', 'yellow');
  }
  log('================================================================================\n', 'cyan');

  process.exit(allPresent && missingInNL.length === 0 ? 0 : 1);
}

main();
