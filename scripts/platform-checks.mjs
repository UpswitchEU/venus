#!/usr/bin/env node
/** Repository-local contract checks. No parent-workspace or global CLI dependency. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(resolve(root, 'scripts/platform-checks.json'), 'utf8'));
function localPath(file) {
  const resolved = resolve(root, file);
  const rel = relative(root, resolved);
  if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) {
    throw new Error(`Contract path escapes repository: ${file}`);
  }
  if (!existsSync(resolved)) throw new Error(`Missing repository input: ${file}`);
  return resolved;
}
function checkSnapshots() {
  if (!Object.keys(config.snapshots).length) throw new Error('No contract snapshots configured');
  for (const [file, metadata] of Object.entries(config.snapshots)) {
    if (!metadata.source || !metadata.revision) throw new Error(`Missing provenance: ${file}`);
    const actual = createHash('sha256').update(readFileSync(localPath(file))).digest('hex');
    if (actual !== metadata.sha256) throw new Error(`Contract changed without review: ${file}`);
  }
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
      if (spec.startsWith('file:') || spec.startsWith('link:')) {
        const dependency = localPath(spec.slice(spec.indexOf(':') + 1));
        if (!existsSync(resolve(dependency, 'package.json'))) {
          throw new Error(`Missing local package manifest: ${name}`);
        }
      }
    }
  }
  console.log(`[contracts] ${Object.keys(config.snapshots).length} pinned inputs verified`);
}
try {
  const [command = 'verify:shared-contracts', ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error('Unexpected arguments: contract checks cannot be filtered or skipped');
  if (command === '--help') {
    console.log(['guard:standalone', ...Object.keys(config.checks)].join('\n'));
  } else {
    checkSnapshots();
    if (command !== 'guard:standalone') {
      const groups = command === 'verify:shared-contracts'
        ? Object.values(config.checks) : [config.checks[command]];
      if (groups.some((group) => !group)) throw new Error(`Unknown contract check: ${command}`);
      const tests = [...new Set(groups.flat())];
      if (!tests.length) throw new Error(`No tests configured for ${command}`);
      tests.forEach(localPath);
      const result = spawnSync(process.execPath, [localPath(config.runner), ...config.args, ...tests], {
        cwd: root, env: process.env, stdio: 'inherit',
      });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    }
  }
} catch (error) {
  console.error(`[contracts] ${error.message}`);
  process.exitCode = 1;
}
