/**
 * Translation Status Checker for Venus
 * 
 * Validates that all translation keys are present in both en.json and nl.json
 * Reports missing translations and extra keys
 * 
 * Usage: npm run i18n:check
 */

const fs = require('fs');
const path = require('path');

/**
 * Load messages from a locale file
 */
function loadMessages(locale) {
  const filePath = path.join(__dirname, `../messages/${locale}.json`);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ ERROR: Failed to load ${locale}.json:`, error.message);
    process.exit(1);
  }
}

/**
 * Recursively flatten nested translation keys into dot-notation paths
 * Example: { common: { actions: { save: "Save" } } } => ["common.actions.save"]
 */
function flattenKeys(obj, prefix = '') {
  let keys = [];
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively flatten nested objects
      keys = keys.concat(flattenKeys(value, fullKey));
    } else {
      // Leaf node - add the full path
      keys.push(fullKey);
    }
  }
  
  return keys;
}

/**
 * Get a nested value from an object using dot notation
 * Example: getValue({ common: { actions: { save: "Save" } } }, "common.actions.save") => "Save"
 */
function getValue(obj, path) {
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[key];
  }
  
  return current;
}

/**
 * Main translation checker
 */
function checkTranslations() {
  console.log('\n🌍 Translation Status Checker for Venus\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Load both translation files
  const enMessages = loadMessages('en');
  const nlMessages = loadMessages('nl');
  
  // Flatten keys for comparison
  const enKeys = new Set(flattenKeys(enMessages));
  const nlKeys = new Set(flattenKeys(nlMessages));
  
  console.log(`📄 English (source): ${enKeys.size} keys`);
  console.log(`📄 Dutch (target):   ${nlKeys.size} keys\n`);
  
  // Find missing translations in Dutch
  const missingInNl = [...enKeys].filter(key => !nlKeys.has(key));
  
  // Find extra keys in Dutch (not in English)
  const extraInNl = [...nlKeys].filter(key => !enKeys.has(key));
  
  // Check for empty values in both locales
  const emptyInEn = [...enKeys].filter(key => {
    const value = getValue(enMessages, key);
    return value === '' || value === null || value === undefined;
  });
  
  const emptyInNl = [...nlKeys].filter(key => {
    const value = getValue(nlMessages, key);
    return value === '' || value === null || value === undefined;
  });
  
  // Report results
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Dutch (nl) Translation Status');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const completionRate = ((nlKeys.size / enKeys.size) * 100).toFixed(1);
  console.log(`📊 Completion: ${completionRate}%`);
  console.log(`✅ Translated: ${nlKeys.size}/${enKeys.size} keys\n`);
  
  let hasErrors = false;
  
  // Report missing translations
  if (missingInNl.length > 0) {
    hasErrors = true;
    console.log(`❌ Missing ${missingInNl.length} Dutch translation(s):\n`);
    
    // Group by top-level category for better readability
    const grouped = {};
    missingInNl.forEach(key => {
      const category = key.split('.')[0];
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(key);
    });
    
    Object.entries(grouped).forEach(([category, keys]) => {
      console.log(`  [${category}]:`);
      keys.forEach(key => {
        const enValue = getValue(enMessages, key);
        console.log(`    - ${key}`);
        console.log(`      EN: "${enValue}"`);
      });
      console.log('');
    });
  }
  
  // Report extra keys
  if (extraInNl.length > 0) {
    console.log(`\n⚠️  ${extraInNl.length} extra key(s) in Dutch (not in English):\n`);
    extraInNl.forEach(key => console.log(`    - ${key}`));
    console.log('');
  }
  
  // Report empty values
  if (emptyInEn.length > 0) {
    hasErrors = true;
    console.log(`\n⚠️  ${emptyInEn.length} empty value(s) in English:\n`);
    emptyInEn.forEach(key => console.log(`    - ${key}`));
    console.log('');
  }
  
  if (emptyInNl.length > 0) {
    hasErrors = true;
    console.log(`\n⚠️  ${emptyInNl.length} empty value(s) in Dutch:\n`);
    emptyInNl.forEach(key => console.log(`    - ${key}`));
    console.log('');
  }
  
  // Final summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (!hasErrors && missingInNl.length === 0 && extraInNl.length === 0) {
    console.log('✅ All translations are up to date!\n');
    console.log('🎉 Venus is fully bilingual (EN/NL)\n');
    process.exit(0);
  } else {
    console.log('❌ Translation issues found. Please fix them before deploying.\n');
    
    // Provide helpful next steps
    console.log('📝 Next steps:');
    if (missingInNl.length > 0) {
      console.log('   1. Add missing Dutch translations to messages/nl.json');
    }
    if (extraInNl.length > 0) {
      console.log('   2. Remove extra keys from messages/nl.json or add them to messages/en.json');
    }
    if (emptyInEn.length > 0 || emptyInNl.length > 0) {
      console.log('   3. Fill in empty translation values');
    }
    console.log('   4. Run "npm run i18n:check" again to verify\n');
    
    process.exit(1);
  }
}

// Run the checker
checkTranslations();
