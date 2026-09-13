import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionAPI } from '../../services/api/version/VersionAPI'
import { VersionAPIClient } from '../../services/api/version/VersionAPIClient'
import { useClientContext } from '../../stores/clientContext'
import { useVersionHistoryStore } from '../useVersionHistoryStore'

const original = {
  id: 'v1',
  reportId: 'report-a',
  versionNumber: 1,
  createdAt: new Date(),
  formData: {},
} as any
const response = {
  reportId: 'report-a',
  versions: [original],
  activeVersion: 1,
  totalVersions: 1,
  hasMore: false,
}

describe('version history refresh recovery with the real store', () => {
  beforeEach(() => {
    useClientContext.setState({ isActingAsClient: false, relationshipId: null })
    useVersionHistoryStore.setState({
      versions: { 'report-a': [original] },
      activeVersions: { 'report-a': 1 },
      syncStatus: {},
      loading: false,
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('preserves history and selection after the real API transport fails twice', async () => {
    vi.useFakeTimers()
    const request = vi
      .spyOn(VersionAPIClient.prototype, 'request')
      .mockRejectedValue(new Error('database unavailable'))
    const fetching = useVersionHistoryStore.getState().fetchVersions('report-a')
    await vi.advanceTimersByTimeAsync(1001)
    await fetching
    expect(request).toHaveBeenCalledTimes(2)
    const state = useVersionHistoryStore.getState()
    expect(state.versions['report-a']).toEqual([original])
    expect(state.activeVersions['report-a']).toBe(1)
    expect(state.syncStatus['report-a'].syncError).toContain('database unavailable')
    expect(state.loading).toBe(false)
  })

  it('coalesces refresh and refocus requests without overriding a selection made while waiting', async () => {
    let resolve!: (value: any) => void
    const list = vi.spyOn(VersionAPI.prototype, 'listVersions').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const first = useVersionHistoryStore.getState().fetchVersions('report-a')
    const refocus = useVersionHistoryStore.getState().fetchVersions('report-a')
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    useVersionHistoryStore.getState().setActiveVersion('report-a', 2)
    resolve({ ...response, versions: [original, { ...original, id: 'v2', versionNumber: 2 }] })
    await Promise.all([first, refocus])
    expect(useVersionHistoryStore.getState().activeVersions['report-a']).toBe(2)
    expect(useVersionHistoryStore.getState().loading).toBe(false)
  })

  it('ignores an obsolete response after switching clients away and back', async () => {
    let resolve!: (value: any) => void
    const list = vi.spyOn(VersionAPI.prototype, 'listVersions').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const first = useVersionHistoryStore.getState().fetchVersions('report-a')
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    useClientContext.setState({ isActingAsClient: true, relationshipId: 'client-b' })
    useClientContext.setState({ isActingAsClient: false, relationshipId: null })
    resolve({ ...response, versions: [], activeVersion: 99 })
    await first
    expect(useVersionHistoryStore.getState().versions['report-a']).toEqual([original])
    expect(useVersionHistoryStore.getState().activeVersions['report-a']).toBe(1)
    expect(useVersionHistoryStore.getState().loading).toBe(false)
    expect(useVersionHistoryStore.getState().syncStatus['report-a'].isSyncing).toBe(false)
  })

  it('keeps an existing historical selection through a successful background refresh', async () => {
    useVersionHistoryStore.getState().setActiveVersion('report-a', 1)
    vi.spyOn(VersionAPI.prototype, 'listVersions').mockResolvedValue({
      ...response,
      activeVersion: 2,
      versions: [original, { ...original, id: 'v2', versionNumber: 2 }],
    })
    await useVersionHistoryStore.getState().fetchVersions('report-a')
    expect(useVersionHistoryStore.getState().activeVersions['report-a']).toBe(1)
  })
})
