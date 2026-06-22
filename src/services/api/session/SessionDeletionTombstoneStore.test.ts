import { describe, expect, it } from 'vitest'
import { SessionDeletionTombstoneStore } from './SessionDeletionTombstoneStore'

function createStore(ttlMs = 100) {
  let now = 0
  return {
    store: new SessionDeletionTombstoneStore({ ttlMs, now: () => now }),
    setNow: (nextNow: number) => {
      now = nextNow
    },
  }
}

describe('SessionDeletionTombstoneStore', () => {
  it('keeps a tombstone recent until the ttl boundary', () => {
    const { store, setNow } = createStore()

    store.mark('report-a')

    expect(store.hasRecent('report-a')).toBe(true)
    setNow(99)
    expect(store.hasRecent('report-a')).toBe(true)
    setNow(100)
    expect(store.hasRecent('report-a')).toBe(false)
    expect(store.size).toBe(0)
  })

  it('does not treat a timestamp of zero as missing', () => {
    const { store } = createStore()

    store.mark('report-at-zero')

    expect(store.hasRecent('report-at-zero')).toBe(true)
  })

  it('clears explicit markers and ignores empty clear requests', () => {
    const { store } = createStore()

    store.mark('report-a')
    store.clear()
    expect(store.hasRecent('report-a')).toBe(true)

    store.clear('report-a')
    expect(store.hasRecent('report-a')).toBe(false)
  })

  it('prunes expired markers when new markers are written', () => {
    const { store, setNow } = createStore()

    store.mark('old-report')
    setNow(101)
    store.mark('fresh-report')

    expect(store.size).toBe(1)
    expect(store.hasRecent('old-report')).toBe(false)
    expect(store.hasRecent('fresh-report')).toBe(true)
  })
})
