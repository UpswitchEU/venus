import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../lib/auth/store'
import { VersionAPI } from '../../services/api/version/VersionAPI'
import { useClientContext } from '../../stores/clientContext'
import type { CreateVersionRequest, ValuationVersion } from '../../types/ValuationVersion'
import { useVersionHistoryStore } from '../useVersionHistoryStore'

const request: CreateVersionRequest = {
  reportId: 'report-create-recovery',
  formData: {} as CreateVersionRequest['formData'],
}
const original: ValuationVersion = {
  id: 'saved-v1',
  reportId: request.reportId,
  versionNumber: 1,
  versionLabel: 'Initial',
  createdAt: new Date('2026-10-11T12:00:00Z'),
  createdBy: 'user-a',
  formData: request.formData,
  valuationResult: null,
  htmlReport: null,
  changesSummary: { totalChanges: 0, significantChanges: [] },
  isActive: true,
  isPinned: false,
}

describe('durable version creation', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, loading: false, isInitializing: false })
    useClientContext.setState({ isActingAsClient: false, relationshipId: null })
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([
    'signed-in',
    'delegated-client',
  ])('preserves acknowledged history on a failed %s save and allows a successful retry', async (mode) => {
    if (mode === 'signed-in') {
      useAuthStore.setState({ user: { id: 'user-a' } } as never)
    } else {
      useClientContext.setState({ isActingAsClient: true, relationshipId: 'client-a' })
    }
    useVersionHistoryStore.setState({
      versions: { [request.reportId]: [original] },
      activeVersions: { [request.reportId]: 1 },
    })
    const failure = new Error('Version transaction timed out')
    const create = vi.spyOn(VersionAPI.prototype, 'createVersion').mockRejectedValueOnce(failure)
    await expect(useVersionHistoryStore.getState().createVersion(request)).rejects.toBe(failure)
    expect(useVersionHistoryStore.getState().versions[request.reportId]).toEqual([original])
    expect(useVersionHistoryStore.getState().activeVersions[request.reportId]).toBe(1)

    const saved = { ...original, id: 'saved-v2', versionNumber: 2 }
    create.mockResolvedValueOnce(saved)
    await expect(useVersionHistoryStore.getState().createVersion(request)).resolves.toBe(saved)
    expect(useVersionHistoryStore.getState().versions[request.reportId]).toHaveLength(2)
    expect(useVersionHistoryStore.getState().activeVersions[request.reportId]).toBe(2)
  })
})
