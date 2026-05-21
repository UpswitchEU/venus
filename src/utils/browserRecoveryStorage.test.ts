import { beforeEach, describe, expect, it } from 'vitest'
import {
  appendBrowserRecoveryListItem,
  readBrowserRecoveryValue,
  removeBrowserRecoveryValue,
  WORKFLOW_RECOVERY_TTL_MS,
  writeBrowserRecoveryValue,
} from './browserRecoveryStorage'

interface RecoveryItem {
  id: string
}

function isRecoveryItem(value: unknown): value is RecoveryItem {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).id === 'string'
  )
}

function isRecoveryItemList(value: unknown): value is RecoveryItem[] {
  return Array.isArray(value) && value.every(isRecoveryItem)
}

describe('browserRecoveryStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('wraps values in a classified TTL envelope', () => {
    const nowMs = () => 1_000

    expect(writeBrowserRecoveryValue('recovery:key', [{ id: 'a' }], { nowMs })).toBe(true)

    const raw = window.localStorage.getItem('recovery:key')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string)

    expect(parsed).toMatchObject({
      schemaVersion: 1,
      classification: 'workflow-recovery',
      writtenAtMs: 1_000,
      expiresAtMs: 1_000 + WORKFLOW_RECOVERY_TTL_MS,
      value: [{ id: 'a' }],
    })
  })

  it('reads valid recovery values and keeps them until the caller clears', () => {
    writeBrowserRecoveryValue('recovery:key', [{ id: 'a' }], { nowMs: () => 1_000 })

    expect(
      readBrowserRecoveryValue('recovery:key', isRecoveryItemList, { nowMs: () => 2_000 })
    ).toEqual([{ id: 'a' }])
    expect(window.localStorage.getItem('recovery:key')).not.toBeNull()

    removeBrowserRecoveryValue('recovery:key')
    expect(window.localStorage.getItem('recovery:key')).toBeNull()
  })

  it('removes expired recovery values', () => {
    writeBrowserRecoveryValue('recovery:key', [{ id: 'a' }], { nowMs: () => 1_000, ttlMs: 10 })

    expect(
      readBrowserRecoveryValue('recovery:key', isRecoveryItemList, { nowMs: () => 1_011 })
    ).toBeNull()
    expect(window.localStorage.getItem('recovery:key')).toBeNull()
  })

  it('accepts legacy raw JSON once for migration safety', () => {
    window.localStorage.setItem('recovery:key', JSON.stringify([{ id: 'legacy' }]))

    expect(readBrowserRecoveryValue('recovery:key', isRecoveryItemList)).toEqual([{ id: 'legacy' }])
  })

  it('drops malformed or type-invalid entries', () => {
    window.localStorage.setItem('recovery:key', JSON.stringify([{ nope: true }]))

    expect(readBrowserRecoveryValue('recovery:key', isRecoveryItemList)).toBeNull()
    expect(window.localStorage.getItem('recovery:key')).toBeNull()
  })

  it('appends bounded recovery lists and filters invalid legacy entries', () => {
    window.localStorage.setItem('recovery:list', JSON.stringify([{ id: 'legacy' }, { nope: true }]))

    appendBrowserRecoveryListItem('recovery:list', { id: 'a' }, isRecoveryItem, {
      maxEntries: 2,
      nowMs: () => 1_000,
    })
    appendBrowserRecoveryListItem('recovery:list', { id: 'b' }, isRecoveryItem, {
      maxEntries: 2,
      nowMs: () => 1_001,
    })

    expect(
      readBrowserRecoveryValue('recovery:list', isRecoveryItemList, { nowMs: () => 1_002 })
    ).toEqual([{ id: 'a' }, { id: 'b' }])
  })
})
