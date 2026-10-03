import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./verify-production-build-dependencies.mjs', import.meta.url))
function check(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'venus-trace-test-'))
  try {
    fs.mkdirSync(path.join(dir, '.next/server'), { recursive: true })
    if (files) fs.writeFileSync(path.join(dir, '.next/server/page.js.nft.json'), JSON.stringify({ files }))
    return spawnSync(process.execPath, [script], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, NEXT_DIST_DIR: '.next' },
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
test('accepts a traced runtime dependency and compiled CSS', () => {
  assert.equal(check(['../../node_modules/next/server.js', '../static/css/abc.css']).status, 0)
})
test('rejects tooling from npm, pnpm and Windows production traces', () => {
  for (const file of [
    '../../node_modules/tailwindcss/lib/index.js',
    '../../node_modules/.pnpm/braces@3.0.3/node_modules/braces/index.js',
    '..\\..\\node_modules\\@tailwindcss\\forms\\index.js',
    '../../node_modules/tailwindcss-animate/index.js',
  ]) {
    const result = check([file])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Build-only dependencies reached production/)
  }
})
test('missing build evidence fails verification', () => {
  const result = check(null)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /requires build traces/)
})
