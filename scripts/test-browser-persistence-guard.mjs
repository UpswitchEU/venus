import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const fixture = mkdtempSync(path.join(tmpdir(), 'venus-storage-review-'))
const reviewPath = 'docs/security/browser-persistence-reviews.json'
const reviews = JSON.parse(readFileSync(path.join(root, reviewPath), 'utf8'))
const copy = (file) => {
  mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true })
  copyFileSync(path.join(root, file), path.join(fixture, file))
}
try {
  copy('scripts/guard-browser-persistence.mjs')
  copy(reviewPath)
  for (const [file, review] of Object.entries(reviews.surfaces)) {
    copy(file)
    for (const dependency of Object.keys(review.dependencies ?? {})) copy(dependency)
  }
  const run = () => spawnSync(process.execPath, ['scripts/guard-browser-persistence.mjs'], {
    cwd: fixture, encoding: 'utf8',
  })
  const baseline = run()
  assert.equal(baseline.status, 0, baseline.stderr)
  const writer = 'src/utils/workflowRecoveryStorage.ts'
  writeFileSync(path.join(fixture, writer), `${readFileSync(path.join(root, writer), 'utf8')}\n// Changed storage behavior\n`)
  const changedWriter = run()
  assert.equal(changedWriter.status, 1)
  assert.match(changedWriter.stderr, /changed-browser-persistence-review/)
  copy(writer)
  const dependency = 'src/store/manual/startupValuationRecovery.ts'
  writeFileSync(path.join(fixture, dependency), '// Changed validation\n')
  assert.match(run().stderr, /changed-browser-persistence-review/)
  copy(dependency)
  const first = Object.values(reviews.surfaces)[0]
  first.reviewedAt = '2000-01-01'
  first.reviewBy = '2000-01-02'
  writeFileSync(path.join(fixture, reviewPath), JSON.stringify(reviews))
  assert.match(run().stderr, /expired-browser-persistence-review/)
  copy(reviewPath)
  writeFileSync(path.join(fixture, 'src/unreviewed.ts'), "localStorage.setItem('unreviewed', 'payload')\n")
  const unreviewed = run()
  assert.equal(unreviewed.status, 1)
  assert.match(unreviewed.stderr, /browser-persistence/)
  console.log('Persistence guard: baseline passes; changed writers, dependencies, expired reviews and new writers fail.')
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
