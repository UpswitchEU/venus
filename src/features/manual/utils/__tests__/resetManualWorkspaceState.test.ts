// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualFormStore, useManualResultsStore } from '../../../../store/manual'
import { useSessionStore } from '../../../../store/useSessionStore'
import {
  beginCurrentReportDelete,
  resetManualWorkspaceState,
  tearDownWorkspaceAfterActiveReportDeleted,
} from '../resetManualWorkspaceState'

vi.mock('../../../../store/useNormalizationStore', () => ({
  useNormalizationStore: {
    getState: () => ({ clear: vi.fn() }),
  },
}))

vi.mock('../../../../store/useTaxLatencyStore', () => ({
  useTaxLatencyStore: {
    getState: () => ({ clear: vi.fn() }),
  },
}))

vi.mock('../../../../store/useNbbPrefillStore', () => ({
  useNbbPrefillStore: {
    getState: () => ({ clear: vi.fn() }),
  },
}))

const clearVersions = vi.fn()
vi.mock('../../../../store/useVersionHistoryStore', () => ({
  useVersionHistoryStore: {
    getState: () => ({ clearVersions }),
  },
}))

const preparerReset = vi.fn()
vi.mock('../../../../store/manual/usePreparerMultipleStore', () => ({
  usePreparerMultipleStore: {
    getState: () => ({ reset: preparerReset }),
  },
}))

vi.mock('../../../../services/session/SessionEngineFactory', () => ({
  resetSessionEngine: vi.fn(),
}))

vi.mock('../../../../lib/bootstrap/BootstrapProvider', () => ({
  resetBootstrapGuard: vi.fn(),
}))

vi.mock('../../../../lib/bootstrap/SessionBootstrapService', () => ({
  bootstrapService: {
    clearCache: vi.fn(),
    clearInflightCache: vi.fn(),
    resetCircuitBreaker: vi.fn(),
  },
}))

vi.mock('../../../../hooks/useBootstrapSync', () => ({
  resetBootstrapSyncGateForRetry: vi.fn(),
}))

describe('resetManualWorkspaceState', () => {
  beforeEach(() => {
    clearVersions.mockClear()
    preparerReset.mockClear()
    useSessionStore.getState().clearSession()
    useManualResultsStore.getState().clearResults()
    useManualResultsStore.getState().setCalculating(false)
  })

  it('clears valuation result so the report bridge cannot resurrect a deleted report', () => {
    useManualResultsStore.getState().setResult({
      valuation_id: 'val-deleted',
    } as never)

    resetManualWorkspaceState({ preserveForm: true })

    expect(useManualResultsStore.getState().result).toBeNull()
    expect(useManualResultsStore.getState().isCalculating).toBe(false)
  })

  it('does not reset the form when preserveForm is true', () => {
    const resetForm = vi.fn()
    vi.spyOn(useManualFormStore, 'getState').mockReturnValue({
      resetForm,
      formData: {},
    } as never)

    resetManualWorkspaceState({ preserveForm: true })

    expect(resetForm).not.toHaveBeenCalled()
  })

  it('resets the form when preserveForm is false', () => {
    const resetForm = vi.fn()
    vi.spyOn(useManualFormStore, 'getState').mockReturnValue({
      resetForm,
      formData: {},
    } as never)

    resetManualWorkspaceState({ preserveForm: false })

    expect(resetForm).toHaveBeenCalledOnce()
  })

  it('invokes onClearReportUi when provided', () => {
    const onClearReportUi = vi.fn()

    resetManualWorkspaceState({ onClearReportUi })

    expect(onClearReportUi).toHaveBeenCalledOnce()
  })

  it('resets preparer multiple override state', () => {
    resetManualWorkspaceState()
    expect(preparerReset).toHaveBeenCalledOnce()
  })

  it('deduplicates version history clears', () => {
    resetManualWorkspaceState({
      reportIdsToClearVersions: ['report-a', 'report-a', '  report-b  '],
    })

    expect(clearVersions).toHaveBeenCalledTimes(2)
    expect(clearVersions).toHaveBeenCalledWith('report-a')
    expect(clearVersions).toHaveBeenCalledWith('report-b')
  })

  it('tearDownWorkspaceAfterActiveReportDeleted clears session and results', () => {
    useSessionStore.getState().hydrateSession({ reportId: 'report-del' } as never)
    useManualResultsStore.getState().setResult({ valuation_id: 'report-del' } as never)

    tearDownWorkspaceAfterActiveReportDeleted(['report-del'])

    expect(useSessionStore.getState().session).toBeNull()
    expect(useManualResultsStore.getState().result).toBeNull()
  })

  it('beginCurrentReportDelete clears results but keeps session for failed-delete restore', () => {
    useSessionStore.getState().hydrateSession({
      reportId: 'val-x',
      valuationResult: { valuation_id: 'val-x' },
    } as never)
    useManualResultsStore.getState().setResult({ valuation_id: 'val-x' } as never)
    const setReport = vi.fn()
    const setShowFullscreenModal = vi.fn()
    const setRightPanelView = vi.fn()

    beginCurrentReportDelete(['val-x'], {
      setReport,
      setShowFullscreenModal,
      setRightPanelView,
    })

    expect(useManualResultsStore.getState().result).toBeNull()
    expect(useSessionStore.getState().session?.reportId).toBe('val-x')
    expect(setReport).toHaveBeenCalledWith(null)
    expect(setRightPanelView).toHaveBeenCalledWith('preview')
    expect(setShowFullscreenModal).toHaveBeenCalledWith(false)
  })
})
