import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationTypes'
import { writeBrowserRecoveryValue } from '../utils/browserRecoveryStorage'
import { reportAccessScope } from '../utils/reportAccessScope'
import {
  enableNormalizationAutoPersist,
  normalizationRecoveryKey,
  recoverPendingNormalizations,
  useNormalizationStore,
} from './useNormalizationStore'
import { useSessionStore } from './useSessionStore'

const reportId = '4aed3861-ad9f-4dac-948d-89fd99e73c96'
const key = `_norm_pending_${reportId}`
const items: NormalizationItem[] = [
  {
    id: 'adjustment-1',
    ledgerCode: '618',
    ledgerName: 'Management',
    category: 'salary',
    type: 'add',
    value: 0,
    adjustment: 225851.15,
    source: 'manual',
    status: 'accepted',
    applyAllYears: false,
    year: 2025,
  },
]
beforeEach(() => {
  useNormalizationStore.getState().clear()
  localStorage.clear()
})
describe('normalization recovery buffer', () => {
  it('restoration is non-consuming, including an empty list representing removals', () => {
    for (const data of [items, []]) {
      writeBrowserRecoveryValue(key, { scope: reportAccessScope(), items: data })
      expect(recoverPendingNormalizations(reportId)).toEqual(data)
      expect(recoverPendingNormalizations(reportId)).toEqual(data)
      expect(localStorage.getItem(key)).not.toBeNull()
    }
  })
  it('does not restore another authorized identity’s buffer', () => {
    writeBrowserRecoveryValue(key, { scope: 'another-user-and-firm', items })
    expect(recoverPendingNormalizations(reportId)).toBeNull()
    expect(localStorage.getItem(key)).not.toBeNull()
  })
  it('writes when adjustments change, even while session saving is deferred', () => {
    useSessionStore.setState({ restorationComplete: false })
    const stop = enableNormalizationAutoPersist(() => reportId)
    useNormalizationStore.getState().setItems(items)
    expect(
      JSON.parse(localStorage.getItem(normalizationRecoveryKey(reportId)) ?? 'null').value.items
    ).toEqual(items)
    expect(useNormalizationStore.getState().recoveryBuffered).toBe(true)
    stop()
  })
  it('clears a restored buffer only after the same session revision is acknowledged', async () => {
    writeBrowserRecoveryValue(key, { scope: reportAccessScope(), items })
    recoverPendingNormalizations(reportId)
    useSessionStore.setState({
      restorationComplete: true,
      status: 'loaded',
      hasUnsavedChanges: false,
      isSaving: false,
      saveFailure: null,
      session: { reportId, sessionData: { _normalizations: items } } as never,
    })
    expect(await useNormalizationStore.getState().persistToSession(reportId)).toEqual({
      status: 'acknowledged',
    })
    expect(localStorage.getItem(key)).toBeNull()
    expect(useNormalizationStore.getState().recoveryBuffered).toBe(false)
  })

  it('does not restore a mutation whose request targets another report', () => {
    writeBrowserRecoveryValue(key, {
      scope: reportAccessScope(),
      items,
      mutations: [
        null,
        {
          reportId,
          scope: reportAccessScope(),
          year: 2025,
          operation: 'save',
          request: { session_id: 'another-report', year: 2025 },
        },
      ],
    })
    expect(recoverPendingNormalizations(reportId)).toEqual(items)
    expect(useNormalizationStore.getState().pendingMutations).toEqual([])
  })
  it('never claims a successful local save when storage drops the write', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined)
    const stop = enableNormalizationAutoPersist(() => reportId)
    useNormalizationStore.getState().setItems(items)
    expect(useNormalizationStore.getState().recoveryBuffered).toBe(false)
    stop()
    spy.mockRestore()
  })
})
