import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../../lib/auth/store'
import { useClientContext } from '../../stores/clientContext'
import type { ValuationVersion } from '../../types/ValuationVersion'
import { mergePersistedVersionHistory, useVersionHistoryStore } from '../useVersionHistoryStore'

const version = {
  id: 'v1',
  reportId: 'report-a',
  versionNumber: 1,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  formData: {},
} as ValuationVersion
const populate = () =>
  useVersionHistoryStore.setState({
    versions: { 'report-a': [version] },
    activeVersions: { 'report-a': 1 },
  })

describe('version selection recovery', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    useClientContext.setState({ isActingAsClient: false, accountant: null, relationshipId: null })
    useAuthStore.setState({ user: null, loading: false, isInitializing: false })
    useVersionHistoryStore.setState({ versions: {}, activeVersions: {}, syncStatus: {} })
  })

  it('rejects legacy full-history snapshots and injected actions', () => {
    const state = useVersionHistoryStore.getState()
    expect(
      mergePersistedVersionHistory(
        { activeVersions: {}, versions: { 'report-a': [version] } },
        state
      )
    ).toBe(state)
    expect(mergePersistedVersionHistory({ activeVersions: {}, fetchVersions: null }, state)).toBe(
      state
    )
    expect(mergePersistedVersionHistory({ activeVersions: { report: -1 } }, state)).toBe(state)
  })

  it('persists only selections in bounded session recovery', () => {
    populate()
    const raw = sessionStorage.getItem('version-history-storage')
    if (!raw) throw new Error('Expected recovery entry')
    expect(JSON.parse(raw).value.snapshot.state).toEqual({ activeVersions: { 'report-a': 1 } })
    expect(localStorage.getItem('version-history-storage')).toBeNull()
  })

  it.each([
    'sign-out',
    'different user',
    'sign-in',
    'delegated client',
  ])('clears in-memory history on %s', (transition) => {
    if (transition !== 'sign-in') useAuthStore.setState({ user: { id: 'user-a' } } as never)
    populate()
    if (transition === 'delegated client') {
      useClientContext.setState({ isActingAsClient: true, relationshipId: 'client-b' })
    } else {
      useAuthStore.setState({ user: transition === 'sign-out' ? null : { id: 'user-b' } } as never)
    }
    expect(useVersionHistoryStore.getState().versions).toEqual({})
    expect(useVersionHistoryStore.getState().activeVersions).toEqual({})
  })

  it('restores selection after cold-start authentication without exposing report payloads', async () => {
    useAuthStore.setState({ user: { id: 'user-a' } } as never)
    populate()
    const raw = sessionStorage.getItem('version-history-storage')
    if (!raw) throw new Error('Expected recovery entry')
    useAuthStore.setState({ user: null, loading: true, isInitializing: true })
    sessionStorage.setItem('version-history-storage', raw)
    await useVersionHistoryStore.persist.rehydrate()
    expect(useVersionHistoryStore.getState().activeVersions).toEqual({})
    expect(sessionStorage.getItem('version-history-storage')).toBe(raw)
    useAuthStore.setState({
      user: { id: 'user-a' },
      loading: false,
      isInitializing: false,
    } as never)
    expect(useVersionHistoryStore.getState().activeVersions).toEqual({ 'report-a': 1 })
    expect(useVersionHistoryStore.getState().versions).toEqual({})
  })
})
