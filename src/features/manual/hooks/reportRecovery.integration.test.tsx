import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { normalizationService } from '../../../services/ebitdaNormalizationService'
import { deferReportRecovery, useReportRecoveryStore } from '../../../store/reportRecoveryStore'
import {
  normalizationRecoveryKey,
  useNormalizationStore,
} from '../../../store/useNormalizationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import { useReportRecovery } from './useReportRecovery'

vi.mock('../../../services/ebitdaNormalizationService', () => ({
  normalizationService: {
    saveNormalization: vi.fn(),
    deleteNormalization: vi.fn(),
  },
}))
vi.mock('../../../services', () => ({ reportAssetService: { retryFailedSave: vi.fn() } }))
vi.mock('../../../hooks/useReportAssetSaveFailure', () => ({
  useReportAssetSaveFailure: () => undefined,
}))
const reportId = '4aed3861-ad9f-4dac-948d-89fd99e73c96'
const unavailable = {
  kind: 'temporary' as const,
  status: 503,
  code: 'ADVISORY_VERIFICATION_UNAVAILABLE',
  message: 'Unavailable',
}
const originalSession = useSessionStore.getState()
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  useNormalizationStore.getState().clear()
  localStorage.clear()
  useReportRecoveryStore.setState({ step: null })
})
afterEach(() => {
  useNormalizationStore.getState().clear()
  useSessionStore.setState(originalSession, true)
  useReportRecoveryStore.setState({ step: null })
  vi.useRealTimers()
})

it('resumes multi-year saves, a removal, one calculation and its failed result without calculating twice', async () => {
  let saveAvailable = false
  let resultAvailable = false
  const history = [{ year: 2024, revenue: 11000000, ebitda: 2000000 }]
  useSessionStore.setState({
    session: { reportId, sessionData: { historical_years_data: history } } as never,
    restorationComplete: true,
    status: 'loaded',
    hasUnsavedChanges: true,
    saveFailure: unavailable,
    isSaving: false,
    updateSessionData: async (data) => {
      useSessionStore.setState((s) => {
        if (!s.session) throw new Error('Missing fixture session')
        return {
          session: { ...s.session, sessionData: { ...s.session.sessionData, ...data } },
          hasUnsavedChanges: true,
        }
      })
    },
    saveSession: async () => {
      if (!saveAvailable) return { status: 'deferred', failure: unavailable }
      useSessionStore.setState({ hasUnsavedChanges: false, saveFailure: null })
      return { status: 'acknowledged' }
    },
  })
  useNormalizationStore.getState().setItems(
    [2025, 2024].map((year) => ({
      id: String(year),
      ledgerCode: '618',
      ledgerName: 'Management',
      category: 'salary',
      type: 'add',
      value: 0,
      adjustment: 10000,
      source: 'manual',
      status: 'accepted',
      applyAllYears: false,
      year,
    }))
  )
  vi.mocked(normalizationService.saveNormalization).mockRejectedValue({ status: 503 })
  vi.mocked(normalizationService.deleteNormalization).mockResolvedValue(undefined)
  await useNormalizationStore
    .getState()
    .persistAllToTitan(reportId, { 2025: 2399239.12, 2024: 2000000 }, [2025, 2024, 2023])
  expect(useNormalizationStore.getState().pendingMutations).toHaveLength(3)
  const persistResult = vi.fn(async () => {
    if (!resultAvailable) throw unavailable
  })
  const calculate = vi.fn(async () => {
    try {
      await persistResult()
    } catch (error) {
      deferReportRecovery(reportId, 'result', error, persistResult)
      return false
    }
    return true
  })
  deferReportRecovery(reportId, 'inputs', unavailable, calculate)
  const hook = renderHook(() => useReportRecovery(reportId))
  await act(async () => {
    await hook.result.current.retry()
  })
  expect(calculate).not.toHaveBeenCalled()
  saveAvailable = true
  await act(async () => {
    await hook.result.current.retry()
  })
  expect(calculate).not.toHaveBeenCalled()
  expect(localStorage.getItem(normalizationRecoveryKey(reportId))).not.toBeNull()
  vi.mocked(normalizationService.saveNormalization).mockResolvedValue({} as never)
  await act(async () => {
    await hook.result.current.retry()
  })
  expect(normalizationService.deleteNormalization).toHaveBeenCalledWith(reportId, 2023)
  expect(useNormalizationStore.getState().pendingMutations).toHaveLength(0)
  expect(calculate).toHaveBeenCalledOnce()
  expect(hook.result.current.blocked).toBe(true)
  expect(useReportRecoveryStore.getState().step?.stage).toBe('result')
  resultAvailable = true
  await act(async () => {
    await hook.result.current.retry()
  })
  expect(calculate).toHaveBeenCalledOnce()
  expect(persistResult).toHaveBeenCalledTimes(2)
  expect(useSessionStore.getState().session?.sessionData.historical_years_data).toEqual(history)
  expect(hook.result.current.blocked).toBe(false)
  expect(localStorage.getItem(normalizationRecoveryKey(reportId))).toBeNull()
  hook.unmount()
})
