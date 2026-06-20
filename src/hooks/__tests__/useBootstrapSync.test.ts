/**
 * Module-level dedupe for useBootstrapSync (ValuationReport mounts the hook once;
 * guard still required if a second mount appears).
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  resetBootstrapSyncGateForRetry,
  resetGlobalBootstrapSyncGateForTests,
} from '../useBootstrapSync'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('useBootstrapSync module gate', () => {
  it('exports a test reset for global dedupe state', () => {
    expect(() => resetGlobalBootstrapSyncGateForTests()).not.toThrow()
  })

  it('exports a force reset for bootstrap retry', () => {
    expect(() => resetBootstrapSyncGateForRetry()).not.toThrow()
  })

  it('tracks globalBootstrapSyncScheduledKey in source', () => {
    const source = readFileSync(join(__dirname, '../useBootstrapSync.ts'), 'utf8')
    expect(source).toMatch(/globalBootstrapSyncScheduledKey = syncKey/)
    expect(source).toMatch(/function syncEngine\(/)
    expect(source).toMatch(/syncBootstrapSession\(state\)/)
  })
})
