import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WORKFLOW_RECOVERY_TTL_MS } from './browserRecoveryStorage'
import { createWorkflowRecoveryStorage } from './workflowRecoveryStorage'

const key = 'test-workflow'
const isState = (value: unknown): value is { value: string } =>
  !!value && typeof value === 'object' && 'value' in value && typeof value.value === 'string'
let scope: string | null
const storage = createWorkflowRecoveryStorage(isState, () => scope)
const draft = { state: { value: 'draft' }, version: 1 }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
  localStorage.clear()
  sessionStorage.clear()
  scope = 'user-a:company-a'
})
afterEach(() => vi.useRealTimers())

describe('workflow recovery boundaries', () => {
  it('restores a same-scope draft only within the 24-hour window', () => {
    storage.setItem(key, draft)
    expect(storage.getItem(key)).toEqual(draft)
    expect(localStorage.getItem(key)).toBeNull()
    vi.advanceTimersByTime(WORKFLOW_RECOVERY_TTL_MS)
    expect(storage.getItem(key)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it.each(['user-b:company-a', 'user-a:company-b'])('rejects another scope %s', (next) => {
    storage.setItem(key, draft)
    scope = next
    expect(storage.getItem(key)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('does not consume or overwrite recovery before identity resolves', () => {
    storage.setItem(key, draft)
    scope = null
    expect(storage.getItem(key)).toBeNull()
    storage.setItem(key, { state: { value: 'empty' }, version: 1 })
    scope = 'user-a:company-a'
    expect(storage.getItem(key)).toEqual(draft)
  })

  it('discards indefinite legacy snapshots, invalid JSON and invalid state', () => {
    localStorage.setItem(key, JSON.stringify(draft))
    sessionStorage.setItem(key, 'broken')
    expect(storage.getItem(key)).toBeNull()
    expect(localStorage.getItem(key)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
    storage.setItem(key, draft)
    const raw = sessionStorage.getItem(key)
    if (!raw) throw new Error('Expected recovery entry')
    const envelope = JSON.parse(raw)
    envelope.value.snapshot.state.value = 123
    sessionStorage.setItem(key, JSON.stringify(envelope))
    expect(storage.getItem(key)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('removes the earlier snapshot if a replacement exceeds the bound', () => {
    storage.setItem(key, draft)
    storage.setItem(key, { state: { value: 'x'.repeat(100_001) }, version: 1 })
    expect(storage.getItem(key)).toBeNull()
  })

  it('contains disabled storage and quota failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => storage.setItem(key, draft)).not.toThrow()
    expect(storage.getItem(key)).toBeNull()
    vi.restoreAllMocks()
  })
})
