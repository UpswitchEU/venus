#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function isRepoRoot(candidate) {
  return (
    existsSync(join(candidate, 'scripts', 'verify-shared-contracts.mjs')) &&
    existsSync(join(candidate, 'packages', 'platform-scripts', 'package.json'))
  );
}

function findRepoRoot() {
  const envRoot = process.env.UPSWITCH_PLATFORM_ROOT?.trim();
  if (envRoot) {
    const explicitRoot = resolve(envRoot);
    return isRepoRoot(explicitRoot) ? explicitRoot : null;
  }

  const candidates = [
    process.cwd(),
    resolve(packageRoot, '../..'),
  ];

  for (const start of candidates) {
    let current = resolve(start);
    const { root } = parse(current);
    while (true) {
      if (isRepoRoot(current)) {
        return current;
      }
      if (current === root) {
        break;
      }
      current = dirname(current);
    }
  }

  return null;
}

const COMMANDS = {
  'verify:legal-bundle': {
    runner: 'node',
    script: 'scripts/verify-legal-bundle-sync.mjs',
  },
  'verify:shared-contracts': {
    runner: 'node',
    script: 'scripts/verify-shared-contracts.mjs',
  },
  'verify:sellability-contracts': {
    runner: 'node',
    script: 'scripts/verify-sellability-contracts.mjs',
  },
  'verify:preparer-multiple-contracts': {
    runner: 'node',
    script: 'scripts/verify-preparer-multiple-contracts.mjs',
  },
  'verify:ai-conversation-key-contracts': {
    runner: 'node',
    script: 'scripts/verify-ai-conversation-key-contracts.mjs',
  },
  'verify:ai-tool-result-contracts': {
    runner: 'node',
    script: 'scripts/verify-ai-tool-result-contracts.mjs',
  },
  'verify:internal-email-contracts': {
    runner: 'node',
    script: 'scripts/verify-internal-email-contracts.mjs',
  },
  'verify:auth-fetch-timeout-contracts': {
    runner: 'node',
    script: 'scripts/verify-auth-fetch-timeout-contracts.mjs',
  },
  'verify:valuation-extract': {
    runner: 'node',
    script: 'scripts/verify-valuation-extract-parity.mjs',
  },
  'verify:design-system-docs': {
    runner: 'node',
    script: 'scripts/verify-design-system-docs.mjs',
  },
  'verify:brand-favicons': {
    runner: 'node',
    script: 'scripts/verify-brand-favicons.mjs',
  },
  'sync:shared-contracts': {
    runner: 'node',
    script: 'scripts/sync-shared-contracts.mjs',
  },
  'sync:design-system-docs': {
    runner: 'node',
    script: 'scripts/sync-design-system-docs.mjs',
  },
  'db:business-types:run-all-migrations': {
    runner: 'bash',
    script: 'scripts/business-types-db/run-all-migrations.sh',
  },
};

function printHelp() {
  console.log(`Usage: upswitch-platform <command> [args...]

Commands:
${Object.keys(COMMANDS)
  .sort()
  .map((command) => `  ${command}`)
  .join('\n')}
`);
}

function fail(message) {
  console.error(`[upswitch-platform] ${message}`);
  process.exit(1);
}

function missingRepoRootMessage() {
  const envHint = process.env.UPSWITCH_PLATFORM_ROOT?.trim()
    ? ` UPSWITCH_PLATFORM_ROOT is set to "${process.env.UPSWITCH_PLATFORM_ROOT}", but it is not a valid UpSwitch workspace root.`
    : '';
  return [
    `Could not locate the UpSwitch workspace root from "${process.cwd()}".${envHint}`,
    'These shared contract guards require a full workspace checkout containing scripts/ and packages/platform-scripts/.',
    'Run from the UpSwitch workspace root, install the app through that workspace, or set UPSWITCH_PLATFORM_ROOT=/absolute/path/to/upswitch.',
  ].join('\n');
}

const [command, ...args] = process.argv.slice(2);
if (!command || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

const config = COMMANDS[command];
if (!config) {
  printHelp();
  fail(`Unknown command: ${command}`);
}

const repoRoot = findRepoRoot();
if (!repoRoot) {
  fail(missingRepoRootMessage());
}

const scriptPath = join(repoRoot, config.script);
if (!existsSync(scriptPath)) {
  fail(
    [
      `Missing platform script for "${command}": ${scriptPath}`,
      'The platform-scripts command surface is versioned, but this command still delegates to the canonical workspace script.',
      'Sync the workspace scripts or update @upswitch/platform-scripts and the app package together.',
    ].join('\n'),
  );
}

const executable = config.runner === 'node' ? process.execPath : config.runner;
const spawnArgs = config.runner === 'node' ? [scriptPath, ...args] : [scriptPath, ...args];
const result = spawnSync(executable, spawnArgs, {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  fail(result.error.message);
}

process.exit(result.status ?? 1);
