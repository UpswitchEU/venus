import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'platform-checks-'));
  try {
    mkdirSync(join(root, 'scripts'));
    copyFileSync(new URL('./platform-checks.mjs', import.meta.url), join(root, 'scripts/platform-checks.mjs'));
    writeFileSync(join(root, 'package.json'), '{}');
    writeFileSync(join(root, 'contract.json'), '{}');
    writeFileSync(join(root, 'contract.test.mjs'), '');
    writeFileSync(join(root, 'runner.mjs'), 'process.exit(Number(process.env.TEST_RUNNER_EXIT ?? 0))');
    const config = {
      runner: 'runner.mjs', args: [],
      snapshots: { 'contract.json': { source: 'fixture', revision: 'test', sha256: createHash('sha256').update('{}').digest('hex') } },
      checks: { 'verify:example': ['contract.test.mjs'] },
    };
    const execute = (args = [], env = {}) => {
      writeFileSync(join(root, 'scripts/platform-checks.json'), JSON.stringify(config));
      return spawnSync(process.execPath, [join(root, 'scripts/platform-checks.mjs'), ...args], {
        env: { ...process.env, ...env }, encoding: 'utf8',
      });
    };
    run({ root, config, execute });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('standalone checks work without a parent workspace and propagate failures', () => fixture(({ execute }) => {
  assert.equal(execute().status, 0);
  assert.equal(execute([], { TEST_RUNNER_EXIT: '9' }).status, 9);
}));
test('corrupted and missing contract inputs fail', () => fixture(({ root, execute }) => {
  writeFileSync(join(root, 'contract.json'), '[]');
  assert.equal(execute().status, 1);
  rmSync(join(root, 'contract.json'));
  assert.equal(execute().status, 1);
}));
test('missing tests and empty selections fail', () => fixture(({ config, execute }) => {
  config.checks['verify:example'] = ['missing.test.mjs'];
  assert.equal(execute().status, 1);
  config.checks['verify:example'] = [];
  assert.equal(execute().status, 1);
}));
test('unknown commands and filtering flags fail', () => fixture(({ execute }) => {
  assert.equal(execute(['verify:unknown']).status, 1);
  assert.equal(execute(['verify:example', '--passWithNoTests']).status, 1);
}));
test('dependencies outside the standalone repository fail', () => fixture(({ root, execute }) => {
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { escape: 'file:../outside' } }));
  assert.equal(execute(['guard:standalone']).status, 1);
}));
